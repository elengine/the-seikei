import type { Content } from '../../core/content/content';
import { COLORS, FONT_FAMILY } from '../../core/ui/tokens';
import { drawCheese } from '../creel/renderer.parts';
import {
  HEADER_H, lanesFor, layoutFor, cellRect, lanePartsFor, laneProgress,
  meterAngle, meterLaps, meterMeters, fmtM, laneLengthText,
} from './geometry';
import type { BoardLayout } from './geometry';
import { lengthOf } from './logic';
import type { ItowariState } from './logic';
import type { ItowariPuzzle } from './puzzles';

/**
 * 糸割りの盤面の描画 (PU-16a)。画面 px (盤面のカードの大きさ) で描く。
 * お題で使う口だけを大きく: 上に元の糸 (糸の色の丸。残りに応じて細る)、下に巻くコーン (紙の芯の色。巻くと太る)、
 * その下に設定した長さ。口の番号は左上。選んだ口は藍の枠。盤面の上の端に 1 行、メーターとはかりの数字。
 * 文字は 20px 以上 (長さ・メーター・はかりは 24px)。色は COLORS と糸の色だけ。
 */

/** 糸の色 (hex) */
export function yarnHex(content: Content, puzzle: ItowariPuzzle): string {
  const yarn = content.yarns.get(puzzle.yarnId);
  const color = yarn !== undefined ? content.colors.get(yarn.color) : undefined;
  return color?.hex ?? COLORS.sumiSub;
}

/** 描くときの状態 (controller が渡す) */
export interface BoardView {
  /** 巻いているあいだの時間 (秒。糸の線が揺れる) */
  windT: number;
  /** 選んでいる口 (藍の枠)。無ければ null */
  selected: number | null;
  /** 引っぱった糸を重ねている口 (吸い付く先)。無ければ null */
  hover: number | null;
  /** 引っぱっている糸 (口から外すとき。画面 px の指の位置) */
  lifted?: { x: number; y: number } | null;
}

/** これより狭い口は「長さ未設定」を「未設定」に縮める (24px で 5 文字が入らない幅) */
const NARROW_CELL_W = 130;

const FONT = (px: number, bold = false): string => `${bold ? 'bold ' : ''}${px}px ${FONT_FAMILY}`;

/** 盤面を描く。size は盤面のカードの大きさ (画面 px) */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  size: { w: number; h: number },
  s: ItowariState,
  content: Content,
  puzzle: ItowariPuzzle,
  view: BoardView,
): void {
  const hex = yarnHex(content, puzzle);
  const n = lanesFor(puzzle);
  const layout = layoutFor(n, size.w, size.h);
  ctx.fillStyle = COLORS.kinari;
  ctx.fillRect(0, 0, size.w, size.h);
  drawHeader(ctx, size.w, s, puzzle);
  const maxLen = Math.max(...puzzle.sources.map((src) => lengthOf(src.grossG, puzzle.coreG, puzzle.count)), 1);
  for (let i = 0; i < n; i++) {
    drawLane(ctx, layout, s, hex, maxLen, i, view);
  }
  if (s.phase === 'failed') {
    drawFailMarks(ctx, layout, s);
  }
  if (view.lifted !== undefined && view.lifted !== null) {
    drawLifted(ctx, hex, view.lifted);
  }
}

/** 盤面の上の端の 1 行: メーター (左) とはかり (右)。巻いているあいだは小さな目盛り盤と針 */
function drawHeader(ctx: CanvasRenderingContext2D, w: number, s: ItowariState, puzzle: ItowariPuzzle): void {
  const meters = meterMeters(s);
  const last = s.weighed[s.weighed.length - 1];
  const src = last !== undefined ? puzzle.sources.find((x) => x.id === last) : undefined;
  const cy = HEADER_H / 2;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.sumi;
  ctx.font = FONT(24, true);
  ctx.textAlign = 'left';
  ctx.fillText(`メーター ${fmtM(meters)} m`, 12, cy);
  ctx.textAlign = 'right';
  ctx.fillText(`はかり ${src !== undefined ? Math.round(src.grossG) : 0} g`, w - 12, cy);
  if (s.phase === 'winding') {
    // 小さな目盛り盤 (1 周 1,000m。中央に周の数) と朱の針
    const r = 18;
    const cx = w / 2;
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.sumiSub;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const a = meterAngle(meters);
    ctx.strokeStyle = COLORS.shu;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = FONT(20);
    ctx.fillStyle = COLORS.sumiSub;
    ctx.fillText(`${meterLaps(meters)}周`, cx + r + 6, cy);
  }
  ctx.textAlign = 'left';
}

