import { describe, it, expect } from 'vitest';
import { resultOf } from './messages';
import { init } from './logic';

describe('resultOf (PU-05c: 結果の行と星3の条件。T2-13c で行が4つに)', () => {
  it('resultLines は4行 (項目と値の組)。starHint は星3の条件。summary も残る。「違う端を結ぼうとした回数」は無い', () => {
    const s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    const r = resultOf(s, 'standalone', '2026-10-05T00:00:00Z');
    expect(r.resultLines).toHaveLength(4);
    expect(r.resultLines!.map((l) => l.label)).toEqual([
      '適正な張りで巻いた割合',
      '巻いた時間',
      '糸切れ',
      '違う糸を押した回数',
    ]);
    expect(r.resultLines![0]!.value).toMatch(/%$/);
    expect(r.resultLines![2]!.value).toBe('0回');
    expect(r.starHint).toBe('適正な張りが8割以上、目標の時間内で星3です');
    expect(r.summary).toHaveLength(4);
  });
});
