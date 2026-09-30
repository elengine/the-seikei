import type { RngState } from '../clock/clock';
import { nextFloat } from '../clock/clock';

/**
 * ペダルと張りの計算 (P2 T2-01)。ドラム巻きとビーミングで共有する。
 * すべて純粋関数。元の状態は変更しない。
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

export interface PedalState {
  pedal: number; // 0〜100(整数に丸めない)
  noise: number; // -noiseAmp〜+noiseAmp
  rng: RngState;
}

/** pedal 0、noise 0 で始める */
export function initPedal(seed: RngState): PedalState {
  return { pedal: 0, noise: 0, rng: seed };
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

/** base + perPedal × pedal + yarnDrift × clamp(progress, 0, 1) + noise */
export function tensionOf(s: PedalState, p: TensionParams, progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return p.base + p.perPedal * s.pedal + p.yarnDrift * clamped + s.noise;
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

/** 張りが適正範囲の下か中か上か */
export function zoneOf(tension: number, p: TensionParams): 'low' | 'ok' | 'high' {
  if (tension < p.range.min) return 'low';
  if (tension > p.range.max) return 'high';
  return 'ok';
}
