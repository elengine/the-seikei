import type { RngState } from '../../core/clock/clock';
import { seedFrom, nextFloat } from '../../core/clock/clock';
import { initPedal, setPedal, speedOf, tensionOf, stepNoise, stepDrift, stepSnag } from '../../core/mechanics/pedal';
import type { PedalState } from '../../core/mechanics/pedal';
import { initBreak, stepBreak, tapEnd } from '../../core/mechanics/breakage';
import type { BreakState } from '../../core/mechanics/breakage';
import {
  SECTION_LENGTH, RANGE_WIDTH, RANGE_CENTER, DRIFT, NOISE_AMP, BREAK_RATE, TENSION, BREAK,
  MAX_TICK_MS, STARS3, STARS2, TARGET_SEC_PER_SECTION,
} from './params';
import type { Level } from './params';

export type { Level } from './params';

export interface WindingState {
  level: Level;
  patternId: string;
  sections: number; // 帯の数
  phase: 'ready' | 'winding' | 'broken' | 'cutting' | 'done';
  current: number; // 巻いている帯(0 始まり)
  lengths: number[]; // 帯ごとの巻いた長さ
  windMs: number[]; // 帯ごとの、巻いていた時間(speed > 0)
  okMs: number[]; // 帯ごとの、適正範囲に入っていた時間
  pedal: PedalState;
  tension: number; // 最後に計算した張り(描画用)
  range: { min: number; max: number }; // このお題の適正範囲 (お題ごとに乱数で決める。T2-09a)
  snagRaised: boolean; // 直前の tick で引っかかった (メッセージ用。T2-09a)
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
  | { type: 'tapEnd'; thread: number; side: 'creel' | 'drum' }
  | { type: 'cut' } // 「帯の端を結ぶ」
  | { type: 'pausePedal' }; // 裏に回ったときなど、ペダルを 0 にする

/** 難易度ごとの張りの計算のパラメータ (範囲は State のものを使う) */
function tensionParams(level: Level, range: { min: number; max: number }) {
  return { ...TENSION, noiseAmp: NOISE_AMP(level), range };
}

/** 難易度ごとの糸切れのパラメータ */
function breakParams(level: Level): typeof BREAK {
  return { ...BREAK, rate: BREAK_RATE(level) };
}

/** お題の適正範囲を乱数で決める (中心は RANGE_CENTER の中、幅は RANGE_WIDTH) */
function rollRange(level: Level, rng: RngState): { range: { min: number; max: number }; rng: RngState } {
  const center = RANGE_CENTER(level);
  const width = RANGE_WIDTH(level);
  const [raw, next] = nextFloat(rng);
  const c = center.min + (center.max - center.min) * raw;
  return { range: { min: c - width / 2, max: c + width / 2 }, rng: next };
}

/** 新しいゲームの状態。phase 'ready'、current 0、各配列は 0 で埋める */
export function init(opts: { level: Level; patternId: string; sections: number; seed: number }): WindingState {
  const sections = opts.sections;
  const r = rollRange(opts.level, seedFrom(opts.seed));
  return {
    level: opts.level,
    patternId: opts.patternId,
    sections,
    phase: 'ready',
    current: 0,
    lengths: new Array<number>(sections).fill(0),
    windMs: new Array<number>(sections).fill(0),
    okMs: new Array<number>(sections).fill(0),
    pedal: initPedal(r.rng),
    tension: TENSION.base,
    range: r.range,
    snagRaised: false,
    elapsedMs: 0,
    brk: initBreak(),
    breaks: 0,
    wrongTaps: 0,
    rng: r.rng,
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

    case 'tapEnd': {
      if (s.phase !== 'broken') return s;
      const r = tapEnd(s.brk, a.thread, a.side);
      if (r.result === 'wrongThread') {
        return { ...s, brk: r.state, wrongTaps: s.wrongTaps + 1 };
      }
      if (r.result === 'tied') {
        // ペダルは切れたときに 0 になっているので、0 のまま 'winding' に戻る
        return { ...s, brk: r.state, phase: 'winding' };
      }
      return { ...s, brk: r.state };
    }

    case 'cut': {
      if (s.phase !== 'cutting') return s;
      if (s.current >= s.sections - 1) {
        return { ...s, phase: 'done' };
      }
      // 次の帯へ。ペダルは 0 のまま
      return { ...s, current: s.current + 1, phase: 'winding' };
    }
  }
}

/** tick。dtMs を MAX_TICK_MS で丸め、'winding' と 'broken' で時間を進める */
function tick(s: WindingState, dtMs: number): WindingState {
  if (s.phase !== 'winding' && s.phase !== 'broken') return s;
  const dt = Math.min(MAX_TICK_MS, Math.max(0, dtMs)) / 1000; // 秒
  const dtClamped = Math.min(MAX_TICK_MS, Math.max(0, dtMs));
  const dp = DRIFT(s.level);
  // 時間は巻いていた時間と止まっていた時間の合計 (糸切れを直している時間も含む。T2-09a)
  const elapsedMs = s.elapsedMs + dtClamped;

  if (s.phase === 'broken') {
    // 糸切れ中は張りの流れだけ進む (戻したときの見た目のため)。切れは進まない
    const drifted = stepDrift(s.pedal, dp, dtClamped);
    return { ...s, pedal: drifted, elapsedMs, snagRaised: false };
  }

  const tp = tensionParams(s.level, s.range);
  const bp = breakParams(s.level);

  // 1. noise → 流れ → 引っかかりを進める
  let pedal = stepNoise(s.pedal, tp, dtClamped);
  pedal = stepDrift(pedal, dp, dtClamped);
  const snag = stepSnag(pedal, dp, dtClamped);
  pedal = snag.state;
  // 2. 張りを計算して保存する
  const curLen = s.lengths[s.current] ?? 0;
  const progress = (s.current + curLen / SECTION_LENGTH) / s.sections;
  const tension = tensionOf(pedal, tp, progress);
  let cur: WindingState = { ...s, pedal, tension, elapsedMs, snagRaised: snag.raised > 0 };

  // 3. speed > 0 なら長さを進め、糸切れの判定をする
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
    cur = { ...cur, lengths, windMs, okMs };

    const br = stepBreak(cur.brk, bp, dtClamped, tension, tp.range.max, cur.rng);
    if (br.broke) {
      // 4. 切れたら phase 'broken'、breaks + 1、ペダルを 0 にする (実物どおり)
      return { ...cur, brk: br.state, breaks: cur.breaks + 1, phase: 'broken', pedal: setPedal(cur.pedal, 0), rng: br.rng };
    }
    cur = { ...cur, brk: br.state, rng: br.rng };

    // 5. 帯が巻き終わったら SECTION_LENGTH に揃え、phase 'cutting'、ペダルを 0 にする
    if ((cur.lengths[cur.current] ?? 0) >= SECTION_LENGTH) {
      const lengths2 = [...cur.lengths];
      lengths2[cur.current] = SECTION_LENGTH;
      return { ...cur, lengths: lengths2, phase: 'cutting', pedal: setPedal(cur.pedal, 0) };
    }
  }
  return cur;
}

