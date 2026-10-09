import type { Content } from '../../core/content/content';
import { COLORS } from '../../core/ui/tokens';
import type { StageFit } from '../../core/viewport/viewport';
import {
  BOARD, BEAM_CENTER_X, DRUM_X, DRUM_W, CORE_R, ROD_X0, ROD_X1, DRUM_TILT_RX, drumArcX, FLANGE_RX, woundRadius, woundTopY, sheetTopY, sheetDropEndY, lampR, threadBarRange, cmToX, pxPerCm,
  speedBarCenterX, SPEED_BAR_W, lampX, lampY,
} from './geometry';
import { okRangeOf } from './logic';
import { DRUM_SURFACE_SIGN, BEAM_SURFACE_SIGN, DRUM_FLANGE_SIGN, BEAM_FLANGE_SIGN } from './params';
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

/** 円盤の穴の輪 (円盤の半径に対する割合と、輪ごとの穴の数) */
const HOLE_RINGS: Array<{ frac: number; count: number }> = [
  { frac: 0.4, count: 6 },
  { frac: 0.63, count: 10 },
  { frac: 0.86, count: 14 },
];

/**
 * 盤面を描く。drumAngle は巻いているあいだのドラムの回り (controller が渡す。ドラムの面の桟が縦に流れる)。
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
): void {
  const hex = mainHex(content, s.patternId);

  ctx.fillStyle = COLORS.kinari;
  ctx.fillRect(0, 0, ctx.canvas.clientWidth || ctx.canvas.width, ctx.canvas.clientHeight || ctx.canvas.height);

  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);

  // 1. 奥: ドラム (横に寝た円筒。糸の筋は縦。巻き取られて少しずつ細る)
  drawDrum(ctx, hex, drumAngle, s);

  // 2. 糸のシート (ドラムの下側から手前へ降りる。柄の色の縦の筋)
  drawSheet(ctx, s, hex, s.phase === 'attach' && threadDrag ? threadDrag.y : null);

  // 3. ガイドの棒 (茶色の細い横棒。シートがくぐる)
  drawGuide(ctx, s);

  // 4. 手前: ビーム (巻いた糸の円筒・左右の円盤・飛び出す軸)
  drawBeam(ctx, s, hex, beamAngle);

  // 5. 幅合わせの段階: 目標の巻き幅の点線と目盛り (cm)、円盤の内側の印
  if (s.phase === 'setup') {
    drawTarget(ctx, s);
  }

  // 糸の束の先の木の棒 (糸を付けるまで。巻き始めたらビームに巻き込まれて見えない。PU-27)
  if (s.phase === 'setup' || s.phase === 'attach') {
    drawThreadBar(ctx, fit, s, s.phase === 'attach' && threadDrag ? threadDrag.y : sheetDropEndY(s.progress));
  }

  // 張りのランプ (ドラムの上。ドラム巻きと同じ見た目。T3-06 追記)
  drawTensionLamp(ctx, fit, s);

  ctx.restore();
  // 文字は盤面には描かない (巻き量・速さは操作欄。乗り上げの表示は T3-05 で偏りが無くなったので無い。PU-24a)
}

/** ドラムの桟の数 (円筒の周りに等間隔に並ぶ。ドラム巻きと同じ考え) */
const DRUM_SLATS = 16;
/** 端の円盤の放射状の腕の数 */
const DRUM_ARMS = 6;

/**
 * 奥のドラム (PU-26)。ドラム巻きのドラムと同じ見た目: 胴は機械の緑 (明るさの勾配)、木の桟、灰色の金属の端の円盤に放射状の腕。
 * 横に寝た円筒を少し斜めから見た構図 (PU-24a): 右の端だけが楕円の面として見え、左の端は円筒の輪郭の曲線 (「(」の形) だけ。
 * 糸の巻かれた面 (柄の色) は胴の中ほど (糸のシートの幅) に巻かれ、巻き取られて少しずつ細る。
 * 手前の面は下から上へ回る (drumAngle が増えると桟が上へ流れる。DRUM_SURFACE_SIGN)。
 */
