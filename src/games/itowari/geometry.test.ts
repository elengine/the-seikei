import { describe, it, expect } from 'vitest';
import {
  BOARD_W, BOARD_H, MACHINE, METER_FULL_M, SPINDLE_MIN_PX,
  needsTwoRows, lanesPerRow, laneRect, laneArea, yarnBaseY, bodyTopY, bodyH, cheeseH,
  meterAngle, meterLaps,
} from './geometry';

/**
 * 糸割りの盤面の座標のテスト (P2b T2b-02)。論理座標 1000×750。
 * 口は横一列に 12。画面が狭いときは 6口ずつ2段になる。
 */

describe('糸割り geometry T2b-02 (座標)', () => {
  it('1. 12口 (広い画面) は台の中に横一列で並ぶ', () => {
    expect(lanesPerRow(false)).toBe(12);
    const w = MACHINE.w / 12;
    for (let i = 0; i < 12; i++) {
      const lane = laneRect(i, false);
      expect(lane.w, `口${i + 1}`).toBeCloseTo(w, 10);
      expect(lane.x).toBeGreaterThanOrEqual(MACHINE.x);
      expect(lane.x + lane.w).toBeLessThanOrEqual(MACHINE.x + MACHINE.w + 0.001);
      expect(lane.x).toBeLessThan(MACHINE.x + MACHINE.w);
    }
    expect(laneRect(0, false).x).toBeCloseTo(MACHINE.x, 10);
    expect(laneRect(11, false).x + laneRect(11, false).w).toBeCloseTo(MACHINE.x + MACHINE.w, 10);
    // 盤面の大きさ
    expect(BOARD_W).toBe(1000);
    expect(BOARD_H).toBe(750);
  });

  it('2. 狭い画面では 6口ずつ2段 (1〜6 と 7〜12)。7番は1番の下の段', () => {
    expect(lanesPerRow(true)).toBe(6);
    for (let i = 0; i < 6; i++) {
      expect(laneRect(i + 6, true).x, `口${i + 7}`).toBeCloseTo(laneRect(i, true).x, 10);
      expect(laneRect(i + 6, true).w).toBeCloseTo(laneRect(i, true).w, 10);
    }
    // 2段目は1段目より下 (当たり判定の y で見る)
    expect(laneArea(6, true).y).toBeGreaterThan(laneArea(5, true).y);
    // 2段目も台の中に収まる
    expect(laneArea(11, true).y + laneArea(11, true).h).toBeLessThanOrEqual(MACHINE.y + MACHINE.h + 0.001);
  });

  it('3. 1つの口の幅が画面上 64px 未満になるとき 2段にする (SPINDLE_MIN_PX = 64)', () => {
    expect(SPINDLE_MIN_PX).toBe(64);
    expect(needsTwoRows(64)).toBe(false);
    expect(needsTwoRows(63.9)).toBe(true);
    expect(needsTwoRows(40)).toBe(true);
    expect(needsTwoRows(120)).toBe(false);
  });

  it('4. 口の当たり判定は1つの口の列全体 (上の段の糸から下の段の胴・数字まで)', () => {
    for (const narrow of [false, true]) {
      const i = 2;
      const area = laneArea(i, narrow);
      const top = yarnBaseY(i, narrow) - cheeseH(1, narrow); // 糸のいちばん上
      const bottom = bodyTopY(i, narrow) + bodyH(i, narrow);
      expect(area.y, `narrow ${narrow} 上`).toBeLessThanOrEqual(top);
      expect(area.y + area.h, `narrow ${narrow} 下`).toBeGreaterThanOrEqual(bottom);
      expect(area.x).toBeCloseTo(laneRect(i, narrow).x, 10);
      expect(area.w).toBeCloseTo(laneRect(i, narrow).w, 10);
    }
  });

  it('5. 糸の大きさは残りの長さに比例する (長いほど高い。0 でも台の上に小さく立つ)', () => {
    expect(cheeseH(1, false)).toBeGreaterThan(cheeseH(0.5, false));
    expect(cheeseH(0.5, false)).toBeGreaterThan(cheeseH(0, false));
    expect(cheeseH(0, false)).toBeGreaterThan(0);
  });

  it('6. メーターは1周 1,000m。針は回り、周の数は 3,250m で 3', () => {
    expect(METER_FULL_M).toBe(1000);
    expect(meterAngle(0)).toBeCloseTo(meterAngle(1000), 10); // 1周で戻る
    expect(meterAngle(500)).not.toBeCloseTo(meterAngle(0), 3);
    expect(meterAngle(250)).toBeCloseTo(0, 10); // 250m で針は右 (3時) の方向
    expect(meterLaps(3250)).toBe(3);
    expect(meterLaps(999)).toBe(0);
  });
});
