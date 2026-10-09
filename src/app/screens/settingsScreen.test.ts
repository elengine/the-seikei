import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSettingsScreen } from './settingsScreen';
import { createAppContext } from '../context';
import type { AppContext } from '../context';
import { createFixedClock } from '../../core/clock/clock';
// アップデートの確認 (updater) は偽物にする。Service Worker は使わない
const upd = vi.hoisted(() => ({
  ready: false,
  startupFailed: false,
  listeners: new Set<(ready: boolean) => void>(),
  check: undefined as unknown as () => Promise<'available' | 'latest' | 'offline'>,
  apply: undefined as unknown as () => Promise<boolean>,
}));
vi.mock('../updater', () => ({
  isUpdateReady: () => upd.ready,
  checkForUpdate: () => upd.check(),
  applyUpdate: () => upd.apply(),
  startupSwitchFailed: () => upd.startupFailed,
  onUpdateState: (cb: (ready: boolean) => void) => {
    upd.listeners.add(cb);
    return () => {
      upd.listeners.delete(cb);
    };
  },
}));

// ゲームの記録を消す関数 (clearProgress) は偽物にする。画面の流れ (2 回の確認・お知らせ) だけを確かめる
const clr = vi.hoisted(() => ({
  fn: undefined as unknown as () => Promise<{ removed: number }>,
}));
vi.mock('../../core/storage/clearProgress', () => ({
  clearProgress: () => clr.fn(),
}));

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let dbSeq = 0;

async function makeCtx(): Promise<AppContext> {
  return createAppContext({
    dbName: `settings-screen-test-${Date.now().toString(36)}-${dbSeq++}`,
    clock: createFixedClock('2026-09-28T00:00:00Z'),
    navigate: () => undefined,
  });
}

describe('settingsScreen (選択中ボタンの見た目)', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  /** 選ぶ部品 (choice) の中で、選ばれている (aria-pressed=true) ボタンの文字 */
  const pressedOf = (row: Element): string[] =>
    Array.from(row.querySelectorAll('.choice button'))
      .filter((x) => x.getAttribute('aria-pressed') === 'true')
      .map((x) => x.textContent ?? '');

  it('選ばれているボタンにだけ aria-pressed=true と「✓」が付く', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const screen = createSettingsScreen(ctx);
    screen.mount(container, {});
    const rows = Array.from(document.querySelectorAll('.settings__row'));

    // 音: 既定 soundOn=true → 「鳴らす」だけ
    expect(pressedOf(rows[3]!)).toEqual(['✓鳴らす']);
    // 音の大きさ: 既定 volume 0.7 → 「中」だけ
    expect(pressedOf(rows[4]!)).toEqual(['✓中']);
  });

  it('選択を変えると ✓ が移る', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const screen = createSettingsScreen(ctx);
    screen.mount(container, {});

    const volumeRow = Array.from(document.querySelectorAll('.settings__row'))[4]!;
    const big = Array.from(volumeRow.querySelectorAll('.choice button')).find((b) => b.textContent === '大') as HTMLButtonElement;
    big.click();
    await vi_waitForVolume(ctx, 1.0);

    // 再描画後: 「大」に ✓ が付き、「中」からは消える
    expect(pressedOf(volumeRow)).toEqual(['✓大']);
    expect(Array.from(volumeRow.querySelectorAll('.choice button')).map((b) => b.textContent)).toEqual(['小', '中', '✓大']);
  });

  function fontSlider(): HTMLInputElement {
    return document.querySelector<HTMLInputElement>('input[type="range"][aria-label="文字の大きさ"]')!;
  }

  it('PU-08c: 文字の大きさは 1〜5 のスライダー (step 1)。両端に「小」「大」、目盛り 5 つ、見本の文', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    createSettingsScreen(ctx).mount(container, {});
    const input = fontSlider();
    expect(input).not.toBeNull();
    expect([input.min, input.max, input.step]).toEqual(['1', '5', '1']);
    expect(input.value).toBe('1');
    expect(input.getAttribute('aria-valuetext')).toBe('段階1');
    const row = input.closest('.settings__row')!;
    expect(row.textContent).toContain('小');
    expect(row.textContent).toContain('大');
    expect(row.querySelectorAll('.font-slider__tick')).toHaveLength(5);
    expect(row.querySelector('.font-slider__sample')!.textContent).toBe('この大きさで表示します');
    expect(document.querySelector('.choice [data-testid]')).toBeNull();
  });

  it('PU-08c: スライダーを動かす (input) と見本の文がすぐ変わり、保存は指を離したとき (change)。設定が 4 になり data-font が "4"', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    createSettingsScreen(ctx).mount(container, {});
    const input = fontSlider();
    const sample = document.querySelector<HTMLElement>('.font-slider__sample')!;
    input.value = '4';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(sample.style.fontSize).toBe('26px'); // 段階4 の本文
    expect(input.getAttribute('aria-valuetext')).toBe('段階4');
    expect(ctx.settings.get().fontScale).toBe(1); // まだ保存しない
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const { vi } = await import('vitest');
    await vi.waitFor(() => {
      expect(ctx.settings.get().fontScale).toBe(4);
    });
    expect(document.documentElement.dataset.font).toBe('4');
  });

  it('PU-08c: スライダーの CSS は自前の溝とつまみ (appearance: none、つまみ 44px 以上、溝 8px、touch-action: none)', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const input = css.match(/\.font-slider__input\s*\{([^}]*)\}/);
    expect(input![1]).toContain('-webkit-appearance: none');
    expect(input![1]).toContain('touch-action: none');
    expect(css).toMatch(/\.font-slider__input::-webkit-slider-thumb\s*\{[^}]*width: 44px/);
    expect(css).toMatch(/\.font-slider__input::-webkit-slider-runnable-track\s*\{[^}]*height: 8px/);
    expect(css).toContain('.font-slider__input::-moz-range-thumb');
    expect(css).toContain('.font-slider__input::-moz-range-track');
  });

  it('節の見出しが4つ (お店とお名前・見やすさと音・ことば・記録。PU-22)', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    createSettingsScreen(ctx).mount(container, {});
    const heads = Array.from(document.querySelectorAll('.section-heading')).map((h) => h.textContent);
    expect(heads).toEqual(['お店とお名前', '見やすさと音', 'ことば', '記録']);
  });
});

