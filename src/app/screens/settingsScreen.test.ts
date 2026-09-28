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
