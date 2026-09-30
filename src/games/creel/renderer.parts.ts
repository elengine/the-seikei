import { COLORS, FONT_FAMILY } from '../../core/ui/tokens';
import { CREEL_AREA, postX, toPx } from './geometry';

/** 盤面の絵の部品 (PU-06b。正面から見たクリール)。論理座標 → 画面は fit で変換する */

export type Fit = { scale: number; offsetX: number; offsetY: number };

/** 糸の色が明るいか (記号の文字色・輪郭線の判定に使う)。輝度の目安で判定する */
export function isLightHex(hex: string): boolean {
  const m = hex.match(/^#([0-9A-Fa-f]{6})$/);
  if (m === null) {
    return false;
  }
  const r = parseInt(m[1]!.slice(0, 2), 16);
  const g = parseInt(m[1]!.slice(2, 4), 16);
  const b = parseInt(m[1]!.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 140;
}

/** #RRGGBB に透明度を付けた rgba 文字列 (影に使う) */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 論理座標の四角形を塗る */
function drawRect(ctx: CanvasRenderingContext2D, fit: Fit, rect: { x: number; y: number; w: number; h: number }): void {
  const p = toPx(fit, { x: rect.x, y: rect.y });
  ctx.fillRect(p.x, p.y, rect.w * fit.scale, rect.h * fit.scale);
}

/** 画面座標の丸を塗る */
function fillCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** 列の境目の緑の柱 (cols + 1 本)。左に明るい面 (postLight)、右に暗い面 (postDark) */
export function drawPosts(ctx: CanvasRenderingContext2D, fit: Fit, cols: number): void {
  const half = 6; // 柱の幅の半分 (論理)
  const top = CREEL_AREA.y - 24;
  const h = CREEL_AREA.h + 48;
  for (let i = 0; i <= cols; i++) {
    const x = postX(i, cols);
    ctx.fillStyle = COLORS.postLight;
    drawRect(ctx, fit, { x: x - half, y: top, w: half, h });
    ctx.fillStyle = COLORS.postDark;
    drawRect(ctx, fit, { x, y: top, w: half, h });
  }
}

/** 吸い付く先の軸の表示: aiTint の丸と、藍 (ai) の太い輪。cx, cy, r は画面座標 */
export function drawSnapTarget(ctx: CanvasRenderingContext2D, fit: Fit, cx: number, cy: number, r: number): void {
  fillCircle(ctx, cx, cy, r * 1.2, COLORS.aiTint);
  ctx.strokeStyle = COLORS.ai;
  ctx.lineWidth = Math.max(3, 5 * fit.scale);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2);
  ctx.stroke();
}

/** 空いた軸: チーズの大きさの点線の丸と、中央の木の色の丸 (先に色の輪)。cx, cy, r は画面座標 */
export function drawEmptyPeg(ctx: CanvasRenderingContext2D, fit: Fit, cx: number, cy: number, r: number): void {
  ctx.strokeStyle = COLORS.woodLight;
  ctx.lineWidth = Math.max(2, 3 * fit.scale);
  ctx.setLineDash([8 * fit.scale, 6 * fit.scale]);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // 軸の丸 (木の色) と、先の色の輪 (gold)
  fillCircle(ctx, cx, cy, r * 0.24, COLORS.woodLight);
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = Math.max(2, 3 * fit.scale);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * 立てたチーズ (正面から見た丸): 右下へずらした影 → 糸の色の大きな丸 → (白っぽい糸は輪郭線) →
 * 紙の芯の色の輪 (直径はチーズの 0.4 倍) → 中央の暗い穴。cx, cy, r は画面座標。
 */
export function drawCheese(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  bodyHex: string,
  coreHex: string,
): void {
  fillCircle(ctx, cx + r * 0.1, cy + r * 0.12, r, withAlpha(COLORS.sumi, 0.18));
  fillCircle(ctx, cx, cy, r, bodyHex);
  if (isLightHex(bodyHex)) {
    ctx.strokeStyle = COLORS.sumiSub;
    ctx.lineWidth = Math.max(1.5, r * 0.04);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  fillCircle(ctx, cx, cy, r * 0.4, coreHex);
  fillCircle(ctx, cx, cy, r * 0.14, COLORS.sumi);
}

/** 色の記号をチーズの下寄りに描く (色だけに頼らない)。画面上 20px 以上 */
export function drawSymbol(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, symbol: string, bodyHex: string): void {
  ctx.font = `${Math.max(20, r * 0.4)}px ${FONT_FAMILY}`;
  ctx.fillStyle = isLightHex(bodyHex) ? COLORS.sumi : COLORS.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, cx, cy + r * 0.66);
}

/** shu の太い ✕ (軸の丸の上)。cx, cy, half は画面座標 */
export function drawCross(ctx: CanvasRenderingContext2D, fit: Fit, cx: number, cy: number, half: number): void {
  ctx.strokeStyle = COLORS.shu;
  ctx.lineWidth = Math.max(3, 8 * fit.scale);
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - half);
  ctx.lineTo(cx + half, cy + half);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + half, cy - half);
  ctx.lineTo(cx - half, cy + half);
  ctx.stroke();
}

/**
 * 吹き出し (白地・sumi 枠) に品番と説明を描く。枠の大きさは実際の文字幅から決める (画面 px)。
 * centerX は軸の丸の中心の画面 x、topY はチーズの上端の画面 y、bottomY は下端の画面 y。
 */
export function drawSpeech(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  topY: number,
  bottomY: number,
  hinban: string,
  spec: string,
): void {
  const size = 20;
  const pad = 10;
  ctx.font = `${size}px ${FONT_FAMILY}`;
  // 幅 = 2行のうち広い方の測った幅 + 余白 10px×2
  const textW = Math.max(ctx.measureText(hinban).width, ctx.measureText(spec).width);
  const w = textW + pad * 2;
  const h = size * 2 + pad * 2; // 2行分の行送り + 余白 10px×2
  // 丸の上に出す (上に十分な余白がなければ真下)。枠は Canvas の内側 (左右 4px 以上) に収める。
  // 収める右の端は Canvas の画面上の幅 (clientWidth)。テストの環境などで clientWidth が
  // 0 のときだけ、実寸 (canvas.width) を使う
  const canvasW = ctx.canvas.clientWidth > 0 ? ctx.canvas.clientWidth : ctx.canvas.width;
  let px = centerX - w / 2;
  px = Math.max(4, Math.min(px, canvasW - w - 4));
  const above = topY >= h + 14;
  const py = above ? topY - h - 12 : bottomY + 12;
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(px, py, w, h);
  ctx.strokeStyle = COLORS.sumi;
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, w, h);
  // 吹き出しのしっぽ (枠の外側に出て、丸の方を向く)
  const tailTopY = above ? py + h : py;
  const tailY = above ? tailTopY + 10 : tailTopY - 10;
  ctx.beginPath();
  ctx.moveTo(centerX - 10, tailTopY);
  ctx.lineTo(centerX, tailY);
  ctx.lineTo(centerX + 10, tailTopY);
  ctx.stroke();
  // 文字 (品番と説明)。枠の左右の余白 10px の内側に収める
  ctx.font = `${size}px ${FONT_FAMILY}`;
  ctx.fillStyle = COLORS.sumi;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(hinban, px + pad, py + pad);
  ctx.fillText(spec, px + pad, py + pad + size);
}
