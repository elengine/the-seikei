import type { YarnTypeId } from '../../core/domain/types';
import { hitTest } from './geometry';

/**
 * チーズを引っぱって置く・外す動きの状態と判定 (PU-07a)。DOM に触らない純粋な関数。
 * 座標は、start・current が画面 (指) の座標、dropResult の pLogical が盤面の論理座標。
 */

/** 動かし始めとみなす距離 (画面 px)。これ未満で離すと「押すだけ」 */
export const DRAG_THRESHOLD_PX = 8;

/** チーズの下の端を、指の点より上に離す距離 (画面 px。指でチーズが隠れない) */
export const LIFT_MARGIN_PX = 24;

/** チーズを指より上に出す量 (画面 px) = チーズの半径 + LIFT_MARGIN_PX。直径 diameter のチーズの下の端が、指の点より 24px 上にくる */
export function liftFor(diameter: number): number {
  return diameter / 2 + LIFT_MARGIN_PX;
}

/**
 * 箱の帯の上で指が動き始めたとき、チーズを引っぱる動きか、帯を送る動きかを決める (dx・dy は指が動いた量)。
 * axis は帯を送れる向き ('x' = 横に送る縦長の画面、'y' = 縦に送る横長の画面)。
 * 引っぱる向き (縦長は上、横長は左) への成分が、送る向きの成分の半分以上あれば引っぱり。
 * ちょうど斜めに動かしても引っぱりになる (これまでは、横の成分が少しでも大きいと「送る」にされて、チーズが出てこなかった)。
 */
export function isDragGesture(axis: 'x' | 'y', dx: number, dy: number): boolean {
  const toward = axis === 'x' ? -dy : -dx; // 引っぱる向きへ動いた量
  const along = axis === 'x' ? Math.abs(dx) : Math.abs(dy); // 送る向きへ動いた量
  return toward > 0 && toward >= along * 0.5;
}

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
