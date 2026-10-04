/**
 * 糸割り (ワインダー) の定数と数の目安 (P2b T2b-01)。
 * 「数の目安」は仕様書どおり例。実際に遊んで調整する前提で params にまとめる。
 */

/** 口 (同時に巻ける糸) の数。仕様書どおり 12 */
export const SPINDLES = 12;

/** メーターに設定できる長さの最大 (m) */
export const METER_MAX_M = 10000;

/** メーターと設定の長さの目盛り (m) */
export const LENGTH_STEP_M = 10;

/** 巻くのにかかる時間 (ms)。設定した長さによらず一定 */
export const WIND_ANIM_MS = 4000;

/** 余分の許し (星3)。作ったコーンが要る長さ (split はチーズの半分) を超えてよい割合 */
export const EXTRA_TOL = 0.05;

/** 紙の芯の重さ (g)。レベル5 のみ */
export const CORE_G = 20;

/** 難易度 (レベル = 段階) */
export type Level = 1 | 2 | 3 | 4 | 5;

/**
 * お題の形の目安。
 * split (レベル1〜2): チーズを口にかけ、チーズの半分を新しいコーンに巻く。
 * refill (レベル3〜5): 残っているコーンの余りで足りない本数を作る。
 */
export interface ItowariRecipe {
  /** チーズ・コーンの重さ (g)。正味。配列は順に繰り返す */
  grossG: number[];
  /** クリールに要る本数 */
  needCount: number;
  /** 1本あたり要る長さ (m) */
  needM: number;
  /** 紙の芯の重さ (g)。0 は無し */
  coreG: number;
}

/** レベルごとの目安 (レベル1〜5)。split はレベル1〜2、refill はレベル3〜5 */
export const RECIPES: Record<Level, ItowariRecipe> = {
  1: { grossG: [500], needCount: 12, needM: 5500, coreG: 0 }, // チーズ6個・どれも同じ
  2: { grossG: [450, 500, 550], needCount: 30, needM: 5200, coreG: 0 }, // チーズ15個・重さは3通り
  3: { grossG: [100, 100, 150, 80, 60, 50], needCount: 8, needM: 1200, coreG: 0 }, // 残り6本・あと2本 (余りだけで足りる)
  4: { grossG: [145, 125, 105, 85, 75, 65], needCount: 9, needM: 1500, coreG: 0 }, // 残り6本・あと3本 (継ぐ必要がある)
  5: { grossG: [165, 145, 125, 105, 95, 85], needCount: 9, needM: 1500, coreG: CORE_G }, // 残り6本・芯つき (継ぐ必要がある)
};

/** 段階からレベルにする (糸割りはレベル = 段階) */
export function levelOf(stage: number): Level {
  return Math.min(5, Math.max(1, stage)) as Level;
}
