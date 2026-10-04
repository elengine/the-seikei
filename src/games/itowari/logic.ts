import { SPINDLES, METER_MAX_M, LENGTH_STEP_M, WIND_ANIM_MS, EXTRA_TOL } from './params';
import type { ItowariPuzzle } from './puzzles';

/**
 * 糸割りのルール (P2b T2b-01)。
 * 口ごとに長さを設定して「巻き始める」と自動で止まり、巻き終わったら判定して、
 * 足りないものがあれば失敗 (長さの設定からやり直し)。
 */

/** 番手 (例 '2/48') を m/g にする。2/48 → 48 ÷ 2 = 24m/g */
export function metersPerGram(count: string): number {
  const parts = count.split('/');
  if (parts.length !== 2) return 0;
  const single = Number(parts[0]);
  const meters = Number(parts[1]);
  if (!Number.isFinite(single) || !Number.isFinite(meters) || single <= 0) return 0;
  return meters / single;
}

/** 正味の長さ (m)。長さ = (重さ − 芯) × m/g の切り捨て */
export function lengthOf(grossG: number, coreG: number, count: string): number {
  return Math.floor((grossG - coreG) * metersPerGram(count));
}

/** 口の1本の糸。slot 0 が元の糸、slot 1 は継ぎ足し */
export interface ItowariSegment {
  sourceId: string;
  /** 設定した長さ (m)。0 はまだ設定していない */
  lengthM: number;
}

export interface ItowariSpindle {
  segments: ItowariSegment[];
}

/** 判定で見つかった足りないもの */
export interface ItowariFailure {
  kind: 'sourceEmpty' | 'sourceShort' | 'madeShort';
  /** sourceEmpty・sourceShort のとき */
  sourceId?: string;
  /** madeShort・sourceEmpty のとき */
  spindle?: number;
  /** sourceShort: 引いた後に残る長さ (m) */
  leftM?: number;
  /** madeShort: 作ったコーンの長さ (m) */
  woundM?: number;
}

export type ItowariPhase = 'setup' | 'winding' | 'failed' | 'done';

export interface ItowariState {
  puzzleId: string;
  phase: ItowariPhase;
  /** 口 (SPINDLES 本)。segment が無い口は空 */
  spindles: ItowariSpindle[];
  /** 元の糸の残り (m)。sourceId → 残り */
  remaining: Record<string, number>;
  /** split で使い切った糸 (チーズ) の id。refill では増えない */
  used: string[];
  /** はかりに載せた糸の id (画面の表示用) */
  weighed: string[];
  /** 仕上がったコーンの長さ (m)。split ではチーズの残りも1本として入る */
  made: number[];
  /** 巻きの進み (0〜1) */
  progress: number;
  /** 巻いた回数 */
  runs: number;
  /** 失敗した回数 */
  failures: number;
  /** 前回の失敗 (巻き終わって足りなかったもの) */
  lastFailures: ItowariFailure[];
  /** 糸を継いだ口の累計 */
  spliced: number;
  /** 余分 (作ったコーンが要る長さを超えたぶん。最大、%) */
  extraPct: number;
}

export type ItowariAction =
  | { type: 'weigh'; sourceId: string }
  | { type: 'mount'; spindle: number; slot: 0 | 1; sourceId: string }
  | { type: 'unmount'; spindle: number; slot: 0 | 1 }
  | { type: 'setLength'; spindle: number; slot: 0 | 1; lengthM: number }
  | { type: 'start' }
  | { type: 'tick'; dtMs: number }
  | { type: 'retry' };

/** 最初の状態。元の糸の長さは重さと番手から出す */
export function init(puzzle: ItowariPuzzle): ItowariState {
  const remaining: Record<string, number> = {};
  for (const s of puzzle.sources) remaining[s.id] = lengthOf(s.grossG, puzzle.coreG, puzzle.count);
  return {
    puzzleId: puzzle.id,
    phase: 'setup',
    spindles: Array.from({ length: SPINDLES }, () => ({ segments: [] })),
    remaining,
    used: [],
    weighed: [],
    made: [],
    progress: 0,
    runs: 0,
    failures: 0,
    lastFailures: [],
    spliced: 0,
    extraPct: 0,
  };
}

const findSegment = (s: ItowariState, spindle: number, slot: 0 | 1): ItowariSegment | undefined =>
  s.spindles[spindle]?.segments[slot];

