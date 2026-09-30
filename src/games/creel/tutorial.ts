import type { TutorialSpec } from '../../core/game/types';
import { COLORS, FONT_FAMILY } from '../../core/ui/tokens';
import { drawCheese } from './renderer.parts';

/** チュートリアルの絵。コーン・軸・依頼書の表の略図を Canvas で描く */

/** 1ページ目: 依頼書の表の略図 */
function drawOrderSheet(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const x0 = w * 0.12;
  const y0 = h * 0.2;
  const tw = w * 0.76;
  const th = h * 0.55;
  // 紙
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(x0, y0, tw, th);
  ctx.strokeStyle = COLORS.sumi;
  ctx.lineWidth = 3;
  ctx.strokeRect(x0, y0, tw, th);
  // 表 (3行)
  const rows: [string, string][] = [['W-4812', '× 7'], ['W-2200', '× 1']];
  ctx.fillStyle = COLORS.sumi;
  ctx.font = `${Math.floor(h * 0.11)}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  for (let i = 0; i < rows.length; i++) {
    const y = y0 + th * 0.35 + i * th * 0.25;
    const row = rows[i]!;
    ctx.fillText(row[0], x0 + tw * 0.1, y);
    ctx.fillText(row[1], x0 + tw * 0.6, y);
  }
  // 見出し
  ctx.fillStyle = COLORS.sumiSub;
  ctx.font = `${Math.floor(h * 0.09)}px ${FONT_FAMILY}`;
  ctx.fillText('依頼書', x0 + tw * 0.1, y0 + th * 0.15);
}

/** 2ページ目: クリールを正面から見た略図 (緑の柱・軸の丸・チーズ)。チーズは手前から軸に差し込む */
function drawCreel(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // 奥の地と、左右と真ん中の緑の柱
  ctx.fillStyle = COLORS.creelBack;
  ctx.fillRect(w * 0.08, h * 0.08, w * 0.84, h * 0.6);
  const postW = w * 0.025;
  for (const x of [w * 0.1, w * 0.5, w * 0.9]) {
    ctx.fillStyle = COLORS.postLight;
    ctx.fillRect(x - postW, h * 0.06, postW, h * 0.64);
    ctx.fillStyle = COLORS.postDark;
    ctx.fillRect(x, h * 0.06, postW, h * 0.64);
  }
  // 軸 2つ: 左はチーズを立てた軸、右は空いた軸 (点線の丸と、中央の木の色の丸)
  const cy = h * 0.38;
  const r = h * 0.2;
  drawCheese(ctx, w * 0.3, cy, r, COLORS.ai, COLORS.shu);
  const cx = w * 0.7;
  ctx.strokeStyle = COLORS.woodLight;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COLORS.woodLight;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
  // 箱 (手前)
  const barY = h * 0.72;
  ctx.fillStyle = COLORS.machineLight;
  ctx.fillRect(w * 0.12, barY + h * 0.09, w * 0.22, h * 0.14);
  ctx.strokeStyle = COLORS.sumi;
  ctx.lineWidth = 2;
  ctx.strokeRect(w * 0.12, barY + h * 0.09, w * 0.22, h * 0.14);
  ctx.fillStyle = COLORS.sumi;
  ctx.font = `${Math.floor(h * 0.08)}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('W-4812', w * 0.15, barY + h * 0.16);
}

/** 3ページ目: 確認する の ✕ の略図 */
function drawCheck(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // マス 3つ
  const size = w * 0.14;
  const y = h * 0.38;
  const xs = [w * 0.3, w * 0.3 + size * 1.3, w * 0.3 + size * 2.6];
  xs.forEach((x, i) => {
    ctx.strokeStyle = COLORS.sumiSub;
    ctx.lineWidth = 3;
    ctx.setLineDash(i === 1 ? [6, 5] : []);
    ctx.strokeRect(x, y, size, size);
    ctx.setLineDash([]);
  });
  // 真ん中に ✕
  const x = xs[1]!;
  ctx.strokeStyle = COLORS.shu;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.2, y + size * 0.2);
  ctx.lineTo(x + size * 0.8, y + size * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + size * 0.8, y + size * 0.2);
  ctx.lineTo(x + size * 0.2, y + size * 0.8);
  ctx.stroke();
}

/**
 * 4ページ目: ヒントの説明の略図。
 * 3ページ目の ✕ の付いたマスの横に「ヒント」のボタンの形を描き、
 * 矢印の先で ✕ が正しい色のマスに変わる様子を描く。
 */
function drawHint(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // 左: ✕ の付いたマス (3ページ目と同じ形)
  const size = w * 0.13;
  const y = h * 0.42;
  const xLeft = w * 0.16;
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 5]);
  ctx.strokeRect(xLeft, y, size, size);
  ctx.setLineDash([]);
  ctx.strokeStyle = COLORS.shu;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(xLeft + size * 0.2, y + size * 0.2);
  ctx.lineTo(xLeft + size * 0.8, y + size * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(xLeft + size * 0.8, y + size * 0.2);
  ctx.lineTo(xLeft + size * 0.2, y + size * 0.8);
  ctx.stroke();
  // 中央: 「ヒント」のボタンの形 (副ボタン: 白地・藍の枠)
  const btnW = w * 0.2;
  const btnH = h * 0.16;
  const btnX = w * 0.38;
  const btnY = h * 0.44;
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(btnX, btnY, btnW, btnH);
  ctx.strokeStyle = COLORS.ai;
  ctx.lineWidth = 3;
  ctx.strokeRect(btnX, btnY, btnW, btnH);
  ctx.fillStyle = COLORS.ai;
  ctx.font = `${Math.floor(h * 0.085)}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('ヒント', btnX + btnW * 0.2, btnY + btnH * 0.55);
  // 矢印: ボタンから右のマスへ
  const arrowY = y + size / 2;
  const arrowX0 = btnX + btnW + 6;
  const arrowX1 = w * 0.72;
  ctx.strokeStyle = COLORS.sumi;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(arrowX0, arrowY);
  ctx.lineTo(arrowX1, arrowY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(arrowX1, arrowY);
  ctx.lineTo(arrowX1 - 10, arrowY - 7);
  ctx.moveTo(arrowX1, arrowY);
  ctx.lineTo(arrowX1 - 10, arrowY + 7);
  ctx.stroke();
  // 右: ✕ が正しい色のマスに変わった様子 (紺で塗る)
  const xRight = w * 0.74;
  ctx.fillStyle = COLORS.ai;
  ctx.fillRect(xRight, y, size, size);
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 3;
  ctx.strokeRect(xRight, y, size, size);
}

export const creelTutorial: TutorialSpec = {
  pages: [
    { draw: (ctx, w, h) => drawOrderSheet(ctx, w, h), text: '依頼書を見て、どの糸を何本立てるか確かめます' },
    { draw: (ctx, w, h) => drawCreel(ctx, w, h), text: '品番の書かれた箱を選び、{{spindle}}に触れると{{cone}}が立ちます' },
    { draw: (ctx, w, h) => drawCheck(ctx, w, h), text: '全部立てたら「確認する」を押します。間違いは ✕ で示されます' },
    {
      draw: (ctx, w, h) => drawHint(ctx, w, h),
      text: '「確認する」を2回押しても ✕ が残るときは、「ヒント」で1か所を直せます(ヒントを使うと星は1つになります)',
    },
  ],
};
