import { describe, it, expect } from 'vitest';
import {
  BOARD_W, HEADER_H, LANE_MIN_W, METER_FULL_M,
  boardHeightFor, lanesFor, layoutFor, cellRect, lanePartsFor, laneAt, textHitAt, laneProgress,
  meterAngle, meterLaps, fmtM, laneLengthText,
} from './geometry';
import { itowariPuzzles } from './puzzles';
import { getContent } from '../../core/content/content';

/**
 * 糸割りの盤面の座標のテスト (PU-16a)。盤面は画面 px で配置する (盤面のカードの大きさ w×h から決める)。
 * 使う口だけを大きく描く。1口の幅は 96px 以上、元の糸の絵は直径 48px 以上。
 */

const puzzles = itowariPuzzles(getContent());
const byId = (id: string): (typeof puzzles)[number] => puzzles.find((p) => p.id === id)!;

/** 盤面のカードの大きさ (縦長の Fold 8・iPhone・横長の iPhone・正方形に近い・広い) */
const CARDS: Array<[number, number]> = [[377, 333], [396, 363], [496, 282], [534, 305], [689, 637], [636, 278]];

describe('糸割り geometry PU-16a (使う口だけを大きく)', () => {
  it('1. 使う口の数 (lanesFor): split はチーズの数か 12 の小さいほう、refill は作る本数 + 2 (12 まで)', () => {
    expect(lanesFor(byId('s1'))).toBe(6); // レベル1: チーズ 6 個
    expect(lanesFor(byId('s2'))).toBe(12); // レベル2: チーズ 15 個 → 12
    expect(lanesFor(byId('s3'))).toBe(4); // レベル3: あと 2 本 → 4
    expect(lanesFor(byId('s4'))).toBe(5); // レベル4: あと 3 本 → 5
    expect(lanesFor(byId('s5'))).toBe(5); // レベル5
    for (const p of puzzles) {
      expect(lanesFor(p), p.id).toBeGreaterThanOrEqual(1);
      expect(lanesFor(p), p.id).toBeLessThanOrEqual(12);
    }
  });

  it('2. 盤面の論理の高さ: カードの縦横の割合に合わせる (幅 1000 のまま。測れないときは 750)', () => {
    expect(BOARD_W).toBe(1000);
    expect(boardHeightFor(500, 500)).toBeCloseTo(1000, 6);
    expect(boardHeightFor(400, 200)).toBeCloseTo(500, 6);
    expect(boardHeightFor(0, 0)).toBe(750);
  });

  it('3. 口の並び (layoutFor): 6 口は縦長で 3 列 × 2 段。口は盤面の中に収まり、重ならない。1口の幅は 96px 以上', () => {
    const l = layoutFor(6, 377, 333);
    expect(l.cols).toBe(3);
    expect(l.rows).toBe(2);
    for (const [w, h] of CARDS) {
      for (const n of [4, 5, 6]) {
        const lay = layoutFor(n, w, h);
        expect(lay.cols * lay.rows, `${w}×${h} n${n}`).toBeGreaterThanOrEqual(n);
        expect(lay.cellW, `${w}×${h} n${n} の幅`).toBeGreaterThanOrEqual(LANE_MIN_W);
        const rects = Array.from({ length: n }, (_, i) => cellRect(lay, i));
        for (const r of rects) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(HEADER_H);
          expect(r.x + r.w).toBeLessThanOrEqual(w + 0.001);
          expect(r.y + r.h).toBeLessThanOrEqual(h + 0.001);
        }
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const a = rects[i]!;
            const b = rects[j]!;
            const overlap = a.x < b.x + b.w - 0.001 && b.x < a.x + a.w - 0.001 && a.y < b.y + b.h - 0.001 && b.y < a.y + a.h - 0.001;
            expect(overlap, `${w}×${h} n${n} 口${i}と${j}`).toBe(false);
          }
        }
      }
    }
  });

  it('4. 12 口は、画面の幅に入る列数で何段かに折り返す (口が盤面の外へはみ出さない。PU-16 の目的の 1 つ)', () => {
    for (const [w, h] of CARDS) {
      const lay = layoutFor(12, w, h);
      expect(lay.cols * lay.rows).toBeGreaterThanOrEqual(12);
      for (let i = 0; i < 12; i++) {
        const r = cellRect(lay, i);
        expect(r.x + r.w, `${w}×${h} 口${i + 1}`).toBeLessThanOrEqual(w + 0.001);
        expect(r.y + r.h, `${w}×${h} 口${i + 1}`).toBeLessThanOrEqual(h + 0.001);
      }
    }
  });

  it('5. 口の中身 (lanePartsFor): 元の糸の絵は直径 48px 以上 (6 口・縦長 377×333 と広い 689×637)。上から 元の糸 → 巻くコーン → 長さの文字、口の中に収まる', () => {
    for (const [w, h] of [[377, 333], [689, 637]] as Array<[number, number]>) {
      const lay = layoutFor(6, w, h);
      const parts = lanePartsFor(lay, 0, 1);
      const cell = cellRect(lay, 0);
      expect(parts.yarn.r * 2, `${w}×${h} 元の糸の直径`).toBeGreaterThanOrEqual(48);
      expect(parts.yarn.cy).toBeLessThan(parts.cone.cy);
      expect(parts.cone.cy).toBeLessThan(parts.text[0]!.y);
      for (const c of [parts.yarn, parts.cone]) {
        expect(c.cx - c.r).toBeGreaterThanOrEqual(cell.x - 0.001);
        expect(c.cx + c.r).toBeLessThanOrEqual(cell.x + cell.w + 0.001);
        expect(c.cy - c.r).toBeGreaterThanOrEqual(cell.y - 0.001);
        expect(c.cy + c.r).toBeLessThanOrEqual(cell.y + cell.h + 0.001);
      }
      expect(parts.text[0]!.y + parts.text[0]!.h).toBeLessThanOrEqual(cell.y + cell.h + 0.001);
      expect(parts.number.x).toBeLessThan(cell.x + cell.w / 2); // 番号は左上
      expect(parts.number.y).toBeLessThan(cell.y + 30);
    }
  });

  it('5b. 口が低い (12 口を縦長の画面に並べるなど) ときは、元の糸と巻くコーンを左右に並べて、丸を大きく保つ (直径 28px 以上)。番号の文字に重ならない。収まる', () => {
    const lay = layoutFor(12, 377, 333);
    const parts = lanePartsFor(lay, 0, 1);
    expect(parts.sideBySide).toBe(true);
    expect(parts.yarn.cx).toBeLessThan(parts.cone.cx);
    expect(parts.yarn.cy).toBeCloseTo(parts.cone.cy, 6);
    expect(parts.yarn.r * 2).toBeGreaterThanOrEqual(28);
    expect(parts.yarn.cx - parts.yarn.r).toBeGreaterThan(parts.number.x + 28 - 4); // 2 桁の番号 (幅 約 28px) の右
    const cell = cellRect(lay, 0);
    for (const c of [parts.yarn, parts.cone]) {
      expect(c.cx + c.r).toBeLessThanOrEqual(cell.x + cell.w);
      expect(c.cy - c.r).toBeGreaterThanOrEqual(cell.y);
      expect(c.cy + c.r).toBeLessThanOrEqual(parts.text[0]!.y + 28 + 0.001);
    }
    // 高い口は上下に並べる (これまでどおり)
    expect(lanePartsFor(layoutFor(6, 377, 333), 0, 1).sideBySide).toBe(false);
  });

  it('6. 糸を継ぐ口 (2 本) は長さの文字が 2 行。それぞれの当たりは重ならず、口の中に収まる', () => {
    const lay = layoutFor(6, 377, 333);
    const one = lanePartsFor(lay, 1, 1);
    const two = lanePartsFor(lay, 1, 2);
    expect(one.text).toHaveLength(1);
    expect(two.text).toHaveLength(2);
    expect(two.text[0]!.y + two.text[0]!.h).toBeLessThanOrEqual(two.text[1]!.y + 0.001);
    const cell = cellRect(lay, 1);
    expect(two.text[1]!.y + two.text[1]!.h).toBeLessThanOrEqual(cell.y + cell.h + 0.001);
    expect(two.yarn.cy).toBeLessThan(two.text[0]!.y);
  });

  it('7. 当たり判定: 口の中の点はその口 (laneAt)。盤面の外・使わない口の先は null。長さの文字の上 (textHitAt) は口と区間 (0/1)', () => {
    const lay = layoutFor(6, 377, 333);
    for (let i = 0; i < 6; i++) {
      const c = cellRect(lay, i);
      expect(laneAt(lay, { x: c.x + c.w / 2, y: c.y + c.h / 2 }, 6)).toBe(i);
    }
    expect(laneAt(lay, { x: -5, y: 100 }, 6)).toBeNull();
    expect(laneAt(lay, { x: 10, y: 5 }, 6)).toBeNull(); // 上の端 (メーターの行)
    const parts = lanePartsFor(lay, 2, 2);
    const t0 = parts.text[0]!;
    const t1 = parts.text[1]!;
    expect(textHitAt(lay, { x: t0.x + t0.w / 2, y: t0.y + t0.h / 2 }, (i) => (i === 2 ? 2 : 1), 6)).toEqual({ spindle: 2, slot: 0 });
    expect(textHitAt(lay, { x: t1.x + t1.w / 2, y: t1.y + t1.h / 2 }, (i) => (i === 2 ? 2 : 1), 6)).toEqual({ spindle: 2, slot: 1 });
    expect(textHitAt(lay, { x: parts.yarn.cx, y: parts.yarn.cy }, () => 1, 6)).toBeNull();
  });

  it('8. 長さの文字が押せる広さ: 高さ 44px 以上 (1 本のとき)・口の幅いっぱい', () => {
    const lay = layoutFor(6, 377, 333);
    const t = lanePartsFor(lay, 0, 1).text[0]!;
    expect(t.h).toBeGreaterThanOrEqual(44);
    expect(t.w).toBeCloseTo(cellRect(lay, 0).w, 6);
  });

  it('9. 巻く進み (laneProgress): 設定していない口は 0。元の糸の残りの比と、巻けた比 (巻き始める前は 0)', () => {
    const p = byId('s1');
    const s = {
      phase: 'setup',
      progress: 0,
      spindles: [{ segments: [{ sourceId: 'x', lengthM: 6000 }] }, { segments: [] }],
      remaining: { x: 12000 },
    };
    const a = laneProgress(s, 12000, 0);
    expect(a.yarnRatio).toBeCloseTo(1, 6);
    expect(a.coneRatio).toBe(0);
    const b = laneProgress({ ...s, phase: 'winding', progress: 0.5 }, 12000, 0);
    expect(b.yarnRatio).toBeCloseTo((12000 - 3000) / 12000, 6);
    expect(b.coneRatio).toBeGreaterThan(0);
    expect(laneProgress(s, 12000, 1).coneRatio).toBe(0);
    expect(p.id).toBe('s1');
  });

  it('10. メーターは 1周 1,000m。針は回り、周の数は 3,250m で 3。数字はカンマ区切り。長さの文字は未設定・継ぎ・狭い口で変わる', () => {
    expect(METER_FULL_M).toBe(1000);
    expect(meterAngle(0)).toBeCloseTo(meterAngle(1000), 10);
    expect(meterAngle(250)).toBeCloseTo(0, 10);
    expect(meterLaps(3250)).toBe(3);
    expect(fmtM(6000)).toBe('6,000');
    expect(laneLengthText({ segments: [] }, false)).toBe('長さ未設定');
    expect(laneLengthText({ segments: [] }, true)).toBe('未設定');
    expect(laneLengthText({ segments: [{ lengthM: 6000 }] }, false)).toBe('6,000 m');
    expect(laneLengthText({ segments: [{ lengthM: 4200 }, { lengthM: 1800 }] }, false, 1)).toBe('+ 1,800 m');
  });
});
