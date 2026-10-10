import type { WindingState } from './logic';
import { COLORS, FONT_FAMILY } from '../../core/ui/tokens';
import { DRUM_SLAT_W, DRUM_HOLE_STEP, DRUM_HOLE_R, DRUM_HOLE_FACING, DRUM_POLE_W, DRUM_POLE_OVER, DRUM_BRACKET_ALONG, DRUM_BRACKET_ACROSS } from '../../core/ui/drumLook';
import { SECTION_LENGTH, STRIPE_H, WING_OUT, WING_SIDE_MAX_RATIO, SLAT_OVER, SLAT_FLARE, OVER_GRACE_MS, OVER_BLINK_MS, OVER_BLINK_FAST_MS, YARN_FEEL } from './params';
import type { StageFit } from '../../core/viewport/viewport';
import { DRUM_AREA, fontPx, drumSectionY, threadY, CREEL_END_X, DRUM_END_X, surfaceY, DRUM_BULGE } from './geometry';
export { DRUM_BULGE };

/**
 * ドラム巻きの盤面のうち、ドラム (円筒) と結び目を描く部品。
 * T2-08 追加修正a: ドラムの軸は縦。両端の円盤は上と下。
 * T2-13a: 桟は端から端まで1本の木の板 (丸い穴が等間隔に並ぶ)。板は胴の外へ斜めに張り出した
 * 羽で、正面から見た側面 (厚み) が片側に見える。上の端の面は胴と同じ色で塗る。
 * 色は COLORS と糸の色だけ。
 */

/** 結び目の束の大きさ (論理座標) */
const KNOT = { w: 24, h: 30 } as const; // 幅はピンの横木に少し重なる程度 (T2-08 追加修正2)

/** ドラムの桟の数 (円筒の周りに等間隔に並ぶ。正面に 10〜12 本見える。T2-10 追加修正) */
export const SLAT_COUNT = 16;
import { PIN_ANGLE0 } from './geometry';
export { PIN_ANGLE0 };

/** 板の穴の縦の間隔・半径は、ビーミングのドラムと共通 (core/ui/drumLook.ts。T2-13a) */
const HOLE_STEP = DRUM_HOLE_STEP;
const HOLE_R = DRUM_HOLE_R;

