import { SPINDLES } from './params';

/**
 * 糸割りの盤面の座標 (P2b T2b-02)。論理座標 1000×750。
 * お父さんの使っていたワインダーを正面から描く。緑の枠の横に長い台があり、
 * 口 (元の糸を立てる上の段と、銀色の胴の下の段) が横一列に SPINDLES (12) 個並ぶ。
 * 画面が狭いとき (1つの口の幅が画面上 64px 未満) は 6口ずつ2段にする。
 * 左には箱 (まだかけていない元の糸) とはかり、右上にメーター。
 */

/** 盤面の論理座標 */
export const BOARD_W = 1000;
export const BOARD_H = 750;

/** ワインダーの台 (緑の枠。口はこの中に並ぶ) */
export const MACHINE = { x: 185, y: 140, w: 795, h: 575 };

/** 段ボール箱 (まだかけていない元の糸) */
export const BOX = { x: 15, y: 330, w: 155, h: 210 };

/** 上皿はかり (左下) */
export const SCALE = { x: 25, y: 590, w: 135, h: 95 };

/** メーター (機械の右上。丸い目盛り盤) */
export const METER = { cx: 855, cy: 80, r: 55 };

/** メーターは1周 1,000m */
export const METER_FULL_M = 1000;

/** 1つの口の幅の画面上の最小 (px)。これより狭いと 2段にする */
export const SPINDLE_MIN_PX = 64;

/** 狭い画面のときの1段の口の数 */
export const LANES_PER_ROW_NARROW = 6;

/** 口を画面に描くときの幅 (画面 px)。広い形の1口の幅 */
export function laneScreenW(scale: number): number {
  return (MACHINE.w / SPINDLES) * scale;
}

/** 狭い画面か (広い形の1口の幅が SPINDLE_MIN_PX 未満のとき) */
export function needsTwoRows(laneScreenPx: number): boolean {
  return laneScreenPx < SPINDLE_MIN_PX;
}

/** 1段に並ぶ口の数 */
export function lanesPerRow(narrow: boolean): number {
  return narrow ? LANES_PER_ROW_NARROW : SPINDLES;
}

/** 口の段 (狭い画面では2段。0 が1段目) */
export function bandOf(i: number, narrow: boolean): number {
  return narrow ? Math.floor(i / LANES_PER_ROW_NARROW) : 0;
}

/** 段の上端の y */
export function bandY(band: number, narrow: boolean): number {
  return narrow ? MACHINE.y + band * 287 : MACHINE.y;
}

/** 口の列 (x と幅) */
export interface LaneRect {
  x: number;
  w: number;
}

/** 口の列の x と幅 */
export function laneRect(i: number, narrow: boolean): LaneRect {
  const w = MACHINE.w / lanesPerRow(narrow);
  return { x: MACHINE.x + (i % lanesPerRow(narrow)) * w, w };
}

/** 上の段の糸の底の y (チーズ・コーンはここに立つ) */
export function yarnBaseY(i: number, narrow: boolean): number {
  return bandY(bandOf(i, narrow), narrow) + (narrow ? 115 : 210);
}

/** 下の段の銀色の胴の上端の y */
export function bodyTopY(i: number, narrow: boolean): number {
  return yarnBaseY(i, narrow) + (narrow ? 35 : 60);
}

/** 銀色の胴の高さ */
export function bodyH(i: number, narrow: boolean): number {
  return narrow ? 75 : 110;
}

/** 上の糸の高さ (px)。ratio は残りの長さの比 (0〜1)。細った糸も台の上に小さく立つ */
export function cheeseH(ratio: number, narrow: boolean): number {
  const min = narrow ? 28 : 44;
  const max = narrow ? 100 : 150;
  return min + (max - min) * Math.min(1, Math.max(0, ratio));
}

/** 口の当たり判定 (1つの口の列全体。上の段から下の段・数字まで) */
export interface LaneArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 口の当たり判定 */
export function laneArea(i: number, narrow: boolean): LaneArea {
  const lane = laneRect(i, narrow);
  const band = bandY(bandOf(i, narrow), narrow);
  const top = yarnBaseY(i, narrow) - cheeseH(1, narrow) - 12;
  const bottom = narrow ? band + 282 : bodyTopY(i, narrow) + bodyH(i, narrow) + 78;
  return { x: lane.x, y: top, w: lane.w, h: bottom - top };
}

