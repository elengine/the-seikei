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
