import type { TutorialSpec } from '../../core/game/types';
import { COLORS } from '../../core/ui/tokens';

/**
 * ドラム設定の遊び方 (T2c-03b)。4ページ、文は大人向け。
 * (1) 設定の説明 (2) 厚みの決まり (3) 式と電卓 (4) 巻いて確かめる判定。
 * 羽は左に開き、層は羽の斜面に沿って左へ登る (本編と同じ・T2c-04a 4)。
 */

/** 文字を描く (画面上 24px 以上。T2c-04a 4) */
function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillStyle = COLORS.sumi;
  ctx.font = '24px sans-serif';
  ctx.fillText(text, x, y);
}

/** ドラムの表面 (横長の板) と羽の斜面 (左上へ登る・厚い板) の略図 */
function drawSurface(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(w * 0.1, h * 0.72, w * 0.8, h * 0.1);
  // 羽の斜面 (表面の右側から左上へ。厚い板)
  ctx.strokeStyle = COLORS.wood;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(w * 0.58, h * 0.72);
  ctx.lineTo(w * 0.22, h * 0.28);
  ctx.stroke();
}

/** 1ページ目: 羽の角度と送り量の設定の略図 */
function drawPage1(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawSurface(ctx, w, h);
  // 羽の角度 (斜面と表面の間の弧。斜面は左上)
  ctx.strokeStyle = COLORS.ai;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w * 0.58, h * 0.72, w * 0.12, Math.PI, Math.PI + Math.PI / 3.6);
  ctx.stroke();
  drawText(ctx, '羽の角度', w * 0.62, h * 0.66);
  // 送り量 (表面の上の矢印。左向き)
  ctx.fillStyle = COLORS.ai;
  ctx.fillRect(w * 0.16, h * 0.62, w * 0.16, 6);
  ctx.beginPath();
  ctx.moveTo(w * 0.14, h * 0.62);
  ctx.lineTo(w * 0.18, h * 0.62 - 8);
  ctx.lineTo(w * 0.18, h * 0.62 + 8);
  ctx.closePath();
  ctx.fill();
  drawText(ctx, '1回転で送る量', w * 0.1, h * 0.56);
}

/** 2ページ目: 層が積み上がる略図 (1回転ごとに太る) */
function drawPage2(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawSurface(ctx, w, h);
  // 積み上がる層 (下から3つ。左の端が斜面に沿って左へ)
  ctx.fillStyle = COLORS.ai;
  for (let i = 1; i <= 3; i++) {
    const left = w * (0.58 - i * 0.04);
    ctx.fillRect(left, h * 0.72 - i * 14, w * 0.58 - left, 12);
  }
  // 厚みのしるし (層の右側の矢印)
  ctx.strokeStyle = COLORS.shu;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.62, h * 0.72 - 42);
  ctx.lineTo(w * 0.62, h * 0.72);
  ctx.moveTo(w * 0.62 - 7, h * 0.72 - 35);
  ctx.lineTo(w * 0.62, h * 0.72 - 42);
  ctx.lineTo(w * 0.62 + 7, h * 0.72 - 35);
  ctx.stroke();
  drawText(ctx, '1回転の厚み', w * 0.64, h * 0.5);
}

/** 3ページ目: 直角三角形 (厚み・送り量・角度) の略図 */
function drawPage3(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // 三角形: 底辺 = 送り量、高さ = 厚み、斜辺 = 羽 (右下が直角。斜辺は左上)
  const x0 = w * 0.28;
  const y0 = h * 0.7;
  const x1 = w * 0.72;
  const y1 = h * 0.42;
  ctx.strokeStyle = COLORS.wood;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x1, y0);
  ctx.lineTo(x0, y1);
  ctx.stroke();
  ctx.strokeStyle = COLORS.ai;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.moveTo(x1, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  drawText(ctx, '送り量', w * 0.42, h * 0.78);
  drawText(ctx, '厚み', x1 + 12, h * 0.58);
  drawText(ctx, '羽の角度', x1 - w * 0.2, y0 - 14);
}

/** 4ページ目: きれいに登る層と、潰れ・崩れの略図 */
function drawPage4(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawSurface(ctx, w, h);
  // きれいに登る層 (斜面に沿って左へ)
  ctx.fillStyle = COLORS.ai;
  for (let i = 1; i <= 4; i++) {
    const left = w * (0.58 - i * 0.05);
    ctx.fillRect(left, h * 0.72 - i * 12, w * 0.58 - left, 10);
  }
  // 潰れ (ほぼ真上に積もってふくらむ)
  ctx.fillStyle = COLORS.shu;
  ctx.fillRect(w * 0.56, h * 0.6, w * 0.1, 10);
  ctx.fillRect(w * 0.54, h * 0.53, w * 0.12, 10);
  drawText(ctx, '潰れ', w * 0.56, h * 0.49);
  // 崩れ (すき間)
  ctx.fillRect(w * 0.38, h * 0.66, w * 0.1, 8);
  ctx.fillRect(w * 0.4, h * 0.56, w * 0.1, 8);
  drawText(ctx, '崩れ', w * 0.3, h * 0.5);
}

export const drumsetupTutorial: TutorialSpec = {
  pages: [
    { draw: (ctx, w, h) => drawPage1(ctx, w, h), text: 'ドラムに巻く前に、羽の角度と、1回転で帯を横に送る量を機械に設定します' },
    { draw: (ctx, w, h) => drawPage2(ctx, w, h), text: '帯は1回転ごとに少し太ります。太る厚みは、帯の密度(本数÷幅)と糸の太さで決まります' },
    { draw: (ctx, w, h) => drawPage3(ctx, w, h), text: '送り量 = 厚み ÷ tan(羽の角度)。電卓と表を使えます' },
    { draw: (ctx, w, h) => drawPage4(ctx, w, h), text: '「巻く」で確かめます。帯がきれいに羽を登れば成功です。少なすぎると潰れ、多すぎると崩れます' },
  ],
};
