import type { WindingState } from './logic';
import { qualities } from './logic';
import type { Content } from '../../core/content/content';
import { COLORS, FONT_FAMILY } from '../../core/ui/tokens';
import { speedOf } from '../../core/mechanics/pedal';
import { TENSION, SECTION_LENGTH } from './params';
import type { StageFit } from '../../core/viewport/viewport';
import { CREEL_AREA, TABLE_AREA, DRUM_AREA, TOP_AREA, REED_X, THREAD_SHEET_HALF, REED_RISE, threadY, threadPath, drumSectionY, tableY, pointOnPath, toPx, fontPx } from './geometry';
import { drawDrum, drawBrokenThread } from './renderer.parts';

/**
 * ドラム巻きの盤面の描画 (P2 T2-05・T2-08・T2-08 追加修正a)。
 * ドラムの軸は縦。台と筬は今の帯の区画の高さに置く。
 * 論理座標で描く部分は ctx の変換 (translate + scale) で画面に合わせる。
 * 文字は、変換を戻したあとに論理座標の点を toPx で画面の点に直して描く (大きさは画面 px)。
 * 色は COLORS と糸の色 (hex) だけ。明るさは globalAlpha と勾配で変える。
 */

/** 柄の plan の色を上から順に hex の並びにする (糸の色は内容データの hex を使う) */
function patternHexes(content: Content, patternId: string): string[] {
  const pattern = content.patterns.get(patternId);
  if (!pattern) return [COLORS.sumiSub];
  const hexes: string[] = [];
  for (const run of pattern.plan) {
    const yarn = content.yarns.get(run.yarn);
    if (!yarn) continue;
    const color = content.colors.get(yarn.color);
    if (!color) continue;
    for (let i = 0; i < run.count; i++) hexes.push(color.hex);
  }
  return hexes.length > 0 ? hexes : [COLORS.sumiSub];
}

/** 柄の基本色 (糸とコーンに使う。plan の最初の色) */
function baseHex(content: Content, patternId: string): string {
  return patternHexes(content, patternId)[0] ?? COLORS.sumiSub;
}

/**
 * 盤面を描く。show は切れた糸の見せ方 (難易度)、timeMs は揺れの計算用、
 * tieProgress は 'cutting' から次の帯へ移る演出 (0〜1、無ければ 0)。
 */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  fit: { scale: number; offsetX: number; offsetY: number },
  s: WindingState,
  content: Content,
  opts: { threadCount: number; show: 'red' | 'droop' | 'small'; timeMs: number; tieProgress?: number; drumAngle?: number },
): void {
  const hexes = patternHexes(content, s.patternId);
  const base = baseHex(content, s.patternId);

  // 1. 背景 (kinari) は、変換の前に Canvas の画面上の大きさで塗る
  ctx.fillStyle = COLORS.kinari;
  ctx.fillRect(0, 0, ctx.canvas.clientWidth || ctx.canvas.width, ctx.canvas.clientHeight || ctx.canvas.height);

  // 論理座標で描く: save → translate → scale
  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);

  drawCreel(ctx, fit, s, opts, hexes);
  drawThreads(ctx, fit, s, opts, base);
  drawTable(ctx, fit, s);
  drawDrum(ctx, fit, s, hexes, base, opts.tieProgress ?? 0, opts.drumAngle ?? 0);
  drawDial(ctx, fit, s);
  drawLamp(ctx, s);
  drawBrokenThread(ctx, fit, s, opts, base);
  drawDoneSurface(ctx, fit, s);

  // 変換を戻す
  ctx.restore();

  // 文字は restore のあとに描く (論理座標の点を toPx で画面の点に直す。大きさは画面 px)。
  // 「停止」は赤ランプの下に、ランプの中心にそろえて描く (T2-07 追加修正b)
  if (s.phase === 'broken') {
    const lampPx = toPx(fit, { x: LAMP_X, y: 0 });
    ctx.font = `20px ${FONT_FAMILY}`;
    const wPx = ctx.measureText('停止').width;
    const p = toPx(fit, { x: LAMP_X, y: LAMP_Y + 44 });
    ctx.fillStyle = COLORS.sumi;
    ctx.fillText('停止', lampPx.x - wPx / 2, p.y);
  }
}

/** 赤ランプ・目盛り盤の位置 (論理座標) */
const LAMP_X = 620;
const LAMP_Y = TOP_AREA.y + 45;
const DIAL_X = 460;
const DIAL_Y = TOP_AREA.y + 45;

