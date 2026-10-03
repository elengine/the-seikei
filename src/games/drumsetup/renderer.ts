import type { Content } from '../../core/content/content';
import { COLORS } from '../../core/ui/tokens';
import type { StageFit } from '../../core/viewport/viewport';
import { TRIAL_TURNS } from './params';
import type { DrumSetupPuzzle } from './puzzles';
import type { TrialOutcome } from './logic';
import {
  DRUM_RECT, SECTION_RIGHT, WING_BASE, WING_THICK_PX, TOP_TEXT, RESULT_TEXT, LAYER_H_PX,
  wingDir, wingLen, slopeXAt, layerTopY, layerLeftEdgeX, toPx,
} from './geometry';
import { correctFeed } from './logic';

/**
 * ドラム設定の盤面の描画 (T2c-02)。横から見た断面。
 * ドラム巻きと同じ決まり:論理座標で描く部分は ctx の変換 (translate + scale) で画面に合わせ、
 * 文字は変換を戻したあとに toPx で画面の点に直して描く (大きさは画面 px・20px 以上)。
 * 色は COLORS と糸の色 (hex) だけ。明るさは globalAlpha で変える。
 */

/** 盤面に渡す表示の値 */
export interface DrumSetupView {
  /** 選んだ羽の角度 (未選択は null → 羽は点線) */
  angle: number | null;
  /** 今の送り量 mm */
  feed: number;
  /** 試し巻きの結果 (層の形と結果の文字。null は層を普通に積む) */
  outcome: TrialOutcome | null;
  /** 試し巻きの積み上げの進行 (0〜1。rAF の時刻から controller が渡す) */
  progress: number;
  /** 結果の文字を出すか (積み上げが終わったあと) */
  showResult: boolean;
}

/** 柄でいちばん多く使う糸の色 (層の色) */
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

/** 使えない角度のとき、ずり落ちる層の数とずれ */
const BAD_LAYERS = 6;
const BAD_SLIP_PX = 12;

