/**
 * 専用のスクロールバー (PU-20a)。溝 (track) とつまみ (thumb) だけの部品で、スクロールする要素そのものは持たない。
 * 呼び出し側が update({ view, total, pos }) で今の状態 (見えている大きさ・全体の大きさ・位置) を渡し、
 * 利用者が操作したときは onChange(新しい位置) で知らせる。
 * - つまみの長さ = 見えている割合。つまみを引っぱると、その分だけ位置が変わる。
 * - 溝を押すと、その向きへ 1 画面分 (view) 送る。
 * - 全部見えているとき (total が view 以下) は出さない (hidden)。
 * - 押せる太さは 64px 以上 (CSS の .scrollbar--x の高さ・.scrollbar--y の幅)。見た目の溝は細い。
 */

export interface ScrollBarMetrics {
  /** 見えている大きさ (px) */
  view: number;
  /** 全体の大きさ (px) */
  total: number;
  /** 今の位置 (px。0〜total − view) */
  pos: number;
}

export interface ScrollBar {
  root: HTMLElement;
  update(m: ScrollBarMetrics): void;
  destroy(): void;
}

/** つまみの長さの下限 (溝に対する割合 %。全体がとても長くても、つまみが指でつかめる長さを保つ) */
const MIN_THUMB_PCT = 10;

export function createScrollBar(opts: {
  orientation: 'x' | 'y';
  onChange: (pos: number) => void;
  ariaLabel: string;
}): ScrollBar {
  const horizontal = opts.orientation === 'x';
  const root = document.createElement('div');
  root.classList.add('scrollbar', `scrollbar--${opts.orientation}`);
  root.setAttribute('role', 'scrollbar');
  root.setAttribute('aria-orientation', horizontal ? 'horizontal' : 'vertical');
  root.setAttribute('aria-label', opts.ariaLabel);
  root.hidden = true;
  const thumb = document.createElement('div');
  thumb.classList.add('scrollbar__thumb');
  const grip = document.createElement('span'); // 握りの印 (縦線。色だけに頼らない)
  grip.classList.add('scrollbar__grip');
  thumb.appendChild(grip);
  root.appendChild(thumb);

  let m: ScrollBarMetrics = { view: 0, total: 0, pos: 0 };
  let drag: { pointerId: number; startCoord: number; startPos: number } | null = null;

  const range = (): number => Math.max(0, m.total - m.view);
  const thumbPct = (): number => (m.total > 0 ? Math.min(100, Math.max(MIN_THUMB_PCT, (m.view / m.total) * 100)) : 100);
  const clamp = (pos: number): number => Math.min(range(), Math.max(0, pos));

  /** 溝の長さ (px)。測れない (0) ときは 0 */
  function trackPx(): number {
    const r = root.getBoundingClientRect();
    return horizontal ? r.width : r.height;
  }

  function paint(): void {
    root.hidden = !(m.total > m.view + 1);
    const size = thumbPct();
    const offset = range() > 0 ? (clamp(m.pos) / range()) * (100 - size) : 0;
    if (horizontal) {
      thumb.style.width = `${size}%`;
      thumb.style.left = `${offset}%`;
    } else {
      thumb.style.height = `${size}%`;
      thumb.style.top = `${offset}%`;
    }
    root.setAttribute('aria-valuemin', '0');
    root.setAttribute('aria-valuemax', String(Math.round(range())));
    root.setAttribute('aria-valuenow', String(Math.round(clamp(m.pos))));
  }

  const coord = (e: PointerEvent): number => (horizontal ? e.clientX : e.clientY);

  function onMove(e: PointerEvent): void {
    if (drag === null || e.pointerId !== drag.pointerId) {
      return;
    }
    const track = trackPx();
    const movable = track - (track * thumbPct()) / 100; // つまみが動ける長さ (px)
    if (!(movable > 0) || !(range() > 0)) {
      return;
    }
    opts.onChange(clamp(drag.startPos + ((coord(e) - drag.startCoord) / movable) * range()));
  }

  function stopDrag(e: PointerEvent): void {
    if (drag !== null && e.pointerId === drag.pointerId) {
      drag = null;
      removeWindowListeners();
    }
  }

  function removeWindowListeners(): void {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', stopDrag);
    window.removeEventListener('pointercancel', stopDrag);
  }

  function onDown(e: PointerEvent): void {
    if (e.button !== 0 || !(range() > 0)) {
      return;
    }
    const onThumb = e.target instanceof Node && thumb.contains(e.target);
    if (onThumb) {
      drag = { pointerId: e.pointerId, startCoord: coord(e), startPos: clamp(m.pos) };
      try {
        thumb.setPointerCapture(e.pointerId);
      } catch {
        // 対応していない環境 (テスト等) では window の監視だけで動く
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', stopDrag);
      window.addEventListener('pointercancel', stopDrag);
      return;
    }
    // 溝を押した: つまみより前なら 1 画面分戻り、後ろなら 1 画面分進む
    const r = root.getBoundingClientRect();
    const track = horizontal ? r.width : r.height;
    const at = coord(e) - (horizontal ? r.left : r.top);
    const thumbStart = (track * ((clamp(m.pos) / range()) * (100 - thumbPct()))) / 100;
    const thumbEnd = thumbStart + (track * thumbPct()) / 100;
    if (at < thumbStart) {
      opts.onChange(clamp(m.pos - m.view));
    } else if (at > thumbEnd) {
      opts.onChange(clamp(m.pos + m.view));
    }
  }

  root.addEventListener('pointerdown', onDown);

  return {
    root,
    update(next: ScrollBarMetrics): void {
      m = next;
      paint();
    },
    destroy(): void {
      root.removeEventListener('pointerdown', onDown);
      removeWindowListeners();
      drag = null;
      root.remove();
    },
  };
}