/** 1 つの口: 枠・番号・元の糸・巻くコーン・長さ */
function drawLane(
  ctx: CanvasRenderingContext2D,
  layout: BoardLayout,
  s: ItowariState,
  hex: string,
  maxLen: number,
  i: number,
  view: BoardView,
): void {
  const sp = s.spindles[i]!;
  const parts = lanePartsFor(layout, i, sp.segments.length);
  const c = parts.cell;
  const inner = { x: c.x + 3, y: c.y + 3, w: c.w - 6, h: c.h - 6 };
  // 口の枠 (白い地。選んだ口・重ねた口は藍の太い枠)
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
  const active = view.selected === i || view.hover === i;
  ctx.strokeStyle = active ? COLORS.ai : COLORS.line;
  ctx.lineWidth = active ? 4 : 2;
  ctx.strokeRect(inner.x, inner.y, inner.w, inner.h);

  // 番号 (左上。20px)
  ctx.fillStyle = COLORS.sumiSub;
  ctx.font = FONT(20);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(i + 1), parts.number.x, parts.number.y);

  const { yarnRatio, coneRatio } = laneProgress(s, maxLen, i);
  const mounted = sp.segments.length > 0;
  // 上: 元の糸 (かけていない口は空の台の輪)。残りに応じて細る
  if (mounted) {
    const r = parts.yarn.r * (0.55 + 0.45 * yarnRatio);
    drawCheese(ctx, parts.yarn.cx, parts.yarn.cy, r, hex, COLORS.kinariDeep);
    if (sp.segments.length > 1) {
      // 継ぐ糸: 小さな 2 つ目の丸を右下に添える
      drawCheese(ctx, parts.yarn.cx + parts.yarn.r * 0.8, parts.yarn.cy + parts.yarn.r * 0.55, parts.yarn.r * 0.45, hex, COLORS.kinariDeep);
    }
  } else {
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(parts.yarn.cx, parts.yarn.cy, parts.yarn.r * 0.8, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 巻いている回: 元の糸から巻くコーンへ糸の線
  if (s.phase === 'winding' && mounted) {
    ctx.strokeStyle = hex;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (parts.sideBySide) {
      ctx.moveTo(parts.yarn.cx + parts.yarn.r * 0.8, parts.yarn.cy);
      ctx.lineTo(parts.cone.cx - parts.cone.r * 0.8, parts.cone.cy + Math.sin(view.windT * 6) * 3);
    } else {
      ctx.moveTo(parts.yarn.cx, parts.yarn.cy + parts.yarn.r * 0.6);
      ctx.lineTo(parts.cone.cx + Math.sin(view.windT * 6) * 3, parts.cone.cy - parts.cone.r * 0.5);
    }
    ctx.stroke();
  }
  // 下: 巻くコーン (紙の芯の色。巻くと太る)
  const wound = parts.cone.r * (0.45 + 0.55 * coneRatio);
  drawCheese(ctx, parts.cone.cx, parts.cone.cy, wound, coneRatio > 0 ? hex : COLORS.kinariDeep, COLORS.kinariDeep);

  // 設定した長さ (24px。継ぐ糸のある口は 2 行)
  ctx.fillStyle = COLORS.sumi;
  ctx.font = FONT(24, mounted);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const narrow = c.w < NARROW_CELL_W;
  if (sp.segments.length >= 2) {
    for (const slot of [0, 1] as const) {
      const r = parts.text[slot]!;
      ctx.fillText(laneLengthText(sp, narrow, slot), r.x + r.w / 2, r.y + r.h / 2);
    }
  } else {
    const r = parts.text[0]!;
    ctx.fillText(laneLengthText(sp, narrow), r.x + r.w / 2, r.y + r.h - 16);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** 失敗があった口の番号と印の文字 */
function failMarks(s: ItowariState): Array<{ i: number; label: string }> {
  return s.lastFailures
    .map((f) => ({
      i: f.spindle ?? s.spindles.findIndex((sp) => sp.segments.some((seg) => seg.sourceId === f.sourceId)),
      label: f.kind === 'sourceEmpty' ? '✕ 空になる' : '✕ 足りない',
    }))
    .filter((m) => m.i >= 0);
}

/** 失敗した口に朱の枠と印の文字 (20px 以上) */
function drawFailMarks(ctx: CanvasRenderingContext2D, layout: BoardLayout, s: ItowariState): void {
  for (const m of failMarks(s)) {
    const c = cellRect(layout, m.i);
    ctx.strokeStyle = COLORS.shu;
    ctx.lineWidth = 4;
    ctx.strokeRect(c.x + 3, c.y + 3, c.w - 6, c.h - 6);
    ctx.fillStyle = COLORS.shu;
    ctx.font = FONT(20, true);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(m.label, c.x + c.w - 10, c.y + 28);
  }
  ctx.textAlign = 'left';
}

/** 引っぱっている元の糸 (口から外すとき。指の 24px 上) */
export function drawLifted(ctx: CanvasRenderingContext2D, hex: string, p: { x: number; y: number }): void {
  drawCheese(ctx, p.x, p.y - 24 - 24, 24, hex, COLORS.kinariDeep);
}
