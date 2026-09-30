import type { RngState } from '../../core/clock/clock';
import { seedFrom } from '../../core/clock/clock';
import { initPedal, setPedal, speedOf, tensionOf, stepNoise } from '../../core/mechanics/pedal';
import type { PedalState } from '../../core/mechanics/pedal';
import { initBreak, stepBreak, tapEnd } from '../../core/mechanics/breakage';
import type { BreakState } from '../../core/mechanics/breakage';
import { SECTION_LENGTH, RANGE, BREAK_RATE, TENSION, BREAK, MAX_TICK_MS, STARS3, STARS2 } from './params';
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

/** 難易度ごとの張りの計算のパラメータ */
function tensionParams(level: Level): typeof TENSION {
  return { ...TENSION, range: RANGE(level) };
}

/** 難易度ごとの糸切れのパラメータ */
function breakParams(level: Level): typeof BREAK {
  return { ...BREAK, rate: BREAK_RATE(level) };
}

/** 新しいゲームの状態。phase 'ready'、current 0、各配列は 0 で埋める */
export function init(opts: { level: Level; patternId: string; sections: number; seed: number }): WindingState {
  const sections = opts.sections;
  return {
    level: opts.level,
    patternId: opts.patternId,
    sections,
    phase: 'ready',
    current: 0,
    lengths: new Array<number>(sections).fill(0),
    windMs: new Array<number>(sections).fill(0),
    okMs: new Array<number>(sections).fill(0),
    pedal: initPedal(seedFrom(opts.seed)),
    tension: TENSION.base,
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

/** tick。dtMs を MAX_TICK_MS で丸め、'winding' のときだけ進める */
function tick(s: WindingState, dtMs: number): WindingState {
  if (s.phase !== 'winding') return s;
  const dt = Math.min(MAX_TICK_MS, Math.max(0, dtMs)) / 1000; // 秒
  const tp = tensionParams(s.level);
  const bp = breakParams(s.level);

  // 1. noise を進める
  const pedal = stepNoise(s.pedal, tp, Math.min(MAX_TICK_MS, Math.max(0, dtMs)));
  // 2. progress を出して張りを計算し、保存する
  const curLen = s.lengths[s.current] ?? 0;
  const progress = (s.current + curLen / SECTION_LENGTH) / s.sections;
  const tension = tensionOf(pedal, tp, progress);
  let cur: WindingState = { ...s, pedal, tension };

  // 3. speed > 0 なら長さを進め、糸切れの判定をする
  const speed = speedOf(pedal, tp);
  if (speed > 0) {
    const dtMsClamped = Math.min(MAX_TICK_MS, Math.max(0, dtMs));
    const lengths = [...cur.lengths];
    const windMs = [...cur.windMs];
    const okMs = [...cur.okMs];
    lengths[cur.current] = (lengths[cur.current] ?? 0) + speed * dt;
    windMs[cur.current] = (windMs[cur.current] ?? 0) + dtMsClamped;
    if (tension >= tp.range.min && tension <= tp.range.max) {
      okMs[cur.current] = (okMs[cur.current] ?? 0) + dtMsClamped;
    }
    cur = { ...cur, lengths, windMs, okMs };

    const br = stepBreak(cur.brk, bp, dtMsClamped, tension, tp.range.max, cur.rng);
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

/** 平均 0.8 以上で3、0.6 以上で2、それ未満で1 */
export function starsOf(s: WindingState): 1 | 2 | 3 {
  const qs = qualities(s);
  const avg = qs.reduce((sum, q) => sum + q, 0) / qs.length;
  if (avg >= STARS3) return 3;
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
  for (const key of ['breaks', 'wrongTaps', 'tension'] as const) {
    if (typeof o[key] !== 'number' || !Number.isFinite(o[key])) return false;
  }
  if (typeof o.patternId !== 'string') return false;
  if (typeof o.rng !== 'number') return false;
  if (typeof o.pedal !== 'object' || o.pedal === null) return false;
  if (typeof o.brk !== 'object' || o.brk === null) return false;
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
