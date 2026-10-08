import type { Content } from '../../core/content/content';
import { COLORS } from '../../core/ui/tokens';
import type { StageFit } from '../../core/viewport/viewport';
import {
  BOARD, BEAM_CENTER_X, DRUM_X, DRUM_W, CORE_R, ROD_X0, ROD_X1, DRUM_TILT_RX, drumArcX, FLANGE_RX, woundRadius, woundTopY, sheetTopY, cmToX, pxPerCm,
  leverNotchX, leverY, lampX, lampY,
} from './geometry';
import { goodSpeedOf } from './logic';
import { GOOD_SPEED_ZONES } from './params';
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
  leverDragX: number | null = null,
): void {
  const hex = mainHex(content, s.patternId);

  ctx.fillStyle = COLORS.kinari;
  ctx.fillRect(0, 0, ctx.canvas.clientWidth || ctx.canvas.width, ctx.canvas.clientHeight || ctx.canvas.height);

  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);

  // 1. 奥: ドラム (横に寝た円筒。糸の筋は縦。巻き取られて少しずつ細る)
  drawDrum(ctx, hex, drumAngle, s.progress);

  // 2. 糸のシート (ドラムの下側から手前へ降りる。柄の色の縦の筋)
  drawSheet(ctx, s, hex);

  // 3. ガイドの棒 (茶色の細い横棒。シートがくぐる)
  drawGuide(ctx);

  // 4. 手前: ビーム (巻いた糸の円筒・左右の円盤・飛び出す軸)
  drawBeam(ctx, s, hex);

  // 5. 幅合わせの段階: 目標の巻き幅の点線と目盛り (cm)、円盤の内側の印
  if (s.phase === 'setup') {
    drawTarget(ctx, s);
  }

  // 速さのレバー (ビームの少し上。T3-04b) と速さのランプ
  drawSpeedLever(ctx, fit, s, leverDragX);
  drawSpeedLamp(ctx, fit, s);

  ctx.restore();
  // 文字は盤面には描かない (巻き量・速さは操作欄。乗り上げの表示は T3-05 で偏りが無くなったので無い。PU-24a)
}

/**
 * 奥のドラム。横に寝た円筒を、ドラム巻きと同じ少し斜めの構図で描く (PU-24a)。
 * 右の端だけが楕円の面 (灰色の金属) として見え、左の端は円筒の輪郭の曲線 (「(」の形) だけ。
 * 糸の筋は円筒の丸みに沿って曲がる (drumArcX)。巻き取られて少しずつ細る。
 */
