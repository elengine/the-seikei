import type { TutorialSpec } from '../../core/game/types';
import { COLORS } from '../../core/ui/tokens';

/**
 * 糸割りの遊び方 (P2b T2b-04)。4ページ、文は大人向け。
 * 絵は今の盤面と同じ見た目 (緑の枠の台・上の段の元の糸と下の段の銀色の胴・箱・はかり・メーター)。
 * 「押すだけで、はかりに載る」の形 (T2b-03 追加修正)。
 */

/** 文字を描く (画面上 24px 以上) */
function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillStyle = COLORS.sumi;
  ctx.font = '24px sans-serif';
  ctx.fillText(text, x, y);
}

/** 円すい台を塗る (盤面の renderer と同じ形) */
function cone(ctx: CanvasRenderingContext2D, cx: number, baseY: number, topW: number, bottomW: number, h: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx - bottomW / 2, baseY);
  ctx.lineTo(cx + bottomW / 2, baseY);
  ctx.lineTo(cx + topW / 2, baseY - h);
  ctx.lineTo(cx - topW / 2, baseY - h);
  ctx.closePath();
  ctx.fill();
}

/** 盤面と同じ見た目の略図。lanes に、口ごとに上の段の糸の高さ (0〜1。0 は空の台) を渡す */
function drawWinder(ctx: CanvasRenderingContext2D, w: number, h: number, lanes: number[]): void {
  // 緑の枠の台と口の台座
  ctx.fillStyle = COLORS.winderGreen;
  ctx.fillRect(w * 0.3, h * 0.16, w * 0.66, h * 0.72);
  // 上の段: 元の糸 (円すい台) と紙の芯・下の段: 銀色の胴
  const laneW = (w * 0.62) / 4;
  for (let i = 0; i < 4; i++) {
    const cx = w * 0.32 + laneW * (i + 0.5);
    const baseY = h * 0.44;
    if (lanes[i]! > 0) {
      cone(ctx, cx, baseY, laneW * 0.3, laneW * 0.5, h * 0.16 * lanes[i]!, COLORS.threadYellow);
      cone(ctx, cx, baseY, laneW * 0.25, laneW * 0.5, h * 0.06, COLORS.white);
    }
    ctx.fillStyle = COLORS.winderSteel;
    ctx.fillRect(cx - laneW * 0.4, h * 0.48, laneW * 0.8, h * 0.16);
    // 下の段のコーン (設定した長さで太る)
    cone(ctx, cx, h * 0.62, laneW * 0.3 * lanes[i]!, laneW * 0.4 * lanes[i]!, h * 0.12, COLORS.white);
  }
  // 左: 段ボール箱 (元の糸) と上皿はかり
  ctx.fillStyle = COLORS.cardboard;
  ctx.fillRect(w * 0.04, h * 0.34, w * 0.2, h * 0.28);
  cone(ctx, w * 0.09, h * 0.6, w * 0.02, w * 0.04, h * 0.12, COLORS.threadYellow);
  cone(ctx, w * 0.15, h * 0.6, w * 0.02, w * 0.04, h * 0.1, COLORS.threadYellow);
  ctx.fillStyle = COLORS.sumiSub;
  ctx.fillRect(w * 0.04, h * 0.78, w * 0.16, h * 0.03);
  // 右上: メーター (丸い目盛り盤と朱の針)
  ctx.fillStyle = COLORS.white;
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w * 0.88, h * 0.14, h * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = COLORS.shu;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.88, h * 0.14);
  ctx.lineTo(w * 0.92, h * 0.09);
  ctx.stroke();
}

/** 矢印 (引っぱる向き) */
function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.strokeStyle = COLORS.shu;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - 14, y2 - 4);
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 10, y2 - 12);
  ctx.stroke();
}

/** 1ページ目: ワインダー全体 (機械・箱・はかり・メーター) */
export function drawPage1(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawWinder(ctx, w, h, [1, 0, 0, 0]);
  drawText(ctx, 'ワインダー', w * 0.34, h * 0.95);
}

/** 2ページ目: 箱の糸を上の段へ引っぱる・押すとはかりに載る */
export function drawPage2(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawWinder(ctx, w, h, [1, 0, 0, 0]);
  arrow(ctx, w * 0.12, h * 0.38, w * 0.45, h * 0.3);
  drawText(ctx, 'はかりへ押す', w * 0.03, h * 0.9);
  drawText(ctx, '上の段へ引っぱる', w * 0.36, h * 0.24);
}

/** 3ページ目: 口を選んで長さを設定し、巻き始める (メーターの針が進む) */
export function drawPage3(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawWinder(ctx, w, h, [1, 1, 1, 0]);
  // 選んだ口の長さの数字
  drawText(ctx, '6,000 m', w * 0.33, h * 0.72);
  drawText(ctx, '巻き始める', w * 0.62, h * 0.95);
}

/** 4ページ目: 継ぎ (同じ口に2本目) と失敗の印 */
export function drawPage4(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawWinder(ctx, w, h, [1, 1, 0, 0]);
  // 2本目の糸 (小さな円すい台) と結び目
  cone(ctx, w * 0.32 + (w * 0.62) / 4 + (w * 0.62) / 16, h * 0.44, w * 0.012, w * 0.025, h * 0.07, COLORS.threadYellow);
  ctx.fillStyle = COLORS.gold;
  ctx.beginPath();
  ctx.arc(w * 0.32 + (w * 0.62) / 4, h * 0.26, 8, 0, Math.PI * 2);
  ctx.fill();
  // 失敗の印 (朱の枠と文字)
  ctx.strokeStyle = COLORS.shu;
  ctx.lineWidth = 3;
  ctx.strokeRect(w * 0.62, h * 0.18, w * 0.14, h * 0.5);
  drawText(ctx, '✕ 足りない', w * 0.55, h * 0.12);
}

export const itowariTutorial: TutorialSpec = {
  pages: [
    {
      draw: (ctx, w, h) => drawPage1(ctx, w, h),
      text: 'ワインダーは、糸を別のコーンに巻き返す機械です。届いたチーズが足りないときや、整経の途中でコーンが足りなくなったときに使います',
    },
    {
      draw: (ctx, w, h) => drawPage2(ctx, w, h),
      text: '元の糸を箱から上の段へ引っぱってかけます。箱の糸を押すと、はかりに載って重さが分かります。長さは 重さ × 番手(2/48 なら 24)で計算します',
    },
    {
      draw: (ctx, w, h) => drawPage3(ctx, w, h),
      text: '口を押して選び、巻く長さを設定します。「巻き始める」で、かけた口が同時に巻き、設定した長さで止まります。元の糸にも、要る長さを残してください',
    },
    {
      draw: (ctx, w, h) => drawPage4(ctx, w, h),
      text: '元の糸1本で足りないときは、同じ口に2本目の糸をかけて継ぎます。1本目を巻き終えると、自動で継いで続けます。足りないものがあると失敗です。長さを設定し直して、もう一度巻いてください',
    },
  ],
};
