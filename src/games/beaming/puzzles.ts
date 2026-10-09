import type { Content } from '../../core/content/content';
import type { Level } from './params';
import { BEAM_WIDTH_BY_STAGE } from './params';

/**
 * ビーム巻きのお題 (P3 T3-01)。クリール立てのお題 15 題から作る
 * (ドラム巻き・ドラム設定と同じ考え。データを二重に持たない)。
 * 巻き幅 (cm) はビーミングだけの表 BEAM_WIDTH_BY_STAGE (T3-09。150〜200cm)。
 * 依頼票の「帯 N本」は今のとおりドラム巻きの帯の数 (index.ts の bandsOf)。
 */

export interface BeamingPuzzle {
  /** クリール立てのお題と同じ id (例 's2-3') */
  id: string;
  stage: 1 | 2 | 3 | 4 | 5;
  /** クリール立てと同じ柄 */
  patternId: string;
  /** 柄の名前 (例「紺地のピンストライプ」) */
  name: string;
  /** 巻き幅 (cm)。BEAM_WIDTH_BY_STAGE の段階ごとの値 (T3-09) */
  widthCm: number;
  /** 難易度の数値 (段階1〜2 は 1、3〜4 は 2、5 は 3) */
  level: Level;
}

/** クリール立てのお題から、ビーム巻きのお題15題を作る */
export function beamingPuzzles(content: Content): BeamingPuzzle[] {
  return content.creelPuzzles.map((cp) => {
    const stage = cp.stage as 1 | 2 | 3 | 4 | 5;
    return {
      id: cp.id,
      stage,
      patternId: cp.patternId,
      name: content.patterns.get(cp.patternId)?.name ?? cp.patternId,
      widthCm: BEAM_WIDTH_BY_STAGE[stage],
      level: (stage <= 2 ? 1 : stage <= 4 ? 2 : 3) as Level,
    };
  });
}

/** id でお題を探す (無ければ null) */
export function puzzleById(content: Content, id: string): BeamingPuzzle | null {
  return beamingPuzzles(content).find((p) => p.id === id) ?? null;
}
