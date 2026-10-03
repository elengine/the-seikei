import type { Content } from '../../core/content/content';
import type { Level } from './params';
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
}

/**
 * クリール立てのお題から、ドラム巻きのお題15題を作る。
 * 段階ごとの帯の数と難易度は params の PUZZLE_STAGE (T2-14a)。
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
    });
  }
  return out;
}

/** id でお題を探す (無ければ null) */
export function puzzleById(content: Content, id: string): WindingPuzzle | null {
  return windingPuzzles(content).find((p) => p.id === id) ?? null;
}