/** 糸の数字の y (画面 px に直す前の論理座標) */
export function laneTextY(i: number, narrow: boolean): number {
  return bodyTopY(i, narrow) + bodyH(i, narrow) + (narrow ? 26 : 32);
}

/** 口の番号の y */
export function laneNumY(i: number, narrow: boolean): number {
  return laneTextY(i, narrow) + (narrow ? 26 : 34);
}

/** メーターの針の向き (ラジアン。0 m で上、時計回り) */
export function meterAngle(meters: number): number {
  const ratio = ((meters % METER_FULL_M) + METER_FULL_M) % METER_FULL_M / METER_FULL_M;
  return ratio * Math.PI * 2 - Math.PI / 2;
}

/** メーターの周の数 */
export function meterLaps(meters: number): number {
  return Math.floor(Math.max(0, meters) / METER_FULL_M);
}

/** 3桁ごとにカンマ (6000 → '6,000')。メーターなどの数字の表示 */
export function fmtM(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** 口ごとの設定の表示 (「6,000 m」「4,200 + 1,800 m」「— m」) */
export function laneLengthText(sp: { segments: { lengthM: number }[] }): string {
  if (sp.segments.length === 0) return '— m';
  return sp.segments.map((seg) => fmtM(seg.lengthM)).join(' + ') + ' m';
}

/** 巻いている回のメーターの進み (m)。いちばん長い口の設定 × progress */
export function meterMeters(s: { phase: string; progress: number; spindles: { segments: { lengthM: number }[] }[] }): number {
  const max = Math.max(0, ...s.spindles.map((sp) => sp.segments.reduce((a, seg) => a + seg.lengthM, 0)));
  return max * Math.min(1, Math.max(0, s.progress));
}

/** 画面の点に直す (ドラム巻きと同じ) */
export function toPx(fit: { scale: number; offsetX: number; offsetY: number }, p: { x: number; y: number }): { x: number; y: number } {
  return { x: p.x * fit.scale + fit.offsetX, y: p.y * fit.scale + fit.offsetY };
}

/** 口の絵で使う値 (巻いている回は上の糸が細り、下のコーンが太る。renderer と共用) */
export interface LaneView {
  lane: { x: number; w: number };
  baseY: number;
  top: number;
  h: number;
  /** 上の糸の高さの比 (0〜1)。残りの長さに比例 */
  yarnRatio: number;
  /** 下のコーンに巻けた比 (0〜1)。設定した長さに比例 */
  coneRatio: number;
  /** 口の設定の合計 (m) */
  totalLen: number;
  cx: number;
}

/** 口の絵で使う値を出す。maxLen は糸のいちばん長いもの (m) */
export function laneView(
  s: { phase: string; progress: number; spindles: { segments: { sourceId: string; lengthM: number }[] }[]; remaining: Record<string, number> },
  lens: number[],
  i: number,
  narrow: boolean,
): LaneView {
  const lane = laneRect(i, narrow);
  const sp = s.spindles[i]!;
  const maxLen = Math.max(...lens, 1);
  let yarnRatio = 1;
  let totalLen = 0;
  for (const seg of sp.segments) {
    totalLen += seg.lengthM;
    const left = s.phase === 'winding' ? (s.remaining[seg.sourceId] ?? 0) - seg.lengthM * s.progress : (s.remaining[seg.sourceId] ?? 0);
    yarnRatio = Math.min(yarnRatio, left / maxLen);
  }
  const coneRatio = Math.min(1, totalLen / 10000) * (s.phase === 'setup' ? 0 : Math.min(1, Math.max(0, s.progress)));
  return {
    lane, baseY: yarnBaseY(i, narrow), top: bodyTopY(i, narrow), h: bodyH(i, narrow),
    yarnRatio, coneRatio, totalLen, cx: lane.x + lane.w / 2,
  };
}
