import type { TutorialSpec } from '../../core/game/types';
import { COLORS, FONT_FAMILY } from '../../core/ui/tokens';
import { drawCheese } from '../creel/renderer.parts';

/**
 * 糸割りの遊び方 (P2b T2b-04 → PU-16c)。4ページ、文は大人向け。
 * 絵は今の画面と同じ作り: 盤面は「使う口だけを大きく」(上に元の糸、下に巻くコーン、その下に設定した長さ)、
 * 元の糸は操作欄の段ボールの箱の帯 (クリール立てと同じ。押すとはかり、口へ引っぱるとかかる。収まらないときはバー)、
 * 長さは数字を押すとテンキー。色は tokens。
 */

type Ctx = CanvasRenderingContext2D;

/** 見本の糸 (図の中だけの飾り) */
const BODY = COLORS.ai;
const CORE = COLORS.kinariDeep;

/** 文字を描く (画面上 24px 以上) */
function text(ctx: Ctx, s: string, x: number, y: number, opts: { align?: CanvasTextAlign; color?: string } = {}): void {
  ctx.font = `bold 24px ${FONT_FAMILY}`;
  ctx.fillStyle = opts.color ?? COLORS.sumi;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

/** 矢印 (引っぱる向き) */
function arrow(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string = COLORS.shu): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const ang = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - 14 * Math.cos(ang - 0.45), y1 - 14 * Math.sin(ang - 0.45));
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - 14 * Math.cos(ang + 0.45), y1 - 14 * Math.sin(ang + 0.45));
  ctx.stroke();
}

/** 口 1 つ: 白い枠・元の糸 (上)・巻くコーン (下)・長さ。mounted が偽なら元の糸は空の輪 */
function drawLane(ctx: Ctx, x: number, y: number, w: number, h: number, label: string, mounted: boolean, border: string = COLORS.line): void {
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = border;
  ctx.lineWidth = border === COLORS.line ? 2 : 4;
  ctx.strokeRect(x, y, w, h);
  const cx = x + w / 2;
  const r = Math.min(w * 0.3, h * 0.17);
  if (mounted) {
    drawCheese(ctx, cx, y + h * 0.28, r, BODY, CORE);
  } else {
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.28, r * 0.8, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawCheese(ctx, cx, y + h * 0.58, r * 0.8, mounted ? BODY : CORE, CORE);
  text(ctx, label, cx, y + h * 0.88, { align: 'center' });
}

/** 段ボールの箱 (糸の絵と「糸 N」) */
function drawBox(ctx: Ctx, x: number, y: number, w: number, h: number, label: string): void {
  ctx.fillStyle = COLORS.cardboard;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.cardboardTape;
  ctx.fillRect(x + w * 0.3, y, w * 0.4, h * 0.14);
  ctx.strokeStyle = COLORS.cardboardDark;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  drawCheese(ctx, x + w / 2, y + h * 0.48, Math.min(w * 0.3, h * 0.24), BODY, CORE);
  text(ctx, label, x + w / 2, y + h * 0.86, { align: 'center' });
}

/** 盤面の上の端 (メーターとはかりの数字) */
function drawHeaderRow(ctx: Ctx, w: number, h: number, weighed: boolean): void {
  text(ctx, 'メーター 0 m', w * 0.03, h * 0.07);
  text(ctx, weighed ? 'はかり 500 g' : 'はかり 0 g', w * 0.97, h * 0.07, { align: 'right' });
}

/** 1 ページ目: 盤面 (使う口だけを大きく) */
export function drawPage1(ctx: Ctx, w: number, h: number): void {
  drawHeaderRow(ctx, w, h, false);
  const lw = w * 0.3;
  for (let i = 0; i < 3; i++) {
    drawLane(ctx, w * 0.03 + i * (lw + w * 0.025), h * 0.16, lw, h * 0.78, '長さ未設定', i < 2);
  }
}

/** 2 ページ目: 箱の帯を押すとはかりに載る。収まらないときはバー */
export function drawPage2(ctx: Ctx, w: number, h: number): void {
  drawHeaderRow(ctx, w, h, true);
  arrow(ctx, w * 0.2, h * 0.44, w * 0.78, h * 0.14);
  text(ctx, '押すとはかりへ', w * 0.3, h * 0.3);
  const bw = w * 0.27;
  for (let i = 0; i < 3; i++) {
    drawBox(ctx, w * 0.03 + i * (bw + w * 0.03), h * 0.5, bw, h * 0.3, `糸 ${i + 1}`);
  }
  // 箱の帯のすぐ下のバー (つまみは藍、溝は薄い色)
  ctx.fillStyle = COLORS.line;
  ctx.fillRect(w * 0.03, h * 0.9, w * 0.94, h * 0.03);
  ctx.fillStyle = COLORS.ai;
  ctx.fillRect(w * 0.03, h * 0.885, w * 0.4, h * 0.06);
  text(ctx, 'バー', w * 0.7, h * 0.915, { align: 'center', color: COLORS.ai });
}

/** 3 ページ目: 箱から口へ引っぱる・長さの数字を押す (テンキー) */
export function drawPage3(ctx: Ctx, w: number, h: number): void {
  drawLane(ctx, w * 0.05, h * 0.06, w * 0.34, h * 0.64, '6,000 m', true, COLORS.ai);
  drawLane(ctx, w * 0.42, h * 0.06, w * 0.34, h * 0.64, '長さ未設定', false);
  drawBox(ctx, w * 0.05, h * 0.74, w * 0.2, h * 0.24, '糸 1');
  arrow(ctx, w * 0.27, h * 0.8, w * 0.5, h * 0.52);
  text(ctx, '口へ引っぱる', w * 0.3, h * 0.92);
  // テンキー (数字を押すと開く)
  const kx = w * 0.79;
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = k === 5 ? COLORS.ai : COLORS.white;
    ctx.strokeStyle = COLORS.ai;
    ctx.lineWidth = 2;
    const x = kx + (k % 2) * w * 0.1;
    const y = h * 0.06 + Math.floor(k / 2) * h * 0.2;
    ctx.fillRect(x, y, w * 0.09, h * 0.17);
    ctx.strokeRect(x, y, w * 0.09, h * 0.17);
  }
  text(ctx, 'テンキー', w * 0.84, h * 0.76, { align: 'center' });
}

