/**
 * ビーム巻きの盤面の座標 (P3 T3-02。PU-15a で実物の写真に寄せて組み直した)。論理座標は幅 1000・高さ BOARD.H。
 * 奥 (上) に横に寝かせたドラム (糸の筋は縦)、そこから糸のシートが手前へ降りて、茶色のガイドの棒をくぐり、
 * 手前 (下) のビーム (銀色の軸・左右の大きな円盤・軸のまわりに太る巻き) に巻かれる。少し上から見下ろした斜めの構図。
 * cm → 論理座標の変換はこのファイルだけで行う。
 * 縦の位置は、論理の高さ H (盤面のカードの縦横の割合に合わせて setBoardHeight で決める) の割合で決まり、
 * 描いた範囲がカードの高さの 85% 以上になる。
 */

/** 盤面の論理座標の幅 */
export const BOARD_W = 1000;
/** 論理の高さの標準 (カードの割合に合わせて setBoardHeight で変わる) */
export const BOARD_H = 750;

/** 巻き幅を描く幅 (px。盤面の幅の 70%) */
export const BEAM_W_PX = 700;

/** ビームの中心の x */
export const BEAM_CENTER_X = BOARD_W / 2;

/** cm → px の倍率 (巻き幅に関係なく、巻き幅は BEAM_W_PX になる) */
export function pxPerCm(widthCm: number): number {
  return BEAM_W_PX / widthCm;
}

/** cm (ビームの中心からの距離。左は負) → 論理座標の x */
export function cmToX(widthCm: number, cm: number): number {
  return BEAM_CENTER_X + cm * pxPerCm(widthCm);
}

/** 論理座標の x → cm (cmToX の逆) */
export function xToCm(widthCm: number, x: number): number {
  return (x - BEAM_CENTER_X) / pxPerCm(widthCm);
}

/** 奥のドラム (横に寝た円筒) の x と幅 */
export const DRUM_X = 90;
export const DRUM_W = 820;

/** ビームの芯 (銀色の軸) の太さの半分 (px) */
export const CORE_R = 11;
/** 軸が円盤の外へ飛び出す長さ (px) */
export const ROD_OUT = 70;
/** 円盤 (斜めから見て楕円) の横の半径 (px) */
export const FLANGE_RX = 30;

/** 縦の位置 (論理の高さ H の割合。setBoardHeight で決まる) */
export interface BoardLayout {
  H: number;
  drumY: number; // ドラムの上端
  drumH: number; // ドラムの高さ (巻き取られて細る前)
  guideY: number; // ガイドの棒の中心
  axisY: number; // ビームの軸の中心
  flangeR: number; // 円盤の半径 (縦)
  targetY: number; // 目標の点線
}
export const BOARD: BoardLayout = { H: BOARD_H, drumY: 0, drumH: 0, guideY: 0, axisY: 0, flangeR: 0, targetY: 0 };

/** 論理の高さ H に合わせて、縦の位置を決める (同じ値なら何も変わらない) */
export function setBoardHeight(height: number): void {
  const H = Math.max(BOARD_H, height);
  BOARD.H = H;
  BOARD.drumY = H * 0.06;
  BOARD.drumH = H * 0.2;
  BOARD.guideY = H * 0.5;
  BOARD.axisY = H * 0.75;
  BOARD.flangeR = H * 0.16;
  BOARD.targetY = H * 0.93;
}
setBoardHeight(BOARD_H);

/** 巻いた糸の円筒の半径 (軸を中心に上下に同じだけ太る。progress 0 で芯、1 で円盤の半径の 8 割) */
export function woundRadius(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return CORE_R + p * (BOARD.flangeR * 0.8 - CORE_R);
}

/** 巻いた糸の円筒の上端の y (糸のシートの下の端) */
export function woundTopY(progress: number): number {
  return BOARD.axisY - woundRadius(progress);
}

/** 円盤の上端の y */
export function flangeTopY(): number {
  return BOARD.axisY - BOARD.flangeR;
}

/** 糸のシートの上端の y (ドラムの下端。ドラムは巻き取られて細るので、描くときに progress で変える) */
export function sheetTopY(progress: number): number {
  const half = (BOARD.drumH / 2) * (1 - 0.3 * Math.min(1, Math.max(0, progress)));
  return BOARD.drumY + BOARD.drumH / 2 + half;
}

/** 描いた範囲 (ドラムの上から、目標の点線の目盛りと円盤の内側の印の下まで) の上と下 (論理座標) */
export function drawnExtent(): { top: number; bottom: number } {
  return { top: BOARD.drumY, bottom: BOARD.targetY + 28 };
}

/** 円盤の当たりの幅の下限 (画面 px。押せる部品は 64px 以上) */
export const FLANGE_HIT_MIN_PX = 64;

/**
 * 論理座標の点 p が、どの円盤の当たりか (PU-15b)。当たりは円盤の縦の範囲 (軸を中心に ± 円盤の半径) で、
 * 横は ± max(円盤の楕円の半径, 画面上 32px) (縮尺 scale が小さいほど広がる)。左右が重なるときは近いほう。
 */
export function flangeHit(
  p: { x: number; y: number },
  leftCm: number,
  rightCm: number,
  widthCm: number,
  scale: number,
): 'left' | 'right' | null {
  if (Math.abs(p.y - BOARD.axisY) > BOARD.flangeR) return null;
  const halfW = Math.max(FLANGE_RX, FLANGE_HIT_MIN_PX / 2 / scale);
  const dl = Math.abs(p.x - cmToX(widthCm, leftCm));
  const dr = Math.abs(p.x - cmToX(widthCm, rightCm));
  const l = dl <= halfW;
  const r = dr <= halfW;
  if (l && r) return dl <= dr ? 'left' : 'right';
  return l ? 'left' : r ? 'right' : null;
}

/** 円盤をつかんだ位置 (startX) から指が curX まで動いたときの円盤の cm。つかんだときの cm (startCm) に動いた分を足し、1cm 単位に丸める */
export function dragCm(widthCm: number, startCm: number, startX: number, curX: number): number {
  return Math.round(startCm + (curX - startX) / pxPerCm(widthCm));
}

/** 上の設定表示の位置 (画面 px で描く) */
export const TOP_TEXT = { x: 40, y: 60 };

/** 画面の点に直す (ドラム巻きと同じ) */
export function toPx(fit: { scale: number; offsetX: number; offsetY: number }, p: { x: number; y: number }): { x: number; y: number } {
  return { x: p.x * fit.scale + fit.offsetX, y: p.y * fit.scale + fit.offsetY };
}
