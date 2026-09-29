import type { YarnTypeId, CreelPuzzle } from '../../core/domain/types';
import type { Content } from '../../core/content/content';
import { answerFor, compare } from '../../core/domain/stripe';
import { STARS3_CHECKS_MAX, STARS2_CHECKS_MAX, HINT_MIN_CHECKS, CONFUSING_BOXES_FROM_STAGE } from './params';

export type Tool = { kind: 'box'; yarn: YarnTypeId } | { kind: 'remove' } | { kind: 'inspect' };

export interface CreelState {
  puzzleId: string;
  stage: 1 | 2 | 3 | 4 | 5;
  rows: number;
  cols: number;
  answer: YarnTypeId[];              // 正解の帯の並び(rows*cols 本)
  boxes: YarnTypeId[];               // 操作欄に出す箱
  placed: (YarnTypeId | null)[];     // 軸ごとに立っている糸
  tool: Tool;
  checks: number;                    // 「たしかめる」を押した回数
  hints: number;
  marks: { wrong: number[]; empty: number[] } | null;   // 最後の判定の✕
  inspected: number | null;          // 「しらべる」で吹き出しを出している軸
  done: boolean;
}

export type CreelAction =
  | { type: 'selectBox'; yarn: YarnTypeId }
  | { type: 'selectRemove' }
  | { type: 'selectInspect' }
  | { type: 'tapCell'; index: number }
  | { type: 'check' }
  | { type: 'hint' }
  | { type: 'clearInspect' };

/** 操作欄に出す箱。answer に出てくる糸を最初に出てくる順に。段階4以上は紛らわしい箱 (同じ色で answer に無い糸) を品番の昇順で足す */
export function boxesFor(puzzle: CreelPuzzle, content: Content): YarnTypeId[] {
  const answer = answerFor(puzzle, content.patterns.get(puzzle.patternId)!);
  const boxes: YarnTypeId[] = [];
  for (const yarn of answer) {
    if (!boxes.includes(yarn)) {
      boxes.push(yarn);
    }
  }
  if (puzzle.stage >= CONFUSING_BOXES_FROM_STAGE) {
    // answer の糸と同じ色だが answer に無い糸を、品番の昇順で後ろに足す
    const answerColors = new Set(
      boxes.map((y) => content.yarns.get(y)?.color).filter((c) => c !== undefined),
    );
    const extra = [...content.yarns.values()]
      .filter((y) => answerColors.has(y.color) && !boxes.includes(y.id))
      .sort((a, b) => a.hinban.localeCompare(b.hinban))
      .map((y) => y.id);
    boxes.push(...extra);
  }
  return boxes;
}

/** ゲームの初期状態 */
export function init(puzzle: CreelPuzzle, content: Content): CreelState {
  const answer = answerFor(puzzle, content.patterns.get(puzzle.patternId)!);
  return {
    puzzleId: puzzle.id,
    stage: puzzle.stage,
    rows: puzzle.rows,
    cols: puzzle.cols,
    answer,
    boxes: boxesFor(puzzle, content),
    placed: Array(puzzle.rows * puzzle.cols).fill(null),
    tool: { kind: 'box', yarn: answer[0]! },
    checks: 0,
    hints: 0,
    marks: null,
    inspected: null,
    done: false,
  };
}

function removeValue(list: number[], index: number): number[] {
  return list.filter((n) => n !== index);
}