/** 1. クリール: 縦の柱・段の横木・ペグ + 横向きコーン + テンションの皿 + 赤い小ランプ */
function drawCreel(
  ctx: CanvasRenderingContext2D,
  fit: StageFit,
  s: WindingState,
  opts: { threadCount: number },
  hexes: string[],
): void {
  const { x, y, w, h } = CREEL_AREA;
  const postW = fontPx(fit, 10);
  // 縦の柱 (左右の2本・灰みの緑)
  ctx.fillStyle = COLORS.machine;
  ctx.fillRect(x, y, postW, h);
  ctx.fillRect(x + w - postW, y, postW, h);
  // 柱の上の赤い小ランプ (盤面上部のランプと同じ状態)
  ctx.fillStyle = s.phase === 'broken' ? COLORS.shu : COLORS.steel;
  ctx.beginPath();
  ctx.arc(x + postW / 2, y - fontPx(fit, 8), fontPx(fit, 5), 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w - postW / 2, y - fontPx(fit, 8), fontPx(fit, 5), 0, Math.PI * 2);
  ctx.fill();

  for (let t = 0; t < opts.threadCount; t++) {
    const cy = threadY(t, opts.threadCount);
    // 段の横木 (2本の柱のあいだ)
    ctx.fillStyle = COLORS.machineDark;
    ctx.fillRect(x + postW, cy - fontPx(fit, 3), w - postW * 2, fontPx(fit, 6));
    // ペグ (鋼色の差し棒。左の柱から出る)
    ctx.fillStyle = COLORS.steel;
    ctx.fillRect(x + postW, cy - fontPx(fit, 2), fontPx(fit, 26), fontPx(fit, 4));
    // 横向きのコーン (糸の色の角の丸い長方形。右端に濃い色の芯の丸)
    const coneX = x + postW + fontPx(fit, 26);
    const coneW = fontPx(fit, 34);
    const coneH = fontPx(fit, 16);
    ctx.fillStyle = hexes[t % hexes.length] ?? COLORS.sumiSub;
    ctx.beginPath();
    ctx.roundRect(coneX, cy - coneH / 2, coneW, coneH, coneH / 2);
    ctx.fill();
    // 墨の薄い色の輪郭線 (白っぽいコーンが背景に溶けないように。T2-08 追加修正2)
    ctx.strokeStyle = COLORS.sumiSub;
    ctx.lineWidth = Math.max(1.5, fontPx(fit, 1.5));
    ctx.stroke();
    ctx.fillStyle = COLORS.machineDark; // 芯の穴
    ctx.beginPath();
    ctx.arc(coneX + coneW - coneH / 2, cy, coneH / 4, 0, Math.PI * 2);
    ctx.fill();
    // テンションの皿 (鋼色の小さな円。コーンの右)
    ctx.fillStyle = COLORS.steel;
    ctx.beginPath();
    ctx.arc(coneX + coneW + fontPx(fit, 14), cy, fontPx(fit, 6), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 2. 糸: コーンから筬へ扇のように集まり、帯の幅にまとまって今の帯の区画へ */
function drawThreads(
  ctx: CanvasRenderingContext2D,
  fit: StageFit,
  s: WindingState,
  opts: { threadCount: number; timeMs: number },
  base: string,
): void {
  ctx.strokeStyle = base;
  ctx.lineWidth = fontPx(fit, 1);
  ctx.beginPath();
  for (let t = 0; t < opts.threadCount; t++) {
    // 糸の線は geometry の threadPath (頂点の折れ線) どおりに描く (T2-10a)
    const path = threadPath(t, opts.threadCount, s.current, s.sections);
    ctx.moveTo(path[0]!.x, path[0]!.y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i]!.x, path[i]!.y);
    }
  }
  ctx.stroke();
  // 筬から先は帯の幅にまとまって、今の帯の区画へ (横向き)
  const ty = tableY(s.current, s.sections);
  ctx.lineWidth = fontPx(fit, 2);
  ctx.beginPath();
  for (const dy of [-THREAD_SHEET_HALF, 0, THREAD_SHEET_HALF]) {
    ctx.moveTo(REED_X, ty - REED_RISE + dy);
    ctx.lineTo(DRUM_AREA.x, ty + dy * 0.4);
  }
  ctx.stroke();
  // 巻いているときは、糸の線の上に小さな印が流れて動く (速さに比例。印は糸の上に乗る)
  if (s.phase === 'winding') {
    const speed = speedOf(s.pedal, TENSION);
    const offset = ((opts.timeMs / 1000) * speed * 12) % 120;
    ctx.fillStyle = COLORS.sumi;
    for (let t = 0; t < opts.threadCount; t++) {
      const p = pointOnPath(t, opts.threadCount, offset / 120, s.current, s.sections);
      ctx.fillRect(p.x - fontPx(fit, 4), p.y - fontPx(fit, 3), fontPx(fit, 8), fontPx(fit, 6));
    }
  }
}

/** 3. 中央の台: 脚の付いた台と、筬 (くし状の金具)。今の帯の区画の高さに置く */
function drawTable(ctx: CanvasRenderingContext2D, fit: StageFit, s: WindingState): void {
  const { x, w } = TABLE_AREA;
  const ty = tableY(s.current, s.sections);
  const boardY = ty + fontPx(fit, 12);
  const boardH = fontPx(fit, 12);
  // 台の板 (木)
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(x + fontPx(fit, 20), boardY, w - fontPx(fit, 40), boardH);
  // 脚 (2本)
  ctx.fillStyle = COLORS.machineDark;
  ctx.fillRect(x + fontPx(fit, 40), boardY + boardH, fontPx(fit, 8), fontPx(fit, 50));
  ctx.fillRect(x + w - fontPx(fit, 48), boardY + boardH, fontPx(fit, 8), fontPx(fit, 50));
  // 筬: 台の上に置く。鋼色の枠の中に細い縦の歯
  const reedW = fontPx(fit, 90);
  const reedH = fontPx(fit, 46);
  const reedX = REED_X - reedW / 2;
  const reedY = ty - REED_RISE - reedH / 2;
  ctx.fillStyle = COLORS.steel;
  ctx.fillRect(reedX, reedY, reedW, reedH);
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = fontPx(fit, 1.5);
  for (let i = 0; i < 16; i++) {
    const tx = reedX + ((reedW - fontPx(fit, 12)) / 15) * i + fontPx(fit, 6);
    ctx.beginPath();
    ctx.moveTo(tx, reedY + fontPx(fit, 5));
    ctx.lineTo(tx, reedY + reedH - fontPx(fit, 5));
    ctx.stroke();
  }
}

/** 5. 目盛り盤 (今の帯の巻いた長さを円の針で示す) */
function drawDial(ctx: CanvasRenderingContext2D, fit: StageFit, s: WindingState): void {
  const dialR = 32;
  ctx.strokeStyle = COLORS.sumi;
  ctx.lineWidth = fontPx(fit, 3);
  ctx.beginPath();
  ctx.arc(DIAL_X, DIAL_Y, dialR, 0, Math.PI * 2);
  ctx.stroke();
  const len = s.lengths[s.current] ?? 0;
  const ratio = Math.min(1, Math.max(0, len / SECTION_LENGTH));
  const angle = -Math.PI / 2 + ratio * Math.PI * 2;
  ctx.beginPath();
  ctx.moveTo(DIAL_X, DIAL_Y);
  ctx.lineTo(DIAL_X + Math.cos(angle) * (dialR - 6), DIAL_Y + Math.sin(angle) * (dialR - 6));
  ctx.stroke();
}

/** 6. 赤ランプ ('broken' で shu で点灯。それ以外は灰色で消灯) */
function drawLamp(ctx: CanvasRenderingContext2D, s: WindingState): void {
  ctx.fillStyle = s.phase === 'broken' ? COLORS.shu : COLORS.steel;
  ctx.beginPath();
  ctx.arc(LAMP_X, LAMP_Y, 16, 0, Math.PI * 2);
  ctx.fill();
}

/** 8. 'done' のとき、出来が低い帯ほど表面の縞を波打たせる */
function drawDoneSurface(ctx: CanvasRenderingContext2D, fit: StageFit, s: WindingState): void {
  if (s.phase !== 'done') {
    return;
  }
  const qs = qualities(s);
  const secH = DRUM_AREA.h / s.sections;
  ctx.strokeStyle = COLORS.sumi;
  ctx.lineWidth = fontPx(fit, 2);
  for (let i = 0; i < s.sections; i++) {
    const q = qs[i] ?? 0;
    const wave = (1 - q) * 12;
    const y = drumSectionY(i, s.sections) + secH / 2;
    ctx.beginPath();
    for (let xx = 0; xx <= 20; xx++) {
      const py = y + (Math.sin((xx / 20) * Math.PI * 3) * wave) / 2;
      const px = DRUM_AREA.x + (xx / 20) * (DRUM_AREA.w - 40);
      if (xx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}
