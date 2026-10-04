import type { TutorialSpec } from '../../core/game/types';
import { COLORS } from '../../core/ui/tokens';

/**
 * ビーム巻きの遊び方 (P3 T3-03b)。3ページ、文は大人向け。
 * 絵は盤面と同じ作り (奥に横に寝たドラム・ガイドの棒・手前に銀色の軸と左右の円盤)。
 * 文の {{…}} は表示側で terms.render により呼び名に置き換わる。
 */

/** 文字を描く (画面上 20px 以上) */
function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillStyle = COLORS.sumi;
  ctx.font = '20px sans-serif';
  ctx.fillText(text, x, y);
}

/** 盤面と同じ作りの略図 (奥に横に寝たドラム・縦の糸の筋・ガイドの棒・手前に銀色の軸と左右の楕円の円盤・巻き)。shiftPx でシートをずらせる */
function drawBoardSketch(ctx: CanvasRenderingContext2D, w: number, h: number, shiftPx: number, dashed: boolean): void {
  // 奥: 横に寝たドラム (縦の糸の筋。両端は楕円)
  const dx = w * 0.12;
  const dw = w * 0.76;
  const dy = h * 0.08;
  const dh = h * 0.18;
  ctx.fillStyle = COLORS.ai;
  ctx.fillRect(dx, dy, dw, dh);
  ctx.strokeStyle = COLORS.white;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  for (let x = dx + 6; x < dx + dw; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, dy);
    ctx.lineTo(x, dy + dh);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.wood;
  for (const ex of [dx, dx + dw]) {
    ctx.beginPath();
    ctx.ellipse(ex, dy + dh / 2, w * 0.02, dh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // シート (ドラムから降りてビームへ)
  const topY = dy + dh;
  const bottomY = h * 0.66;
  const half = w * 0.2;
  ctx.fillStyle = COLORS.ai;
  ctx.beginPath();
  ctx.moveTo(w * 0.5 - half + shiftPx, bottomY);
  ctx.lineTo(w * 0.5 + half + shiftPx, bottomY);
  ctx.lineTo(w * 0.5 + half, topY);
  ctx.lineTo(w * 0.5 - half, topY);
  ctx.closePath();
  ctx.fill();
  // ガイドの棒 (茶色の細い横棒)
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(w * 0.2, h * 0.45, w * 0.6, h * 0.025);
  // ビーム: 銀色の軸 (円盤の外へ飛び出す)・巻き・左右の円盤 (楕円)
  const axisY = h * 0.68;
  ctx.fillStyle = COLORS.steel;
  ctx.fillRect(w * 0.1, axisY - h * 0.015, w * 0.8, h * 0.03);
  ctx.fillStyle = COLORS.ai;
  ctx.fillRect(w * 0.22, axisY - h * 0.07, w * 0.56, h * 0.14);
  ctx.fillStyle = COLORS.flange;
  for (const fx of [w * 0.22, w * 0.78]) {
    ctx.beginPath();
    ctx.ellipse(fx, axisY, w * 0.02, h * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 幅合わせの目標の点線
  if (dashed) {
    ctx.strokeStyle = COLORS.sumiSub;
    ctx.lineWidth = 2;
    const y = h * 0.86;
    for (let x = w * 0.22; x < w * 0.78; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(Math.min(x + 8, w * 0.78), y);
      ctx.stroke();
    }
  }
}

/** 1ページ目: 幅合わせ (円盤を絵の上で引っぱって巻き幅に合わせる) */
export function drawPage1(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawBoardSketch(ctx, w, h, 0, true);
  drawText(ctx, '円盤を引っぱる', w * 0.38, h * 0.96);
}

/** 2ページ目: ペダルと張りのメーター */
export function drawPage2(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawBoardSketch(ctx, w, h, 0, false);
  // 張りのメーター (適正の緑の帯と針)
  const mX = w * 0.2;
  const mW = w * 0.6;
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(mX, h * 0.84, mW, h * 0.07);
  ctx.strokeStyle = COLORS.steel;
  ctx.lineWidth = 2;
  ctx.strokeRect(mX, h * 0.84, mW, h * 0.07);
  ctx.fillStyle = COLORS.machineLight;
  ctx.fillRect(mX + mW * 0.3, h * 0.84, mW * 0.4, h * 0.07);
  ctx.fillStyle = COLORS.sumi;
  ctx.fillRect(mX + mW * 0.55, h * 0.81, 3, h * 0.13);
  drawText(ctx, '張りのメーター', mX + mW * 0.28, h * 0.98);
}

/** 3ページ目: 偏りと乗り上げ (シートが右に寄って円盤に乗り上げている) */
export function drawPage3(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawBoardSketch(ctx, w, h, w * 0.06, false);
  // 乗り上げ: 右の円盤の縁を朱で示す
  ctx.fillStyle = COLORS.shu;
  ctx.strokeStyle = COLORS.shu;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(w * 0.78, h * 0.68, w * 0.02, h * 0.13, 0, 0, Math.PI * 2);
  ctx.stroke();
  drawText(ctx, '乗り上げ', w * 0.62, h * 0.48);
  drawText(ctx, '寄せる', w * 0.12, h * 0.96);
}

export const beamingTutorial: TutorialSpec = {
  pages: [
    {
      draw: (ctx, w, h) => drawPage1(ctx, w, h),
      text: '巻き終えたドラムから、全部の糸をビームに巻き返します。まず、ビームの両端の円盤を絵の上で左右に引っぱって、巻き幅に合わせます',
    },
    {
      draw: (ctx, w, h) => drawPage2(ctx, w, h),
      text: '{{pedal}}の溝を指でなぞって上げ下げし、巻き進めます。張りが均一になるよう、メーターを見ながら合わせます。巻き量は操作欄の上に出ます',
    },
    {
      draw: (ctx, w, h) => drawPage3(ctx, w, h),
      text: 'ドラムのほうが幅が広いので、糸が左右に寄っていきます。寄せるボタンで中央に保ちます。円盤に乗り上げると出来が下がります',
    },
  ],
};
