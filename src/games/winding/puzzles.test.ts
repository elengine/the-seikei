import { describe, it, expect } from 'vitest';
import { windingPuzzles } from './puzzles';
import { getContent } from '../../core/content/content';
import { PUZZLE_STAGE } from './params';

const content = getContent();

describe('winding puzzles T2-14a (お題15題・クリール立てと同じ柄)', () => {
  it('1. お題は15題あり、id と柄 (patternId) はクリール立てのお題と同じ', () => {
    const ps = windingPuzzles(content);
    expect(ps).toHaveLength(15);
    expect(ps.map((p) => p.id)).toEqual(content.creelPuzzles.map((p) => p.id));
    expect(ps.map((p) => p.patternId)).toEqual(content.creelPuzzles.map((p) => p.patternId));
  });

  it('2. 段階ごとの帯の数と難易度が表のとおり (1:3本初級・2:4本初級・3:5本中級・4:6本中級・5:7本上級)', () => {
    const ps = windingPuzzles(content);
    const want: Record<number, { sections: number; level: 1 | 2 | 3 }> = {
      1: { sections: 3, level: 1 },
      2: { sections: 4, level: 1 },
      3: { sections: 5, level: 2 },
      4: { sections: 6, level: 2 },
      5: { sections: 7, level: 3 },
    };
    for (const p of ps) {
      expect(p.sections, `stage ${p.stage}`).toBe(want[p.stage]!.sections);
      expect(p.level, `stage ${p.stage}`).toBe(want[p.stage]!.level);
      expect(PUZZLE_STAGE[p.stage]!.sections).toBe(want[p.stage]!.sections);
    }
  });

  it('3. name は柄の名前 (s1 は p-muji-kon の名前)', () => {
    const ps = windingPuzzles(content);
    const s1 = ps.find((p) => p.id === 's1')!;
    expect(s1.name).toBe(content.patterns.get('p-muji-kon')!.name);
    for (const p of ps) {
      expect(p.name.length, `id ${p.id} の名前`).toBeGreaterThan(0);
    }
  });
});
