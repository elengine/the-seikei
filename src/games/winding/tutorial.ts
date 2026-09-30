import type { TutorialSpec } from '../../core/game/types';
import { COLORS } from '../../core/ui/tokens';

/**
 * ドラム巻きの遊び方 (P2 T2-07・T2-12)。5ページ、文は大人向け。
 * T2-09〜T2-11 で変わった遊び方 (張りが流れる・引っかかる、適正な範囲が動く、
 * 1〜3本切れる、同じ糸の両端をつなぐ、目標の時間) を説明する。
 * 文の {{…}} は表示側で terms.render により呼び名に置き換わる (T1-20)。
 */

/** ドラムの略図 (軸は縦: 円盤は上と下、桟は縦長の板を左右に並べる。盤面と同じ向き。T2-08 追加修正2) */
function drawDrum(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 端の円盤 (上と下。横長の板)
  ctx.fillStyle = COLORS.steel;
  ctx.fillRect(x, y, w, 12);
  ctx.fillRect(x, y + h - 12, w, 12);
  // 桟 (縦長の板を左右にすき間をあけて並べる)
  ctx.fillStyle = COLORS.wood;
  const slatW = 12;
  const gap = 14;
  for (let sx = x + 8; sx + slatW < x + w; sx += slatW + gap) {
    ctx.fillRect(sx, y + 12, slatW, h - 24);
  }
}

/** 文字を描く (画面上 20px 以上。T2-12) */
function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillStyle = COLORS.sumi;
  ctx.font = '20px sans-serif';
  ctx.fillText(text, x, y);
}

/** 1ページ目: クリールからドラムへ帯を巻く略図 */
export function drawPage1(ctx: CanvasRenderingContext2D, w: number, h: number): void {
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
  // 巻かれた帯 (一番上の区画に横の縞)
  ctx.fillStyle = COLORS.ai;
  ctx.fillRect(w * 0.58, h * 0.3 + 12, w * 0.34, 10);
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
  // 説明の文字
  drawText(ctx, 'ふかく踏むほど速い', mX + mW * 0.28, h * 0.62);
}

/** 3ページ目: 張りの流れと、適正の帯が動く略図 (T2-12) */
function drawPage3(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const mX = w * 0.2;
  const mW = w * 0.6;
  const mY = h * 0.4;
  // メーターの帯
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(mX, mY, mW, h * 0.09);
  ctx.strokeStyle = COLORS.steel;
  ctx.lineWidth = 2;
  ctx.strokeRect(mX, mY, mW, h * 0.09);
  // 適正の帯 (緑み。帯の中に少し左によった位置)
  ctx.fillStyle = COLORS.machineLight;
  ctx.fillRect(mX + mW * 0.25, mY, mW * 0.3, h * 0.09);
  // 適正の帯が左右に動く矢印 (← →)
  ctx.fillStyle = COLORS.sumiSub;
  const arrowY = mY + h * 0.16;
  for (const dir of [-1, 1]) {
    const tipX = mX + mW * 0.4 + dir * mW * 0.22;
    ctx.beginPath();
    ctx.moveTo(tipX, arrowY);
    ctx.lineTo(tipX - dir * 26, arrowY - 9);
    ctx.lineTo(tipX - dir * 26, arrowY + 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(Math.min(tipX - dir * 26, tipX - dir * 4), arrowY - 3, 22, 6);
  }
  // 針 (今の張り)
  ctx.fillStyle = COLORS.sumi;
  ctx.fillRect(mX + mW * 0.52, mY - h * 0.03, 3, h * 0.15);
  // 引っかかると急に強くなる印 (朱の小さな三角形)
  ctx.fillStyle = COLORS.shu;
  ctx.beginPath();
  ctx.moveTo(mX + mW * 0.85, mY - 10);
  ctx.lineTo(mX + mW * 0.85 - 9, mY - 26);
  ctx.lineTo(mX + mW * 0.85 + 9, mY - 26);
  ctx.closePath();
  ctx.fill();
  drawText(ctx, '▲ ときどき引っかかる', mX + mW * 0.6, mY - h * 0.08);
}

/** 4ページ目: 切れた糸が2本。同じ糸の両端に同じ印 (T2-12) */
function drawPage4(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // 糸2本 (それぞれ途中で切れて両側に垂れる)。糸1は上、糸2は下
  const rows = [
    { y: h * 0.32, ring: COLORS.ai },
    { y: h * 0.58, ring: COLORS.steel },
  ];
  ctx.lineWidth = 3;
  for (const row of rows) {
    ctx.strokeStyle = COLORS.shu;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, row.y);
    ctx.lineTo(w * 0.4, row.y);
    ctx.quadraticCurveTo(w * 0.42, row.y + h * 0.08, w * 0.42, row.y + h * 0.1);
    ctx.moveTo(w * 0.92, row.y);
    ctx.lineTo(w * 0.58, row.y);
    ctx.quadraticCurveTo(w * 0.56, row.y + h * 0.08, w * 0.56, row.y + h * 0.1);
    ctx.stroke();
    // 同じ糸の両端に同じ色の丸印
    ctx.strokeStyle = row.ring;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(w * 0.42, row.y + h * 0.1, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w * 0.56, row.y + h * 0.1, 13, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawText(ctx, '同じ印どうしをつなぐ', w * 0.3, h * 0.82);
}

/** 5ページ目: 経過時間と目標の時間の略図 (T2-12) */
function drawPage5(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // 操作欄の時間の表示 (「0:42 / 1:30」)
  const tX = w * 0.3;
  const tY = h * 0.42;
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(tX, tY - 34, w * 0.4, 48);
  ctx.strokeStyle = COLORS.steel;
  ctx.lineWidth = 2;
  ctx.strokeRect(tX, tY - 34, w * 0.4, 48);
  drawText(ctx, '0:42 / 1:30', tX + 16, tY);
  // 星3の説明の星 (3つ)
  ctx.fillStyle = COLORS.steel;
  for (let i = 0; i < 3; i++) {
    drawStar(ctx, w * 0.42 + i * 60, h * 0.66, 22);
  }
}

/** 星の形を塗る */
function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const ang = -Math.PI / 2 + (Math.PI * i) / 5;
    const px = x + Math.cos(ang) * rad;
    const py = y + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

export const windingTutorial: TutorialSpec = {
  pages: [
    { draw: (ctx, w, h) => drawPage1(ctx, w, h), text: 'クリールの糸を{{section}}にまとめて、{{drum}}に巻いていきます' },
    {
      draw: (ctx, w, h) => drawPage2(ctx, w, h),
      text: '{{pedal}}を踏むと巻き始めます。深く踏むほど速く巻けますが、張りも強くなります',
    },
    {
      draw: (ctx, w, h) => drawPage3(ctx, w, h),
      text: '張りは少しずつ流れ、ときどき糸が引っかかって急に強くなります。緑の適正な範囲も、少しずつ動きます。メーターを見ながら{{pedal}}を合わせ続けてください',
    },
    {
      draw: (ctx, w, h) => drawPage4(ctx, w, h),
      text: '張りが強すぎると糸が切れて、機械が止まります。強すぎるほど、何本も切れます。切れた糸は、同じ糸のクリール側とドラム側の切れ端を押してつなぎます。別の糸の端とは、つながりません',
    },
    {
      draw: (ctx, w, h) => drawPage5(ctx, w, h),
      text: '星3は、適正な張りで巻いた割合が8割以上で、目標の時間内に巻き終えたときです。時間の制限はありません',
    },
  ],
};