/** クリール立てのルール (純粋な reducer)。元の s は変更しない。done の後はどの操作でも状態を変えない */
export function reduce(s: CreelState, a: CreelAction): CreelState {
  if (s.done) {
    return s;
  }
  switch (a.type) {
    case 'selectBox':
      return { ...s, tool: { kind: 'box', yarn: a.yarn }, inspected: null };
    case 'selectRemove':
      return { ...s, tool: { kind: 'remove' }, inspected: null };
    case 'selectInspect':
      return { ...s, tool: { kind: 'inspect' } }; // しらべるを選ぶときは inspected を消さない
    case 'tapCell': {
      if (a.index < 0 || a.index >= s.placed.length) {
        return s; // 範囲外
      }
      if (s.tool.kind === 'box') {
        const placed = [...s.placed];
        placed[a.index] = s.tool.yarn;
        const marks = s.marks === null ? null : {
          wrong: removeValue(s.marks.wrong, a.index),
          empty: removeValue(s.marks.empty, a.index),
        };
        return { ...s, placed, marks, inspected: null };
      }
      if (s.tool.kind === 'remove') {
        const placed = [...s.placed];
        placed[a.index] = null;
        const marks = s.marks === null ? null : {
          wrong: removeValue(s.marks.wrong, a.index),
          empty: removeValue(s.marks.empty, a.index),
        };
        return { ...s, placed, marks, inspected: null };
      }
      // しらべる: 立っているコーンの品番を吹き出しで見せる
      return { ...s, inspected: s.placed[a.index] !== null ? a.index : null };
    }
    case 'check': {
      const marks = compare(s.placed, s.answer);
      const done = marks.wrong.length === 0 && marks.empty.length === 0;
      return {
        ...s,
        checks: s.checks + 1,
        marks: done ? null : marks,
        done,
        inspected: null,
      };
    }
    case 'hint': {
      if (!canHint(s)) {
        return s;
      }
      const targets = [...s.marks!.wrong, ...s.marks!.empty].sort((x, y) => x - y);
      const index = targets[0]!;
      const placed = [...s.placed];
      placed[index] = s.answer[index]!;
      const marks = s.marks === null ? null : {
        wrong: removeValue(s.marks.wrong, index),
        empty: removeValue(s.marks.empty, index),
      };
      return { ...s, placed, hints: s.hints + 1, marks, inspected: null };
    }
    case 'clearInspect':
      return { ...s, inspected: null };
  }
}

/** ヒントを使えるか: done でなく、checks が HINT_MIN_CHECKS 以上で、marks に wrong か empty がある */
export function canHint(s: CreelState): boolean {
  if (s.done) {
    return false;
  }
  if (s.checks < HINT_MIN_CHECKS) {
    return false;
  }
  if (s.marks === null) {
    return false;
  }
  return s.marks.wrong.length > 0 || s.marks.empty.length > 0;
}

/** 星: checks 1 かつ hints 0 なら 3。checks 3 以下かつ hints 0 なら 2。それ以外は 1 */
export function starsOf(s: CreelState): 1 | 2 | 3 {
  if (s.checks <= STARS3_CHECKS_MAX && s.hints === 0) {
    return 3;
  }
  if (s.checks <= STARS2_CHECKS_MAX && s.hints === 0) {
    return 2;
  }
  return 1;
}

/** 段階 1〜3 はコーンに品番を表示する */
export function showHinbanOnCone(stage: number): boolean {
  return stage <= 3;
}

/** 途中保存の形が正しく、puzzleId が内容データに存在し、placed・answer の長さが rows*cols と一致し、done が false のときだけ true */
export function isValidResume(x: unknown, content: Content): x is CreelState {
  if (typeof x !== 'object' || x === null) {
    return false;
  }
  const o = x as Record<string, unknown>;
  if (typeof o.puzzleId !== 'string') {
    return false;
  }
  const puzzle = content.creelPuzzles.find((p) => p.id === o.puzzleId);
  if (puzzle === undefined) {
    return false;
  }
  const total = puzzle.rows * puzzle.cols;
  if (!Array.isArray(o.placed) || o.placed.length !== total) {
    return false;
  }
  if (!Array.isArray(o.answer) || o.answer.length !== total) {
    return false;
  }
  for (const p of o.placed) {
    if (p !== null && typeof p !== 'string') {
      return false;
    }
  }
  if (o.done === true) {
    return false;
  }
  return true;
}
