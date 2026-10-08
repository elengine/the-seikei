/**
 * ドラム巻きの張りの揺れとスパイク、適正範囲づくり (T2-20 追加修正で logic.ts から分けた)。
 * 張り = ペダルの位置 + 揺れの量 + スパイクの量 (T2-20a)。
 */

import type { RngState } from '../../core/clock/clock';
import { nextFloat } from '../../core/clock/clock';
import {
  RANGE_WIDTH, RANGE_CENTER, RANGE_SHIFT_ON_SECTION, RANGE_REACHABLE,
  WOBBLE_START_DELAY_MS, WOBBLE_RISE_MIN_MS, WOBBLE_RISE_MAX_MS, WOBBLE_FALL_MIN_MS, WOBBLE_FALL_MAX_MS,
  WOBBLE_GAP_MIN_MS, WOBBLE_GAP_MAX_MS, WOBBLE_UP_RATIO, WOBBLE_MAG_MIN, WOBBLE_HOLD_MIN_MS, WOBBLE_HOLD_MAX_MS,
  SPIKE_RISE_MS, SPIKE_FALL_MS, SPIKE_QTY_MIN, SPIKE_QTY_MAX, SPIKE_RELIEF, SPIKE_GAP_MS, SPIKE_COUNT_RANGE,
} from './params';
import type { Level } from './params';

/** 適正範囲 + この帯で起こすスパイクの回数 (T2-20b: 制限時間の計算に使う) */
export interface RangeWithSpikes {
  center: number;
  width: number;
  min: number;
  max: number;
  spikes: number;
}

/** 揺れの状態 (T2-20a)。量 (qty) は 0 から始まり、峰 (mag) まで上がって 0 に戻る */
export interface WobbleState {
  qty: number;
  dir: 1 | -1;
  /** 峰の大きさ (範囲の幅の半分 × 40〜100%) */
  mag: number;
  riseMs: number;
  fallMs: number;
  phase: 'gap' | 'up' | 'hold' | 'down';
  /** 峰で止まる時間 (ms。phase 'hold' で使う。T2-22 追加修正2・案A) */
  holdMs: number;
  timerMs: number;
  /** 次の揺れまでのあいだ (1〜3 秒)。phase 'gap' で timerMs がこれを超えると揺れが始まる */
  gapMs: number;
}

/** スパイクの状態 (T2-20a)。qty は今の量 (0 = 無し)。target まで 0.5 秒で上がる */
export interface SpikeState {
  qty: number;
  target: number;
  /** スパイクが起きたときのペダルの位置 (ここより SPIKE_RELIEF 下げると戻る) */
  pedalAtStart: number;
  /** スパイクが起きてからの時間 (ms)。SPIKE_GRACE_MS を過ぎると切れる */
  elapsedMs: number;
  /** 戻っている最後の経過時間 (ms)。-1 は戻っていない */
  fallingMs: number;
}

/** この帯で起こすスパイクの予定 (T2-20a)。left は残り回数、atMs は帯の始まりからの予定時刻 */
export interface SpikePlan {
  left: number;
  atMs: number;
}

/** 揺れまでのあいだを乱数で決める (1〜3 秒) */
function nextGapMs(rng: RngState): { ms: number; rng: RngState } {
  const [raw, next] = nextFloat(rng);
  return { ms: WOBBLE_GAP_MIN_MS + (WOBBLE_GAP_MAX_MS - WOBBLE_GAP_MIN_MS) * raw, rng: next };
}

/** 揺れを初期化する (量 0・あいだを乱数で決める) */
export function resetWobble(rng: RngState): { wobble: WobbleState; rng: RngState } {
  const g = nextGapMs(rng);
  return { wobble: { qty: 0, dir: 1, mag: 0, riseMs: 0, fallMs: 0, phase: 'gap', holdMs: 0, timerMs: 0, gapMs: g.ms }, rng: g.rng };
}

/** スパイクを初期化する (量 0) */
export function resetSpike(): SpikeState {
  return { qty: 0, target: 0, pedalAtStart: 0, elapsedMs: 0, fallingMs: -1 };
}

