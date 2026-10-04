import type { Content } from '../../core/content/content';
import { COLORS } from '../../core/ui/tokens';
import type { StageFit } from '../../core/viewport/viewport';
import { MACHINE, BOX, SCALE, METER, METER_FULL_M,
  laneRect, yarnBaseY, bodyTopY, bodyH, cheeseH, laneTextY, laneNumY,
  bandY, bandOf, meterAngle, meterLaps, toPx, laneView, fmtM, laneLengthText, meterMeters,
} from './geometry';
import { LIFT_MARGIN_PX } from './drag';
import { lengthOf } from './logic';
import type { ItowariState } from './logic';
import type { ItowariPuzzle } from './puzzles';

/**
 * 糸割りの盤面の描画 (P2b T2b-02)。お父さんの使っていたワインダーを正面から描く。
 * 緑の枠の台に口が横一列 (狭い画面は 6口ずつ2段)。上の段は元の糸、下の段は銀色の胴と空のコーン。
 * 左に箱とはかり、右上にメーター。ドラム巻きと同じ決まり: 論理座標の絵は ctx の変換で画面に合わせ、
 * 文字は変換を戻したあとに toPx で描く (画面 px・20px 以上)。色は COLORS と糸の色だけ。
 */

/** 糸の色 (hex) */
export function yarnHex(content: Content, puzzle: ItowariPuzzle): string {
  const yarn = content.yarns.get(puzzle.yarnId);
  const color = yarn !== undefined ? content.colors.get(yarn.color) : undefined;
  return color?.hex ?? COLORS.sumiSub;
}

/**
 * 盤面を描く。windT は巻いているあいだの時間 (秒。胴の溝が流れる)。controller が渡す。
 */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  fit: StageFit,
  s: ItowariState,
  content: Content,
  puzzle: ItowariPuzzle,
  windT: number,
): void {
  const hex = yarnHex(content, puzzle);
  const narrow = (MACHINE.w / 12) * fit.scale < 64; // 1つの口の幅が画面上 64px 未満なら 2段
  ctx.fillStyle = COLORS.kinari;
  ctx.fillRect(0, 0, ctx.canvas.clientWidth || ctx.canvas.width, ctx.canvas.clientHeight || ctx.canvas.height);
  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);
  drawFrame(ctx, narrow);
  drawBox(ctx, s, puzzle, hex);
  drawScale(ctx, s, puzzle, hex);
  for (let i = 0; i < s.spindles.length; i++) {
    drawLaneTop(ctx, s, puzzle, hex, i, narrow, windT);
    drawLaneBody(ctx, s, hex, i, narrow, windT);
  }
  drawMeterDial(ctx, s);
  if (s.phase === 'failed') drawFailMarks(ctx, s, narrow);

  ctx.restore();

  drawTexts(ctx, fit, s, puzzle, narrow);
}

/** 台の枠 (緑) と口の台座。かけていない口は空の台 */
function drawFrame(ctx: CanvasRenderingContext2D, narrow: boolean): void {
  ctx.fillStyle = COLORS.winderGreen;
  ctx.fillRect(MACHINE.x - 12, MACHINE.y - 12, MACHINE.w + 24, MACHINE.h + 12);
  ctx.fillStyle = COLORS.kinari;
  ctx.fillRect(MACHINE.x, MACHINE.y, MACHINE.w, MACHINE.h);
  const cols = narrow ? 6 : 12;
  for (let band = 0; band < (narrow ? 2 : 1); band++) {
    for (let c = 0; c < cols; c++) {
      const i = band * cols + c;
      ctx.fillStyle = COLORS.winderSteel;
      ctx.fillRect(laneRect(i, narrow).x + 4, yarnBaseY(i, narrow), laneRect(i, narrow).w - 8, 8);
    }
  }
}
/** 台形の円すい台を塗る (cx・baseY は下辺の中心と下端。topW/bottomW は上辺・下辺の幅)。色は呼び出し側で決める */
function cone(ctx: CanvasRenderingContext2D, cx: number, baseY: number, topW: number, bottomW: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(cx - bottomW / 2, baseY);
  ctx.lineTo(cx + bottomW / 2, baseY);
  ctx.lineTo(cx + topW / 2, baseY - h);
  ctx.lineTo(cx - topW / 2, baseY - h);
  ctx.closePath();
  ctx.fill();
}

