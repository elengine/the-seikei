import type { WindingState } from './logic';
import { COLORS } from '../../core/ui/tokens';
import { SECTION_LENGTH, STRIPE_H } from './params';
import type { StageFit } from '../../core/viewport/viewport';
import { DRUM_AREA, fontPx, drumSectionY, threadY, CREEL_AREA, CREEL_END_X, DRUM_END_X } from './geometry';

/**
 * ドラム巻きの盤面のうち、ドラム (円筒) と結び目を描く部品。
 * T2-08 追加修正a: ドラムの軸は縦。両端の円盤は上と下、木の桟は縦長の板を左右に並べる。
 * 帯の区画は上から下へ等分。巻いた帯は横の縞。結び目の束は各帯の区画の左の端。
 * 色は COLORS と糸の色だけ。
 */

/** 結び目の束の大きさ (論理座標) */
const KNOT = { w: 24, h: 30 } as const; // 幅はピンの横木に少し重なる程度 (T2-08 追加修正2)

/** ドラムの円筒の見た目の半分の厚み (帯の面の左右のふくらみ) */
const DRUM_BULGE = 10;

/** 4. ドラム: 縦向き円筒。明るさの勾配は横向き (中央を明るく、左右の端を暗く) */
export function drawDrum(
  ctx: CanvasRenderingContext2D,
  fit: StageFit,
  s: WindingState,
  hexes: string[],
  base: string,
  tieProgress: number,
): void {
  const { x, y, w, h } = DRUM_AREA;
  const secH = h / s.sections;
  // 帯の面の左右のふくらみ
  const leftX = x - DRUM_BULGE;
  const rightX = x + w + DRUM_BULGE;

  // 胴の木の桟 (巻き終えていない区画。今の帯を含む)。明るさの勾配は横向き
  // (巻き始めた区画も桟を描き、その上に縞を重ねる。T2-08 追加修正2)
  const grads = ctx.createLinearGradient(leftX, 0, rightX, 0);
  grads.addColorStop(0, COLORS.machineDark);
  grads.addColorStop(0.3, COLORS.machineLight);
  grads.addColorStop(0.7, COLORS.machine);
  grads.addColorStop(1, COLORS.machineDark);
  ctx.fillStyle = grads;
  for (let i = 0; i < s.sections; i++) {
    const len = s.lengths[i] ?? 0;
    const finished = (i < s.current || s.phase === 'done') && s.phase !== 'ready';
    if (finished) continue; // 桟を飛ばしてよいのは巻き終えた区画だけ
    const sy = drumSectionY(i, s.sections);
    ctx.fillRect(leftX, sy, rightX - leftX, secH);
    // 桟 (縦長の板を左右にすき間をあけて並べる)
    ctx.fillStyle = COLORS.wood;
    const slatW = fontPx(fit, 12);
    const gap = fontPx(fit, 14);
    for (let sx = leftX + fontPx(fit, 8); sx + slatW < rightX; sx += slatW + gap) {
      ctx.fillRect(sx, sy + fontPx(fit, 6), slatW, secH - fontPx(fit, 12));
    }
    ctx.fillStyle = grads;
  }

  // 帯の区画 (巻いた帯は横の縞。糸はドラムの周りを回るので、この向きでは横の線になる)
  for (let i = 0; i < s.sections; i++) {
    const sy = drumSectionY(i, s.sections);
    const isCurrent = i === s.current;
    const len = s.lengths[i] ?? 0;
    const full = i < s.current || s.phase === 'done';
    if (isCurrent && s.phase === 'ready') continue;
    const ratio = full ? 1 : Math.min(1, len / SECTION_LENGTH);
    if (ratio <= 0 && !full) continue;
    // 縞の濃さ: 巻いた割合で 0.15 → 1 (巻き始めは薄い。T2-08 追加修正a)
    const alpha = full ? 1 : 0.15 + 0.85 * ratio;
    // 柄の並びの色を、区画の高さの中で上から順に繰り返す (1本の高さは STRIPE_H。T2-08 追加修正2)
    let k = 0;
    for (let yy = sy; yy < sy + secH; yy += STRIPE_H) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = hexes[k % hexes.length] ?? COLORS.sumiSub;
      ctx.fillRect(leftX, yy, rightX - leftX, Math.min(STRIPE_H, sy + secH - yy));
      k++;
    }
    ctx.globalAlpha = 1;
    // 完了した帯は縁に濃い線を引いて「完了」を分かるようにする
    if (full) {
      ctx.strokeStyle = COLORS.sumi;
      ctx.lineWidth = fontPx(fit, 2);
      ctx.strokeRect(leftX, sy, rightX - leftX, secH);
    }
    // 帯の左右のふくらみ (割合に比例して最大 6)
    const bulge = 6 * ratio;
    ctx.fillStyle = base;
    ctx.fillRect(leftX - bulge, sy, fontPx(fit, 2), secH);
    ctx.fillRect(rightX + bulge - fontPx(fit, 2), sy, fontPx(fit, 2), secH);
  }

  // 端の丸い面 (灰色の金属の円盤) は上と下。放射状の腕
  for (const ey of [y - fontPx(fit, 4), y + h - fontPx(fit, 4)]) {
    const rx = (rightX - leftX) / 2;
    const cy = ey + fontPx(fit, 4);
    ctx.fillStyle = COLORS.steel;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, cy, rx, fontPx(fit, 12), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.sumiSub;
    ctx.lineWidth = fontPx(fit, 2);
    for (let a = 0; a < 6; a++) {
      const ang = (Math.PI / 3) * a;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, cy);
      ctx.lineTo(x + w / 2 + Math.cos(ang) * rx * 0.85, cy + Math.sin(ang) * fontPx(fit, 10));
      ctx.stroke();
    }
  }

  // ピン (灰みの緑の縦木 + 鋼のピン。帯ごとに1本。ドラムの左の縁に沿って縦に)
  ctx.fillStyle = COLORS.machineDark;
  ctx.fillRect(x - DRUM_BULGE - fontPx(fit, 10), y, fontPx(fit, 10), h + fontPx(fit, 16));
  for (let i = 0; i < s.sections; i++) {
    const py = drumSectionPinY(i, s.sections);
    ctx.fillStyle = COLORS.steel;
    ctx.fillRect(x - DRUM_BULGE - fontPx(fit, 12), py - fontPx(fit, 3), fontPx(fit, 12), fontPx(fit, 6));
    // 巻いている帯のピンには糸の束が掛かる
    if (i === s.current && s.phase === 'winding') {
      ctx.strokeStyle = base;
      ctx.lineWidth = fontPx(fit, 1.5);
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        ctx.moveTo(x - DRUM_BULGE - fontPx(fit, 10), py - fontPx(fit, 5) + fontPx(fit, 2.5) * k);
        ctx.lineTo(x - DRUM_BULGE - fontPx(fit, 22), py - fontPx(fit, 5) + fontPx(fit, 2.5) * k);
      }
      ctx.stroke();
    }
  }

  // 結び目 (巻き終えた帯の区画の左の端) + 結ぶ演出の輪
  for (let i = 0; i < s.sections; i++) {
    const kx = x + fontPx(fit, 14);
    const ky = drumSectionY(i, s.sections) + h / s.sections / 2;
    if (i < s.current || s.phase === 'done') {
      drawKnot(ctx, fit, kx, ky, base);
    }
    if (i === s.current && s.phase === 'cutting') {
      // 結ぶ演出: 輪が大きく広がってから結び目の束に縮む (tieProgress 0→1)
      const p = Math.min(1, Math.max(0, tieProgress));
      if (p > 0 && p < 1) {
        const r = KNOT.h * (0.5 + 2.5 * Math.sin(p * Math.PI));
        ctx.strokeStyle = base;
        ctx.lineWidth = fontPx(fit, 3);
        ctx.globalAlpha = 1 - p * 0.4;
        ctx.beginPath();
        ctx.arc(kx, ky, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (p >= 1) {
        drawKnot(ctx, fit, kx, ky, base);
      }
    }
  }
}

/** 帯 i のピンの y (ドラムの左の縁に、帯ごとの区画の高さ) */
export function drumSectionPinY(i: number, sections: number): number {
  const secH = DRUM_AREA.h / sections;
  return DRUM_AREA.y + secH * i + secH / 2;
}

/** 結び目の束 (糸の色の輪に、sumi の輪郭と kinari の縁取りを付ける。区画の左の端に置く) */
function drawKnot(
  ctx: CanvasRenderingContext2D,
  fit: StageFit,
  x: number,
  y: number,
  hex: string,
): void {
  // 縁取り (kinari の太い線) → 糸の色の輪 → その上に sumi の細い輪郭。
  // 帯の色 (紺など) に埋もれず、どの色の帯でも見分けられる (T2-08 追加修正2)
  const rings: Array<{ color: string; w: number }> = [
    { color: COLORS.kinari, w: 5 },
    { color: hex, w: 3 },
    { color: COLORS.sumi, w: 1 },
  ];
  for (const ring of rings) {
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = fontPx(fit, ring.w);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(x, y + (i - 2) * KNOT.h * 0.4, KNOT.w / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** 'broken' の切れた糸 (当たり判定の endPoint の位置と合わせる。台が動いても変わらない) */
export function drawBrokenThread(
  ctx: CanvasRenderingContext2D,
  fit: StageFit,
  s: WindingState,
  opts: { threadCount: number; show: 'red' | 'small' | 'droop'; timeMs: number },
  base: string,
): void {
  if (s.phase !== 'broken' || s.brk.kind !== 'broken') {
    return;
  }
  // 切れた糸ごとに切れ端を描く。1手目を済ませた糸は藍の丸印
  for (const th of s.brk.threads) {
    const y = threadY(th, opts.threadCount);
    const sway = opts.show === 'red' ? Math.sin(opts.timeMs / 600) * 6 : 0;
    const droop = opts.show === 'small' ? 14 : 34;
    ctx.strokeStyle = opts.show === 'red' ? COLORS.shu : base;
    ctx.lineWidth = fontPx(fit, 2.5);
    ctx.beginPath();
    // クリール側の切れ端 (切れて垂れる)
    ctx.moveTo(CREEL_AREA.x + CREEL_AREA.w / 2, y);
    ctx.lineTo(CREEL_END_X, y);
    ctx.quadraticCurveTo(CREEL_END_X + sway, y + droop / 2, CREEL_END_X + sway, y + droop);
    // ドラム側の切れ端 (今の帯の区画のピンから)
    ctx.moveTo(drumSectionPinY(s.current, s.sections), y);
    ctx.lineTo(DRUM_END_X, y);
    ctx.quadraticCurveTo(DRUM_END_X - sway, y + droop / 2, DRUM_END_X - sway, y + droop);
    ctx.stroke();
  }
  // 1手目を済ませたら、押した側の端に藍の丸印
  const first = s.brk.first;
  if (first) {
    const y = threadY(first.thread, opts.threadCount);
    const droop = opts.show === 'small' ? 14 : 34;
    ctx.fillStyle = COLORS.ai;
    ctx.beginPath();
    const x = first.side === 'creel' ? CREEL_END_X : DRUM_END_X;
    ctx.arc(x, y + droop, fontPx(fit, 9), 0, Math.PI * 2);
    ctx.fill();
  }
}
