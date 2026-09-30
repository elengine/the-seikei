import type { YarnTypeId } from '../../core/domain/types';
import { hitTest } from './geometry';

/**
 * チーズを引っぱって置く・外す動きの状態と判定 (PU-07a)。DOM に触らない純粋な関数。
 * 座標は、start・current が画面 (指) の座標、dropResult の pLogical が盤面の論理座標。
 */

/** 動かし始めとみなす距離 (画面 px)。これ未満で離すと「押すだけ」 */
export const DRAG_THRESHOLD_PX = 8;

export type DragSource = { kind: 'box'; yarn: YarnTypeId } | { kind: 'peg'; index: number };

export interface DragState {
  source: DragSource;
  start: { x: number; y: number };
  current: { x: number; y: number };
  moved: boolean;
}

export type DropResult =
  | { kind: 'place'; index: number } // その軸に嵌める (入れ替えを含む)
  | { kind: 'remove'; index: number } // 軸から外す (peg から盤面の外へ)
  | { kind: 'move'; from: number; to: number }
  | { kind: 'cancel' } // 箱へ戻す / 元の軸に戻す
  | { kind: 'tap' }; // 動かさずに離した (押すだけの操作)

export function beginDrag(source: DragSource, p: { x: number; y: number }): DragState {
  return { source, start: { ...p }, current: { ...p }, moved: false };
}

/** 指が動いた。start から 8px 以上離れたら moved (一度 moved になったら戻らない) */
export function moveDrag(s: DragState, p: { x: number; y: number }): DragState {
  const moved = s.moved || Math.hypot(p.x - s.start.x, p.y - s.start.y) >= DRAG_THRESHOLD_PX;
  return { ...s, current: { ...p }, moved };
}

/**
 * 離したとき。pLogical は離した所 (チーズの位置) の盤面の論理座標で、盤面の外なら null。
 * 吸い付く先は「一番近い軸の中心から、軸の間隔の 0.6 倍以内」(hitTest)。
 */
export function dropResult(s: DragState, pLogical: { x: number; y: number } | null, rows: number, cols: number): DropResult {
  if (!s.moved) {
    return { kind: 'tap' };
  }
  const hit = pLogical === null ? null : hitTest(pLogical, rows, cols);
  if (s.source.kind === 'box') {
    return hit !== null ? { kind: 'place', index: hit } : { kind: 'cancel' };
  }
  if (pLogical === null) {
    return { kind: 'remove', index: s.source.index }; // クリールの外で離した
  }
  if (hit === null || hit === s.source.index) {
    return { kind: 'cancel' }; // 元の軸に戻す
  }
  return { kind: 'move', from: s.source.index, to: hit };
}
