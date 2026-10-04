import type { RngState } from '../../core/clock/clock';
import { seedFrom, nextFloat } from '../../core/clock/clock';
import { initPedal, setPedal, speedOf, tensionOf, stepNoise, stepDrift, stepSnag } from '../../core/mechanics/pedal';
import type { PedalState } from '../../core/mechanics/pedal';
import { initBreak, stepBreak, tapThread } from '../../core/mechanics/breakage';
import type { BreakState, TapResult } from '../../core/mechanics/breakage';
import {
  SECTION_LENGTH, RANGE_WIDTH, RANGE_CENTER, RANGE_SHIFT_ON_SECTION, RANGE_REACHABLE, MAX_SPEED,
  DRIFT, NOISE_AMP, BREAK_RATE, TENSION, BREAK,
  MAX_TICK_MS, STARS3, STARS2, BREAK_EXTRA_STEP, BREAK_MAX_THREADS,
  YARN_FEEL, SNAG_BREAK_MARGIN, SNAG_GRACE_MS, TIME_MARGIN,
} from './params';
import type { Level, YarnFeel } from './params';

export type { Level } from './params';

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
  range: { center: number; width: number; min: number; max: number }; // 適正範囲。幅はレベルごとに固定・位置は帯が変わるときだけ動く (T2-16a)
  snagRaised: boolean; // 直前の tick で引っかかった (メッセージ用。T2-09a)
  /** 引っかかりで張りが上の端 + 8 を超えている時間の合計 (ms)。下がると 0 に戻す (T2-16 その3) */
  snagOverMs: number;
  elapsedMs: number; // 巻いていた時間と止まっていた時間の合計 (目標の時間の比較用。T2-09a)
  brk: BreakState;
  breaks: number;
  wrongTaps: number;
  rng: RngState;
}

export type WindingAction =
  | { type: 'start' } // 「巻き始める」
  | { type: 'setPedal'; value: number }
  | { type: 'tick'; dtMs: number }
  | { type: 'tapThread'; thread: number }
  | { type: 'cut' } // 「帯の端を結ぶ」
  | { type: 'pausePedal' }; // 裏に回ったときなど、ペダルを 0 にする

/** 難易度ごとの張りの計算のパラメータ (範囲は State のものを使う) */
function tensionParams(level: Level, range: { min: number; max: number }) {
  return { ...TENSION, noiseAmp: NOISE_AMP(level), range };
}

/** 難易度と糸の手応えごとの糸切れのパラメータ (T2-14b: 細い糸は切れやすい) */
function breakParams(level: Level, feel: YarnFeel = 'standard'): typeof BREAK {
  const f = YARN_FEEL[feel] ?? YARN_FEEL.standard;
  return {
    ...BREAK,
    rate: BREAK_RATE(level) * f.breakRateMul,
    extraStep: Math.max(4, BREAK_EXTRA_STEP(level) + f.breakExtraStepDelta),
    maxThreads: BREAK_MAX_THREADS(level),
  };
}

/** 適正範囲を作る (中心と幅は RANGE_WIDTH。位置は最初メーターの中央 50。T2-16a) */
export function makeRange(center: number, width: number): { center: number; width: number; min: number; max: number } {
  return { center, width, min: center - width / 2, max: center + width / 2 };
}

/** 新しいゲームの状態。phase 'ready'、current 0、各配列は 0 で埋める */
export function init(opts: { level: Level; patternId: string; sections: number; seed: number; puzzleId?: string; feel?: YarnFeel }): WindingState {
  const sections = opts.sections;
  // 範囲は乱数で決めない (T2-16a): 最初の帯の中心はメーターの中央 (50)・幅はレベルごとに固定
  const range = makeRange(50, RANGE_WIDTH(opts.level));
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
    targetMs: bandTargetMs(opts.level, range),
    range,
    snagRaised: false,
    snagOverMs: 0,
    elapsedMs: 0,
    brk: initBreak(),
    breaks: 0,
    wrongTaps: 0,
    rng: seedFrom(opts.seed),
  };
}

