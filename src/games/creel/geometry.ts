import type { StageFit } from '../../core/viewport/viewport';
import { indexToCell } from '../../core/domain/stripe';

/** 論理座標の幅 */
export const LOGICAL_W = 1000;
/** 論理座標の高さ */
export const LOGICAL_H = 750;
/** クリールの枠の内側 (論理座標) */
export const CREEL_AREA = { x: 60, y: 90, w: 880, h: 600 } as const;

/** 論理座標 → 画面 (Canvas) 座標 */
export function toPx(fit: StageFit, p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: p.x * fit.scale + fit.offsetX,
    y: p.y * fit.scale + fit.offsetY,
  };
}

/** 画面 (Canvas) 座標 → 論理座標 */
export function fromPx(fit: StageFit, p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (p.x - fit.offsetX) / fit.scale,
    y: (p.y - fit.offsetY) / fit.scale,
  };
}

/**
 * 帯の番号 (0 始まり) → クリールの1マス (論理座標)。
 * CREEL_AREA を rows×cols に等分し、番号と位置の対応は indexToCell (上の段から、各段は左から)。
 */
export function cellRect(index: number, rows: number, cols: number): { x: number; y: number; w: number; h: number } {
  const cell = indexToCell(index, cols);
  const w = CREEL_AREA.w / cols;
  const h = CREEL_AREA.h / rows;
  return {
    x: CREEL_AREA.x + cell.col * w,
    y: CREEL_AREA.y + cell.row * h,
    w,
    h,
  };
}

/** 軸の間隔 (論理座標)。横と縦の間隔の小さい方 */
export function pegPitch(rows: number, cols: number): number {
  return Math.min(CREEL_AREA.w / cols, CREEL_AREA.h / rows);
}

/** 軸の丸の中心 (論理座標)。番号は上の段から、各段は左から。マスの中心と同じ */
export function pegCenter(index: number, rows: number, cols: number): { x: number; y: number } {
  const r = cellRect(index, rows, cols);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** チーズの半径 (論理座標)。軸の間隔の 0.4 倍 (隣の丸と重ならない) */
export function pegRadius(rows: number, cols: number): number {
  return pegPitch(rows, cols) * 0.4;
}

/** 柱の中心の x (論理座標)。列の境目に、左から i = 0〜cols の cols + 1 本 */
export function postX(i: number, cols: number): number {
  return CREEL_AREA.x + (i * CREEL_AREA.w) / cols;
}

/**
 * 論理座標の点 → 帯の番号。軸の丸の中心から、軸の間隔の 0.6 倍以内なら当たり。
 * CREEL_AREA の外と、それより遠い所は null。
 */
export function hitTest(p: { x: number; y: number }, rows: number, cols: number): number | null {
  if (p.x < CREEL_AREA.x || p.x >= CREEL_AREA.x + CREEL_AREA.w) {
    return null;
  }
  if (p.y < CREEL_AREA.y || p.y >= CREEL_AREA.y + CREEL_AREA.h) {
    return null;
  }
  const col = Math.floor((p.x - CREEL_AREA.x) / (CREEL_AREA.w / cols));
  const row = Math.floor((p.y - CREEL_AREA.y) / (CREEL_AREA.h / rows));
  if (row < 0 || row >= rows || col < 0 || col >= cols) {
    return null;
  }
  const index = row * cols + col;
  const c = pegCenter(index, rows, cols);
  return Math.hypot(p.x - c.x, p.y - c.y) <= pegPitch(rows, cols) * 0.6 ? index : null;
}

/** 画面上で screenPx になる論理サイズ */
export function fontPx(fit: StageFit, screenPx: number): number {
  return screenPx / fit.scale;
}
