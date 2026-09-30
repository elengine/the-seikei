import type { TensionParams, DriftParams } from '../../core/mechanics/pedal';
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

/** 適正範囲の中心と幅 (T2-09a。中心はお題ごとに乱数で決める) */
export function RANGE_WIDTH(level: Level): number {
  return level === 1 ? 30 : level === 2 ? 18 : 10;
}

/** 適正範囲の中心の範囲 (お題ごとの乱数の幅) */
export function RANGE_CENTER(level: Level): { min: number; max: number } {
  if (level === 2) return { min: 40, max: 60 };
  if (level === 3) return { min: 35, max: 65 };
  return { min: 45, max: 55 };
}

/** 張りの流れ・引っかかりのパラメータ (T2-09a) */
export function DRIFT(level: Level): DriftParams {
  if (level === 2) return { perSec: 1.0, turnRate: 0.15, max: 12, snagRate: 0.04, snagSize: 9 };
  if (level === 3) return { perSec: 1.6, turnRate: 0.15, max: 16, snagRate: 0.06, snagSize: 12 };
  return { perSec: 0.6, turnRate: 0.15, max: 8, snagRate: 0.02, snagSize: 6 };
}

/** ぶれの大きさ (T2-09a。初級 ±1・中級 ±1.5・上級 ±2) */
export function NOISE_AMP(level: Level): number {
  return level === 1 ? 1 : level === 2 ? 1.5 : 2;
}

/** 帯1本あたりの目標の時間 (秒。T2-09a) */
export function TARGET_SEC_PER_SECTION(level: Level): number {
  return level === 1 ? 30 : level === 2 ? 26 : 22;
}

/** 張りのメッセージを切り替えるまでの待ち時間 (ms)。新しい張りの状態が続いたときだけ変える (T2-07 追加修正2) */
export const MESSAGE_HOLD_MS = 500;

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
  extraStep: 8, // 呼び出し側で難易度のものに差し替える (T2-09b)
  maxThreads: 2, // 呼び出し側で難易度のものに差し替える (T2-09b)
};

/** 切れる本数が 1本増える外れの量 (T2-09b。難易度ごと) */
export function BREAK_EXTRA_STEP(level: Level): number {
  return level === 1 ? 10 : level === 2 ? 8 : 6;
}

/** いちどに切れる本数の上限 (T2-09b。難易度ごと) */
export function BREAK_MAX_THREADS(level: Level): number {
  return level === 1 ? 1 : level === 2 ? 2 : 3;
}

/** 1回の tick の dtMs の上限 (Safari 対策。P2/README「時間の進め方」) */
export const MAX_TICK_MS = 100;

/** 星3・星2 の平均の境目 (03 のとおり) */
export const STARS3 = 0.8;
export const STARS2 = 0.6;

/** 難易度のパラメータをまとめて取る (range はお題ごとに決めるので、ここでは中心の範囲だけ) */
export function paramsOf(level: Level): {
  sections: number;
  rangeCenter: { min: number; max: number };
  rangeWidth: number;
  breakRate: number;
  patternId: string;
} {
  return {
    sections: SECTIONS(level),
    rangeCenter: RANGE_CENTER(level),
    rangeWidth: RANGE_WIDTH(level),
    breakRate: BREAK_RATE(level),
    patternId: STANDALONE_PATTERN(level),
  };
}