/** 糸を口にかけられるか (使っていない・ほかの口にかけていない) */
const canMount = (s: ItowariState, sourceId: string): boolean =>
  s.remaining[sourceId] !== undefined && !s.used.includes(sourceId) &&
  !s.spindles.some((sp) => sp.segments.some((seg) => seg.sourceId === sourceId));

/**
 * 巻き終わったときの判定 (純粋な関数)。
 * 足りないものがあれば failed (元の糸の残りは巻く前に戻す)。なければ進める。
 */
export function judgeRun(state: ItowariState, puzzle: ItowariPuzzle): ItowariState {
  const failures: ItowariFailure[] = [];
  const wound: Record<string, number> = {};
  for (let i = 0; i < state.spindles.length; i++) {
    const sp = state.spindles[i]!;
    let total = 0;
    for (const seg of sp.segments) {
      total += seg.lengthM;
      wound[seg.sourceId] = (wound[seg.sourceId] ?? 0) + seg.lengthM;
    }
    if (sp.segments.length > 0 && total < puzzle.needM) {
      failures.push({ kind: 'madeShort', spindle: i, woundM: total });
    }
  }
  for (const id of Object.keys(wound)) {
    const left = state.remaining[id]! - wound[id]!;
    if (left < 0) {
      const i = state.spindles.findIndex((sp) => sp.segments.some((seg) => seg.sourceId === id));
      failures.push({ kind: 'sourceEmpty', sourceId: id, spindle: i });
    } else if (left < puzzle.needM) {
      // split: チーズの半分を巻いた後に残りが要る長さに足りない。refill: 元のコーンの残りが足りない
      failures.push({ kind: 'sourceShort', sourceId: id, leftM: left });
    }
  }
  if (failures.length > 0) {
    return { ...state, phase: 'failed', failures: state.failures + 1, lastFailures: failures };
  }
  // 成功。元の糸の残りを減らし、コーンを数える
  const remaining = { ...state.remaining };
  const made = [...state.made];
  const used = [...state.used];
  let spliced = state.spliced;
  let extraPct = state.extraPct;
  for (const [id, w] of Object.entries(wound)) {
    remaining[id] = remaining[id]! - w;
    if (puzzle.kind === 'split') {
      used.push(id); // チーズは使い切り (半分ずつ2本)
      made.push(remaining[id]!); // チーズの残りも1本
    }
  }
  for (const sp of state.spindles) {
    if (sp.segments.length === 0) continue;
    const total = sp.segments.reduce((a, seg) => a + seg.lengthM, 0);
    made.push(total);
    const over = total - puzzle.needM;
    const base = puzzle.kind === 'split' ? (state.remaining[sp.segments[0]!.sourceId]!) / 2 : puzzle.needM;
    extraPct = Math.max(extraPct, (Math.abs(puzzle.kind === 'split' ? total - base : over) / base) * 100);
    if (sp.segments.length > 1) spliced++;
  }
  const next: ItowariState = {
    ...state,
    remaining,
    made,
    used,
    spliced,
    extraPct,
    spindles: state.spindles.map(() => ({ segments: [] })), // 口は空にする
    runs: state.runs + 1,
    progress: 0,
    lastFailures: [],
  };
  // split は作った本数が要る本数。refill は「要る本数 − 残っている本数」を作れば完成
  const target = puzzle.kind === 'split' ? puzzle.needCount : puzzle.needCount - puzzle.sources.length;
  next.phase = made.length >= target ? 'done' : 'setup';
  return next;
}

