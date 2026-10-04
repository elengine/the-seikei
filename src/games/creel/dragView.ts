import type { YarnTypeId } from '../../core/domain/types';
import type { StageFit } from '../../core/viewport/viewport';
import { beginDrag, moveDrag, dropResult, liftFor, isDragGesture } from './drag';
import type { DragSource, DragState, DropResult } from './drag';
import { CREEL_AREA, fromPx, hitTest, pegCenter, toPx } from './geometry';

/**
 * チーズを引っぱって置く・外す動きの画面まわり (PU-07b)。pointer イベントを受け、引っぱっているチーズを
 * 画面全体の上の重ね (position: fixed) で描く。盤面 (Canvas) と操作欄 (DOM) の両方の上を通れる。
 * 判定は drag.ts の純粋な関数で行い、結果は opts のコールバックで呼び出し側 (controller) に渡す。
 * 重ねは、離したとき・取り消し・pointercancel・裏に回ったとき・destroy で必ず消す。
 */

/** 引っぱるチーズの直径の下限 (画面 px) */
const MIN_DIAMETER_PX = 48;
/** 軸へ吸い込まれる動きの長さ / 箱へ戻る動きの長さ (ミリ秒) */
const SUCK_MS = 150;
const RETURN_MS = 200;

export interface DragLook {
  body: string; // 糸の色
  core: string; // 紙の芯の色
}

export interface DragViewOpts {
  stage: HTMLCanvasElement; // 盤面 (touch-action: none は CSS)
  panel: HTMLElement; // 箱を含む操作欄
  rows: number;
  cols: number;
  fit(): StageFit;
  placedAt(index: number): YarnTypeId | null;
  look(yarn: YarnTypeId): DragLook;
  diameterPx(): number; // チーズの直径 (画面 px)
  onPress(index: number): void; // 盤面を押すだけ (動かさずに離した)
  onDrop(result: DropResult, yarn: YarnTypeId): void; // place / remove / move (cancel・tap は渡さない)
  onHover(snap: number | null, lifted: number | null): void; // 吸い付く先の軸と、持ち上げている軸 (無ければ null)
}

interface Active {
  pointerId: number;
  drag: DragState;
  yarn: YarnTypeId | null; // 引っぱるチーズの糸 (空の軸を押しただけなら null)
  target: Element;
  origin: HTMLElement | null; // 箱の要素 (戻る先)
  scrollAxis: 'x' | 'y' | null; // 箱の列を送れる向き (詰めた形)。最初の動きがこの向きなら、引っぱらず送る
  lift: number; // チーズを指より上に出す量 (画面 px。チーズの半径 + 24px)
  pressIndex: number | null; // 盤面を押した軸
  layer: HTMLElement | null;
}

