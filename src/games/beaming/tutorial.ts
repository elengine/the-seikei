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

/** 2ページ目: 茶色の棒を左右に引っぱって速さを変える (矢印と「速さ」の数字) と巻き量の帯 */
export function drawPage2(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawBoardSketch(ctx, w, h, 0, false);
  // 茶色の棒 (横長。盤面のガイドの棒と同じ色) と左右の矢印
  const barY = h * 0.58;
  drawBar(ctx, w * 0.5, barY, w * 0.36, h * 0.05);
  drawArrow(ctx, w * 0.3, barY - h * 0.07, w * 0.14, -1);
  drawArrow(ctx, w * 0.7, barY - h * 0.07, w * 0.14, 1);
  ctx.textAlign = 'center';
  drawText(ctx, '←遅く', w * 0.2, barY - h * 0.1);
  drawText(ctx, '速く→', w * 0.8, barY - h * 0.1);
  // 「速さ 63」(適正の藍)
  ctx.fillStyle = COLORS.ai;
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('速さ 63', w * 0.5, barY + h * 0.11);
  ctx.textAlign = 'start';
  // 巻き量の帯 (適正な速さの区間)
  const gX = w * 0.24;
  const gW = w * 0.52;
  const gY = h * 0.84;
  ctx.fillStyle = COLORS.kinariDeep;
  ctx.fillRect(gX, gY, gW, h * 0.05);
  ctx.fillStyle = COLORS.machineLight;
  ctx.fillRect(gX, gY, gW * 0.5, h * 0.05);
  ctx.fillStyle = COLORS.shu;
  ctx.fillRect(gX + gW - 3, gY, 3, h * 0.05); // 100% の線 (ここを超えると切れる)
  ctx.strokeStyle = COLORS.steel;
  ctx.strokeRect(gX, gY, gW, h * 0.05);
  drawText(ctx, '巻き量の帯', gX + gW * 0.28, gY + h * 0.038);
}

/** 3ページ目: 止めるタイミング (棒を左端まで戻す・確認のボタンと 100% の目印) */
export function drawPage3(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawBoardSketch(ctx, w, h, w * 0.06, false);
  drawBar(ctx, w * 0.32, h * 0.58, w * 0.36, h * 0.05); // 棒は左端 (止めた形)
  // 100% ちょうどの目印 (巻き量の帯の右端)
  ctx.fillStyle = COLORS.shu;
  ctx.fillRect(w * 0.79, h * 0.3, 4, h * 0.45);
  drawText(ctx, '100%', w * 0.7, h * 0.26);
  // 確認のボタン (95% を超えたら止めて確認する)
  const cX = w * 0.62;
  const cY = h * 0.9;
  ctx.fillStyle = COLORS.ai;
  ctx.fillRect(cX, cY - h * 0.035, w * 0.2, h * 0.07);
  ctx.fillStyle = COLORS.white; // 紺のボタンの上の文字は白
  drawText(ctx, '確認', cX + w * 0.1, cY + h * 0.018);
}

export const beamingTutorial: TutorialSpec = {
  pages: [
    {
      draw: (ctx, w, h) => drawPage1(ctx, w, h),
      text: 'ビームの両端の円盤を左右に引っぱって、巻き幅に合わせます。合わせたら「巻き始める」を押します',
    },
    {
      draw: (ctx, w, h) => drawPage2(ctx, w, h),
      text: '茶色の棒を右へ引っぱるほど速く巻けます。巻き量ごとにちょうどよい速さがあり、「速さ」の数字が藍色ならちょうどよい速さです',
    },
    {
      draw: (ctx, w, h) => drawPage3(ctx, w, h),
      text: '巻き量が 95% を超えたら、棒を左端まで戻して止め、「確認」を押します。100% で止めるといちばんよい結果です。101% に届くと糸が切れます',
    },
  ],
};
