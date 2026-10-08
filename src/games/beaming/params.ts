import type { TensionParams } from '../../core/mechanics/pedal';

/**
 * ビーム巻きの難易度ごとの数値 (P3 T3-01)。数値はここだけに置く。
 * 張りはドラム巻きと同じ計算 (core/mechanics/pedal.ts) を使い回す。
 * ただし流れ・ぶれは小さく、引っかかりは無い (糸切れも無い。管理者の指示)。
 */

/** 初級・中級・上級 */
export type Level = 1 | 2 | 3;

/** pedal 100 のときの速さ (長さ/秒)。ドラム巻きと同じ */
export const MAX_SPEED = 40;

/** ビーム1本ぶんの長さ */
export const BEAM_LENGTH = 1;

/** 速さ 100 (レバー右) で 0 から 1 まで巻くにかかる秒数 (T3-04a)。50 はその半分の速さ */
export const FULL_WIND_SEC_AT_100 = 30;

/**
 * 巻き量 (%) ごとの適正な速さの目標の表 (T3-04a・T3-05)。from〜to は両端を含む。
 * 速さは連続なので、目標 ±10 (SPEED_OK_TOL) の中を適正とする。
 * 重なる区間はどちらの目標でも適正。speed 0 (停止) が目標の区間では「止めている」だけが適正。
 */
export const GOOD_SPEED_ZONES: ReadonlyArray<{ from: number; to: number; speed: 0 | 50 | 100 }> = [
  { from: 0, to: 30, speed: 50 },
  { from: 25, to: 75, speed: 100 },
  { from: 70, to: 99, speed: 50 },
  { from: 95, to: 100, speed: 0 },
];

/** 確認できるようになる巻き量 (T3-04c)。微調整の数え始めも同じ */
export const CONFIRM_MIN = 0.95;

/** 適正な速さの許し (T3-05)。目標の速さ ±10 の中を適正とする (停止の目標は「止めている」だけ) */
export const SPEED_OK_TOL = 10;

/** 止めた位置の星の境目 (巻き量) */
export const STOP3 = 0.99;
export const STOP2 = 0.97;

/** 星3の微調整の回数の上限 */
export const RESTARTS_OK = 2;

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
