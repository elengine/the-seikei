import type { TutorialSpec } from '../../core/game/types';
import { COLORS, FONT_FAMILY } from '../../core/ui/tokens';
import { drawCheese, drawCross, drawEmptyPeg } from './renderer.parts';
import type { Fit } from './renderer.parts';

/**
 * チュートリアルの絵 (PU-11c)。今の画面と同じ見た目で略図を Canvas に描く:
 * 正面から見たクリール (緑の柱・軸の丸・チーズの丸と芯の輪)、段ボールの箱 (品番とチーズ)、依頼書の行、
 * 箱から軸へ引っぱる矢印 (置く)、クリールの外へ引っぱる矢印 (外す)。色は tokens。
 */

/** 見本の糸 (図の中だけの飾り): 藍の糸に朱の芯、白い糸に金の芯 */
interface Sample {
  hinban: string;
  body: string;
  core: string;
}
const SAMPLE_A: Sample = { hinban: 'W-4812', body: COLORS.ai, core: COLORS.shu };
const SAMPLE_B: Sample = { hinban: 'W-2200', body: COLORS.white, core: COLORS.gold };

/** drawEmptyPeg・drawCross の線の太さの基準 (盤面の拡大率 1) */
const FIT1: Fit = { scale: 1, offsetX: 0, offsetY: 0 };

type Ctx = CanvasRenderingContext2D;

/** 文字を描く (図の中の字。基準は高さ h に対する割合) */
function text(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, opts: { align?: CanvasTextAlign; bold?: boolean } = {}): void {
  ctx.font = `${opts.bold === true ? 'bold ' : ''}${Math.floor(size)}px ${FONT_FAMILY}`;
  ctx.fillStyle = color;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

/** 矢印 (線と矢じり) */
function arrow(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, width = 5): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const head = 16;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(ang - 0.45), y1 - head * Math.sin(ang - 0.45));
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(ang + 0.45), y1 - head * Math.sin(ang + 0.45));
  ctx.stroke();
}

/** 段ボールの箱: 地・ふたの線・横のテープ・品番 (太字)・チーズの絵 */
function drawBox(ctx: Ctx, x: number, y: number, bw: number, bh: number, s: Sample): void {
  const lid = bh * 0.16;
  ctx.fillStyle = COLORS.cardboard;
  ctx.fillRect(x, y, bw, bh);
  ctx.fillStyle = COLORS.cardboardTape;
  ctx.fillRect(x + bw * 0.3, y, bw * 0.4, lid);
  ctx.strokeStyle = COLORS.cardboardDark;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, bw, bh);
  ctx.beginPath();
  ctx.moveTo(x, y + lid);
  ctx.lineTo(x + bw, y + lid);
  ctx.stroke();
  const inner = bh - lid;
  text(ctx, s.hinban, x + bw / 2, y + lid + inner * 0.2, Math.min(bh * 0.13, bw * 0.17), COLORS.sumi, { align: 'center', bold: true });
  drawCheese(ctx, x + bw / 2, y + lid + inner * 0.64, Math.min(bw * 0.22, inner * 0.3), s.body, s.core);
}

/** 正面から見たクリール (奥の地・緑の柱・軸の列)。軸の中心の x と y、チーズの半径を返す */
function drawCreelRow(ctx: Ctx, x: number, y: number, cw: number, ch: number, cols: number): { xs: number[]; cy: number; r: number } {
  ctx.fillStyle = COLORS.creelBack;
  ctx.fillRect(x, y, cw, ch);
  const pitch = cw / cols;
  const postW = Math.max(4, cw * 0.012);
  for (let i = 0; i <= cols; i++) {
    const px = x + i * pitch;
    ctx.fillStyle = COLORS.postLight;
    ctx.fillRect(px - postW, y - ch * 0.05, postW, ch * 1.1);
    ctx.fillStyle = COLORS.postDark;
    ctx.fillRect(px, y - ch * 0.05, postW, ch * 1.1);
  }
  const xs: number[] = [];
  for (let i = 0; i < cols; i++) {
    xs.push(x + pitch * (i + 0.5));
  }
  return { xs, cy: y + ch / 2, r: Math.min(pitch * 0.36, ch * 0.4) };
}

