import type { RngState } from '../../core/clock/clock';
import { seedFrom, nextFloat } from '../../core/clock/clock';
import { initPedal, setPedal, speedOf } from '../../core/mechanics/pedal';
import type { PedalState } from '../../core/mechanics/pedal';
import { initBreak, tapThread } from '../../core/mechanics/breakage';
import type { BreakState, TapResult } from '../../core/mechanics/breakage';
import {
  SECTION_LENGTH, RANGE_WIDTH, RANGE_CENTER, RANGE_SHIFT_ON_SECTION, RANGE_REACHABLE, MAX_SPEED,
  TENSION, BREAK, MAX_TICK_MS, STARS3, STARS2,
  TIME_ANCHOR, TIME_PER_SECTION_MS,
  WOBBLE_START_DELAY_MS, WOBBLE_RISE_MIN_MS, WOBBLE_RISE_MAX_MS, WOBBLE_FALL_MIN_MS, WOBBLE_FALL_MAX_MS,
  WOBBLE_GAP_MIN_MS, WOBBLE_GAP_MAX_MS, WOBBLE_MAG_MIN,
  SPIKE_RISE_MS, SPIKE_FALL_MS, SPIKE_QTY_MIN, SPIKE_QTY_MAX, SPIKE_RELIEF, SPIKE_GRACE_MS, SPIKE_GAP_MS, SPIKE_COUNT_RANGE,
} from './params';
import type { Level, YarnFeel } from './params';

export type { Level } from './params';