/**
 * 盤面を描く。
 * 層の数は progress × TRIAL_TURNS (試し巻きのあいだ 1層ずつ積み上がる)。
 * 結果に応じて層の右端を変える:good は斜面に沿う、crush は斜面を越えてはみ出す (濃く)、
 * collapse は斜面より内側で段になる、badAngle は数層が斜めにずり落ちる。
 */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  fit: StageFit,
  p: DrumSetupPuzzle,
  view: DrumSetupView,
  content: Content,
): void {
  const hex = mainHex(content, p.patternId);

  // 1. 背景 (kinari) は、変換の前に Canvas の画面上の大きさで塗る
  ctx.fillStyle = COLORS.kinari;
  ctx.fillRect(0, 0, ctx.canvas.clientWidth || ctx.canvas.width, ctx.canvas.clientHeight || ctx.canvas.height);

  // 論理座標で描く: save → translate → scale
  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);

  // 2. ドラムの表面 (横に長い板) と穴の並び
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(DRUM_RECT.x, DRUM_RECT.y, DRUM_RECT.w, DRUM_RECT.h);
  ctx.fillStyle = COLORS.sumiSub;
  ctx.globalAlpha = 0.4;
  for (let x = DRUM_RECT.x + 34; x < DRUM_RECT.x + DRUM_RECT.w - 20; x += 44) {
    ctx.beginPath();
    ctx.arc(x, DRUM_RECT.y + DRUM_RECT.h / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 3. 羽 (斜面)。未選択は点線、選ぶと厚みのある板
  drawWing(ctx, view.angle);

  // 4. 帯の断面 (層を積み上げる)
  drawLayers(ctx, p, view, hex);

  // 論理座標の描画はここまで
  ctx.restore();

  // 5. 文字 (変換を戻してから画面 px で描く。20px 以上)
  ctx.fillStyle = COLORS.sumi;
  ctx.font = '20px sans-serif';
  const top = toPx(fit, TOP_TEXT);
  const angleText = view.angle !== null ? `${view.angle}°` : '未選択';
  ctx.fillText(`1回転 送り ${view.feed.toFixed(2)}mm／羽 ${angleText}`, top.x, top.y);

  if (view.showResult && view.outcome !== null) {
    const label = resultLabel(view.outcome);
    if (label !== null) {
      ctx.fillStyle = label.color;
      ctx.font = '24px sans-serif';
      const pos = toPx(fit, RESULT_TEXT);
      ctx.fillText(label.text, pos.x, pos.y);
    }
  }
}

/** 羽を描く。angle null は点線 (複数の短い線)、選んだ角度は厚みのある板 (wood の塗り) */
function drawWing(ctx: CanvasRenderingContext2D, angle: number | null): void {
  if (angle === null) {
    ctx.strokeStyle = COLORS.wood;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const dir0 = wingDir(9); // 未選択のときは中間の 9° の向きで点線を引く
    const len0 = wingLen(9);
    const dash = 14;
    const gap = 10;
    for (let d = 0; d + dash <= len0; d += dash + gap) {
      ctx.moveTo(WING_BASE.x + dir0.dx * d, WING_BASE.y + dir0.dy * d);
      ctx.lineTo(WING_BASE.x + dir0.dx * (d + dash), WING_BASE.y + dir0.dy * (d + dash));
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    return;
  }
  const dir = wingDir(angle);
  const len = wingLen(angle); // 盤面からはみ出さない長さ (T2c-03-fix 3)
  // 板の厚みの方向 (斜面に垂直。下向き)
  const nx = -dir.dy;
  const ny = dir.dx;
  ctx.fillStyle = COLORS.wood;
  ctx.beginPath();
  ctx.moveTo(WING_BASE.x, WING_BASE.y);
  ctx.lineTo(WING_BASE.x + dir.dx * len, WING_BASE.y + dir.dy * len);
  ctx.lineTo(WING_BASE.x + dir.dx * len + nx * WING_THICK_PX, WING_BASE.y + dir.dy * len + ny * WING_THICK_PX);
  ctx.lineTo(WING_BASE.x + nx * WING_THICK_PX, WING_BASE.y + ny * WING_THICK_PX);
  ctx.closePath();
  ctx.fill();
  // 板の上の縁を明るくする
  ctx.strokeStyle = COLORS.woodLight;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(WING_BASE.x, WING_BASE.y);
  ctx.lineTo(WING_BASE.x + dir.dx * len, WING_BASE.y + dir.dy * len);
  ctx.stroke();
  ctx.lineWidth = 1;
}

/** 層の1本ぶんの高さ (collapse は層のあいだに縦のすき間をあける。T2c-03-fix 4) */
const LAYER_GAP_PX = 3;

/** 層を積み上げて描く (層は羽の斜面に沿って左へ登る。T2c-04a 1) */
function drawLayers(ctx: CanvasRenderingContext2D, p: DrumSetupPuzzle, view: DrumSetupView, hex: string): void {
  if (view.angle === null) return; // 角度が未選択のときは層を描かない
  const n = Math.max(0, Math.min(TRIAL_TURNS, Math.round(view.progress * TRIAL_TURNS)));
  if (n === 0) return;
  const bad = view.outcome === 'badAngle';
  const count = bad ? Math.min(n, BAD_LAYERS) : n;
  // 層の左の端は、羽の斜面と同じ見た目の決まりで決める (T2c-03-fix 4 を左右入れ替え)
  const correct = correctFeed(p, view.angle);
  const ratio = correct > 0 ? view.feed / correct : 1;
  for (let j = 1; j <= count; j++) {
    const yTop = layerTopY(j);
    const heightPx = DRUM_RECT.y - yTop; // 表面からの高さ
    const slope = slopeXAt(heightPx, view.angle);
    const collapse = view.outcome === 'collapse';
    const height = collapse ? LAYER_H_PX - LAYER_GAP_PX : LAYER_H_PX - 1;
    let left = layerLeftEdgeX(j, view.angle, ratio); // 送り量が正しければ斜面の上
    let right = SECTION_RIGHT;
    let bulge = 0;
    if (view.outcome === 'crush') {
      // 少なすぎる:斜面より右に遅れ、ほぼ真上に積み重なる。上の層ほど左右にふくらむ (潰れて広がる)
      bulge = Math.min(j * 1.2, 40);
      left = left + bulge / 2;
    } else if (collapse) {
      // 多すぎる:左の端は斜面を越えられないので、斜面の上で止める。層のあいだにすき間と段
      left = Math.max(left, slope) + (4 + ((count - j) % 2) * 4);
    } else if (bad) {
      right = SECTION_RIGHT - j * BAD_SLIP_PX; // 左へずり落ちる
      left = slope + j * BAD_SLIP_PX;
    }
    ctx.fillStyle = hex;
    ctx.fillRect(left, yTop, right - left, height);
    if (bulge > 0) {
      // ふくらんだ (重なった) 部分を少し濃く
      ctx.fillStyle = COLORS.sumi;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(left, yTop, bulge / 2, height);
      ctx.globalAlpha = 1;
    }
  }
}

/** 結果の印の文字 (色だけに頼らず文字で出す) */
function resultLabel(outcome: TrialOutcome): { text: string; color: string } | null {
  if (outcome === 'good') return { text: 'きれいに登った', color: COLORS.ai };
  if (outcome === 'crush') return { text: '潰れ', color: COLORS.shu };
  if (outcome === 'collapse') return { text: '崩れ', color: COLORS.shu };
  return null; // badAngle の文字は操作欄 (T2c-03) で出す
}
