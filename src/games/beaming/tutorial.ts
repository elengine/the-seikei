import type { TutorialSpec } from '../../core/game/types';
import { COLORS } from '../../core/ui/tokens';
import { getContent } from '../../core/content/content';
import { BOARD, BOARD_W, BEAM_CENTER_X, FLANGE_RX, cmToX, toPx } from './geometry';
import { drawBoard } from './renderer';
import { init, reduce } from './logic';
import type { BeamingState } from './logic';

/**
 * ビーム巻きの遊び方 (P3 T3-03b)。3ページ、文は大人向け。
 * 絵は盤面と同じ作り (奥に横に寝たドラム・ガイドの棒・手前に銀色の軸と左右の円盤)。
 * 文の {{…}} は表示側で terms.render により呼び名に置き換わる。
 */

/** 文字を描く (画面上 20px 以上) */
function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillStyle = COLORS.sumi;
  ctx.font = '20px sans-serif';
  ctx.fillText(text, x, y);
}

/** 絵に使う盤面の状態 (柄は無地の紺。糸を付ける段階までを、本物の遊びと同じ決まりで進める) */
function sketchState(phase: 'setup' | 'attach' | 'beaming', over?: Partial<BeamingState>): BeamingState {
  let s = init({ level: 1, widthCm: 60, seed: 1, puzzleId: 'tutorial', patternId: 'p-muji-kon' });
  if (phase !== 'setup') {
    s = reduce(s, { type: 'moveFlange', side: 'left', deltaCm: -30 - s.leftCm });
    s = reduce(s, { type: 'moveFlange', side: 'right', deltaCm: 30 - s.rightCm });
    s = reduce(s, { type: 'finishSetup' });
  }
  if (phase === 'beaming') {
    s = reduce(s, { type: 'attachThread' });
  }
  return over !== undefined ? { ...s, ...over } : s;
}

/** 盤面を本物の描画 (drawBoard。ドラム・糸のシート・棒・ビームと円盤) で描く。上の 82% に収め、下は説明の帯のために空ける。画面の点に直す関数を返す */
function drawBoardSketch(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: BeamingState,
  threadDrag: { x: number; y: number } | null = null,
  lever: { active: boolean } = { active: false },
): (x: number, y: number) => { x: number; y: number } {
  const areaH = h * 0.82;
  const scale = Math.min(w / BOARD_W, areaH / BOARD.H);
  const fit = { scale, offsetX: (w - BOARD_W * scale) / 2, offsetY: (areaH - BOARD.H * scale) / 2 };
  drawBoard(ctx, fit, s, getContent(), 0, threadDrag, 0, lever);
  return (x, y) => toPx(fit, { x, y });
}

/** 1ページ目: 幅合わせ (円盤を絵の上で引っぱって巻き幅に合わせる) */
export function drawPage1(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const P = drawBoardSketch(ctx, w, h, sketchState('setup'));
  const label = P(BEAM_CENTER_X - 110, BOARD.axisY - BOARD.flangeR - 14);
  drawText(ctx, '円盤を引っぱる', label.x, label.y);
}

/** 2ページ目: 垂れた糸の端を、指でビームまで引っぱる (糸の帯が指の位置までのびる) */
export function drawPage2(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const finger = { x: BEAM_CENTER_X + 80, y: BOARD.axisY - 20 };
  const P = drawBoardSketch(ctx, w, h, sketchState('attach'), finger);
  // 指の位置の丸
  const f = P(finger.x, finger.y);
  ctx.fillStyle = COLORS.ai;
  ctx.beginPath();
  ctx.arc(f.x, f.y, 10, 0, Math.PI * 2);
  ctx.fill();
  const label = P(finger.x + 150, finger.y - 30); // 糸の帯と重ならない右
  drawText(ctx, '引っぱる', label.x, label.y);
}

/** 速さのメーター (緑の範囲の帯と針) を描く (操作欄のメーターと同じ形。盤面の絵の下の帯)。T3-07 で見出しは速さ */
function drawMeter(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const mX = w * 0.24;
  const mW = w * 0.52;
  const mY = h * 0.86;
  ctx.fillStyle = COLORS.kinariDeep;
  ctx.fillRect(mX, mY, mW, h * 0.05);
  ctx.fillStyle = COLORS.lampOk;
  ctx.fillRect(mX + mW * 0.45, mY, mW * 0.25, h * 0.05); // 緑の範囲 (巻き量で動く)
  ctx.fillStyle = COLORS.sumi;
  ctx.fillRect(mX + mW * 0.6, mY - h * 0.012, 4, h * 0.074); // 針
  ctx.strokeStyle = COLORS.steel;
  ctx.strokeRect(mX, mY, mW, h * 0.05);
}

/** 3ページ目: 速さの木の棒 (右へ引っぱる) と速さのランプ・速さのメーター (緑の範囲は巻き量で動く)。T3-07 で張りを速さに変えた */
export function drawPage3(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // 速さの木の棒 (止まっている左端の位置)。右へ引っぱると速くなる
  drawBoardSketch(ctx, w, h, sketchState('beaming', { progress: 0.4, speed: 0 }));
  drawMeter(ctx, w, h);
  drawText(ctx, '速さのメーター', w * 0.32, h * 0.84); // T3-07 で見出しは速さ
}

/** 4ページ目: 止めて完了 (棒は左端・完了のボタンと 100% の目印) */
export function drawPage4(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const P = drawBoardSketch(ctx, w, h, sketchState('beaming', { progress: 0.97, speed: 0 }));
  // 100% ちょうどの目印 (巻いた糸の円筒の右の端)
  const top = P(cmToX(60, 30) + FLANGE_RX + 10, BOARD.axisY - BOARD.flangeR);
  const bottom = P(cmToX(60, 30) + FLANGE_RX + 10, BOARD.axisY + BOARD.flangeR);
  ctx.fillStyle = COLORS.shu;
  ctx.fillRect(top.x, top.y, 4, bottom.y - top.y);
  drawText(ctx, '100%', top.x - 24, top.y - 8);
  // 完了のボタン (95% を超えたら止めて完了する)
  const cX = w * 0.62;
  const cY = h * 0.9;
  ctx.fillStyle = COLORS.ai;
  ctx.fillRect(cX, cY - h * 0.035, w * 0.2, h * 0.07);
  ctx.fillStyle = COLORS.white; // 紺のボタンの上の文字は白
  drawText(ctx, '完了', cX + w * 0.1, cY + h * 0.018);
}

export const beamingTutorial: TutorialSpec = {
  pages: [
    {
      draw: (ctx, w, h) => drawPage1(ctx, w, h),
      text: 'ビームの両端の円盤を左右に動かして、目標値に合わせます。合わせたら『円盤調整完了』を押します', // 文は PU-29 で変えた
    },
    {
      draw: (ctx, w, h) => drawPage2(ctx, w, h),
      text: 'ドラムの糸の束の先の木の棒を、指でビームまで引っぱって離すと、糸がビームに付きます',
    },
    {
      draw: (ctx, w, h) => drawPage3(ctx, w, h),
      text: '木の棒を右へ引っぱると巻き始めます。速さのメーターの針を緑の範囲に入れるように、木の棒を動かします。緑の範囲は、巻き量に合わせて動きます', // T3-07 で変えた
    },
    {
      draw: (ctx, w, h) => drawPage4(ctx, w, h),
      text: '巻き量が 90% を超えると、緑の範囲がいちばん左まで広がり、いつでも止められます。95% を超えたら、木の棒を左端まで戻して止め、『完了』を押します。100% で止めるといちばんよい結果です。100.1% に届くと糸が切れます',
    },
  ],
};
