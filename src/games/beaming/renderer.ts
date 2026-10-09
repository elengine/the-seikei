import type { Content } from '../../core/content/content';
import { COLORS } from '../../core/ui/tokens';
import type { StageFit } from '../../core/viewport/viewport';
import {
  BOARD, BEAM_CENTER_X, DRUM_AXIS_X0, DRUM_W, ROD_X0, ROD_X1, IRON_X0, IRON_X1, sheetDropEndY, dropHFor, lampR, threadBarRange, cmToX, pxPerCm,
  speedBarCenterX, SPEED_BAR_W, lampX, lampY,
} from './geometry';
import { SIDE } from './params';
import { sidePath, project, viewAlpha, drumRadius, drumCoreRadius, woundRadiusFig } from './side';
import type { SidePoint } from './side';
import { okRangeOf } from './logic';
import { DRUM_SURFACE_SIGN, BEAM_SURFACE_SIGN, PATTERN_REPEATS, SIDE_DROP0, DRUM_WING_LEN, DRUM_WING_FLARE, DRUM_WING_IN, DRUM_WING_HALF, BEAM_DISC_RX, BEAM_BRASS_R, BEAM_BRASS_LEN, BEAM_AXLE_R, FRAME_ARM_W } from './params';
import { expandPlan, toRuns } from '../../core/domain/stripe';
import { FONT_FAMILY } from '../../core/ui/tokens';
import type { BeamingState } from './logic';

/**
 * ビーム巻きの盤面の描画 (P3 T3-02。PU-15a で実物の写真に寄せた斜めの構図に)。
 * 奥にドラム (横に寝た円筒。糸の筋は縦、両端は楕円)、糸のシート (柄の色の縦の筋) が手前へ降りて、
 * 茶色のガイドの棒をくぐり、手前のビーム (銀色の軸が円盤の外へ飛び出す・穴が同心円に並ぶ円盤・軸のまわりに上下に太る巻き) に巻かれる。
 * ドラム巻きと同じ決まり:論理座標で描く部分は ctx の変換で画面に合わせ、文字は変換を戻したあとに toPx で描く (大きさは画面 px・20px 以上)。
 * 色は COLORS と糸の色 (hex) だけ。明るさは globalAlpha で変える。
 */

/** 柄でいちばん多く使う糸の色 (シートと巻き太りの色) */
export function mainHex(content: Content, patternId: string): string {
  const pattern = content.patterns.get(patternId);
  if (!pattern || pattern.plan.length === 0) return COLORS.sumiSub;
  let best = pattern.plan[0]!;
  for (const e of pattern.plan) {
    if (e.count > best.count) best = e;
  }
  const yarn = content.yarns.get(best.yarn);
  const color = yarn !== undefined ? content.colors.get(yarn.color) : undefined;
  return color?.hex ?? COLORS.sumiSub;
}

/** 柄の 1 リピートの色の並び (左から右) と、それぞれの割合 (合計 1)。糸の列にして同じ糸が続く所をまとめる (stripe.ts) */
export function stripeRunsOf(content: Content, patternId: string): Array<{ hex: string; frac: number }> {
  const pattern = content.patterns.get(patternId);
  const total = pattern ? pattern.plan.reduce((n, e) => n + e.count, 0) : 0;
  if (!pattern || total === 0) return [{ hex: mainHex(content, patternId), frac: 1 }];
  const runs = toRuns(expandPlan(pattern.plan, total));
  return runs.map((r) => {
    const yarn = content.yarns.get(r.yarn);
    const color = yarn !== undefined ? content.colors.get(yarn.color) : undefined;
    return { hex: color?.hex ?? COLORS.sumiSub, frac: r.count / total };
  });
}

/** 縦縞の 1 本ごとの x の範囲と色: x0〜x1 を repeats 回の柄のくり返しで割る */
export function stripeStrips(runs: Array<{ hex: string; frac: number }>, repeats: number, x0: number, x1: number): Array<{ x0: number; x1: number; hex: string }> {
  const out: Array<{ x0: number; x1: number; hex: string }> = [];
  const unit = (x1 - x0) / Math.max(1, repeats);
  for (let r = 0; r < Math.max(1, repeats); r++) {
    let x = x0 + r * unit;
    for (const run of runs) {
      const nx = x + run.frac * unit;
      out.push({ x0: x, x1: nx, hex: run.hex });
      x = nx;
    }
  }
  if (out.length > 0) out[out.length - 1]!.x1 = x1; // 丸め誤差を端でそろえる
  // 同じ色が隣り合う所 (無地・くり返しのつなぎ目) は 1 本にまとめる。継ぎ目が輪切りの線に見えないように (PU-32)
  const merged: Array<{ x0: number; x1: number; hex: string }> = [];
  for (const st of out) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.hex === st.hex) last.x1 = st.x1;
    else merged.push({ ...st });
  }
  return merged;
}

/** 同じ番号なら同じ値 (0〜1)。巻いた糸の細い筋のむらを、毎回同じ形にするための疑似乱数 */
function noise(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 円 (横から見た図の z・h・r) */
interface Circ {
  z: number;
  h: number;
  r: number;
}
const ALPHA = viewAlpha();

/** 幅の位置の x (ビームの奥行きでの x) と、横から見た点 (z, h) を、盤面の論理座標の点に写す (PU-32) */
function pt(X: number, z: number, h: number): { x: number; y: number } {
  const q = project(z, h, BOARD.H);
  return { x: X + q.dx, y: q.y };
}

/** 円 c の、軸の位置 X での円周の弧 (角度 from → to) を、写した点の列にする */
function arcScreen(X: number, c: Circ, from: number, to: number, n: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    out.push(pt(X, c.z + c.r * Math.cos(a), c.h + c.r * Math.sin(a)));
  }
  return out;
}

