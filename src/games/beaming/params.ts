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
 * 巻き量 (%) ごとの張りの目標の表 (T3-06)。点を直線で結んだ値が目標。
 * (0,0) → 10% で 50 (PU-27 で速くした)、30% まで 50、35% で 100、70% まで 100、75% で 50、100% で 0。
 */
export const TARGET_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [10, 50], [30, 50], [35, 100], [70, 100], [75, 50], [100, 0],
];

/** 張りが速さに遅れて付いていく時定数 (ms。T3-06) */
export const TENSION_FOLLOW_MS = 800;

/** レベルごとの適正範囲の幅 (目標 ± この値。内部のレベル 1・2・3。T3-06 追記) */
export const OK_TOL_BY_LEVEL: Record<Level, number> = { 1: 15, 2: 10, 3: 6 };

/** 35〜70% で目標が下がって戻る揺らぎのあいだ (ms。4〜8 秒。乱数) */
export const DIP_GAP_MIN_MS = 4000;
export const DIP_GAP_MAX_MS = 8000;
/** 揺らぎの下がる量 (8〜15) */
export const DIP_AMOUNT_MIN = 8;
export const DIP_AMOUNT_MAX = 15;
/** 下がるのに 1 秒・そのまま 1〜2 秒・戻るのに 1 秒 */
export const DIP_DOWN_MS = 1000;
export const DIP_HOLD_MIN_MS = 1000;
export const DIP_HOLD_MAX_MS = 2000;
export const DIP_BACK_MS = 1000;

/** 確認できるようになる巻き量 (T3-04c)。微調整の数え始めも同じ */
export const CONFIRM_MIN = 0.95;

/** 止めた位置の星の境目 (巻き量) */
export const STOP3 = 0.99;
export const STOP2 = 0.97;

/** 星3の微調整の回数の上限 */
export const RESTARTS_OK = 2;

/**
 * 回って見える向きと速さ (見た目だけ。PU-26)。面の位置は y = 中心 + 符号 × 半径 × sin(角度)。
 * ドラムの手前の面は下から上へ (符号 −1)、ビームの手前の面は上から下へ (符号 +1)。単位は rad/秒 (速さ 1 あたり)。
 * ドラムはビームより大きいので、同じ糸の速さでは回りがゆっくりになる。
 */
export const DRUM_SURFACE_SIGN = -1;
export const BEAM_SURFACE_SIGN = 1;
export const DRUM_TURN_RATE = 0.15;
export const BEAM_TURN_RATE = 0.25;
/** 端の円盤 (楕円) の回る向き (胴の符号の逆。PU-27: 管理者が実機で「円盤の回る向きが逆」と判断した。胴はそのまま) */
export const DRUM_FLANGE_SIGN = -DRUM_SURFACE_SIGN;
export const BEAM_FLANGE_SIGN = -BEAM_SURFACE_SIGN;

/** 柄の縞を描くときの、巻き幅いっぱいに並べる柄のくり返しの数の標準 (帯の数が分かるときはそれを使う。PU-28) */
export const PATTERN_REPEATS = 3;

/** 糸の束の先の木の棒が、離したあと (付かなかったとき) に垂れた位置へ戻る時間 (ミリ秒。見た目だけ。PU-27) */
export const THREAD_RETURN_MS = 200;

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
