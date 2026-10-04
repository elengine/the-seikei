import type { WindingState } from './logic';
import { COLORS, FONT_FAMILY } from '../../core/ui/tokens';
import { SECTION_LENGTH, STRIPE_H, WING_OUT, WING_SIDE_MAX_RATIO, SLAT_OVER, SLAT_FLARE } from './params';
import type { StageFit } from '../../core/viewport/viewport';
import { DRUM_AREA, fontPx, drumSectionY, threadY, CREEL_END_X, DRUM_END_X } from './geometry';

/**
 * ドラム巻きの盤面のうち、ドラム (円筒) と結び目を描く部品。
 * T2-08 追加修正a: ドラムの軸は縦。両端の円盤は上と下。
 * T2-13a: 桟は端から端まで1本の木の板 (丸い穴が等間隔に並ぶ)。板は胴の外へ斜めに張り出した
 * 羽で、正面から見た側面 (厚み) が片側に見える。上の端の面は胴と同じ色で塗る。
 * 色は COLORS と糸の色だけ。
 */

/** 結び目の束の大きさ (論理座標) */
const KNOT = { w: 24, h: 30 } as const; // 幅はピンの横木に少し重なる程度 (T2-08 追加修正2)

/** ドラムの円筒の見た目の半分の厚み (帯の面の左右のふくらみ) */
const DRUM_BULGE = 10;

/** ドラムの桟の数 (円筒の周りに等間隔に並ぶ。正面に 10〜12 本見える。T2-10 追加修正) */
export const SLAT_COUNT = 16;

/** 板の穴の縦の間隔 (論理座標。T2-13a) */
const HOLE_STEP = 60;
/** 板の穴の半径 (論理座標) */
const HOLE_R = 4;

/** ピン (横木) の静止時の角度 (rad)。正面から少し左に来るように (T2-10 追加修正 b) */
export const PIN_ANGLE0 = -0.9;

/** 4. ドラム: 縦向き円筒。明るさの勾配は横向き (中央を明るく、左右の端を暗く)。
 * drumAngle (ラジアン) で桟が横に流れて回って見える (T2-10b)。見た目だけの値で State には入らない */