/** 4 ページ目: 継ぎ (2 本目) と失敗の印 */
export function drawPage4(ctx: Ctx, w: number, h: number): void {
  drawLane(ctx, w * 0.05, h * 0.06, w * 0.4, h * 0.86, '4,200 m', true);
  drawCheese(ctx, w * 0.05 + w * 0.4 * 0.74, h * 0.06 + h * 0.86 * 0.36, h * 0.07, BODY, CORE); // 2 本目
  text(ctx, '+ 1,800 m', w * 0.25, h * 0.86, { align: 'center' });
  drawLane(ctx, w * 0.55, h * 0.06, w * 0.4, h * 0.86, '6,000 m', true, COLORS.shu);
  text(ctx, '✕ 足りない', w * 0.93, h * 0.14, { align: 'right', color: COLORS.shu });
}

export const itowariTutorial: TutorialSpec = {
  pages: [
    {
      draw: (ctx, w, h) => drawPage1(ctx, w, h),
      text: 'ワインダーは、糸を別のコーンに巻き返す機械です。届いたチーズが足りないときや、整経の途中でコーンが足りなくなったときに使います。盤面の口は、そのお題で使う数だけ並びます',
    },
    {
      draw: (ctx, w, h) => drawPage2(ctx, w, h),
      text: '元の糸は、操作欄の段ボールの箱に入っています。箱の糸を押すと、はかりに載って重さが分かります。長さは 重さ × 番手(2/48 なら 24)で計算します。箱が全部見えないときは、箱の列のそばのバーで送ります',
    },
    {
      draw: (ctx, w, h) => drawPage3(ctx, w, h),
      text: '箱の糸を口へ引っぱってかけます。口の「長さ未設定」の数字を押すとテンキーが開くので、巻く長さを入れて「決定」。「巻き始める」で、かけた口が同時に巻き、設定した長さで止まります。元の糸にも、要る長さを残してください',
    },
    {
      draw: (ctx, w, h) => drawPage4(ctx, w, h),
      text: '元の糸1本で足りないときは、同じ口に2本目の糸をかけて継ぎます。1本目を巻き終えると、自動で継いで続けます。足りないものがあると失敗です。長さを設定し直して、もう一度巻いてください。口の糸を盤面の外へ引っぱると、箱へ戻ります',
    },
  ],
};
