import { SPINDLES } from './params';
import type { ItowariPuzzle } from './puzzles';

/**
 * 糸割りの盤面の座標 (PU-16a)。盤面は画面 px で配置する (盤面のカードの大きさ w×h から決める)。
 * お題で使う口だけを大きく並べる (縦長は 3 列 × 2 段など。1 口の幅は 96px 以上)。
 * 各口は上から 元の糸 → 巻くコーン → 設定した長さ。盤面の上の端に 1 行、メーターとはかりの数字を出す。
 * 元の糸の箱は盤面に描かない (操作欄の段ボールの箱の帯。クリール立てと同じ)。
 */

/** 盤面の論理座標の幅 (枠に渡す。カードの縦横の割合に合わせた高さと組で、拡大率はカードの幅 ÷ 1000) */
export const BOARD_W = 1000;

/** 盤面の上の端の行 (メーターとはかり) の高さ (px) */
export const HEADER_H = 44;

/** 1 口の幅の最小 (画面 px)。これ以上になる列数を選べるなら、その中から選ぶ */
export const LANE_MIN_W = 96;

/** 盤面の外側の余白 (px) */
const MARGIN = 4;
/** 口の中の余白 (px) */
const PAD = 6;
/** 口の幅 ÷ 高さ の理想 (これより細長ければ列を減らす・平たければ段を減らす目安) */
const IDEAL_ASPECT = 0.62;

/** 口の中の絵の高さ (avail) がこれ未満の口は、元の糸と巻くコーンを左右に並べる (px) */
const TIGHT_AVAIL = 70;

/** 長さの文字 (1 本のとき) の見える高さと、押せる当たりの高さ (px)。当たりは上へ広げる */
const TEXT_H1 = 28;
const HIT_H1 = 48;
/** 継ぐ糸のある口の長さの文字は 2 行 (1 行ごとの高さ) */
const TEXT_H2 = 30;

/** 盤面の論理の高さ。カードの縦横の割合に合わせる (幅 1000 のまま)。測れないとき (0) は 750 */
export function boardHeightFor(cardW: number, cardH: number): number {
  if (!(cardW > 0) || !(cardH > 0)) {
    return 750;
  }
  return (BOARD_W * cardH) / cardW;
}

/**
 * お題で使う口の数。split はチーズの数か 12 の小さいほう。
 * refill は、作る本数 (要る本数 − 残りの本数) + 2 (元のコーンをかける余裕) を 12 まで。
 */
export function lanesFor(p: ItowariPuzzle): number {
  const n = p.kind === 'split' ? p.sources.length : Math.max(1, p.needCount - p.sources.length) + 2;
  return Math.min(SPINDLES, Math.max(1, n));
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 口の並び */
export interface BoardLayout {
  w: number;
  h: number;
  /** 使う口の数 */
  n: number;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
}

/**
 * n 口を、カード w×h の中に並べる。口の幅が LANE_MIN_W 以上になる列数があればその中から、
 * 無ければ全部の中から、口の大きさ (幅 ÷ 理想の割合 と 高さ の小さいほう) が最大のものを選ぶ。同じなら段が少ないほう。
 */
export function layoutFor(n: number, w: number, h: number): BoardLayout {
  const areaW = Math.max(1, w - 2 * MARGIN);
  const areaH = Math.max(1, h - HEADER_H - MARGIN);
  const options: Array<BoardLayout & { score: number }> = [];
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = areaW / cols;
    const cellH = areaH / rows;
    options.push({ w, h, n, cols, rows, cellW, cellH, score: Math.min(cellW / IDEAL_ASPECT, cellH) });
  }
  const wide = options.filter((o) => o.cellW >= LANE_MIN_W);
  const pool = wide.length > 0 ? wide : options;
  let best = pool[0]!;
  for (const o of pool) {
    if (o.score > best.score + 0.5 || (Math.abs(o.score - best.score) <= 0.5 && o.rows < best.rows)) {
      best = o;
    }
  }
  const { score: _score, ...layout } = best;
  void _score;
  return layout;
}

