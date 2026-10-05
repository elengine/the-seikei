import type { StageFit } from '../../core/viewport/viewport';
import { SLAT_OVER } from './params';

/**
 * ドラム巻きの盤面の座標 (P2 T2-05)。
 * 論理座標は 1000×750。変換はクリール立てと同じ形で、このファイルだけで行う。
 */

/** 論理座標の幅 */
export const LOGICAL_W = 1000;
/** 論理座標の高さ */
export const LOGICAL_H = 750;

/** 区画: 左端にクリール、右端にドラム、あいだを広く (糸が切れる場所。PU-14c)。台と筬はあいだのドラム寄り */
/**
 * 縦の位置と高さは、論理の高さ H (750 以上。盤面のカードの縦横の割合に合わせて setLogicalHeight で決める。PU-14 追加修正)
 * に合わせて伸びる: クリールは y=50・高さ H−100、台とドラムは y=100・高さ H−150 (上の 100 はランプ・目盛り盤・桟のはみ出し)。
 * 画面の大きさが変わるたびに gameFrame の logicalHFor 経由で呼ばれる (同じ値を入れ直す)。
 */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const CREEL_AREA: Area = { x: 10, y: 50, w: 200, h: 650 };
export const TABLE_AREA: Area = { x: 460, y: 100, w: 120, h: 600 };
/** ドラムの左の縦木 (ピンの横木) の左の端の x (T2-10 追加修正。台と重ならないようにする) */
export const PIN_RAIL_X = 600;
export const DRUM_AREA: Area = { x: 620, y: 100, w: 370, h: 600 };
/** 上の余白 (目盛り盤と赤ランプ) */
export const TOP_AREA = { y: 0, h: 100 } as const;

/** クリール側の切れ端の x (まっすぐ横に進む区間の上。T2-10a) */
export const CREEL_END_X = 270;
/** ドラム側の切れ端の x (まっすぐ横に進む区間の上。クリール側との差は 60 以上。T2-10a) */
export const DRUM_END_X = 390;

/** 筬 (くし状の金具) の x (台の中央。T2-10a で 520 へ) */
export const REED_X = 520;
/** 帯のシートの半分の幅 (論理座標。糸がまとまる帯の幅) */
export const THREAD_SHEET_HALF = 30;

/** 筬が台の上に乗る高さ (論理座標。帯の中心から上へ) */
export const REED_RISE = 40;

/**
 * 目盛り盤の中心と半径 (論理座標)。ドラムの左下の外 (筬の右、ドラムの左の縦木の左)。
 * 中心の y は論理の高さ H に合わせて下へ動く (setLogicalHeight。PU-14 追加修正2)。
 */
export const DIAL_X = 568;
export let DIAL_Y = 690;
export const DIAL_R = 28;

/** ハサミのアイコンの大きさ (論理座標。64px 以上。T2-16c) */
export const SCISSORS_SIZE = 96;

/** 引っぱっているあいだ、ハサミは指の位置よりこれだけ上に出る (クリールの糸巻きと同じ。T2-16 その4b) */
export const SCISSORS_LIFT = SCISSORS_SIZE / 2 + 24;

/** ドラムの楕円の横ふくらみ (左右の端からはみ出す量・論理 px。T2-16 その3-4) */
export const DRUM_BULGE = 10;

/** ドラムの表面の弓なりの高さ (T2-16 その5)。中央が ARC_RISE だけ高い ∩ の山なり。x は論理座標・baseY はその部品の基準の高さ (ドラムの左右の端での高さ)。上の縁でも胴の途中でも下の端でも同じ向き。 */
export const ARC_RISE = 12;

export function surfaceY(x: number, baseY: number): number {
  const cx = DRUM_AREA.x + DRUM_AREA.w / 2;
  const radius = (DRUM_AREA.w + DRUM_BULGE * 2) / 2;
  const f = Math.sqrt(Math.max(0, 1 - ((x - cx) / radius) ** 2));
  return baseY - ARC_RISE * f;
}

/**
 * ハサミの置き場所 (T2-16 その4b)。いつもクリールの右下・筬の左下・盤の下のほう。
 * 帯の位置に依存しない。
 */
export function scissorsPos(): { x: number; y: number } {
  return { x: (CREEL_END_X + REED_X) / 2, y: LOGICAL_H - 70 };
}

/**
 * 糸の束 (筬からドラムへ向かう糸) の当たり判定 (T2-16c)。束の中心線から THREAD_SHEET_HALF + 10 以内なら true。
 */
