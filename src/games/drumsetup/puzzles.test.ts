import { describe, it, expect } from 'vitest';
import { drumSetupPuzzles } from './puzzles';
import { getContent } from '../../core/content/content';
import { STAGE_SECTION } from './params';

const content = getContent();

describe('drumsetup puzzles T2c-01 (お題15題・クリール立てと同じ柄)', () => {
  it('1. お題は15題あり、id と柄 (patternId) はクリール立てのお題と同じ', () => {
    const ps = drumSetupPuzzles(content);
    expect(ps).toHaveLength(15);
    expect(ps.map((p) => p.id)).toEqual(content.creelPuzzles.map((p) => p.id));
    expect(ps.map((p) => p.patternId)).toEqual(content.creelPuzzles.map((p) => p.patternId));
  });

  it('2. 番手は、柄でいちばん多く使う糸の spec から決める (2/60・紡毛 1/20・2/48)', () => {
    const ps = drumSetupPuzzles(content);
    const byId = new Map(ps.map((p) => [p.id, p]));
    expect(byId.get('s4')!.grade).toBe('1/20'); // 紺のシャドーストライプ: 主な糸は紡毛 1/20
    expect(byId.get('s4-2')!.grade).toBe('2/60'); // チャコールのシャドーストライプ: 主な糸は 2/60
    expect(byId.get('s1')!.grade).toBe('2/48');
  });

  it('3. 帯の本数と幅は段階の表どおり (STAGE_SECTION)', () => {
    const ps = drumSetupPuzzles(content);
    for (const p of ps) {
      const conf = STAGE_SECTION[p.stage];
      expect(p.ends, `id ${p.id} の本数`).toBe(conf.ends);
      expect(p.widthCm, `id ${p.id} の幅`).toBe(conf.widthCm);
    }
  });
});
