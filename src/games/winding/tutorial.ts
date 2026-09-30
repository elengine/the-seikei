import type { TutorialSpec } from '../../core/game/types';
import { COLORS } from '../../core/ui/tokens';

/**
 * ドラム巻きの遊び方 (P2 T2-07)。3ページ、文は大人向け。
 * 文の {{…}} は表示側で terms.render により呼び名に置き換わる (T1-20)。
 */

/** ドラムの略図 (桟のかご状の胴と、帯の区画) */
function drawDrum(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(x, y, w, 12);
  ctx.fillRect(x, y + h - 12, w, 12);
  ctx.fillStyle = COLORS.machine;
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(x + (w / 5) * i + 6, y + 12, 5, h - 24);
  }
}

/** 1ページ目: クリールからドラムへ帯を巻く略図 */
function drawPage1(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // クリール (枠とコーン)
  const creelX = w * 0.08;
  const creelW = w * 0.2;
  ctx.strokeStyle = COLORS.machineDark;
  ctx.lineWidth = 3;
  ctx.strokeRect(creelX, h * 0.25, creelW, h * 0.5);
  ctx.fillStyle = COLORS.ai;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(creelX + creelW / 2, h * 0.35 + i * h * 0.14, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  // 糸 (クリールからドラムへ)
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(creelX + creelW, h * 0.4);
  ctx.lineTo(w * 0.42, h * 0.4);
  ctx.lineTo(w * 0.5, h * 0.45);
  ctx.stroke();
  // ドラム
  drawDrum(ctx, w * 0.58, h * 0.3, w * 0.34, h * 0.4);
  // 巻かれた帯 (紺の縞)
  ctx.fillStyle = COLORS.ai;
  ctx.fillRect(w * 0.58, h * 0.56, w * 0.17, h * 0.12);
}

/** 2ページ目: ペダルの横木と張りのメーターの略図 */
function drawPage2(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // 溝と横木
  const gX = w * 0.14;
  const gW = w * 0.1;
  ctx.fillStyle = COLORS.white;
  ctx.strokeStyle = COLORS.steel;
  ctx.lineWidth = 2;
  ctx.fillRect(gX, h * 0.2, gW, h * 0.6);
  ctx.strokeRect(gX, h * 0.2, gW, h * 0.6);
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(gX + 4, h * 0.62, gW - 8, h * 0.12);
  // 張りのメーター (帯と針)
  const mX = w * 0.32;
  const mW = w * 0.5;
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(mX, h * 0.3, mW, h * 0.09);
  ctx.strokeRect(mX, h * 0.3, mW, h * 0.09);
  ctx.fillStyle = COLORS.machineLight;
  ctx.fillRect(mX + mW * 0.3, h * 0.3, mW * 0.4, h * 0.09);
  ctx.fillStyle = COLORS.sumi;
  ctx.fillRect(mX + mW * 0.55, h * 0.27, 3, h * 0.15);
  // 「強すぎ」の帯を上に塗る (示意)
  ctx.fillStyle = COLORS.shu;
  ctx.fillRect(mX + mW * 0.9, h * 0.3, mW * 0.1, h * 0.09);
}

/** 3ページ目: 切れた糸の両端を押してつなぐ略図 */
function drawPage3(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // 糸 (途中で切れて両側に垂れる)
  const y = h * 0.4;
  ctx.strokeStyle = COLORS.shu;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.1, y);
  ctx.lineTo(w * 0.4, y);
  ctx.quadraticCurveTo(w * 0.42, y + h * 0.12, w * 0.42, y + h * 0.16);
  ctx.moveTo(w * 0.86, y);
  ctx.lineTo(w * 0.56, y);
  ctx.quadraticCurveTo(w * 0.54, y + h * 0.12, w * 0.54, y + h * 0.16);
  ctx.stroke();
  // 丸印 (押すところ)
  ctx.strokeStyle = COLORS.ai;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w * 0.42, y + h * 0.16, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w * 0.54, y + h * 0.16, 12, 0, Math.PI * 2);
  ctx.stroke();
  // つながった糸 (下)
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.75);
  ctx.lineTo(w * 0.86, h * 0.75);
  ctx.stroke();
}

export const windingTutorial: TutorialSpec = {
  pages: [
    { draw: (ctx, w, h) => drawPage1(ctx, w, h), text: 'クリールの糸を帯にまとめて、ドラムに巻いていきます' },
    {
      draw: (ctx, w, h) => drawPage2(ctx, w, h),
      text: '{{pedal}}を踏むと巻き始めます。速すぎると張りが強くなり、糸が切れやすくなります',
    },
    {
      draw: (ctx, w, h) => drawPage3(ctx, w, h),
      text: '糸が切れたら機械が止まります。切れた糸の両端を順に押して、つないでください',
    },
  ],
};
