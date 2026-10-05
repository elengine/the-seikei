import { describe, it, expect, afterEach } from 'vitest';
import { setLogicalHeight, logicalHeightFor, machineExtent, CREEL_AREA, CREEL_END_X, LOGICAL_W, LOGICAL_H, endPoint, hitEnd, toPx, fromPx, threadY, drumSectionY, tableY, TABLE_AREA, REED_X, DRUM_END_X, DRUM_AREA, pointOnPath, threadPath, PIN_RAIL_X, DIAL_X, DIAL_Y, DIAL_R, reedRect, reedThreadY, THREAD_SHEET_HALF, hitBrokenThread, THREAD_MARK_X, SCISSORS_SIZE, SCISSORS_LIFT, scissorsPos, scissorsHitsThread, REED_RISE, surfaceY, ARC_RISE, DRUM_BULGE } from './geometry';

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
    // クリール側の切れ端はクリールの右、ドラム側は台の左 (まっすぐ横に進む区間の上。T2-10a。PU-14c で広いあいだに移した)
    expect(endPoint(0, 'creel', 8).x).toBeCloseTo(CREEL_END_X, 0);
    expect(endPoint(0, 'drum', 8).x).toBeCloseTo(DRUM_END_X, 0);
    expect(DRUM_END_X - CREEL_END_X).toBeGreaterThanOrEqual(60);
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
    // 間の少し a 寄りの点 (糸の間隔が広がったので、a から 20% の所。PU-14 追加修正)
    const mid = { x: (a.x + b.x) / 2, y: (a.y * 0.8 + b.y * 0.2) };
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

describe('winding geometry T2-13c (切れたあたりを1回押す当たり)', () => {
  it('1. 2本切れているとき、中間より片方に寄った点を押すと近いほうの糸', () => {
    const y1 = threadY(1, 8);
    const y2 = threadY(2, 8);
    // 糸1と糸2 (隣どうし) の中間より糸1寄り (span の中 x=200)
    const p = { x: 200, y: y1 * 0.7 + y2 * 0.3 };
    const hit = hitBrokenThread(p, [1, 2], 8, fit.scale);
    expect(hit).not.toBeNull();
    expect(hit).toBe(1);
  });

  it('2. 切れた糸から画面上 40px より遠く、切れていない糸に近い点は「切れていない糸」を返す (wrongThread 用)', () => {
    // 糸 0 は切れていない。糸1とは 47.6 論理 (= 画面 47.6px) 離れている
    const p = { x: 200, y: threadY(0, 8) };
    const hit = hitBrokenThread(p, [1, 4], 8, fit.scale);
    expect(hit).toBe(0);
  });

  it('3. 糸の区間の外 (ドラムの上・印より左) は当たらない', () => {
    // ドラムの上
    expect(hitBrokenThread({ x: 700, y: 200 }, [1, 4], 8, fit.scale)).toBeNull();
    // 糸道の印より左
    expect(hitBrokenThread({ x: 60, y: threadY(1, 8) }, [1, 4], 8, fit.scale)).toBeNull();
  });

  it('4. 画面上 40px 以内の距離で当たり。scale が小さいときは論理距離が広がる', () => {
    // thread 1 から 30 論理 (= 画面 30px) 離れた点 → 当たる
    const near = { x: 200, y: threadY(1, 8) + 30 };
    expect(hitBrokenThread(near, [1, 4], 8, fit.scale)).toBe(1);
    // scale 0.5 なら画面 40px = 論理 80。thread 1 から 60 論理離れても当たる
    const nearSmall = { x: 200, y: threadY(1, 8) + 60 };
    expect(hitBrokenThread(nearSmall, [1, 4], 8, 0.5)).toBe(1);
  });
});

