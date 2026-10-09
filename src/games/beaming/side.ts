import { SIDE, SIDE_DRUM_SHRINK, SIDE_WOUND_MIN, SIDE_WOUND_MAX, SIDE_PROJECTION, SIDE_Z_REF, SIDE_TOP_FRAC, SIDE_BOTTOM_FRAC } from './params';

/**
 * 機械を真横から見た形 (PU-32)。管理者の横から見た図をもとに、奥行き z (手前が +) と高さ h (上が +) の平面に、
 * ドラム・糸の向きを変える鉄の棒 2 本・ビームを円として置き、糸の通り道 (円と接線でできたなめらかな線) を計算する。
 * 正面の絵は、この横から見た形を project の式で写して作る (描画は renderer.ts)。数値は params.ts の SIDE と SIDE_PROJECTION。
 */

export interface SidePoint {
  z: number;
  h: number;
}
interface Circle extends SidePoint {
  r: number;
}

/** 円の弧 (c の中心から、角度 from → to へ。角度は z 軸から h 軸の向きへ測る) を細かい点の列にする */
export function circleArc(c: Circle, from: number, to: number, steps: number): SidePoint[] {
  const out: SidePoint[] = [];
  const n = Math.max(1, steps);
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    out.push({ z: c.z + c.r * Math.cos(a), h: c.h + c.r * Math.sin(a) });
  }
  return out;
}

/** 巻き量 (0〜1) でのドラムの糸の半径 (枠は変わらない。巻き取られて細る) */
export function drumRadius(progress: number): number {
  return SIDE.drum.r * (1 - SIDE_DRUM_SHRINK * Math.min(1, Math.max(0, progress)));
}

/** ビームに巻いた糸の半径 (図のピクセル。円盤の半径は固定で、巻き量で SIDE_WOUND_MIN → SIDE_WOUND_MAX 倍へ太る) */
export function woundRadiusFig(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return SIDE.beam.r * (SIDE_WOUND_MIN + p * (SIDE_WOUND_MAX - SIDE_WOUND_MIN));
}

/** 2 つの円の共通接線の、法線 n の向き (角度)。外側の接線 (両方の円が同じ側) は kind='ext'、内側 (円が線の反対側) は 'int'。side=±1 で 2 本のうちの 1 本を選ぶ */
function tangentAngle(c1: Circle, c2: Circle, kind: 'ext' | 'int', side: 1 | -1): number {
  const dz = c2.z - c1.z;
  const dh = c2.h - c1.h;
  const d = Math.hypot(dz, dh);
  const base = Math.atan2(dh, dz);
  const k = kind === 'ext' ? c1.r - c2.r : c1.r + c2.r;
  return base + side * Math.acos(Math.max(-1, Math.min(1, k / d)));
}

/** 角度 a の向きの単位ベクトルにある円周上の点 */
function onCircle(c: Circle, a: number): SidePoint {
  return { z: c.z + c.r * Math.cos(a), h: c.h + c.r * Math.sin(a) };
}

/** 角度 from から to へ、短いほう (差を −π〜π に収める) を回る弧 */
function shortArc(c: Circle, from: number, to: number): SidePoint[] {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  const steps = Math.max(2, Math.ceil((Math.abs(d) * 180) / Math.PI / 3)); // 3 度ごとより細かく
  return circleArc(c, from, from + d, steps);
}

/** 向きが z>0 (手前) の接線の角度を選ぶ (2 本のうち cos が大きいほう) */
function pickFront(c1: Circle, c2: Circle, kind: 'ext' | 'int'): number {
  const a = tangentAngle(c1, c2, kind, 1);
  const b = tangentAngle(c1, c2, kind, -1);
  return Math.cos(a) > Math.cos(b) ? a : b;
}
/** 法線の h が最大 (上向き) の接線の角度を選ぶ */
function pickUp(c1: Circle, c2: Circle, kind: 'ext' | 'int'): number {
  const a = tangentAngle(c1, c2, kind, 1);
  const b = tangentAngle(c1, c2, kind, -1);
  return Math.sin(a) > Math.sin(b) ? a : b;
}
/** 法線の h が最小 (下向き) の接線の角度を選ぶ */
function pickDown(c1: Circle, c2: Circle, kind: 'ext' | 'int'): number {
  const a = tangentAngle(c1, c2, kind, 1);
  const b = tangentAngle(c1, c2, kind, -1);
  return Math.sin(a) < Math.sin(b) ? a : b;
}

