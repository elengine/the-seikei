export type Layout = 'landscape' | 'portrait';

export interface ViewportSize {
  width: number; // CSS px
  height: number; // CSS px
}

/** 幅 >= 高さ なら landscape */
export function layoutOf(size: ViewportSize): Layout {
  return size.width >= size.height ? 'landscape' : 'portrait';
}

/**
 * 狭い・低い画面 (Fold のカバー画面など) の「詰めた形」にするか (PU-09a)。
 * 幅が 600px 未満、または高さが 560px 未満 (CSS px)。回転のたびに判定し直す。
 */
export function isCompact(width: number, height: number): boolean {
  return width < 600 || height < 560;
}

export interface StageFit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * 論理座標の盤面 (logicalW×logicalH) を、利用できる領域 (availW×availH) に
 * 縦横比を保って収める。scale は収まる最大の倍率。余白は左右または上下に均等に配る。純粋関数。
 */
export function fitStage(logicalW: number, logicalH: number, availW: number, availH: number): StageFit {
  const scale = Math.min(availW / logicalW, availH / logicalH);
  const drawnW = logicalW * scale;
  const drawnH = logicalH * scale;
  return {
    scale,
    offsetX: (availW - drawnW) / 2,
    offsetY: (availH - drawnH) / 2,
  };
}

/** visualViewport があればその幅高さ、なければ window.innerWidth/Height */
export function currentSize(): ViewportSize {
  const vv = (globalThis as { visualViewport?: { width: number; height: number } }).visualViewport;
  if (vv !== undefined) {
    return { width: vv.width, height: vv.height };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * サイズ・向きの変化を通知する。visualViewport の resize、window の resize と
 * orientationchange を監視し、同じフレーム内の複数の変化は requestAnimationFrame で
 * 1回にまとめる。戻り値で監視を解除する。
 */
export function onViewportChange(cb: (size: ViewportSize, layout: Layout) => void): () => void {
  let scheduled = false;
  let rafId: number | null = null;

  function fire(): void {
    if (scheduled) {
      return; // 同じフレーム内の複数の変化は1回にまとめる
    }
    scheduled = true;
    rafId = requestAnimationFrame(() => {
      scheduled = false;
      rafId = null;
      const size = currentSize();
      cb(size, layoutOf(size));
    });
  }

  const win = window;
  const vv = (globalThis as {
    visualViewport?: { addEventListener: (t: string, l: () => void) => void; removeEventListener: (t: string, l: () => void) => void };
  }).visualViewport;
  vv?.addEventListener('resize', fire);
  win.addEventListener('resize', fire);
  win.addEventListener('orientationchange', fire);

  return () => {
    vv?.removeEventListener('resize', fire);
    win.removeEventListener('resize', fire);
    win.removeEventListener('orientationchange', fire);
    // 予約済みのフレームも取り消す (解除後に cb が呼ばれないように)
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      scheduled = false;
    }
  };
}

/**
 * 文書のずれ (意図しないスクロール) を戻す (T1-21a-2・追加修正は A案)。
 * iPhone・iPad の standalone アプリでは、回転のときに iOS 自身が文書のスクロール位置を
 * 動かすことがある (WebKit 不具合 153852/220908。overflow: hidden でも防げない)。
 * - ずれていないときは動かさない (iOS が回転の再計算でページを滑り込ませる動きと競合しない)
 * - ずれたときだけ (0, 0) に戻し、100ミリ秒ごとに確認する (回転直後は iOS が大きさを
 *   段階的に変えるため、通知の後からずれることも見込む)
 * - ずれが無い状態が続いたら確認をやめる
 */
export function resetDocumentScroll(): void {
  window.scrollTo(0, 0); // ずれていなければ何も起こらない
  const INTERVAL_MS = 100;
  const MAX_MS = 600;
  let elapsedMs = 0;
  let cleanStreak = 0;
  const check = (): void => {
    if (window.scrollX !== 0 || window.scrollY !== 0) {
      window.scrollTo(0, 0); // 実際にずれたときだけ動かす
      cleanStreak = 0;
    } else {
      cleanStreak += 1;
    }
    elapsedMs += INTERVAL_MS;
    if (cleanStreak < 2 && elapsedMs < MAX_MS) {
      setTimeout(check, INTERVAL_MS);
    }
  };
  setTimeout(check, INTERVAL_MS);
}

/** 大きさの変化 (回転を含む) のたびに resetDocumentScroll を行う。戻り値は解除の関数 */
export function installScrollReset(): () => void {
  return onViewportChange(() => resetDocumentScroll());
}

/**
 * Canvas を CSS サイズ cssW×cssH で表示し、内部解像度を devicePixelRatio 倍にする。
 * 戻り値の ctx は、CSS px の座標で描けるよう setTransform 済み。
 * devicePixelRatio は 1〜3 の範囲に丸める。
 */
export function setupCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): CanvasRenderingContext2D {
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('canvas 2d context not available');
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