/** 状態を1歩進める。巻いているあいだは start・mount・setLength などを無視する */
export function reduce(state: ItowariState, action: ItowariAction, puzzle: ItowariPuzzle): ItowariState {
  if (action.type === 'tick') {
    if (state.phase !== 'winding') return state;
    const progress = Math.min(1, state.progress + action.dtMs / WIND_ANIM_MS);
    if (progress < 1) return { ...state, progress };
    return judgeRun(state, puzzle);
  }
  if (action.type === 'retry') {
    if (state.phase !== 'failed') return state;
    return { ...state, phase: 'setup', progress: 0 };
  }
  if (state.phase !== 'setup') return state; // 巻いている・終わったあとは設定を変えられない
  switch (action.type) {
    case 'weigh':
      if (state.remaining[action.sourceId] === undefined) return state;
      if (state.weighed.includes(action.sourceId)) return state;
      return { ...state, weighed: [...state.weighed, action.sourceId] };
    case 'mount': {
      if (action.slot === 1 && state.spindles[action.spindle]?.segments[0] === undefined) return state;
      if (!canMount(state, action.sourceId)) return state;
      if (findSegment(state, action.spindle, action.slot) !== undefined) return state;
      const spindles = state.spindles.map((sp, i) =>
        i === action.spindle
          ? { segments: [...sp.segments, { sourceId: action.sourceId, lengthM: 0 }] }
          : sp,
      );
      return { ...state, spindles };
    }
    case 'unmount': {
      if (action.slot === 1 && state.spindles[action.spindle]?.segments[1] === undefined) return state;
      const spindles = state.spindles.map((sp, i) =>
        i === action.spindle ? { segments: sp.segments.slice(0, action.slot) } : sp,
      );
      return { ...state, spindles };
    }
    case 'setLength': {
      const seg = findSegment(state, action.spindle, action.slot);
      if (seg === undefined) return state;
      const step = LENGTH_STEP_M;
      const lengthM = Math.min(METER_MAX_M, Math.max(0, Math.round(action.lengthM / step) * step));
      const spindles = state.spindles.map((sp, i) =>
        i === action.spindle
          ? { segments: sp.segments.map((s2, j) => (j === action.slot ? { ...s2, lengthM } : s2)) }
          : sp,
      );
      return { ...state, spindles };
    }
    case 'start': {
      const mounted = state.spindles.filter((sp) => sp.segments.length > 0);
      if (mounted.length === 0) return state;
      if (mounted.some((sp) => sp.segments.some((seg) => seg.lengthM <= 0))) return state;
      return { ...state, phase: 'winding', progress: 0 };
    }
    default:
      return state;
  }
}

/** 成績の行。失敗した回数・余分・巻いた回数・糸を継いだ口 */
export function resultOf(state: ItowariState, puzzle: ItowariPuzzle): { stars: 1 | 2 | 3; lines: string[] } {
  const minRuns = puzzle.kind === 'split' ? Math.ceil(puzzle.sources.length / SPINDLES) : 1;
  const lines = [
    `失敗した回数 ${state.failures}回`,
    `余分 ${state.extraPct.toFixed(1)}%`,
    `巻いた回数 ${state.runs}回(最少 ${minRuns}回)`,
    `糸を継いだ口 ${state.spliced}`,
  ];
  let stars: 1 | 2 | 3 = 1;
  if (state.failures <= 1) stars = 2;
  if (state.failures === 0 && state.extraPct <= EXTRA_TOL * 100 && state.runs <= minRuns) stars = 3;
  return { stars, lines };
}

/** 途中保存から復帰できる形か確かめる */
export function isValidResume(s: unknown): boolean {
  if (typeof s !== 'object' || s === null) return false;
  const st = s as ItowariState;
  if (typeof st.puzzleId !== 'string') return false;
  if (!['setup', 'winding', 'failed', 'done'].includes(st.phase)) return false;
  if (!Array.isArray(st.spindles) || st.spindles.length !== SPINDLES) return false;
  for (const sp of st.spindles) {
    if (typeof sp !== 'object' || sp === null || !Array.isArray(sp.segments)) return false;
    if (sp.segments.length > 2) return false;
    for (const seg of sp.segments) {
      if (typeof seg.sourceId !== 'string' || !Number.isInteger(seg.lengthM) || seg.lengthM < 0) return false;
    }
  }
  for (const v of Object.values(st.remaining ?? {})) {
    if (!Number.isFinite(v) || v < 0) return false;
  }
  for (const key of ['used', 'weighed', 'made', 'lastFailures'] as const) {
    if (!Array.isArray(st[key])) return false;
  }
  if (!Number.isFinite(st.progress) || st.progress < 0 || st.progress > 1) return false;
  if (!Number.isInteger(st.runs) || st.runs < 0) return false;
  if (!Number.isInteger(st.failures) || st.failures < 0) return false;
  if (!Number.isInteger(st.spliced) || st.spliced < 0) return false;
  if (!Number.isFinite(st.extraPct) || st.extraPct < 0) return false;
  return true;
}
