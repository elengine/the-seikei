import { describe, it, expect } from 'vitest';
import {
  ANGLE_VIS_MUL, DRUM_RECT, WING_BASE, WING_THICK_PX, wingDir, wingVisRad, slopeXAt, layerTopY,
  wingTopX, wingTopY, layerLeftEdgeX, LAYER_H_PX,
} from './geometry';

describe('drumsetup geometry T2c-02 (羽の斜面と層の積み上げ)', () => {
  it('1. 羽の斜面の傾きは、角度 × 倍率 (ANGLE_VIS_MUL) と合う。羽は左に開く (T2c-04a 1)', () => {
    expect(wingVisRad(9)).toBeCloseTo((9 * ANGLE_VIS_MUL * Math.PI) / 180, 12);
    // 高さ 100px のときの斜面の x は、WING_BASE.x − 100 ÷ tan(見た目の角度) (左上へ登る)
    for (const angle of [5, 7, 9, 11]) {
      const vis = (angle * ANGLE_VIS_MUL * Math.PI) / 180;
      expect(slopeXAt(100, angle) - WING_BASE.x).toBeCloseTo(-100 / Math.tan(vis), 8);
      // 斜面は左上へ登る (方向の dx が負、dy が負)
      const dir = wingDir(angle);
      expect(dir.dx).toBeLessThan(0);
      expect(dir.dy).toBeLessThan(0);
    }
  });

  it('2. 角度が小さいほど斜面はなだらか (同じ高さで x が左へ遠い)', () => {
    expect(slopeXAt(100, 5)).toBeLessThan(slopeXAt(100, 7));
    expect(slopeXAt(100, 7)).toBeLessThan(slopeXAt(100, 9));
    expect(slopeXAt(100, 9)).toBeLessThan(slopeXAt(100, 11));
  });

  it('3. 層の y は下から積み上がる (k が大きいほど上 = y が小さい)。全層が盤面の上に乗る', () => {
    for (let k = 1; k < 30; k++) {
      expect(layerTopY(k + 1), `k ${k}`).toBeLessThan(layerTopY(k));
    }
    // いちばん上の層も盤面 (論理座標 1000×750) の中
    expect(layerTopY(30)).toBeGreaterThan(0);
    expect(layerTopY(1) + 9).toBeLessThanOrEqual(DRUM_RECT.y + 1); // 最初の層は表面の上に乗る
  });

  it('4. 断面の図の幅は盤面の幅の 70% 以上 (T2c-03-fix 3)', () => {
    expect(DRUM_RECT.w).toBeGreaterThanOrEqual(700);
  });

  it('5. 羽の上の端は盤面の上から 15% 以内に来る (9°。T2c-03-fix 3)。上の端は根元より左 (T2c-04a 1)', () => {
    expect(wingTopY(9)).toBeLessThanOrEqual(113); // 750 × 0.15 = 112.5
    expect(wingTopX(9)).toBeLessThan(WING_BASE.x);
    expect(wingTopX(9)).toBeGreaterThan(0); // 盤面の中
  });

  it('6. 羽の厚みは土台の厚みの 3 分の 2 (±1) (T2c-04a 1)', () => {
    expect(Math.abs(WING_THICK_PX - (DRUM_RECT.h * 2) / 3)).toBeLessThanOrEqual(1);
  });

  it('7. 層の左の端は、羽の斜面と同じ見た目の決まりで決まる (T2c-03-fix 4 を左右入れ替え・T2c-04a 1)', () => {
    // 送り量が正しい値 (比 1) のとき、すべての層の左の端と斜面の x の差は 2px 以内
    for (let k = 1; k <= 30; k++) {
      expect(Math.abs(layerLeftEdgeX(k, 9, 1) - slopeXAt(k * LAYER_H_PX, 9)), `k ${k}`).toBeLessThanOrEqual(2);
    }
    // 送り量が正しい値の半分のとき、層 30 の左の端は斜面より右 (遅れる)
    expect(layerLeftEdgeX(30, 9, 0.5)).toBeGreaterThan(slopeXAt(30 * LAYER_H_PX, 9));
    // 幾何の値そのものは斜面を越えられる (越えないように描くのは renderer の仕事)
    expect(layerLeftEdgeX(30, 9, 2)).toBeLessThan(slopeXAt(30 * LAYER_H_PX, 9));
  });
});
