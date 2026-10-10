import type { TutorialSpec } from '../../core/game/types';
import { COLORS } from '../../core/ui/tokens';

/**
 * ドラム巻きの遊び方 (P2 T2-07・T2-12)。5ページ、文は大人向け。
 * T2-09〜T2-11 で変わった遊び方 (張りが流れる・引っかかる、適正な範囲が動く、
 * 1〜3本切れる、切れたあたりを1回押してつなぐ、目標の時間) を説明する。
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

/** 2ページ目: 横向きのペダルの溝 (横木を指で右へ動かす) と張りのメーターの略図 (PU-14d) */
function drawPage2(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // 溝 (横長) と横木。右へ動かすほど速い
  const gX = w * 0.12;
  const gW = w * 0.76;
  const gY = h * 0.5;
  const gH = h * 0.14;
  ctx.fillStyle = COLORS.white;
  ctx.strokeStyle = COLORS.steel;
  ctx.lineWidth = 2;
  ctx.fillRect(gX, gY, gW, gH);
  ctx.strokeRect(gX, gY, gW, gH);
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(gX + gW * 0.58, gY + 4, w * 0.1, gH - 8);
  // 右へ動かす矢印
  ctx.strokeStyle = COLORS.ai;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(gX + gW * 0.72, gY + gH / 2);
  ctx.lineTo(gX + gW * 0.92, gY + gH / 2);
  ctx.lineTo(gX + gW * 0.88, gY + gH / 2 - 10);
  ctx.moveTo(gX + gW * 0.92, gY + gH / 2);
  ctx.lineTo(gX + gW * 0.88, gY + gH / 2 + 10);
  ctx.stroke();
  // 張りのメーター (帯と針)
  const mX = w * 0.12;
  const mW = w * 0.76;
  const mY = h * 0.2;
  ctx.fillStyle = COLORS.white;
  ctx.strokeStyle = COLORS.steel;
  ctx.lineWidth = 2;
  ctx.fillRect(mX, mY, mW, h * 0.09);
  ctx.strokeRect(mX, mY, mW, h * 0.09);
  ctx.fillStyle = COLORS.machineLight;
  ctx.fillRect(mX + mW * 0.3, mY, mW * 0.4, h * 0.09);
  ctx.fillStyle = COLORS.sumi;
  ctx.fillRect(mX + mW * 0.55, mY - h * 0.03, 3, h * 0.15);
  drawText(ctx, '右へ動かすほど速い', gX, gY + gH + 34);
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
  drawText(ctx, '▲ ときどき急に強くなる', mX + mW * 0.55, mY - h * 0.08);
  // 張りのランプ (ドラムの上): 適正は緑の○、外れは橙の▲▼、切れたら赤の✕ (PU-14d)
  const lamps: Array<{ color: string; mark: string; name: string }> = [
    { color: COLORS.lampOk, mark: '○', name: '適正' },
    { color: COLORS.lampWarn, mark: '▲', name: '強すぎ' },
    { color: COLORS.lampWarn, mark: '▼', name: '弱すぎ' },
    { color: COLORS.lampBreak, mark: '✕', name: '切れた' },
  ];
  lamps.forEach((l, i) => {
    const lx = w * (0.16 + i * 0.22);
    const ly = h * 0.76;
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.arc(lx, ly, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.mark, lx, ly + 1);
    ctx.fillStyle = COLORS.sumi;
    ctx.font = '20px sans-serif';
    ctx.fillText(l.name, lx, ly + 44);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  });
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

/** ハサミの略図 (盤面と同じ鋼の刃・藍の輪の持ち手。T2-18c) */
function drawScissors(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  // 開いた刃 2枚 (鋼) が交わる
  ctx.fillStyle = COLORS.steel;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * 10 * scale, y - 34 * scale);
    ctx.lineTo(x + dir * 20 * scale, y - 30 * scale);
    ctx.closePath();
    ctx.fill();
  }
  // 持ち手の輪 2つ (藍)
  ctx.strokeStyle = COLORS.ai;
  ctx.lineWidth = 5 * scale;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + dir * 14 * scale, y + 16 * scale, 10 * scale, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** 5ページ目: 巻き量と、制限時間 (目標を超えると朱の文字。点滅は絵に出せないので「超過」の文字は無い。T2-25)・ハサミの略図 (T2-12・PU-14d・T2-18c) */
function drawPage5(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const tX = w * 0.14;
  // 巻き量
  drawText(ctx, '巻き量 89%', tX, h * 0.2);
  // 制限時間 (経過 / 目標)。大きな文字
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(tX, h * 0.26, w * 0.72, 56);
  ctx.strokeStyle = COLORS.steel;
  ctx.lineWidth = 2;
  ctx.strokeRect(tX, h * 0.26, w * 0.72, 56);
  ctx.fillStyle = COLORS.sumiSub;
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('0:42 / 1:30', tX + 16, h * 0.26 + 40);
  // 目標を超えた例 (朱の文字。点滅は絵で表せないので「超過」の文字は無い。T2-25)
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(tX, h * 0.46, w * 0.72, 56);
  ctx.strokeRect(tX, h * 0.46, w * 0.72, 56);
  ctx.fillStyle = COLORS.shu;
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('1:52 / 1:30', tX + 16, h * 0.46 + 40);
  // ハサミの絵と説明
  drawScissors(ctx, w * 0.17, h * 0.72, 1.4);
  drawText(ctx, 'ハサミを糸の所まで引っぱって切ります', w * 0.28, h * 0.75);
  // 星3の説明の星 (3つ)
  ctx.fillStyle = COLORS.steel;
  for (let i = 0; i < 3; i++) {
    drawStar(ctx, w * 0.42 + i * 60, h * 0.92, 22);
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
      text: '{{pedal}}を右へ動かすと巻き始めます。右へ動かすほど速く巻けますが、張りも強くなります',
    },
    {
      draw: (ctx, w, h) => drawPage3(ctx, w, h),
      text: '張りは、メーターと{{drum}}の上のランプで見ます。緑の○が、ちょうどよい張りです。張りはひとりでに上下するので、{{pedal}}で合わせ続けます',
    },
    {
      draw: (ctx, w, h) => drawPage4(ctx, w, h),
      text: '張りが急に強くなったら、すぐに{{pedal}}を戻します。強すぎるまま(▲が点滅)にしておくと、糸が切れます。切れたら、切れた場所をタップしてつなぎます',
    },
    {
      draw: (ctx, w, h) => drawPage5(ctx, w, h),
      text: '{{section}}を巻き終えたら、ハサミを糸の所まで引っぱって切ります。ちょうどよい張りで、目標の時間内に全部巻き終えると星3です',
    },
  ],
};
