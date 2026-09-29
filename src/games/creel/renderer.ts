import type { CreelState } from './logic';
import type { Content } from '../../core/content/content';
import { showHinbanOnCone } from './logic';
import { CREEL_AREA, cellRect, toPx } from './geometry';
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

/** コーンの台形 (下が広い) の頂点。マスの rect (論理座標) から作る。topRatio は上端の位置 (0〜1) */
function coneShape(rect: { x: number; y: number; w: number; h: number }, topRatio = 0.18): { x: number; y: number }[] {
  const cx = rect.x + rect.w / 2;
  const topW = rect.w * 0.36;
  const bottomW = rect.w * 0.6;
  const top = rect.y + rect.h * topRatio;
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

  // 1. 背景 (kinari)。Canvas 全体を塗る (画面座標)
  ctx.fillStyle = COLORS.kinari;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

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
    let coneTopRatio = 0.18; // 番号を描くマスでは、あとでコーンの上端を下げる
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
      const shape = coneShape(rect, coneTopRatio);
      pathCone(ctx, fit, shape);
      ctx.fillStyle = hex;
      ctx.fill();
      ctx.strokeStyle = COLORS.sumi;
      ctx.lineWidth = Math.max(1, 2 * fit.scale);
      ctx.stroke();
      // コーンの中央に色の記号 (明るい色なら sumi、暗い色なら white)
      if (color !== undefined) {
        const symSize = Math.max(20, rect.h * 0.16 * fit.scale); // 画面px (マスの高さに比例)
        ctx.font = `${symSize}px ${FONT_FAMILY}`;
        ctx.fillStyle = isLightHex(hex) ? COLORS.sumi : COLORS.white;
        const center = toPx(fit, { x: rect.x + rect.w / 2, y: rect.y + rect.h * 0.55 });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(color.symbol, center.x, center.y);
      }
      // 5. 品番 (段階 1〜3 のみ、コーンの下)。収まらないときは描かない (「しらべる」で見られる)
      if (showHinbanOnCone(s.stage) && yarn !== undefined) {
        const size = 20;
        ctx.font = `${size}px ${FONT_FAMILY}`;
        const cellScreenW = rect.w * fit.scale;
        if (ctx.measureText(yarn.hinban).width <= cellScreenW - 4) {
          ctx.fillStyle = COLORS.sumi;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          const p = toPx(fit, { x: rect.x + rect.w / 2, y: rect.y + rect.h * 0.95 });
          ctx.fillText(yarn.hinban, p.x, p.y);
        }
      }
    } else {
      // 6. 空いている軸: コーンの形を点線の輪郭だけ
      const shape = coneShape(rect, coneTopRatio);
      pathCone(ctx, fit, shape);
      ctx.strokeStyle = COLORS.sumiSub;
      ctx.lineWidth = Math.max(1, 2 * fit.scale);
      ctx.setLineDash([6 * fit.scale, 5 * fit.scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 7. 帯の番号 (1 始まり)。段階 1〜3 は全マス、段階 4〜5 は各段の最初のマスだけ
    //    番号はマスの上端で左右中央に揃える。収まらないときは描かない。
    //    番号を描くマスでは、コーンの上端を「番号の下端 + 2px」より下に下げる (番号とコーンが重ならない)。
    //    下げた結果、コーンの高さが 24px 未満になるなら番号を描かない (上端は下げない)。
    const showNumber = s.stage <= 3 || indexToCell(i, s.cols).col === 0;
    if (showNumber) {
      const size = 20;
      ctx.font = `${size}px ${FONT_FAMILY}`;
      const cellScreenW = rect.w * fit.scale;
      const numText = String(i + 1);
      const fits = ctx.measureText(numText).width <= cellScreenW - 4;
      // 番号の下端 (画面) = マス上端 + size。これより下にコーンの上端を置く
      const numberBottomScreen = rect.y * fit.scale + size + 2;
      // 必要な上端を論理に直す
      const needTopLogical = numberBottomScreen / fit.scale;
      const defaultTop = rect.y + rect.h * 0.18;
      const shiftedTop = Math.max(defaultTop, needTopLogical);
      const coneHScreen = (rect.y + rect.h * 0.78 - shiftedTop) * fit.scale;
      if (fits && coneHScreen >= 24) {
        coneTopRatio = (shiftedTop - rect.y) / rect.h;
        ctx.fillStyle = COLORS.sumiSub;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const p = toPx(fit, { x: rect.x + rect.w / 2, y: rect.y });
        ctx.fillText(numText, p.x, p.y);
      }
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

/** 吹き出し (白地・sumi 枠) に品番と説明を描く。枠の大きさは実際の文字幅から決める (画面 px) */
function drawSpeech(
  ctx: CanvasRenderingContext2D,
  fit: { scale: number; offsetX: number; offsetY: number },
  rect: { x: number; y: number; w: number; h: number },
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
  const center = toPx(fit, { x: rect.x + rect.w / 2, y: rect.y });
  // マスの上に出す (上に十分な余白がなければ真下)。枠は Canvas の内側 (左右 4px 以上) に収める
  const canvasW = ctx.canvas.width;
  let px = center.x - w / 2;
  px = Math.max(4, Math.min(px, canvasW - w - 4));
  const coneTopScreen = toPx(fit, { x: rect.x, y: rect.y + rect.h * 0.18 }).y;
  const above = coneTopScreen >= h + 14;
  const py = above ? coneTopScreen - h - 12 : toPx(fit, { x: 0, y: rect.y + rect.h }).y + 12;
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(px, py, w, h);
  ctx.strokeStyle = COLORS.sumi;
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, w, h);
  // 吹き出しのしっぽ (枠の外側に出て、コーンの方を向く)
  const tailTopY = above ? py + h : py;
  const tailY = above ? tailTopY + 10 : tailTopY - 10;
  ctx.beginPath();
  ctx.moveTo(center.x - 10, tailTopY);
  ctx.lineTo(center.x, tailY);
  ctx.lineTo(center.x + 10, tailTopY);
  ctx.stroke();
  // 文字 (品番と説明)。枠の左右の余白 10px の内側に収める
  ctx.font = `${size}px ${FONT_FAMILY}`;
  ctx.fillStyle = COLORS.sumi;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(hinban, px + pad, py + pad);
  ctx.fillText(spec, px + pad, py + pad + size);
}