/** 段ボール箱 (まだかけていない元の糸を小さな円すい台で並べる) */
function drawBox(ctx: CanvasRenderingContext2D, s: ItowariState, puzzle: ItowariPuzzle, hex: string): void {
  ctx.fillStyle = COLORS.cardboard;
  ctx.fillRect(BOX.x, BOX.y, BOX.w, BOX.h);
  const mounted = new Set(s.spindles.flatMap((sp) => sp.segments.map((seg) => seg.sourceId)));
  const maxLen = Math.max(...puzzle.sources.map((src) => lengthOf(src.grossG, puzzle.coreG, puzzle.count)), 1);
  puzzle.sources
    .filter((src) => !mounted.has(src.id) && !s.used.includes(src.id))
    .forEach((src, k) => {
      const cx = BOX.x + 26 + (k % 4) * 32;
      const baseY = BOX.y + 62 + Math.floor(k / 4) * 52;
      const h = 24 + 18 * (lengthOf(src.grossG, puzzle.coreG, puzzle.count) / maxLen);
      ctx.fillStyle = COLORS.cardboardDark;
      ctx.fillRect(cx - 9, baseY, 18, 4);
      ctx.fillStyle = hex;
      ctx.globalAlpha = 0.85;
      cone(ctx, cx, baseY, 8, 16, h);
      ctx.globalAlpha = 1;
    });
}

/** 上皿はかり (重さの数字は drawTexts) */
function drawScale(ctx: CanvasRenderingContext2D, s: ItowariState, puzzle: ItowariPuzzle, hex: string): void {
  ctx.fillStyle = COLORS.sumiSub;
  ctx.fillRect(SCALE.x, SCALE.y, SCALE.w, 12); // 上皿
  ctx.fillStyle = COLORS.winderSteel;
  ctx.fillRect(SCALE.x + SCALE.w / 2 - 22, SCALE.y + 12, 44, 44); // 本体と表示窓の台
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(SCALE.x + 8, SCALE.y + 50, SCALE.w - 16, 26); // 重さの札
  // 上皿に載せた糸 (最後に量った糸)
  const last = s.weighed[s.weighed.length - 1];
  if (last === undefined || !puzzle.sources.some((x) => x.id === last)) return;
  ctx.fillStyle = hex;
  cone(ctx, SCALE.x + SCALE.w / 2, SCALE.y, 14, 28, 34);
}