/** ボタンの形 (primary: 藍の地・白い字 / secondary: 白地・藍の枠と字) */
function drawButton(ctx: Ctx, x: number, y: number, bw: number, bh: number, label: string, primary: boolean, size: number): void {
  ctx.fillStyle = primary ? COLORS.ai : COLORS.white;
  ctx.fillRect(x, y, bw, bh);
  ctx.strokeStyle = COLORS.ai;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, bw, bh);
  text(ctx, label, x + bw / 2, y + bh / 2, size, primary ? COLORS.white : COLORS.ai, { align: 'center', bold: true });
}

/** 1ページ目: 依頼書の行の見本 (品番・チーズの絵・個数・繰り返し) と、同じ品番の箱 */
function drawOrder(ctx: Ctx, w: number, h: number): void {
  const px = w * 0.04;
  const py = h * 0.08;
  const pw = w * 0.6;
  const ph = h * 0.84;
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = COLORS.sumi;
  ctx.lineWidth = 3;
  ctx.strokeRect(px, py, pw, ph);
  text(ctx, '依頼書', px + pw * 0.06, py + ph * 0.11, h * 0.075, COLORS.ai, { bold: true });
  // 行 (品番・チーズの絵・個数)
  const rows: [Sample, string][] = [[SAMPLE_A, '× 5'], [SAMPLE_B, '× 1']];
  rows.forEach(([s, count], i) => {
    const y = py + ph * (0.34 + i * 0.26);
    // 左から コーンの絵 → 型番 → 個数 (今の依頼書と同じ並び)
    drawCheese(ctx, px + pw * 0.14, y, h * 0.065, s.body, s.core);
    text(ctx, s.hinban, px + pw * 0.27, y, h * 0.085, COLORS.sumiSub);
    text(ctx, count, px + pw * 0.94, y, h * 0.1, COLORS.sumi, { align: 'right', bold: true });
  });
  text(ctx, '↻ 2回繰り返す', px + pw * 0.06, py + ph * 0.88, h * 0.085, COLORS.sumiSub, { bold: true });
  // 同じ品番の箱 (依頼書の1行目と同じ)
  const bx = w * 0.7;
  const by = h * 0.06;
  const bw = w * 0.26;
  const bh = h * 0.5;
  drawBox(ctx, bx, by, bw, bh, SAMPLE_A);
  arrow(ctx, bx - 6, by + bh * 0.45, px + pw * 0.9, py + ph * 0.34 + h * 0.05, COLORS.ai, 4);
  // 「依頼書」のボタン (押すとこの表が出る)
  drawButton(ctx, bx - w * 0.02, h * 0.7, bw + w * 0.04, h * 0.2, '依頼書', false, h * 0.085);
  arrow(ctx, bx - w * 0.04, h * 0.8, px + pw + 6, h * 0.8, COLORS.ai, 4);
}

/** 2ページ目: クリールを正面から見た図。箱から軸へ引っぱる (置く) 矢印と、クリールの外へ引っぱる (外す) 矢印 */
function drawPlace(ctx: Ctx, w: number, h: number): void {
  const row = drawCreelRow(ctx, w * 0.1, h * 0.2, w * 0.8, h * 0.4, 3);
  // 左: チーズを立てた軸 (外す矢印の元)。真ん中と右: 空いた軸
  drawCheese(ctx, row.xs[0]!, row.cy, row.r, SAMPLE_A.body, SAMPLE_A.core);
  drawEmptyPeg(ctx, FIT1, row.xs[1]!, row.cy, row.r);
  drawEmptyPeg(ctx, FIT1, row.xs[2]!, row.cy, row.r);
  // 外す: 立っているチーズをクリールの外 (上) へ
  arrow(ctx, row.xs[0]!, row.cy - row.r * 0.9, row.xs[0]!, h * 0.04, COLORS.shu);
  text(ctx, '外す', row.xs[0]! + w * 0.04, h * 0.1, h * 0.085, COLORS.shu, { bold: true });
  // 置く: 手前の箱から空いた軸へ
  // 箱の帯 (今の画面は、箱が一列に並んで横に送れる)。引っぱる箱は左の 1 つ
  const bw = w * 0.2;
  const bh = h * 0.3;
  const by = h * 0.68;
  const bx = w * 0.1;
  const gap = w * 0.03;
  drawBox(ctx, bx, by, bw, bh, SAMPLE_A);
  drawBox(ctx, bx + bw + gap, by, bw, bh, SAMPLE_B);
  drawBox(ctx, bx + (bw + gap) * 2, by, bw, bh, SAMPLE_A);
  arrow(ctx, bx + bw * 0.75, by - 4, row.xs[1]! - row.r * 0.3, row.cy + row.r * 1.05, COLORS.ai);
  text(ctx, '置く', row.xs[1]! + row.r * 0.9, h * 0.66, h * 0.085, COLORS.ai, { bold: true });
  text(ctx, '上へ引っぱる', w * 0.98, h * 0.6, h * 0.07, COLORS.ai, { align: 'right', bold: true });
}