/** 帯のスパイクの予定を作る (回数ははじめに決めた範囲のもの。最初の時刻は 3〜5 秒のあとを乱数で) */
export function planSpikes(range: RangeWithSpikes, rng: RngState): { plan: SpikePlan; rng: RngState } {
  const [r1, r2] = nextFloat(rng);
  const atMs = WOBBLE_START_DELAY_MS + 2000 * r1;
  return { plan: { left: range.spikes, atMs }, rng: r2 };
}

/** 揺れを 1 tick 進める (T2-20a)。ペダルが範囲の外なら揺れない (量を 0 に戻す) */
export function stepWobble(
  w: WobbleState, rng: RngState, pedalPos: number, range: { min: number; max: number }, dtMs: number,
): { wobble: WobbleState; rng: RngState } {
  const limit = (range.max - range.min) / 2; // 揺れの限界 = 範囲の幅の半分
  if (pedalPos < range.min - 1e-9 || pedalPos > range.max + 1e-9) {
    return resetWobble(rng);
  }
  if (w.phase === 'gap') {
    const timerMs = w.timerMs + dtMs;
    if (timerMs >= w.gapMs) {
      // 新しい揺れ: 向き (増加 70%・減少 30%) と大きさ (限界の 60〜100%) と上がる時間 (1〜2 秒) を乱数で決める
      const [r1, r2] = nextFloat(rng);
      const [r3, r4] = nextFloat(r2);
      const [r5, r6] = nextFloat(r4);
      return {
        wobble: { qty: 0, dir: r1 < WOBBLE_UP_RATIO ? 1 : -1, mag: limit * (WOBBLE_MAG_MIN + (1 - WOBBLE_MAG_MIN) * r3), riseMs: WOBBLE_RISE_MIN_MS + (WOBBLE_RISE_MAX_MS - WOBBLE_RISE_MIN_MS) * r5, fallMs: w.fallMs, phase: 'up', holdMs: 0, timerMs: 0, gapMs: w.gapMs },
        rng: r6,
      };
    }
    return { wobble: { ...w, timerMs }, rng };
  }
  if (w.phase === 'up') {
    const step = w.mag * (dtMs / Math.max(1, w.riseMs));
    const qty = w.dir === 1 ? Math.min(w.mag, w.qty + step) : Math.max(-w.mag, w.qty - step);
    if (qty === w.dir * w.mag) {
      // 峰に達したら 1〜2 秒そのまま止まってから戻る (止まる時間と戻る時間を乱数で決める。T2-22 追加修正2・案A)
      const [r1, r2] = nextFloat(rng);
      const [r3, next] = nextFloat(r2);
      return {
        wobble: { ...w, qty, phase: 'hold', timerMs: 0, holdMs: WOBBLE_HOLD_MIN_MS + (WOBBLE_HOLD_MAX_MS - WOBBLE_HOLD_MIN_MS) * r1, fallMs: WOBBLE_FALL_MIN_MS + (WOBBLE_FALL_MAX_MS - WOBBLE_FALL_MIN_MS) * r3 },
        rng: next,
      };
    }
    return { wobble: { ...w, qty }, rng };
  }
  if (w.phase === 'hold') {
    // 峰でそのままの量で止まっている (ペダルが範囲の外に出たら、上の外れチェックで量 0 に戻る)
    const timerMs = w.timerMs + dtMs;
    if (timerMs >= w.holdMs) {
      return { wobble: { ...w, timerMs: 0, phase: 'down' }, rng };
    }
    return { wobble: { ...w, timerMs }, rng };
  }
  // down: 0 (今のペダルの位置) へ戻る
  const step = w.mag * (dtMs / Math.max(1, w.fallMs));
  if (w.dir === -1) {
    // 下向きの揺れは 0 に向けて上がる
    const q2 = Math.min(0, w.qty + step);
    if (q2 === 0) return resetWobble(rng);
    return { wobble: { ...w, qty: q2 }, rng };
  }
  const qty = Math.max(0, w.qty - step);
  if (qty === 0) return resetWobble(rng);
  return { wobble: { ...w, qty }, rng };
}

