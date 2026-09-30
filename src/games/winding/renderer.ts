import type { WindingState } from './logic';
import { qualities } from './logic';
import type { Content } from '../../core/content/content';
import { COLORS, FONT_FAMILY } from '../../core/ui/tokens';
import { speedOf } from '../../core/mechanics/pedal';
import { TENSION, SECTION_LENGTH } from './params';
import { CREEL_AREA, DRUM_AREA, TOP_AREA, CREEL_END_X, DRUM_END_X, toPx, fontPx } from './geometry';

/**
 * ドラム巻きの盤面の描画 (P2 T2-05・追加修正)。
 * 論理座標で描く部分は ctx の変換 (translate + scale) で画面に合わせる。
 * 文字は、変換を戻したあとに論理座標の点を toPx で画面の点に直して描く (大きさは画面 px)。
 */

/** 帯の巻き終わりの結び目の束の大きさ (論理座標) */
const KNOT = { w: 10, h: 26 } as const;

/** 柄の plan の色を上から順に hex の並びにする (糸の色は内容データの hex を使う) */
function patternHexes(content: Content, patternId: string): string[] {
  const pattern = content.patterns.get(patternId);
  if (!pattern) return [COLORS.sumiSub];
  const hexes: string[] = [];
  for (const run of pattern.plan) {
    const yarn = content.yarns.get(run.yarn);
    if (!yarn) continue;
    const color = content.colors.get(yarn.color);
    if (!color) continue;
    for (let i = 0; i < run.count; i++) hexes.push(color.hex);
  }
  return hexes.length > 0 ? hexes : [COLORS.sumiSub];
}

/** 柄の基本色 (糸とコーンに使う。plan の最初の色) */
function baseHex(content: Content, patternId: string): string {
  return patternHexes(content, patternId)[0] ?? COLORS.sumiSub;
}

/** 文字を書く (位置は論理座標の点を toPx で画面の点に直し、大きさは画面 px) */
function text(
  ctx: CanvasRenderingContext2D,
  fit: { scale: number; offsetX: number; offsetY: number },
  str: string,
  xLogical: number,
  yLogical: number,
  sizePx = 20,
): void {
  if (str === '') return;
  const p = toPx(fit, { x: xLogical, y: yLogical });
  ctx.fillStyle = COLORS.sumi;
  ctx.font = `${sizePx}px ${FONT_FAMILY}`;
  ctx.fillText(str, p.x, p.y);
}

