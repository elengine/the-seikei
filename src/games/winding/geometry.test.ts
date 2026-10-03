import { describe, it, expect } from 'vitest';
import { LOGICAL_W, LOGICAL_H, endPoint, hitEnd, toPx, fromPx, threadY, drumSectionY, tableY, TABLE_AREA, REED_X, DRUM_END_X, DRUM_AREA, pointOnPath, threadPath, PIN_RAIL_X, DIAL_X, DIAL_Y, DIAL_R, reedRect, reedThreadY, THREAD_SHEET_HALF } from './geometry';

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
    // クリール側は x 290、ドラム側は x 360 (まっすぐ横に進む区間の上。T2-10a)
    expect(endPoint(0, 'creel', 8).x).toBeCloseTo(290, 0);
    expect(endPoint(0, 'drum', 8).x).toBeCloseTo(360, 0);
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

describe('winding geometry T2-08-fix a (ドラムの向きを90度回す・台が動く)', () => {
  it('1. 帯の区画は上から並ぶ: drumSectionY(0) < drumSectionY(1) < drumSectionY(2)', () => {
    const a = drumSectionY(0, 3);
    const b = drumSectionY(1, 3);
    const c = drumSectionY(2, 3);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    // 区画は上端と下端で DRUM_AREA を等分する (i=0 が上端、i=sections が下端)
    expect(a).toBeCloseTo(DRUM_AREA.y, 9);
    expect(drumSectionY(3, 3)).toBeCloseTo(DRUM_AREA.y + DRUM_AREA.h, 9);
  });

  it('2. 台の縦の位置が今の帯の区画の中心に合う: tableY(current, sections) が区画の中心', () => {
    for (const sections of [3, 5]) {
      for (let cur = 0; cur < sections; cur++) {
        const top = drumSectionY(cur, sections);
        const bottom = drumSectionY(cur + 1, sections);
        expect(tableY(cur, sections)).toBe((top + bottom) / 2);
      }
    }
  });

  it('3. 台が動いても切れ端の位置は変わらない (endPoint は引数に current を持たない)', () => {
    // endPoint は (thread, side, threadCount) だけ。current に依存しないことを型で確かめる
    const e0 = endPoint(4, 'creel', 8);
    const e1 = endPoint(4, 'creel', 8);
    expect(e1).toEqual(e0);
    // 台がどの区画にいても threadY は同じ
    expect(threadY(4, 8)).toBe(e0.y);
  });

  it('4. 筬から今の帯へ向かう線 (筬の x からドラム側の切れ端の x まで) が横向き', () => {
    // 筬は台の中央、今の帯の区画は DRUM_AREA の左の縁
    expect(REED_X).toBeLessThan(DRUM_AREA.x);
    expect(DRUM_END_X).toBeLessThan(DRUM_AREA.x);
    // 台は切れ端より右に置かない (切れ端 x 380・460 は台の範囲内。台の描く絵は REED_X 付近)
    expect(TABLE_AREA.x).toBeLessThan(REED_X);
    expect(REED_X).toBeLessThan(TABLE_AREA.x + TABLE_AREA.w);
  });

  it('5. pointOnPath が糸の線 (クリール→筬→今の帯) の上の点を返す', () => {
    // クリール側の糸の上: t=2 の糸、進み 0 (コーン側)
    const p1 = pointOnPath(2, 8, 0, 0, 3);
    expect(p1.y).toBeCloseTo(threadY(2, 8), 9);
    // 筬を通過したあとは今の帯の高さへ向かう: 進み 1 (筬の右端)
    const p2 = pointOnPath(2, 8, 1, 0, 3);
    expect(p2.y).toBeCloseTo(tableY(0, 3), 9);
  });
});

describe('winding geometry T2-07-fix2 (糸の縦の位置は1つの関数で決める)', () => {
  it('threadY がすべての糸で endPoint の y と同じ (クリール側・ドラム側の両方)', () => {
    for (const threadCount of [3, 5, 8]) {
      for (let t = 0; t < threadCount; t++) {
        expect(endPoint(t, 'creel', threadCount).y, `t${t} n${threadCount} creel`).toBe(threadY(t, threadCount));
        expect(endPoint(t, 'drum', threadCount).y, `t${t} n${threadCount} drum`).toBe(threadY(t, threadCount));
      }
    }
  });

  it('threadY は上から下へ等間隔で、盤面の中', () => {
    for (const threadCount of [3, 8]) {
      for (let t = 0; t + 2 < threadCount; t++) {
        const a = threadY(t, threadCount);
        const b = threadY(t + 1, threadCount);
        const c = threadY(t + 2, threadCount);
        expect(b - a).toBeCloseTo(c - b, 9);
      }
      for (let t = 0; t < threadCount; t++) {
        const y = threadY(t, threadCount);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(LOGICAL_H);
      }
    }
  });
});