describe('PU-14c: 盤面の配置 (クリールは左端・ドラムは右端、あいだを広く。チーズは等間隔に広げる)', () => {
  it('クリールとドラムのあいだの幅が、盤面の幅の 35% 以上 (縦の画面でも同じ論理座標なので同じ割合)', () => {
    const gap = DRUM_AREA.x - (CREEL_AREA.x + CREEL_AREA.w);
    expect(gap / LOGICAL_W).toBeGreaterThanOrEqual(0.35);
  });

  it('クリールは盤面の左端、ドラムは右端 (ドラムの胴のふくらみ 10 を含めて盤面の幅に収まり、右の端から 20 以内)', () => {
    expect(CREEL_AREA.x).toBeLessThanOrEqual(20);
    const drumRight = DRUM_AREA.x + DRUM_AREA.w + 10;
    expect(drumRight).toBeLessThanOrEqual(LOGICAL_W);
    expect(drumRight).toBeGreaterThanOrEqual(LOGICAL_W - 20);
  });

  it('筬と台は、あいだのドラム寄り (筬の x が、クリールとドラムの真ん中より右)。切れ端は台より左の広いあいだにある', () => {
    const mid = (CREEL_AREA.x + CREEL_AREA.w + DRUM_AREA.x) / 2;
    expect(REED_X).toBeGreaterThan(mid);
    expect(CREEL_END_X).toBeGreaterThan(CREEL_AREA.x + CREEL_AREA.w);
    expect(DRUM_END_X).toBeLessThan(TABLE_AREA.x);
  });

  it('糸 (チーズ) の縦の間隔が等しく、クリールの高さの 85% 以上に広がる (クリールの高さの中に収まる)', () => {
    const n = 8;
    const ys = Array.from({ length: n }, (_, t) => threadY(t, n));
    const step = ys[1]! - ys[0]!;
    for (let t = 1; t < n; t++) {
      expect(ys[t]! - ys[t - 1]!).toBeCloseTo(step, 9);
    }
    expect(ys[n - 1]! - ys[0]!).toBeGreaterThanOrEqual(CREEL_AREA.h * 0.85);
    expect(ys[0]!).toBeGreaterThan(CREEL_AREA.y);
    expect(ys[n - 1]!).toBeLessThan(CREEL_AREA.y + CREEL_AREA.h);
  });

  it('切れた糸を押せる区間 (クリールの糸道の印から筬まで) の幅は、盤面の幅の 35% 以上', () => {
    expect((REED_X - THREAD_MARK_X) / LOGICAL_W).toBeGreaterThanOrEqual(0.35);
  });
});