/** 揺れの状態 (T2-20a)。量 (qty) は 0 から始まり、峰 (mag) まで上がって 0 に戻る */
export interface WobbleState {
  qty: number;
  dir: 1 | -1;
  /** 峰の大きさ (範囲の幅の半分 × 40〜100%) */
  mag: number;
  riseMs: number;
  fallMs: number;
  phase: 'gap' | 'up' | 'down';
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

export interface WindingState {
  level: Level;
  patternId: string;
  /** お題の id (T2-14a。クリール立てのお題と同じ。job モードなどお題でないときは空文字) */
  puzzleId: string;
  /** 糸の手応え (T2-14b。お題でないときは標準) */
  feel: YarnFeel;
  sections: number; // 帯の数
  phase: 'ready' | 'winding' | 'broken' | 'cutting' | 'done';
  current: number; // 巻いている帯(0 始まり)
  lengths: number[]; // 帯ごとの巻いた長さ
  windMs: number[]; // 帯ごとの、巻いていた時間(speed > 0)
  okMs: number[]; // 帯ごとの、適正範囲に入っていた時間
  pedal: PedalState;
  /** 目標の時間の合計 (ms)。帯が始まるときに、その帯のぶんを足す (T2-16b) */
  targetMs: number;
  tension: number; // 最後に計算した張り(描画用)
  range: { center: number; width: number; min: number; max: number }; // 今の帯の適正範囲 (ranges[current] と同じ。T2-16 その6)
  ranges: Array<{ center: number; width: number; min: number; max: number }>; // 帯ごとの適正範囲。お題を始めるときに全部決める (制限時間を最初に出すため。T2-16 その6)
  /** 揺れ (T2-20a)。量は 0 → 峰 (範囲の幅の半分の 40〜100%) → 0。張り = ペダルの位置 + 量 */
  wobble: WobbleState;
  /** スパイク (T2-20a)。qty が 0 より大きいあいだ張りに上乗せされる。ペダルを SPIKE_RELIEF 下げると戻る */
  spike: SpikeState;
  /** この帯で起こすスパイクの予定 (残り回数と、帯の始まりからの時刻) */
  spikePlan: SpikePlan;
  /** 帯の始まりからの時間 (ms)。揺れもスパイクも WOBBLE_START_DELAY_MS のあとだけ起こす */
  bandClockMs: number;
  /** 帯ごとの、スパイクの量が 0 でなかった時間 (ms。テストと成績の内訳用) */
  spikeMs: number[];
  elapsedMs: number; // 巻いていた時間と止まっていた時間の合計 (目標の時間の比較用。T2-09a)
  brk: BreakState;
  breaks: number;
  wrongTaps: number;
  rng: RngState;
}

export type WindingAction =
  | { type: 'setPedal'; value: number } // ペダル。ready で 0 より大きくすると巻き始まる (T2-18a)
  | { type: 'tick'; dtMs: number }
  | { type: 'tapThread'; thread: number }
  | { type: 'cut' } // 「帯の端を結ぶ」
  | { type: 'pausePedal' }; // 裏に回ったときなど、ペダルを 0 にする

/** 揺れまでのあいだを乱数で決める (1〜3 秒) */
function nextGapMs(rng: RngState): { ms: number; rng: RngState } {
  const [raw, next] = nextFloat(rng);
  return { ms: WOBBLE_GAP_MIN_MS + (WOBBLE_GAP_MAX_MS - WOBBLE_GAP_MIN_MS) * raw, rng: next };
}

/** 揺れを初期化する (量 0・あいだを乱数で決める) */
function resetWobble(rng: RngState): { wobble: WobbleState; rng: RngState } {
  const g = nextGapMs(rng);
  return { wobble: { qty: 0, dir: 1, mag: 0, riseMs: 0, fallMs: 0, phase: 'gap', timerMs: 0, gapMs: g.ms }, rng: g.rng };
}

/** スパイクを初期化する (量 0) */
function resetSpike(): SpikeState {
  return { qty: 0, target: 0, pedalAtStart: 0, elapsedMs: 0, fallingMs: -1 };
}

/** 帯のスパイクの予定を乱数で決める (回数はレベルの決まり。最初は 3〜5 秒のあと、次は 5 秒以上あける) */
function planSpikes(level: Level, rng: RngState): { plan: SpikePlan; rng: RngState } {
  const range = SPIKE_COUNT_RANGE(level);
  const [r1, r2] = nextFloat(rng);
  const count = range.min + Math.floor(r1 * (range.max - range.min + 1));
  const [r3, r4] = nextFloat(r2);
  const atMs = WOBBLE_START_DELAY_MS + 2000 * r3;
  return { plan: { left: count, atMs }, rng: r4 };
}

/** 揺れを 1 tick 進める (T2-20a)。ペダルが範囲の外なら揺れない (量を 0 に戻す) */
function stepWobble(
  w: WobbleState, rng: RngState, pedalPos: number, range: { min: number; max: number }, dtMs: number,
): { wobble: WobbleState; rng: RngState } {
  const limit = (range.max - range.min) / 2; // 揺れの限界 = 範囲の幅の半分
  if (pedalPos < range.min - 1e-9 || pedalPos > range.max + 1e-9) {
    return resetWobble(rng);
  }
  if (w.phase === 'gap') {
    const timerMs = w.timerMs + dtMs;
    if (timerMs >= w.gapMs) {
      // 新しい揺れ: 向きと大きさ (限界の 40〜100%) と上がる時間 (1〜2 秒) を乱数で決める
      const [r1, r2] = nextFloat(rng);
      const [r3, r4] = nextFloat(r2);
      const [r5, r6] = nextFloat(r4);
      return {
        wobble: { qty: 0, dir: r1 < 0.5 ? 1 : -1, mag: limit * (WOBBLE_MAG_MIN + (1 - WOBBLE_MAG_MIN) * r3), riseMs: WOBBLE_RISE_MIN_MS + (WOBBLE_RISE_MAX_MS - WOBBLE_RISE_MIN_MS) * r5, fallMs: w.fallMs, phase: 'up', timerMs: 0, gapMs: w.gapMs },
        rng: r6,
      };
    }
    return { wobble: { ...w, timerMs }, rng };
  }
  if (w.phase === 'up') {
    const step = w.mag * (dtMs / Math.max(1, w.riseMs));
    const qty = w.dir === 1 ? Math.min(w.mag, w.qty + step) : Math.max(-w.mag, w.qty - step);
    if (qty === w.dir * w.mag) {
      // 峰に達したら、いまのペダルの位置へ戻る (戻る時間 1〜2 秒を乱数で決める)
      const [raw, next] = nextFloat(rng);
      return { wobble: { ...w, qty, phase: 'down', timerMs: 0, fallMs: WOBBLE_FALL_MIN_MS + (WOBBLE_FALL_MAX_MS - WOBBLE_FALL_MIN_MS) * raw }, rng: next };
    }
    return { wobble: { ...w, qty }, rng };
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

/** スパイクを 1 tick 進める (T2-20a)。戻す (切れる) のは stepSpike の結果で分かる */
function stepSpike(
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
export function makeRange(center: number, width: number): { center: number; width: number; min: number; max: number } {
  return { center, width, min: center - width / 2, max: center + width / 2 };
}

/** 帯ごとの適正範囲を先に全部決める (T2-16 その6)。1本目は中心 50。レベル2・3 は帯ごとに位置が動く。
 * 範囲は 20〜80 に収める (下の端が 20 を下回らない・上の端が 80 を超えない) */
export function makeRanges(level: Level, sections: number, rng: number): Array<{ center: number; width: number; min: number; max: number }> {
  const width = RANGE_WIDTH(level);
  const shift = RANGE_SHIFT_ON_SECTION(level);
  // 位置の移動を丸める範囲に、20〜80 の制限を足す
  const lo = Math.max(RANGE_CENTER(level).min, RANGE_REACHABLE().min, 20 + width / 2);
  const hi = Math.min(RANGE_CENTER(level).max, RANGE_REACHABLE().max, 80 - width / 2);
  let r = rng;
  let center = 50;
  const ranges: Array<{ center: number; width: number; min: number; max: number }> = [];
  for (let i = 0; i < sections; i++) {
    if (i > 0 && shift > 0) {
      const [raw, r2] = nextFloat(r);
      r = r2;
      center = Math.min(hi, Math.max(lo, center + (raw * 2 - 1) * shift));
    }
    ranges.push(makeRange(center, width));
  }
  return ranges;
}

/** 新しいゲームの状態。phase 'ready'、current 0、各配列は 0 で埋める */
export function init(opts: { level: Level; patternId: string; sections: number; seed: number; puzzleId?: string; feel?: YarnFeel }): WindingState {
  const sections = opts.sections;
  // 帯ごとの範囲をお題を始めるときに全部決める (T2-16 その6)。1本目は中心 50・幅はレベルごとに固定。
  // レベル2・3 は帯が変わるごとに位置が動く (動く幅は今の決まりのまま)。乱数は State の種から
  const ranges = makeRanges(opts.level, sections, seedFrom(opts.seed + 1));
  const range = ranges[0]!;
  // 1本目の帯のスパイクの予定と揺れの初期状態 (乱数は State の種から。T2-20a)
  const p0 = planSpikes(opts.level, seedFrom(opts.seed));
  const w0 = resetWobble(p0.rng);
  return {
    level: opts.level,
    patternId: opts.patternId,
    puzzleId: opts.puzzleId ?? '',
    feel: opts.feel ?? 'standard',
    sections,
    phase: 'ready',
    current: 0,
    lengths: new Array<number>(sections).fill(0),
    windMs: new Array<number>(sections).fill(0),
    okMs: new Array<number>(sections).fill(0),
    pedal: initPedal(seedFrom(opts.seed)),
    tension: TENSION.base,
    // 制限時間 = 各帯の目標の合計 + 5秒 × 帯の数 (帯1本あたり: ペダルを動かし始めてから目的の位置まで +
    // ハサミを動かして帯の端を結ぶ動きまで。T2-18a)
    targetMs: ranges.reduce((acc, r) => acc + bandTargetMs(r), 0) + sections * TIME_PER_SECTION_MS,
    range,
    ranges,
    wobble: w0.wobble,
    spike: resetSpike(),
    spikePlan: p0.plan,
    bandClockMs: 0,
    spikeMs: new Array<number>(sections).fill(0),
    elapsedMs: 0,
    brk: initBreak(),
    breaks: 0,
    wrongTaps: 0,
    rng: w0.rng,
  };
}

/** 元の s は変更しない */
export function reduce(s: WindingState, a: WindingAction): WindingState {
  if (s.phase === 'done') return s; // 'done' の後はどの操作でも状態を変えない

  switch (a.type) {
    case 'setPedal':
      // ready でペダルを 0 より大きくすると、その瞬間に巻き始まる (T2-18a。「巻き始める」のボタンは無い)
      if (s.phase === 'ready') {
        if (a.value <= 0) return s;
        return { ...s, phase: 'winding', pedal: setPedal(s.pedal, a.value) };
      }
      if (s.phase !== 'winding') return s;
      return { ...s, pedal: setPedal(s.pedal, a.value) };

    case 'pausePedal':
      return { ...s, pedal: setPedal(s.pedal, 0) };

    case 'tick':
      return tick(s, a.dtMs);

    case 'tapThread': {
      if (s.phase !== 'broken') return s;
      const r = tapThread(s.brk, a.thread);
      if (r.result === 'wrongThread') {
        return { ...s, brk: r.state, wrongTaps: s.wrongTaps + 1 };
      }
      if (r.result === 'tiedAll') {
        // 全部つながった。ペダルは切れたときに 0 になっているので、0 のまま 'winding' に戻る
        return { ...s, brk: r.state, phase: 'winding' };
      }
      if (r.result === 'tiedOne') {
        // 1本つながった。まだ 'broken' のまま
        return { ...s, brk: r.state };
      }
      return { ...s, brk: r.state };
    }

    case 'cut': {
      if (s.phase !== 'cutting') return s;
      if (s.current >= s.sections - 1) {
        return { ...s, phase: 'done' };
      }
      // 次の帯へ。ペダルは 0 のまま。範囲ははじめに決めていた次の帯のもの (T2-16 その6)
      const next = s.ranges[s.current + 1];
      if (next === undefined) return { ...s, phase: 'done' };
      // 新しい帯のスパイクの予定と揺れの初期状態 (帯の始まりから 3 秒は何も起こさない。T2-20a)
      const plan = planSpikes(s.level, s.rng);
      const wob = resetWobble(plan.rng);
      return {
        ...s,
        current: s.current + 1,
        phase: 'winding',
        range: next,
        bandClockMs: 0,
        spikePlan: plan.plan,
        wobble: wob.wobble,
        spike: resetSpike(),
        rng: wob.rng,
      };
    }
  }
}

/** tick。dtMs を MAX_TICK_MS で丸め、'winding'・'broken'・'cutting' で時間を進める */
function tick(s: WindingState, dtMs: number): WindingState {
  const dtClamped = Math.min(MAX_TICK_MS, Math.max(0, dtMs));
  // 帯の端を結んでいるあいだ (cutting: ピンを回す・ハサミ・結ぶ動作) も時間は進み続ける (T2-18a)
  if (s.phase === 'cutting') {
    return { ...s, elapsedMs: s.elapsedMs + dtClamped };
  }
  if (s.phase !== 'winding' && s.phase !== 'broken') return s;
  const dt = dtClamped / 1000; // 秒
  // 時間は巻いていた時間と止まっていた時間の合計 (糸切れを直している時間も含む。T2-09a)
  const elapsedMs = s.elapsedMs + dtClamped;

  if (s.phase === 'broken') {
    // 糸切れ中は揺れもスパイクも止める (量を 0 に戻す)。ペダルは 0 なので張り = 0
    const settled = s.wobble.qty === 0 && s.wobble.phase === 'gap';
    if (!settled) {
      const r = resetWobble(s.rng);
      return { ...s, wobble: r.wobble, spike: s.spike.qty === 0 ? s.spike : resetSpike(), elapsedMs, rng: r.rng };
    }
    return { ...s, spike: s.spike.qty === 0 ? s.spike : resetSpike(), elapsedMs };
  }

  // 範囲は巻いているあいだも動かない (T2-16a。帯が変わるときだけ cut で動かす)
  const range = s.range;

  // 1. 揺れとスパイクを進める (T2-20a)。帯の始まりから WOBBLE_START_DELAY_MS のあいだは何も起こさない
  let wobble = s.wobble;
  let spike = s.spike;
  let spikePlan = s.spikePlan;
  let rng = s.rng;
  let spikeBroke = false;
  const pedalPos = s.pedal.pedal;
  if (s.bandClockMs < WOBBLE_START_DELAY_MS) {
    // まちのあいだは止めておく (量は 0 のまま)
  } else {
    const w = stepWobble(wobble, rng, pedalPos, range, dtClamped);
    wobble = w.wobble;
    rng = w.rng;
    const sp = stepSpike(spike, spikePlan, rng, pedalPos, s.bandClockMs, dtClamped);
    spike = sp.spike;
    spikePlan = sp.plan;
    rng = sp.rng;
    // スパイクの猶予を過ぎたら切れる (2 秒以内にペダルを 10 以上下げれば切れない。T2-20a)
    if (spike.qty > 0 && spike.fallingMs < 0 && spike.elapsedMs >= SPIKE_GRACE_MS) spikeBroke = true;
  }
  // 2. 張り = ペダルの位置 + 揺れの量 + スパイクの量 (T2-20a)
  const tension = pedalPos + wobble.qty + spike.qty;
  const cur: WindingState = {
    ...s,
    wobble,
    spike,
    spikePlan,
    tension,
    elapsedMs,
    range,
    rng,
    bandClockMs: s.bandClockMs + dtClamped,
  };
  let state = cur;
  if (spikeBroke) {
    // 3. 切れたら 1 本切る (今の糸切れの扱いと同じ: タップでつなぐ)。揺れとスパイクは止める
    const [pickRaw, pickNext] = nextFloat(state.rng);
    const thread = Math.min(BREAK.threadCount - 1, Math.floor(pickRaw * BREAK.threadCount));
    const wr = resetWobble(pickNext);
    return {
      ...state,
      brk: { kind: 'broken', threads: [thread], tied: [] },
      breaks: state.breaks + 1,
      phase: 'broken',
      pedal: setPedal(state.pedal, 0),
      wobble: wr.wobble,
      spike: resetSpike(),
      rng: wr.rng,
    };
  }
  // 4. 速さはペダルの位置だけで決まる (揺れは張りにだけ出る)
  const speed = speedOf(s.pedal, { ...TENSION, range });
  if (speed > 0) {
    const lengths = [...cur.lengths];
    const windMs = [...cur.windMs];
    const okMs = [...cur.okMs];
    const spikeMs = [...cur.spikeMs];
    lengths[cur.current] = (lengths[cur.current] ?? 0) + speed * dt;
    windMs[cur.current] = (windMs[cur.current] ?? 0) + dtClamped;
    if (spike.qty > 0) spikeMs[cur.current] = (spikeMs[cur.current] ?? 0) + dtClamped;
    if (tension >= range.min && tension <= range.max) {
      okMs[cur.current] = (okMs[cur.current] ?? 0) + dtClamped;
    }
    state = { ...state, lengths, windMs, okMs, spikeMs };

    // 5. 帯が巻き終わったら SECTION_LENGTH に揃え、phase 'cutting'、ペダルを 0 にする
    if ((state.lengths[state.current] ?? 0) >= SECTION_LENGTH) {
      const lengths2 = [...state.lengths];
      lengths2[state.current] = SECTION_LENGTH;
      return { ...state, lengths: lengths2, phase: 'cutting', pedal: setPedal(state.pedal, 0) };
    }
  }
  return state;
}

/** 帯ごとの出来: okMs / windMs (windMs 0 なら 0) */
export function qualities(s: WindingState): number[] {
  return s.windMs.map((w, i) => {
    const ok = s.okMs[i] ?? 0;
    if (w <= 0) return 0;
    return ok / w;
  });
}

/** 帯 1 本の目標の時間 (ms) = 帯の長さ ÷ (範囲の TIME_ANCHOR の位置の張りになるペダルの速さ) (T2-16 その6) */
export function bandTargetMs(range: { min: number; max: number }): number {
  const anchor = range.min + (range.max - range.min) * TIME_ANCHOR;
  const pedal = (anchor - TENSION.base) / TENSION.perPedal;
  const speed = (pedal / 100) * MAX_SPEED;
  return (SECTION_LENGTH / speed) * 1000;
}

/** お題の目標の時間 (ms)。帯が始まるごとに足した合計 (T2-16b) */
export function targetMsOf(s: WindingState): number {
  return s.targetMs;
}

/**
 * 星 (T2-09a):
 * - 星3: 適正な張りの割合の平均が 0.8 以上 かつ 目標の時間内
 * - 星2: 平均が 0.6 以上 (時間は問わない)
 * - 星1: それ以外
 */
export function starsOf(s: WindingState): 1 | 2 | 3 {
  const qs = qualities(s);
  const avg = qs.reduce((sum, q) => sum + q, 0) / qs.length;
  if (avg >= STARS3 && s.elapsedMs <= targetMsOf(s)) return 3;
  if (avg >= STARS2) return 2;
  return 1;
}

/** 途中保存の形を確かめる。再開したときのペダルは controller が pausePedal で 0 にする */
export function isValidResume(x: unknown): x is WindingState {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  const phases = ['ready', 'winding', 'broken', 'cutting', 'done'];
  if (typeof o.phase !== 'string' || !phases.includes(o.phase)) return false;
  if (o.level !== 1 && o.level !== 2 && o.level !== 3) return false;
  if (typeof o.sections !== 'number' || !Number.isInteger(o.sections) || o.sections < 1) return false;
  if (typeof o.current !== 'number' || !Number.isInteger(o.current) || o.current < 0 || o.current >= o.sections) {
    return false;
  }
  const arrays = ['lengths', 'windMs', 'okMs'] as const;
  for (const key of arrays) {
    const arr = o[key];
    if (!Array.isArray(arr) || arr.length !== o.sections) return false;
    for (const v of arr) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false;
    }
  }
  for (const key of ['breaks', 'wrongTaps', 'tension', 'elapsedMs'] as const) {
    if (typeof o[key] !== 'number' || !Number.isFinite(o[key])) return false;
  }
  if (typeof o.patternId !== 'string') return false;
  if (typeof o.rng !== 'number') return false;
  if (typeof o.pedal !== 'object' || o.pedal === null) return false;
  if (typeof o.brk !== 'object' || o.brk === null) return false;
  if (typeof o.range !== 'object' || o.range === null) return false;
  const r = o.range as Record<string, unknown>;
  // 範囲の形 (T2-16a): center・width も必須。古い形 (min・max だけ) の保存は再開しない
  if (typeof r.center !== 'number' || typeof r.width !== 'number') return false;
  if (typeof r.min !== 'number' || typeof r.max !== 'number') return false;
  // 揺れ・スパイクの状態 (T2-20a)。無い古い形の保存は再開しない
  if (typeof o.wobble !== 'object' || o.wobble === null) return false;
  if (typeof o.spike !== 'object' || o.spike === null) return false;
  if (typeof o.spikePlan !== 'object' || o.spikePlan === null) return false;
  if (typeof o.bandClockMs !== 'number' || !(o.bandClockMs >= 0)) return false;
  if (!Array.isArray(o.spikeMs) || o.spikeMs.length !== o.sections) return false;
  // 目標の時間の合計 (T2-16b)。足した目標を持たない古い形の保存は再開しない
  if (typeof o.targetMs !== 'number' || !(o.targetMs >= 0)) return false;
  // 帯ごとの範囲 (T2-16 その6)。持たない古い形の保存は再開しない
  if (!Array.isArray(o.ranges) || o.ranges.length === 0) return false;
  // T2-14a: puzzleId のキーが無い古い形の保存は再開しない (job モードなどの空文字は許す)
  if (!('puzzleId' in o) || typeof o.puzzleId !== 'string') {
    return false;
  }
  // T2-13c: 古い形 (brk.first がある) は再開しない
  if (o.brk && typeof o.brk === 'object' && 'first' in (o.brk as Record<string, unknown>)) {
    return false;
  }
  return true;
}

/** 効果音とメッセージのため。controller が reduce の前後を比べて使う (T2-13c: 1回押し) */
export function lastTapResult(
  prev: WindingState,
  next: WindingState,
): TapResult | null {
  if (prev.brk.kind !== 'broken' || next.brk.kind !== 'broken') {
    // tiedAll のときは次が running になる
    if (prev.brk.kind === 'broken' && next.brk.kind === 'running') return 'tiedAll';
    return null;
  }
  if (next.wrongTaps > prev.wrongTaps) return 'wrongThread';
  if (next.brk.tied.length > prev.brk.tied.length) return 'tiedOne';
  return null;
}

/** 文字列 (現在時刻など) から種を作る。controller が clock.now() から作るのに使う */
export function seedFromText(text: string): number {
  let h = 0;
  for (const ch of text) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return h;
}
