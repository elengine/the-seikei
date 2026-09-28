import type { StripePlan, StripeRun, YarnTypeId, CreelPuzzle, Pattern } from './types';

/** 柄の並び(1リピート)を繰り返して、length 本ぶんの糸の列にする。length 未満で打ち切る */
export function expandPlan(plan: StripePlan, length: number): YarnTypeId[] {
  if (plan.length === 0 || length <= 0) {
    return [];
  }
  const seq: YarnTypeId[] = [];
  while (seq.length < length) {
    for (const run of plan) {
      for (let n = 0; n < run.count && seq.length < length; n++) {
        seq.push(run.yarn);
      }
      if (seq.length >= length) {
        break;
      }
    }
  }
  return seq;
}

/** 糸の列を、同じ糸が続くところで1つにまとめる(依頼書の表用) */
export function toRuns(seq: YarnTypeId[]): StripeRun[] {
  const runs: StripeRun[] = [];
  for (const yarn of seq) {
    const last = runs[runs.length - 1];
    if (last !== undefined && last.yarn === yarn) {
      last.count += 1;
    } else {
      runs.push({ yarn, count: 1 });
    }
  }
  return runs;
}

/** 帯の番号 → クリールの位置(上の段から、各段は左から)。i は 段*列数+列 */
export function indexToCell(i: number, cols: number): { row: number; col: number } {
  return { row: Math.floor(i / cols), col: i % cols };
}

/** クリールの位置 → 帯の番号 */
export function cellToIndex(row: number, col: number, cols: number): number {
  return row * cols + col;
}

/** お題から、正解の帯の並び(rows*cols 本)を作る */
export function answerFor(puzzle: CreelPuzzle, pattern: Pattern): YarnTypeId[] {
  return expandPlan(pattern.plan, puzzle.rows * puzzle.cols);
}

/** 置いた並びと正解を比べ、間違い(違う糸)と空きの帯番号を返す */
export function compare(placed: (YarnTypeId | null)[], answer: YarnTypeId[]): { wrong: number[]; empty: number[] } {
  if (placed.length !== answer.length) {
    throw new Error(`placed と answer の長さが違います (${placed.length} / ${answer.length})`);
  }
  const wrong: number[] = [];
  const empty: number[] = [];
  for (let i = 0; i < answer.length; i++) {
    const p = placed[i];
    if (p === null) {
      empty.push(i);
    } else if (p !== answer[i]) {
      wrong.push(i);
    }
  }
  return { wrong, empty };
}
