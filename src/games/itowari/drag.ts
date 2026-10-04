import { BOX, laneArea } from './geometry';
import type { ItowariState } from './logic';
import type { ItowariPuzzle } from './puzzles';

/**
 * 糸を口に引っぱってかける・外す動きの状態と判定 (P2b T2b-03b)。DOM に触らない純粋な関数。
 * 座標は start・current が画面 (指) の座標、判定には盤面の論理座標を出して使う。
 * チーズを引っぱる動き (PU-07a) と同じ決まり: 8px 動かすと引っぱり、未満で離すと押すだけ。
 */

/** 動かし始めとみなす距離 (画面 px)。これ未満で離すと「押すだけ」 */
export const DRAG_THRESHOLD_PX = 8;

/** 引っぱっている糸を、指の点より上に離す距離 (画面 px。指で糸が隠れない) */
export const LIFT_MARGIN_PX = 24;

export type DragSource = { kind: 'cone'; sourceId: string } | { kind: 'lane'; spindle: number };

export interface DragState {
  source: DragSource;
  start: { x: number; y: number };
  current: { x: number; y: number };
  moved: boolean;
}

export type DragTarget = { kind: 'lane'; spindle: number } | { kind: 'cone'; sourceId: string } | { kind: 'box' } | null;

export type DropResult =
  | { kind: 'mount'; spindle: number; sourceId: string } // 箱の糸を口にかける
  | { kind: 'unmount'; spindle: number } // 口の糸を箱へ戻す
  | { kind: 'tap' } // 動かさずに離した (押すだけの操作)
  | { kind: 'cancel' }; // 元の所に戻す

export function beginDrag(source: DragSource, p: { x: number; y: number }): DragState {
  return { source, start: { ...p }, current: { ...p }, moved: false };
}

/** 指が動いた。start から 8px 以上離れたら moved (一度 moved になったら戻らない) */
export function moveDrag(s: DragState, p: { x: number; y: number }): DragState {
  const moved = s.moved || Math.hypot(p.x - s.start.x, p.y - s.start.y) >= DRAG_THRESHOLD_PX;
  return { ...s, current: { ...p }, moved };
}

/** 離したとき。target は離した所 (口・箱の糸・盤面の外は null) */
export function dropResult(s: DragState, target: DragTarget): DropResult {
  if (!s.moved) {
    return { kind: 'tap' };
  }
  if (s.source.kind === 'cone') {
    return target !== null && target.kind === 'lane' ? { kind: 'mount', spindle: target.spindle, sourceId: s.source.sourceId } : { kind: 'cancel' };
  }
  // 口の糸: 箱 (糸が無い所も含む箱の上) で離すと外す。外や別の口では元に戻す
  return target !== null && (target.kind === 'cone' || target.kind === 'box') ? { kind: 'unmount', spindle: s.source.spindle } : { kind: 'cancel' };
}

/** 盤面の点がどの口の列か (当たり判定は上の段から下の段までの列)。外れれば null */
export function laneAt(p: { x: number; y: number }, narrow: boolean, count: number): number | null {
  for (let i = 0; i < count; i++) {
    const a = laneArea(i, narrow);
    if (p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h) {
      return i;
    }
  }
  return null;
}

/** 箱の点がどの元の糸の上か。renderer と同じ並び (4個ずつ・cx = BOX.x + 26 + (k%4)*32) */
export function coneAt(p: { x: number; y: number }, puzzle: ItowariPuzzle, s: ItowariState): string | null {
  if (p.x < BOX.x || p.x > BOX.x + BOX.w || p.y < BOX.y || p.y > BOX.y + BOX.h) {
    return null;
  }
  const mounted = new Set(s.spindles.flatMap((sp) => sp.segments.map((seg) => seg.sourceId)));
  const avail = puzzle.sources.filter((src) => !mounted.has(src.id) && !s.used.includes(src.id));
  if (avail.length === 0) {
    return null;
  }
  const col = Math.round((p.x - BOX.x - 26) / 32);
  const row = Math.round((p.y - BOX.y - 62) / 52);
  if (col < 0 || col > 3 || row < 0 || row > 3) {
    return null;
  }
  return avail[row * 4 + col]?.id ?? null;
}
