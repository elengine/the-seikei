import { describe, it, expect } from 'vitest';
import {
  LOGICAL_W,
  LOGICAL_H,
  CREEL_AREA,
  toPx,
  fromPx,
  cellRect,
  hitTest,
  fontPx,
  pegCenter,
  pegRadius,
  postX,
} from './geometry';
import type { StageFit } from '../../core/viewport/viewport';
import { indexToCell } from '../../core/domain/stripe';

describe('定数', () => {
  it('論理座標は 1000×750、CREEL_AREA は仕様どおり', () => {
    expect(LOGICAL_W).toBe(1000);
    expect(LOGICAL_H).toBe(750);
    expect(CREEL_AREA).toEqual({ x: 60, y: 90, w: 880, h: 600 });
  });
});

describe('toPx / fromPx', () => {
  const fits: StageFit[] = [
    { scale: 1, offsetX: 0, offsetY: 0 },
    { scale: 0.5, offsetX: 100, offsetY: 50 },
    { scale: 1.2, offsetX: -30, offsetY: 10 },
  ];

  it('往復して一致する (複数の fit で)', () => {
    for (const fit of fits) {
      for (const p of [{ x: 0, y: 0 }, { x: 500, y: 375 }, { x: 60, y: 90 }, { x: 940, y: 690 }]) {
        const back = fromPx(fit, toPx(fit, p));
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      }
    }
  });

  it('toPx は scale を掛けて offset を足す', () => {
    const fit: StageFit = { scale: 0.5, offsetX: 100, offsetY: 50 };
    expect(toPx(fit, { x: 200, y: 100 })).toEqual({ x: 200, y: 100 });
    expect(toPx(fit, { x: 400, y: 300 })).toEqual({ x: 300, y: 200 });
  });
});

describe('cellRect / hitTest', () => {
  it('rows 3・cols 8 で、各マスの中心を hitTest すると、その帯の番号が返る', () => {
    const rows = 3;
    const cols = 8;
    for (let i = 0; i < rows * cols; i++) {
      const rect = cellRect(i, rows, cols);
      const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
      expect(hitTest(center, rows, cols)).toBe(i);
    }
  });

  it('cellRect は CREEL_AREA を等分し、indexToCell の位置に対応する', () => {
    const rows = 2;
    const cols = 8;
    const w = CREEL_AREA.w / cols;
    const h = CREEL_AREA.h / rows;
    // i=0 は左上
    expect(cellRect(0, rows, cols)).toEqual({ x: CREEL_AREA.x, y: CREEL_AREA.y, w, h });
    // i=9 は { row:1, col:1 }
    const cell = indexToCell(9, cols);
    expect(cellRect(9, rows, cols)).toEqual({
      x: CREEL_AREA.x + cell.col * w,
      y: CREEL_AREA.y + cell.row * h,
      w,
      h,
    });
  });

  it('CREEL_AREA の外は null (マスの外側・枠の周囲)', () => {
    const rows = 3;
    const cols = 8;
    // 枠の外 (左の柱の中央)
    expect(hitTest({ x: 30, y: 375 }, rows, cols)).toBeNull();
    // CREEL_AREA の外・論理座標の中
    expect(hitTest({ x: 55, y: 375 }, rows, cols)).toBeNull(); // CREEL_AREA.x より左
    expect(hitTest({ x: 500, y: 50 }, rows, cols)).toBeNull(); // CREEL_AREA.y より上
    expect(hitTest({ x: 945, y: 375 }, rows, cols)).toBeNull(); // 右端の外
    expect(hitTest({ x: 500, y: 720 }, rows, cols)).toBeNull(); // 下端の外
    expect(hitTest({ x: -10, y: -10 }, rows, cols)).toBeNull();
  });
});

describe('fontPx', () => {
  it('fontPx(fit, 20) を toPx の倍率で画面に戻すと 20 になる', () => {
    const fits: StageFit[] = [
      { scale: 1, offsetX: 0, offsetY: 0 },
      { scale: 0.6, offsetX: 20, offsetY: 40 },
      { scale: 1.3, offsetX: -5, offsetY: 8 },
    ];
    for (const fit of fits) {
      const logical = fontPx(fit, 20);
      // 論理サイズ logical は画面では logical * scale になる
      expect(logical * fit.scale).toBeCloseTo(20, 6);
    }
  });
});

describe('PU-06b: 軸の丸・チーズの半径・柱', () => {
  it('pegCenter は上の段から・左から並び、マスの中心と同じ', () => {
    const rows = 2;
    const cols = 8;
    const first = pegCenter(0, rows, cols);
    const second = pegCenter(1, rows, cols);
    const nextRow = pegCenter(cols, rows, cols);
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBe(first.y);
    expect(nextRow.x).toBe(first.x);
    expect(nextRow.y).toBeGreaterThan(first.y);
    for (let i = 0; i < rows * cols; i++) {
      const r = cellRect(i, rows, cols);
      expect(pegCenter(i, rows, cols)).toEqual({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    }
  });

  it('pegRadius は軸の間隔の 0.4 倍。隣の丸と重ならず、段階5 (3段×8) の横長 (scale 0.65) でも直径が画面上 48px 以上', () => {
    const rows = 3;
    const cols = 8;
    const r = pegRadius(rows, cols);
    const pitch = Math.min(CREEL_AREA.w / cols, CREEL_AREA.h / rows);
    expect(r).toBeCloseTo(pitch * 0.4, 6);
    expect(r * 2).toBeLessThan(pitch);
    expect(r * 2 * 0.65).toBeGreaterThanOrEqual(48);
  });

  it('postX は列の境目に cols + 1 本。左端が CREEL_AREA の左、右端が右', () => {
    const cols = 6;
    const xs = Array.from({ length: cols + 1 }, (_, i) => postX(i, cols));
    expect(xs).toHaveLength(cols + 1);
    expect(xs[0]).toBe(CREEL_AREA.x);
    expect(xs[cols]).toBe(CREEL_AREA.x + CREEL_AREA.w);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!).toBeCloseTo(CREEL_AREA.w / cols, 6);
    }
  });

  it('hitTest: 軸の中心で当たり、隣の軸との中間より先では隣の軸。軸の間隔の 0.6 倍より遠い所 (マスの角) は null', () => {
    const rows = 3;
    const cols = 8;
    const c0 = pegCenter(0, rows, cols);
    const c1 = pegCenter(1, rows, cols);
    expect(hitTest(c0, rows, cols)).toBe(0);
    // 0 と 1 の中間より少し手前は 0、少し先は 1
    const mid = (c0.x + c1.x) / 2;
    expect(hitTest({ x: mid - 3, y: c0.y }, rows, cols)).toBe(0);
    expect(hitTest({ x: mid + 3, y: c0.y }, rows, cols)).toBe(1);
    // マスの角 (中心から遠い) は外れ
    const cell = cellRect(0, rows, cols);
    expect(hitTest({ x: cell.x + 2, y: cell.y + 2 }, rows, cols)).toBeNull();
    // 中心から軸の間隔の 0.6 倍以内なら当たる
    const pitch = Math.min(CREEL_AREA.w / cols, CREEL_AREA.h / rows);
    expect(hitTest({ x: c0.x, y: c0.y - pitch * 0.55 }, rows, cols)).toBe(0);
  });

  it('hitTest の当たりは、段階5 (3段×8) の横長 (scale 0.65) で画面上 64px 四方以上', () => {
    const pitch = Math.min(CREEL_AREA.w / 8, CREEL_AREA.h / 3);
    expect(pitch * 0.6 * 2 * 0.65).toBeGreaterThanOrEqual(64);
  });
});
