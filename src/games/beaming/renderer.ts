import type { Content } from '../../core/content/content';
import { COLORS } from '../../core/ui/tokens';
import type { StageFit } from '../../core/viewport/viewport';
import type { BeamingState } from './logic';
import {
  DRUM_RECT, BEAM_AXIS_Y, BEAM_CORE_H, BEAM_WOUND_MAX_H, FLANGE_W, FLANGE_H, flangeTopY, TARGET_LINE_Y,
  SHEET_TOP_Y, woundTopY, cmToX, pxPerCm, TOP_TEXT, toPx,
} from './geometry';

/**
 * ビーム巻きの盤面の描画 (P3 T3-02)。正面から見た絵。
 * 奥 (上) に巻き終えたドラム、手前 (下) にビーム (銀色の芯) と緑の円盤。
 * ドラム巻きと同じ決まり:論理座標で描く部分は ctx の変換で画面に合わせ、
 * 文字は変換を戻したあとに toPx で描く (大きさは画面 px・20px 以上)。
 * 色は COLORS と糸の色 (hex) だけ。明るさは globalAlpha で変える。
 */

/** 柄でいちばん多く使う糸の色 (シートと巻き太りの色) */
export function mainHex(content: Content, patternId: string): string {
  const pattern = content.patterns.get(patternId);
  if (!pattern || pattern.plan.length === 0) return COLORS.sumiSub;
  let best = pattern.plan[0]!;
  for (const e of pattern.plan) {
    if (e.count > best.count) best = e;
  }
  const yarn = content.yarns.get(best.yarn);
  const color = yarn !== undefined ? content.colors.get(yarn.color) : undefined;
  return color?.hex ?? COLORS.sumiSub;
}

/** 乗り上げか (シートの端が円盤の位置を越える。logic と同じ決まり) */
function overflowing(s: BeamingState, side: 'left' | 'right'): boolean {
  return side === 'left'
    ? s.shiftCm - s.widthCm / 2 < s.leftCm
    : s.shiftCm + s.widthCm / 2 > s.rightCm;
}

/**
 * 盤面を描く。drumAngle は巻いているあいだの筋の流れ (controller が渡す)。
 */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  fit: StageFit,
  s: BeamingState,
  content: Content,
  drumAngle: number,
): void {
  const hex = mainHex(content, s.patternId);

  ctx.fillStyle = COLORS.kinari;
  ctx.fillRect(0, 0, ctx.canvas.clientWidth || ctx.canvas.width, ctx.canvas.clientHeight || ctx.canvas.height);

  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);

  // 1. 奥: 巻き終えたドラム (横に長い円筒。桟と羽の色。帯の縞が流れて見える)
  drawDrum(ctx, hex, drumAngle);

  // 2. 糸のシート (ドラムから斜めに降りてビームへ。縦縞)
  drawSheet(ctx, s, hex);

  // 3. 手前: ビーム (銀色の芯) と巻き太りと緑の円盤
  drawBeam(ctx, s);

  // 4. 幅合わせの段階: 目標の巻き幅の点線と目盛り、円盤の内側の印
  if (s.phase === 'setup') {
    drawTarget(ctx, s);
  }

  ctx.restore();

  // 5. 文字 (変換を戻してから画面 px で描く。20px 以上)
  ctx.font = '20px sans-serif';
  ctx.fillStyle = COLORS.sumi;
  const top = toPx(fit, TOP_TEXT);
  if (s.phase === 'setup') {
    ctx.fillText(`巻き幅 ${s.widthCm}cm。円盤を動かして合わせてください`, top.x, top.y);
  } else {
    ctx.fillText(`巻いた ${Math.round(s.progress * 100)}%`, top.x, top.y);
  }
  // 乗り上げの文字 (20px 以上。朱)
  if (s.phase === 'beaming' && (overflowing(s, 'left') || overflowing(s, 'right'))) {
    ctx.fillStyle = COLORS.shu;
    ctx.font = '24px sans-serif';
    const y = toPx(fit, { x: 0, y: BEAM_AXIS_Y - FLANGE_H / 2 - 20 }).y;
    ctx.fillText('乗り上げ', top.x, y);
  }
}

/** 奥のドラム。帯の縞の筋が drumAngle で流れて見える */
function drawDrum(ctx: CanvasRenderingContext2D, hex: string, drumAngle: number): void {
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(DRUM_RECT.x, DRUM_RECT.y, DRUM_RECT.w, DRUM_RECT.h);
  // 帯の縞 (hex の縦帯。ドラムが回ると横に流れる)
  const period = 44;
  const shift = ((drumAngle * 40) % period + period) % period;
  ctx.fillStyle = hex;
  ctx.globalAlpha = 0.5;
  for (let x = DRUM_RECT.x - period + shift; x < DRUM_RECT.x + DRUM_RECT.w; x += period) {
    ctx.fillRect(x, DRUM_RECT.y, 18, DRUM_RECT.h);
  }
  ctx.globalAlpha = 1;
  // 桟 (木の横線)
  ctx.fillStyle = COLORS.woodLight;
  for (let y = DRUM_RECT.y + 20; y < DRUM_RECT.y + DRUM_RECT.h - 8; y += 36) {
    ctx.fillRect(DRUM_RECT.x, y, DRUM_RECT.w, 6);
  }
  // 羽 (両端の暗い縁)
  ctx.fillStyle = COLORS.sumiSub;
  ctx.fillRect(DRUM_RECT.x, DRUM_RECT.y, 10, DRUM_RECT.h);
  ctx.fillRect(DRUM_RECT.x + DRUM_RECT.w - 10, DRUM_RECT.y, 10, DRUM_RECT.h);
}