/** 元の s は変更しない */
export function reduce(s: WindingState, a: WindingAction): WindingState {
  if (s.phase === 'done') return s; // 'done' の後はどの操作でも状態を変えない

  switch (a.type) {
    case 'start':
      if (s.phase !== 'ready') return s;
      return { ...s, phase: 'winding' };

    case 'setPedal':
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
      // 次の帯へ。ペダルは 0 のまま。帯が変わるときだけ、範囲の位置が変わることがある (T2-16a)
      const shift = RANGE_SHIFT_ON_SECTION(s.level);
      // 目標の時間は帯ごとに足す (帯が始まるときに計算する。T2-16b)
      if (shift <= 0) {
        return { ...s, current: s.current + 1, phase: 'winding', targetMs: s.targetMs + bandTargetMs(s.level, s.range) };
      }
      const [raw, r1] = nextFloat(s.rng);
      // 位置は RANGE_CENTER の中・ペダル 10〜100 で届く範囲 (RANGE_REACHABLE) に丸める
      const lo = Math.max(RANGE_CENTER(s.level).min, RANGE_REACHABLE().min);
      const hi = Math.min(RANGE_CENTER(s.level).max, RANGE_REACHABLE().max);
      const center = Math.min(hi, Math.max(lo, s.range.center + (raw * 2 - 1) * shift));
      const range = makeRange(center, RANGE_WIDTH(s.level));
      return { ...s, current: s.current + 1, phase: 'winding', range, rng: r1, targetMs: s.targetMs + bandTargetMs(s.level, range) };
    }
  }
}

