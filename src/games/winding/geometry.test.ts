import { describe, it, expect } from 'vitest';
import { LOGICAL_W, LOGICAL_H, endPoint, hitEnd, toPx, fromPx } from './geometry';

const fit = { scale: 1, offsetX: 0, offsetY: 0 };

describe('winding geometry (T2-05)', () => {
  it('toPx・fromPx の往復', () => {
    const f = { scale: 0.8, offsetX: 20, offsetY: -10 };
    const p = { x: 123, y: 456 };
    const px = toPx(f, p);
    const back = fromPx(f, px);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('endPoint が threadCount 本とも盤面の中 (クリール側・ドラム側)', () => {
    for (const threadCount of [3, 8]) {
      for (let t = 0; t < threadCount; t++) {
        for (const side of ['creel', 'drum'] as const) {
          const e = endPoint(t, side, threadCount);
          expect(e.x, `t${t} ${side} x`).toBeGreaterThan(0);
          expect(e.x, `t${t} ${side} x`).toBeLessThan(LOGICAL_W);
          expect(e.y, `t${t} ${side} y`).toBeGreaterThan(0);
          expect(e.y, `t${t} ${side} y`).toBeLessThan(LOGICAL_H);
        }
      }
    }
    // 糸は上から下へ等間隔
    const a = endPoint(0, 'creel', 8);
    const b = endPoint(1, 'creel', 8);
    const c = endPoint(2, 'creel', 8);
    expect(b.y - a.y).toBeCloseTo(c.y - b.y, 9);
    // クリール側は x 380 付近、ドラム側は x 460 付近 (台の左右)
    expect(endPoint(0, 'creel', 8).x).toBeCloseTo(380, 0);
    expect(endPoint(0, 'drum', 8).x).toBeCloseTo(460, 0);
  });

  it('hitEnd が端の上で当たり、遠いと null', () => {
    const e = endPoint(2, 'creel', 8);
    const hit = hitEnd(e, 8, fit.scale);
    expect(hit).not.toBeNull();
    expect(hit!.thread).toBe(2);
    expect(hit!.side).toBe('creel');
    // 遠い点は null
    const far = hitEnd({ x: e.x + 200, y: e.y }, 8, fit.scale);
    expect(far).toBeNull();
  });

  it('scale 0.4 (スマホ縦) でも、画面上 30px 離れた点で当たる (32px 以内)', () => {
    const e = endPoint(3, 'drum', 8);
    // 画面上 30px → 論理 30/0.4 = 75
    const p = { x: e.x + 75, y: e.y };
    const hit = hitEnd(p, 8, 0.4);
    expect(hit).not.toBeNull();
    expect(hit!.thread).toBe(3);
  });

  it('隣り合う糸の間を押すと、近いほうを返す', () => {
    const a = endPoint(0, 'creel', 8);
    const b = endPoint(1, 'creel', 8);
    // 間の少し a 寄りの点
    const mid = { x: (a.x + b.x) / 2, y: (a.y * 0.6 + b.y * 0.4) };
    const hit = hitEnd(mid, 8, fit.scale);
    expect(hit).not.toBeNull();
    // y が近いほうの糸
    expect(hit!.thread === 0 || hit!.thread === 1).toBe(true);
    const near = hit!.thread === 0 ? a : b;
    const other = hit!.thread === 0 ? b : a;
    const d = Math.hypot(mid.x - near.x, mid.y - near.y);
    const d2 = Math.hypot(mid.x - other.x, mid.y - other.y);
    expect(d).toBeLessThan(d2);
  });
});
