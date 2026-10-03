/**
 * ドラム設定の盤面の座標 (T2c-02)。論理座標 1000×750。
 * 横から見た断面:下にドラムの表面、左に帯の区画、右に羽の斜面 (右上へ登る)。
 * 見た目の角度は実際の角度の ANGLE_VIS_MUL 倍 (角度の違いが分かるように)。
 * 層の厚みの見た目は LAYER_H_PX (1回転 8px 以上)。
 */

/** 見た目の角度の倍率 (実際の角度 × この倍率で描く) */
export const ANGLE_VIS_MUL = 4;

/** 1回転の厚みの見た目 (px。8px 以上) */
export const LAYER_H_PX = 9;

/** ドラムの表面 (横に長い板) */
export const DRUM_RECT = { x: 110, y: 616, w: 780, h: 48 };

/** 帯の区画の左端 (層の左端の x) */
export const SECTION_X = 170;

/** 羽の根元 (区画の右端・ドラムの表面の上端) */
export const WING_BASE = { x: 310, y: 616 };

/** 羽の板の長さと厚み (見た目) */
export const WING_LEN_PX = 300;
export const WING_THICK_PX = 14;

/** 上の端の設定表示の位置 */
export const TOP_TEXT = { x: 40, y: 60 };

/** 結果の印の文字の位置 (断面の右上) */
export const RESULT_TEXT = { x: 560, y: 400 };

/** 見た目の角度 (ラジアン) */
export function wingVisRad(angleDeg: number): number {
  return (angleDeg * ANGLE_VIS_MUL * Math.PI) / 180;
}

/** 羽の斜面の方向 (右上へ登る単位ベクトル) */
export function wingDir(angleDeg: number): { dx: number; dy: number } {
  const a = wingVisRad(angleDeg);
  return { dx: Math.cos(a), dy: -Math.sin(a) };
}

/** ドラムの表面から高さ yPx の位置の、羽の斜面の x */
export function slopeXAt(yPx: number, angleDeg: number): number {
  return WING_BASE.x + yPx / Math.tan(wingVisRad(angleDeg));
}

/** 層 k (1〜30) の上端の y (下から積み上がる。k が大きいほど上 = y が小さい) */
export function layerTopY(k: number): number {
  return DRUM_RECT.y - k * LAYER_H_PX;
}

/** 論理座標の点を画面の点に直す (fit は controller が渡す) */
export function toPx(fit: { scale: number; offsetX: number; offsetY: number }, p: { x: number; y: number }): { x: number; y: number } {
  return { x: p.x * fit.scale + fit.offsetX, y: p.y * fit.scale + fit.offsetY };
}
