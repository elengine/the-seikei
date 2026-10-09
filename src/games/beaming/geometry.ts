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
/**
 * 軸の両端の x (固定。盤面に対していつも同じ。PU-24a)。円盤の位置を左右に動かして巻き幅を合わせる仕組みなので、
 * 軸の長さは変えない。いちばん広い巻き幅の円盤の外まで届く。円盤だけが軸の上を動く。
 */
export const ROD_X0 = 40;
export const ROD_X1 = BOARD_W - 40;
/** ドラムを少し斜めから見たときの、端の楕円の横の半径 (px)。右の端の面だけが見える (ドラム巻きと同じ構図。PU-24a) */
export const DRUM_TILT_RX = 30;

/**
 * ドラムの糸の筋 (円周の線) の x。軸の位置 xs の円周は、斜めから見ると楕円の左半分 (「(」の形) に見える:
 * t = −1〜1 (下から上へ) で、真ん中 (t=0) は xs より DRUM_TILT_RX だけ左へふくらみ、上下の端 (t=±1) は xs。
 */
export function drumArcX(xs: number, t: number): number {
  return xs - DRUM_TILT_RX * Math.sqrt(Math.max(0, 1 - t * t));
}
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
  // 実物はビームよりドラムのほうが大きい: ドラムの直径 (drumH) は円盤の直径 (2 × flangeR) の 1.5 倍以上 (PU-26)。
  // ドラムの上には、ランプ (外側の輪まで半径 最大 42 × 1.3) を置く空きをあける (PU-26 追加修正)
  BOARD.drumY = H * 0.15;
  BOARD.drumH = H * 0.36;
  BOARD.guideY = H * 0.6;
  BOARD.axisY = H * 0.8;
  BOARD.flangeR = H * 0.115;
  BOARD.targetY = H * 0.96;
}
setBoardHeight(BOARD_H);

/**
 * 速さの木の棒 (PU-24b。PU-27 のレバーは PU-28 で木の棒に戻した)。ガイドの棒の位置 (BOARD.guideY) に、ドラムの幅くらいの長い横の木の棒を置き、
 * 指で左右に引っぱって速さを 0〜100 に変える。速さ 0 で棒の真ん中が盤面の中心より SPEED_BAR_SHIFT_MAX だけ左 (止まる位置)、
 * 100 で同じだけ右。棒全体が動く (棒は指と同じだけ動く)。
 */
export const SPEED_BAR_SHIFT_MAX = 100;
/** 棒の長さ (px。固定) */
export const SPEED_BAR_W = DRUM_W - 80;
/** 当たりの上下の幅の下限 (棒の中心から ± px。合わせて 64px 以上。縮尺が小さいときは画面上 ±32px になるよう広げる) */
const SPEED_BAR_HIT_HALF_H = 32;

/** 速さ (0〜100) に対する、棒の真ん中の x */
export function speedBarCenterX(speed: number): number {
  const v = Math.min(100, Math.max(0, speed));
  return BOARD_W / 2 - SPEED_BAR_SHIFT_MAX + (v / 100) * 2 * SPEED_BAR_SHIFT_MAX;
}

/** 引っぱり始めの速さ startSpeed から、指が dx (論理の px) 動いたときの速さ (0〜100 の整数に丸める) */
export function speedFromBarDrag(startSpeed: number, dx: number): number {
  const v = startSpeed + (dx / (2 * SPEED_BAR_SHIFT_MAX)) * 100;
  return Math.min(100, Math.max(0, Math.round(v)));
}

/** 棒の当たり判定: 今の速さの位置にある棒の上下 32px (画面上 64px 以上。縮尺 scale が小さいときは画面上 ±32px になるよう広げる)、横は棒の長さ */
export function hitSpeedBar(p: { x: number; y: number }, speed: number, scale = 1): boolean {
  const halfH = Math.max(SPEED_BAR_HIT_HALF_H, SPEED_BAR_HIT_HALF_H / scale);
  return Math.abs(p.y - BOARD.guideY) <= halfH && Math.abs(p.x - speedBarCenterX(speed)) <= SPEED_BAR_W / 2;
}


