import type { TutorialSpec } from '../../core/game/types';
import { COLORS } from '../../core/ui/tokens';

/**
 * ドラム設定の遊び方 (T2c-03b)。4ページ、文は大人向け。
 * (1) 設定の説明 (2) 厚みの決まり (3) 式と電卓 (4) 試し巻きの判定。
 */

/** 文字を描く (画面上 20px 以上) */
function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillStyle = COLORS.sumi;
  ctx.font = '20px sans-serif';
  ctx.fillText(text, x, y);
}

/** ドラムの表面 (横長の板) と羽の斜面 (右上へ登る) の略図 */
function drawSurface(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(w * 0.1, h * 0.72, w * 0.8, h * 0.1);
  // 羽の斜面 (表面から右上へ)
  ctx.strokeStyle = COLORS.wood;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(w * 0.42, h * 0.72);
  ctx.lineTo(w * 0.78, h * 0.28);
  ctx.stroke();
}

/** 1ページ目: 羽の角度と送り量の設定の略図 */
function drawPage1(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawSurface(ctx, w, h);
  // 羽の角度 (斜面と表面の間の弧)
  ctx.strokeStyle = COLORS.ai;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w * 0.42, h * 0.72, w * 0.12, -Math.PI / 3.6, 0);
  ctx.stroke();
  drawText(ctx, '羽の角度', w * 0.45, h * 0.66);
  // 送り量 (表面の上の矢印)
  ctx.fillStyle = COLORS.ai;
  ctx.fillRect(w * 0.16, h * 0.62, w * 0.16, 6);
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h * 0.62);
  ctx.lineTo(w * 0.30, h * 0.62 - 8);
  ctx.lineTo(w * 0.30, h * 0.62 + 8);
  ctx.closePath();
  ctx.fill();
  drawText(ctx, '1回転で送る量', w * 0.12, h * 0.56);
}

/** 2ページ目: 層が積み上がる略図 (1回転ごとに太る) */
function drawPage2(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawSurface(ctx, w, h);
  // 積み上がる層 (下から3つ。同じ厚み)
  ctx.fillStyle = COLORS.ai;
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(w * 0.2, h * 0.72 - (i + 1) * 14, w * 0.2, 12);
  }
  // 厚みのしるし (両側の矢印)
  ctx.strokeStyle = COLORS.shu;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.44, h * 0.72 - 42);
  ctx.lineTo(w * 0.44, h * 0.72);
  ctx.moveTo(w * 0.44 - 7, h * 0.72 - 35);
  ctx.lineTo(w * 0.44, h * 0.72 - 42);
  ctx.lineTo(w * 0.44 + 7, h * 0.72 - 35);
  ctx.stroke();
  drawText(ctx, '1回転の厚み', w * 0.46, h * 0.5);
}

/** 3ページ目: 直角三角形 (厚み・送り量・角度) の略図 */
function drawPage3(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // 三角形: 底辺 = 送り量、高さ = 厚み、斜辺 = 羽
  const x0 = w * 0.18;
  const y0 = h * 0.7;
  const x1 = w * 0.62;
  const y1 = h * 0.42;
  ctx.strokeStyle = COLORS.wood;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = COLORS.ai;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y1);
  ctx.stroke();
  drawText(ctx, '送り量', w * 0.36, h * 0.78);
  drawText(ctx, '厚み', w * 0.04, h * 0.58);
  drawText(ctx, '羽の角度', x0 + 12, y0 - 10);
}

/** 4ページ目: きれいに登る層と、潰れ・崩れの略図 */
function drawPage4(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawSurface(ctx, w, h);
  // きれいに登る層 (斜面に沿う)
  ctx.fillStyle = COLORS.ai;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(w * 0.2, h * 0.72 - (i + 1) * 12, w * 0.2 + i * 12, 10);
  }
  // 潰れ (斜面を越えてはみ出す)
  ctx.fillStyle = COLORS.shu;
  ctx.fillRect(w * 0.58, h * 0.6, w * 0.14, 10);
  drawText(ctx, '潰れ', w * 0.6, h * 0.56);
  // 崩れ (すき間)
  ctx.fillRect(w * 0.36, h * 0.66, w * 0.12, 10);
  drawText(ctx, '崩れ', w * 0.36, h * 0.62);
}

export const drumsetupTutorial: TutorialSpec = {
  pages: [
    { draw: (ctx, w, h) => drawPage1(ctx, w, h), text: 'ドラムに巻く前に、羽の角度と、1回転で帯を横に送る量を機械に設定します' },
    { draw: (ctx, w, h) => drawPage2(ctx, w, h), text: '帯は1回転ごとに少し太ります。太る厚みは、帯の密度(本数÷幅)と糸の太さで決まります' },
    { draw: (ctx, w, h) => drawPage3(ctx, w, h), text: '送り量 = 厚み ÷ tan(羽の角度)。電卓と表を使えます' },
    { draw: (ctx, w, h) => drawPage4(ctx, w, h), text: '試し巻きで、帯がきれいに羽を登れば成功です。少なすぎると潰れ、多すぎると崩れます' },
  ],
};
