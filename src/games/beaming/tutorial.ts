import type { TutorialSpec } from '../../core/game/types';
import { COLORS } from '../../core/ui/tokens';

/**
 * ビーム巻きの遊び方 (P3 T3-03b)。3ページ、文は大人向け。
 * 絵は盤面と同じ見た目 (奥にドラム・手前にビームと緑の円盤・斜めに降りる糸のシート)。
 * 文の {{…}} は表示側で terms.render により呼び名に置き換わる。
 */

/** 文字を描く (画面上 20px 以上) */
function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillStyle = COLORS.sumi;
  ctx.font = '20px sans-serif';
  ctx.fillText(text, x, y);
}

/** 盤面と同じ見た目の略図 (ドラム・シート・ビームと緑の円盤)。shiftCm でシートの中心をずらせる */
function drawBoardSketch(ctx: CanvasRenderingContext2D, w: number, h: number, shiftPx: number, dashed: boolean): void {
  // 奥: 巻き終えたドラム (横に長い。帯の縞)
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(w * 0.12, h * 0.12, w * 0.76, h * 0.16);
  ctx.fillStyle = COLORS.ai;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(w * 0.14 + i * w * 0.12, h * 0.12, w * 0.05, h * 0.16);
  }
  ctx.globalAlpha = 1;
  // シート (ドラムから斜めに降りてビームへ)
  const topY = h * 0.28;
  const bottomY = h * 0.68;
  const half = w * 0.2;
  ctx.fillStyle = COLORS.ai;
  ctx.beginPath();
  ctx.moveTo(w * 0.5 - half + shiftPx, bottomY);
  ctx.lineTo(w * 0.5 + half + shiftPx, bottomY);
  ctx.lineTo(w * 0.5 + half, topY);
  ctx.lineTo(w * 0.5 - half, topY);
  ctx.closePath();
  ctx.fill();
  // ビームの巻き太りと銀色の芯
  ctx.fillStyle = COLORS.machineLight;
  ctx.fillRect(w * 0.22, h * 0.62, w * 0.56, h * 0.06);
  ctx.fillStyle = COLORS.steel;
  ctx.fillRect(w * 0.22, h * 0.68, w * 0.56, h * 0.04);
  // 緑の円盤 (両端)
  ctx.fillStyle = COLORS.machine;
  ctx.fillRect(w * 0.19, h * 0.52, w * 0.03, h * 0.24);
  ctx.fillRect(w * 0.78, h * 0.52, w * 0.03, h * 0.24);
  // 幅合わせの目標の点線
  if (dashed) {
    ctx.strokeStyle = COLORS.sumiSub;
    ctx.lineWidth = 2;
    const y = h * 0.82;
    for (let x = w * 0.22; x < w * 0.78; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(Math.min(x + 8, w * 0.78), y);
      ctx.stroke();
    }
  }
}

/** 1ページ目: 幅合わせ (円盤を動かして巻き幅に合わせる) */
export function drawPage1(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawBoardSketch(ctx, w, h, 0, true);
  drawText(ctx, '←→ 円盤を動かす', w * 0.24, h * 0.9);
}

/** 2ページ目: ペダルと張りのメーター */
export function drawPage2(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawBoardSketch(ctx, w, h, 0, false);
  // 張りのメーター (適正の緑の帯と針)
  const mX = w * 0.2;
  const mW = w * 0.6;
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(mX, h * 0.86, mW, h * 0.07);
  ctx.strokeStyle = COLORS.steel;
  ctx.lineWidth = 2;
  ctx.strokeRect(mX, h * 0.86, mW, h * 0.07);
  ctx.fillStyle = COLORS.machineLight;
  ctx.fillRect(mX + mW * 0.3, h * 0.86, mW * 0.4, h * 0.07);
  ctx.fillStyle = COLORS.sumi;
  ctx.fillRect(mX + mW * 0.55, h * 0.83, 3, h * 0.13);
  drawText(ctx, '張りのメーター', mX + mW * 0.28, h * 0.98);
}

/** 3ページ目: 偏りと乗り上げ (シートが右に寄って円盤に乗り上げている) */
export function drawPage3(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawBoardSketch(ctx, w, h, w * 0.06, false);
  // 乗り上げ: 右の円盤の縁を朱で示す
  ctx.fillStyle = COLORS.shu;
  ctx.fillRect(w * 0.775, h * 0.52, w * 0.008, h * 0.24);
  drawText(ctx, '乗り上げ', w * 0.62, h * 0.48);
  drawText(ctx, '寄せる', w * 0.12, h * 0.9);
}

export const beamingTutorial: TutorialSpec = {
  pages: [
    {
      draw: (ctx, w, h) => drawPage1(ctx, w, h),
      text: '巻き終えたドラムから、全部の糸をビームに巻き返します。まず、ビームの両端の円盤を動かして、巻き幅に合わせます',
    },
    {
      draw: (ctx, w, h) => drawPage2(ctx, w, h),
      text: '{{pedal}}で巻きます。張りが均一になるよう、メーターを見ながら合わせます',
    },
    {
      draw: (ctx, w, h) => drawPage3(ctx, w, h),
      text: 'ドラムのほうが幅が広いので、糸が左右に寄っていきます。寄せるボタンで中央に保ちます。円盤に乗り上げると出来が下がります',
    },
  ],
};
