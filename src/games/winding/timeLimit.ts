/**
 * ドラム巻きの制限時間の計算 (T2-20 追加修正で logic.ts から分けた)。
 * 制限時間 = 範囲の真ん中のペダルで巻いた時間 + ペダルを踏む時間 + 結ぶ時間 + スパイクのぶん (T2-20b)。
 */

import { SECTION_LENGTH, MAX_SPEED, TIME_PEDAL_START_MS, TIME_SCISSORS_TIE_MS, SPIKE_GRACE_MS } from './params';
import type { RangeWithSpikes } from './tension';
import type { WindingState } from './state';

/**
 * 帯 1 本の目標の時間 (ms) = 範囲の真ん中のペダルで巻いた時間 + 1.5秒 (ペダルを踏む時間)
 * + 3.5秒 (ハサミで帯の端を結ぶ時間) + スパイク1回につき 2秒 (T2-20b)
 */
export function bandTargetMs(range: RangeWithSpikes): number {
  const speed = (range.center / 100) * MAX_SPEED;
  const windMs = (SECTION_LENGTH / speed) * 1000;
  return windMs + TIME_PEDAL_START_MS + TIME_SCISSORS_TIE_MS + range.spikes * SPIKE_GRACE_MS;
}

/** お題の目標の時間 (ms)。帯が始まるごとに足した合計 (T2-16b) */
export function targetMsOf(s: WindingState): number {
  return s.targetMs;
}
