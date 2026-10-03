import type { RngState } from '../clock/clock';
import { nextFloat } from '../clock/clock';

/**
 * 糸切れと糸継ぎ (P2 T2-02・T2-09b・T2-13c)。ドラム巻きとビーミングで共有する。
 * すべて純粋関数。元の状態は変更しない。
 *
 * T2-09b: いちどに切れる糸は外れ方で 1〜maxThreads 本 (重ならない)。
 * T2-13c: つなぎ方は「切れた糸のあたりを1回押す」(両端の2手はやめた)。
 */
export interface BreakParams {
  checkMs: number; // 500
  rate: number; // 範囲の上を1外れるごとの確率(初級 0.01・中級 0.02・上級 0.04)
  maxChance: number; // 1回の判定の上限 0.5
  threadCount: number; // 8
  extraStep: number; // 切れる本数が 1本増える外れの量 (T2-09b)
  maxThreads: number; // いちどに切れる本数の上限 (T2-09b)
}

export type BreakState =
  | { kind: 'running'; sinceCheckMs: number }
  | {
      kind: 'broken';
      /** 切れた糸 (まだ結んでいないもの) */
      threads: number[];
      /** 結んだ糸 */
      tied: number[];
    };

/** running、sinceCheckMs 0 で始める */
export function initBreak(): BreakState {
  return { kind: 'running', sinceCheckMs: 0 };
}

/**
 * 運転中の時間経過。checkMs たまるごとに1回判定する。
 * 'broken' のときは何もしない。1回の dtMs で複数回の判定が起きてもよい。
 * tension > rangeMax のときだけ切れうる。chance = min(maxChance, rate × (tension − rangeMax))。
 * 切れる本数は「1 + floor(excess / extraStep)」(最大 maxThreads)。
 * どの糸が切れるかは乱数で決め、重ならない。
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
  let curRng = rng;
  while (since >= p.checkMs) {
    since -= p.checkMs;
    if (tension <= rangeMax) continue;
    const excess = tension - rangeMax;
    const chance = Math.min(p.maxChance, p.rate * excess);
    const [raw, next] = nextFloat(curRng);
    curRng = next;
    if (raw < chance) {
      // 切れる。本数は外れ方で決まり、どの糸かは重ならないように乱数で決める
      const count = Math.min(p.maxThreads, 1 + Math.floor(excess / p.extraStep));
      const threads: number[] = [];
      let pickRng = curRng;
      for (let i = 0; i < count; i++) {
        let [pickRaw, nextPick] = nextFloat(pickRng);
        pickRng = nextPick;
        let thread = Math.min(p.threadCount - 1, Math.floor(pickRaw * p.threadCount));
        // 重ならないように、かぶったら引き直す (最大 threadCount 回)
        let tries = 1;
        while (threads.includes(thread) && tries < p.threadCount) {
          [pickRaw, nextPick] = nextFloat(pickRng);
          pickRng = nextPick;
          thread = Math.min(p.threadCount - 1, Math.floor(pickRaw * p.threadCount));
          tries++;
        }
        if (!threads.includes(thread)) {
          threads.push(thread);
        }
      }
      return {
        state: { kind: 'broken', threads, tied: [] },
        rng: pickRng,
        broke: true,
      };
    }
  }
  const state: BreakState = { kind: 'running', sinceCheckMs: since };
  return { state, rng: curRng, broke: false };
}

/** 結びの結果 */
export type TapResult =
  | 'tiedOne' // 1本つながった (まだ切れている糸がある)
  | 'tiedAll' // 全部つながった (running に戻る)
  | 'wrongThread' // 切れていない糸 (tied も含む)
  | 'ignored'; // running のとき

/**
 * 切れた糸のあたりを押した (T2-13c: 1回押し。両端の2手はやめた)。
 * 'running' のときは 'ignored'。回数 (BreakStats) は呼び出し側が result を見て数える。
 */
export function tapThread(
  s: BreakState,
  thread: number,
): { state: BreakState; result: TapResult } {
  if (s.kind !== 'broken') {
    return { state: s, result: 'ignored' };
  }
  if (!s.threads.includes(thread)) {
    // 切れていない糸 (tied も含む)
    return { state: s, result: 'wrongThread' };
  }
  // つながる
  const tied = [...s.tied, thread];
  const left = s.threads.filter((t) => t !== thread);
  if (left.length > 0) {
    return { state: { kind: 'broken', threads: left, tied }, result: 'tiedOne' };
  }
  return { state: initBreak(), result: 'tiedAll' };
}
