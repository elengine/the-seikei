import { describe, it, expect } from 'vitest';
import { beginDrag, moveDrag, dropResult, DRAG_THRESHOLD_PX, LIFT_MARGIN_PX } from './drag';
import type { DragState } from './drag';

/**
 * 糸を口にかける・外す動きの判定のテスト (PU-16b)。DOM に触らない純粋な関数。
 * 箱の糸を口へ引っぱるとかかる (mount)、口の糸を盤面の外 (箱の帯の方) へ引っぱると外れる (unmount)。
 * 8px 動かすと引っぱり、未満で離すと押すだけ (tap)。
 */

function drag(source: Parameters<typeof beginDrag>[0], path: Array<{ x: number; y: number }>): DragState {
  let d = beginDrag(source, path[0]!);
  for (const p of path.slice(1)) d = moveDrag(d, p);
  return d;
}

describe('糸割り drag PU-16b (かける・外す)', () => {
  it('1. 8px 以上動かすと moved。未満は押すだけ (tap)。持ち上げる量は 24px', () => {
    expect(DRAG_THRESHOLD_PX).toBe(8);
    expect(LIFT_MARGIN_PX).toBe(24);
    const d = drag({ kind: 'box', sourceId: 'a' }, [
      { x: 100, y: 100 },
      { x: 100 + DRAG_THRESHOLD_PX, y: 100 },
    ]);
    expect(d.moved).toBe(true);
    const d2 = drag({ kind: 'box', sourceId: 'a' }, [
      { x: 100, y: 100 },
      { x: 103, y: 100 },
    ]);
    expect(d2.moved).toBe(false);
    expect(dropResult(d2, { kind: 'lane', spindle: 2 })).toEqual({ kind: 'tap' });
  });

  it('2. 一度 moved になったら、戻っても moved のまま', () => {
    const d = drag({ kind: 'box', sourceId: 'a' }, [
      { x: 100, y: 100 },
      { x: 130, y: 100 },
      { x: 101, y: 100 },
    ]);
    expect(d.moved).toBe(true);
  });

  it('3. 箱の糸を口で離すと mount (口の番号と糸の id つき)。口の外・盤面の外で離すと cancel', () => {
    const d = drag({ kind: 'box', sourceId: 'x1' }, [
      { x: 100, y: 100 },
      { x: 200, y: 60 },
    ]);
    expect(dropResult(d, { kind: 'lane', spindle: 3 })).toEqual({ kind: 'mount', spindle: 3, sourceId: 'x1' });
    expect(dropResult(d, null)).toEqual({ kind: 'cancel' });
    expect(dropResult(d, { kind: 'outside' })).toEqual({ kind: 'cancel' });
  });

  it('4. 口の糸を盤面の外 (箱の帯の方) で離すと unmount。口の上・口の外の盤面の中で離すと cancel (元に戻す)', () => {
    const d = drag({ kind: 'lane', spindle: 1 }, [
      { x: 100, y: 100 },
      { x: 100, y: 300 },
    ]);
    expect(dropResult(d, { kind: 'outside' })).toEqual({ kind: 'unmount', spindle: 1 });
    expect(dropResult(d, { kind: 'lane', spindle: 4 })).toEqual({ kind: 'cancel' });
    expect(dropResult(d, null)).toEqual({ kind: 'cancel' });
  });
});
