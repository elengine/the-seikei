/**
 * 糸を口にかける・外す動きの状態と判定 (PU-16b)。DOM に触らない純粋な関数。
 * 座標は start・current が画面 (指) の座標。判定には、離した所が「どの口か・盤面の外か」を渡す。
 * クリール立てと同じ決まり: 8px 動かすと引っぱり、未満で離すと押すだけ。
 */

/** 動かし始めとみなす距離 (画面 px)。これ未満で離すと「押すだけ」 */
export const DRAG_THRESHOLD_PX = 8;

/** 引っぱっている糸を、指の点より上に離す距離 (画面 px。指で糸が隠れない) */
export const LIFT_MARGIN_PX = 24;

export type DragSource = { kind: 'box'; sourceId: string } | { kind: 'lane'; spindle: number };

export interface DragState {
  source: DragSource;
  start: { x: number; y: number };
  current: { x: number; y: number };
  moved: boolean;
}

/** 離した所。口の上 / 盤面の外 (箱の帯の方) / それ以外 (盤面の中の口でない所・測れない) は null */
export type DragTarget = { kind: 'lane'; spindle: number } | { kind: 'outside' } | null;

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

/** 離したとき。箱の糸は口の上で離すとかかる。口の糸は盤面の外で離すと外れる。それ以外は元に戻す */
export function dropResult(s: DragState, target: DragTarget): DropResult {
  if (!s.moved) {
    return { kind: 'tap' };
  }
  if (s.source.kind === 'box') {
    return target !== null && target.kind === 'lane' ? { kind: 'mount', spindle: target.spindle, sourceId: s.source.sourceId } : { kind: 'cancel' };
  }
  return target !== null && target.kind === 'outside' ? { kind: 'unmount', spindle: s.source.spindle } : { kind: 'cancel' };
}