/**
 * 糸を付ける前 (setup・attach) に、ドラムの下の端から短く垂れた糸のシートの下の端の y (PU-26 追加修正)。
 * 垂れる長さは、ドラムの下の端からガイドの棒までの 4 割 (半分以下)。ビームには届かない。
 */
export function sheetDropEndY(progress: number): number {
  const top = sheetTopY(progress);
  return top + (BOARD.guideY - top) * 0.4;
}

/** 糸の束の先の木の棒が、束の幅より左右に長い分 (px。PU-27) */
export const THREAD_BAR_MARGIN = 24;

/** 木の棒の横の範囲 (束の幅 + 左右 THREAD_BAR_MARGIN。中心は盤面の中心) */
export function threadBarRange(widthCm: number): { x0: number; x1: number } {
  const half = (widthCm * pxPerCm(widthCm)) / 2 + THREAD_BAR_MARGIN;
  return { x0: BEAM_CENTER_X - half, x1: BEAM_CENTER_X + half };
}

/** 棒の y を、動ける範囲 (垂れた位置〜ビームの軸) に収める */
export function clampThreadBarY(y: number, progress: number): number {
  return Math.min(BOARD.axisY, Math.max(sheetDropEndY(progress), y));
}

/** 離したとき糸が付く y: 巻いた糸の円筒の上の端から上へ 32px。これより下で離すと付く (PU-27) */
export function threadAttachY(progress: number): number {
  return BOARD.axisY - woundRadius(progress) - 32;
}

/**
 * 押さえる所: 糸の束の先の木の棒 (barY。省くと垂れた位置) と束。横は棒の長さ、縦は束の上端から棒の下 32px まで
 * (棒の上下 32px ずつ = 画面上 64px 以上。束の途中を押さえても棒をつかんだことにする。T3-06・PU-27)
 */
export function hitSheetEdge(p: { x: number; y: number }, widthCm: number, progress: number, barY: number = sheetDropEndY(progress)): boolean {
  const r = threadBarRange(widthCm);
  return p.x >= r.x0 && p.x <= r.x1 && p.y >= sheetTopY(progress) && p.y <= barY + 32;
}

/** 離してよい所: ビームの軸と巻いた糸の円筒。円盤の間で、上下 32px の余裕 (T3-06) */
export function hitBeamWind(
  p: { x: number; y: number },
  s: { widthCm: number; leftCm: number; rightCm: number; progress: number },
): boolean {
  const { widthCm, progress } = s;
  const leftX = cmToX(widthCm, s.leftCm); // 実際の円盤の位置 (目標の巻き幅ではない。PU-26)
  const rightX = cmToX(widthCm, s.rightCm);
  return p.x > leftX && p.x < rightX && Math.abs(p.y - BOARD.axisY) <= woundRadius(progress) + 32;
}

/** 張りのランプ (ドラムの上の空き。ドラムの胴に重ならない。ドラム巻きと同じ考え。T3-06 追記・PU-26) */
export function lampX(): number {
  return BOARD_W * 0.2;
}
export function lampY(): number {
  return BOARD.drumY * 0.5;
}
/** ランプの半径 (論理)。ドラム巻きの lampGeometry と同じ決め方: 画面上 16px 以上になるよう縮尺で変え、22〜42 に収める (PU-26 追加修正) */
export function lampR(scale: number): number {
  return Math.min(42, Math.max(22, 16 / scale));
}
export function hitLamp(p: { x: number; y: number }): boolean {
  return Math.hypot(p.x - lampX(), p.y - lampY()) <= 36;
}

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

/** 描いた範囲 (ドラムの上の張りのランプの輪から、目標の点線の目盛りと円盤の内側の印の下まで) の上と下 (論理座標。ランプは最小の半径 22 の輪で数える) */
export function drawnExtent(): { top: number; bottom: number } {
  return { top: lampY() - 22 * 1.3, bottom: BOARD.targetY + 28 };
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