/** スパイクを 1 tick 進める (T2-20a)。切れるかどうかは qty と elapsedMs で分かる */
export function stepSpike(
  sp: SpikeState, plan: SpikePlan, rng: RngState, pedalPos: number, bandClockMs: number, dtMs: number,
): { spike: SpikeState; plan: SpikePlan; rng: RngState } {
  if (sp.qty === 0) {
    // 予定の時間になったら起こす (帯の始まりから 3 秒以上たってから。left の残りがあるときだけ)
    if (plan.left > 0 && bandClockMs >= plan.atMs) {
      const [r1, r2] = nextFloat(rng);
      const target = SPIKE_QTY_MIN + (SPIKE_QTY_MAX - SPIKE_QTY_MIN) * r1;
      return {
        spike: { qty: target * (dtMs / SPIKE_RISE_MS), target, pedalAtStart: pedalPos, elapsedMs: 0, fallingMs: -1 },
        plan: { left: plan.left - 1, atMs: plan.atMs + SPIKE_GAP_MS },
        rng: r2,
      };
    }
    return { spike: sp, plan, rng };
  }
  if (sp.fallingMs >= 0) {
    // ペダルを下げた。0.5 秒で今のペダルの位置 (スパイクの量 0) へ戻る
    const fallingMs = sp.fallingMs + dtMs;
    const qty = Math.max(0, sp.qty * (1 - fallingMs / SPIKE_FALL_MS));
    if (qty <= 0) return { spike: resetSpike(), plan, rng };
    return { spike: { ...sp, qty, fallingMs }, plan, rng };
  }
  // まだ上がっている最中でも、ペダルを十分下げたら戻し始める
  const elapsedMs = sp.elapsedMs + dtMs;
  const qty = Math.min(sp.target, sp.qty + (sp.target * dtMs) / SPIKE_RISE_MS);
  if (pedalPos <= sp.pedalAtStart - SPIKE_RELIEF) {
    return { spike: { ...sp, qty, elapsedMs, fallingMs: 0 }, plan, rng };
  }
  return { spike: { ...sp, qty, elapsedMs }, plan, rng };
}

/** 適正範囲を作る (中心と幅は RANGE_WIDTH。位置は最初メーターの中央 50。T2-16a) */
export function makeRange(center: number, width: number, spikes = 0): RangeWithSpikes {
  return { center, width, min: center - width / 2, max: center + width / 2, spikes };
}

/** 帯ごとの適正範囲を先に全部決める (T2-16 その6)。1本目は中心 50。レベル2・3 は帯ごとに位置が動く。
 * 範囲は 20〜80 に収める (下の端が 20 を下回らない・上の端が 80 を超えない) */
export function makeRanges(level: Level, sections: number, rng: number): RangeWithSpikes[] {
  const width = RANGE_WIDTH(level);
  const shift = RANGE_SHIFT_ON_SECTION(level);
  // 位置の移動を丸める範囲に、20〜80 の制限を足す
  const lo = Math.max(RANGE_CENTER(level).min, RANGE_REACHABLE().min, 20 + width / 2);
  const hi = Math.min(RANGE_CENTER(level).max, RANGE_REACHABLE().max, 80 - width / 2);
  let r = rng;
  let center = 50;
  const ranges: RangeWithSpikes[] = [];
  for (let i = 0; i < sections; i++) {
    if (i > 0 && shift > 0) {
      const [raw, r2] = nextFloat(r);
      r = r2;
      center = Math.min(hi, Math.max(lo, center + (raw * 2 - 1) * shift));
    }
    // 帯ごとのスパイクの回数もここで決める (制限時間の計算に使う。T2-20b)
    const range = SPIKE_COUNT_RANGE(level);
    const [raw2, r3] = nextFloat(r);
    r = r3;
    const spikes = range.min + Math.floor(raw2 * (range.max - range.min + 1));
    ranges.push(makeRange(center, width, spikes));
  }
  return ranges;
}