export function attachDrag(opts: DragViewOpts): { cancel(): void; destroy(): void } {
  let active: Active | null = null;
  let destroyed = false;
  const layers = new Set<HTMLElement>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  /** 画面の点 → 盤面の論理座標 (Canvas の中なら)。外なら null */
  function logicalOf(x: number, y: number): { x: number; y: number } | null {
    const rect = opts.stage.getBoundingClientRect();
    const cx = x - rect.left;
    const cy = y - rect.top;
    if (cx < 0 || cy < 0 || cx >= rect.width || cy >= rect.height) {
      return null;
    }
    return fromPx(opts.fit(), { x: cx, y: cy });
  }

  /** 離した所 (チーズの位置 = 指より lift 上)。クリールの枠の中なら論理座標、外なら null */
  function dropPoint(p: { x: number; y: number }, lift: number): { x: number; y: number } | null {
    const l = logicalOf(p.x, p.y - lift);
    if (l === null) {
      return null;
    }
    const inside =
      l.x >= CREEL_AREA.x && l.x < CREEL_AREA.x + CREEL_AREA.w && l.y >= CREEL_AREA.y && l.y < CREEL_AREA.y + CREEL_AREA.h;
    return inside ? l : null;
  }

  function pegScreen(index: number): { x: number; y: number } {
    const rect = opts.stage.getBoundingClientRect();
    const c = toPx(opts.fit(), pegCenter(index, opts.rows, opts.cols));
    return { x: rect.left + c.x, y: rect.top + c.y };
  }

  function makeLayer(yarn: YarnTypeId, d: number): HTMLElement {
    const look = opts.look(yarn);
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
    layers.add(el);
    return el;
  }

  function placeLayer(el: HTMLElement, cx: number, cy: number): void {
    const d = parseFloat(el.style.width);
    el.style.transform = `translate(${cx - d / 2}px, ${cy - d / 2}px)`;
  }

  function dropLayer(el: HTMLElement): void {
    layers.delete(el);
    el.remove();
  }

  /** 重ねを指定の位置へ動かしてから消す (吸い込まれる / 箱へ戻る / 外れる) */
  function settle(el: HTMLElement, to: { x: number; y: number } | null, ms: number): void {
    el.style.transition = `transform ${ms}ms ease-out, opacity ${ms}ms ease-out`;
    if (to === null) {
      el.style.opacity = '0';
    } else {
      placeLayer(el, to.x, to.y);
    }
    const t = setTimeout(() => {
      timers.delete(t);
      dropLayer(el);
    }, ms + 20);
    timers.add(t);
  }

  function originPoint(a: Active): { x: number; y: number } | null {
    if (a.origin !== null) {
      const r = a.origin.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return a.drag.source.kind === 'peg' ? pegScreen(a.drag.source.index) : null;
  }

  function finish(a: Active, to: { x: number; y: number } | null, ms: number): void {
    if (a.layer !== null) {
      settle(a.layer, to, ms);
    }
    active = null;
    opts.onHover(null, null);
  }

  /** 引っぱりを取り消す (何も変えず、チーズは元の所へ戻る) */
  function cancel(): void {
    if (active === null) {
      return;
    }
    const a = active;
    finish(a, originPoint(a), RETURN_MS);
  }

  function onDown(e: PointerEvent): void {
    if (destroyed || e.button !== 0) {
      return;
    }
    if (active !== null) {
      // 引っぱっている最中の 2 本目の指は無視する。ただし、前の指がまだチーズを出していない (離した・取り消しの知らせが
      // 届かないまま残った) ときと、同じ番号の押さえがもう一度来たときは、前のを捨てて新しく始める
      if (active.layer !== null && e.pointerId !== active.pointerId) {
        return;
      }
      if (active.layer !== null) {
        cancel();
      }
      active = null;
    }
    const target = e.target instanceof Element ? e.target : null;
    if (target === null) {
      return;
    }
    let source: DragSource | null = null;
    let yarn: YarnTypeId | null = null;
    let origin: HTMLElement | null = null;
    let pressIndex: number | null = null;
    let scrollAxis: 'x' | 'y' | null = null;
    const boxEl = target.closest<HTMLElement>('.creel-box');
    if (boxEl !== null && opts.panel.contains(boxEl) && boxEl.dataset.yarn !== undefined) {
      yarn = boxEl.dataset.yarn;
      source = { kind: 'box', yarn };
      origin = boxEl;
      const axis = boxEl.parentElement?.dataset.scroll;
      scrollAxis = axis === 'x' || axis === 'y' ? axis : null;
    } else if (target === opts.stage) {
      const l = logicalOf(e.clientX, e.clientY);
      const hit = l === null ? null : hitTest(l, opts.rows, opts.cols);
      if (hit === null) {
        return;
      }
      pressIndex = hit;
      yarn = opts.placedAt(hit);
      source = { kind: 'peg', index: hit };
    }
    if (source === null) {
      return;
    }
    // setPointerCapture は、引っぱりと決まってから (onMove) 行う。箱を横に送る動きをブラウザに任せるため
    active = {
      pointerId: e.pointerId,
      drag: beginDrag(source, { x: e.clientX, y: e.clientY }),
      yarn,
      target,
      origin,
      scrollAxis,
      lift: liftFor(Math.max(MIN_DIAMETER_PX, opts.diameterPx())),
      pressIndex,
      layer: null,
    };
  }

  function onMove(e: PointerEvent): void {
    const a = active;
    if (a === null || e.pointerId !== a.pointerId) {
      return;
    }
    const wasMoved = a.drag.moved;
    a.drag = moveDrag(a.drag, { x: e.clientX, y: e.clientY });
    if (!a.drag.moved || a.yarn === null) {
      return; // 動かすまで (8px 未満) と、空の軸を押しているだけのときは引っぱらない
    }
    if (!wasMoved && a.scrollAxis !== null) {
      // 最初の 8px の動きの向きで、箱の列を送る (スクロール) か、チーズを引っぱるかを決める
      const scrolling = !isDragGesture(a.scrollAxis, a.drag.current.x - a.drag.start.x, a.drag.current.y - a.drag.start.y);
      if (scrolling) {
        active = null; // この指はブラウザに任せる
        return;
      }
    }
    if (a.layer === null) {
      try {
        a.target.setPointerCapture(a.pointerId); // 引っぱりと決まった: 指が盤面や操作欄から出ても、動きを受け取り続ける
      } catch {
        // 対応していない環境 (テスト等) では window の監視だけで動く
      }
      a.layer = makeLayer(a.yarn, Math.max(MIN_DIAMETER_PX, opts.diameterPx()));
    }
    placeLayer(a.layer, e.clientX, e.clientY - a.lift);
    const l = dropPoint(a.drag.current, a.lift);
    const hit = l === null ? null : hitTest(l, opts.rows, opts.cols);
    const lifted = a.drag.source.kind === 'peg' ? a.drag.source.index : null;
    opts.onHover(hit !== null && hit !== lifted ? hit : null, lifted);
  }

  function onUp(e: PointerEvent): void {
    const a = active;
    if (a === null || e.pointerId !== a.pointerId) {
      return;
    }
    a.drag = moveDrag(a.drag, { x: e.clientX, y: e.clientY });
    if (a.yarn === null && a.pressIndex === null) {
      active = null;
      return;
    }
    const result = dropResult(a.drag, dropPoint(a.drag.current, a.lift), opts.rows, opts.cols);
    if (result.kind === 'tap') {
      active = null;
      opts.onHover(null, null);
      if (a.pressIndex !== null) {
        opts.onPress(a.pressIndex);
      }
      return;
    }
    if (a.yarn === null) {
      finish(a, null, RETURN_MS); // 空の軸を動かしただけ
      return;
    }
    // 盤面の状態を先に変えてから、重ねを動かして消す
    opts.onHover(null, null);
    if (result.kind === 'cancel') {
      finish(a, originPoint(a), RETURN_MS);
      return;
    }
    opts.onDrop(result, a.yarn);
    if (result.kind === 'remove') {
      finish(a, null, SUCK_MS);
    } else {
      const index = result.kind === 'place' ? result.index : result.to;
      finish(a, pegScreen(index), SUCK_MS);
    }
  }

  function onCancel(e: PointerEvent): void {
    if (active !== null && e.pointerId === active.pointerId) {
      cancel(); // 着信や通知で指が外れた: チーズは箱へ戻す
    }
  }

  function onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      cancel();
    }
  }

  opts.stage.addEventListener('pointerdown', onDown);
  opts.panel.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    cancel,
    destroy(): void {
      destroyed = true;
      opts.stage.removeEventListener('pointerdown', onDown);
      opts.panel.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const t of timers) {
        clearTimeout(t);
      }
      timers.clear();
      for (const el of layers) {
        el.remove();
      }
      layers.clear();
      active = null;
    },
  };
}