/** ピン (横木) の静止時の角度 (rad)。正面から少し左に来るように (T2-10 追加修正 b) */
/** ピンの向きの基準 PIN_ANGLE0 は geometry.ts にある (T2-19b で竿の止まる位置の計算と共有) */

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

  // 胴の面 (全区画)。明るさの勾配は横向き。巻き終えた区画の山なりの下にも緑を残す
  // (白っぽい色が見えないように。T2-16 前: ドラムの絵の直し)
  const grads = ctx.createLinearGradient(leftX, 0, rightX, 0);
  grads.addColorStop(0, COLORS.machineDark);
  grads.addColorStop(0.3, COLORS.machineLight);
  grads.addColorStop(0.7, COLORS.machine);
  grads.addColorStop(1, COLORS.machineDark);
  ctx.fillStyle = grads;
  for (let i = 0; i < s.sections; i++) {
    const sy = drumSectionY(i, s.sections);
    ctx.fillRect(leftX, sy, rightX - leftX, secH);
  }

  // 上の縁の内側 (見えている上の面) も胴と同じ薄緑で塗る (T2-16 前2:
  // 楕円の内側と胴の上の端のあいだが背景色にならないようにする)
  const topCy = y;
  const topRy = 12; // ARC_RISE と同じ (surfaceY の ∩ とぴったり合う。T2-16 その5)
  ctx.beginPath();
  ctx.ellipse(cx, topCy, radius, topRy, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  // 板の内側の、薄い緑の輪 (骨組み)。区画の境目に数本 (控えめに。T2-13a)
  for (let i = 1; i < s.sections; i++) {
    const by = drumSectionY(i, s.sections);
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = COLORS.machine;
    ctx.lineWidth = fontPx(fit, 2.5);
    ctx.beginPath();
    // 境目の線も surfaceY の ∩ に沿う (T2-16 その5)
    for (let st = 0; st <= 20; st++) {
      const px = DRUM_AREA.x + (DRUM_AREA.w * st) / 20;
      const py = surfaceY(px, by);
      if (st === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 上の縁の線 (灰色)。胴の塗りのあと、板の前に引く (T2-16 前2 の描く順)
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = fontPx(fit, 2);
  ctx.beginPath();
  ctx.ellipse(cx, topCy, radius, topRy, 0, Math.PI, Math.PI * 2);
  ctx.stroke();

  // 胴の木の板: 端から端まで1本の板として、円筒の周りに等間隔に並ぶ (区画の境目で切れない。T2-13a)。
  // 板 k の角度 θ = drumAngle + 2π k / 板の数。正面から見た x は 中心 + 半径 × sin θ、
  // 幅は 板の幅 × cos θ。cos θ ≤ 0 (裏側) は描かない。
  // 板は胴の外へ斜めに張り出した羽: 側面 (厚み) を板の右側に、|sin θ| に比例した幅で描く
  // (正面の中央では見えず、左右の端で太く見える。T2-13a)
  const slatW0 = fontPx(fit, DRUM_SLAT_W);
  ctx.fillStyle = COLORS.wood;
  for (let k = 0; k < SLAT_COUNT; k++) {
    const th = drumAngle + (Math.PI * 2 * k) / SLAT_COUNT;
    const cosT = Math.cos(th);
    if (cosT <= 0) continue; // 裏側の板
    const sx = cx + radius * Math.sin(th);
    const sw = Math.max(2, slatW0 * cosT);
    // 羽の側面 (少し薄い木の色。|sin θ| に比例し、板の幅の 40% が上限。T2-13a・T2-13 追加修正)
    const sideW = Math.min(WING_OUT, slatW0 * WING_SIDE_MAX_RATIO) * Math.abs(Math.sin(th));
    // 板の上端・下端の y は surfaceY (中央が高い ∩。上下とも同じ向き。T2-16 その5)
    const topC = surfaceY(sx, y);
    const botC = surfaceY(sx, y + h);
    if (sideW > 1) {
      const sideX = sx + sw / 2 + sideW / 2;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(sx + sw / 2, surfaceY(sideX, y), sideW, surfaceY(sideX, y + h) - surfaceY(sideX, y));
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.wood;
    }
    // 板の面 (上端から下端まで1本。上端・下端は弧に沿う)
    ctx.fillRect(sx - sw / 2, topC, sw, botC - topC);
    // ドラムの上の縁より上へはみ出した所。外へ開く (左の板は左へ、右の板は右へ。正面の中央は真上。ドラム設定の羽と同じ考え。PU-14c)。
    // はみ出しの長さと角度は今のまま (T2-16 その3-4)
    const flare = SLAT_FLARE * Math.sin(th);
    ctx.beginPath();
    ctx.moveTo(sx - sw / 2, topC);
    ctx.lineTo(sx + sw / 2, topC);
    ctx.lineTo(sx + sw / 2 + flare, topC - SLAT_OVER);
    ctx.lineTo(sx - sw / 2 + flare, topC - SLAT_OVER);
    ctx.closePath();
    ctx.fill();
    // 板の丸い穴 (正面に近い板だけ。暗い色の小さな丸を縦に等間隔に。T2-13a)
    if (cosT > DRUM_HOLE_FACING) {
      ctx.fillStyle = COLORS.machineDark;
      for (let hy = topC + HOLE_STEP / 2; hy < surfaceY(sx, y + h) - fontPx(fit, 10); hy += HOLE_STEP) {
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
    // 縞の上の端と境目の曲線は、上の縁の楕円と同じ形 (同じ中心の横半径・縦半径) を下へずらした弧。
    // 真ん中が上がる ∩ (ドラムの周りを回る糸に見える。T2-16 前2 で二次曲線から楕円の弧に変えた)
    let k = 0;
    for (let yy = sy; yy < sy + secH; yy += STRIPE_H) {
      const sh = Math.min(STRIPE_H, sy + secH - yy);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = hexes[k % hexes.length] ?? COLORS.sumiSub;
      ctx.beginPath();
      // 上の端・下の端とも surfaceY (中央が高い ∩。T2-16 その5)
      for (let st = 0; st <= 20; st++) {
        const px = DRUM_AREA.x + (DRUM_AREA.w * st) / 20;
        const py = surfaceY(px, yy);
        if (st === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      for (let st = 20; st >= 0; st--) {
        const px = DRUM_AREA.x + (DRUM_AREA.w * st) / 20;
        ctx.lineTo(px, surfaceY(px, yy + sh));
      }
      ctx.closePath();
      ctx.fill();
      k++;
    }
    ctx.globalAlpha = 1;
    // 完了した帯に四角い枠線は引かない (帯の境目の黒い横線は要らない。T2-16 前: ドラムの絵の直し)
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
      ctx.fillRect(sx - sw / 2, surfaceY(sx, sy), sw, secH);
    }
    ctx.globalAlpha = 1;
  }

  // 下の端: 楕円の面の全体 (灰色の金属の円盤) + 放射状の腕 (drumAngle で回す)
  const rx = radius;
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
    // 帯を止める緑の竿: 上は上の縁の弧より外へ出す (PU-14 追加修正2)。
    // 上端・下端とも surfaceY (中央が高い ∩。T2-16 その5)。下の端の基準はドラムの下の端の高さのまま
    const overTop = fontPx(fit, DRUM_POLE_OVER);
    const pinTop = surfaceY(pinX, y) - overTop;
    const pinBot = surfaceY(pinX, y + h);
    ctx.fillRect(pinX - (fontPx(fit, DRUM_POLE_W) * cosPin) / 2, pinTop, Math.max(3, fontPx(fit, DRUM_POLE_W) * cosPin), pinBot - pinTop);
    for (let i = 0; i < s.sections; i++) {
      // 糸の始まりの灰色の印も surfaceY で決める (T2-16 その5)
      const py = surfaceY(pinX, drumSectionPinY(i, s.sections));
      ctx.fillStyle = COLORS.steel;
      ctx.fillRect(pinX - fontPx(fit, 2) * cosPin, py - fontPx(fit, DRUM_BRACKET_ALONG / 2), Math.max(4, fontPx(fit, DRUM_BRACKET_ACROSS) * cosPin), fontPx(fit, DRUM_BRACKET_ALONG));
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
    // 結び目も surfaceY で決める (T2-16 その5)
    const ky = cosPin > 0 ? surfaceY(pinX, drumSectionPinY(i, s.sections)) : drumSectionPinY(i, s.sections);
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

/** 張りのランプを描く (適正=緑「○」、強すぎ=橙「▲」、弱すぎ=橙「▼」、切れた=赤「✕」、巻いていない=消灯の灰色)。光っているときは外側に薄い輪。
 * 張りが強すぎを数えているあいだ (T2-22) は ▲ を点滅させる (0.25 秒ごと。猶予の残りが 1 秒を切ると 0.12 秒ごと) */
export function drawTensionLamp(ctx: CanvasRenderingContext2D, fit: StageFit, s: WindingState, timeMs = 0): void {
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
  // 張りが強すぎを数えているあいだは ▲ を点滅させる (色だけに頼らず点滅と記号で知らせる。T2-22)
  let symbolVisible = true;
  if (state === 'high' && s.overMs > 0 && s.spike.qty === 0) {
    const grace = OVER_GRACE_MS(s.level) * YARN_FEEL[s.feel].overGraceMul;
    const step = grace - s.overMs < 1000 ? OVER_BLINK_FAST_MS : OVER_BLINK_MS;
    symbolVisible = Math.floor(timeMs / step) % 2 === 0;
  }
  if (!symbolVisible) {
    return;
  }
  ctx.fillStyle = COLORS.white;
  ctx.font = `bold ${Math.round(r * 1.3)}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, x, y + r * 0.05);
}

/**
 * 本物らしいハサミを描く (T2-16 その5・写真と同じ形と向き)。縦向きで、銀色の細長い刃 2 枚が上、
 * 支点に赤い丸いねじ、下に黒い楕円の輪の持つ手 2 つが左右に並ぶ。
 * 閉じた形 (置き場所と、引っぱっているが切る所の外) では 2 枚の刃が重なって 1 本に見える。
 * cutReady (切れる所) では 2 枚の刃が X の形に開く (ねじを中心に左右へ 17.5 度ずつ)。
 * openK (0〜1) は離したあとの閉じる動きで、開いた形から閉じた形へ戻す。
 */
export function drawScissors(
  ctx: CanvasRenderingContext2D,
  fit: StageFit,
  pos: { x: number; y: number },
  cutReady: boolean,
  openK: number,
): void {
  const u = fontPx(fit, 1); // 論理 1px
  // 刃の開き角 (ラジアン)。切れる所で X に開き、閉じる動きで 0 に戻る
  const angle = (17.5 * Math.PI) / 180;
  const open = cutReady ? angle : angle * Math.max(0, Math.min(1, openK));
  // 回転は rotate を使わず座標を回して計算する (テストの偽 ctx に rotate は無い)
  const rot = (x: number, y: number, a: number): { x: number; y: number } => ({
    x: x * Math.cos(a) - y * Math.sin(a),
    y: x * Math.sin(a) + y * Math.cos(a),
  });
  ctx.save();
  ctx.translate(pos.x, pos.y);
  // 刃 2 枚 (支点から上へ。細長く先がとがる。閉じた形は重なる)
  for (const side of [-1, 1]) {
    const a = side * open;
    const p = (x: number, y: number): { x: number; y: number } => rot(x * u, y * u, a);
    const b1 = p(-3.5, 0);
    const w1 = p(-1.8, -27);
    const tip = p(0, -53);
    const w2 = p(1.8, -27);
    const b2 = p(3.5, 0);
    ctx.fillStyle = COLORS.steel;
    ctx.strokeStyle = COLORS.sumiSub;
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(b1.x, b1.y);
    ctx.lineTo(w1.x, w1.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(w2.x, w2.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // 持ち手: 支点から下へ黒い短い軸と、楕円の輪 2 つ (左右に並ぶ。開くとさらに左右へ開く)
  const ringX = (10 + 5 * (open / angle)) * u;
  for (const side of [-1, 1]) {
    ctx.strokeStyle = COLORS.sumi;
    ctx.lineWidth = 4.5 * u;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(side * ringX, 15 * u);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(side * ringX, 26 * u, 9.5 * u, 12.5 * u, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 支点の赤い丸いねじ (いちばん上に重ねる)
  ctx.beginPath();
  ctx.arc(0, 0, 4 * u, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.shu;
  ctx.fill();
  ctx.restore();
}
