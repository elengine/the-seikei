import type { StageFit } from '../../core/viewport/viewport';

/**
 * ドラム巻きの盤面の座標 (P2 T2-05)。
 * 論理座標は 1000×750。変換はクリール立てと同じ形で、このファイルだけで行う。
 */

/** 論理座標の幅 */
export const LOGICAL_W = 1000;
/** 論理座標の高さ */
export const LOGICAL_H = 750;

/** 区画: 左にクリール、中央に台とレール、右にドラム */
export const CREEL_AREA = { x: 40, y: 90, w: 200, h: 600 } as const;
export const TABLE_AREA = { x: 260, y: 90, w: 300, h: 600 } as const;
export const DRUM_AREA = { x: 580, y: 90, w: 380, h: 600 } as const;
/** 上の余白 (目盛り盤と赤ランプ) */
export const TOP_AREA = { y: 0, h: 90 } as const;

/** クリール側の切れ端の x (台の左) */
export const CREEL_END_X = 380;
/** ドラム側の切れ端の x (台の右) */
export const DRUM_END_X = 460;
/** 切れ端の縦の範囲 (台の中) */
const END_Y_TOP = 300;
const END_Y_BOTTOM = 620;

/** 論理座標 → 画面 (Canvas) 座標 */
export function toPx(fit: StageFit, p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: p.x * fit.scale + fit.offsetX,
    y: p.y * fit.scale + fit.offsetY,
  };
}

/** 画面 (Canvas) 座標 → 論理座標 */
export function fromPx(fit: StageFit, p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (p.x - fit.offsetX) / fit.scale,
    y: (p.y - fit.offsetY) / fit.scale,
  };
}

/**
 * 糸 thread (0〜threadCount-1) の、クリール側とドラム側の切れ端の位置 (論理座標)。
 * 糸は上から下へ等間隔に並ぶ。
 */
export function endPoint(thread: number, side: 'creel' | 'drum', threadCount: number): { x: number; y: number } {
  const n = Math.max(1, threadCount);
  const y = END_Y_TOP + ((END_Y_BOTTOM - END_Y_TOP) * thread) / (n - 1 || 1);
  return { x: side === 'creel' ? CREEL_END_X : DRUM_END_X, y };
}

/**
 * 画面上の点 (論理座標) から、いちばん近い切れ端を返す。
 * 画面上で 32px (= 64px 四方の半分) より遠ければ null。
 * 隣の糸の当たりと重なるときは、いちばん近い端を選ぶ。
 */
export function hitEnd(
  p: { x: number; y: number },
  threadCount: number,
  scale: number,
): { thread: number; side: 'creel' | 'drum' } | null {
  const radiusLogical = 32 / scale; // 画面上 32px の論理距離
  let best: { thread: number; side: 'creel' | 'drum'; d: number } | null = null;
  for (let t = 0; t < threadCount; t++) {
    for (const side of ['creel', 'drum'] as const) {
      const e = endPoint(t, side, threadCount);
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d <= radiusLogical && (best === null || d < best.d)) {
        best = { thread: t, side, d };
      }
    }
  }
  return best === null ? null : { thread: best.thread, side: best.side };
}

/** 画面上で screenPx になる論理サイズ (文字などを画面 px で出すための逆数) */
export function fontPx(fit: StageFit, screenPx: number): number {
  return screenPx / fit.scale;
}