export function drawDrum(
  ctx: CanvasRenderingContext2D,
  fit: StageFit,
  s: WindingState,
  hexes: string[],
  base: string,
  tieProgress: number,
  drumAngle = 0,
): void {
  const { x, y, w, h } = DRUM_AREA;
  const secH = h / s.sections;
  // 帯の面の左右のふくらみ
  const leftX = x - DRUM_BULGE;
  const rightX = x + w + DRUM_BULGE;
  const cx = x + w / 2;
  const radius = (rightX - leftX) / 2;

  // 胴の面 (巻き終えていない区画。今の帯を含む)。明るさの勾配は横向き
  // (巻き始めた区画も描き、その上に桟と縞を重ねる。T2-08 追加修正2)
  const grads = ctx.createLinearGradient(leftX, 0, rightX, 0);
  grads.addColorStop(0, COLORS.machineDark);
  grads.addColorStop(0.3, COLORS.machineLight);
  grads.addColorStop(0.7, COLORS.machine);
  grads.addColorStop(1, COLORS.machineDark);
  ctx.fillStyle = grads;
  for (let i = 0; i < s.sections; i++) {
    const finished = (i < s.current || s.phase === 'done') && s.phase !== 'ready';
    if (finished) continue; // 胴を飛ばしてよいのは巻き終えた区画だけ
    const sy = drumSectionY(i, s.sections);
    ctx.fillRect(leftX, sy, rightX - leftX, secH);
  }

  // 板の内側の、薄い緑の輪 (骨組み)。区画の境目に数本 (控えめに。T2-13a)
  for (let i = 1; i < s.sections; i++) {
    const by = drumSectionY(i, s.sections);
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = COLORS.machine;
    ctx.lineWidth = fontPx(fit, 2.5);
    ctx.beginPath();
    ctx.moveTo(leftX, by);
    ctx.lineTo(rightX, by);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 胴の木の板: 端から端まで1本の板として、円筒の周りに等間隔に並ぶ (区画の境目で切れない。T2-13a)。
  // 板 k の角度 θ = drumAngle + 2π k / 板の数。正面から見た x は 中心 + 半径 × sin θ、
  // 幅は 板の幅 × cos θ。cos θ ≤ 0 (裏側) は描かない。
  // 板は胴の外へ斜めに張り出した羽: 側面 (厚み) を板の右側に、|sin θ| に比例した幅で描く
  // (正面の中央では見えず、左右の端で太く見える。T2-13a)
  const slatW0 = fontPx(fit, 12);
  ctx.fillStyle = COLORS.wood;
  for (let k = 0; k < SLAT_COUNT; k++) {
    const th = drumAngle + (Math.PI * 2 * k) / SLAT_COUNT;
    const cosT = Math.cos(th);
    if (cosT <= 0) continue; // 裏側の板
    const sx = cx + radius * Math.sin(th);
    const sw = Math.max(2, slatW0 * cosT);
    // 羽の側面 (少し薄い木の色。|sin θ| に比例し、板の幅の 40% が上限。T2-13a・T2-13 追加修正)
    const sideW = Math.min(WING_OUT, slatW0 * WING_SIDE_MAX_RATIO) * Math.abs(Math.sin(th));
    if (sideW > 1) {
      ctx.globalAlpha = 0.8;
      ctx.fillRect(sx + sw / 2, y, sideW, h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.wood;
    }
    // 板の面 (上端から下端まで1本)
    ctx.fillRect(sx - sw / 2, y, sw, h);
    // ドラムの上の縁より上へはみ出した所。外へ開く (左の板は左へ、右の板は右へ。正面の中央は真上。ドラム設定の羽と同じ考え。PU-14c)
    const flare = SLAT_FLARE * Math.sin(th);
    ctx.beginPath();
    ctx.moveTo(sx - sw / 2, y);
    ctx.lineTo(sx + sw / 2, y);
    ctx.lineTo(sx + sw / 2 + flare, y - SLAT_OVER);
    ctx.lineTo(sx - sw / 2 + flare, y - SLAT_OVER);
    ctx.closePath();
    ctx.fill();
    // 板の丸い穴 (正面に近い板だけ。暗い色の小さな丸を縦に等間隔に。T2-13a)
    if (cosT > 0.6) {
      ctx.fillStyle = COLORS.machineDark;
      for (let hy = y + HOLE_STEP / 2; hy < y + h - fontPx(fit, 10); hy += HOLE_STEP) {
        ctx.beginPath();
        ctx.arc(sx, hy, fontPx(fit, HOLE_R), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = COLORS.wood;
    }
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
    // 縞は、真ん中が上がる山なり (∩。ドラムの周りを回る糸に見える。PU-14 追加修正2 で向きを直した)
    const sag = fontPx(fit, 12);
    let k = 0;
    for (let yy = sy; yy < sy + secH; yy += STRIPE_H) {
      const sh = Math.min(STRIPE_H, sy + secH - yy);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = hexes[k % hexes.length] ?? COLORS.sumiSub;
      ctx.beginPath();
      ctx.moveTo(leftX, yy);
      ctx.quadraticCurveTo(cx, yy - 2 * sag, rightX, yy);
      ctx.lineTo(rightX, yy + sh);
      ctx.quadraticCurveTo(cx, yy + sh - 2 * sag, leftX, yy + sh);
      ctx.closePath();
      ctx.fill();
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

  // 巻いた帯の上の回る筋 (細い縦の明るい線)。桟と同じ式で横に流す (T2-10b)
  for (let i = 0; i < s.sections; i++) {
    const ratio = i < s.current || s.phase === 'done' ? 1 : Math.min(1, (s.lengths[i] ?? 0) / SECTION_LENGTH);
    if (ratio <= 0) continue;
    const sy = drumSectionY(i, s.sections);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = COLORS.machineLight;
    for (let k = 0; k < SLAT_COUNT; k++) {
      const th = drumAngle + (Math.PI * 2 * k) / SLAT_COUNT;
      const cosT = Math.cos(th);
      if (cosT <= 0) continue;
      const sx = cx + radius * Math.sin(th);
      const sw = Math.max(2, fontPx(fit, 4) * cosT);
      ctx.fillRect(sx - sw / 2, sy, sw, secH);
    }
    ctx.globalAlpha = 1;
  }

  // 上の端: 楕円の上半分の面 (胴と同じ灰緑の勾配で塗り、縁に線。胴が上まで続いて見える。T2-13a)
  const rx = (rightX - leftX) / 2;
  const topCy = y + fontPx(fit, 0);
  ctx.fillStyle = grads;
  ctx.beginPath();
  ctx.ellipse(cx, topCy, rx, fontPx(fit, 12), 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = fontPx(fit, 2);
  ctx.stroke();
  // 下の端: 楕円の面の全体 (灰色の金属の円盤) + 放射状の腕 (drumAngle で回す)
  const botCy = y + h;
  ctx.fillStyle = COLORS.steel;
  ctx.beginPath();
  ctx.ellipse(cx, botCy, rx, fontPx(fit, 12), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = fontPx(fit, 2);
  for (let a = 0; a < 6; a++) {
    const ang = drumAngle + (Math.PI / 3) * a;
    ctx.beginPath();
    ctx.moveTo(cx, botCy);
    ctx.lineTo(cx + Math.cos(ang) * rx * 0.85, botCy + Math.sin(ang) * fontPx(fit, 10));
    ctx.stroke();
  }

  // ピン (灰みの緑の縦木 + 鋼のピン。帯ごとに1本)。実物ではドラムに付いているので、
  // ドラムと一緒に回る: θpin = drumAngle + PIN_ANGLE0。正面の x は 中心 + 半径 × sin θpin、
  // 大きさは cos θpin 倍。裏側 (cos θpin ≤ 0) は描かない (T2-10 追加修正 b)
  const thPin = drumAngle + PIN_ANGLE0;
  const cosPin = Math.cos(thPin);
  const pinX = cx + radius * Math.sin(thPin);
  if (cosPin > 0) {
    ctx.fillStyle = COLORS.machineDark;
    // 帯を止める緑の竿: 上は縁の楕円より外へ出し、下は短く (PU-14 追加修正2)
    const overTop = fontPx(fit, 24);
    const overBottom = fontPx(fit, 14);
    ctx.fillRect(pinX - (fontPx(fit, 10) * cosPin) / 2, y - overTop, Math.max(3, fontPx(fit, 10) * cosPin), h + overTop + overBottom);
    for (let i = 0; i < s.sections; i++) {
      const py = drumSectionPinY(i, s.sections);
      ctx.fillStyle = COLORS.steel;
      ctx.fillRect(pinX - fontPx(fit, 2) * cosPin, py - fontPx(fit, 3), Math.max(4, fontPx(fit, 12) * cosPin), fontPx(fit, 6));
      // 巻いている帯のピンには糸の束が掛かる
      if (i === s.current && s.phase === 'winding') {
        ctx.strokeStyle = base;
        ctx.lineWidth = fontPx(fit, 1.5);
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          ctx.moveTo(pinX + fontPx(fit, 5) * cosPin, py - fontPx(fit, 5) + fontPx(fit, 2.5) * k);
          ctx.lineTo(pinX - fontPx(fit, 12) * cosPin, py - fontPx(fit, 5) + fontPx(fit, 2.5) * k);
        }
        ctx.stroke();
      }
    }
  }

  // 結び目 (巻き終えた帯の区画のピンの位置) + 結ぶ演出の輪。ピンと同じ角度で回る (T2-10 追加修正 b)
  for (let i = 0; i < s.sections; i++) {
    const kx = pinX;
    const ky = drumSectionY(i, s.sections) + h / s.sections / 2;
    const onFront = cosPin > 0;
    if ((i < s.current || s.phase === 'done') && onFront) {
      drawKnot(ctx, fit, kx, ky, base);
    }
    if (i === s.current && s.phase === 'cutting' && onFront) {
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
    // クリール側の端: コーンからの糸が、切れたところから垂れ下がる (つながっている区間は drawThreads が描く)
    ctx.moveTo(CREEL_END_X, y);
    ctx.quadraticCurveTo(CREEL_END_X + sway, y + droop / 2, CREEL_END_X + sway, y + droop);
    // ドラム側の端: 筬からの糸が、切れたところから垂れ下がる。2 つの端のあいだは空く (まっすぐ伸びる線は無い)
    ctx.moveTo(DRUM_END_X, y);
    ctx.quadraticCurveTo(DRUM_END_X - sway, y + droop / 2, DRUM_END_X - sway, y + droop);
    ctx.stroke();
  }
  // 1手目の藍の丸印は無くなった (T2-13c: 1回押し。押した点に印を出す装飾は今後の課題)
}


/** 張りのランプの状態 (PU-14b)。break=糸が切れた、ok=適正、high=強すぎ、low=弱すぎ、off=巻いていない (ペダル 0・巻く前・帯の端を結ぶとき) */
export type LampState = 'off' | 'ok' | 'high' | 'low' | 'break';

export function lampStateOf(s: WindingState): LampState {
  if (s.phase === 'broken') {
    return 'break';
  }
  if (s.phase !== 'winding' || s.pedal.pedal <= 0) {
    return 'off';
  }
  if (s.tension > s.range.max) {
    return 'high';
  }
  if (s.tension < s.range.min) {
    return 'low';
  }
  return 'ok';
}

/**
 * ランプの中心 (論理座標。ドラムの左の外、筬とドラムのあいだの上) と半径 (論理)。画面上の直径が 32px 以上になる大きさ。
 * 光る輪 (半径 1.3 倍) の右端が、ドラムの桟の開き (SLAT_FLARE) より左に収まる (PU-14 追加修正2)。
 */
export function lampGeometry(fit: StageFit): { x: number; y: number; r: number } {
  const r = Math.min(42, Math.max(22, fontPx(fit, 16)));
  return { x: DRUM_AREA.x - SLAT_FLARE - 6 - r * 1.3, y: 45, r };
}

/** 張りのランプを描く (適正=緑「○」、強すぎ=橙「▲」、弱すぎ=橙「▼」、切れた=赤「✕」、巻いていない=消灯の灰色)。光っているときは外側に薄い輪 */
export function drawTensionLamp(ctx: CanvasRenderingContext2D, fit: StageFit, s: WindingState): void {
  const state = lampStateOf(s);
  const { x, y, r } = lampGeometry(fit);
  const color =
    state === 'ok' ? COLORS.lampOk : state === 'high' || state === 'low' ? COLORS.lampWarn : state === 'break' ? COLORS.lampBreak : COLORS.steel;
  if (state !== 'off') {
    // 光っている感じ (外側の薄い輪)
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (state === 'off') {
    return;
  }
  // 中の記号 (色だけに頼らない)
  const symbol = state === 'ok' ? '○' : state === 'high' ? '▲' : state === 'low' ? '▼' : '✕';
  ctx.fillStyle = COLORS.white;
  ctx.font = `bold ${Math.round(r * 1.3)}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, x, y + r * 0.05);
}