export function drawDrum(ctx: CanvasRenderingContext2D, hex: string, drumAngle: number, s: BeamingState): void {
  const cy = BOARD.drumY + BOARD.drumH / 2;
  const half = (BOARD.drumH / 2) * (1 - 0.3 * Math.min(1, Math.max(0, s.progress))); // 巻き取られて細る
  const top = cy - half;
  const bottom = cy + half;
  const x0 = DRUM_X;
  const x1 = DRUM_X + DRUM_W;
  // 胴 (機械の緑。上下を暗く、上寄りを明るく)。上の線 → 右の端 → 下の線 → 左の輪郭 (丸みの曲線)
  const grad = ctx.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, COLORS.machineDark);
  grad.addColorStop(0.3, COLORS.machineLight);
  grad.addColorStop(0.7, COLORS.machine);
  grad.addColorStop(1, COLORS.machineDark);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x0, top);
  ctx.lineTo(x1, top);
  ctx.lineTo(x1, bottom);
  ctx.lineTo(x0, bottom);
  const N = 12;
  for (let i = 1; i <= N; i++) {
    const t = 1 - (2 * i) / N; // 下から上へ
    ctx.lineTo(drumArcX(x0, t), cy + half * t);
  }
  ctx.closePath();
  ctx.fill();
  // 巻かれた糸 (柄の色。胴の中ほど = 糸のシートの幅。丸みに沿った円周の筋で描く)
  const wHalf = (s.widthCm * pxPerCm(s.widthCm)) / 2;
  const w0 = Math.max(x0, BEAM_CENTER_X - wHalf);
  const w1 = Math.min(x1, BEAM_CENTER_X + wHalf);
  ctx.fillStyle = hex;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N; // 上から下へ (右の縁。円周の筋と同じ丸み)
    if (i === 0) ctx.moveTo(drumArcX(w1, t), cy + half * t);
    else ctx.lineTo(drumArcX(w1, t), cy + half * t);
  }
  for (let i = N; i >= 0; i--) {
    const t = -1 + (2 * i) / N; // 下から上へ (左の縁)
    ctx.lineTo(drumArcX(w0, t), cy + half * t);
  }
  ctx.closePath();
  ctx.fill();
  // 糸の筋 (円周の線。丸みに沿って曲がる)
  ctx.strokeStyle = COLORS.sumi;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 2;
  for (let xs = x0 + 12; xs < x1; xs += 14) {
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const t = -1 + (2 * i) / 8;
      if (i === 0) ctx.moveTo(drumArcX(xs, t), cy + half * t);
      else ctx.lineTo(drumArcX(xs, t), cy + half * t);
    }
    ctx.stroke();
  }
  // 木の桟 (軸に沿った線。円筒の周りに等間隔。手前 (cos > 0) だけ。drumAngle が増えると上へ流れる)
  ctx.strokeStyle = COLORS.woodLight;
  ctx.globalAlpha = 0.8;
  for (let k = 0; k < DRUM_SLATS; k++) {
    const th = drumAngle + (Math.PI * 2 * k) / DRUM_SLATS;
    const cosT = Math.cos(th);
    if (cosT <= 0) continue; // 裏側
    const y = cy + DRUM_SURFACE_SIGN * half * Math.sin(th);
    const t = (y - cy) / half;
    ctx.lineWidth = Math.max(1.5, 5 * cosT);
    ctx.beginPath();
    ctx.moveTo(drumArcX(x0, t), y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // 右の端の面 (楕円。灰色の金属。片側だけ) と、回る放射状の腕
  ctx.fillStyle = COLORS.steel;
  ctx.beginPath();
  ctx.ellipse(x1, cy, DRUM_TILT_RX, half, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let a = 0; a < DRUM_ARMS; a++) {
    const ang = DRUM_FLANGE_SIGN * drumAngle + (Math.PI * 2 * a) / DRUM_ARMS;
    ctx.beginPath();
    ctx.moveTo(x1, cy);
    ctx.lineTo(x1 + Math.cos(ang) * DRUM_TILT_RX * 0.85, cy + Math.sin(ang) * half * 0.85);
    ctx.stroke();
  }
}

/** 糸の束の先の木の棒 (水平。束の幅より左右に長く、端は丸い。太さは画面上 12px 以上。PU-27) */
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
 * 糸のシート。上はドラムの下端 (中央)。下は、糸を付けるまで (setup・attach) は木の棒の位置 (垂れた端 sheetDropEndY。attach で引っぱっている間は棒の y。束の幅は変わらない)、
 * 巻いている間 (beaming・done) は巻いた糸の円筒の上端 (中央)。柄の色の縦の筋が上から下へ走る
 */
function drawSheet(ctx: CanvasRenderingContext2D, s: BeamingState, hex: string, barY: number | null): void {
  const half = (s.widthCm * pxPerCm(s.widthCm)) / 2;
  const topY = sheetTopY(s.progress);
  const bottomY = s.phase === 'setup' ? sheetDropEndY(s.progress) : s.phase === 'attach' ? (barY ?? sheetDropEndY(s.progress)) : woundTopY(s.progress);
  const cx = BEAM_CENTER_X; // シートはいつも中心 (偏りは無い。T3-05)
  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.moveTo(cx - half, bottomY);
  ctx.lineTo(cx + half, bottomY);
  ctx.lineTo(BEAM_CENTER_X + half, topY);
  ctx.lineTo(BEAM_CENTER_X - half, topY);
  ctx.closePath();
  ctx.fill();
  // 縦の筋 (上の端から下の端へ。偏りで下がずれると、筋も斜めになる)
  ctx.strokeStyle = COLORS.sumi;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 2;
  const n = 36;
  for (let i = 0; i <= n; i++) {
    const k = i / n - 0.5; // -0.5〜0.5
    ctx.beginPath();
    ctx.moveTo(BEAM_CENTER_X + k * 2 * half, topY);
    ctx.lineTo(cx + k * 2 * half, bottomY);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * ガイドの棒 (茶色の細い横棒。ドラムとビームのあいだ)。指で左右に引っぱって速さを変える部品 (PU-24b):
 * 真ん中の x は速さで決まる (速さ 0 は中心より左、右へ動かすほど速い)。幅合わせの段階では押せない形 (うすく描く)。
 */
function drawGuide(ctx: CanvasRenderingContext2D, s: BeamingState): void {
  const h = 12;
  const x = speedBarCenterX(s.phase === 'setup' ? 0 : s.speed);
  ctx.save();
  if (s.phase === 'setup') {
    ctx.globalAlpha = 0.55;
  }
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(x - SPEED_BAR_W / 2, BOARD.guideY - h / 2, SPEED_BAR_W, h);
  ctx.restore();
}

/** 巻いた糸の流れる筋の数 (円筒の周りに等間隔) */
const BEAM_STREAKS = 8;

/** 円盤の厚み (px。軸の方向の長さ。左の端が少し見える) */
const FLANGE_THICK = 10;

/** 円盤 1 枚 (厚みの側面と、右を向いた面。穴が同心円状の輪に並ぶ)。x は円盤の面の中心の x */
function drawFlange(ctx: CanvasRenderingContext2D, x: number, beamAngle: number): void {
  const axisY = BOARD.axisY;
  const R = BOARD.flangeR;
  // 厚みの側面 (左の端の輪郭の曲線と、上下の線)
  ctx.fillStyle = COLORS.sumiSub;
  ctx.fillRect(x - FLANGE_THICK, axisY - R, FLANGE_THICK, R * 2);
  ctx.beginPath();
  ctx.ellipse(x - FLANGE_THICK, axisY, FLANGE_RX, R, 0, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.fill();
  // 面 (暗い金属の楕円。中心が軸の中心)
  const kx = FLANGE_RX / R; // 斜めから見て横にちぢむ割合
  ctx.fillStyle = COLORS.flange;
  ctx.beginPath();
  ctx.ellipse(x, axisY, FLANGE_RX, R, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.flangeHole;
  for (const ring of HOLE_RINGS) {
    for (let i = 0; i < ring.count; i++) {
      const th = (Math.PI * 2 * i) / ring.count + BEAM_FLANGE_SIGN * beamAngle;
      ctx.beginPath();
      ctx.arc(x + Math.cos(th) * ring.frac * R * kx, axisY + Math.sin(th) * ring.frac * R, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, axisY, FLANGE_RX, R, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * ビーム (PU-24a): 銀色の軸は固定の長さ (ROD_X0〜ROD_X1) で円盤の中心を貫き、円盤だけが軸の上を左右に動く。
 * 少し斜めの構図で右を向いた面が見える。奥 (左) から手前 (右) の順に: 軸全体 → 左の円盤 → 軸の手前側 → 巻いた糸の円筒 →
 * 右の円盤 → 右の円盤の手前に出る軸と端のつまみ。巻いた糸は軸を中心に上下に太り、円盤と同じ向きの楕円の端を持つ。
 */
function drawBeam(ctx: CanvasRenderingContext2D, s: BeamingState, hex: string, beamAngle: number): void {
  const leftX = cmToX(s.widthCm, s.leftCm);
  const rightX = cmToX(s.widthCm, s.rightCm);
  const axisY = BOARD.axisY;
  const rodY = axisY - CORE_R;
  // 1. 軸の全体 (長さは固定)
  ctx.fillStyle = COLORS.steel;
  ctx.fillRect(ROD_X0, rodY, ROD_X1 - ROD_X0, CORE_R * 2);
  // 2. 左の円盤 (軸はこの円盤の中心を貫く。円盤の面の手前 (右) に軸が出る)
  drawFlange(ctx, leftX, beamAngle);
  ctx.fillStyle = COLORS.steel;
  ctx.fillRect(leftX, rodY, Math.max(0, rightX - leftX), CORE_R * 2);
  // 3. 巻いた糸 (円盤のあいだ。軸を中心に上下に同じだけ太る円筒。端は円盤と同じ向きの楕円)
  if (s.phase !== 'setup' && s.progress > 0) {
    const r = woundRadius(s.progress);
    const rx = FLANGE_RX * (r / BOARD.flangeR);
    ctx.fillStyle = hex;
    ctx.fillRect(leftX, axisY - r, rightX - leftX, r * 2);
    ctx.beginPath();
    ctx.ellipse(leftX, axisY, rx, r, 0, Math.PI / 2, (Math.PI * 3) / 2); // 左の端の丸み (円盤の面に接する)
    ctx.fill();
    ctx.strokeStyle = COLORS.sumi;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftX, axisY - r);
    ctx.lineTo(rightX, axisY - r);
    ctx.moveTo(leftX, axisY + r);
    ctx.lineTo(rightX, axisY + r);
    ctx.stroke();
    // 回っていることが分かる筋 (糸の流れ。手前 (cos > 0) だけ。beamAngle が増えると下へ流れる。BEAM_SURFACE_SIGN)
    ctx.strokeStyle = COLORS.white;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 3;
    for (let k = 0; k < BEAM_STREAKS; k++) {
      const th = beamAngle + (Math.PI * 2 * k) / BEAM_STREAKS;
      if (Math.cos(th) <= 0) continue;
      const y = axisY + BEAM_SURFACE_SIGN * r * Math.sin(th);
      ctx.beginPath();
      ctx.moveTo(leftX, y);
      ctx.lineTo(rightX, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // 4. 右の円盤と、その手前 (右) に出る軸・端のつまみ
  drawFlange(ctx, rightX, beamAngle);
  ctx.fillStyle = COLORS.steel;
  ctx.fillRect(rightX, rodY, Math.max(0, ROD_X1 - rightX), CORE_R * 2);
  ctx.fillStyle = COLORS.sumi;
  ctx.fillRect(ROD_X0 - 4, rodY - 5, 12, CORE_R * 2 + 10);
  ctx.fillRect(ROD_X1 - 8, rodY - 5, 12, CORE_R * 2 + 10);
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
 * 張りのランプ (ドラムの上。T3-06 追記)。ドラム巻きの drawTensionLamp と同じ見た目:
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
  const state: 'ok' | 'high' | 'low' = s.tension > range.max ? 'high' : s.tension < range.min ? 'low' : 'ok';
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