function drawDrum(ctx: CanvasRenderingContext2D, hex: string, drumAngle: number, progress: number): void {
  const cy = BOARD.drumY + BOARD.drumH / 2;
  const half = (BOARD.drumH / 2) * (1 - 0.3 * Math.min(1, Math.max(0, progress))); // 巻き取られて細る
  const top = cy - half;
  const bottom = cy + half;
  const x0 = DRUM_X;
  const x1 = DRUM_X + DRUM_W;
  // 胴 (糸が巻かれた面)。上の線 → 右の端 → 下の線 → 左の輪郭 (丸みの曲線)
  ctx.fillStyle = hex;
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
  // 回る面の桟 (軸に沿った細い線。drumAngle で上下に流れる。端は丸みの輪郭に合わせる)
  ctx.strokeStyle = COLORS.woodLight;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 3;
  const step = 34;
  const shift = (((drumAngle * 40) % step) + step) % step;
  for (let y = top + shift; y < bottom; y += step) {
    const t = (y - cy) / half;
    ctx.beginPath();
    ctx.moveTo(drumArcX(x0, t), y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // 右の端の面 (楕円。灰色の金属。片側だけ)
  ctx.fillStyle = COLORS.steel;
  ctx.beginPath();
  ctx.ellipse(x1, cy, DRUM_TILT_RX, half, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.sumiSub;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** 糸のシート。上はドラムの下端 (中央)、下は巻いた糸の円筒の上端 (shiftCm の中心)。柄の色の縦の筋が上から下へ走る */
function drawSheet(ctx: CanvasRenderingContext2D, s: BeamingState, hex: string): void {
  if (s.phase === 'setup') return; // 幅合わせのあいだはシートは降りてこない
  const half = (s.widthCm * pxPerCm(s.widthCm)) / 2;
  const topY = sheetTopY(s.progress);
  const bottomY = woundTopY(s.progress);
  const cx = cmToX(s.widthCm, s.shiftCm);
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

/** ガイドの棒 (茶色の細い横棒。ドラムとビームのあいだ) */
function drawGuide(ctx: CanvasRenderingContext2D): void {
  const h = 12;
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(DRUM_X + 40, BOARD.guideY - h / 2, DRUM_W - 80, h);
}

/** 円盤の厚み (px。軸の方向の長さ。左の端が少し見える) */
const FLANGE_THICK = 10;

/** 円盤 1 枚 (厚みの側面と、右を向いた面。穴が同心円状の輪に並ぶ)。x は円盤の面の中心の x */
function drawFlange(ctx: CanvasRenderingContext2D, x: number): void {
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
      const th = (Math.PI * 2 * i) / ring.count;
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
function drawBeam(ctx: CanvasRenderingContext2D, s: BeamingState, hex: string): void {
  const leftX = cmToX(s.widthCm, s.leftCm);
  const rightX = cmToX(s.widthCm, s.rightCm);
  const axisY = BOARD.axisY;
  const rodY = axisY - CORE_R;
  // 1. 軸の全体 (長さは固定)
  ctx.fillStyle = COLORS.steel;
  ctx.fillRect(ROD_X0, rodY, ROD_X1 - ROD_X0, CORE_R * 2);
  // 2. 左の円盤 (軸はこの円盤の中心を貫く。円盤の面の手前 (右) に軸が出る)
  drawFlange(ctx, leftX);
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
    ctx.globalAlpha = 1;
  }
  // 4. 右の円盤と、その手前 (右) に出る軸・端のつまみ
  drawFlange(ctx, rightX);
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
 * 速さのレバー (ビームの少し上。横に3つの止まり: 停止・50%・100%。T3-04b)。
 * 今の巻き量で適正な止まりに藍の枠と「適正」の文字を出す (重なる区間は2つとも)。
 * 幅合わせの段階では押せない形 (うすく描く)。leverDragX は引っぱっているあいだの指の x。
 */
function drawSpeedLever(ctx: CanvasRenderingContext2D, fit: StageFit, s: BeamingState, leverDragX: number | null): void {
  if (s.phase === 'done') {
    return;
  }
  const y = leverY();
  const enabled = s.phase === 'beaming';
  ctx.save();
  if (!enabled) {
    ctx.globalAlpha = 0.55;
  }
  // レバーの帯
  const bandLeft = leverNotchX(0) - 46;
  const bandRight = leverNotchX(100) + 46;
  ctx.fillStyle = COLORS.aiTint;
  ctx.fillRect(bandLeft, y - 26, bandRight - bandLeft, 52);
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = fit.scale * 2;
  ctx.stroke();
  // 引っぱっているあいだの目印 (指の x に細い縦線)
  if (leverDragX !== null) {
    ctx.strokeStyle = COLORS.ai;
    ctx.lineWidth = fit.scale * 3;
    ctx.beginPath();
    ctx.moveTo(leverDragX, y - 34);
    ctx.lineTo(leverDragX, y + 34);
    ctx.stroke();
  }
  // 止まり 3つ
  for (const sp of [0, 50, 100] as const) {
    const nx = leverNotchX(sp);
    const good = enabled && goodSpeedOf(sp, s.progress);
    if (good) {
      // 適正の止まり: 藍の枠 + 「適正」の文字
      ctx.strokeStyle = COLORS.ai;
      ctx.lineWidth = fit.scale * 3;
      ctx.strokeRect(nx - 34, y - 34, 68, 68);
      // 白い pill の上に藍の文字 (巻いた糸の上でも読めるように)
      ctx.fillStyle = COLORS.white;
      ctx.fillRect(nx - 30, y + 40, 60, 24);
      ctx.strokeStyle = COLORS.ai;
      ctx.lineWidth = fit.scale * 1.5;
      ctx.strokeRect(nx - 30, y + 40, 60, 24);
      ctx.fillStyle = COLORS.ai;
      ctx.font = `${20 * fit.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('適正', nx, y + 58);
    }
    // ノブ (押せる所は 64px 以上)
    ctx.beginPath();
    ctx.arc(nx, y, 32, 0, Math.PI * 2);
    ctx.fillStyle = enabled && s.speed === sp ? COLORS.ai : COLORS.white;
    ctx.fill();
    ctx.strokeStyle = COLORS.ai;
    ctx.lineWidth = fit.scale * 2;
    ctx.stroke();
    // 文字 (20px 以上)
    ctx.fillStyle = enabled && s.speed === sp ? COLORS.white : COLORS.sumi;
    ctx.font = `${20 * fit.scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sp === 0 ? '停止' : `${sp}%`, nx, y);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

/**
 * 速さのランプ (ビームの上の左寄り。T3-04b)。今の速さが適正なら緑の「○」、
 * 外れていればオレンジの「▲」(速すぎ) か「▼」(遅すぎ)。停止中は消灯 (描かない)。
 */
function drawSpeedLamp(ctx: CanvasRenderingContext2D, fit: StageFit, s: BeamingState): void {
  if (s.phase !== 'beaming' || s.speed === 0) {
    return;
  }
  const x = lampX();
  const y = lampY();
  if (goodSpeedOf(s.speed, s.progress)) {
    // 適正: 緑の丸
    ctx.fillStyle = COLORS.lampOk;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.white;
    ctx.lineWidth = fit.scale * 3;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  // 外れている: 速すぎ (▲) か遅すぎ (▼)。今の速さより遅い適正があれば速すぎ
  const goodSpeeds = GOOD_SPEED_ZONES.filter((z) => s.progress * 100 >= z.from && s.progress * 100 <= z.to).map((z) => z.speed);
  const tooFast = goodSpeeds.some((g) => g > 0 && g < s.speed);
  const color = COLORS.lampWarn;
  ctx.fillStyle = color;
  ctx.beginPath();
  const h = 30;
  if (tooFast) {
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x + 18, y + 12);
    ctx.lineTo(x - 18, y + 12);
  } else {
    ctx.moveTo(x, y + 18);
    ctx.lineTo(x + 18, y - 12);
    ctx.lineTo(x - 18, y - 12);
  }
  ctx.closePath();
  ctx.fill();
  ctx.font = `${20 * fit.scale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(tooFast ? '速すぎ' : '遅すぎ', x, y + h + 14);
}

