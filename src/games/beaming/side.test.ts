import { describe, it, expect } from 'vitest';
import { sidePath, project, sideScale, drumRadius, woundRadiusFig, viewAlpha, circleArc, VISIBLE_SPAN } from './side';
import { SIDE, SIDE_TOP_FRAC, SIDE_BOTTOM_FRAC, SIDE_PROJECTION } from './params';

/** 隣り合う区間の向きの差 (度) の最大 */
function maxTurnDeg(pts: Array<{ z: number; h: number }>): number {
  let worst = 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = Math.atan2(pts[i]!.h - pts[i - 1]!.h, pts[i]!.z - pts[i - 1]!.z);
    const b = Math.atan2(pts[i + 1]!.h - pts[i]!.h, pts[i + 1]!.z - pts[i]!.z);
    let d = Math.abs(b - a);
    if (d > Math.PI) d = 2 * Math.PI - d;
    worst = Math.max(worst, (d * 180) / Math.PI);
  }
  return worst;
}
const dist = (p: { z: number; h: number }, c: { z: number; h: number }): number => Math.hypot(p.z - c.z, p.h - c.h);

describe('PU-32 side.ts: 横から見た形 (糸の通り道)', () => {
  it('管理者の図の比率のまま: ドラムはビームの円盤より大きく (半径 180 対 80)、鉄の棒 2 本は小さく、右 (手前) へ順に並ぶ', () => {
    expect(SIDE.drum.r / SIDE.beam.r).toBeGreaterThan(2);
    expect(SIDE.drum.z).toBeLessThan(SIDE.bar1.z);
    expect(SIDE.bar1.z).toBeLessThan(SIDE.bar2.z);
    expect(SIDE.bar2.z).toBeLessThan(SIDE.beam.z);
    expect(SIDE.bar1.h).toBe(SIDE.bar2.h); // 2 本は同じ高さ
    expect(SIDE.beam.h).toBeLessThan(SIDE.bar2.h); // ビームは鉄の棒より下
    expect(SIDE.wood.h).toBeGreaterThan(SIDE.bar2.h); // 木の棒は鉄の棒の上
  });

  it('巻き量で、ドラムは細り、ビームの巻いた糸は太る (円盤の半径は固定)', () => {
    expect(drumRadius(0)).toBe(SIDE.drum.r);
    expect(drumRadius(1)).toBeLessThan(drumRadius(0.5));
    expect(woundRadiusFig(0)).toBeLessThan(woundRadiusFig(0.5));
    expect(woundRadiusFig(1)).toBeLessThan(SIDE.beam.r);
  });

  it('糸の通り道は角が無い: 隣り合う区間の向きの差が、どの巻き量でも 20 度以下', () => {
    for (const p of [0, 0.3, 0.7, 1]) {
      expect(maxTurnDeg(sidePath(p)), `p=${p}`).toBeLessThanOrEqual(20);
    }
    expect(maxTurnDeg(sidePath(0, SIDE_DROP_FOR_TEST))).toBeLessThanOrEqual(20);
  });

  it('ドラムを離れる点はドラムの中心より下。鉄の棒 1・2 は棒の上を通る (棒の円周の上で、棒の中心より上の点がある)', () => {
    for (const p of [0, 0.5]) {
      const path = sidePath(p);
      expect(path[0]!.h).toBeLessThan(SIDE.drum.h);
      expect(Math.abs(dist(path[0]!, SIDE.drum) - drumRadius(p))).toBeLessThan(1e-6); // ドラムの円の上から出る
      for (const bar of [SIDE.bar1, SIDE.bar2]) {
        expect(path.some((q) => Math.abs(dist(q, bar) - bar.r) < 1e-6 && q.h > bar.h), `棒 z=${bar.z}`).toBe(true);
      }
    }
  });

  it('鉄の棒 2 からビームまでは下へ向かい (高さが増えない)、ビームに乗る点は、ビームの中心より手前で中心より上', () => {
    for (const p of [0, 0.3, 1]) {
      const path = sidePath(p);
      const rw = woundRadiusFig(p);
      const onBeam = path.filter((q) => Math.abs(dist(q, SIDE.beam) - rw) < 1e-6);
      expect(onBeam.length).toBeGreaterThan(2);
      const first = onBeam[0]!;
      expect(first.z).toBeGreaterThan(SIDE.beam.z);
      expect(first.h).toBeGreaterThan(SIDE.beam.h);
      const i2 = path.findIndex((q) => Math.abs(dist(q, SIDE.bar2) - SIDE.bar2.r) < 1e-6 && q.z > SIDE.bar2.z);
      expect(i2).toBeGreaterThan(0);
      for (let i = i2 + 1; i < path.length; i++) {
        expect(path[i]!.h).toBeLessThanOrEqual(path[i - 1]!.h + 1e-9);
      }
      // ビームの手前の面を下の端まで回る (最後の点はビームの中心より下)
      expect(path[path.length - 1]!.h).toBeLessThan(SIDE.beam.h);
    }
  });

  it('糸を付ける前 (dropH): 鉄の棒 2 の手前の面から真下へ垂れる (最後の区間は z が同じで h が減る)', () => {
    const path = sidePath(0, SIDE_DROP_FOR_TEST);
    const a = path[path.length - 2]!;
    const b = path[path.length - 1]!;
    expect(b.z).toBeCloseTo(a.z, 9);
    expect(b.h).toBeLessThan(a.h);
    expect(a.z).toBeCloseTo(SIDE.bar2.z + SIDE.bar2.r, 6);
    expect(b.h).toBeCloseTo(SIDE.bar2.h - SIDE_DROP_FOR_TEST, 6);
    // ビームには届かない (ビームの円盤の上の端より上)
    expect(b.h).toBeGreaterThan(SIDE.beam.h + SIDE.beam.r);
  });
});

