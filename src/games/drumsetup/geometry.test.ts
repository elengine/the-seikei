import { describe, it, expect } from 'vitest';
import {
  ANGLE_VIS_MUL, DRUM_RECT, WING_BASE, wingDir, wingVisRad, slopeXAt, layerTopY,
} from './geometry';

describe('drumsetup geometry T2c-02 (羽の斜面と層の積み上げ)', () => {
  it('1. 羽の斜面の傾きは、角度 × 倍率 (ANGLE_VIS_MUL) と合う', () => {
    expect(wingVisRad(9)).toBeCloseTo((9 * ANGLE_VIS_MUL * Math.PI) / 180, 12);
    // 高さ 100px のときの斜面の x は、WING_BASE.x + 100 ÷ tan(見た目の角度)
    for (const angle of [5, 7, 9, 11]) {
      const vis = (angle * ANGLE_VIS_MUL * Math.PI) / 180;
      expect(slopeXAt(100, angle) - WING_BASE.x).toBeCloseTo(100 / Math.tan(vis), 8);
      // 斜面は右上へ登る (方向の dx が正、dy が負)
      const dir = wingDir(angle);
      expect(dir.dx).toBeGreaterThan(0);
      expect(dir.dy).toBeLessThan(0);
    }
  });

  it('2. 角度が小さいほど斜面はなだらか (同じ高さで x が遠い)', () => {
    expect(slopeXAt(100, 5)).toBeGreaterThan(slopeXAt(100, 7));
    expect(slopeXAt(100, 7)).toBeGreaterThan(slopeXAt(100, 9));
    expect(slopeXAt(100, 9)).toBeGreaterThan(slopeXAt(100, 11));
  });

  it('3. 層の y は下から積み上がる (k が大きいほど上 = y が小さい)。全層が盤面の上に乗る', () => {
    for (let k = 1; k < 30; k++) {
      expect(layerTopY(k + 1), `k ${k}`).toBeLessThan(layerTopY(k));
    }
    // いちばん上の層も盤面 (論理座標 1000×750) の中
    expect(layerTopY(30)).toBeGreaterThan(0);
    expect(layerTopY(1) + 9).toBeLessThanOrEqual(DRUM_RECT.y + 1); // 最初の層は表面の上に乗る
  });
});
