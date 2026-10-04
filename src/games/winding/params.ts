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

/** 適正範囲の中心の範囲 (帯が変わるときの位置の移動を丸める範囲。T2-16a) */
export function RANGE_CENTER(level: Level): { min: number; max: number } {
  if (level === 2) return { min: 40, max: 60 };
  if (level === 3) return { min: 35, max: 65 };
  return { min: 45, max: 55 };
}

/** 帯が変わるときの適正範囲の位置の動き (±。レベル1 は変えない。T2-16a) */
export function RANGE_SHIFT_ON_SECTION(level: Level): number {
  return level === 1 ? 0 : level === 2 ? 10 : 15;
}

/** ペダル 10〜100 で範囲の中心に届く中心の範囲 (T2-11・T2-16a。base 0・perPedal 1.0 から。T2-16 その3) */
export function RANGE_REACHABLE(): { min: number; max: number } {
  return { min: 10, max: 100 };
}

/** 張りの流れ・引っかかりのパラメータ (T2-09a・T2-16a・T2-16 その3)。引っかかりは +15〜25・0.5秒で上がり 2〜3秒で戻る (起きやすさはレベルで変わる) */
export function DRIFT(level: Level): DriftParams {
  const common = { snagSizeMin: 15, snagSizeMax: 25, snagRiseMs: 500, snagRecoverMinMs: 2000, snagRecoverMaxMs: 3000 }; // 0.5秒で上がり 2〜3秒で戻る (T2-16 その3)
  if (level === 2) return { perSec: 1.0, turnRate: 0.15, max: 12, snagRate: 0.04, snagSize: 9, ...common };
  if (level === 3) return { perSec: 1.6, turnRate: 0.15, max: 12, snagRate: 0.06, snagSize: 12, ...common }; // max 16 → 12 (T2-11a。どの状態でもペダルで範囲に届くように)
  return { perSec: 0.6, turnRate: 0.15, max: 8, snagRate: 0.02, snagSize: 6, ...common };
}

/** ぶれの大きさ (T2-09a。初級 ±1・中級 ±1.5・上級 ±2) */
export function NOISE_AMP(level: Level): number {
  return level === 1 ? 1 : level === 2 ? 1.5 : 2;
}

/** 帯1本あたりの目標の時間 (秒。T2-09a) */
export function TARGET_SEC_PER_SECTION(level: Level): number {
  return level === 1 ? 30 : level === 2 ? 26 : 22;
}

/** 引っかかりで上の端を超えても切れない猶予の量 (張りが上の端 + この値を超えたら数える。T2-16 その3) */
export const SNAG_BREAK_MARGIN = 8;

/** 引っかかりで上の端 + 8 を超えたまま切れるまでの猶予 (ms。T2-16 その3) */
export function SNAG_GRACE_MS(level: Level): number {
  return level === 1 ? 2000 : level === 2 ? 1500 : 1200;
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
  base: 0,
  perPedal: 1.0, // 張り≒ペダルの位置 (T2-16 その3。ペダル 0 で張り 0・速さを十分に出せる)
  yarnDrift: 0, // 糸量による +4 はやめた (T2-09a の流れに置き換え。T2-09 追加修正a)
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

/** ドラムが回って見える角度の進み方 (速さ1あたりのラジアン/秒。T2-10 追加修正。ペダル 50 (速さ 20) で 1秒に 5 ラジアン ≒ 0.8 回転) */
export const DRUM_TURN_PER_SPEED = 0.25;

/** 角速度が目標の 9 割に達するまでの時間 (ms)。速くなるとき。T2-10 追加修正 b (イージング) */
export const DRUM_EASE_UP_MS = 600;
/** 遅くなるとき (ms) */
export const DRUM_EASE_DOWN_MS = 400;
/** 糸が切れて機械が止まるとき (ms)。急に止める */
export const DRUM_STOP_MS = 250;

/** ドラムの羽 (斜めに張り出した板) の側面が見える最大の幅 (論理座標。T2-13a。のちの「ドラム設定」で変える) */
export const WING_OUT = 14;

/** ドラムの桟 (板) が、ドラムの上の縁より上へはみ出す長さ (論理座標。PU-14c) */
export const SLAT_OVER = 44;
/** はみ出した所が外へ開く量 (論理座標。左右の端の板ほど大きく、正面の中央の板は 0。PU-14c) */
export const SLAT_FLARE = 14;

/** 羽の側面の幅の上限 (板の幅 × この割合。T2-13 追加修正: 端で側面が太すぎるのを直す) */
export const WING_SIDE_MAX_RATIO = 0.4;

/** 段階ごとの帯の数と難易度の数値 (T2-14a。クリール立てのお題15題をドラム巻きに割り当てる) */
export const PUZZLE_STAGE: Record<number, { sections: number; level: Level }> = {
  1: { sections: 3, level: 1 },
  2: { sections: 4, level: 1 },
  3: { sections: 5, level: 2 },
  4: { sections: 6, level: 2 },
  5: { sections: 7, level: 3 },
};

/** 糸の手応え (T2-14b)。standard=標準、fine=細い糸 (切れやすい)、thick=太い糸 (流れやすい) */
export type YarnFeel = 'standard' | 'fine' | 'thick';

/** 手応えごとのパラメータの倍率・差分 (T2-14b。初期値。管理者が遊んで調整する) */
export const YARN_FEEL: Record<YarnFeel, {
  breakRateMul: number; // 糸切れのしやすさの倍率
  breakExtraStepDelta: number; // 切れる本数が 1本増える外れの量の差分 (最小 4)
  driftMul: number; // 張りの流れの速さの倍率
  snagMul: number; // 引っかかりのしやすさの倍率
}> = {
  standard: { breakRateMul: 1, breakExtraStepDelta: 0, driftMul: 1, snagMul: 1 },
  fine: { breakRateMul: 1.5, breakExtraStepDelta: -2, driftMul: 1, snagMul: 1 },
  thick: { breakRateMul: 1, breakExtraStepDelta: 0, driftMul: 1.3, snagMul: 1.3 },
};

/** 帯の縞1本の高さ (論理座標。柄の並びを区画の中で繰り返す。T2-08 追加修正2) */
export const STRIPE_H = 6;

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