/** 視線に面した半分 (見える側面) の弧。両端が画面の縦の端 (輪郭)。左の端では「(」の形になる */
function visArc(X: number, c: Circ, n = 24): Array<{ x: number; y: number }> {
  return arcScreen(X, c, ALPHA - Math.PI / 2, ALPHA + Math.PI / 2, n);
}

/** 円筒の側面の帯 (軸の位置 Xa から Xb まで。円 c の見える側面) のパス */
function bandPath(ctx: CanvasRenderingContext2D, Xa: number, Xb: number, c: Circ): void {
  const a = visArc(Xa, c);
  const b = visArc(Xb, c);
  ctx.beginPath();
  ctx.moveTo(a[0]!.x, a[0]!.y);
  for (const q of a) ctx.lineTo(q.x, q.y);
  for (let i = b.length - 1; i >= 0; i--) ctx.lineTo(b[i]!.x, b[i]!.y);
  ctx.closePath();
}

/** 円筒の側面の帯のうち、円の角度 from → to の部分だけ (軸の位置 Xa から Xb まで) のパス */
function bandPathRange(ctx: CanvasRenderingContext2D, Xa: number, Xb: number, c: Circ, from: number, to: number): void {
  const a = arcScreen(Xa, c, from, to, 16);
  const b = arcScreen(Xb, c, from, to, 16);
  ctx.beginPath();
  ctx.moveTo(a[0]!.x, a[0]!.y);
  for (const q of a) ctx.lineTo(q.x, q.y);
  for (let i = b.length - 1; i >= 0; i--) ctx.lineTo(b[i]!.x, b[i]!.y);
  ctx.closePath();
}

/** 円筒の端の面 (円全体を写した楕円) のパス */
function facePath(ctx: CanvasRenderingContext2D, X: number, c: Circ): void {
  const e = arcScreen(X, c, 0, Math.PI * 2, 36);
  ctx.beginPath();
  ctx.moveTo(e[0]!.x, e[0]!.y);
  for (const q of e) ctx.lineTo(q.x, q.y);
  ctx.closePath();
}