export function scissorsHitsThread(p: { x: number; y: number }, current: number, sections: number): boolean {
  const ty = tableY(current, sections);
  const fx = REED_X;
  const fy = ty - REED_RISE;
  const tx2 = DRUM_AREA.x;
  const ty2 = ty;
  const dx = tx2 - fx;
  const dy = ty2 - fy;
  const len2 = dx * dx + dy * dy;
  const k = Math.max(0, Math.min(1, ((p.x - fx) * dx + (p.y - fy) * dy) / len2));
  const dist = Math.hypot(p.x - (fx + k * dx), p.y - (fy + k * dy));
  return dist <= THREAD_SHEET_HALF + 10;
}

/**
 * 筬の四角 (論理座標。T2-13a)。縦に立った枠: 幅は狭く、高さは糸の束 (THREAD_SHEET_HALF の
 * 2倍) より少し大きい。中心 x は REED_X、中心 y は今の帯の高さ (tableY) − REED_RISE。
 */
export function reedRect(current: number, sections: number): { x: number; y: number; w: number; h: number } {
  const w = 26;
  const h = THREAD_SHEET_HALF * 2 + 16;
  return { x: REED_X - w / 2, y: tableY(current, sections) - REED_RISE - h / 2, w, h };
}

/**
 * 糸 thread が筬を通る y (論理座標。T2-13a)。threadPath と筬の歯 (すき間に置く) の両方が使う。
 * 糸の束の幅の中で上下に並ぶ (端の糸が ±THREAD_SHEET_HALF)。
 */
export function reedThreadY(thread: number, threadCount: number, current: number, sections: number): number {
  const n = Math.max(1, threadCount);
  const k = n === 1 ? 0 : (thread / (n - 1)) * 2 - 1;
  return tableY(current, sections) - REED_RISE + THREAD_SHEET_HALF * k;
}

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

/** コーンの右の x (糸の線の始点) */
export const CONE_X = 150;

/**
 * 糸 thread の道筋の頂点 (折れ線)。糸の線を描く処理と、流れる印の位置 (pointOnPath) の
 * 両方が、この頂点を使う (T2-10a。位置がずれる不具合の防止。T2-07 追加修正2 の threadY と同じ考え)。
 * 順に: コーン → まっすぐ横に進む区間 (切れ端はこの区間の上) → 筬へ集まる区間 → 筬 → 今の帯。
 */
export function threadPath(
  thread: number,
  threadCount: number,
  current: number,
  sections: number,
): Array<{ x: number; y: number }> {
  const y0 = threadY(thread, threadCount);
  return [
    { x: CONE_X, y: y0 },
    { x: CREEL_END_X, y: y0 },
    { x: DRUM_END_X, y: y0 },
    { x: REED_X, y: reedThreadY(thread, threadCount, current, sections) },
    { x: DRUM_AREA.x, y: tableY(current, sections) },
  ];
}

/**
 * 糸の線 (threadPath の折れ線) の上の点 (論理座標)。
 * along 0..1 でコーンから今の帯まで、長さの割合で進む。流れる印を糸の上に置くのに使う。
 */
export function pointOnPath(
  thread: number,
  threadCount: number,
  along: number,
  current: number,
  sections: number,
): { x: number; y: number } {
  const pts = threadPath(thread, threadCount, current, sections);
  // 区間ごとの長さ
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y);
    lens.push(d);
    total += d;
  }
  let dist = Math.min(1, Math.max(0, along)) * total;
  for (let i = 0; i + 1 < pts.length; i++) {
    if (dist <= lens[i]! || i + 2 === pts.length) {
      const k = lens[i]! === 0 ? 0 : Math.min(1, dist / lens[i]!);
      return {
        x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * k,
        y: pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * k,
      };
    }
    dist -= lens[i]!;
  }
  return pts[pts.length - 1]!;
}

/**
 * 糸 thread (0〜threadCount-1) の縦の位置 (論理座標)。
 * 描く位置 (renderer) と当たりの位置 (endPoint) は、この関数だけで決める
 * (T2-07 追加修正2。位置がずれる不具合の防止)。
 */
