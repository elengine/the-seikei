import { beginDrag, moveDrag, dropResult, LIFT_MARGIN_PX } from './drag';
import type { DragState } from './drag';

/**
 * 元の糸の箱 (操作欄の段ボールの箱の帯) の引っぱり (PU-16b)。クリール立ての dragView と同じ決まり:
 * 箱の全体から始められる・箱の上の動きは向きに関係なくすべて引っぱり (帯の送りは専用のスクロールバー)・
 * 引っぱるチーズは指より上 (半径 + LIFT_MARGIN_PX)・動き始めてから pointer capture・pointercancel で戻る・
 * 取り残された押さえ (up も cancel も来なかった指) は新しい押さえで捨てる。
 * 押すだけ (8px 未満) で離すと、その糸をはかりに載せる (onTap)。
 * クリール立ての dragView は軸の番号 (クリールの座標) に結びついているので、糸割りは口の判定を laneAt で受ける形で別に持つ。
 */

export interface BoxDragOpts {
  /** 箱の帯を含む操作欄 (この中の .creel-box[data-source] から始める) */
  panel: HTMLElement;
  /** 画面の点 (チーズの位置) がどの口か。口の外は null */
  laneAt(clientX: number, clientY: number): number | null;
  /** 引っぱるチーズの色 */
  look(): { body: string; core: string };
  /** チーズの直径 (画面 px) */
  diameterPx(): number;
  /** 押すだけ: はかりに載せる */
  onTap(sourceId: string): void;
  /** 口に落とした: かける */
  onDrop(spindle: number, sourceId: string): void;
  /** 吸い付く先の口 (無ければ null) */
  onHover(spindle: number | null): void;
}

interface Active {
  pointerId: number;
  drag: DragState;
  target: Element;
  lift: number;
  layer: HTMLElement | null;
}

export function attachBoxDrag(opts: BoxDragOpts): { cancel(): void; destroy(): void } {
  let active: Active | null = null;
  let destroyed = false;

  function makeLayer(d: number): HTMLElement {
    const look = opts.look();
    const el = document.createElement('div');
    el.className = 'creel-drag';
    el.style.position = 'fixed';
    el.style.left = '0';
    el.style.top = '0';
    el.style.width = `${d}px`;
    el.style.height = `${d}px`;
    el.style.pointerEvents = 'none';
    el.style.zIndex = '2000';
    el.style.setProperty('--creel-drag-body', look.body);
    el.style.setProperty('--creel-drag-core', look.core);
    const core = document.createElement('span');
    core.className = 'creel-drag__core';
    const hole = document.createElement('span');
    hole.className = 'creel-drag__hole';
    core.appendChild(hole);
    el.appendChild(core);
    document.body.appendChild(el);
    return el;
  }

  function placeLayer(el: HTMLElement, cx: number, cy: number): void {
    const d = parseFloat(el.style.width);
    el.style.transform = `translate(${cx - d / 2}px, ${cy - d / 2}px)`;
  }

  /** 引っぱりを終える (重ねを消し、吸い付き表示を消す) */
  function finish(): void {
    active?.layer?.remove();
    active = null;
    opts.onHover(null);
  }

  function onDown(e: PointerEvent): void {
    if (destroyed || e.button !== 0) {
      return;
    }
    if (active !== null) {
      // 引っぱっている最中の別の指は無視する。up も cancel も届かないまま残った押さえ (動いていない) は捨てる
      if (active.layer !== null && e.pointerId !== active.pointerId) {
        return;
      }
      finish();
    }
    const target = e.target instanceof Element ? e.target : null;
    const box = target?.closest<HTMLElement>('.creel-box');
    if (target === null || box === null || box === undefined || !opts.panel.contains(box) || box.dataset.source === undefined) {
      return;
    }
    active = {
      pointerId: e.pointerId,
      drag: beginDrag({ kind: 'box', sourceId: box.dataset.source }, { x: e.clientX, y: e.clientY }),
      target,
      lift: opts.diameterPx() / 2 + LIFT_MARGIN_PX,
      layer: null,
    };
  }

  function onMove(e: PointerEvent): void {
    const a = active;
    if (a === null || e.pointerId !== a.pointerId) {
      return;
    }
    a.drag = moveDrag(a.drag, { x: e.clientX, y: e.clientY });
    if (!a.drag.moved) {
      return;
    }
    if (a.layer === null) {
      try {
        a.target.setPointerCapture(a.pointerId); // 引っぱりと決まった: 指が箱の外に出ても動きを受け取り続ける
      } catch {
        // 対応していない環境 (テスト等) では window の監視だけで動く
      }
      a.layer = makeLayer(opts.diameterPx());
    }
    placeLayer(a.layer, e.clientX, e.clientY - a.lift);
    opts.onHover(opts.laneAt(e.clientX, e.clientY - a.lift));
  }

  function onUp(e: PointerEvent): void {
    const a = active;
    if (a === null || e.pointerId !== a.pointerId) {
      return;
    }
    a.drag = moveDrag(a.drag, { x: e.clientX, y: e.clientY });
    const lane = a.drag.moved ? opts.laneAt(e.clientX, e.clientY - a.lift) : null;
    const result = dropResult(a.drag, lane !== null ? { kind: 'lane', spindle: lane } : null);
    finish();
    if (result.kind === 'tap' && a.drag.source.kind === 'box') {
      opts.onTap(a.drag.source.sourceId);
    } else if (result.kind === 'mount') {
      opts.onDrop(result.spindle, result.sourceId);
    }
  }

  function onCancel(e: PointerEvent): void {
    if (active !== null && e.pointerId === active.pointerId) {
      finish(); // 着信や通知で指が外れた: チーズは箱へ戻す (何も置かない)
    }
  }

  function onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      finish();
    }
  }

  opts.panel.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    cancel: finish,
    destroy(): void {
      destroyed = true;
      opts.panel.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('visibilitychange', onVisibility);
      finish();
    },
  };
}
