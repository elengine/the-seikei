/**
 * ビーム巻きの難易度ごとの数値 (P3 T3-01)。数値はここだけに置く。
 * 張りはドラム巻きと同じ計算 (core/mechanics/pedal.ts) を使い回す。
 * ただし流れ・ぶれは小さく、引っかかりは無い (糸切れも無い。管理者の指示)。
 */

/** 初級・中級・上級 */
export type Level = 1 | 2 | 3;

/** ビーム1本ぶんの長さ */
export const BEAM_LENGTH = 1;

/** 速さ 100 (レバー右) で 0 から 1 まで巻くにかかる秒数 (T3-04a)。50 はその半分の速さ */
export const FULL_WIND_SEC_AT_100 = 30;

/**
 * 巻き量 (%) ごとの速さの目標の表 (T3-07 で張りをやめ、速さそのものの目標に)。点を直線で結んだ値が目標。
 * (0,0) → 10% で 100、85% まで 100、90% で 25 (T3-08)。
 * 0〜10% で 0 から 100 へ上がる。10〜85% は 100。85〜90% で 100 から 25 へ下がる。
 * 90〜100% は目標を使わない (下の STOP_ZONE の適正範囲で巻く)。
 */
export const TARGET_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [10, 100], [85, 100], [90, 25],
];

/** 巻き量 90% 以上は止めてよい範囲: 適正範囲をいつでも 0〜30 にする (レベルと揺らぎを使わない。T3-08) */
export const STOP_ZONE = { from: 90, min: 0, max: 30 } as const;

/** 揺らぎの区間 (巻き量 %。10〜80% で目標がときどき下がって戻る。T3-08 で 35〜70 から変えた) */
export const DIP_FROM_PCT = 10;
export const DIP_TO_PCT = 80;

/** レベルごとの適正範囲の幅 (目標 ± この値。内部のレベル 1・2・3。T3-06 追記) */
export const OK_TOL_BY_LEVEL: Record<Level, number> = { 1: 15, 2: 10, 3: 6 };

/** 揺らぎのあいだ (ms。4〜8 秒。乱数) */
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

/** ドラム一式 (胴・巻いた糸・桟・右の端の円盤・ランプ) を右へずらす量 (px)。ドラムはビームより奥にあるので、少し右から見ると右へずれて見える。412×915 で画面上 20px 以上 (論理 52 × 縮尺 0.39) (PU-29 追加修正) */
export const DRUM_DEPTH_SHIFT = 52;

/** 柄の縞を描くときの、巻き幅いっぱいに並べる柄のくり返しの数の標準 (帯の数が分かるときはそれを使う。PU-28) */
export const PATTERN_REPEATS = 3;

/** 糸の束の先の木の棒が、離したあと (付かなかったとき) に垂れた位置へ戻る時間 (ミリ秒。見た目だけ。PU-27) */
export const THREAD_RETURN_MS = 200;

/** 1回の tick の dtMs の上限 (Safari 対策。ドラム巻きと同じ) */
export const MAX_TICK_MS = 100;

/** 星3・星2 の適正・偏りの割合の境目 (ドラム巻きと同じ) */
export const STARS3 = 0.8;
export const STARS2 = 0.6;

/** 幅合わせの誤差の星の境目 (cm) */
export const STAR_WIDTH3 = 1;
export const STAR_WIDTH2 = 3;

/** 幅合わせが「合いました」になる誤差 (cm) */
export const WIDTH_OK_CM = 1;


/**
 * 横から見た機械の形 (PU-32)。管理者の横から見た図 (ドラム・糸の向きを変える鉄の棒 2 本・ビーム・速さの木の棒) を、
 * 図のピクセルの比率のまま持つ。z = 奥行き (手前が +。図の右)、h = 高さ (上が +。図の y を逆にした値)。単位は図のピクセル。
 * 正面の絵は、ここから SIDE_PROJECTION の式で計算で作る (side.ts)。
 */
export const SIDE = {
  drum: { z: 290, h: -380, r: 180 }, // ドラム (青)
  bar1: { z: 705, h: -340, r: 25 }, // 糸の向きを変える鉄の棒 1 (黄の左)
  bar2: { z: 840, h: -340, r: 20 }, // 鉄の棒 2 (黄の右)
  beam: { z: 880, h: -490, r: 80 }, // ビームの円盤 (緑)
  wood: { z: 845, h: -205 }, // 速さの木の棒 (茶。断面の中心)
} as const;

/** ドラムが巻き取られて細る割合 (巻き量 100% で半径が 1 − この値)。ドラムの枠 (胴・桟) は変わらない */
export const SIDE_DRUM_SHRINK = 0.3;
/** ビームに巻いた糸の半径 (円盤の半径に対する割合): 巻き量 0 で SIDE_WOUND_MIN、100% で SIDE_WOUND_MAX */
export const SIDE_WOUND_MIN = 0.128;
export const SIDE_WOUND_MAX = 0.8;
/** 糸を付ける前に、鉄の棒 2 から垂れる糸の長さ (図のピクセル) */
export const SIDE_DROP0 = 35;

/**
 * 横から見た形 (z, h) を正面の絵へ写す式の係数 (手前の少し上・少し右から見た形):
 *   画面の y = Y0 + S × (KH × (−h) + KZ × z)  (奥ほど上に見える)
 *   画面の x = (幅の位置の x) + KX × (SIDE_Z_REF − z)  (手前ほど左に見える。奥のドラムは右へずれる)
 * S は盤面の高さ H に比例 (ドラムの上の端がランプの空き SIDE_TOP_FRAC × H、ビームの円盤の下の端が SIDE_BOTTOM_FRAC × H に来る)。
 */
export const SIDE_PROJECTION = { KH: 1, KZ: 0.38, KX: 0.17 } as const;
export const SIDE_Z_REF = 880;
export const SIDE_TOP_FRAC = 0.15;
export const SIDE_BOTTOM_FRAC = 0.915;