const SIDE_DROP_FOR_TEST = 35;

describe('PU-32 side.ts: 投影 (横から見た形 → 正面の絵)', () => {
  it('奥 (z が小さい) ほど画面の上、手前ほど左 (x のずれが小さい)。高いほど上', () => {
    const H = 750;
    const back = project(300, -300, H);
    const front = project(800, -300, H);
    expect(back.y).toBeLessThan(front.y);
    expect(back.dx).toBeGreaterThan(front.dx);
    expect(project(500, -100, H).y).toBeLessThan(project(500, -300, H).y);
  });

  it('ドラムの上の端が SIDE_TOP_FRAC × H、ビームの円盤の下の端が SIDE_BOTTOM_FRAC × H に来る (盤面の高さがどれでも)', () => {
    for (const H of [750, 1000, 1400]) {
      const s = sideScale(H);
      const k = Math.hypot(SIDE_PROJECTION.KH, SIDE_PROJECTION.KZ);
      const drumTop = project(SIDE.drum.z, SIDE.drum.h, H).y - s.S * SIDE.drum.r * k;
      const beamBottom = project(SIDE.beam.z, SIDE.beam.h, H).y + s.S * SIDE.beam.r * k;
      expect(drumTop).toBeCloseTo(SIDE_TOP_FRAC * H, 6);
      expect(beamBottom).toBeCloseTo(SIDE_BOTTOM_FRAC * H, 6);
    }
  });

  it('円の見える半分 (circleArc): 視線の向きに面した側 (半円)。両端の点は画面の縦の端 (輪郭) にある', () => {
    const a = viewAlpha();
    expect(a).toBeCloseTo(Math.atan2(SIDE_PROJECTION.KZ, SIDE_PROJECTION.KH), 9);
    expect(VISIBLE_SPAN).toBeCloseTo(Math.PI, 9);
    const H = 750;
    const arc = circleArc(SIDE.drum, a - Math.PI / 2, a + Math.PI / 2, 24).map((q) => project(q.z, q.h, H).y);
    const ys = arc.slice();
    expect(Math.min(...ys)).toBeCloseTo(Math.min(arc[0]!, arc[arc.length - 1]!), 6); // 端が縦の端
    expect(Math.max(...ys)).toBeCloseTo(Math.max(arc[0]!, arc[arc.length - 1]!), 6);
  });
});
