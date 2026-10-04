import type { Content } from '../../core/content/content';
import { COLORS } from '../../core/ui/tokens';
import type { StageFit } from '../../core/viewport/viewport';
import {
  BOARD, BEAM_CENTER_X, DRUM_X, DRUM_W, CORE_R, ROD_OUT, FLANGE_RX, woundRadius, woundTopY, sheetTopY, cmToX, pxPerCm, TOP_TEXT, toPx,
  leverNotchX, leverY, lampX, lampY,
} from './geometry';
import { overflowSides, goodSpeedOf } from './logic';
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

/** 乗り上げか (判定は logic の overflowSides。T3-03a 追加修正で1か所にまとめた) */
function overflowing(s: BeamingState, side: 'left' | 'right'): boolean {
  return side === 'left' ? overflowSides(s).left : overflowSides(s).right;
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

  // 6. 文字 (変換を戻してから画面 px で描く。20px 以上)
  ctx.font = '20px sans-serif';
  ctx.fillStyle = COLORS.sumi;
  const top = toPx(fit, TOP_TEXT);
  // 巻き量は操作欄の 1 か所だけ。幅合わせの案内は最初のお知らせ (notify) で出す (PU-15c)
  // 乗り上げの文字 (20px 以上。朱)
  if (s.phase === 'beaming' && (overflowing(s, 'left') || overflowing(s, 'right'))) {
    ctx.fillStyle = COLORS.shu;
    ctx.font = '24px sans-serif';
    const y = toPx(fit, { x: 0, y: BOARD.axisY - BOARD.flangeR - 20 }).y;
    ctx.fillText('乗り上げ', top.x, y);
  }
}

/** 奥のドラム。横に寝た円筒で、糸の筋は縦 (回る向き)。両端は楕円 (斜めから見た端の面) */
function drawDrum(ctx: CanvasRenderingContext2D, hex: string, drumAngle: number, progress: number): void {
  const cy = BOARD.drumY + BOARD.drumH / 2;
  const half = (BOARD.drumH / 2) * (1 - 0.3 * Math.min(1, Math.max(0, progress))); // 巻き取られて細る
  const top = cy - half;
  const bottom = cy + half;
  // 胴 (糸が巻かれた面)
  ctx.fillStyle = hex;
  ctx.fillRect(DRUM_X, top, DRUM_W, half * 2);
  // 糸の筋 (縦。胴を回る向き)
  ctx.strokeStyle = COLORS.sumi;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 2;
  for (let x = DRUM_X + 12; x < DRUM_X + DRUM_W; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }
  // 回る面の桟 (横の細い線。drumAngle で縦に流れる)
  ctx.strokeStyle = COLORS.woodLight;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 3;
  const step = 34;
  const shift = ((drumAngle * 40) % step + step) % step;
  for (let y = top + shift; y < bottom; y += step) {
    ctx.beginPath();
    ctx.moveTo(DRUM_X, y);
    ctx.lineTo(DRUM_X + DRUM_W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // 両端の面 (楕円。灰色の金属)
  for (const x of [DRUM_X, DRUM_X + DRUM_W]) {
    ctx.fillStyle = COLORS.steel;
    ctx.beginPath();
    ctx.ellipse(x, cy, 22, half, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.sumiSub;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
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

/** ビーム: 巻いた糸の円筒 (軸のまわりに上下に太る)・左右の円盤 (穴の輪)・円盤の外へ飛び出す銀色の軸と端のつまみ */
function drawBeam(ctx: CanvasRenderingContext2D, s: BeamingState, hex: string): void {
  const leftX = cmToX(s.widthCm, s.leftCm);
  const rightX = cmToX(s.widthCm, s.rightCm);
  const axisY = BOARD.axisY;
  // 巻いた糸 (円盤のあいだ。軸を中心に上下に同じだけ)
  if (s.phase !== 'setup' && s.progress > 0) {
    const r = woundRadius(s.progress);
    ctx.fillStyle = hex;
    ctx.fillRect(leftX, axisY - r, rightX - leftX, r * 2);
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
  // 円盤 (暗い金属の大きな楕円。穴が同心円状の輪に並ぶ)
  const kx = FLANGE_RX / BOARD.flangeR; // 斜めから見て横にちぢむ割合
  for (const x of [leftX, rightX]) {
    ctx.fillStyle = COLORS.flange;
    ctx.beginPath();
    ctx.ellipse(x, axisY, FLANGE_RX, BOARD.flangeR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.flangeHole;
    for (const ring of HOLE_RINGS) {
      for (let i = 0; i < ring.count; i++) {
        const th = (Math.PI * 2 * i) / ring.count;
        ctx.beginPath();
        ctx.arc(x + Math.cos(th) * ring.frac * BOARD.flangeR * kx, axisY + Math.sin(th) * ring.frac * BOARD.flangeR, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 円盤の縁。乗り上げ: その側の円盤の縁を朱で太く示す
    const isLeft = x === leftX;
    const over = s.phase === 'beaming' && overflowing(s, isLeft ? 'left' : 'right');
    ctx.strokeStyle = over ? COLORS.shu : COLORS.sumiSub;
    ctx.lineWidth = over ? 6 : 2;
    ctx.beginPath();
    ctx.ellipse(x, axisY, FLANGE_RX, BOARD.flangeR, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 銀色の太い軸 (円盤の外へ左右とも飛び出す) と、端の黒いつまみ
  const rodX0 = Math.max(4, leftX - ROD_OUT);
  const rodX1 = Math.min(996, rightX + ROD_OUT);
  ctx.fillStyle = COLORS.steel;
  ctx.fillRect(rodX0, axisY - CORE_R, rodX1 - rodX0, CORE_R * 2);
  ctx.fillStyle = COLORS.sumi;
  ctx.fillRect(rodX0 - 4, axisY - CORE_R - 5, 12, CORE_R * 2 + 10);
  ctx.fillRect(rodX1 - 8, axisY - CORE_R - 5, 12, CORE_R * 2 + 10);
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

