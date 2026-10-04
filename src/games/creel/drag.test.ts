import { describe, it, expect } from 'vitest';
import { beginDrag, moveDrag, dropResult, DRAG_THRESHOLD_PX, LIFT_MARGIN_PX, liftFor, isDragGesture } from './drag';
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

describe('PU-13c: 持ち上げる量・引っぱりか送りかの判定', () => {
  it('liftFor: チーズの半径 + 24px (チーズの下の端が指の点より 24px 上にくる)', () => {
    expect(LIFT_MARGIN_PX).toBe(24);
    expect(liftFor(48)).toBe(48);
    expect(liftFor(100)).toBe(74);
    expect(liftFor(33)).toBe(33 / 2 + 24);
  });

  it('isDragGesture (縦長の帯: 送る向きは x): 上へ動かせば引っぱり。上へ向かう成分が横の半分以上あれば、横にずれても引っぱり。ほぼ横なら送る。下へは送る (何も起きない)', () => {
    expect(isDragGesture('x', 0, -10)).toBe(true);
    expect(isDragGesture('x', 8, -8)).toBe(true); // 斜め上 (これまでは横と同じ大きさで「送る」にされて、出てこなかった)
    expect(isDragGesture('x', 12, -6)).toBe(true); // 上の成分が横の半分
    expect(isDragGesture('x', 20, -2)).toBe(false); // ほぼ横
    expect(isDragGesture('x', 0, 10)).toBe(false); // 下
    expect(isDragGesture('x', -12, -6)).toBe(true);
  });

  it('isDragGesture (横長の帯: 送る向きは y): 左 (盤面の方) へ動かせば引っぱり。左へ向かう成分が縦の半分以上あれば引っぱり。ほぼ縦なら送る', () => {
    expect(isDragGesture('y', -10, 0)).toBe(true);
    expect(isDragGesture('y', -8, 8)).toBe(true);
    expect(isDragGesture('y', -6, 12)).toBe(true);
    expect(isDragGesture('y', -2, 20)).toBe(false);
    expect(isDragGesture('y', 10, 0)).toBe(false); // 右
  });
});
