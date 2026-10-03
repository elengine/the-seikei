import type { Content } from '../../core/content/content';
import type { Level, YarnFeel } from './params';
import { PUZZLE_STAGE } from './params';

/**
 * ドラム巻きのお題 (T2-14a)。クリール立てのお題 (content.creelPuzzles) と同じ柄・同じ id で、
 * 段階ごとの帯の数と難易度を割り当てる (データを二重に持たない)。
 */
export interface WindingPuzzle {
  /** クリール立てのお題と同じ id (例 's2-3') */
  id: string;
  stage: 1 | 2 | 3 | 4 | 5;
  /** クリール立てと同じ柄 */
  patternId: string;
  /** 柄の名前 (例「紺地のピンストライプ」) */
  name: string;
  /** 帯の数 (段階の表どおり) */
  sections: number;
  /** 張り・糸切れなどの難易度の数値 (params の初級・中級・上級) */
  level: Level;
  /** 糸の手応え (T2-14b。柄でいちばん多く使う糸で決める) */
  feel: YarnFeel;
}

/**
 * 糸の spec (例「ウール 2/60」「ウール紡毛 1/20」) から手応えを決める (T2-14b)。
 * 紡毛、または番手の数が 30 以下なら太い糸。番手の数が 60 以上なら細い糸。それ以外は標準。
 */
export function yarnFeelOf(spec: string): YarnFeel {
  const m = spec.match(/(\d+)\s*\/\s*(\d+)/);
  const count = m !== null ? Number(m[2]) : NaN;
  if (spec.includes('紡毛') || count <= 30) {
    return 'thick';
  }
  if (count >= 60) {
    return 'fine';
  }
  return 'standard';
}

/** 手応えを短く出すときの言葉 (T2-14b)。標準は空文字 */
export function feelLabel(feel: YarnFeel): string {
  if (feel === 'fine') return '細い糸(切れやすい)';
  if (feel === 'thick') return '太い糸(流れやすい)';
  return '';
}

/**
 * 柄でいちばん多く使う糸の spec (T2-14b)。柄の plan の本数を糸ごとに合計し、
 * いちばん多い糸を主な糸とする (同数のときは、あとに出てきた糸を主な糸とする)。
 */
export function mainYarnSpec(content: Content, patternId: string): string {
  const pattern = content.patterns.get(patternId);
  if (pattern === undefined) {
    return '';
  }
  const totals = new Map<string, number>();
  for (const e of pattern.plan) {
    totals.set(e.yarn, (totals.get(e.yarn) ?? 0) + e.count);
  }
  let best: string | null = null;
  let bestCount = -1;
  for (const e of pattern.plan) {
    const c = totals.get(e.yarn) ?? 0;
    if (c >= bestCount) {
      bestCount = c;
      best = e.yarn; // 同数なら、あとに出てきた糸で上書きする
    }
  }
  return best !== null ? (content.yarns.get(best)?.spec ?? '') : '';
}

/**
 * クリール立てのお題から、ドラム巻きのお題15題を作る。
 * 段階ごとの帯の数と難易度は params の PUZZLE_STAGE (T2-14a)。
 * 手応えは、柄でいちばん多く使う糸の spec から決める (T2-14b)。
 */
export function windingPuzzles(content: Content): WindingPuzzle[] {
  const out: WindingPuzzle[] = [];
  for (const cp of content.creelPuzzles) {
    const stageConf = PUZZLE_STAGE[cp.stage];
    if (stageConf === undefined) {
      continue; // 想定外の段階は読み飛ばす
    }
    const pattern = content.patterns.get(cp.patternId);
    out.push({
      id: cp.id,
      stage: cp.stage as 1 | 2 | 3 | 4 | 5,
      patternId: cp.patternId,
      name: pattern?.name ?? cp.patternId,
      sections: stageConf.sections,
      level: stageConf.level,
      feel: yarnFeelOf(mainYarnSpec(content, cp.patternId)),
    });
  }
  return out;
}

/** id でお題を探す (無ければ null) */
export function puzzleById(content: Content, id: string): WindingPuzzle | null {
  return windingPuzzles(content).find((p) => p.id === id) ?? null;
}
