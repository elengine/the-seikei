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

/** 論理座標の点 → 帯の番号 (マス全体を当たりとする。CREEL_AREA の外は null) */
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
  return row * cols + col;
}

/** 画面上で screenPx になる論理サイズ */
export function fontPx(fit: StageFit, screenPx: number): number {
  return screenPx / fit.scale;
}