/** 糸の通り道の部分 (sub) を、柄の縞ごとの帯にして塗る。縞の x は、幅の位置 (cx ± 巻き幅の半分) を柄でくり返し割ったもの (PU-32) */
function drawRibbon(ctx: CanvasRenderingContext2D, sub: SidePoint[], s: BeamingState, runs: Array<{ hex: string; frac: number }>, repeats: number): void {
  if (sub.length < 2) return;
  const half = (s.widthCm * pxPerCm(s.widthCm)) / 2;
  for (const st of stripeStrips(runs, repeats, BEAM_CENTER_X - half, BEAM_CENTER_X + half)) {
    ctx.fillStyle = st.hex;
    ctx.beginPath();
    const first = pt(st.x0, sub[0]!.z, sub[0]!.h);
    ctx.moveTo(first.x, first.y);
    for (const q of sub) {
      const a = pt(st.x0, q.z, q.h);
      ctx.lineTo(a.x, a.y);
    }
    for (let i = sub.length - 1; i >= 0; i--) {
      const b = pt(st.x1, sub[i]!.z, sub[i]!.h);
      ctx.lineTo(b.x, b.y);
    }
    ctx.closePath();
    ctx.fill();
  }
  // 糸の筋 (流れる向きの細い線。柄の縞とは別の質感。写真のように細く、長さと濃さにむらがある)
  ctx.strokeStyle = COLORS.sumi;
  ctx.lineWidth = 1.5;
  const n = 90;
  for (let i = 0; i < n; i++) {
    const X = BEAM_CENTER_X + (noise(i) - 0.5) * 2 * half;
    const a0 = Math.floor(noise(i + 500) * sub.length * 0.4);
    const a1 = Math.min(sub.length - 1, sub.length - 1 - Math.floor(noise(i + 900) * sub.length * 0.3));
    if (a1 - a0 < 1) continue;
    ctx.globalAlpha = 0.05 + 0.12 * noise(i + 1300);
    ctx.beginPath();
    for (let j = a0; j <= a1; j++) {
      const a = pt(X, sub[j]!.z, sub[j]!.h);
      if (j === a0) ctx.moveTo(a.x, a.y);
      else ctx.lineTo(a.x, a.y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** 糸の通り道の中で、円 c の上の最初の点の番号 (見つからなければ -1) */
function firstOn(path: SidePoint[], c: Circ): number {
  return path.findIndex((q) => Math.abs(Math.hypot(q.z - c.z, q.h - c.h) - c.r) < 1e-6);
}

/**
 * 盤面を描く (PU-32: 横から見た形 (side.ts) を写して、奥のものから順に描く)。
 * ドラム → ビームの奥 (軸と左の円盤) → ドラムの下から出る糸 → 鉄の棒 1 → 糸 → 鉄の棒 2 → ビームの手前 (巻いた糸・右の円盤) → 糸の最後 → 木の棒 (速さ)。
 * drumAngle・beamAngle は巻いているあいだの回り (controller が渡す)。
 */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  fit: StageFit,
  s: BeamingState,
  content: Content,
  drumAngle: number,
  /** 糸の束の先の木の棒の位置 (attach の段階で引っぱっている間と、戻る間。y だけが使われる。無ければ垂れた位置。T3-06・PU-27) */
  threadDrag?: { x: number; y: number } | null,
  /** ビームが回って見える角度 (controller が時間で進める。PU-26) */
  beamAngle = 0,
  /** 速さの木の棒の見せ方 (active = 棒を引っぱっている。PU-28) */
  lever: { active: boolean } = { active: false },
  /** 柄のくり返しの数 (帯の数。縞の幅の割り方。PU-28) */
  repeats = PATTERN_REPEATS,
): void {
  const runs = stripeRunsOf(content, s.patternId);

  ctx.fillStyle = COLORS.kinari;
  ctx.fillRect(0, 0, ctx.canvas.clientWidth || ctx.canvas.width, ctx.canvas.clientHeight || ctx.canvas.height);

  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);

  // 糸の通り道 (横から見た線)。糸を付ける前は、鉄の棒 2 から真下へ垂れる (棒を引っぱっている間は、その分だけ長く)
  const loose = s.phase === 'setup' || s.phase === 'attach';
  const dropH = loose ? (s.phase === 'attach' && threadDrag ? dropHFor(threadDrag.y) : SIDE_DROP0) : undefined;
  const path = sidePath(s.progress, dropH);
  const i1 = firstOn(path, SIDE.bar1);
  const i2 = firstOn(path, SIDE.bar2);

  drawDrum(ctx, runs, repeats, drumAngle, s);
  drawBeamBack(ctx, s, beamAngle);
  drawFrameArms(ctx);
  drawRibbon(ctx, path.slice(0, i1 + 1), s, runs, repeats); // ドラムの下から鉄の棒 1 まで
  drawIronBar(ctx, SIDE.bar1);
  drawRibbon(ctx, path.slice(i1, i2 + 1), s, runs, repeats); // 鉄の棒 1 の上から鉄の棒 2 まで
  drawIronBar(ctx, SIDE.bar2);
  // 鉄の棒 2 の上から、ビームに触れる点まで (平らな帯。糸を付ける前は垂れた端まで)。ビームに触れたあとは、陰影のついた円筒の面につながる
  const i3 = firstOn(path, { z: SIDE.beam.z, h: SIDE.beam.h, r: woundRadiusFig(s.progress) });
  drawRibbon(ctx, i3 >= 0 ? path.slice(i2, i3 + 1) : path.slice(i2), s, runs, repeats);
  const contact = i3 >= 0 ? Math.atan2(path[i3]!.h - SIDE.beam.h, path[i3]!.z - SIDE.beam.z) : null;
  drawBeamFront(ctx, s, runs, repeats, beamAngle, contact); // 巻いた糸の円筒 (帯が乗る所から下) と右の円盤: 帯より手前

  // 速さの木の棒 (横に渡した赤茶の角材)
  drawLever(ctx, fit, s, lever);

  // 幅合わせの段階: 目標の巻き幅の点線と目盛り (cm)、円盤の内側の印
  if (s.phase === 'setup') {
    drawTarget(ctx, s);
  }

  // 糸の束の先の木の棒 (糸を付けるまで。巻き始めたらビームに巻き込まれて見えない。PU-27)
  if (loose) {
    drawThreadBar(ctx, fit, s, s.phase === 'attach' && threadDrag ? threadDrag.y : sheetDropEndY(s.progress));
  }

  // 速さのランプ (ドラムの上。ドラム巻きと同じ見た目。判定は速さそのもの。T3-07)
  drawTensionLamp(ctx, fit, s);

  ctx.restore();
  // 文字は盤面には描かない (巻き量・速さは操作欄。乗り上げの表示は T3-05 で偏りが無くなったので無い。PU-24a)
}

/** ドラムの桟の数 (円筒の周りに等間隔に並ぶ。ドラム巻きと同じ考え) */
const DRUM_SLATS = 16;
/** 端の円盤の放射状の腕の数 */
const DRUM_ARMS = 6;

/**
 * 奥のドラム (PU-26 → PU-32)。ドラム巻きのドラムと同じ見た目 (胴は機械の緑の勾配、木の桟、灰色の金属の端の円盤に放射状の腕)。
 * 横から見た円 (半径 180) を写した円筒: 左の端は見える側面の弧 (「(」の形)、右の端だけ円の面 (楕円) が見える。
 * 糸の巻かれた面は、胴の中ほど (糸のシートの幅) の、巻き取られて細る円筒。手前の面は下から上へ回る (DRUM_SURFACE_SIGN)。
 */
export function drawDrum(ctx: CanvasRenderingContext2D, runs: Array<{ hex: string; frac: number }>, repeats: number, drumAngle: number, s: BeamingState): void {
  const frame: Circ = { z: SIDE.drum.z, h: SIDE.drum.h, r: drumCoreRadius() }; // 胴は糸の巻き芯の半径 (糸の上に胴が見えない)
  const yarn: Circ = { z: SIDE.drum.z, h: SIDE.drum.h, r: drumRadius(s.progress) };
  const xl = DRUM_AXIS_X0;
  const xr = DRUM_AXIS_X0 + DRUM_W;
  const half = (s.widthCm * pxPerCm(s.widthCm)) / 2;
  const w0 = BEAM_CENTER_X - half;
  const w1 = BEAM_CENTER_X + half;
  // 糸の束の断面 (管理者の図): 上の輪郭は軸と平行 (半径 yarn.r のまま)。左の端は帯の幅の左の端、右は斜めに細くなって胴へ下りる (taper)
  const rise = Math.max(0, yarn.r - frame.r);
  const taper = Math.min((w1 - w0) * 0.4, rise * 1.2);
  const yx0 = w0;
  const yx1 = w1 - taper;
  // 胴 (機械の緑。上下を暗く、上寄りを明るく)
  const edge = visArc(xl, frame).map((q) => q.y);
  const grad = ctx.createLinearGradient(0, Math.min(...edge), 0, Math.max(...edge));
  grad.addColorStop(0, COLORS.machineDark);
  grad.addColorStop(0.3, COLORS.machineLight);
  grad.addColorStop(0.7, COLORS.machine);
  grad.addColorStop(1, COLORS.machineDark);
  ctx.fillStyle = grad;
  bandPath(ctx, xl, xr, frame);
  ctx.fill();
  // 木の桟 (軸に沿った線。円筒の周りに等間隔。見える側面だけ。巻いた糸の幅の外にだけ描く。drumAngle が増えると上へ流れる)
  ctx.strokeStyle = COLORS.woodLight;
  ctx.globalAlpha = 0.8;
  for (let k = 0; k < DRUM_SLATS; k++) {
    const phi = ALPHA - DRUM_SURFACE_SIGN * (drumAngle + (Math.PI * 2 * k) / DRUM_SLATS);
    const c = Math.cos(phi - ALPHA);
    if (c <= 0) continue; // 裏側
    ctx.lineWidth = Math.max(1.5, 5 * c);
    for (const [xa, xb] of [[xl, w0], [w1, xr]] as const) {
      if (xb - xa < 1) continue;
      const a = pt(xa, frame.z + frame.r * Math.cos(phi), frame.h + frame.r * Math.sin(phi));
      const b = pt(xb, frame.z + frame.r * Math.cos(phi), frame.h + frame.r * Math.sin(phi));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // ドラムの羽 (PU-32 追加修正 4): 糸の束より先に描く。根元は帯の左の端の下 (DRUM_WING_IN だけ中) に隠れ、帯の左の端から外へ短く (DRUM_WING_LEN)、小さな角度で出る。
  // 板は桟と同じ数 (見える側面だけ)
  ctx.fillStyle = COLORS.wood;
  const r2 = yarn.r * (1 + DRUM_WING_FLARE);
  for (let k = 0; k < DRUM_SLATS; k++) {
    const phi = ALPHA - DRUM_SURFACE_SIGN * (drumAngle + (Math.PI * 2 * k) / DRUM_SLATS);
    if (Math.cos(phi - ALPHA) <= 0) continue;
    const q = [
      pt(w0 + DRUM_WING_IN, frame.z + frame.r * Math.cos(phi - DRUM_WING_HALF), frame.h + frame.r * Math.sin(phi - DRUM_WING_HALF)),
      pt(w0 + DRUM_WING_IN, frame.z + frame.r * Math.cos(phi + DRUM_WING_HALF), frame.h + frame.r * Math.sin(phi + DRUM_WING_HALF)),
      pt(w0 - DRUM_WING_LEN, yarn.z + r2 * Math.cos(phi + DRUM_WING_HALF), yarn.h + r2 * Math.sin(phi + DRUM_WING_HALF)),
      pt(w0 - DRUM_WING_LEN, yarn.z + r2 * Math.cos(phi - DRUM_WING_HALF), yarn.h + r2 * Math.sin(phi - DRUM_WING_HALF)),
    ];
    ctx.beginPath();
    ctx.moveTo(q[0]!.x, q[0]!.y);
    for (const p of q) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill();
  }
  // 柄の縞: 円周の向き (画面では丸みに沿った縦の縞) に色が並ぶ
  const strips = stripeStrips(runs, repeats, w0, w1);
  strips.forEach((st, i) => {
    ctx.fillStyle = st.hex;
    bandPath(ctx, i === 0 ? yx0 : st.x0, i === strips.length - 1 ? yx1 : st.x1, yarn);
    ctx.fill();
  });
  // 丸み: 巻いた糸の面の上のほうを明るく、下のほうを暗くする (手前へ丸く盛り上がって見える。写真のドラムの上の半分)
  const yEdge = visArc(w0, yarn).map((q) => q.y);
  const shade = ctx.createLinearGradient(0, Math.min(...yEdge), 0, Math.max(...yEdge));
  shade.addColorStop(0, COLORS.white);
  shade.addColorStop(1, COLORS.sumi);
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = shade;
  bandPath(ctx, yx0, yx1, yarn);
  ctx.fill();
  // 糸の筋 (円周の向きの細い線。写真のように細く、長さと濃さにむらがある。規則正しい輪にしない)
  ctx.strokeStyle = COLORS.sumi;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 150; i++) {
    const xs = w0 + noise(i) * (w1 - w0);
    const a0 = ALPHA - Math.PI / 2 + noise(i + 400) * Math.PI * 0.6;
    const a1 = Math.min(ALPHA + Math.PI / 2, a0 + Math.PI * (0.25 + 0.5 * noise(i + 800)));
    ctx.globalAlpha = 0.05 + 0.12 * noise(i + 1200);
    const e = arcScreen(xs, yarn, a0, a1, 8);
    ctx.beginPath();
    e.forEach((q, j) => (j === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // 糸の右の端: 斜めに細くなって胴へ下りる (円すいの側面。最後の帯の色)。端の面は胴の半径
  const ra = arcScreen(yx1, yarn, ALPHA - Math.PI / 2, ALPHA + Math.PI / 2, 24);
  const rb = arcScreen(w1, frame, ALPHA - Math.PI / 2, ALPHA + Math.PI / 2, 24);
  ctx.fillStyle = runs[runs.length - 1]!.hex;
  ctx.beginPath();
  ctx.moveTo(ra[0]!.x, ra[0]!.y);
  for (const q of ra) ctx.lineTo(q.x, q.y);
  for (let i = rb.length - 1; i >= 0; i--) ctx.lineTo(rb[i]!.x, rb[i]!.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.sumi;
  ctx.globalAlpha = 0.2;
  ctx.fill();
  ctx.globalAlpha = 1;
  // 右の端の面 (灰色の金属。円全体を写した楕円) と、回る放射状の腕
  ctx.fillStyle = COLORS.steel;
  facePath(ctx, xr, frame);
  ctx.fill();
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 2;
  ctx.stroke();
  const c0 = pt(xr, frame.z, frame.h);
  for (let a = 0; a < DRUM_ARMS; a++) {
    const ang = -DRUM_SURFACE_SIGN * drumAngle + (Math.PI * 2 * a) / DRUM_ARMS; // 胴と同じ向き
    const tip = pt(xr, frame.z + 0.85 * frame.r * Math.cos(ang), frame.h + 0.85 * frame.r * Math.sin(ang));
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
  }
}

/** 機械の枠 (クリーム色の腕の形の金具): 鉄の棒 2 本の左右の端を支える板 (PU-32)。棒より奥に描く */
function drawFrameArms(ctx: CanvasRenderingContext2D): void {
  const top = project(SIDE.bar1.z, SIDE.bar1.h + SIDE.bar1.r + 22, BOARD.H);
  const bot = project(SIDE.bar2.z, SIDE.bar2.h - SIDE.bar2.r - 40, BOARD.H);
  for (const X of [IRON_X0 - FRAME_ARM_W, IRON_X1]) {
    const x = X + (top.dx + bot.dx) / 2;
    ctx.fillStyle = COLORS.kinariDeep;
    ctx.fillRect(x, top.y, FRAME_ARM_W, bot.y - top.y);
    ctx.strokeStyle = COLORS.sumiSub;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, top.y, FRAME_ARM_W, bot.y - top.y);
  }
}

/** 糸の向きを変える鉄の棒 (横から見た円 c を写した、機械の幅いっぱいの円筒。上側のつや。PU-32) */
function drawIronBar(ctx: CanvasRenderingContext2D, c: Circ): void {
  ctx.fillStyle = COLORS.steel;
  bandPath(ctx, IRON_X0, IRON_X1, c);
  ctx.fill();
  // 光の筋 (つや。上側に太い 1 本と、細い 1 本)
  ctx.strokeStyle = COLORS.white;
  for (const [da, alpha, w] of [[0.15, 0.55, 3], [-0.55, 0.3, 2]] as const) {
    const a = arcScreen(IRON_X0, c, ALPHA + da, ALPHA + da, 1)[0]!;
    const b = arcScreen(IRON_X1, c, ALPHA + da, ALPHA + da, 1)[0]!;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.steel;
  facePath(ctx, IRON_X1, c);
  ctx.fill();
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** 糸の束の先の木の棒 (水平。束の幅より左右に長く、端は丸い。太さは画面上 12px 以上。PU-27)。x は鉄の棒 2 の奥行きのずれぶん (当たり判定と同じ式。PU-32) */
function drawThreadBar(ctx: CanvasRenderingContext2D, fit: StageFit, s: BeamingState, y: number): void {
  const r = threadBarRange(s.widthCm);
  const h = Math.max(14, 12 / fit.scale);
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(r.x0, y - h / 2, r.x1 - r.x0, h);
  ctx.beginPath();
  ctx.arc(r.x0, y, h / 2, 0, Math.PI * 2);
  ctx.arc(r.x1, y, h / 2, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 速さの木の棒 (PU-28。実物の写真から: 機械の幅に横に渡した、断面が四角の赤茶の角材。両端は金属の金具で留める)。
 * 少し上から見た形で、上の面 (明るい赤茶) と手前の面 (濃い赤茶) の 2 面、境目につやの細い線、手前の面の下に影、棒に沿った木目の線。
 * 厚み (2 面の合計) は画面上 28px 以上。棒全体が速さに合わせて左右に動く (右へ動かすほど速い。左端が止まる位置)。
 * 動ける範囲の左右の端の下に、小さな金属の止め金具。引っぱっている間は縁を藍で細く囲む。
 * 幅合わせ・糸を付ける段階は左端 (止) に少し暗く描く (押せない形)。
 */
function drawLever(ctx: CanvasRenderingContext2D, fit: StageFit, s: BeamingState, lever: { active: boolean }): void {
  const live = s.phase === 'beaming';
  const hx = speedBarCenterX(live ? s.speed : 0);
  const topH = Math.max(6, 6 / fit.scale); // 管理者の指示で今までの半分の細さ (PU-32 追加修正)。押さえる所 (hitSpeedBar) は上下 64px 以上のまま
  const frontH = Math.max(9, 9 / fit.scale);
  const x0 = hx - SPEED_BAR_W / 2;
  const y0 = BOARD.guideY - (topH + frontH) / 2; // 上の面の上端 (2 面の真ん中がガイドの高さ)
  const yf = y0 + topH; // 手前の面の上端
  ctx.save();
  if (!live) {
    ctx.globalAlpha = 0.6;
  }
  // 動ける範囲の端の止め金具 (棒の下の左右。字は無し)
  ctx.fillStyle = COLORS.steel;
  const stopW = 22;
  const stopH = Math.max(14, 14 / fit.scale);
  const leftStop = speedBarCenterX(0) - SPEED_BAR_W / 2;
  const rightStop = speedBarCenterX(100) + SPEED_BAR_W / 2;
  ctx.fillRect(leftStop, yf + frontH + 4, stopW, stopH);
  ctx.fillRect(rightStop - stopW, yf + frontH + 4, stopW, stopH);
  // 影 (手前の面の下)
  ctx.fillStyle = COLORS.sumi;
  ctx.globalAlpha = live ? 0.25 : 0.15;
  ctx.fillRect(x0 + 4, yf + frontH, SPEED_BAR_W - 8, 6);
  ctx.globalAlpha = live ? 1 : 0.6;
  // 手前の面と上の面
  ctx.fillStyle = COLORS.beamBar;
  ctx.fillRect(x0, yf, SPEED_BAR_W, frontH);
  ctx.fillStyle = COLORS.beamBarTop;
  ctx.fillRect(x0, y0, SPEED_BAR_W, topH);
  // 境目のつや (細い明るい線)
  ctx.fillStyle = COLORS.beamBarGloss;
  ctx.fillRect(x0, yf - 1.5, SPEED_BAR_W, 3);
  // 木目 (棒に沿った細い線。目立ちすぎない)
  ctx.strokeStyle = COLORS.sumi;
  ctx.globalAlpha = live ? 0.18 : 0.1;
  ctx.lineWidth = 2;
  for (const f of [0.25, 0.5, 0.75]) {
    const gy = yf + frontH * f;
    ctx.beginPath();
    ctx.moveTo(x0 + 30, gy);
    ctx.lineTo(x0 + SPEED_BAR_W - 30, gy);
    ctx.stroke();
  }
  ctx.globalAlpha = live ? 1 : 0.6;
  // 両端の金具 (灰色の金属の小さな四角とねじ 1 つ)
  const capW = 26;
  const capH = topH + frontH + 8;
  for (const cx0 of [x0 - 4, x0 + SPEED_BAR_W - capW + 4]) {
    ctx.fillStyle = COLORS.steel;
    ctx.fillRect(cx0, y0 - 4, capW, capH);
    ctx.fillStyle = COLORS.sumiSub;
    ctx.beginPath();
    ctx.arc(cx0 + capW / 2, y0 - 4 + capH / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // 引っぱっている間は縁を藍で細く
  if (lever.active && live) {
    ctx.strokeStyle = COLORS.ai;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 - 4, y0 - 4, SPEED_BAR_W + 8, topH + frontH + 8);
  }
  ctx.restore();
}

/** 巻いた糸の光の帯の数 (円筒の周りに等間隔) */
const BEAM_STREAKS = 4;

/** 円盤の厚み (px。軸の方向の長さ。左の端が少し見える) */
const FLANGE_THICK = 16;

/** 円盤の穴の輪 (円盤の半径に対する割合と、輪ごとの穴の数)。写真のとおり 2 重 */
const HOLE_RINGS: Array<{ frac: number; count: number }> = [
  { frac: 0.55, count: 9 },
  { frac: 0.82, count: 16 },
];

/** 軸の両端の黒いつまみ: 横の半径・縦の半径・円筒の長さ (論理の px)。軸が円盤の面から右へ出る長さ */
const KNOB_RX = 5;
const KNOB_RY = 16;
const KNOB_LEN = 8;
const AXLE_OUT = 50;

/** 軸 (芯) の横から見た半径 (図のピクセル。写真のように太い) */
const AXLE_R = BEAM_AXLE_R;

/** ビームの円盤の楕円 (上下左右に対称。中心は軸の位置 X、縦の半径は横から見た円を写した大きさ、横の半径は BEAM_DISC_RX)。frac は半径に対する割合 */
function discEllipse(X: number, frac: number): { cx: number; cy: number; rx: number; ry: number } {
  const c = pt(X, SIDE.beam.z, SIDE.beam.h);
  return { cx: c.x, cy: c.y, rx: BEAM_DISC_RX * frac, ry: BOARD.flangeR * frac };
}

function ellipsePath(ctx: CanvasRenderingContext2D, e: { cx: number; cy: number; rx: number; ry: number }, from = 0, to = Math.PI * 2, n = 36, move = true): void {
  for (let i = 0; i <= n; i++) {
    const t = from + ((to - from) * i) / n;
    const x = e.cx + e.rx * Math.cos(t);
    const y = e.cy + e.ry * Math.sin(t);
    if (i === 0 && move) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

/** 円盤 1 枚 (PU-32 追加修正 4): 上下左右に対称な楕円の面を右へ向け、厚みは楕円を左へずらして重ねた形 (左半分の輪郭 + 上下の直線 + 右半分の輪郭)。穴は同じ楕円の上に 2 重の輪で並ぶ。軸が中心を貫く。X は円盤の面の x */
function drawFlange(ctx: CanvasRenderingContext2D, X: number, beamAngle: number): void {
  const face = discEllipse(X, 1);
  const back = discEllipse(X - FLANGE_THICK, 1);
  ctx.fillStyle = COLORS.sumiSub;
  ctx.beginPath();
  ellipsePath(ctx, back, Math.PI / 2, (Math.PI * 3) / 2, 24);
  ellipsePath(ctx, face, -Math.PI / 2, Math.PI / 2, 24, false);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.flange;
  ctx.beginPath();
  ellipsePath(ctx, face);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.flangeHole;
  for (const ring of HOLE_RINGS) {
    for (let i = 0; i < ring.count; i++) {
      // 手前 (φ = 0) は、画面で左下 (奥行きが増えると x が小さくなる向き) に当たる
      const phi = (Math.PI * 2 * i) / ring.count - BEAM_SURFACE_SIGN * beamAngle; // 胴と同じ向き
      ctx.beginPath();
      ctx.arc(face.cx - ring.frac * face.rx * Math.cos(phi), face.cy - ring.frac * face.ry * Math.sin(phi), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ellipsePath(ctx, face);
  ctx.closePath();
  ctx.stroke();
}

/** 軸方向の円筒 (ビームの軸・円盤の外の筒): X0〜X1、半径は円盤の半径の frac 倍。上下左右に対称な形 (円盤の楕円と同じ中心)。cap のとき右の端に面の楕円を描く */
function tube(ctx: CanvasRenderingContext2D, X0: number, X1: number, frac: number, color: string, cap: boolean): void {
  const e0 = discEllipse(X0, frac);
  const e1 = discEllipse(X1, frac);
  ctx.fillStyle = color;
  ctx.fillRect(e0.cx, e0.cy - e0.ry, e1.cx - e0.cx, 2 * e0.ry);
  if (cap) {
    ctx.beginPath();
    ellipsePath(ctx, e1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLORS.sumiSub;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  if (!cap) return;
  // 上のつや (細い明るい線。筒の外の真ちゅうだけ。軸の全長には引かない)
  ctx.strokeStyle = COLORS.white;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(e0.cx, e0.cy - e0.ry * 0.55);
  ctx.lineTo(e1.cx, e1.cy - e1.ry * 0.55);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** 円盤の外の太い金属の筒 (真ちゅう色。写真の円盤の外の筒)。X0〜X1 の円筒 */
function drawBrass(ctx: CanvasRenderingContext2D, X0: number, X1: number): void {
  tube(ctx, X0, X1, BEAM_BRASS_R / SIDE.beam.r, COLORS.gold, true);
}

/** ビームの奥の部分: 軸の全体と左の円盤、円盤のあいだの軸。糸より奥に描く (PU-30 4) */
function drawBeamBack(ctx: CanvasRenderingContext2D, s: BeamingState, beamAngle: number): void {
  const leftX = cmToX(s.widthCm, s.leftCm);
  tube(ctx, ROD_X0, ROD_X1, AXLE_R / SIDE.beam.r, COLORS.steel, false);
  // 左端のつまみ: 左を向いた端の面は見えない。左の端は「(」の輪郭だけ (面の楕円は描かない)
  const k0 = discEllipse(ROD_X0, 1);
  const knob = { cx: k0.cx, cy: k0.cy, rx: KNOB_RX, ry: KNOB_RY };
  ctx.fillStyle = COLORS.sumi;
  ctx.beginPath();
  ellipsePath(ctx, knob, Math.PI / 2, (Math.PI * 3) / 2, 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(knob.cx, knob.cy - KNOB_RY, KNOB_LEN, 2 * KNOB_RY);
  // 前後の重なりは右にあるものほど手前: 左の真ちゅうの筒 → 左の円盤 → 軸 (円盤の右を向いた面の中心から右へ出る)
  drawBrass(ctx, leftX - FLANGE_THICK - BEAM_BRASS_LEN, leftX - FLANGE_THICK);
  drawFlange(ctx, leftX, beamAngle);
  tube(ctx, leftX, leftX + AXLE_OUT, AXLE_R / SIDE.beam.r, COLORS.steel, false);
}

/**
 * ビームの手前の部分 (PU-32 追加修正): 巻いた糸の円筒 (帯が乗る所 contact から下の面。上は帯の後ろで見えない)・回る光の帯・右の円盤と真ちゅうの筒・軸・つまみ。
 * 円筒は帯とは別のもの: 柄の縞の上を、上が明るく下が暗い陰影で丸く見せ、帯が乗る所に細い影の線 (平らな帯から丸い面への境目) を引く。
 * 右の円盤は帯より手前に描く (左の円盤は帯より奥)。
 */
function drawBeamFront(ctx: CanvasRenderingContext2D, s: BeamingState, runs: Array<{ hex: string; frac: number }>, repeats: number, beamAngle: number, contact: number | null): void {
  const leftX = cmToX(s.widthCm, s.leftCm);
  const rightX = cmToX(s.widthCm, s.rightCm);
  // 糸が巻かれるのは帯の幅だけ。円盤のあいだの帯の外は、軸 (芯) の太さのまま何も巻かれない (円盤を広げても太らない)
  const halfBand = (s.widthCm * pxPerCm(s.widthCm)) / 2;
  const bandL = Math.max(leftX, BEAM_CENTER_X - halfBand);
  const bandR = Math.min(rightX, BEAM_CENTER_X + halfBand);
  if (s.phase !== 'setup' && s.progress > 0) {
    const wound: Circ = { z: SIDE.beam.z, h: SIDE.beam.h, r: woundRadiusFig(s.progress) };
    const from = contact ?? ALPHA + Math.PI / 2; // 糸を付ける前に巻きが残っているとき (再開) は、見える側面の全部
    const to = ALPHA - Math.PI / 2; // 見える側面の下の端
    // 柄の縞 (縦。巻いた糸の円周の向き。左の端は見える側面の弧 = なめらかな 1 本の曲線)
    for (const st of stripeStrips(runs, repeats, bandL, bandR)) {
      ctx.fillStyle = st.hex;
      bandPathRange(ctx, st.x0, st.x1, wound, from, to);
      ctx.fill();
    }
    // 陰影: 上 (帯が乗る所) を明るく、下を暗く (丸い面に見える)
    const ys = arcScreen(bandL, wound, from, to, 8).map((q) => q.y);
    const shade = ctx.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
    shade.addColorStop(0, COLORS.white);
    shade.addColorStop(1, COLORS.sumi);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = shade;
    bandPathRange(ctx, bandL, bandR, wound, from, to);
    ctx.fill();
    // 糸の細い筋 (円周の向き。写真のように細く、むらがある)
    ctx.strokeStyle = COLORS.sumi;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 90; i++) {
      const xs = bandL + noise(i + 77) * (bandR - bandL);
      const a0 = to + noise(i + 600) * (from - to) * 0.6;
      const a1 = Math.min(from, a0 + (from - to) * (0.25 + 0.5 * noise(i + 1000)));
      ctx.globalAlpha = 0.05 + 0.12 * noise(i + 1400);
      const e = arcScreen(xs, wound, a0, a1, 6);
      ctx.beginPath();
      e.forEach((q, j) => (j === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
      ctx.stroke();
    }
    // 回っていることが分かる光の帯 (薄い明るさの反射。見える側面だけ。beamAngle が増えると下へ流れる。BEAM_SURFACE_SIGN)。横の線は引かない
    ctx.fillStyle = COLORS.white;
    ctx.globalAlpha = 0.2;
    const delta = 0.18;
    for (let k = 0; k < BEAM_STREAKS; k++) {
      const phi = ALPHA - BEAM_SURFACE_SIGN * (beamAngle + (Math.PI * 2 * k) / BEAM_STREAKS);
      if (Math.cos(phi - ALPHA) <= 0.15) continue;
      const lo = Math.max(to, phi - delta);
      const hi = Math.min(from, phi + delta);
      if (hi <= lo) continue;
      const a0 = pt(bandL, wound.z + wound.r * Math.cos(lo), wound.h + wound.r * Math.sin(lo));
      const a1 = pt(bandL, wound.z + wound.r * Math.cos(hi), wound.h + wound.r * Math.sin(hi));
      const b1 = pt(bandR, wound.z + wound.r * Math.cos(hi), wound.h + wound.r * Math.sin(hi));
      const b0 = pt(bandR, wound.z + wound.r * Math.cos(lo), wound.h + wound.r * Math.sin(lo));
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(a1.x, a1.y);
      ctx.lineTo(b1.x, b1.y);
      ctx.lineTo(b0.x, b0.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 帯が乗る所の境目 (平らな帯から丸い面へ変わる所に、細い影の線)
    if (contact !== null) {
      const l = pt(bandL, wound.z + wound.r * Math.cos(contact), wound.h + wound.r * Math.sin(contact));
      const r = pt(bandR, wound.z + wound.r * Math.cos(contact), wound.h + wound.r * Math.sin(contact));
      ctx.strokeStyle = COLORS.sumi;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  // 右の円盤と、その手前 (右) に出る真ちゅうの筒・軸・端のつまみ (帯より手前)
  tube(ctx, rightX, ROD_X1, AXLE_R / SIDE.beam.r, COLORS.steel, false);
  drawFlange(ctx, rightX, beamAngle);
  drawBrass(ctx, rightX, rightX + BEAM_BRASS_LEN);
  // 右端のつまみ: 右を向いた端の面を楕円として描く (真ちゅうの筒の右の端と同じ考え)
  const k1 = discEllipse(ROD_X1, 1);
  ctx.fillStyle = COLORS.sumi;
  ctx.fillRect(k1.cx - KNOB_LEN, k1.cy - KNOB_RY, KNOB_LEN, 2 * KNOB_RY);
  ctx.beginPath();
  ellipsePath(ctx, { cx: k1.cx, cy: k1.cy, rx: KNOB_RX, ry: KNOB_RY });
  ctx.closePath();
  ctx.fill();
}

/** 幅合わせの目標の点線と目盛り (10cm ごと)、円盤の内側の印 (藍 = 合っている、朱 = 外れている) */
function drawTarget(ctx: CanvasRenderingContext2D, s: BeamingState): void {
  const half = (s.widthCm * pxPerCm(s.widthCm)) / 2;
  const x0 = BEAM_CENTER_X - half;
  const x1 = BEAM_CENTER_X + half;
  const y = BOARD.targetY;
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 2;
  // 点線 (偽の Canvas にもある形で描く: 線分を並べる)
  const dash = 10;
  const gap = 8;
  for (let x = x0; x < x1; x += dash + gap) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(Math.min(x + dash, x1), y);
    ctx.stroke();
  }
  // 目盛り (10cm ごと)
  ctx.fillStyle = COLORS.sumiSub;
  const perCm = pxPerCm(s.widthCm);
  for (let cm = -Math.floor(s.widthCm / 2 / 10) * 10; cm <= s.widthCm / 2; cm += 10) {
    ctx.fillRect(BEAM_CENTER_X + cm * perCm - 1, y, 2, 10);
  }
  // 円盤の内側の印 (左は leftCm、右は rightCm が目標に合っているか)
  const targets: Array<{ cm: number; actual: number }> = [
    { cm: -s.widthCm / 2, actual: s.leftCm },
    { cm: s.widthCm / 2, actual: s.rightCm },
  ];
  for (const t of targets) {
    const ok = Math.abs(t.actual - t.cm) <= 1;
    ctx.fillStyle = ok ? COLORS.ai : COLORS.shu;
    ctx.fillRect(cmToX(s.widthCm, t.actual) - 6, y + 16, 12, 12);
  }
}

/**
 * 速さのランプ (ドラムの上。T3-07 で張りから速さの判定に変えた)。ドラム巻きの drawTensionLamp と同じ見た目:
 * 範囲の中は緑の「○」、強すぎは「▲」、弱すぎは「▼」のオレンジ。state の形が違うので
 * ドラム巻きからは読み込まず、ここに同じ見た目で書く。外れていないときは点滅しない。
 */
function drawTensionLamp(ctx: CanvasRenderingContext2D, fit: StageFit, s: BeamingState): void {
  if (s.phase !== 'beaming') {
    return;
  }
  const x = lampX();
  const y = lampY();
  const r = lampR(fit.scale); // ドラム巻きの lampGeometry と同じ決め方 (画面上 16px 以上。PU-26 追加修正)
  const range = okRangeOf(s.progress, s.level, s.dip);
  const state: 'ok' | 'high' | 'low' = s.speed > range.max ? 'high' : s.speed < range.min ? 'low' : 'ok'; // T3-07: 判定は張りでなく速さそのもの
  const color = state === 'ok' ? COLORS.lampOk : COLORS.lampWarn;
  // 光っている感じ (外側の薄い輪)
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // 中の記号 (色だけに頼らない)
  const symbol = state === 'ok' ? '○' : state === 'high' ? '▲' : '▼';
  ctx.fillStyle = COLORS.white;
  ctx.font = `bold ${Math.round(Math.max(r * 1.3, 20 / fit.scale))}px ${FONT_FAMILY}`; // 記号は画面上 20px 以上
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, x, y + r * 0.05);
}
