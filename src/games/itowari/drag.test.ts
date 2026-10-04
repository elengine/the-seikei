import { describe, it, expect } from 'vitest';
import { beginDrag, moveDrag, dropResult, laneAt, coneAt, DRAG_THRESHOLD_PX } from './drag';
import type { DragState } from './drag';
import { init } from './logic';
import { itowariPuzzles } from './puzzles';
import { getContent } from '../../core/content/content';
import { BOX } from './geometry';

/**
 * ドラッグで糸をかける・外す動きの判定のテスト (P2b T2b-03b)。
 * 座標は start・current が画面 (指) の座標、判定には盤面の論理座標を使う。
 */

const content = getContent();
const puzzles = itowariPuzzles(content);
const p1 = puzzles.find((p) => p.id === 's1')!; // split レベル1 (チーズ6個)

function drag(source: Parameters<typeof beginDrag>[0], path: Array<{ x: number; y: number }>): DragState {
  let d = beginDrag(source, path[0]!);
  for (const p of path.slice(1)) d = moveDrag(d, p);
  return d;
}

describe('糸割り drag T2b-03b (かける・外す)', () => {
  it('1. 8px 以上動かすと moved。未満は押すだけ (tap)', () => {
    const d = drag({ kind: 'cone', sourceId: p1.sources[0]!.id }, [
      { x: 100, y: 100 },
      { x: 100 + DRAG_THRESHOLD_PX, y: 100 },
    ]);
    expect(d.moved).toBe(true);
    const d2 = drag({ kind: 'cone', sourceId: p1.sources[0]!.id }, [
      { x: 100, y: 100 },
      { x: 103, y: 100 },
    ]);
    expect(d2.moved).toBe(false);
    const r = dropResult(d2, { kind: 'lane', spindle: 2 });
    expect(r).toEqual({ kind: 'tap' });
  });

  it('2. 箱の糸を口に重ねて離すと mount (口の番号つき)。口の外で離すと cancel', () => {
    const d = drag({ kind: 'cone', sourceId: p1.sources[0]!.id }, [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ]);
    expect(dropResult(d, { kind: 'lane', spindle: 5 })).toEqual({ kind: 'mount', spindle: 5, sourceId: p1.sources[0]!.id });
    expect(dropResult(d, null)).toEqual({ kind: 'cancel' });
    expect(dropResult(d, { kind: 'cone', sourceId: p1.sources[1]!.id })).toEqual({ kind: 'cancel' });
  });

  it('3. 口から箱へ持っていくと unmount。盤面の外や別の口では cancel (元に戻る)', () => {
    const d = drag({ kind: 'lane', spindle: 3 }, [
      { x: 0, y: 0 },
      { x: 0, y: -40 },
    ]);
    expect(dropResult(d, { kind: 'cone', sourceId: p1.sources[0]!.id })).toEqual({ kind: 'unmount', spindle: 3 });
    expect(dropResult(d, null)).toEqual({ kind: 'cancel' });
    expect(dropResult(d, { kind: 'lane', spindle: 7 })).toEqual({ kind: 'cancel' });
  });

  it('4. laneAt: 口の列 (上の段から下の段まで) で当たる。狭い画面 (2段) でも同じ列', () => {
    // 広い画面 (1段): 口0 は x 185〜251・y 188〜598
    expect(laneAt({ x: 200, y: 300 }, false, 12)).toBe(0);
    expect(laneAt({ x: 200, y: 590 }, false, 12)).toBe(0); // 下の段 (胴) も同じ列
    expect(laneAt({ x: 930, y: 300 }, false, 12)).toBe(11);
    expect(laneAt({ x: 120, y: 300 }, false, 12)).toBeNull(); // 台の左 (箱の上)
    expect(laneAt({ x: 200, y: 100 }, false, 12)).toBeNull();
    // 狭い画面 (2段): 口0 は上の段 (y 143〜422)・口6 は下の段 (y 430〜709) の同じ列
    expect(laneAt({ x: 200, y: 300 }, true, 12)).toBe(0);
    expect(laneAt({ x: 200, y: 600 }, true, 12)).toBe(6);
    expect(laneAt({ x: 200, y: 60 }, true, 12)).toBeNull();
  });

  it('5. coneAt: 箱の中の糸の円すい台。箱の外や、もう使った (かけた・使い切った) 糸は当たらない', () => {
    const s = init(p1);
    // 箱の1つ目の糸の中心 (renderer と同じ並び: cx = BOX.x + 26 + k%4 * 32)
    const p0 = { x: BOX.x + 26, y: BOX.y + 62 };
    expect(coneAt(p0, p1, s)).toBe(p1.sources[0]!.id);
    const p1c = { x: BOX.x + 26 + 32, y: BOX.y + 62 };
    expect(coneAt(p1c, p1, s)).toBe(p1.sources[1]!.id);
    // 箱の外
    expect(coneAt({ x: 500, y: 500 }, p1, s)).toBeNull();
    // 口0にかけた糸は箱から消える → 残りが詰めて並ぶ (セル0は次の糸になる)
    const s2 = init(p1);
    s2.spindles[0]!.segments.push({ sourceId: p1.sources[0]!.id, lengthM: 1000 });
    expect(coneAt(p0, p1, s2)).toBe(p1.sources[1]!.id);
    // 残り 5個の右隣の空きセル (k=5) は当たらない
    expect(coneAt({ x: BOX.x + 26 + 64, y: BOX.y + 62 + 52 }, p1, s2)).toBeNull();
    // 使い切った糸も消える (残り 4個・セル4は当たらない)
    const s3 = init(p1);
    s3.used.push(p1.sources[0]!.id, p1.sources[1]!.id);
    expect(coneAt(p0, p1, s3)).toBe(p1.sources[2]!.id);
    expect(coneAt({ x: BOX.x + 26, y: BOX.y + 62 + 52 }, p1, s3)).toBeNull();
  });
});