describe('PU-14 追加修正: 盤面のカードの高さを使い切る (クリールとドラムの描いた範囲が 85% 以上)', () => {
  afterEach(() => {
    setLogicalHeight(750);
  });

  it('logicalHeightFor: カードの縦横の割合から論理の高さを決める。横長 (割合 < 3/4) や測れない (0) は 750。縦に近い・正方形に近いカードは 1000 × 高さ / 幅 (上限 1400)', () => {
    expect(logicalHeightFor(0, 0)).toBe(750);
    expect(logicalHeightFor(636, 278)).toBe(750);
    expect(logicalHeightFor(534, 305)).toBe(750);
    expect(logicalHeightFor(512, 517)).toBeCloseTo((1000 * 517) / 512, 6);
    expect(logicalHeightFor(100, 1000)).toBe(1400);
  });

  it('setLogicalHeight: クリール・台・ドラムの縦の位置と高さが論理の高さに合わせて伸びる (上の余白 100・クリールの上下の余白 50 は変わらない)', () => {
    setLogicalHeight(1000);
    expect(DRUM_AREA.y).toBe(100);
    expect(DRUM_AREA.h).toBe(850);
    expect(TABLE_AREA.h).toBe(850);
    expect(CREEL_AREA.y).toBe(50);
    expect(CREEL_AREA.h).toBe(900);
    setLogicalHeight(750);
    expect(DRUM_AREA.h).toBe(600);
    expect(CREEL_AREA.h).toBe(650);
  });

  it('描いた範囲 (クリールの柱・桟のはみ出し・竿を含むドラムの上から下まで) の高さが、論理の高さの 85% 以上 (750〜1400 のどれでも)', () => {
    for (const H of [750, 900, 1000, 1250, 1400]) {
      setLogicalHeight(H);
      const e = machineExtent();
      expect((e.bottom - e.top) / H, `H=${H}`).toBeGreaterThanOrEqual(0.85);
      expect(e.top).toBeGreaterThanOrEqual(0);
      expect(e.bottom).toBeLessThanOrEqual(H);
    }
  });

  it('5 つの大きさの盤面のカード (534×305・396×363・512×517・636×278・689×637) で、描いた範囲の高さがカードの高さの 85% 以上', () => {
    const cards: Array<[number, number]> = [[534, 305], [396, 363], [512, 517], [636, 278], [689, 637]];
    for (const [w, h] of cards) {
      const H = logicalHeightFor(w, h);
      setLogicalHeight(H);
      const scale = Math.min(w / LOGICAL_W, h / H);
      const e = machineExtent();
      expect(((e.bottom - e.top) * scale) / h, `${w}×${h}`).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('論理の高さを変えても、糸の縦の間隔は等しく、クリールの高さの中に収まる。台の位置は今の帯の区画の中心', () => {
    setLogicalHeight(1000);
    const ys = Array.from({ length: 8 }, (_, t) => threadY(t, 8));
    const step = ys[1]! - ys[0]!;
    for (let t = 1; t < 8; t++) {
      expect(ys[t]! - ys[t - 1]!).toBeCloseTo(step, 9);
    }
    expect(ys[0]!).toBeGreaterThan(CREEL_AREA.y);
    expect(ys[7]!).toBeLessThan(CREEL_AREA.y + CREEL_AREA.h);
    expect(tableY(0, 3)).toBeCloseTo((drumSectionY(0, 3) + drumSectionY(1, 3)) / 2, 9);
  });
});

describe('T2-16 その4b (ハサミの置き場所と持ち上げ)', () => {
  it('1. ハサミの大きさは 64 以上。置き場所は帯に関係なく同じ (クリールの右下・筬の左下・盤の下のほう)', () => {
    expect(SCISSORS_SIZE).toBeGreaterThanOrEqual(64);
    expect(scissorsPos()).toEqual(scissorsPos());
    const p = scissorsPos();
    expect(p.x).toBeGreaterThan(CREEL_END_X); // クリールの右下
    expect(p.x).toBeLessThan(REED_X); // 筬の左下
    expect(p.y).toBeGreaterThan(LOGICAL_H * 0.75); // 盤の下のほう
  });

  it('2. 引っぱっているあいだ、ハサミは指の位置より半分の大きさ + 24px 上に出る', () => {
    expect(SCISSORS_LIFT).toBe(SCISSORS_SIZE / 2 + 24);
  });

  it('3. 当たり判定: 糸の束の上 (または近く) で true・離れると false', () => {
    const mid = (REED_X + DRUM_AREA.x) / 2;
    expect(scissorsHitsThread({ x: mid, y: tableY(0, 3) }, 0, 3)).toBe(true);
    expect(scissorsHitsThread({ x: mid, y: tableY(0, 3) - REED_RISE }, 0, 3)).toBe(true);
    expect(scissorsHitsThread({ x: REED_X, y: tableY(0, 3) - REED_RISE }, 0, 3)).toBe(true);
    expect(scissorsHitsThread({ x: mid, y: tableY(0, 3) - 150 }, 0, 3)).toBe(false);
    expect(scissorsHitsThread({ x: 100, y: tableY(0, 3) }, 0, 3)).toBe(false);
  });
});

describe('T2-16 その5 (surfaceY ひとつの弧で表面の高さを決める)', () => {
  const cx = DRUM_AREA.x + DRUM_AREA.w / 2;

  it('1. surfaceY: 中央で baseY − ARC_RISE (いちばん高い)・ドラムの左右の端で baseY (∩ の山なり)', () => {
    const radius = (DRUM_AREA.w + DRUM_BULGE * 2) / 2;
    expect(surfaceY(cx, 400)).toBe(400 - ARC_RISE);
    expect(surfaceY(cx - radius, 400)).toBe(400); // 左の端 (ふくらみを含めたドラムの端)
    expect(surfaceY(cx + radius, 400)).toBe(400); // 右の端
    // 中央のほうが、はずれより小さい (高い)
    expect(surfaceY(cx, 400)).toBeLessThan(surfaceY(cx + radius * 0.6, 400));
    // 下の端の基準でも同じ向き (∩。∪ にならない)
    expect(surfaceY(cx, DRUM_AREA.y + DRUM_AREA.h)).toBe(DRUM_AREA.y + DRUM_AREA.h - ARC_RISE);
    expect(surfaceY(cx, DRUM_AREA.y + DRUM_AREA.h)).toBeLessThan(surfaceY(cx - radius, DRUM_AREA.y + DRUM_AREA.h));
  });

  it('2. ハサミの大きさは画面上 96 以上。持ち上げは半分の大きさ + 24', () => {
    expect(SCISSORS_SIZE).toBeGreaterThanOrEqual(96);
    expect(SCISSORS_LIFT).toBe(SCISSORS_SIZE / 2 + 24);
  });
});