/** 3ページ目: 「確認」を押すと、違う軸と空の軸に ✕ が付く。箱から引っぱり直す */
function drawDone(ctx: Ctx, w: number, h: number): void {
  const row = drawCreelRow(ctx, w * 0.1, h * 0.1, w * 0.8, h * 0.4, 3);
  drawCheese(ctx, row.xs[0]!, row.cy, row.r, SAMPLE_A.body, SAMPLE_A.core); // 合っている
  drawCheese(ctx, row.xs[1]!, row.cy, row.r, SAMPLE_B.body, SAMPLE_B.core); // 違う糸
  drawCross(ctx, FIT1, row.xs[1]!, row.cy, row.r * 0.6);
  drawEmptyPeg(ctx, FIT1, row.xs[2]!, row.cy, row.r); // まだ立てていない軸
  drawCross(ctx, FIT1, row.xs[2]!, row.cy, row.r * 0.6);
  // 箱 (引っぱり直す元) と、「確認」のボタン
  const bx = w * 0.1;
  const by = h * 0.6;
  const bw = w * 0.26;
  const bh = h * 0.36;
  drawBox(ctx, bx, by, bw, bh, SAMPLE_A);
  arrow(ctx, bx + bw * 0.8, by - 4, row.xs[2]! - row.r * 0.5, row.cy + row.r * 1.05, COLORS.ai, 4);
  // 今の画面の下の行: 「ヒント」(副) と「確認」(主) が 1 行に並ぶ
  drawButton(ctx, w * 0.42, h * 0.7, w * 0.2, h * 0.2, 'ヒント', false, h * 0.075);
  drawButton(ctx, w * 0.66, h * 0.7, w * 0.26, h * 0.2, '確認', true, h * 0.09);
}

/** 4ページ目: ✕ の軸 →「ヒント」→ 正しいチーズが立つ。正しい糸は箱にある */
function drawHint(ctx: Ctx, w: number, h: number): void {
  const cy = h * 0.3;
  const r = h * 0.14;
  // 左: ✕ の付いた空の軸
  const xLeft = w * 0.16;
  drawEmptyPeg(ctx, FIT1, xLeft, cy, r);
  drawCross(ctx, FIT1, xLeft, cy, r * 0.6);
  // 中央: 「ヒント」のボタン (副ボタン)
  drawButton(ctx, w * 0.34, cy - h * 0.09, w * 0.26, h * 0.18, 'ヒント', false, h * 0.085);
  // 矢印 → 右: 正しいチーズが立った軸
  const xRight = w * 0.84;
  arrow(ctx, w * 0.62, cy, xRight - r - 8, cy, COLORS.sumi, 4);
  drawCheese(ctx, xRight, cy, r, SAMPLE_A.body, SAMPLE_A.core);
  // 正しい糸の箱
  drawBox(ctx, w * 0.62, h * 0.58, w * 0.26, h * 0.38, SAMPLE_A);
  arrow(ctx, w * 0.75, h * 0.57, xRight, cy + r + 8, COLORS.ai, 4);
}

export const creelTutorial: TutorialSpec = {
  pages: [
    { draw: (ctx, w, h) => drawOrder(ctx, w, h), text: '「依頼書」を押すと、立てる{{cone}}の絵と型番と本数が出ます。繰り返しがあるときは「2回繰り返す」と出ます' },
    { draw: (ctx, w, h) => drawPlace(ctx, w, h), text: '段ボールの箱の上から{{cone}}を上へ引っぱって、{{spindle}}の丸に嵌めます。箱の列は、横に送って探せます。外すときは、{{cone}}を{{creel}}の外へ引っぱります' },
    { draw: (ctx, w, h) => drawDone(ctx, w, h), text: '全部立てたら「確認」を押します。間違いは ✕ で示されるので、箱から引っぱり直します' },
    {
      draw: (ctx, w, h) => drawHint(ctx, w, h),
      text: '確認に2回失敗すると「ヒント」が使えます(ヒントを使うと星は1つになります)',
    },
  ],
};
