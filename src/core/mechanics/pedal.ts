import type { RngState } from '../clock/clock';
import { nextFloat } from '../clock/clock';

/**
 * ペダルと張りの計算 (P2 T2-01・T2-09a)。ドラム巻きとビーミングで共有する。
 * すべて純粋関数。元の状態は変更しない。乱数は State の種から。
 */
export interface TensionParams {
  maxSpeed: number; // pedal 100 のときの速さ(長さ/秒)
  base: number; // 30
  perPedal: number; // 0.4
  yarnDrift: number; // 4(progress 0→1 で最大 +4)
  noiseAmp: number; // 2(noise は -noiseAmp〜+noiseAmp)
  noiseStepPerSec: number; // noise が1秒に動ける最大の量(例 1)
  range: { min: number; max: number }; // 適正範囲
}

/**
 * 張りの流れと引っかかりのパラメータ (T2-09a)。
 * 流れ: 帯を巻いているあいだ、張りがゆっくり一方向に動き、ときどき向きが変わる
 * (コーンの糸が減って張りが変わる様子)。
 * 引っかかり: ときどき張りが急に上がり、2秒かけて元に戻る。
 */
export interface DriftParams {
  perSec: number; // 流れが1秒に動く上限
  turnRate: number; // 1秒あたり、向きが変わる確率
  max: number; // 流れの大きさの上限 (±)
  snagRate: number; // 1秒あたり、引っかかりが起きる確率
  snagSize: number; // 引っかかりで上がる量
}

export interface PedalState {
  pedal: number; // 0〜100(整数に丸めない)
  noise: number; // -noiseAmp〜+noiseAmp
  drift: number; // 流れ (-max〜+max。T2-09a)
  snag: number; // 引っかかりで今上がっている量 (0〜snagSize。T2-09a)
  rng: RngState;
}

/** pedal 0、noise 0、流れ 0、引っかかりなしで始める */
export function initPedal(seed: RngState): PedalState {
  return { pedal: 0, noise: 0, drift: 0, snag: 0, rng: seed };
}

/** 0〜100 に丸める (元の状態は変更しない) */
export function setPedal(s: PedalState, value: number): PedalState {
  const pedal = Math.min(100, Math.max(0, value));
  return { ...s, pedal };
}

/** pedal / 100 × maxSpeed (pedal 0 で停止) */
export function speedOf(s: PedalState, p: TensionParams): number {
  return (s.pedal / 100) * p.maxSpeed;
}

/**
 * 張り = base + perPedal × pedal + yarnDrift × progress + noise + 流れ + 引っかかり (T2-09a)。
 * progress は 0〜1 に丸める。
 */
export function tensionOf(s: PedalState, p: TensionParams, progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return p.base + p.perPedal * s.pedal + p.yarnDrift * clamped + s.noise + s.drift + s.snag;
}

/**
 * 乱数で noise を少し動かす。
 * 1回の変化は noiseStepPerSec × dtMs/1000 以内。範囲 (-noiseAmp〜+noiseAmp) の外に出ない。
 */
export function stepNoise(s: PedalState, p: TensionParams, dtMs: number): PedalState {
  const maxDelta = p.noiseStepPerSec * (dtMs / 1000);
  const [raw, next] = nextFloat(s.rng);
  const delta = (raw * 2 - 1) * maxDelta;
  const noise = Math.min(p.noiseAmp, Math.max(-p.noiseAmp, s.noise + delta));
  return { ...s, noise, rng: next };
}

/**
 * 張りの流れを 1フレーム進める (T2-09a)。
 * 流れは dtSec 秒で最大 perSec × dtSec 動く (向きは今の drift の符号)。
 * 向きが変わる確率は turnRate × dtSec (乱数で決める)。
 * 大きさは ±max を超えない。
 */
export function stepDrift(s: PedalState, p: DriftParams, dtMs: number): PedalState {
  const dtSec = Math.max(0, dtMs) / 1000;
  let [raw, next] = nextFloat(s.rng);
  // 動く向き (+1 / -1)。drift が 0 (はじまり) のときだけ乱数で決める
  let dir: number;
  if (s.drift === 0) {
    dir = raw < 0.5 ? 1 : -1;
    [raw, next] = nextFloat(next);
  } else {
    dir = s.drift > 0 ? 1 : -1;
  }
  // 向きが変わるか (1秒あたり turnRate の確率)。変わったら動く向きだけが反転する
  // (drift は 0 を通って連続に動くので、1フレームの動きは perSec × dtSec 以内)
  if (raw < p.turnRate * dtSec) {
    dir = -dir;
  }
  const nextDrift = s.drift + dir * p.perSec * dtSec;
  const clamped = Math.min(p.max, Math.max(-p.max, nextDrift));
  return { ...s, drift: clamped, rng: next };
}

/**
 * 引っかかりを 1フレーム進める (T2-09a)。
 * snagRate × dtSec の確率で、張りが snagSize 上がる (上がった瞬間の量は raised で返す)。
 * 上がった量は 2秒 (SNAG_RECOVER_MS) かけて 0 に戻る。
 */
export const SNAG_RECOVER_MS = 2000;

export function stepSnag(
  s: PedalState,
  p: DriftParams,
  dtMs: number,
): { state: PedalState; raised: number } {
  const dtSec = Math.max(0, dtMs) / 1000;
  let cur = s;
  let raised = 0;
  const [raw, next] = nextFloat(cur.rng);
  cur = { ...cur, rng: next };
  if (raw < p.snagRate * dtSec && cur.snag <= 0) {
    cur = { ...cur, snag: p.snagSize };
    raised = p.snagSize;
  }
  // 戻る (2秒かけて 0 へ)
  if (cur.snag > 0) {
    const down = (p.snagSize / SNAG_RECOVER_MS) * Math.max(0, dtMs);
    cur = { ...cur, snag: Math.max(0, cur.snag - down) };
  }
  return { state: cur, raised };
}

/** 張りが適正範囲の下か中か上か */
export function zoneOf(tension: number, p: TensionParams): 'low' | 'ok' | 'high' {
  if (tension < p.range.min) return 'low';
  if (tension > p.range.max) return 'high';
  return 'ok';
}