/** 口 i の枠 (画面 px) */
export function cellRect(l: BoardLayout, i: number): Rect {
  const col = i % l.cols;
  const row = Math.floor(i / l.cols);
  return { x: MARGIN + col * l.cellW, y: HEADER_H + row * l.cellH, w: l.cellW, h: l.cellH };
}

/** 口の中の部品の位置 (画面 px) */
export interface LaneParts {
  cell: Rect;
  /** 口の番号の左上 */
  number: { x: number; y: number };
  /** 上の元の糸 (糸の色の円すい台を正面から見た丸) */
  yarn: { cx: number; cy: number; r: number };
  /** 下の巻くコーン (紙の芯の色。巻くと太る) */
  cone: { cx: number; cy: number; r: number };
  /** 長さの文字の当たり (1 本は 1 つ、継ぐ糸のある口は 2 つ。口の幅いっぱい) */
  text: Rect[];
  /** 口が低いとき (12 口を縦長に並べるなど) は、元の糸と巻くコーンを左右に並べる */
  sideBySide: boolean;
}

/** 口 i の中身の位置。segCount は口にかけた糸の数 (0〜2) */
export function lanePartsFor(l: BoardLayout, i: number, segCount: number): LaneParts {
  const cell = cellRect(l, i);
  const two = segCount >= 2;
  const textVisible = two ? 2 * TEXT_H2 : TEXT_H1;
  const top = cell.y + PAD;
  const avail = Math.max(20, cell.h - 2 * PAD - textVisible);
  const yarnBlock = avail * 0.55;
  const coneBlock = avail - yarnBlock;
  if (avail < TIGHT_AVAIL) {
    // 低い口: 元の糸 (左) と巻くコーン (右) を同じ高さに並べて、丸を大きく保つ。番号 (左上) の右から始める
    const r = Math.max(8, Math.min(cell.w * 0.15, avail / 2 - 1, 30));
    const cy = top + avail / 2;
    const yarnT = { cx: cell.x + cell.w * 0.42, cy, r };
    const coneT = { cx: cell.x + cell.w * 0.8, cy, r: r * 0.85 };
    const bottomT = cell.y + cell.h - PAD;
    const textT: Rect[] = two
      ? [
          { x: cell.x, y: bottomT - 2 * TEXT_H2, w: cell.w, h: TEXT_H2 },
          { x: cell.x, y: bottomT - TEXT_H2, w: cell.w, h: TEXT_H2 },
        ]
      : [{ x: cell.x, y: bottomT - HIT_H1, w: cell.w, h: HIT_H1 }];
    return { cell, number: { x: cell.x + PAD + 2, y: cell.y + PAD + 18 }, yarn: yarnT, cone: coneT, text: textT, sideBySide: true };
  }
  const maxR = cell.w / 2 - 10;
  const yarn = { cx: cell.x + cell.w / 2, cy: top + yarnBlock / 2, r: Math.max(8, Math.min(maxR, yarnBlock / 2 - 2, 44)) };
  const cone = { cx: cell.x + cell.w / 2, cy: top + yarnBlock + coneBlock / 2, r: Math.max(8, Math.min(maxR - 4, coneBlock / 2 - 2, 38)) };
  const bottom = cell.y + cell.h - PAD;
  const text: Rect[] = two
    ? [
        { x: cell.x, y: bottom - 2 * TEXT_H2, w: cell.w, h: TEXT_H2 },
        { x: cell.x, y: bottom - TEXT_H2, w: cell.w, h: TEXT_H2 },
      ]
    : [{ x: cell.x, y: bottom - HIT_H1, w: cell.w, h: HIT_H1 }];
  return { cell, number: { x: cell.x + PAD + 2, y: cell.y + PAD + 18 }, yarn, cone, text, sideBySide: false };
}

/** 点 p がどの口の枠の中か (n 口まで)。外れれば null */
export function laneAt(l: BoardLayout, p: { x: number; y: number }, n: number): number | null {
  for (let i = 0; i < n; i++) {
    const c = cellRect(l, i);
    if (p.x >= c.x && p.x < c.x + c.w && p.y >= c.y && p.y < c.y + c.h) {
      return i;
    }
  }
  return null;
}