/** 上の段: 元の糸 (残りに比例して細る円すい台) と黄色い糸道。継ぐ糸は横に小さく並べ、結び目を描く */
function drawLaneTop(ctx: CanvasRenderingContext2D, s: ItowariState, puzzle: ItowariPuzzle, hex: string, i: number, narrow: boolean, windT: number): void {
  const v = laneView(s, puzzle.sources.map((src) => lengthOf(src.grossG, puzzle.coreG, puzzle.count)), i, narrow);
  const sp = s.spindles[i]!;
  sp.segments.forEach((seg, slot) => {
    const w = v.lane.w * (slot === 0 ? 0.3 : 0.2);
    const h = cheeseH(v.yarnRatio, narrow);
    const cx = v.cx + (slot === 0 ? -v.lane.w * 0.12 : v.lane.w * 0.22);
    const baseY = v.baseY;
    // 円すい台 (斜め前から見た形) と紙の芯
    ctx.fillStyle = hex;
    ctx.globalAlpha = 0.9;
    cone(ctx, cx, baseY, w * 0.6, w, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.white;
    cone(ctx, cx, baseY, w / 2, w, h * 0.35);
    // 黄色い糸道 (上の小さな丸) と結び目 (継ぐ糸のある口。1つ目を巻き終えたところで光る)
    ctx.fillStyle = COLORS.threadYellow;
    ctx.beginPath();
    ctx.arc(cx, baseY - h - 8, narrow ? 3 : 4, 0, Math.PI * 2);
    ctx.fill();
    if (slot === 1) {
      const firstDone = s.phase !== 'winding' || s.progress * v.totalLen >= sp.segments[0]!.lengthM;
      ctx.fillStyle = firstDone ? COLORS.gold : COLORS.threadYellow;
      ctx.beginPath();
      ctx.arc(v.cx, baseY - h * 0.4, firstDone ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // 巻いている回: 上の糸から下のコーンへ糸の線が走る
    if (s.phase === 'winding' && slot === 0) {
      ctx.strokeStyle = hex;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, baseY);
      ctx.lineTo(v.cx + Math.sin(windT * 6) * 3, v.top);
      ctx.stroke();
    }
  });
}

/** 下の段: 銀色の胴 (溝が流れる) と、設定した長さに比例して太るコーン、緑の腕と白い握り */
function drawLaneBody(ctx: CanvasRenderingContext2D, s: ItowariState, hex: string, i: number, narrow: boolean, windT: number): void {
  const lane = laneRect(i, narrow);
  const top = bodyTopY(i, narrow);
  const h = bodyH(i, narrow);
  ctx.fillStyle = COLORS.winderSteel;
  ctx.fillRect(lane.x + 3, top, lane.w - 6, h);
  // 溝の斜めの線 (巻いている回は流れる)
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 2;
  const shift = s.phase === 'winding' ? ((windT * 26) % 14 + 14) % 14 : 0;
  for (let x = lane.x + 3 - 14 + shift; x < lane.x + lane.w - 3; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, top + h);
    ctx.lineTo(x + 8, top);
    ctx.stroke();
  }
  // 空のコーン (紙の芯の色) と巻いた糸。設定した長さに比例して太る
  const setLen = s.spindles[i]!.segments.reduce((a, seg) => a + seg.lengthM, 0);
  const coneRatio = Math.min(1, setLen / 10000) * (s.phase === 'setup' ? 0 : Math.min(1, Math.max(0, s.progress)));
  const coneW = lane.w * 0.34 * (0.45 + 0.55 * coneRatio);
  const coneH = h * 0.6;
  const cx = lane.x + lane.w / 2;
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(cx - coneW / 2, top + h - coneH, coneW, coneH);
  if (coneRatio > 0 && setLen > 0) {
    ctx.fillStyle = hex;
    ctx.fillRect(cx - coneW / 2 - 3, top + h - coneH, coneW + 6, coneH * 0.5);
  }
  // 緑の腕と白い握り (絵だけ。押す操作は無い)
  ctx.fillStyle = COLORS.winderGreen;
  ctx.fillRect(cx + coneW / 2 + 2, top + 10, 8, h * 0.55);
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(cx + coneW / 2 + 1, top + 6, 10, 12);
}

/** メーターの目盛り盤 (1周 1,000m。太い目盛り 100m・細い 10m。中央の窓に周の数) と針 */
function drawMeterDial(ctx: CanvasRenderingContext2D, s: ItowariState): void {
  ctx.fillStyle = COLORS.white;
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(METER.cx, METER.cy, METER.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (let m = 0; m < METER_FULL_M; m += 10) {
    const major = m % 100 === 0;
    const a = (m / METER_FULL_M) * Math.PI * 2 - Math.PI / 2;
    const r0 = METER.r - (major ? 12 : 6);
    ctx.lineWidth = major ? 3 : 1;
    ctx.beginPath();
    ctx.moveTo(METER.cx + Math.cos(a) * r0, METER.cy + Math.sin(a) * r0);
    ctx.lineTo(METER.cx + Math.cos(a) * (METER.r - 2), METER.cy + Math.sin(a) * (METER.r - 2));
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.sumi;
  ctx.fillRect(METER.cx - 12, METER.cy - 10, 24, 20); // 中央の窓
  const a = meterAngle(meterMeters(s));
  ctx.strokeStyle = COLORS.shu;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(METER.cx, METER.cy);
  ctx.lineTo(METER.cx + Math.cos(a) * (METER.r - 14), METER.cy + Math.sin(a) * (METER.r - 14));
  ctx.stroke();
}
/** 失敗があった口の番号と印の文字 (朱の枠と文字で共用) */
function failMarks(s: ItowariState): Array<{ i: number; label: string }> {
  return s.lastFailures
    .map((f) => ({
      i: f.spindle ?? s.spindles.findIndex((sp) => sp.segments.some((seg) => seg.sourceId === f.sourceId)),
      label: f.kind === 'sourceEmpty' ? '✕ 空になる' : '✕ 足りない',
    }))
    .filter((m) => m.i >= 0);
}

/** 失敗した口・元の糸に朱の枠 (論理座標の絵として描く) */
function drawFailMarks(ctx: CanvasRenderingContext2D, s: ItowariState, narrow: boolean): void {
  ctx.strokeStyle = COLORS.shu;
  ctx.lineWidth = 3;
  for (const m of failMarks(s)) {
    const band = bandY(bandOf(m.i, narrow), narrow);
    const lane = laneRect(m.i, narrow);
    ctx.strokeRect(lane.x + 2, band + 12, lane.w - 4, narrow ? 264 : 468);
  }
}

/** 文字 (変換を戻してから画面 px で描く。20px 以上) */
function drawTexts(ctx: CanvasRenderingContext2D, fit: StageFit, s: ItowariState, puzzle: ItowariPuzzle, narrow: boolean): void {
  ctx.textAlign = 'center';
  ctx.font = '20px sans-serif';
  for (let i = 0; i < s.spindles.length; i++) {
    const lane = laneRect(i, narrow);
    const px = toPx(fit, { x: lane.x + lane.w / 2, y: 0 }).x;
    ctx.fillStyle = COLORS.sumi;
    ctx.fillText(laneLengthText(s.spindles[i]!), px, toPx(fit, { x: 0, y: laneTextY(i, narrow) }).y);
    ctx.fillText(String(i + 1), px, toPx(fit, { x: 0, y: laneNumY(i, narrow) }).y);
  }
  // メーターの下の数字 (いちばん長い口の進み) と周の数 (窓) とはかりの重さ (最後に量った糸)
  const meters = meterMeters(s);
  const mx = toPx(fit, { x: METER.cx, y: 0 }).x;
  ctx.font = '22px sans-serif';
  ctx.fillText(`${fmtM(meters)} m`, mx, toPx(fit, { x: 0, y: METER.cy + METER.r + 26 }).y);
  ctx.fillStyle = COLORS.white;
  ctx.font = '20px sans-serif';
  ctx.fillText(String(meterLaps(meters)), mx, toPx(fit, { x: 0, y: METER.cy + 6 }).y);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = COLORS.sumi;
  const last = s.weighed[s.weighed.length - 1];
  const src = last !== undefined ? puzzle.sources.find((x) => x.id === last) : undefined;
  ctx.fillText(`${src !== undefined ? Math.round(src.grossG) : 0} g`, toPx(fit, { x: SCALE.x + SCALE.w / 2, y: 0 }).x, toPx(fit, { x: 0, y: SCALE.y + 70 }).y);
  // 失敗の印の文字 (朱)
  if (s.phase === 'failed') {
    ctx.fillStyle = COLORS.shu;
    for (const m of failMarks(s)) {
      const lane = laneRect(m.i, narrow);
      ctx.fillText(m.label, toPx(fit, { x: lane.x + lane.w / 2, y: 0 }).x, toPx(fit, { x: 0, y: bandY(bandOf(m.i, narrow), narrow) + 34 }).y);
    }
  }
  ctx.textAlign = 'left';
}

/** 引っぱっている元の糸の円すい台 (指の 24px 上。画面 px で描く。controller が呼ぶ) */
export function drawLifted(ctx: CanvasRenderingContext2D, hex: string, p: { x: number; y: number }): void {
  const bottom = p.y - LIFT_MARGIN_PX;
  ctx.fillStyle = hex;
  ctx.globalAlpha = 0.9;
  cone(ctx, p.x, bottom, 12, 26, 28);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = hex;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p.x, bottom - 28);
  ctx.quadraticCurveTo(p.x + 14, bottom - 40, p.x + 26, bottom - 38); // 糸の尾
  ctx.stroke();
}
