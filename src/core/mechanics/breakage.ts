import type { RngState } from '../clock/clock';
import { nextFloat } from '../clock/clock';

/**
 * 糸切れと糸継ぎ (P2 T2-02)。ドラム巻きとビーミングで共有する。
 * すべて純粋関数。元の状態は変更しない。
 */
export interface BreakParams {
  checkMs: number; // 500
  rate: number; // 範囲の上を1外れるごとの確率(初級 0.01・中級 0.02・上級 0.04)
  maxChance: number; // 1回の判定の上限 0.5
  threadCount: number; // 8
}

export type BreakState =
  | { kind: 'running'; sinceCheckMs: number }
  | { kind: 'broken'; thread: number; firstTapped: boolean };

/** running、sinceCheckMs 0 で始める */
export function initBreak(): BreakState {
  return { kind: 'running', sinceCheckMs: 0 };
}

/**
 * 運転中の時間経過。checkMs たまるごとに1回判定する。
 * 'broken' のときは何もしない。1回の dtMs で複数回の判定が起きてもよい。
 * tension > rangeMax のときだけ切れうる。chance = min(maxChance, rate × (tension − rangeMax))。
 */
export function stepBreak(
  s: BreakState,
  p: BreakParams,
  dtMs: number,
  tension: number,
  rangeMax: number,
  rng: RngState,
): { state: BreakState; rng: RngState; broke: boolean } {
  if (s.kind !== 'running') {
    return { state: s, rng, broke: false };
  }
  let since = s.sinceCheckMs + dtMs;
  let state: BreakState = { kind: 'running', sinceCheckMs: since };
  let curRng = rng;
  while (since >= p.checkMs) {
    since -= p.checkMs;
    if (tension <= rangeMax) continue;
    const chance = Math.min(p.maxChance, p.rate * (tension - rangeMax));
    const [raw, next] = nextFloat(curRng);
    curRng = next;
    if (raw < chance) {
      const [tRaw, tNext] = nextFloat(curRng);
      curRng = tNext;
      const thread = Math.min(p.threadCount - 1, Math.floor(tRaw * p.threadCount));
      return { state: { kind: 'broken', thread, firstTapped: false }, rng: curRng, broke: true };
    }
  }
  state = { kind: 'running', sinceCheckMs: since };
  return { state, rng: curRng, broke: false };
}

/**
 * 切れ端をタップした。side は 'creel'(クリール側)か 'drum'(ドラム側)。
 * 'running' のときは 'ignored'。回数 (BreakStats) は呼び出し側が result を見て数える。
 */
export function tapEnd(
  s: BreakState,
  thread: number,
  side: 'creel' | 'drum',
): { state: BreakState; result: 'first' | 'tied' | 'wrongThread' | 'retry' | 'ignored' } {
  if (s.kind !== 'broken') {
    return { state: s, result: 'ignored' };
  }
  if (thread !== s.thread) {
    // 違う糸。1手目を済ませていても、1手目からやり直し
    return { state: { kind: 'broken', thread: s.thread, firstTapped: false }, result: 'wrongThread' };
  }
  if (side === 'creel') {
    // 切れた糸のクリール側。1手目 (済ませていてもそのまま)
    return { state: { kind: 'broken', thread: s.thread, firstTapped: true }, result: 'first' };
  }
  // 切れた糸のドラム側
  if (!s.firstTapped) {
    // 先にクリール側を押す。状態はそのまま
    return { state: s, result: 'retry' };
  }
  return { state: initBreak(), result: 'tied' };
}
