import type { TensionParams, DriftParams } from '../../core/mechanics/pedal';

/**
 * ビーム巻きの難易度ごとの数値 (P3 T3-01)。数値はここだけに置く。
 * 張りはドラム巻きと同じ計算 (core/mechanics/pedal.ts) を使い回す。
 * ただし流れ・ぶれは小さく、引っかかりは無い (糸切れも無い。管理者の指示)。
 */

/** 初級・中級・上級 */
export type Level = 1 | 2 | 3;

/** pedal 100 のときの速さ (長さ/秒)。ドラム巻きと同じ */
export const MAX_SPEED = 40;

/** ビーム1本ぶんの長さ。pedal 50 (速さ 20) で 40 秒で巻き終わる長さ */
export const BEAM_LENGTH = MAX_SPEED * 0.5 * 40; // = 800

/** 1回の tick の dtMs の上限 (Safari 対策。ドラム巻きと同じ) */
export const MAX_TICK_MS = 100;

/** 星3・星2 の張り・偏りの割合の境目 (ドラム巻きと同じ) */
export const STARS3 = 0.8;
export const STARS2 = 0.6;

/** 幅合わせの誤差の星の境目 (cm) */
export const STAR_WIDTH3 = 1;
export const STAR_WIDTH2 = 3;

/** 幅合わせが「合いました」になる誤差 (cm) */
export const WIDTH_OK_CM = 1;

/** シートの中心が「中央」になる範囲 (±cm) */
export const CENTER_OK_CM = 1.5;
/** 円盤の内側の遊び (cm)。シートの端がこの分を越えたら乗り上げ (T3-03a 追加修正)。
 * 「中央」の範囲 (CENTER_OK_CM) と同じにする:幅ぴったりに合わせたとき、ずれが
 * 中央の範囲のなか (±1.5cm) は乗り上げにならず中央に数えられる。遊びが遊びより小さいと
 * 寄せる1回 (1cm) で反対側に乗り上げてしまい、星3がとても難しくなる */
export const OVERFLOW_CLEARANCE_CM = CENTER_OK_CM;

/** 寄せるボタン1回で動く量 (cm) */
export const NUDGE_CM = 1;

/** 適正範囲の幅 (レベル 1/2/3。ドラム巻きより広め) */
export function RANGE_WIDTH(level: Level): number {
  return level === 1 ? 34 : level === 2 ? 28 : 22;
}

/** 適正範囲の中心 (cm。動かさない。T3-01「中心は動かさないか、ゆっくり」) */
export const RANGE_CENTER_CM = 50;

/** ぶれの大きさ (レベル 1/2/3。ドラム巻きより小さい) */
export function NOISE_AMP(level: Level): number {
  return level === 1 ? 0.5 : level === 2 ? 0.8 : 1.2;
}

/** 張りの流れ (レベル 1/2/3)。最大 ±4/±6/±8。引っかかりは無い (snagRate 0) */
export function BEAM_DRIFT(level: Level): DriftParams {
  if (level === 2) return { perSec: 0.45, turnRate: 0.15, max: 6, snagRate: 0, snagSize: 0 };
  if (level === 3) return { perSec: 0.6, turnRate: 0.15, max: 8, snagRate: 0, snagSize: 0 };
  return { perSec: 0.3, turnRate: 0.15, max: 4, snagRate: 0, snagSize: 0 };
}

/** 偏りの速さ (cm/秒。レベル 1/2/3) */
export function SHIFT_VEL(level: Level): number {
  return level === 1 ? 0.3 : level === 2 ? 0.5 : 0.8;
}

/** 偏りの向きが変わる確率 (1秒あたり) */
export const SHIFT_TURN_RATE = 0.1;

/** 張りの計算の初期値 (ドラム巻きと同じ式。range は State のものを使う) */
export const TENSION: TensionParams = {
  maxSpeed: MAX_SPEED,
  base: 30,
  perPedal: 0.6,
  yarnDrift: 0,
  noiseAmp: 2, // 呼び出し側で難易度のものに差し替える
  noiseStepPerSec: 1,
  range: { min: 30, max: 70 }, // 呼び出し側で難易度のものに差し替える
};
