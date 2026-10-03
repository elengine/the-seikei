import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createSettingsScreen } from './settingsScreen';
import { createAppContext } from '../context';
import type { AppContext } from '../context';
import { createFixedClock } from '../../core/clock/clock';
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
