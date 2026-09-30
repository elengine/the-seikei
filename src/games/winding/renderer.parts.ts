import type { WindingState } from './logic';
import { COLORS } from '../../core/ui/tokens';
import { SECTION_LENGTH } from './params';
import type { StageFit } from '../../core/viewport/viewport';
import { DRUM_AREA, fontPx } from './geometry';

/**
 * ドラム巻きの盤面のうち、ドラム (円筒) と結び目を描く部品 (T2-08)。
 * renderer.ts が 300 行以内に収まるように分けた。色は COLORS と糸の色だけ。
 */

/** 帯の巻き終わりの結び目の束の大きさ (論理座標) */
const KNOT = { w: 10, h: 26 } as const;

/** ドラムの円筒の見た目の半分の厚み (帯の面の上下のふくらみ) */
const DRUM_BULGE = 10;

/** 4. ドラム: 横向き円筒。明るさの勾配・木の桟・端の円盤・帯の縞 */
export function drawDrum(
  ctx: CanvasRenderingContext2D,
  fit: StageFit,
  s: WindingState,
  hexes: string[],
  base: string,
  tieProgress: number,
): void {
  const { x, y, w, h } = DRUM_AREA;
  const secW = w / s.sections;
  // 帯の面の上下のふくらみ
  const topY = y - DRUM_BULGE;
  const botY = y + h + DRUM_BULGE;

  // 帯の区画 (先に塗る。すき間を作らない)
  for (let i = 0; i < s.sections; i++) {
    const bx = x + secW * i;
    const isCurrent = i === s.current;
    const len = s.lengths[i] ?? 0;
    if (isCurrent && s.phase === 'ready') continue;
    const full = i < s.current || s.phase === 'done';
    const ratio = full ? 1 : Math.min(1, len / SECTION_LENGTH);
    if (ratio <= 0 && !full) continue;
    // 巻いた帯は糸の色の縦の縞 (円周の方向)。濃さは巻いた割合で上がる
    for (let k = 0; k < hexes.length; k++) {
      ctx.globalAlpha = 0.35 + 0.65 * ratio;
      ctx.fillStyle = hexes[k] ?? COLORS.sumiSub;
      const stripeW = secW / hexes.length;
      ctx.fillRect(bx + stripeW * k, topY, stripeW, botY - topY);
    }
    ctx.globalAlpha = 1;
    // 帯の上下のふくらみ (割合に比例して最大 6)
    const bulge = 6 * ratio;
    ctx.fillStyle = base;
    ctx.fillRect(bx, topY - bulge, secW, fontPx(fit, 2));
    ctx.fillRect(bx, botY + bulge - fontPx(fit, 2), secW, fontPx(fit, 2));
  }

  // まだ巻いていない部分の胴: 明るさの勾配 + 木の桟 (すき間から機械の色が見える)
  const grads = ctx.createLinearGradient(0, topY, 0, botY);
  grads.addColorStop(0, COLORS.machineDark);
  grads.addColorStop(0.3, COLORS.machineLight);
  grads.addColorStop(0.7, COLORS.machine);
  grads.addColorStop(1, COLORS.machineDark);
  ctx.fillStyle = grads;
  for (let i = 0; i < s.sections; i++) {
    const len = s.lengths[i] ?? 0;
    const started = i < s.current || s.phase === 'done' || (i === s.current && len > 0);
    if (started && s.phase !== 'ready') continue;
    const bx = x + secW * i;
    ctx.fillRect(bx, topY, secW, botY - topY);
    // 桟 (横長の板を上から下へすき間をあけて並べる)
    ctx.fillStyle = COLORS.wood;
    const slatH = fontPx(fit, 12);
    const gap = fontPx(fit, 14);
    for (let sy = topY + fontPx(fit, 8); sy + slatH < botY; sy += slatH + gap) {
      ctx.fillRect(bx + fontPx(fit, 6), sy, secW - fontPx(fit, 12), slatH);
    }
    ctx.fillStyle = grads;
  }

  // 端の丸い面 (灰色の金属の円盤) + 放射状の腕
  for (const ex of [x - fontPx(fit, 4), x + w - fontPx(fit, 4)]) {
    const ry = (botY - topY) / 2;
    ctx.fillStyle = COLORS.steel;
    ctx.beginPath();
    ctx.ellipse(ex + fontPx(fit, 4), y + h / 2, fontPx(fit, 12), ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.sumiSub;
    ctx.lineWidth = fontPx(fit, 2);
    for (let a = 0; a < 6; a++) {
      const ang = (Math.PI / 3) * a;
      ctx.beginPath();
      ctx.moveTo(ex + fontPx(fit, 4), y + h / 2);
      ctx.lineTo(ex + fontPx(fit, 4) + Math.cos(ang) * fontPx(fit, 10), y + h / 2 + Math.sin(ang) * ry * 0.85);
      ctx.stroke();
    }
  }

  // ピン (灰みの緑の横木 + 鋼のピン。帯ごとに1本。下の方)
  ctx.fillStyle = COLORS.machineDark;
  ctx.fillRect(x - fontPx(fit, 8), y + h + DRUM_BULGE + fontPx(fit, 10), w + fontPx(fit, 16), fontPx(fit, 10));
  for (let i = 0; i < s.sections; i++) {
    const px = drumPinX(i, s.sections);
    ctx.fillStyle = COLORS.steel;
    ctx.fillRect(px - fontPx(fit, 3), y + h + DRUM_BULGE, fontPx(fit, 6), fontPx(fit, 12));
    // 巻き始めた帯のピンには糸の束が掛かる
    if (i === s.current && s.phase === 'winding') {
      ctx.strokeStyle = base;
      ctx.lineWidth = fontPx(fit, 1.5);
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        ctx.moveTo(px - fontPx(fit, 5) + fontPx(fit, 2.5) * k, y + h + DRUM_BULGE + fontPx(fit, 10));
        ctx.lineTo(px - fontPx(fit, 5) + fontPx(fit, 2.5) * k, y + h + DRUM_BULGE + fontPx(fit, 22));
      }
      ctx.stroke();
    }
  }

  // 結び目 (巻き終えた帯の区画の上端)
  for (let i = 0; i < s.sections; i++) {
    if (i < s.current || s.phase === 'done') {
      drawKnot(ctx, fit, x + secW * i + secW / 2, DRUM_AREA.y - 6, base);
    }
    if (i === s.current && s.phase === 'cutting') {
      const p = Math.min(1, Math.max(0, tieProgress));
      ctx.globalAlpha = p;
      drawKnot(ctx, fit, x + secW * i + secW / 2, DRUM_AREA.y - 6, base);
      ctx.globalAlpha = 1;
    }
  }
}

/** 帯 i のピンの x (ドラムの上に等間隔) */
export function drumPinX(i: number, sections: number): number {
  const secW = DRUM_AREA.w / sections;
  return DRUM_AREA.x + secW * i + secW / 2;
}

/** 結び目の束 (糸の色の小さな輪を3〜5個重ねた形) */
function drawKnot(
  ctx: CanvasRenderingContext2D,
  fit: StageFit,
  x: number,
  y: number,
  hex: string,
): void {
  ctx.strokeStyle = hex;
  ctx.lineWidth = fontPx(fit, 2);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(x + (i - 2) * KNOT.w * 0.4, y, KNOT.h / 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}