async function vi_waitForVolume(ctx: AppContext, v: number): Promise<void> {
  const { vi } = await import('vitest');
  await vi.waitFor(() => {
    expect(ctx.settings.get().volume).toBe(v);
  });
}

describe('T1-17: 設定画面の「戻る」と「管理者」の配置', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('「戻る」が題名と同じ見出しの要素の中にあり、「管理者」より前にある', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const screen = createSettingsScreen(ctx);
    screen.mount(container, {});
    // 題名「設定」と同じ見出しの要素の中に「戻る」がある
    const bar = document.querySelector('.screen-header');
    expect(bar).not.toBeNull();
    expect(bar!.querySelector('.screen-header__title')?.textContent).toBe('設定');
    const backInBar = Array.from(bar!.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === '戻る');
    expect(backInBar).toBeDefined();
    // 画面の下に単独の「戻る」は無い (見出しの外に戻るボタンがない)
    const allBacks = Array.from(document.querySelectorAll('button')).filter((b) => b.getAttribute('aria-label') === '戻る');
    expect(allBacks).toHaveLength(1);
    // 「管理者」より前 (DOM の順で先)
    const adminBtn = document.querySelector('.settings__admin-btn')!;
    expect(bar!.contains(adminBtn)).toBe(false);
    expect(bar!.compareDocumentPosition(adminBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('「管理者」が画面の最後の要素の中にある', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const screen = createSettingsScreen(ctx);
    screen.mount(container, {});
    const page = container.querySelector('.settings .page')!;
    const adminArea = document.querySelector('.settings__admin')!;
    // 管理者が中身の最後の要素
    expect(page.lastElementChild).toBe(adminArea);
  });
});

describe('T1-19: 設定画面の今の値 (お名前・屋号)', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('お名前が空のとき、値の要素に空を表すクラスが付き、入れたあとは付かない', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const screen = createSettingsScreen(ctx);
    screen.mount(container, {});
    const nameRow = Array.from(document.querySelectorAll('.settings__row'))[0]!;
    const value = nameRow.querySelector('.settings__value')!;
    // 初期は空 → 空を表すクラスが付く
    expect(value.classList.contains('settings__value--empty')).toBe(true);
    expect(value.textContent).toBe('（未設定）');
    // 値を入れる → クラスが付かない (画面は再描画されるので、同じ ctx で mount し直して確かめる)
    await ctx.settings.update({ playerName: 'テスト屋さん' });
    screen.mount(container, {});
    const value2 = Array.from(document.querySelectorAll('.settings__row'))[0]!.querySelector('.settings__value')!;
    expect(value2.classList.contains('settings__value--empty')).toBe(false);
    expect(value2.textContent).toBe('テスト屋さん');
  });
});