/** 帯ごとの出来: okMs / windMs (windMs 0 なら 0) */
export function qualities(s: WindingState): number[] {
  return s.windMs.map((w, i) => {
    const ok = s.okMs[i] ?? 0;
    if (w <= 0) return 0;
    return ok / w;
  });
}

/** お題の目標の時間 (ms)。1本あたりの秒数 × 帯の数 (T2-09a) */
export function targetMsOf(s: WindingState): number {
  return TARGET_SEC_PER_SECTION(s.level) * 1000 * s.sections;
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
  if (typeof r.min !== 'number' || typeof r.max !== 'number') return false;
  return true;
}

/** 効果音とメッセージのため。controller が reduce の前後を比べて使う */
export function lastTapResult(
  prev: WindingState,
  next: WindingState,
): 'first' | 'tied' | 'wrongThread' | 'retry' | null {
  if (prev.brk.kind !== 'broken' || next.brk.kind !== 'broken') {
    // tied のときは次が running になる
    if (prev.brk.kind === 'broken' && next.brk.kind === 'running') return 'tied';
    return null;
  }
  const wasFirst = prev.brk.firstTapped;
  const isFirst = next.brk.firstTapped;
  if (next.wrongTaps > prev.wrongTaps) return 'wrongThread';
  if (!wasFirst && isFirst) return 'first';
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
