import type { Pattern, ColorId } from '../domain/types';
import type { Content } from '../content/content';
import { COLORS } from './tokens';

export interface FabricSpec {
  warp: ColorHex[];     // 経糸の色を左から順に(1リピートぶん)
  weft: ColorHex;       // 緯糸の色
}
type ColorHex = string;

/** Canvas(CSS px の座標で描ける ctx)の x, y, w, h の範囲に生地を描く */
export function drawFabric(
  ctx: CanvasRenderingContext2D,
  spec: FabricSpec,
  rect: { x: number; y: number; w: number; h: number },
  opts?: { threadPx?: number },
): void {
  const threadPx = opts?.threadPx ?? 3;
  ctx.save();
  try {
    // rect の外にはみ出さないように clip する
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    // 経糸のマスを左から右へ (市松の「経糸の色」のマス)
    const colCount = Math.ceil(rect.w / threadPx);
    const rowCount = Math.ceil(rect.h / threadPx);
    for (let col = 0; col < colCount; col++) {
      const color = spec.warp[col % spec.warp.length] ?? '#000000';
      for (let row = 0; row < rowCount; row++) {
        // 平織りに見えるよう、縦 threadPx ごとに経糸と緯糸を市松に交互に描く
        if ((row + col) % 2 === 0) {
          ctx.fillStyle = color;
        } else {
          ctx.fillStyle = spec.weft;
        }
        ctx.fillRect(rect.x + col * threadPx, rect.y + row * threadPx, threadPx, threadPx);
      }
    }

    // 外周に 1px の枠線 (sumiSub)
    ctx.strokeStyle = COLORS.sumiSub;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  } finally {
    ctx.restore();
  }
}

/** 内容データから FabricSpec を作る (plan の糸 → 色をたどって hex にする) */
export function fabricSpecFor(pattern: Pattern, content: Content): FabricSpec {
  const warp: ColorHex[] = [];
  for (const run of pattern.plan) {
    const yarn = content.yarns.get(run.yarn);
    const colorId: ColorId = yarn !== undefined ? yarn.color : run.yarn;
    const color = content.colors.get(colorId);
    const hex = color !== undefined ? color.hex : '#000000';
    for (let n = 0; n < run.count; n++) {
      warp.push(hex);
    }
  }
  const weftColor = content.colors.get(pattern.weft);
  return { warp, weft: weftColor !== undefined ? weftColor.hex : '#000000' };
}