/** tick。dtMs を MAX_TICK_MS で丸め、'winding' と 'broken' で時間を進める */
function tick(s: WindingState, dtMs: number): WindingState {
  if (s.phase !== 'winding' && s.phase !== 'broken') return s;
  const dt = Math.min(MAX_TICK_MS, Math.max(0, dtMs)) / 1000; // 秒
  const dtClamped = Math.min(MAX_TICK_MS, Math.max(0, dtMs));
  const f = YARN_FEEL[s.feel] ?? YARN_FEEL.standard;
  const baseDp = DRIFT(s.level);
  const dp = { ...baseDp, perSec: baseDp.perSec * f.driftMul, snagRate: baseDp.snagRate * f.snagMul }; // 手応え (T2-14b)
  // 時間は巻いていた時間と止まっていた時間の合計 (糸切れを直している時間も含む。T2-09a)
  const elapsedMs = s.elapsedMs + dtClamped;

  if (s.phase === 'broken') {
    // 糸切れ中は張りの流れだけ進む (戻したときの見た目のため)。切れは進まない
    const drifted = stepDrift(s.pedal, dp, dtClamped);
    return { ...s, pedal: drifted, elapsedMs, snagRaised: false };
  }

  // 範囲は巻いているあいだも動かない (T2-16a。帯が変わるときだけ cut で動かす)
  const range = s.range;
  const tp = tensionParams(s.level, range);
  const bp = breakParams(s.level, s.feel);

  // 1. noise → 流れ → 引っかかりを進める
  let pedal = stepNoise(s.pedal, tp, dtClamped);
  pedal = stepDrift(pedal, dp, dtClamped);
  const snag = stepSnag(pedal, dp, dtClamped);
  pedal = snag.state;
  // 2. 張りを計算して保存する
  const curLen = s.lengths[s.current] ?? 0;
  const progress = (s.current + curLen / SECTION_LENGTH) / s.sections;
  const tension = tensionOf(pedal, tp, progress);
  const cur: WindingState = { ...s, pedal, tension, elapsedMs, snagRaised: snag.raised > 0, range };
  // 3. speed > 0 なら長さを進め、糸切れの判定をする (あとで cur に重ねるので let)
  let state = cur;
  // 引っかかりのあいだ、張りが上の端 + SNAG_BREAK_MARGIN を超えている時間を数える (T2-16 その3)。
  // ペダルを戻して張りが下がると 0 に戻す (数え直す)。猶予を過ぎたら 1 本切れる (今の糸切れの扱いと同じ)
  const overLimit = tp.range.max + SNAG_BREAK_MARGIN;
  if (pedal.snag > 0 && tension > overLimit) {
    const overMs = s.snagOverMs + dtClamped;
    if (overMs >= SNAG_GRACE_MS(s.level)) {
      const [pickRaw, pickNext] = nextFloat(state.rng);
      const thread = Math.min(BREAK.threadCount - 1, Math.floor(pickRaw * BREAK.threadCount));
      return {
        ...state,
        brk: { kind: 'broken', threads: [thread], tied: [] },
        breaks: state.breaks + 1,
        phase: 'broken',
        pedal: setPedal(state.pedal, 0),
        rng: pickNext,
        snagOverMs: 0,
      };
    }
    state = { ...state, snagOverMs: overMs };
  } else if (s.snagOverMs !== 0) {
    state = { ...state, snagOverMs: 0 };
  }
  const speed = speedOf(pedal, tp);
  if (speed > 0) {
    const lengths = [...cur.lengths];
    const windMs = [...cur.windMs];
    const okMs = [...cur.okMs];
    lengths[cur.current] = (lengths[cur.current] ?? 0) + speed * dt;
    windMs[cur.current] = (windMs[cur.current] ?? 0) + dtClamped;
    if (tension >= tp.range.min && tension <= tp.range.max) {
      okMs[cur.current] = (okMs[cur.current] ?? 0) + dtClamped;
    }
    state = { ...state, lengths, windMs, okMs };

    // 糸切れの判定は、引っかかりの尖り (pedal.snag) を除いた張りで行う (T2-16a:
    // 引っかかりは見た目の張りの感じで、0.2秒で上がって徐々に戻る。尖りのあいだに切れないようにする)
    const br = stepBreak(state.brk, bp, dtClamped, tension - pedal.snag, tp.range.max, state.rng);
    if (br.broke) {
      // 4. 切れたら phase 'broken'、breaks + 1、ペダルを 0 にする (実物どおり)
      return { ...state, brk: br.state, breaks: state.breaks + 1, phase: 'broken', pedal: setPedal(state.pedal, 0), rng: br.rng };
    }
    state = { ...state, brk: br.state, rng: br.rng };

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

/** 帯 1 本の目標の時間 (ms) = 帯の長さ ÷ (適正の範囲の上の端の張りになるペダルの速さ) × TIME_MARGIN (T2-16b) */
export function bandTargetMs(_level: Level, range: { max: number }): number {
  const pedal = (range.max - TENSION.base) / TENSION.perPedal;
  const speed = (pedal / 100) * MAX_SPEED;
  return (SECTION_LENGTH / speed) * TIME_MARGIN * 1000;
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
  if (typeof o.snagRaised !== 'boolean') return false;
  if (typeof o.range !== 'object' || o.range === null) return false;
  const r = o.range as Record<string, unknown>;
  // 範囲の形 (T2-16a): center・width も必須。古い形 (min・max だけ) の保存は再開しない
  if (typeof r.center !== 'number' || typeof r.width !== 'number') return false;
  if (typeof r.min !== 'number' || typeof r.max !== 'number') return false;
  // 引っかかりの超過の時間 (T2-16 その3)。無い古い形の保存は再開しない
  if (typeof o.snagOverMs !== 'number' || !(o.snagOverMs >= 0)) return false;
  // 目標の時間の合計 (T2-16b)。足した目標を持たない古い形の保存は再開しない
  if (typeof o.targetMs !== 'number' || !(o.targetMs >= 0)) return false;
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
