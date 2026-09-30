import type { CreelState } from './logic';
import type { Content } from '../../core/content/content';
import { showHinbanOnCone } from './logic';
import { cellRect, pegCenter, pegRadius, toPx } from './geometry';
import { COLORS, FONT_FAMILY } from '../../core/ui/tokens';
import { indexToCell } from '../../core/domain/stripe';
import { drawCheese, drawCross, drawEmptyPeg, drawPosts, drawSpeech, drawSymbol } from './renderer.parts';

/**
 * クリールの盤面を描く (PU-06b。作業者の目線の、正面から見た絵)。fit は画面 (Canvas) への変換。
 * 列の境目に緑の柱、軸は丸で、チーズは手前から差し込んだ丸 (糸の色の丸・紙の芯の輪・中央の穴) に見える。
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
  const radius = pegRadius(s.rows, s.cols); // 論理

  // 1. 奥の地。Canvas 全体を塗る (画面座標)
  ctx.fillStyle = COLORS.creelBack;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // 2. 列の境目の柱
  drawPosts(ctx, fit, s.cols);

  for (let i = 0; i < total; i++) {
    const rect = cellRect(i, s.rows, s.cols);
    const center = pegCenter(i, s.rows, s.cols);
    const c = toPx(fit, center);
    const r = radius * fit.scale; // 画面
    const placed = s.placed[i] ?? null;

    // 3. 帯の番号 (1 始まり)。段階 1〜3 は全軸、段階 4〜5 は各段の最初の軸だけ。
    //    軸の上 (マスの上端) に、マスの幅に収まるときだけ描く (画面上 20px 以上)
    const showNumber = s.stage <= 3 || indexToCell(i, s.cols).col === 0;
    if (showNumber) {
      const size = 20;
      ctx.font = `${size}px ${FONT_FAMILY}`;
      const numText = String(i + 1);
      if (ctx.measureText(numText).width <= rect.w * fit.scale - 4) {
        ctx.fillStyle = COLORS.sumiSub;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const p = toPx(fit, { x: center.x, y: rect.y });
        ctx.fillText(numText, p.x, p.y);
      }
    }

    if (placed !== null) {
      // 4. 立てたチーズ
      const yarn = content.yarns.get(placed);
      const color = content.colors.get(yarn?.color ?? placed);
      const hex = color !== undefined ? color.hex : COLORS.sumi;
      const coreHex = content.cores.get(yarn?.core ?? '')?.hex ?? COLORS.white;
      drawCheese(ctx, c.x, c.y, r, hex, coreHex);
      if (color !== undefined) {
        drawSymbol(ctx, c.x, c.y, r, color.symbol, hex);
      }
      // 5. 品番 (段階 1〜3 のみ、チーズの下)。収まらないときは描かない (「調べる」で見られる)
      if (showHinbanOnCone(s.stage) && yarn !== undefined) {
        const size = 20;
        ctx.font = `${size}px ${FONT_FAMILY}`;
        if (ctx.measureText(yarn.hinban).width <= rect.w * fit.scale - 4) {
          ctx.fillStyle = COLORS.sumi;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(yarn.hinban, c.x, c.y + r + 6);
        }
      }
    } else {
      // 6. 空いている軸: 点線の丸と、中央の木の色の丸
      drawEmptyPeg(ctx, fit, c.x, c.y, r);
    }

    // 7. 間違いの印: wrong と empty の軸に shu の太い ✕
    if (s.marks !== null && (s.marks.wrong.includes(i) || s.marks.empty.includes(i))) {
      drawCross(ctx, fit, c.x, c.y, r * 0.7);
    }
  }

  // 8. 「調べる」の吹き出し (白地・sumi 枠) で品番と説明
  if (s.inspected !== null) {
    const placed = s.placed[s.inspected] ?? null;
    const yarn = placed !== null ? content.yarns.get(placed) : undefined;
    if (yarn !== undefined) {
      const c = toPx(fit, pegCenter(s.inspected, s.rows, s.cols));
      const r = radius * fit.scale;
      drawSpeech(ctx, c.x, c.y - r, c.y + r, yarn.hinban, yarn.spec);
    }
  }
}