/** 点 p が、長さの文字の当たりの上か (口の番号と区間 0/1)。segCount(i) は口 i の糸の数 */
export function textHitAt(
  l: BoardLayout,
  p: { x: number; y: number },
  segCount: (i: number) => number,
  n: number,
): { spindle: number; slot: 0 | 1 } | null {
  const i = laneAt(l, p, n);
  if (i === null) {
    return null;
  }
  const rects = lanePartsFor(l, i, segCount(i)).text;
  for (let k = 0; k < rects.length; k++) {
    const r = rects[k]!;
    if (p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) {
      return { spindle: i, slot: k === 1 ? 1 : 0 };
    }
  }
  return null;
}

/** 巻いている回の元の糸の残りの比と、巻くコーンに巻けた比 (口 i)。maxLen は元の糸のいちばん長いもの (m) */
export function laneProgress(
  s: { phase: string; progress: number; spindles: { segments: { sourceId: string; lengthM: number }[] }[]; remaining: Record<string, number> },
  maxLen: number,
  i: number,
): { yarnRatio: number; coneRatio: number } {
  const sp = s.spindles[i];
  if (sp === undefined || sp.segments.length === 0) {
    return { yarnRatio: 1, coneRatio: 0 };
  }
  const winding = s.phase === 'winding';
  const prog = Math.min(1, Math.max(0, s.progress));
  let yarnRatio = 1;
  let total = 0;
  for (const seg of sp.segments) {
    total += seg.lengthM;
    const left = (s.remaining[seg.sourceId] ?? 0) - (winding ? seg.lengthM * prog : 0);
    yarnRatio = Math.min(yarnRatio, left / Math.max(1, maxLen));
  }
  const coneRatio = s.phase === 'setup' ? 0 : Math.min(1, total / 10000) * prog;
  return { yarnRatio: Math.min(1, Math.max(0, yarnRatio)), coneRatio };
}

/** メーターは 1 周 1,000m */
export const METER_FULL_M = 1000;

/** メーターの針の向き (ラジアン。0 m で上、時計回り) */
export function meterAngle(meters: number): number {
  const ratio = (((meters % METER_FULL_M) + METER_FULL_M) % METER_FULL_M) / METER_FULL_M;
  return ratio * Math.PI * 2 - Math.PI / 2;
}

/** メーターの周の数 */
export function meterLaps(meters: number): number {
  return Math.floor(Math.max(0, meters) / METER_FULL_M);
}

/** 3 桁ごとにカンマ (6000 → '6,000')。メーターなどの数字の表示 */
export function fmtM(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/**
 * 口ごとの長さの文字。糸がかかっていない・長さが未設定なら「長さ未設定」(狭い口は「未設定」)。
 * 継ぐ糸のある口は 2 行にするので、slot を渡すと 1 行ぶん (1 つ目は「4,200 m」、2 つ目は「+ 1,800 m」)。
 */
export function laneLengthText(sp: { segments: { lengthM: number }[] }, narrow: boolean, slot?: 0 | 1): string {
  const unset = narrow ? '未設定' : '長さ未設定';
  const segs = sp.segments;
  if (segs.length === 0) {
    return unset;
  }
  if (segs.length === 1 || slot === undefined) {
    const total = segs.reduce((a, seg) => a + seg.lengthM, 0);
    return total <= 0 ? unset : `${fmtM(total)} m`;
  }
  const seg = segs[slot];
  if (seg === undefined || seg.lengthM <= 0) {
    return slot === 1 ? '+ 長さ未設定' : unset;
  }
  return slot === 1 ? `+ ${fmtM(seg.lengthM)} m` : `${fmtM(seg.lengthM)} m`;
}

/** 巻いている回のメーターの進み (m)。いちばん長い口の設定 × progress */
export function meterMeters(s: { phase: string; progress: number; spindles: { segments: { lengthM: number }[] }[] }): number {
  const max = Math.max(0, ...s.spindles.map((sp) => sp.segments.reduce((a, seg) => a + seg.lengthM, 0)));
  return max * Math.min(1, Math.max(0, s.progress));
}
