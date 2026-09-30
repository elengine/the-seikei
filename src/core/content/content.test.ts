import { describe, it, expect } from 'vitest';
import { loadContent, getContent } from './content';

/** 検査に通る正しい1件分のデータ (個別のテストで壊して使う) */
function validRaw(): { colors: unknown; yarns: unknown; patterns: unknown; creelPuzzles: unknown } {
  return {
    colors: [{ id: 'kon', name: '紺', hex: '#1F2A44', symbol: '●' }],
    yarns: [{ id: 'kon-a', color: 'kon', hinban: 'W-4812', spec: 'ウール 2/48' }],
    patterns: [
      {
        id: 'p1',
        name: '無地',
        plan: [{ yarn: 'kon-a', count: 6 }],
        weft: 'kon',
        era: { from: 1967, to: 2004 },
        description: '説明',
        difficulty: 1,
      },
    ],
    creelPuzzles: [{ id: 's1', stage: 1, patternId: 'p1', rows: 1, cols: 6 }],
  };
}

describe('loadContent', () => {
  it('本物の4つの JSON を読み込むと problems が空で、お題15件・柄15件', () => {
    const content = getContent();
    expect(content.problems).toEqual([]);
    expect(content.creelPuzzles).toHaveLength(15);
    expect(content.patterns.size).toBe(15);
    // stage の昇順に並んでいる (各段階3題ずつ)
    const stages = content.creelPuzzles.map((p) => p.stage);
    expect(stages).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5]);
  });

  it('存在しない yarn を参照する柄は読み飛ばされ、problems に入る', () => {
    const raw = validRaw();
    (raw.patterns as { plan: unknown[] }[])[0]!.plan = [{ yarn: 'nai-yarn', count: 6 }];
    const content = loadContent(raw);
    expect(content.patterns.size).toBe(0);
    // 柄の1行 + その柄を参照するお題の1行 (連鎖して読み飛ばし)
    expect(content.problems).toHaveLength(2);
    expect(content.creelPuzzles).toHaveLength(0);
    expect(content.problems[0]).toContain('nai-yarn');
  });

  it('cols が 9 のお題は読み飛ばされる', () => {
    const raw = validRaw();
    (raw.creelPuzzles as { cols: number }[])[0]!.cols = 9;
    const content = loadContent(raw);
    expect(content.creelPuzzles).toHaveLength(0);
    expect(content.problems).toHaveLength(1);
  });

  it('tone が数値でない、または -30〜30 の外なら糸を読み飛ばして problems に入れる', () => {
    const raw = validRaw();
    const yarns = raw.yarns as unknown[];
    (yarns[0] as { tone: unknown }).tone = 'あかるい'; // 数値でない
    yarns.push({ id: 'kon-b', color: 'kon', hinban: 'W-4821', spec: 'ウール 2/60', tone: 40 }); // 範囲外
    const content = loadContent(raw);
    expect(content.yarns.size).toBe(0); // kon-a も kon-b も読み飛ばし
    // 糸2行 + 糸を参照する柄1行 + 柄を参照するお題1行 (連鎖)
    expect(content.problems).toHaveLength(4);
  });

  it('tone が -30〜30 の数値なら読み込まれる (省略してもよい)', () => {
    const raw = validRaw();
    const yarns = raw.yarns as unknown[];
    (yarns[0] as { tone: unknown }).tone = 18;
    yarns.push({ id: 'kon-b', color: 'kon', hinban: 'W-4821', spec: 'ウール 2/60' }); // tone なし
    yarns.push({ id: 'kon-c', color: 'kon', hinban: 'W-5310', spec: 'ウール紡毛 1/20', tone: -30 }); // 境界
    const content = loadContent(raw);
    expect(content.yarns.size).toBe(3);
    expect(content.problems).toHaveLength(0);
  });

  it('同じ品番が2つの糸に使われていたら、後の方を読み飛ばして problems に入れる', () => {
    const raw = validRaw();
    (raw.yarns as unknown[]).push({
      id: 'kon-b',
      color: 'kon',
      hinban: 'W-4812', // kon-a と同じ品番
      spec: 'ウール 2/60',
    });
    const content = loadContent(raw);
    expect(content.yarns.size).toBe(1); // 後の方 (kon-b) は読み飛ばし
    expect(content.yarns.has('kon-b')).toBe(false);
    expect(content.yarns.has('kon-a')).toBe(true);
    expect(content.problems).toHaveLength(1);
  });
});

describe('T1-16: お題15題・糸の色11色', () => {
  const content = getContent();

  it('色が11、糸が16、柄が15、お題が15', () => {
    expect(content.colors.size).toBe(11);
    expect(content.yarns.size).toBe(16);
    expect(content.patterns.size).toBe(15);
    expect(content.creelPuzzles).toHaveLength(15);
  });

  it('お題の順番: 段階が 1,1,1,2,2,2,3,3,3,4,4,4,5,5,5 の順に並ぶ', () => {
    const stages = content.creelPuzzles.map((p) => p.stage);
    expect(stages).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5]);
  });

  it('どの色の記号も重ならず、どの品番も重ならない', () => {
    const symbols = [...content.colors.values()].map((c) => c.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    const hinbans = [...content.yarns.values()].map((y) => y.hinban);
    expect(new Set(hinbans).size).toBe(hinbans.length);
  });

  it('15題すべてで answerFor の長さが rows × cols。段階1は色1つ、段階2は色2つ、段階4は同じ色で品番が違う糸を含む', async () => {
    const { answerFor } = await import('../../core/domain/stripe');
    for (const puzzle of content.creelPuzzles) {
      const pattern = content.patterns.get(puzzle.patternId)!;
      const answer = answerFor(puzzle, pattern);
      expect(answer).toHaveLength(puzzle.rows * puzzle.cols);
    }
    // 段階ごとの色数
    for (const puzzle of content.creelPuzzles) {
      const pattern = content.patterns.get(puzzle.patternId)!;
      const answer = answerFor(puzzle, pattern);
      const colors = new Set(answer.map((yarnId) => content.yarns.get(yarnId)!.color));
      if (puzzle.stage === 1) {
        expect(colors.size).toBe(1);
      } else if (puzzle.stage === 2) {
        expect(colors.size).toBe(2);
      } else if (puzzle.stage === 3) {
        expect(colors.size).toBeGreaterThanOrEqual(2);
        expect(colors.size).toBeLessThanOrEqual(3);
      } else if (puzzle.stage === 4) {
        // 同じ色で品番が違う糸を含む
        const byColor = new Map<string, Set<string>>();
        for (const yarnId of answer) {
          const color = content.yarns.get(yarnId)!.color;
          const set = byColor.get(color) ?? new Set<string>();
          set.add(yarnId);
          byColor.set(color, set);
        }
        const dup = [...byColor.values()].some((ids) => ids.size >= 2);
        expect(dup).toBe(true);
      }
    }
  });
});
