import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createSettingsScreen } from './settingsScreen';
import { createAppContext } from '../context';
import type { AppContext } from '../context';
import { createFixedClock } from '../../core/clock/clock';

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

    // 文字の大きさ: 既定 large → 「大」だけ
    expect(pressedOf(rows[2]!)).toEqual(['✓大']);
    expect(Array.from(rows[2]!.querySelectorAll('.choice button')).map((b) => b.textContent)).toEqual(['✓大', '特大']);
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

  it('文字の大きさの「特大」を押すと設定が変わる', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    createSettingsScreen(ctx).mount(container, {});
    const fontRow = Array.from(document.querySelectorAll('.settings__row'))[2]!;
    const xl = Array.from(fontRow.querySelectorAll('.choice button')).find((b) => b.textContent === '特大') as HTMLButtonElement;
    xl.click();
    const { vi } = await import('vitest');
    await vi.waitFor(() => {
      expect(ctx.settings.get().fontScale).toBe('xlarge');
    });
  });

  it('節の見出しが3つ (お店とお名前・見やすさと音・ことば)', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    createSettingsScreen(ctx).mount(container, {});
    const heads = Array.from(document.querySelectorAll('.section-heading')).map((h) => h.textContent);
    expect(heads).toEqual(['お店とお名前', '見やすさと音', 'ことば']);
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
    const backInBar = Array.from(bar!.querySelectorAll('button')).find((b) => b.textContent === '戻る');
    expect(backInBar).toBeDefined();
    // 画面の下に単独の「戻る」は無い (見出しの外に戻るボタンがない)
    const allBacks = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent === '戻る');
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