describe('winding geometry T2-10a (糸の道筋と切れ端の位置)', () => {
  /** 点と線分の距離 */
  function distToSeg(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
  }

  it('1. pointOnPath の点は、threadPath の折れ線のどれかの線分の上にある (どの糸・current でも)', () => {
    for (const current of [0, 1, 2]) {
      for (let t = 0; t < 8; t += 2) {
        for (const along of [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1]) {
          const p = pointOnPath(t, 8, along, current, 3);
          const path = threadPath(t, 8, current, 3);
          let min = Infinity;
          for (let i = 0; i + 1 < path.length; i++) {
            min = Math.min(min, distToSeg(p, path[i]!, path[i + 1]!));
          }
          expect(min, `t${t} along${along} current${current}`).toBeLessThanOrEqual(0.5);
        }
      }
    }
  });

  it('2. along を増やすと y は糸の高さから筬の高さの間にあり、y < 50 にならない', () => {
    for (const current of [0, 2]) {
      for (let t = 0; t < 8; t++) {
        for (let a = 0; a <= 1; a += 0.1) {
          const p = pointOnPath(t, 8, a, current, 3);
          expect(p.y).toBeGreaterThanOrEqual(50);
          expect(p.y).toBeLessThanOrEqual(Math.max(threadY(t, 8), tableY(current, 3)) + 1);
        }
      }
    }
  });

  it('3. endPoint は threadPath のまっすぐ横に進む区間の上にある。ドラム側 − クリール側 ≥ 60。筬と台の左端より左', () => {
    for (let t = 0; t < 8; t++) {
      const c = endPoint(t, 'creel', 8);
      const d = endPoint(t, 'drum', 8);
      const path = threadPath(t, 8, 0, 3);
      for (const e of [c, d]) {
        let min = Infinity;
        for (let i = 0; i + 1 < path.length; i++) {
          min = Math.min(min, distToSeg(e, path[i]!, path[i + 1]!));
        }
        expect(min, `t${t}`).toBeLessThanOrEqual(0.5);
      }
      expect(d.x - c.x).toBeGreaterThanOrEqual(60);
      expect(c.x).toBeLessThan(REED_X);
      expect(d.x).toBeLessThan(REED_X);
      // 台の左端より左 (切れ端の上に台を描かない)
      expect(d.x).toBeLessThan(TABLE_AREA.x);
    }
  });
});

describe('winding geometry T2-10 追加修正 a (台とドラムの縦木が重ならない)', () => {
  it('台の右端 + 20 ≤ ドラムの縦木の左の端。筬は台の中。台の左端はドラム側の切れ端より右', () => {
    expect(TABLE_AREA.x + TABLE_AREA.w + 20).toBeLessThanOrEqual(PIN_RAIL_X);
    expect(TABLE_AREA.x).toBeLessThan(REED_X);
    expect(REED_X).toBeLessThan(TABLE_AREA.x + TABLE_AREA.w);
    expect(DRUM_END_X).toBeLessThan(TABLE_AREA.x);
  });
});

describe('winding geometry T2-13a (目盛り盤と筬が重ならない・筬は縦の枠)', () => {
  /** 四角が重なるか */
  function overlap(
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ): boolean {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  it('1. 目盛り盤の外接の四角と、筬の四角が、どの区画でも重ならない', () => {
    for (const sections of [3, 5, 7]) {
      for (let cur = 0; cur < sections; cur++) {
        const dial = { x: DIAL_X - DIAL_R, y: DIAL_Y - DIAL_R, w: DIAL_R * 2, h: DIAL_R * 2 };
        const reed = reedRect(cur, sections);
        expect(overlap(dial, reed), `sections${sections} cur${cur}`).toBe(false);
      }
    }
  });

  it('2. 筬の枠は縦長 (高さ > 幅) で、糸の束より少し大きい', () => {
    for (const sections of [3, 7]) {
      const reed = reedRect(0, sections);
      expect(reed.h, `sections${sections}`).toBeGreaterThan(reed.w);
      expect(reed.h).toBeGreaterThan(THREAD_SHEET_HALF * 2);
    }
  });

  it('3. 筬の中心 x は REED_X、縦の位置は今の帯の高さに合わせて動く', () => {
    const a = reedRect(0, 3);
    const b = reedRect(1, 3);
    expect(a.x + a.w / 2).toBeCloseTo(REED_X, 9);
    expect(b.x + b.w / 2).toBeCloseTo(REED_X, 9);
    expect(b.y).toBeGreaterThan(a.y);
  });

  it('4. 筬の位置の糸の y (reedThreadY) が、筬の四角の中に収まる (糸が歯のすき間を通る)', () => {
    for (const sections of [3, 7]) {
      const reed = reedRect(0, sections);
      for (let t = 0; t < 8; t++) {
        const y = reedThreadY(t, 8, 0, sections);
        expect(y, `t${t} sections${sections}`).toBeGreaterThan(reed.y);
        expect(y).toBeLessThan(reed.y + reed.h);
      }
    }
  });
});