/** 見える半分の角度の広さ (半円) */
export const VISIBLE_SPAN = Math.PI;

/** 正面から見る向きの、横から見た図での傾き α。円の上で法線が視線に面するのは、角度が α − π/2 〜 α + π/2 の半分 */
export function viewAlpha(): number {
  return Math.atan2(SIDE_PROJECTION.KZ, SIDE_PROJECTION.KH);
}

/**
 * 糸の通り道 (横から見た線。細かい点の列)。ドラムの下側から出て、鉄の棒 1 の上、鉄の棒 2 の上を通る。
 * dropH が無いとき (糸を付けたあと): 鉄の棒 2 の手前側から、ビームの巻いた糸の円の手前側へ接線で下り、ビームの手前の面を下の端まで回る。
 * dropH があるとき (糸を付ける前): 鉄の棒 2 の手前の面の端 (真横の点) から、真下へ dropH だけ垂れる。
 * どの点も円と接線でつながるので、向きが急に変わらない (角が無い)。
 */
export function sidePath(progress: number, dropH?: number): SidePoint[] {
  const drum: Circle = { z: SIDE.drum.z, h: SIDE.drum.h, r: drumRadius(progress) };
  const bar1: Circle = SIDE.bar1;
  const bar2: Circle = SIDE.bar2;
  const beam: Circle = { z: SIDE.beam.z, h: SIDE.beam.h, r: woundRadiusFig(progress) };

  // 1. ドラム → 鉄の棒 1: 内側の接線。ドラムの下側から出て、棒の上側 (糸が棒の上に乗る側) に接する
  const nA = pickDown(drum, bar1, 'int');
  const aDrum = onCircle(drum, nA);
  const aBar1Angle = nA + Math.PI; // 棒 1 の接点は、反対の向き
  // 2. 鉄の棒 1 → 鉄の棒 2: 両方の上側に接する外側の接線
  const nB = pickUp(bar1, bar2, 'ext');
  // 3. 鉄の棒 2 → ビーム: 手前側に接する外側の接線
  const nC = pickFront(bar2, beam, 'ext');

  const out: SidePoint[] = [aDrum];
  out.push(...shortArc(bar1, aBar1Angle, nB)); // 棒 1 の上の弧 (接点 → 次の接線の接点)
  out.push(...shortArc(bar2, nB, dropH !== undefined ? 0 : nC)); // 棒 2 の上から手前の面へ
  if (dropH !== undefined) {
    const last = out[out.length - 1]!;
    out.push({ z: last.z, h: SIDE.bar2.h - dropH });
    return out;
  }
  // ビームの巻いた糸の手前の面を、下の端 (視線に面した半分の下の端) まで回る
  const bottom = viewAlpha() - Math.PI / 2;
  out.push(...shortArc(beam, nC, bottom));
  return out;
}

/** 写した位置の大きさの割合 (盤面の高さ H に比例) と、縦の基準 Y0 */
export function sideScale(H: number): { S: number; Y0: number } {
  const { KH, KZ } = SIDE_PROJECTION;
  const k = Math.hypot(KH, KZ);
  const q = (c: { z: number; h: number }): number => KH * -c.h + KZ * c.z; // 図の y に当たる量
  const top = q(SIDE.drum) - SIDE.drum.r * k; // ドラムの上の端
  const bottom = q(SIDE.beam) + SIDE.beam.r * k; // ビームの円盤の下の端
  const S = ((SIDE_BOTTOM_FRAC - SIDE_TOP_FRAC) * H) / (bottom - top);
  return { S, Y0: SIDE_TOP_FRAC * H - S * top };
}

/** 横から見た点 (z, h) を、正面の絵へ。dx は幅の位置の x に足すずれ (手前ほど左 = 小さい)、y は画面の y (論理座標) */
export function project(z: number, h: number, H: number): { dx: number; y: number } {
  const { S, Y0 } = sideScale(H);
  return { dx: SIDE_PROJECTION.KX * (SIDE_Z_REF - z), y: Y0 + S * (SIDE_PROJECTION.KH * -h + SIDE_PROJECTION.KZ * z) };
}
