/**
 * ドラム巻きの状態の形と、途中保存の検査 (T2-20 追加修正で logic.ts から分けた)。
 */

import type { RngState } from '../../core/clock/clock';
import type { PedalState } from '../../core/mechanics/pedal';
import type { BreakState, TapResult } from '../../core/mechanics/breakage';
import type { Level, YarnFeel } from './params';
import type { RangeWithSpikes, WobbleState, SpikeState, SpikePlan } from './tension';

export interface WindingState {
  level: Level;
  patternId: string;
  /** お題の id (T2-14a。クリール立てのお題と同じ。job モードなどお題でないときは空文字) */
  puzzleId: string;
  /** 糸の手応え (T2-14b。お題でないときは標準) */
  feel: YarnFeel;
  sections: number; // 帯の数
  phase: 'ready' | 'winding' | 'broken' | 'cutting' | 'done';
  current: number; // 巻いている帯(0 始まり)
  lengths: number[]; // 帯ごとの巻いた長さ
  windMs: number[]; // 帯ごとの、巻いていた時間(speed > 0)
  okMs: number[]; // 帯ごとの、適正範囲に入っていた時間
  pedal: PedalState;
  /** 目標の時間の合計 (ms)。帯が始まるときに、その帯のぶんを足す (T2-16b) */
  targetMs: number;
  tension: number; // 最後に計算した張り(描画用)
  range: RangeWithSpikes; // 今の帯の適正範囲 (ranges[current] と同じ。T2-16 その6)
  ranges: RangeWithSpikes[]; // 帯ごとの適正範囲。お題を始めるときに全部決める (制限時間を最初に出すため。T2-16 その6)
  /** 揺れ (T2-20a)。量は 0 → 峰 (範囲の幅の半分の 40〜100%) → 0。張り = ペダルの位置 + 量 */
  wobble: WobbleState;
  /** スパイク (T2-20a)。qty が 0 より大きいあいだ張りに上乗せされる。ペダルを SPIKE_RELIEF 下げると戻る */
  spike: SpikeState;
  /** この帯で起こすスパイクの予定 (残り回数と、帯の始まりからの時刻) */
  spikePlan: SpikePlan;
  /** 帯の始まりからの時間 (ms)。揺れもスパイクも WOBBLE_START_DELAY_MS のあとだけ起こす */
  bandClockMs: number;
  /** 帯ごとの、スパイクの量が 0 でなかった時間 (ms。テストと成績の内訳用) */
  spikeMs: number[];
  elapsedMs: number; // 巻いていた時間と止まっていた時間の合計 (目標の時間の比較用。T2-09a)
  brk: BreakState;
  breaks: number;
  wrongTaps: number;
  rng: RngState;
}

export type WindingAction =
  | { type: 'setPedal'; value: number } // ペダル。ready で 0 より大きくすると巻き始まる (T2-18a)
  | { type: 'tick'; dtMs: number }
  | { type: 'tapThread'; thread: number }
  | { type: 'cut' } // 「帯の端を結ぶ」
  | { type: 'pausePedal' }; // 裏に回ったときなど、ペダルを 0 にする

/** 途中保存の形を確かめる。再開したときのペダルは controller が pausePedal で 0 にする */
export function isValidResume(x: unknown): x is WindingState {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  const phases = ['ready', 'winding', 'broken', 'cutting', 'done'];
  if (typeof o.phase !== 'string' || !phases.includes(o.phase)) return false;
  if (o.level !== 1 && o.level !== 2 && o.level !== 3) return false;
  if (typeof o.sections !== 'number' || !Number.isInteger(o.sections) || o.sections < 1) return false;
  if (typeof o.current !== 'number' || !Number.isInteger(o.current) || o.current < 0 || o.current >= o.sections) {
    return false;
  }
  const arrays = ['lengths', 'windMs', 'okMs'] as const;
  for (const key of arrays) {
    const arr = o[key];
    if (!Array.isArray(arr) || arr.length !== o.sections) return false;
    for (const v of arr) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false;
    }
  }
  for (const key of ['breaks', 'wrongTaps', 'tension', 'elapsedMs'] as const) {
    if (typeof o[key] !== 'number' || !Number.isFinite(o[key])) return false;
  }
  if (typeof o.patternId !== 'string') return false;
  if (typeof o.rng !== 'number') return false;
  if (typeof o.pedal !== 'object' || o.pedal === null) return false;
  if (typeof o.brk !== 'object' || o.brk === null) return false;
  if (typeof o.range !== 'object' || o.range === null) return false;
  const r = o.range as Record<string, unknown>;
  // 範囲の形 (T2-16a): center・width も必須。古い形 (min・max だけ) の保存は再開しない
  if (typeof r.center !== 'number' || typeof r.width !== 'number') return false;
  if (typeof r.min !== 'number' || typeof r.max !== 'number') return false;
  // 揺れ・スパイクの状態 (T2-20a)。無い古い形の保存は再開しない
  if (typeof o.wobble !== 'object' || o.wobble === null) return false;
  if (typeof o.spike !== 'object' || o.spike === null) return false;
  if (typeof o.spikePlan !== 'object' || o.spikePlan === null) return false;
  if (typeof o.bandClockMs !== 'number' || !(o.bandClockMs >= 0)) return false;
  if (!Array.isArray(o.spikeMs) || o.spikeMs.length !== o.sections) return false;
  // 目標の時間の合計 (T2-16b)。足した目標を持たない古い形の保存は再開しない
  if (typeof o.targetMs !== 'number' || !(o.targetMs >= 0)) return false;
  // 帯ごとの範囲 (T2-16 その6)。持たない古い形の保存は再開しない
  if (!Array.isArray(o.ranges) || o.ranges.length === 0) return false;
  // T2-14a: puzzleId のキーが無い古い形の保存は再開しない (job モードなどの空文字は許す)
  if (!('puzzleId' in o) || typeof o.puzzleId !== 'string') {
    return false;
  }
  // T2-13c: 古い形 (brk.first がある) は再開しない
  if (o.brk && typeof o.brk === 'object' && 'first' in (o.brk as Record<string, unknown>)) {
    return false;
  }
  return true;
}

/** 効果音とメッセージのため。controller が reduce の前後を比べて使う (T2-13c: 1回押し) */
export function lastTapResult(
  prev: WindingState,
  next: WindingState,
): TapResult | null {
  if (prev.brk.kind !== 'broken' || next.brk.kind !== 'broken') {
    // tiedAll のときは次が running になる
    if (prev.brk.kind === 'broken' && next.brk.kind === 'running') return 'tiedAll';
    return null;
  }
  if (next.wrongTaps > prev.wrongTaps) return 'wrongThread';
  if (next.brk.tied.length > prev.brk.tied.length) return 'tiedOne';
  return null;
}

/** 文字列 (現在時刻など) から種を作る。controller が clock.now() から作るのに使う */
export function seedFromText(text: string): number {
  let h = 0;
  for (const ch of text) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return h;
}
