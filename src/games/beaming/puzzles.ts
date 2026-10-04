import type { Content } from '../../core/content/content';
import type { Level } from './params';
import { PUZZLE_STAGE } from '../winding/params';
import { STAGE_SECTION } from '../drumsetup/params';

/**
 * ビーム巻きのお題 (P3 T3-01)。クリール立てのお題 15 題から作る
 * (ドラム巻き・ドラム設定と同じ考え。データを二重に持たない)。
 * 巻き幅 (cm) = ドラム巻きの帯の数 × ドラム設定の帯の幅。
 */

export interface BeamingPuzzle {
  /** クリール立てのお題と同じ id (例 's2-3') */
  id: string;
  stage: 1 | 2 | 3 | 4 | 5;
  /** クリール立てと同じ柄 */
  patternId: string;
  /** 柄の名前 (例「紺地のピンストライプ」) */
  name: string;
  /** 巻き幅 (cm)。帯の数 × 帯の幅 */
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
      widthCm: PUZZLE_STAGE[stage]!.sections * STAGE_SECTION[stage]!.widthCm,
      level: (stage <= 2 ? 1 : stage <= 4 ? 2 : 3) as Level,
    };
  });
}
