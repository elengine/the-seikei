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
/** 切れ端の縦の範囲 (台の中)。糸の縦の位置はこの範囲で threadY が決める */
const END_Y_TOP = 300;
const END_Y_BOTTOM = 620;

/** 筬 (くし状の金具) の x (台の中央) */
export const REED_X = 410;
/** 帯のシートの半分の幅 (論理座標。糸がまとまる帯の幅) */
export const THREAD_SHEET_HALF = 30;

/** 筬が台の上に乗る高さ (論理座標。帯の中心から上へ) */
export const REED_RISE = 40;

/**
 * 帯 i (0〜sections-1) の区画の上端の y (論理座標)。
 * ドラムは軸を縦にして (T2-08 追加修正a)、帯は上から下へ等分して並ぶ。
 */
export function drumSectionY(i: number, sections: number): number {
  const n = Math.max(1, sections);
  return DRUM_AREA.y + ((DRUM_AREA.h) * i) / n;
}

/**
 * 台と筬の縦の位置 (今の帯の区画の中心)。実物どおり、帯を巻き終えると台が隣の区画へ送られる。
 * current は小数も可 (結びの演出で台がなめらかに動く)。
 */
export function tableY(current: number, sections: number): number {
  const cur = Math.min(sections - 1, Math.max(0, current));
  return (drumSectionY(cur, sections) + drumSectionY(cur + 1, sections)) / 2;
}

/**
 * 糸の線 (コーン → クリール側の切れ端 → 筬 → 今の帯) の上の点 (論理座標)。
 * along 0..1 でコーンから今の帯まで進む。流れる印を糸の上に置くのに使う。
 */
export function pointOnPath(
  thread: number,
  threadCount: number,
  along: number,
  current: number,
  sections: number,
): { x: number; y: number } {
  const y0 = threadY(thread, threadCount);
  const yTarget = tableY(current, sections);
  // 道のり: コーン (x 180) → クリール側の切れ端 (380) → 筬 (410) → ドラムの縁 (580)
  const xs = [180, CREEL_END_X, REED_X, DRUM_AREA.x];
  const total = xs[xs.length - 1]! - xs[0]!;
  const dist = Math.min(1, Math.max(0, along)) * total;
  if (dist <= xs[1]! - xs[0]!) {
    // 区間1: コーン → クリール側 (糸は threadY の高さを進む)
    return { x: xs[0]! + dist, y: y0 };
  }
  if (dist <= xs[2]! - xs[0]!) {
    // 区間2: クリール側 → 筬 (糸は筬の帯の幅に集まる)
    const k = (dist - (xs[1]! - xs[0]!)) / (xs[2]! - xs[1]!);
    const half = THREAD_SHEET_HALF * ((thread / Math.max(1, threadCount - 1)) * 2 - 1);
    return { x: xs[1]! + k * (xs[2]! - xs[1]!), y: y0 + (half - y0) * k };
  }
  // 区間3: 筬 → 今の帯 (横向きに帯の高さへ。筬の y は台の上の少し手前)
  const k = (dist - (xs[2]! - xs[0]!)) / (xs[3]! - xs[2]!);
  const half = THREAD_SHEET_HALF * ((thread / Math.max(1, threadCount - 1)) * 2 - 1);
  const reedY = yTarget - REED_RISE;
  return { x: xs[2]! + k * (xs[3]! - xs[2]!), y: (reedY + half) * (1 - k) + yTarget * k };
}

/**
 * 糸 thread (0〜threadCount-1) の縦の位置 (論理座標)。
 * 描く位置 (renderer) と当たりの位置 (endPoint) は、この関数だけで決める
 * (T2-07 追加修正2。位置がずれる不具合の防止)。
 */
export function threadY(thread: number, threadCount: number): number {
  const n = Math.max(1, threadCount);
  const top = END_Y_TOP;
  const bottom = END_Y_BOTTOM;
  return top + ((bottom - top) * thread) / (n - 1 || 1);
}

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
  return { x: side === 'creel' ? CREEL_END_X : DRUM_END_X, y: threadY(thread, threadCount) };
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