export function threadY(thread: number, threadCount: number): number {
  const n = Math.max(1, threadCount);
  // クリールの高さいっぱい (上下の 6% を除く) に等間隔に広げる (PU-14c)
  const top = CREEL_AREA.y + CREEL_AREA.h * 0.06;
  const bottom = CREEL_AREA.y + CREEL_AREA.h * 0.94;
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
  // threadPath の、まっすぐ横に進む区間 (頂点1〜2のあいだ) の上の点 (T2-10a)
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

/** クリールの糸道の印 (テンションの皿) の x。renderer の皿と同じ位置 (T2-13c) */
export const THREAD_MARK_X = 94;

/** 点と線分の距離 */
function distToSeg(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/**
 * 切れた糸のあたりの判定 (T2-13c)。クリールの糸道の印から筬までの糸の区間
 * (横の範囲 x は THREAD_MARK_X〜REED_X) の中で、押した点にいちばん近い糸を返す。
 * 糸の線までの距離が画面上 40px 以内なら当たり。
 * 切れている糸が近くにあればその糸、切れていない糸しか近くなければその糸
 * (呼び出し側が wrongThread にする)。区間の外や遠くは null。
 * current は 0 (巻いている帯の先頭) を基準にする (broken のあいだは current は動かない)。
 */
export function hitBrokenThread(
  p: { x: number; y: number },
  brokenThreads: number[],
  threadCount: number,
  scale: number,
  current = 0,
  sections = 1,
): number | null {
  // 区間の外は当たらない
  if (p.x < THREAD_MARK_X || p.x > REED_X) {
    return null;
  }
  const radius = 40 / scale; // 画面上 40px の論理距離
  const nearest = (cands: number[]): { thread: number; d: number } | null => {
    let best: { thread: number; d: number } | null = null;
    for (const t of cands) {
      const path = threadPath(t, threadCount, current, sections);
      let min = Infinity;
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i]!;
        const b = path[i + 1]!;
        // 区間の左の外は始点で打ち切る (糸は CONE_X から始まる)
        if (b.x < THREAD_MARK_X) continue;
        const ax = Math.max(a.x, THREAD_MARK_X);
        min = Math.min(min, distToSeg(p, { x: ax, y: a.y }, b));
      }
      if (min <= radius && (best === null || min < best.d)) {
        best = { thread: t, d: min };
      }
    }
    return best;
  };
  // 1. 切れている糸のうち、いちばん近い糸
  const hitBroken = nearest(brokenThreads);
  if (hitBroken !== null) {
    return hitBroken.thread;
  }
  // 2. 切れていない糸が近ければその糸 (呼び出し側が wrongThread にする)
  const all: number[] = [];
  for (let t = 0; t < threadCount; t++) {
    if (!brokenThreads.includes(t)) all.push(t);
  }
  const hitOther = nearest(all);
  return hitOther === null ? null : hitOther.thread;
}

/** 画面上で screenPx になる論理サイズ (文字などを画面 px で出すための逆数) */
export function fontPx(fit: StageFit, screenPx: number): number {
  return screenPx / fit.scale;
}


/** 論理の高さの下限 (幅 1000 に対する標準の 4:3) と上限 */
const LOGICAL_H_MIN = 750;
const LOGICAL_H_MAX = 1400;

/** 盤面のカードの大きさ (画面 px) から、論理の高さを決める。横長のカードは 750、縦に近い・正方形に近いカードは 1000 × 高さ / 幅 (幅いっぱいに使うと高さも使い切れる)。測れないとき (0) は 750 */
export function logicalHeightFor(cardW: number, cardH: number): number {
  if (!(cardW > 0) || !(cardH > 0)) {
    return LOGICAL_H_MIN;
  }
  return Math.min(LOGICAL_H_MAX, Math.max(LOGICAL_H_MIN, (LOGICAL_W * cardH) / cardW));
}

/** 論理の高さ H に合わせて、クリール・台・ドラムの縦の位置と高さを決める (同じ値なら何も変わらない) */
export function setLogicalHeight(height: number): void {
  const H = Math.min(LOGICAL_H_MAX, Math.max(LOGICAL_H_MIN, height));
  CREEL_AREA.y = 50;
  CREEL_AREA.h = H - 100;
  TABLE_AREA.y = 100;
  TABLE_AREA.h = H - 150;
  DRUM_AREA.y = 100;
  DRUM_AREA.h = H - 150;
  DIAL_Y = H - 60;
}

/** 桟のはみ出し (SLAT_OVER)・竿のはみ出し (16) を含む、描く範囲の上と下 (論理座標) */
export function machineExtent(): { top: number; bottom: number } {
  return {
    top: Math.min(CREEL_AREA.y, DRUM_AREA.y - SLAT_OVER),
    bottom: Math.max(CREEL_AREA.y + CREEL_AREA.h, DRUM_AREA.y + DRUM_AREA.h + 16),
  };
}
