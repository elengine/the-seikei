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

/** 棒 (茶色の横長の棒) を、中心 cx・高さ y に描く。左右に引っぱる部品 */
function drawBar(ctx: CanvasRenderingContext2D, cx: number, y: number, bw: number, bh: number): void {
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(cx - bw / 2, y - bh / 2, bw, bh);
}

/** 矢印 (横向き。dir=-1 で左、1 で右) */
function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, dir: number): void {
  const head = len * 0.25;
  ctx.strokeStyle = COLORS.sumi;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dir * len, y);
  ctx.moveTo(x + dir * len, y);
  ctx.lineTo(x + dir * (len - head), y - head);
  ctx.moveTo(x + dir * len, y);
  ctx.lineTo(x + dir * (len - head), y + head);
  ctx.stroke();
}

/** 2ページ目: ドラムの糸をビームまで引っぱる (線と案内の字) */
export function drawPage2(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawBoardSketch(ctx, w, h, 0, false);
  // ドラムの下の端からビームへ引っぱる糸の線 (指の位置まで)
  ctx.strokeStyle = COLORS.ai;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.38, h * 0.26);
  ctx.quadraticCurveTo(w * 0.42, h * 0.5, w * 0.56, h * 0.72);
  ctx.stroke();
  // 指の位置の丸
  ctx.fillStyle = COLORS.ai;
  ctx.beginPath();
  ctx.arc(w * 0.56, h * 0.72, 10, 0, Math.PI * 2);
  ctx.fill();
  drawText(ctx, '引っぱる', w * 0.62, h * 0.78);
}

/** 張りのメーター (緑の範囲の帯と針) を描く (操作欄のメーターと同じ形) */
function drawMeter(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const mX = w * 0.24;
  const mW = w * 0.52;
  const mY = h * 0.8;
  ctx.fillStyle = COLORS.kinariDeep;
  ctx.fillRect(mX, mY, mW, h * 0.05);
  ctx.fillStyle = COLORS.lampOk;
  ctx.fillRect(mX + mW * 0.45, mY, mW * 0.25, h * 0.05); // 緑の範囲 (巻き量で動く)
  ctx.fillStyle = COLORS.sumi;
  ctx.fillRect(mX + mW * 0.6, mY - h * 0.012, 4, h * 0.074); // 針
  ctx.strokeStyle = COLORS.steel;
  ctx.strokeRect(mX, mY, mW, h * 0.05);
}

/** 3ページ目: 茶色の棒と張りのメーター (緑の範囲は巻き量で動く) */
export function drawPage3(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawBoardSketch(ctx, w, h, 0, false);
  const barY = h * 0.56;
  drawBar(ctx, w * 0.62, barY, w * 0.36, h * 0.05);
  drawArrow(ctx, w * 0.82, barY - h * 0.07, w * 0.1, 1);
  drawMeter(ctx, w, h);
  drawText(ctx, '張りのメーター', w * 0.32, h * 0.83);
}

/** 4ページ目: 止めて完了 (棒は左端・完了のボタンと 100% の目印) */
export function drawPage4(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawBoardSketch(ctx, w, h, w * 0.06, false);
  drawBar(ctx, w * 0.32, h * 0.56, w * 0.36, h * 0.05); // 棒は左端 (止めた形)
  // 100% ちょうどの目印
  ctx.fillStyle = COLORS.shu;
  ctx.fillRect(w * 0.79, h * 0.3, 4, h * 0.45);
  drawText(ctx, '100%', w * 0.7, h * 0.26);
  // 完了のボタン (95% を超えたら止めて完了する)
  const cX = w * 0.62;
  const cY = h * 0.9;
  ctx.fillStyle = COLORS.ai;
  ctx.fillRect(cX, cY - h * 0.035, w * 0.2, h * 0.07);
  ctx.fillStyle = COLORS.white; // 紺のボタンの上の文字は白
  drawText(ctx, '完了', cX + w * 0.1, cY + h * 0.018);
}

export const beamingTutorial: TutorialSpec = {
  pages: [
    {
      draw: (ctx, w, h) => drawPage1(ctx, w, h),
      text: 'ビームの両端の円盤を左右に引っぱって、巻き幅に合わせます。合わせたら『ビーム設定OK』を押します',
    },
    {
      draw: (ctx, w, h) => drawPage2(ctx, w, h),
      text: 'ドラムの糸の端を、指でビームまで引っぱって離すと、糸がビームに付きます',
    },
    {
      draw: (ctx, w, h) => drawPage3(ctx, w, h),
      text: '茶色の棒を右へ引っぱると巻き始めます。張りのメーターの緑の範囲に入るように、速さを合わせます。緑の範囲は、巻き量に合わせて動きます',
    },
    {
      draw: (ctx, w, h) => drawPage4(ctx, w, h),
      text: '巻き量が 95% を超えたら、棒を左端まで戻して止め、『完了』を押します。100% で止めるといちばんよい結果です。101% に届くと糸が切れます',
    },
  ],
};
