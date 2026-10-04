import { describe, it, expect } from 'vitest';
import { beamingPuzzles } from './puzzles';
import { getContent } from '../../core/content/content';
import { PUZZLE_STAGE } from '../winding/params';
import { STAGE_SECTION } from '../drumsetup/params';

const content = getContent();

describe('beaming puzzles T3-01 (お題15題・巻き幅)', () => {
  it('1. お題は15題あり、id と柄 (patternId) はクリール立てのお題と同じ', () => {
    const ps = beamingPuzzles(content);
    expect(ps).toHaveLength(15);
    expect(ps.map((p) => p.id)).toEqual(content.creelPuzzles.map((p) => p.id));
    expect(ps.map((p) => p.patternId)).toEqual(content.creelPuzzles.map((p) => p.patternId));
  });

  it('2. 巻き幅 (widthCm) = ドラム巻きの帯の数 × ドラム設定の帯の幅 (レベル1 の s1 は 3 × 20 = 60cm)', () => {
    const ps = beamingPuzzles(content);
    for (const p of ps) {
      const sections = PUZZLE_STAGE[p.stage]!.sections;
      const width = STAGE_SECTION[p.stage]!.widthCm;
      expect(p.widthCm, `stage ${p.stage}`).toBe(sections * width);
    }
    const s1 = ps.find((p) => p.id === 's1')!;
    expect(s1.widthCm).toBe(60);
  });

  it('3. level は段階1〜2が1、3〜4が2、5が3', () => {
    const ps = beamingPuzzles(content);
    const want: Record<number, 1 | 2 | 3> = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 };
    for (const p of ps) {
      expect(p.level, `stage ${p.stage}`).toBe(want[p.stage]!);
    }
  });

  it('4. name は柄の名前 (s1 は p-muji-kon の名前)', () => {
    const ps = beamingPuzzles(content);
    const s1 = ps.find((p) => p.id === 's1')!;
    expect(s1.name).toBe(content.patterns.get('p-muji-kon')!.name);
    for (const p of ps) {
      expect(p.name.length, `id ${p.id} の名前`).toBeGreaterThan(0);
    }
  });
});
