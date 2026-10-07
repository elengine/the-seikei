import type { TensionParams } from '../../core/mechanics/pedal';
import type { BreakParams } from '../../core/mechanics/breakage';
/** 初級・中級・上級 */
export type Level = 1 | 2 | 3;

/**
 * ドラム巻きの難易度ごとの数値 (P2 T2-04)。数値はここだけに置く。
 */

/** pedal 100 のときの速さ (長さ/秒) */
export const MAX_SPEED = 40;

/** 1本の帯の長さ。pedal 50 の速さで 12 秒で巻き終わる長さ (T2-19a: 今までの 20 秒を 0.6 倍に。管理者の指定) */
export const SECTION_LENGTH = MAX_SPEED * 0.5 * 12; // = 240

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

/** ハサミを動かして帯の端を結ぶ動きまでの時間 (ms。T2-21) */
export const TIME_SCISSORS_TIE_MS = 3500;
/** スパイク 1 回につき制限時間に足す時間 (ms。T2-21)。糸が切れるまでの猶予 (SPIKE_GRACE_MS 2 秒) とは別の数 */
export const TIME_PER_SPIKE_MS = 1000;

/** ---- 揺れの決まり (T2-20a。管理者の仕様。数値は遊んで調整する) ---- */
/** 帯の始まりから、揺れもスパイクも起こさない時間 */
export const WOBBLE_START_DELAY_MS = 3000;
/** 揺れの限界 = 適正の範囲の幅の半分 (ペダルの位置を起点に ±ここまで) */
export const WOBBLE_RISE_MIN_MS = 1000; // 上がる時間の範囲 (1〜2 秒)
export const WOBBLE_RISE_MAX_MS = 2000;
export const WOBBLE_FALL_MIN_MS = 1000; // 戻る時間の範囲 (1〜2 秒)
export const WOBBLE_FALL_MAX_MS = 2000;
export const WOBBLE_GAP_MIN_MS = 1000; // 揺れと揺れのあいだ (1〜3 秒)
export const WOBBLE_GAP_MAX_MS = 3000;
export const WOBBLE_MAG_MIN = 0.4; // 揺れの大きさは限界の 40〜100% (乱数)

/** ---- スパイクの決まり (T2-20a) ---- */
export const SPIKE_RISE_MS = 500; // +15〜+25 を 0.5 秒で上げる
export const SPIKE_FALL_MS = 500; // ペダルを下げたら 0.5 秒で今のペダルの位置へ戻る
export const SPIKE_QTY_MIN = 15;
export const SPIKE_QTY_MAX = 25;
export const SPIKE_RELIEF = 10; // スパイクが起きたときのペダルより 10 以上下げたら戻る
export const SPIKE_GRACE_MS = 2000; // 2 秒以内に下げないと糸が切れる (レベルで変えない)
export const SPIKE_GAP_MS = 5000; // スパイクとスパイクのあいだ (5 秒以上)
/** 1本の帯で起こすスパイクの回数の範囲 (レベル1 は 0〜1 回・2 は 1 回・3 は 1〜2 回) */
export function SPIKE_COUNT_RANGE(level: Level): { min: number; max: number } {
  return level === 1 ? { min: 0, max: 1 } : level === 2 ? { min: 1, max: 1 } : { min: 1, max: 2 };
}

/** 張りの流れ・引っかかりのパラメータ (T2-09a・T2-16a・T2-16 その3)。引っかかりは +15〜25・0.5秒で上がり 2〜3秒で戻る (起きやすさはレベルで変わる) */
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
  noiseStepPerSec: 3, // T2-19c: 固定したペダルが範囲から外れやすいよう、ぶれの動きも速くする
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
