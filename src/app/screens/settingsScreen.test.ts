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

  it('選ばれているボタンにだけ「✓」と settings__current が付く', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const screen = createSettingsScreen(ctx);
    screen.mount(container, {});

    // 文字の大きさ: 既定 large → 「大」に ✓
    const fontRow = Array.from(document.querySelectorAll('.settings__row'))[2]!;
    const fontBtns = Array.from(fontRow.querySelectorAll('button'));
    const large = fontBtns.find((b) => b.textContent === '✓ 大');
    const xlarge = fontBtns.find((b) => b.textContent === '特大');
    expect(large).toBeDefined();
    expect(large!.classList.contains('settings__current')).toBe(true);
    expect(xlarge).toBeDefined();
    expect(xlarge!.classList.contains('settings__current')).toBe(false);
    expect(xlarge!.textContent).toBe('特大'); // 選ばれていない方に ✓ は付かない

    // 音: 既定 soundOn=true → 「鳴らす」に ✓
    const soundRow = Array.from(document.querySelectorAll('.settings__row'))[3]!;
    const soundBtns = Array.from(soundRow.querySelectorAll('button'));
    expect(soundBtns.find((b) => b.textContent === '✓ 鳴らす')?.classList.contains('settings__current')).toBe(true);
    expect(soundBtns.find((b) => b.textContent === '鳴らさない')?.classList.contains('settings__current')).toBe(false);

    // 音の大きさ: 既定 volume 0.7 → 「中」に ✓
    const volumeRow = Array.from(document.querySelectorAll('.settings__row'))[4]!;
    const volumeBtns = Array.from(volumeRow.querySelectorAll('button'));
    expect(volumeBtns.find((b) => b.textContent === '✓ 中')?.classList.contains('settings__current')).toBe(true);
    expect(volumeBtns.find((b) => b.textContent === '小')?.classList.contains('settings__current')).toBe(false);
    expect(volumeBtns.find((b) => b.textContent === '大')?.classList.contains('settings__current')).toBe(false);
  });

  it('選択を変えると ✓ と settings__current が移る', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const screen = createSettingsScreen(ctx);
    screen.mount(container, {});

    const volumeRow = Array.from(document.querySelectorAll('.settings__row'))[4]!;
    const big = Array.from(volumeRow.querySelectorAll('button')).find((b) => b.textContent === '大')!;
    big.click();
    await vi_waitForVolume(ctx, 1.0);

    // 再描画後: 「大」に ✓ が付き、「中」からは消える
    const btns = Array.from(volumeRow.querySelectorAll('button'));
    expect(btns.find((b) => b.textContent === '✓ 大')?.classList.contains('settings__current')).toBe(true);
    expect(btns.find((b) => b.textContent === '✓ 中')).toBeUndefined();
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
    const bar = document.querySelector('.settings__bar');
    expect(bar).not.toBeNull();
    expect(bar!.querySelector('.settings__title')?.textContent).toBe('設定');
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

  it('「管理者」が画面の最後の要素の中にあり、区切りの線の要素がある', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const screen = createSettingsScreen(ctx);
    screen.mount(container, {});
    const root = container.querySelector('.settings')!;
    const adminArea = document.querySelector('.settings__admin')!;
    // 管理者が root の最後の要素
    expect(root.lastElementChild).toBe(adminArea);
    // 区切りの線の要素が admin の直前にある
    const divider = adminArea.previousElementSibling;
    expect(divider?.classList.contains('settings__divider')).toBe(true);
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
