import type { TutorialSpec } from '../../core/game/types';

/** チュートリアルの絵。コーン・軸・依頼書の表の略図を Canvas で描く */

function drawCone(ctx: CanvasRenderingContext2D, cx: number, baseY: number, h: number, w: number, hex: string): void {
  // 下が広い台形 + 上に丸い糸の山
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, baseY);
  ctx.lineTo(cx - w * 0.3, baseY - h);
  ctx.lineTo(cx + w * 0.3, baseY - h);
  ctx.lineTo(cx + w / 2, baseY);
  ctx.closePath();
  ctx.fillStyle = hex;
  ctx.fill();
  ctx.strokeStyle = '#2B2A24';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** 1ページ目: 依頼書の表の略図 */
function drawOrderSheet(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const x0 = w * 0.12;
  const y0 = h * 0.2;
  const tw = w * 0.76;
  const th = h * 0.55;
  // 紙
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x0, y0, tw, th);
  ctx.strokeStyle = '#2B2A24';
  ctx.lineWidth = 3;
  ctx.strokeRect(x0, y0, tw, th);
  // 表 (3行)
  const rows: [string, string][] = [['W-4812', '× 7'], ['W-2200', '× 1']];
  ctx.fillStyle = '#2B2A24';
  ctx.font = `${Math.floor(h * 0.11)}px sans-serif`;
  ctx.textBaseline = 'middle';
  for (let i = 0; i < rows.length; i++) {
    const y = y0 + th * 0.35 + i * th * 0.25;
    const row = rows[i]!;
    ctx.fillText(row[0], x0 + tw * 0.1, y);
    ctx.fillText(row[1], x0 + tw * 0.6, y);
  }
  // 見出し
  ctx.fillStyle = '#5A574C';
  ctx.font = `${Math.floor(h * 0.09)}px sans-serif`;
  ctx.fillText('依頼書', x0 + tw * 0.1, y0 + th * 0.15);
}

/** 2ページ目: クリールの軸とコーンの略図 */
function drawCreel(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // 台 (横棒)
  const barY = h * 0.72;
  ctx.fillStyle = '#8C9A7E';
  ctx.fillRect(w * 0.15, barY, w * 0.7, h * 0.07);
  // 軸 2本
  for (const cx of [w * 0.4, w * 0.6]) {
    ctx.strokeStyle = '#B8BEC4';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx, barY);
    ctx.lineTo(cx, barY - h * 0.35);
    ctx.stroke();
  }
  // 立っているコーン (紺) と空の軸
  drawCone(ctx, w * 0.4, barY - h * 0.02, h * 0.3, w * 0.14, '#1B2A4A');
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = '#5A574C';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.6 - w * 0.07, barY - h * 0.02);
  ctx.lineTo(w * 0.6 - w * 0.04, barY - h * 0.3);
  ctx.lineTo(w * 0.6 + w * 0.04, barY - h * 0.3);
  ctx.lineTo(w * 0.6 + w * 0.07, barY - h * 0.02);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  // 箱
  ctx.fillStyle = '#D8C3A5';
  ctx.fillRect(w * 0.12, barY + h * 0.09, w * 0.22, h * 0.14);
  ctx.strokeStyle = '#2B2A24';
  ctx.lineWidth = 2;
  ctx.strokeRect(w * 0.12, barY + h * 0.09, w * 0.22, h * 0.14);
  ctx.fillStyle = '#2B2A24';
  ctx.font = `${Math.floor(h * 0.08)}px sans-serif`;
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
    ctx.strokeStyle = '#5A574C';
    ctx.lineWidth = 3;
    ctx.setLineDash(i === 1 ? [6, 5] : []);
    ctx.strokeRect(x, y, size, size);
    ctx.setLineDash([]);
  });
  // 真ん中に ✕
  const x = xs[1]!;
  ctx.strokeStyle = '#B03A2E';
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

export const creelTutorial: TutorialSpec = {
  pages: [
    { draw: (ctx, w, h) => drawOrderSheet(ctx, w, h), text: '依頼書を見て、どの糸を何本立てるか確かめます' },
    { draw: (ctx, w, h) => drawCreel(ctx, w, h), text: '品番の書かれた箱を選び、{{spindle}}に触れると{{cone}}が立ちます' },
    { draw: (ctx, w, h) => drawCheck(ctx, w, h), text: '全部立てたら「確認する」を押します。間違いは ✕ で示されます' },
  ],
};
