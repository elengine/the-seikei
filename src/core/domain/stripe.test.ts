import { describe, it, expect } from 'vitest';
import { expandPlan, toRuns, indexToCell, cellToIndex, answerFor, compare } from './stripe';
import { getContent } from '../content/content';

describe('expandPlan', () => {
  it('plan を繰り返して length 本にする (8本 = kon 7 + shiro 1)', () => {
    const seq = expandPlan([{ yarn: 'kon-a', count: 7 }, { yarn: 'shiro-a', count: 1 }], 8);
    expect(seq).toEqual(['kon-a', 'kon-a', 'kon-a', 'kon-a', 'kon-a', 'kon-a', 'kon-a', 'shiro-a']);
  });

  it('length 20 なら2回目の途中 (kon 4本) で打ち切られる', () => {
    const seq = expandPlan([{ yarn: 'kon-a', count: 7 }, { yarn: 'shiro-a', count: 1 }], 20);
    expect(seq).toHaveLength(20);
    // 8〜14 が kon-a (2回目の kon 7本)、15 が shiro-a、16〜19 が kon-a (3回目の途中)
    expect(seq.slice(8, 15)).toEqual(Array(7).fill('kon-a'));
    expect(seq[15]).toBe('shiro-a');
    expect(seq.slice(16, 20)).toEqual(Array(4).fill('kon-a'));
  });

  it('plan が空、または length が 0 以下なら空の配列', () => {
    expect(expandPlan([], 5)).toEqual([]);
    expect(expandPlan([{ yarn: 'kon-a', count: 3 }], 0)).toEqual([]);
    expect(expandPlan([{ yarn: 'kon-a', count: 3 }], -1)).toEqual([]);
  });
});

describe('toRuns', () => {
  it('同じ糸が続くところを1つにまとめる', () => {
    const seq = expandPlan([{ yarn: 'kon-a', count: 7 }, { yarn: 'shiro-a', count: 1 }], 8);
    expect(toRuns(seq)).toEqual([{ yarn: 'kon-a', count: 7 }, { yarn: 'shiro-a', count: 1 }]);
  });

  it('expandPlan → toRuns で元の plan に戻る (p-alt-kon)', () => {
    const plan = [
      { yarn: 'kon-a', count: 5 },
      { yarn: 'kon-b', count: 1 },
      { yarn: 'kon-a', count: 5 },
      { yarn: 'mizu-a', count: 1 },
    ];
    expect(toRuns(expandPlan(plan, 12))).toEqual(plan);
  });

  it('空の列は空の runs', () => {
    expect(toRuns([])).toEqual([]);
  });
});

describe('indexToCell / cellToIndex', () => {
  it('indexToCell(9, 8) は { row: 1, col: 1 }', () => {
    expect(indexToCell(9, 8)).toEqual({ row: 1, col: 1 });
  });

  it('0〜23 すべてで往復して一致する (cols=8, rows=3)', () => {
    for (let i = 0; i < 24; i++) {
      const cell = indexToCell(i, 8);
      expect(cellToIndex(cell.row, cell.col, 8)).toBe(i);
    }
  });

  it('上の段から、各段は左から (i=0 は左上、i=7 は1段目の右端)', () => {
    expect(indexToCell(0, 8)).toEqual({ row: 0, col: 0 });
    expect(indexToCell(7, 8)).toEqual({ row: 0, col: 7 });
    expect(indexToCell(8, 8)).toEqual({ row: 1, col: 0 });
  });
});

describe('compare', () => {
  it('違う糸は wrong、null は empty、正しいものはどちらにも入らない', () => {
    const answer = ['kon-a', 'kon-a', 'shiro-a', 'kon-a'];
    const placed = ['kon-a', 'kuro-a', null, 'kon-a'];
    const result = compare(placed, answer);
    expect(result.wrong).toEqual([1]);
    expect(result.empty).toEqual([2]);
  });

  it('長さが違えば例外を出す', () => {
    expect(() => compare(['kon-a'], ['kon-a', 'kon-a'])).toThrow();
  });
});

describe('answerFor (本物の内容データ)', () => {
  it('5つのお題すべてで長さが rows*cols と一致する', () => {
    const content = getContent();
    for (const puzzle of content.creelPuzzles) {
      const pattern = content.patterns.get(puzzle.patternId);
      expect(pattern).toBeDefined();
      const answer = answerFor(puzzle, pattern!);
      expect(answer).toHaveLength(puzzle.rows * puzzle.cols);
    }
  });

  it('s1 (1×6, 紺の無地) は kon-a が6本', () => {
    const content = getContent();
    const puzzle = content.creelPuzzles.find((p) => p.id === 's1')!;
    const answer = answerFor(puzzle, content.patterns.get('p-muji-kon')!);
    expect(answer).toEqual(Array(6).fill('kon-a'));
  });
});
