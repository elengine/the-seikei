import type { CreelState } from './logic';
import type { Content } from '../../core/content/content';
import { showHinbanOnCone } from './logic';
import { CREEL_AREA, cellRect, fontPx, toPx } from './geometry';
import { COLORS, FONT_FAMILY } from '../../core/ui/tokens';
import { indexToCell } from '../../core/domain/stripe';

/** 糸の色が明るいか (記号の文字色の判定に使う)。輝度の目安で判定する */
function isLightHex(hex: string): boolean {
  const m = hex.match(/^#([0-9A-Fa-f]{6})$/);
  if (m === null) {
    return false;
  }
  const r = parseInt(m[1]!.slice(0, 2), 16);
  const g = parseInt(m[1]!.slice(2, 4), 16);
  const b = parseInt(m[1]!.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 140;
}

/** コーンの台形 (下が広い) の頂点。マスの rect (論理座標) から作る */
function coneShape(rect: { x: number; y: number; w: number; h: number }): { x: number; y: number }[] {
  const cx = rect.x + rect.w / 2;
  const topW = rect.w * 0.36;
  const bottomW = rect.w * 0.6;
  const top = rect.y + rect.h * 0.18;
  const bottom = rect.y + rect.h * 0.78;
  return [
    { x: cx - topW / 2, y: top },
    { x: cx + topW / 2, y: top },
    { x: cx + bottomW / 2, y: bottom },
    { x: cx - bottomW / 2, y: bottom },
  ];
}

function pathCone(ctx: CanvasRenderingContext2D, fit: { scale: number; offsetX: number; offsetY: number }, shape: { x: number; y: number }[]): void {
  ctx.beginPath();
  const first = toPx(fit, shape[0]!);
  ctx.moveTo(first.x, first.y);
  for (const p of shape.slice(1)) {
    const px = toPx(fit, p);
    ctx.lineTo(px.x, px.y);
  }
  ctx.closePath();
}

/**
 * クリールの盤面を描く。fit は画面 (Canvas) への変換。
 * 見た目は灰みの緑の枠 (machine 色の柱と横棒) で、横長画面で見やすいことを優先する。
 */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  fit: { scale: number; offsetX: number; offsetY: number },
  s: CreelState,
  content: Content,
  terms: { t(k: string): string },
): void {
  void terms;
  const total = s.rows * s.cols;

  // 1. 背景 (kinari)
  ctx.fillStyle = COLORS.kinari;
  ctx.fillRect(0, 0, LOGICAL_W_PX, LOGICAL_H_PX);

  // 2. クリールの枠: 左右に太い柱、各段の下に横の棒 (machine 色。明るい面は machineLight)
  const pillarW = 26;
  const barH = 14;
  // 左の柱
  ctx.fillStyle = COLORS.machine;
  drawRect(ctx, fit, { x: CREEL_AREA.x - pillarW, y: CREEL_AREA.y - barH, w: pillarW, h: CREEL_AREA.h + barH * 2 });
  // 右の柱
  drawRect(ctx, fit, { x: CREEL_AREA.x + CREEL_AREA.w, y: CREEL_AREA.y - barH, w: pillarW, h: CREEL_AREA.h + barH * 2 });
  // 柱の明るい面 (左端に細い帯)
  ctx.fillStyle = COLORS.machineLight;
  drawRect(ctx, fit, { x: CREEL_AREA.x - pillarW, y: CREEL_AREA.y - barH, w: 6, h: CREEL_AREA.h + barH * 2 });
  // 各段の下の横棒
  for (let row = 0; row < s.rows; row++) {
    const y = CREEL_AREA.y + ((row + 1) * CREEL_AREA.h) / s.rows - barH / 2;
    ctx.fillStyle = COLORS.machine;
    drawRect(ctx, fit, { x: CREEL_AREA.x - pillarW, y, w: CREEL_AREA.w + pillarW * 2, h: barH });
  }
  // 上の横棒 (1段目の上)
  ctx.fillStyle = COLORS.machine;
  drawRect(ctx, fit, { x: CREEL_AREA.x - pillarW, y: CREEL_AREA.y - barH, w: CREEL_AREA.w + pillarW * 2, h: barH });

  for (let i = 0; i < total; i++) {
    const rect = cellRect(i, s.rows, s.cols);
    const placed = s.placed[i] ?? null;

    // 3. 軸 (steel 色の短い縦線、マスの中央)
    const axisTop = toPx(fit, { x: rect.x + rect.w / 2, y: rect.y + rect.h * 0.12 });
    const axisBottom = toPx(fit, { x: rect.x + rect.w / 2, y: rect.y + rect.h * 0.88 });
    ctx.strokeStyle = COLORS.steel;
    ctx.lineWidth = Math.max(2, 4 * fit.scale);
    ctx.beginPath();
    ctx.moveTo(axisTop.x, axisTop.y);
    ctx.lineTo(axisBottom.x, axisBottom.y);
    ctx.stroke();

    if (placed !== null) {
      // 4. 立っているコーン (台形を糸の色で塗り、sumi の輪郭線)
      const yarn = content.yarns.get(placed);
      const color = content.colors.get(yarn?.color ?? placed);
      const hex = color !== undefined ? color.hex : '#000000';
      const shape = coneShape(rect);
      pathCone(ctx, fit, shape);
      ctx.fillStyle = hex;
      ctx.fill();
      ctx.strokeStyle = COLORS.sumi;
      ctx.lineWidth = Math.max(1, 2 * fit.scale);
      ctx.stroke();
      // コーンの中央に色の記号 (明るい色なら sumi、暗い色なら white)
      if (color !== undefined) {
        const symSize = fontPx(fit, Math.max(20, rect.h * 0.16));
        ctx.font = `${symSize}px ${FONT_FAMILY}`;
        ctx.fillStyle = isLightHex(hex) ? COLORS.sumi : COLORS.white;
        const center = toPx(fit, { x: rect.x + rect.w / 2, y: rect.y + rect.h * 0.55 });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(color.symbol, center.x, center.y);
      }
      // 5. 品番 (段階 1〜3 のみ、コーンの下)
      if (showHinbanOnCone(s.stage) && yarn !== undefined) {
        const size = fontPx(fit, 20);
        ctx.font = `${size}px ${FONT_FAMILY}`;
        ctx.fillStyle = COLORS.sumi;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const p = toPx(fit, { x: rect.x + rect.w / 2, y: rect.y + rect.h * 0.95 });
        ctx.fillText(yarn.hinban, p.x, p.y);
      }
    } else {
      // 6. 空いている軸: コーンの形を点線の輪郭だけ
      const shape = coneShape(rect);
      pathCone(ctx, fit, shape);
      ctx.strokeStyle = COLORS.sumiSub;
      ctx.lineWidth = Math.max(1, 2 * fit.scale);
      ctx.setLineDash([6 * fit.scale, 5 * fit.scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 7. 帯の番号 (1 始まり)。段階 1〜3 は全マス、段階 4〜5 は各段の最初のマスだけ
    const showNumber = s.stage <= 3 || indexToCell(i, s.cols).col === 0;
    if (showNumber) {
      const size = fontPx(fit, 20);
      ctx.font = `${size}px ${FONT_FAMILY}`;
      ctx.fillStyle = COLORS.sumiSub;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const p = toPx(fit, { x: rect.x + rect.w * 0.04, y: rect.y + rect.h * 0.02 });
      ctx.fillText(String(i + 1), p.x, p.y);
    }

    // 8. marks: wrong と empty のマスに shu の太い ✕
    if (s.marks !== null) {
      const isWrong = s.marks.wrong.includes(i);
      const isEmpty = s.marks.empty.includes(i);
      if (isWrong || isEmpty) {
        drawCross(ctx, fit, rect);
      }
    }
  }

  // 9. inspected: コーンの上に吹き出し (白地・sumi 枠) で品番と説明
  if (s.inspected !== null) {
    const placed = s.placed[s.inspected] ?? null;
    if (placed !== null) {
      const yarn = content.yarns.get(placed);
      if (yarn !== undefined) {
        const rect = cellRect(s.inspected, s.rows, s.cols);
        drawSpeech(ctx, fit, rect, yarn.hinban, yarn.spec);
      }
    }
  }
}

const LOGICAL_W_PX = 1000;
const LOGICAL_H_PX = 750;

/** 論理座標の四角形を塗る */
function drawRect(
  ctx: CanvasRenderingContext2D,
  fit: { scale: number; offsetX: number; offsetY: number },
  rect: { x: number; y: number; w: number; h: number },
): void {
  const p = toPx(fit, { x: rect.x, y: rect.y });
  ctx.fillRect(p.x, p.y, rect.w * fit.scale, rect.h * fit.scale);
}

/** shu の太い ✕ (マスの中央) */
function drawCross(
  ctx: CanvasRenderingContext2D,
  fit: { scale: number; offsetX: number; offsetY: number },
  rect: { x: number; y: number; w: number; h: number },
): void {
  const inset = Math.min(rect.w, rect.h) * 0.22;
  const a = toPx(fit, { x: rect.x + inset, y: rect.y + inset });
  const b = toPx(fit, { x: rect.x + rect.w - inset, y: rect.y + rect.h - inset });
  const c = toPx(fit, { x: rect.x + rect.w - inset, y: rect.y + inset });
  const d = toPx(fit, { x: rect.x + inset, y: rect.y + rect.h - inset });
  ctx.strokeStyle = COLORS.shu;
  ctx.lineWidth = Math.max(3, 8 * fit.scale);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.stroke();
}

/** 吹き出し (白地・sumi 枠) に品番と説明を描く */
function drawSpeech(
  ctx: CanvasRenderingContext2D,
  fit: { scale: number; offsetX: number; offsetY: number },
  rect: { x: number; y: number; w: number; h: number },
  hinban: string,
  spec: string,
): void {
  const size = fontPx(fit, 20);
  const pad = 10;
  const textW = Math.max(hinban.length, spec.length) * size * 0.6;
  const w = textW + pad * 2;
  const h = size * 2.6 + pad * 2;
  // マスの上に出す (上端に来る場合は下に出す)
  let x = rect.x + rect.w / 2 - w / 2;
  x = Math.max(4, Math.min(x, LOGICAL_W_PX - w - 4));
  const above = rect.y > h + 20;
  const y = above ? rect.y - h - 12 : rect.y + rect.h + 12;
  const p = toPx(fit, { x, y });
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(p.x, p.y, w * fit.scale, h * fit.scale);
  ctx.strokeStyle = COLORS.sumi;
  ctx.lineWidth = Math.max(1, 2 * fit.scale);
  ctx.strokeRect(p.x, p.y, w * fit.scale, h * fit.scale);
  // 吹き出しのしっぽ
  const tailTop = above ? y + h : y;
  const tail = toPx(fit, { x: rect.x + rect.w / 2, y: tailTop + (above ? 10 : -10) });
  const baseL = toPx(fit, { x: rect.x + rect.w / 2 - 10, y: tailTop });
  const baseR = toPx(fit, { x: rect.x + rect.w / 2 + 10, y: tailTop });
  ctx.beginPath();
  ctx.moveTo(baseL.x, baseL.y);
  ctx.lineTo(tail.x, tail.y);
  ctx.lineTo(baseR.x, baseR.y);
  ctx.stroke();
  // 文字 (品番と説明)
  ctx.font = `${size}px ${FONT_FAMILY}`;
  ctx.fillStyle = COLORS.sumi;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const textP = toPx(fit, { x: x + pad, y: y + pad });
  ctx.fillText(hinban, textP.x, textP.y);
  ctx.fillText(spec, textP.x, textP.y + size * 1.3);
}
