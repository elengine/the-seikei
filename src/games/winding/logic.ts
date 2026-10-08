/**
 * ドラム巻きのゲームの進行 (init・reduce・tick・成績)。
 * T2-20 追加修正: 揺れとスパイクと適正範囲は tension.ts、制限時間の計算は timeLimit.ts、
 * 状態の形と再開の検査は state.ts に分けた (00_rules: 1ファイル 300 行以内)。
 */

import { seedFrom, nextFloat } from '../../core/clock/clock';
import { initPedal, setPedal, speedOf } from '../../core/mechanics/pedal';
import { initBreak, tapThread } from '../../core/mechanics/breakage';
import {
  SECTION_LENGTH, TENSION, BREAK, MAX_TICK_MS, STARS3, STARS2,
  WOBBLE_START_DELAY_MS, SPIKE_GRACE_MS, OVER_GRACE_MS, YARN_FEEL,
} from './params';
import type { Level, YarnFeel } from './params';
import { resetWobble, resetSpike, planSpikes, stepWobble, stepSpike, makeRanges } from './tension';
import { bandTargetMs, targetMsOf } from './timeLimit';
import type { WindingState, WindingAction } from './state';

export type { Level, YarnFeel } from './params';
export type { RangeWithSpikes, WobbleState, SpikeState, SpikePlan } from './tension';
export type { WindingState, WindingAction } from './state';
export { makeRange, makeRanges } from './tension';
export { bandTargetMs, targetMsOf } from './timeLimit';
export { isValidResume, lastTapResult, seedFromText } from './state';

/** 新しいゲームの状態。phase 'ready'、current 0、各配列は 0 で埋める */
export function init(opts: { level: Level; patternId: string; sections: number; seed: number; puzzleId?: string; feel?: YarnFeel }): WindingState {
  const sections = opts.sections;
  // 帯ごとの範囲をお題を始めるときに全部決める (T2-16 その6)。1本目は中心 50・幅はレベルごとに固定。
  // レベル2・3 は帯が変わるごとに位置が動く (動く幅は今の決まりのまま)。乱数は State の種から
  const ranges = makeRanges(opts.level, sections, seedFrom(opts.seed + 1));
  const range = ranges[0]!;
  // 1本目の帯のスパイクの予定と揺れの初期状態 (乱数は State の種から。T2-20a)
  const p0 = planSpikes(range, seedFrom(opts.seed));
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
    // 制限時間 = 各帯の目標の時間の合計 (帯ごとに真ん中で巻いた時間 + ハサミ 3.5 秒 + スパイク 1 秒。
    // 帯ごとの 5 秒の足し算は二重だったのでやめた。T2-21)
    targetMs: ranges.reduce((acc, r) => acc + bandTargetMs(r), 0),
    range,
    ranges,
    wobble: w0.wobble,
    spike: resetSpike(),
    spikePlan: p0.plan,
    bandClockMs: 0,
    overMs: 0,
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
      const plan = planSpikes(next, s.rng);
      const wob = resetWobble(plan.rng);
      return {
        ...s,
        current: s.current + 1,
        phase: 'winding',
        range: next,
        bandClockMs: 0,
    overMs: 0,
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
  // 強く踏みすぎの数え (T2-22): ペダルの位置が範囲の上の端を超えているあいだ時間を数える。
  // スパイクのあいだは数えない (スパイクは「2 秒以内に 10 下げる」の決まりだけ)。範囲の下は数えない (出来が下がるだけ)
  const countingOver = !spikeBroke && spike.qty === 0 && pedalPos > range.max;
  const overMs = countingOver ? s.overMs + dtClamped : 0;
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
    overMs,
  };
  let state = cur;
  // 強く踏みすぎの猶予を過ぎたら糸が 1 本切れる (数えた時間は 0 に戻す。T2-22)
  if (!spikeBroke && overMs >= OVER_GRACE_MS(s.level) * YARN_FEEL[s.feel].overGraceMul) {
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
      overMs: 0,
    };
  }
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
