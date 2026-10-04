/**
 * ビーム巻きの盤面の座標 (P3 T3-02)。論理座標 1000×750。
 * 奥 (上) に巻き終えたドラム (ビームより幅が広い)、手前 (下) にビームと緑の円盤。
 * 糸のシートはドラムから斜めに降りてビームに巻かれる。
 * cm → 論理座標の変換はこのファイルだけで行う。
 * 巻き幅が盤面の幅の 60〜80% になる倍率 (巻き幅に関係なく 700px = 70%)。
 */

/** 盤面の論理座標 */
export const BOARD_W = 1000;
export const BOARD_H = 750;

/** 巻き幅を描く幅 (px。盤面の幅の 70%) */
export const BEAM_W_PX = 700;

/** ビームの中心の x */
export const BEAM_CENTER_X = BOARD_W / 2;

/** cm → px の倍率 (巻き幅に関係なく、巻き幅は BEAM_W_PX になる) */
export function pxPerCm(widthCm: number): number {
  return BEAM_W_PX / widthCm;
}

/** cm (ビームの中心からの距離。左は負) → 論理座標の x */
export function cmToX(widthCm: number, cm: number): number {
  return BEAM_CENTER_X + cm * pxPerCm(widthCm);
}

/** 論理座標の x → cm (cmToX の逆) */
export function xToCm(widthCm: number, x: number): number {
  return (x - BEAM_CENTER_X) / pxPerCm(widthCm);
}

/** 奥のドラム (巻き終えたドラム。ビームより幅が広い) */
export const DRUM_RECT = { x: 60, y: 120, w: 880, h: 140 };

/** ビームの芯の中心の y (手前) */
export const BEAM_AXIS_Y = 580;

/** 銀色の芯の太さ (px) */
export const BEAM_CORE_H = 22;

/** 巻き太りの最大 (px。progress 1 でビームの上端がここまで上がる) */
export const BEAM_WOUND_MAX_H = 110;

/** 巻き太りの上端の y (progress 0 では芯の上端) */
export function woundTopY(progress: number): number {
  return BEAM_AXIS_Y - BEAM_CORE_H / 2 - Math.min(1, Math.max(0, progress)) * BEAM_WOUND_MAX_H;
}

/** 円盤 (側面から見た厚み) の幅と直径 (px) */
export const FLANGE_W = 26;
export const FLANGE_H = 170;

/** 円盤の上端の y (ビームの芯の中心を挟む) */
export function flangeTopY(): number {
  return BEAM_AXIS_Y - FLANGE_H / 2;
}

/** 幅合わせの目標の点線の y (ビームの下) */
export const TARGET_LINE_Y = 690;

/** 糸のシートの上端の y (ドラムの下端) */
export const SHEET_TOP_Y = DRUM_RECT.y + DRUM_RECT.h;

/** 上の設定表示の位置 (画面 px で描く) */
export const TOP_TEXT = { x: 40, y: 60 };

/** 画面の点に直す (ドラム巻きと同じ) */
export function toPx(fit: { scale: number; offsetX: number; offsetY: number }, p: { x: number; y: number }): { x: number; y: number } {
  return { x: p.x * fit.scale + fit.offsetX, y: p.y * fit.scale + fit.offsetY };
}