/** 糸のシート。上はドラムの下端 (中央)、下はビームの巻き太りの上端 (shiftCm の中心) */
function drawSheet(ctx: CanvasRenderingContext2D, s: BeamingState, hex: string): void {
  if (s.phase === 'setup') return; // 幅合わせのあいだはシートは降りてこない
  const half = (s.widthCm * pxPerCm(s.widthCm)) / 2;
  const topY = SHEET_TOP_Y;
  const bottomY = woundTopY(s.progress);
  const cx = cmToX(s.widthCm, s.shiftCm);
  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.moveTo(cx - half, bottomY);
  ctx.lineTo(cx + half, bottomY);
  ctx.lineTo(BEAM_CENTER_SHEET_TOP_X + half, topY);
  ctx.lineTo(BEAM_CENTER_SHEET_TOP_X - half, topY);
  ctx.closePath();
  ctx.fill();
  // 縦縞 (濃い帯を等間隔で)
  ctx.fillStyle = COLORS.sumi;
  ctx.globalAlpha = 0.25;
  const period = 36;
  const left = cx - half;
  for (let x = left - ((left % period) + period) % period; x < cx + half; x += period) {
    const x0 = Math.max(x, left);
    const x1 = Math.min(x + 14, cx + half);
    if (x1 <= x0) continue;
    // 台形のなかに幅 14px の縞を塗る (上下の端は中央のずれだけ右へずれる)
    ctx.fillRect(x0, bottomY, x1 - x0, topY - bottomY);
  }
  ctx.globalAlpha = 1;
}

const BEAM_CENTER_SHEET_TOP_X = 500; // シートの上端の中心 (ドラムの中央)

/** ビーム (銀色の芯・巻き太り) と緑の円盤 */
function drawBeam(ctx: CanvasRenderingContext2D, s: BeamingState): void {
  const leftX = cmToX(s.widthCm, s.leftCm);
  const rightX = cmToX(s.widthCm, s.rightCm);
  // 巻き太り (糸。progress で上へ伸びる)
  const woundH = Math.min(1, Math.max(0, s.progress)) * BEAM_WOUND_MAX_H;
  if (s.phase !== 'setup' && woundH > 0) {
    ctx.fillStyle = COLORS.machineLight;
    ctx.fillRect(leftX, woundTopY(s.progress), rightX - leftX, woundH);
  }
  // 銀色の芯
  ctx.fillStyle = COLORS.steel;
  ctx.fillRect(leftX, BEAM_AXIS_Y - BEAM_CORE_H / 2, rightX - leftX, BEAM_CORE_H);
  // 円盤 (緑。穴の並び)
  for (const x of [leftX, rightX]) {
    ctx.fillStyle = COLORS.machine;
    ctx.fillRect(x - FLANGE_W / 2, flangeTopY(), FLANGE_W, FLANGE_H);
    ctx.fillStyle = COLORS.sumiSub;
    for (let y = flangeTopY() + 14; y < flangeTopY() + FLANGE_H - 10; y += 22) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // 乗り上げ: その側の円盤の縁を朱で示す
    if (s.phase === 'beaming' && overflowing(s, x === leftX ? 'left' : 'right')) {
      ctx.fillStyle = COLORS.shu;
      ctx.fillRect(x - FLANGE_W / 2 - 4, flangeTopY(), 4, FLANGE_H);
    }
  }
}

/** 幅合わせの目標の点線と目盛り、円盤の内側の印 (藍 = 合っている、朱 = 外れている) */
function drawTarget(ctx: CanvasRenderingContext2D, s: BeamingState): void {
  const half = (s.widthCm * pxPerCm(s.widthCm)) / 2;
  const x0 = BEAM_CENTER_SHEET_TOP_X - half;
  const x1 = BEAM_CENTER_SHEET_TOP_X + half;
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 2;
  // 点線 (偽の Canvas にもある形で描く: 線分を並べる)
  const dash = 10;
  const gap = 8;
  for (let x = x0; x < x1; x += dash + gap) {
    ctx.beginPath();
    ctx.moveTo(x, TARGET_LINE_Y);
    ctx.lineTo(Math.min(x + dash, x1), TARGET_LINE_Y);
    ctx.stroke();
  }
  // 目盛り (10cm ごと)
  ctx.fillStyle = COLORS.sumiSub;
  const perCm = pxPerCm(s.widthCm);
  for (let cm = -Math.floor(s.widthCm / 2 / 10) * 10; cm <= s.widthCm / 2; cm += 10) {
    const x = BEAM_CENTER_SHEET_TOP_X + cm * perCm;
    ctx.fillRect(x - 1, TARGET_LINE_Y, 2, 10);
  }
  // 円盤の内側の線の印 (左は leftCm、右は rightCm が目標に合っているか)
  const targets: Array<{ cm: number; actual: number }> = [
    { cm: -s.widthCm / 2, actual: s.leftCm },
    { cm: s.widthCm / 2, actual: s.rightCm },
  ];
  for (const t of targets) {
    const ok = Math.abs(t.actual - t.cm) <= 1;
    ctx.fillStyle = ok ? COLORS.ai : COLORS.shu;
    const x = cmToX(s.widthCm, t.actual);
    ctx.fillRect(x - 6, TARGET_LINE_Y + 16, 12, 12);
  }
}
