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

/** hex (#RRGGBB) の明るさを tone% (-30〜30、正は明るく、負は暗く) 変える */
function toneHex(hex: string, tone: number | undefined): string {
  if (tone === undefined || tone === 0) {
    return hex;
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return hex; // 6桁の hex でなければそのまま
  }
  const channels = [0, 1, 2].map((i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16));
  const toned = channels.map((c) => {
    const v = tone >= 0 ? c + (255 - c) * (tone / 100) : c * (1 + tone / 100);
    return Math.max(0, Math.min(255, Math.round(v)));
  });
  return `#${toned.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** 内容データから FabricSpec を作る (plan の糸 → 色をたどって hex にする。tone があれば明るさを変える) */
export function fabricSpecFor(pattern: Pattern, content: Content): FabricSpec {
  const warp: ColorHex[] = [];
  for (const run of pattern.plan) {
    const yarn = content.yarns.get(run.yarn);
    const colorId: ColorId = yarn !== undefined ? yarn.color : run.yarn;
    const color = content.colors.get(colorId);
    const hex = color !== undefined ? color.hex : '#000000';
    const toned = toneHex(hex, yarn?.tone);
    for (let n = 0; n < run.count; n++) {
      warp.push(toned);
    }
  }
  const weftColor = content.colors.get(pattern.weft);
  return { warp, weft: weftColor !== undefined ? weftColor.hex : '#000000' };
}

/** 一覧の行の見本 (size px 四角の小さな生地)。経糸の色の並び (1リピート) を縦縞で見せる。Canvas を使わない */
export function createFabricSwatch(pattern: Pattern | undefined, content: Content, size = 40): HTMLElement {
  const swatch = document.createElement('span');
  swatch.classList.add('fabric-swatch');
  swatch.setAttribute('aria-hidden', 'true');
  swatch.style.width = `${size}px`;
  swatch.style.height = `${size}px`;
  if (pattern !== undefined) {
    const { warp } = fabricSpecFor(pattern, content);
    // 同じ色が続く所をまとめて、色の境目ごとに止めた線形グラデーションにする
    const stops: string[] = [];
    let start = 0;
    for (let i = 1; i <= warp.length; i++) {
      if (i === warp.length || warp[i] !== warp[start]) {
        stops.push(`${warp[start]} ${(start / warp.length) * 100}% ${(i / warp.length) * 100}%`);
        start = i;
      }
    }
    if (stops.length > 0) {
      swatch.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
    }
  }
  return swatch;
}
