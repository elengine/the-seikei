import type { Content } from '../../core/content/content';
import type { Grade } from './params';
import { STAGE_SECTION } from './params';

/**
 * ドラム設定のお題 (T2c-01)。クリール立てのお題 (content.creelPuzzles) と同じ柄・同じ id で、
 * 番手は柄でいちばん多く使う糸の spec から、帯の本数と幅は段階の表から決める (データを二重に持たない)。
 */
export interface DrumSetupPuzzle {
  /** クリール立てのお題と同じ id (例 's2-3') */
  id: string;
  stage: 1 | 2 | 3 | 4 | 5;
  /** クリール立てと同じ柄 */
  patternId: string;
  /** 柄の名前 (例「紺地のピンストライプ」) */
  name: string;
  /** 番手 (柄でいちばん多く使う糸の spec から決める) */
  grade: Grade;
  /** 帯の本数 (段階の表どおり) */
  ends: number;
  /** 帯の幅 cm (段階の表どおり) */
  widthCm: number;
}

/**
 * 柄でいちばん多く使う糸の spec (T2-14b のドラム巻きと同じ決め方)。
 * 柄の plan の本数を糸ごとに合計し、いちばん多い糸を主な糸とする (同数のときは、あとに出てきた糸)。
 */
function mainYarnSpec(content: Content, patternId: string): string {
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

/** spec から番手を決める (T2c-01)。2/60 を含む → 2/60、1/20 または「紡毛」を含む → 1/20、それ以外 → 2/48 */
export function gradeOfSpec(spec: string): Grade {
  if (spec.includes('2/60')) {
    return '2/60';
  }
  if (spec.includes('1/20') || spec.includes('紡毛')) {
    return '1/20';
  }
  return '2/48';
}

/**
 * クリール立てのお題から、ドラム設定のお題15題を作る。
 * 帯の本数と幅は params の STAGE_SECTION (T2c-01)。
 */
export function drumSetupPuzzles(content: Content): DrumSetupPuzzle[] {
  const out: DrumSetupPuzzle[] = [];
  for (const cp of content.creelPuzzles) {
    const conf = STAGE_SECTION[cp.stage];
    if (conf === undefined) {
      continue; // 想定外の段階は読み飛ばす
    }
    const pattern = content.patterns.get(cp.patternId);
    out.push({
      id: cp.id,
      stage: cp.stage as 1 | 2 | 3 | 4 | 5,
      patternId: cp.patternId,
      name: pattern?.name ?? cp.patternId,
      grade: gradeOfSpec(mainYarnSpec(content, cp.patternId)),
      ends: conf.ends,
      widthCm: conf.widthCm,
    });
  }
  return out;
}
