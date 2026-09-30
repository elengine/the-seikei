import { describe, it, expect } from 'vitest';
import { beginDrag, moveDrag, dropResult, DRAG_THRESHOLD_PX } from './drag';
import { pegCenter } from './geometry';

const rows = 1;
const cols = 6;

describe('引っぱる動き (drag.ts。PU-07a)', () => {
  it('beginDrag は moved なし。8px 未満の動きでは moved にならず、8px 以上で moved になる (一度なったら戻らない)', () => {
    let s = beginDrag({ kind: 'box', yarn: 'kon-a' }, { x: 100, y: 100 });
    expect(s.moved).toBe(false);
    expect(DRAG_THRESHOLD_PX).toBe(8);
    s = moveDrag(s, { x: 105, y: 105 }); // 約 7.07px
    expect(s.moved).toBe(false);
    s = moveDrag(s, { x: 108, y: 100 }); // 8px
    expect(s.moved).toBe(true);
    s = moveDrag(s, { x: 100, y: 100 }); // 元に戻っても moved のまま
    expect(s.moved).toBe(true);
    expect(s.current).toEqual({ x: 100, y: 100 });
    expect(s.start).toEqual({ x: 100, y: 100 });
  });

  it('8px 未満で離すと tap (押すだけ)', () => {
    const s = moveDrag(beginDrag({ kind: 'box', yarn: 'kon-a' }, { x: 0, y: 0 }), { x: 3, y: 3 });
    expect(dropResult(s, pegCenter(0, rows, cols), rows, cols)).toEqual({ kind: 'tap' });
  });

  it('箱から軸の近くで離すと place。遠くで離すと cancel。盤面の外 (null) でも cancel', () => {
    const s = moveDrag(beginDrag({ kind: 'box', yarn: 'kon-a' }, { x: 0, y: 0 }), { x: 200, y: 200 });
    const c2 = pegCenter(2, rows, cols);
    expect(dropResult(s, c2, rows, cols)).toEqual({ kind: 'place', index: 2 });
    expect(dropResult(s, { x: c2.x + 20, y: c2.y + 20 }, rows, cols)).toEqual({ kind: 'place', index: 2 });
    // 軸から遠い (マスの角) と cancel
    expect(dropResult(s, { x: 62, y: 92 }, rows, cols)).toEqual({ kind: 'cancel' });
    expect(dropResult(s, null, rows, cols)).toEqual({ kind: 'cancel' });
  });

  it('軸から盤面の外 (null) で離すと remove。別の軸で離すと move。同じ軸で離すと cancel', () => {
    const s = moveDrag(beginDrag({ kind: 'peg', index: 1 }, { x: 0, y: 0 }), { x: 200, y: 200 });
    expect(dropResult(s, null, rows, cols)).toEqual({ kind: 'remove', index: 1 });
    expect(dropResult(s, pegCenter(4, rows, cols), rows, cols)).toEqual({ kind: 'move', from: 1, to: 4 });
    expect(dropResult(s, pegCenter(1, rows, cols), rows, cols)).toEqual({ kind: 'cancel' });
    // クリールの中でも、どの軸からも遠い所で離すと元の軸に戻す (cancel)
    expect(dropResult(s, { x: 62, y: 92 }, rows, cols)).toEqual({ kind: 'cancel' });
  });

  it('軸を 8px 未満動かして離すと tap', () => {
    const s = moveDrag(beginDrag({ kind: 'peg', index: 0 }, { x: 10, y: 10 }), { x: 12, y: 11 });
    expect(dropResult(s, null, rows, cols)).toEqual({ kind: 'tap' });
  });
});