/**
 * 盤面を描く。
 * show は切れた糸の見せ方 (難易度)、timeMs は揺れの計算用、tieProgress は
 * 'cutting' から次の帯へ移る演出 (0〜1、無ければ 0)。
 */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  fit: { scale: number; offsetX: number; offsetY: number },
  s: WindingState,
  content: Content,
  opts: { threadCount: number; show: 'red' | 'droop' | 'small'; timeMs: number; tieProgress?: number },
): void {
  const hexes = patternHexes(content, s.patternId);
  const base = baseHex(content, s.patternId);

  // 1. 背景 (kinari) は、変換の前に Canvas の画面上の大きさで塗る
  ctx.fillStyle = COLORS.kinari;
  ctx.fillRect(0, 0, ctx.canvas.clientWidth || ctx.canvas.width, ctx.canvas.clientHeight || ctx.canvas.height);

  // 論理座標で描く: save → translate → scale
  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);

  // 2. クリール (machine 色の枠と、柄の色のコーン)
  ctx.strokeStyle = COLORS.machineDark;
  ctx.lineWidth = fontPx(fit, 4);
  ctx.strokeRect(CREEL_AREA.x, CREEL_AREA.y, CREEL_AREA.w, CREEL_AREA.h);
  for (let t = 0; t < opts.threadCount; t++) {
    const y = coneY(t, opts.threadCount);
    ctx.fillStyle = hexes[t % hexes.length] ?? COLORS.sumiSub;
    ctx.beginPath();
    ctx.arc(CREEL_AREA.x + CREEL_AREA.w / 2, y, fontPx(fit, 10), 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. 糸 (コーンからドラムまで、柄の色の線)
  ctx.strokeStyle = base;
  ctx.lineWidth = fontPx(fit, 2);
  ctx.beginPath();
  for (let t = 0; t < opts.threadCount; t++) {
    const y = coneY(t, opts.threadCount);
    ctx.moveTo(CREEL_AREA.x + CREEL_AREA.w / 2, y);
    ctx.lineTo(CREEL_END_X, y);
    ctx.lineTo(DRUM_END_X, y);
    ctx.lineTo(drumPinX(s.current, s.sections), DRUM_AREA.y + 40);
  }
  ctx.stroke();
  // 巻いているときは、糸の上に小さな印が流れて動く (速さに比例)
  if (s.phase === 'winding') {
    const speed = speedOf(s.pedal, TENSION); // 長さ/秒 (40 を直書きしない)
    const offset = ((opts.timeMs / 1000) * speed * 12) % 120;
    ctx.fillStyle = COLORS.sumi;
    for (let t = 0; t < opts.threadCount; t++) {
      const y = coneY(t, opts.threadCount);
      ctx.fillRect(CREEL_END_X + offset, y - fontPx(fit, 3), fontPx(fit, 8), fontPx(fit, 6));
    }
  }

  // 4. ドラム (木の桟のかご状の胴と、帯の区画)
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(DRUM_AREA.x, DRUM_AREA.y, DRUM_AREA.w, 24);
  ctx.fillRect(DRUM_AREA.x, DRUM_AREA.y + DRUM_AREA.h - 24, DRUM_AREA.w, 24);
  // 桟 (木の縞)
  ctx.fillStyle = COLORS.machine;
  for (let i = 0; i < 6; i++) {
    const x = DRUM_AREA.x + (DRUM_AREA.w / 6) * i + 8;
    ctx.fillRect(x, DRUM_AREA.y + 24, 6, DRUM_AREA.h - 48);
  }
  // 帯の区画を sections 等分し、巻いた長さに応じた厚みで描く
  const secW = DRUM_AREA.w / s.sections;
  for (let i = 0; i < s.sections; i++) {
    const x = DRUM_AREA.x + secW * i;
    // ピン (鋼色の短いピン。帯ごとに1本)
    ctx.fillStyle = COLORS.steel;
    ctx.fillRect(drumPinX(i, s.sections) - fontPx(fit, 3), DRUM_AREA.y - 20, fontPx(fit, 6), fontPx(fit, 20));
    // 巻き終えた帯・巻いている帯は柄の色の縞。厚み = 巻いた長さの割合
    const isCurrent = i === s.current;
    const len = s.lengths[i] ?? 0;
    const thickness = (len / SECTION_LENGTH) * DRUM_AREA.h;
    if (isCurrent && s.phase === 'ready') continue; // まだ巻いていない帯のピンは何も掛かっていない
    if (len > 0 || (!isCurrent && i < s.current)) {
      const h = i < s.current || s.phase === 'done' ? DRUM_AREA.h : Math.max(0, thickness);
      // 巻き終えた帯はいちばん下から、巻いている帯は下から伸びる
      for (let k = 0; k < hexes.length; k++) {
        ctx.fillStyle = hexes[k] ?? COLORS.sumiSub;
        const bandH = h / hexes.length;
        ctx.fillRect(x, DRUM_AREA.y + DRUM_AREA.h - bandH * (k + 1), secW - 4, bandH);
      }
    }
    // 巻き終えた帯には、区画の上端に結び目の束 (小さな輪を重ねた形)
    if (i < s.current || s.phase === 'done') {
      drawKnot(ctx, fit, x + secW / 2, DRUM_AREA.y - 6, base);
    }
    // 'cutting' の演出: 今の帯の端が束になって結び目に変わる様子
    if (isCurrent && s.phase === 'cutting') {
      const p = Math.min(1, Math.max(0, opts.tieProgress ?? 0));
      ctx.globalAlpha = p;
      drawKnot(ctx, fit, x + secW / 2, DRUM_AREA.y - 6, base);
      ctx.globalAlpha = 1;
    }
  }

  // 5. 目盛り盤 (今の帯の巻いた長さを円の針で示す)
  const dialX = 460;
  const dialY = TOP_AREA.y + 45;
  const dialR = 32;
  ctx.strokeStyle = COLORS.sumi;
  ctx.lineWidth = fontPx(fit, 3);
  ctx.beginPath();
  ctx.arc(dialX, dialY, dialR, 0, Math.PI * 2);
  ctx.stroke();
  const len = s.lengths[s.current] ?? 0;
  const ratio = Math.min(1, Math.max(0, len / SECTION_LENGTH));
  const angle = -Math.PI / 2 + ratio * Math.PI * 2;
  ctx.beginPath();
  ctx.moveTo(dialX, dialY);
  ctx.lineTo(dialX + Math.cos(angle) * (dialR - 6), dialY + Math.sin(angle) * (dialR - 6));
  ctx.stroke();

  // 6. 赤ランプ ('broken' で shu で点灯 (点滅しない)。それ以外は灰色で消灯)
  const lampX = 620;
  const lampY = TOP_AREA.y + 45;
  ctx.fillStyle = s.phase === 'broken' ? COLORS.shu : COLORS.steel;
  ctx.beginPath();
  ctx.arc(lampX, lampY, 16, 0, Math.PI * 2);
  ctx.fill();

  // 7. 'broken' のとき、切れた糸を途中で切って、両側の切れ端を垂らす
  if (s.phase === 'broken' && s.brk.kind === 'broken') {
    const t = s.brk.thread;
    const y = coneY(t, opts.threadCount);
    const sway = opts.show === 'red' ? Math.sin(opts.timeMs / 600) * 6 : 0;
    const droop = opts.show === 'small' ? 14 : 34;
    ctx.strokeStyle = opts.show === 'red' ? COLORS.shu : base;
    ctx.lineWidth = fontPx(fit, 2.5);
    ctx.beginPath();
    // クリール側の切れ端 (x 380 付近で切れて垂れる)
    ctx.moveTo(CREEL_AREA.x + CREEL_AREA.w / 2, y);
    ctx.lineTo(CREEL_END_X, y);
    ctx.quadraticCurveTo(CREEL_END_X + sway, y + droop / 2, CREEL_END_X + sway, y + droop);
    // ドラム側の切れ端 (x 460 付近で切れて垂れる)
    ctx.moveTo(drumPinX(s.current, s.sections), DRUM_AREA.y + 40);
    ctx.lineTo(DRUM_END_X, y);
    ctx.quadraticCurveTo(DRUM_END_X - sway, y + droop / 2, DRUM_END_X - sway, y + droop);
    ctx.stroke();
    // 1手目を済ませたら、クリール側の端に藍の丸印
    if (s.brk.firstTapped) {
      ctx.fillStyle = COLORS.ai;
      ctx.beginPath();
      ctx.arc(CREEL_END_X, y + droop, fontPx(fit, 9), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 8. 'done' のとき、ドラムの表面を帯ごとの出来で描き分ける (低い帯ほど波打たせる)
  if (s.phase === 'done') {
    const qs = qualities(s);
    for (let i = 0; i < s.sections; i++) {
      const q = qs[i] ?? 0;
      const wave = (1 - q) * 12; // 波の高さ = (1 − 出来) × 係数
      const x = DRUM_AREA.x + secW * i + secW / 2;
      ctx.strokeStyle = COLORS.sumi;
      ctx.lineWidth = fontPx(fit, 2);
      ctx.beginPath();
      for (let yy = 0; yy <= 20; yy++) {
        const px = x + (Math.sin((yy / 20) * Math.PI * 3) * wave) / 2;
        const py = DRUM_AREA.y + 30 + (yy / 20) * (DRUM_AREA.h - 60);
        if (yy === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  // 変換を戻す
  ctx.restore();

  // 文字は restore のあとに描く (論理座標の点を toPx で画面の点に直す。大きさは画面 px)
  // 5b. 「帯 3 / 5」は目盛り盤の右
  text(ctx, fit, `帯 ${s.current + 1} / ${s.sections}`, dialX + dialR + 18, dialY + 17, 20);
  // 6b. 「停止」は赤ランプの右
  if (s.phase === 'broken') {
    text(ctx, fit, '停止', lampX + 28, lampY + 17, 20);
  }
}

/** 糸 t のコーンの y (クリールの中で上から下へ等間隔) */
function coneY(t: number, threadCount: number): number {
  const n = Math.max(1, threadCount);
  const top = CREEL_AREA.y + 60;
  const bottom = CREEL_AREA.y + CREEL_AREA.h - 60;
  return top + ((bottom - top) * t) / (n - 1 || 1);
}

/** 帯 i のピンの x (ドラムの上に等間隔) */
function drumPinX(i: number, sections: number): number {
  const secW = DRUM_AREA.w / sections;
  return DRUM_AREA.x + secW * i + secW / 2;
}

/** 結び目の束 (柄の色の細い線で、小さな輪をいくつか重ねた形) */
function drawKnot(
  ctx: CanvasRenderingContext2D,
  fit: { scale: number; offsetX: number; offsetY: number },
  x: number,
  y: number,
  hex: string,
): void {
  ctx.strokeStyle = hex;
  ctx.lineWidth = fontPx(fit, 2);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x + (i - 1) * KNOT.w * 0.5, y, KNOT.h / 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}
