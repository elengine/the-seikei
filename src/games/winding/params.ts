import type { TensionParams } from '../../core/mechanics/pedal';
import type { BreakParams } from '../../core/mechanics/breakage';
/** 初級・中級・上級 */
export type Level = 1 | 2 | 3;

/**
 * ドラム巻きの難易度ごとの数値 (P2 T2-04)。数値はここだけに置く。
 */

/** pedal 100 のときの速さ (長さ/秒) */
export const MAX_SPEED = 40;

/** 1本の帯の長さ。pedal 50 の速さで 20 秒で巻き終わる長さ (P2/README) */
export const SECTION_LENGTH = MAX_SPEED * 0.5 * 20; // = 400

/** 難易度ごとの帯の数 (初級・中級・上級) */
export function SECTIONS(level: Level): number {
  return level === 1 ? 3 : level === 2 ? 5 : 7;
}

/** 適正範囲 (03 のとおり) */
export function RANGE(level: Level): { min: number; max: number } {
  if (level === 2) return { min: 38, max: 62 };
  if (level === 3) return { min: 44, max: 56 };
  return { min: 30, max: 70 };
}

/** 糸切れのしやすさ (範囲の上を1外れるごとの確率) */
export function BREAK_RATE(level: Level): number {
  return level === 1 ? 0.01 : level === 2 ? 0.02 : 0.04;
}

/** 単独で遊ぶときの柄 */
export function STANDALONE_PATTERN(level: Level): string {
  return level === 1 ? 'p-pin-kon' : level === 2 ? 'p-chalk-char' : 'p-alt-kon';
}

/** 張りの計算の初期値 (T2-01・P2/README「ペダルと張りの計算」) */
export const TENSION: TensionParams = {
  maxSpeed: MAX_SPEED,
  base: 30,
  perPedal: 0.4,
  yarnDrift: 4,
  noiseAmp: 2,
  noiseStepPerSec: 1,
  range: { min: 30, max: 70 }, // 呼び出し側で難易度のものに差し替える
};

/** 糸切れの判定の初期値 (T2-02・P2/README「糸切れ」) */
export const BREAK: BreakParams = {
  checkMs: 500,
  rate: 0.02, // 呼び出し側で難易度のものに差し替える
  maxChance: 0.5,
  threadCount: 8,
};

/** 1回の tick の dtMs の上限 (Safari 対策。P2/README「時間の進め方」) */
export const MAX_TICK_MS = 100;

/** 張りのメッセージを切り替えるまでの待ち時間 (ms)。新しい張りの状態が続いたときだけ変える (T2-07 追加修正2) */
export const MESSAGE_HOLD_MS = 500;

/** 星3・星2 の平均の境目 (03 のとおり) */
export const STARS3 = 0.8;
export const STARS2 = 0.6;

/** 難易度のパラメータをまとめて取る */
export function paramsOf(level: Level): {
  sections: number;
  range: { min: number; max: number };
  breakRate: number;
  patternId: string;
} {
  return {
    sections: SECTIONS(level),
    range: RANGE(level),
    breakRate: BREAK_RATE(level),
    patternId: STANDALONE_PATTERN(level),
  };
}