describe('PU-10a: 設定の画面のアップデートの確認', () => {
  async function mountSettings(): Promise<{ container: HTMLElement; ctx: AppContext; screen: ReturnType<typeof createSettingsScreen> }> {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const screen = createSettingsScreen(ctx);
    screen.mount(container, {});
    return { container, ctx, screen };
  }

  const refreshBtn = (): HTMLButtonElement =>
    document.querySelector<HTMLButtonElement>('.screen-header__right button[aria-label="アップデートを確認"]')!;

  beforeEach(() => {
    document.body.textContent = '';
    upd.ready = false;
    upd.listeners.clear();
    upd.check = async () => 'latest';
    upd.apply = vi.fn(async () => true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('見出しの行の右上に、丸い「アップデートを確認」のボタン (回る矢印のアイコン、文字なし)', async () => {
    await mountSettings();
    const b = refreshBtn();
    expect(b).not.toBeNull();
    expect(b.classList.contains('btn--circle')).toBe(true);
    expect(b.textContent).toBe('');
    expect(b.querySelector('svg')).not.toBeNull();
  });

  it('新しい版があるとき、見出しの行の下に朱の「アップデートがあります。」と「アップデートする」(primary) が出る。押すと切り替える', async () => {
    await mountSettings();
    vi.useFakeTimers(); // 確認の最低の長さ (0.8 秒) を偽の時計で進める (本物の時計だと、負荷の高い全体の実行で waitFor の上限 1 秒を超えることがあった)
    upd.check = async () => 'available';
    refreshBtn().click();
    await vi.advanceTimersByTimeAsync(900);
    expect(document.querySelector('.update-notice')!.textContent).toContain('アップデートがあります。');
    const go = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'アップデートする')!;
    expect(go.classList.contains('btn--primary')).toBe(true);
    expect(document.querySelector('.update-notice__text')!.classList.contains('update-notice__text--alert')).toBe(true);
    go.click();
    expect(upd.apply).toHaveBeenCalledTimes(1);
  });

  it('新しい版が無いとき「最新のバージョンです」が出て、3 秒で消える', async () => {
    await mountSettings();
    vi.useFakeTimers(); // 画面の用意 (IndexedDB) のあとに偽の時計にする
    refreshBtn().click();
    await vi.advanceTimersByTimeAsync(900); // 確認の最低の長さ (0.8 秒)
    expect(document.querySelector('.update-notice')!.textContent).toContain('最新のバージョンです');
    await vi.advanceTimersByTimeAsync(3100);
    expect(document.querySelector('.update-notice')!.textContent).toBe('');
  });

  it('通信できなければ「確認できませんでした。通信を確かめてください」', async () => {
    upd.check = async () => 'offline';
    await mountSettings();
    vi.useFakeTimers();
    refreshBtn().click();
    await vi.advanceTimersByTimeAsync(900);
    expect(document.querySelector('.update-notice')!.textContent).toContain('確認できませんでした。通信を確かめてください');
  });

  it('確認している間、ボタンに回るクラス (btn--spinning) が付き、最低 0.8 秒たってから外れる。2 回続けて押しても確認は 1 回', async () => {
    const check = vi.fn(async () => 'latest' as const);
    upd.check = check;
    await mountSettings();
    vi.useFakeTimers();
    const b = refreshBtn();
    b.click();
    b.click();
    expect(b.classList.contains('btn--spinning')).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(b.classList.contains('btn--spinning')).toBe(true); // 確認が終わっていても、最低 0.8 秒は回る
    await vi.advanceTimersByTimeAsync(500);
    expect(b.classList.contains('btn--spinning')).toBe(false);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('開いたときすでに新しい版が届いていれば、最初から「アップデートがあります。」が出る。届いたことを知らされても出る', async () => {
    upd.ready = true;
    await mountSettings();
    expect(document.querySelector('.update-notice')!.textContent).toContain('アップデートがあります。');
    document.body.textContent = '';
    upd.ready = false;
    await mountSettings();
    expect(document.querySelector('.update-notice')!.textContent).toBe('');
    upd.ready = true;
    for (const cb of upd.listeners) {
      cb(true);
    }
    expect(document.querySelector('.update-notice')!.textContent).toContain('アップデートがあります。');
  });

  it('unmount で、状態の購読を外し、タイマーも残さない', async () => {
    const { screen } = await mountSettings();
    vi.useFakeTimers();
    refreshBtn().click();
    expect(upd.listeners.size).toBe(1);
    screen.unmount();
    expect(upd.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('PU-10f: 「アップデートする」が切り替えられなかったとき', () => {
  async function openWithUpdate(): Promise<void> {
    document.body.textContent = '';
    upd.ready = true;
    upd.listeners.clear();
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    createSettingsScreen(ctx).mount(container, {});
  }
  const goBtn = (): HTMLButtonElement =>
    Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'アップデートする')!;

  it('切り替えに失敗 (false) したら、案内「切り替えられませんでした。アプリを閉じて、もう一度開いてください」を出し、もう一度押せる', async () => {
    await openWithUpdate();
    upd.apply = vi.fn(async () => false);
    goBtn().click();
    await vi.waitFor(() => {
      expect(document.querySelector('.update-notice')!.textContent).toContain('切り替えられませんでした。アプリを閉じて、もう一度開いてください');
    });
    // 押し直せる (「アップデートする」がまた出る)
    expect(goBtn()).toBeDefined();
    goBtn().click();
    expect(upd.apply).toHaveBeenCalledTimes(2);
  });

  it('PU-25: 読み込み直したのに、まだ切り替わっていない (startupSwitchFailed) なら、開いたときから案内「切り替えられませんでした…」を出す', async () => {
    upd.startupFailed = true;
    try {
      await openWithUpdate();
      expect(document.querySelector('.update-notice')!.textContent).toContain('切り替えられませんでした。アプリを閉じて、もう一度開いてください');
      expect(goBtn()).toBeDefined();
    } finally {
      upd.startupFailed = false;
    }
  });

  it('切り替え中 (まだ結果が出ていない) は、続けて押しても 1 回だけ呼ぶ', async () => {
    await openWithUpdate();
    let resolve: (v: boolean) => void = () => undefined;
    upd.apply = vi.fn(() => new Promise<boolean>((r) => { resolve = r; }));
    const b = goBtn();
    b.click();
    b.click();
    expect(upd.apply).toHaveBeenCalledTimes(1);
    resolve(true); // 成功: 再読み込みされる。案内は出さない
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector('.update-notice')!.textContent).not.toContain('切り替えられませんでした');
  });
});


describe('settingsScreen PU-22 (ゲームの記録を消す)', () => {
  beforeEach(() => {
    document.body.textContent = '';
    clr.fn = vi.fn(async () => ({ removed: 3 }));
  });

  async function mount(): Promise<{ ctx: AppContext; container: HTMLElement; logs: string[] }> {
    const ctx = await makeCtx();
    const logs: string[] = [];
    const orig = ctx.logger.log.bind(ctx.logger);
    ctx.logger.log = (level, message) => {
      logs.push(`${level}:${message}`);
      return orig(level, message);
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    createSettingsScreen(ctx).mount(container, {});
    return { ctx, container, logs };
  }

  const btn = (label: string): HTMLButtonElement | undefined =>
    Array.from(document.querySelectorAll('button')).find((b) => b.textContent === label);
  const dialogTitle = (): string | null => document.querySelector('.dialog__title')?.textContent ?? null;
  const tick = async (): Promise<void> => {
    await vi.waitFor(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it('1. 「記録」の節に、危険のボタン「ゲームの記録を消す」と説明の 1 行がある。「管理者」の上 (下のほう)', async () => {
    await mount();
    const heading = Array.from(document.querySelectorAll('.section-heading')).find((h) => h.textContent === '記録');
    expect(heading).toBeDefined();
    const danger = btn('ゲームの記録を消す')!;
    expect(danger.classList.contains('btn--danger')).toBe(true);
    expect(document.body.textContent).toContain('星・途中の状態・図鑑を消します。お名前や設定は残ります');
    const admin = btn('管理者')!;
    expect(danger.compareDocumentPosition(admin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // 管理者は後ろ (下)
  });

  it('2. 押すと 1 回目の確認 (題名「ゲームの記録を消しますか」・「はい」「いいえ」)。「いいえ」なら何も消さない', async () => {
    await mount();
    btn('ゲームの記録を消す')!.click();
    expect(dialogTitle()).toBe('ゲームの記録を消しますか');
    expect(document.querySelector('.dialog__message')!.textContent).toBe('すべてのゲームの星と途中の状態、図鑑が消えます。お名前・屋号・設定は残ります');
    expect(btn('はい')).toBeDefined();
    btn('いいえ')!.click();
    await tick();
    expect(document.querySelector('.dialog')).toBeNull();
    expect(clr.fn).not.toHaveBeenCalled();
  });

  it('3. 1 回目「はい」→ 2 回目の確認 (題名「本当に消しますか」・「消す」「やめる」・バックアップの案内)。「やめる」なら何も消さない', async () => {
    await mount();
    btn('ゲームの記録を消す')!.click();
    btn('はい')!.click();
    await vi.waitFor(() => expect(dialogTitle()).toBe('本当に消しますか'));
    expect(document.querySelector('.dialog__message')!.textContent).toBe('消した記録は元に戻せません。残しておきたいときは、先にバックアップを書き出してください');
    expect(btn('いいえ')).toBeUndefined(); // 2 回目は「はい」「いいえ」ではない
    expect(btn('消す')!.classList.contains('btn--danger')).toBe(true); // 危険の見た目
    btn('やめる')!.click();
    await tick();
    expect(document.querySelector('.dialog')).toBeNull();
    expect(clr.fn).not.toHaveBeenCalled();
  });

  it('4. 1 回目「はい」→ 2 回目「消す」で、消す関数が 1 回呼ばれ、お知らせ「記録を消しました」が出る', async () => {
    await mount();
    btn('ゲームの記録を消す')!.click();
    btn('はい')!.click();
    await vi.waitFor(() => expect(dialogTitle()).toBe('本当に消しますか'));
    btn('消す')!.click();
    await vi.waitFor(() => expect(clr.fn).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(document.querySelector('.update-notice')!.textContent).toContain('記録を消しました'));
    expect(document.querySelector('.dialog')).toBeNull();
  });

  it('5. 消すのに失敗したら「消せませんでした。もう一度お試しください」を出し、ログに残す', async () => {
    clr.fn = vi.fn(async () => {
      throw new Error('boom');
    });
    const { logs } = await mount();
    btn('ゲームの記録を消す')!.click();
    btn('はい')!.click();
    await vi.waitFor(() => expect(dialogTitle()).toBe('本当に消しますか'));
    btn('消す')!.click();
    await vi.waitFor(() => expect(document.querySelector('.update-notice')!.textContent).toContain('消せませんでした。もう一度お試しください'));
    expect(logs.some((l) => l.startsWith('warn:') && l.includes('記録'))).toBe(true);
  });

  it('6. base.css: ボタンは白地・朱の枠・64px 以上。説明は 20px 以上', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const b = css.match(/\.settings__danger-btn\s*\{([^}]*)\}/)![1]!;
    expect(b).toContain('min-height: 64px');
    expect(b).toContain('var(--c-shu)');
    const note = css.match(/\.settings__danger-note\s*\{([^}]*)\}/)![1]!;
    expect(note).toMatch(/font-size:\s*(var\(--fs-body\)|(2\d|3\d)px)/);
  });
});

describe('settingsScreen PU-23b (切り替えているあいだ)', () => {
  beforeEach(() => {
    document.body.textContent = '';
    upd.ready = true;
  });

  it('「アップデートする」を押している間は、ボタンを出さず「切り替えています…」を出す。失敗したら、ボタンと案内に戻る (記録を見てくださいとは書かない)', async () => {
    let finish: (ok: boolean) => void = () => undefined;
    upd.apply = () => new Promise<boolean>((resolve) => (finish = resolve));
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    createSettingsScreen(ctx).mount(container, {});
    const go = (): HTMLButtonElement | undefined => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'アップデートする');
    go()!.click();
    expect(go()).toBeUndefined();
    expect(document.querySelector('.update-notice')!.textContent).toContain('切り替えています…');
    finish(false);
    await vi.waitFor(() => expect(go()).toBeDefined());
    const text = document.querySelector('.update-notice')!.textContent!;
    expect(text).toContain('切り替えられませんでした');
    expect(text).not.toContain('アップデートの記録');
    expect(text).not.toContain('管理者');
    upd.ready = false;
  });
});
