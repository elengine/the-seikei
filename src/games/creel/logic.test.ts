import { describe, it, expect } from 'vitest';
import { init, reduce, canHint, starsOf, showHinbanOnCone, isValidResume } from './logic';
import type { CreelState } from './logic';
import { getContent } from '../../core/content/content';

const content = getContent();

function s1State(): CreelState {
  const puzzle = content.creelPuzzles.find((p) => p.id === 's1')!;
  return init(puzzle, content);
}

function s4State(): CreelState {
  const puzzle = content.creelPuzzles.find((p) => p.id === 's4')!;
  return init(puzzle, content);
}

describe('init', () => {
  it('s1 の init で、軸 6、箱 1つ (kon-a)、tool は kon-a の箱', () => {
    const s = s1State();
    expect(s.cols).toBe(6);
    expect(s.rows).toBe(1);
    expect(s.placed).toEqual(Array(6).fill(null));
    expect(s.boxes).toEqual(['kon-a']);
    expect(s.tool).toEqual({ kind: 'box', yarn: 'kon-a' });
    expect(s.checks).toBe(0);
    expect(s.hints).toBe(0);
    expect(s.done).toBe(false);
    expect(s.marks).toBeNull();
    expect(s.inspected).toBeNull();
  });

  it('s4 の boxes が kon-a, kon-c, kon-b の順 (kon-b は紛らわしい箱)', () => {
    const s = s4State();
    expect(s.boxes).toEqual(['kon-a', 'kon-c', 'kon-b']);
    // 段階4以上では品番表示はしない
    expect(showHinbanOnCone(4)).toBe(false);
    expect(showHinbanOnCone(3)).toBe(true);
  });

  it('answerFor の結果が answer に入る (s1 は kon-a 6本)', () => {
    const s = s1State();
    expect(s.answer).toEqual(Array(6).fill('kon-a'));
  });
});

describe('tapCell と tool', () => {
  it('箱で全部正しく立てて check → done、starsOf が 3', () => {
    let s = s1State();
    for (let i = 0; i < 6; i++) {
      s = reduce(s, { type: 'tapCell', index: i });
    }
    s = reduce(s, { type: 'check' });
    expect(s.done).toBe(true);
    expect(s.marks).toBeNull();
    expect(s.checks).toBe(1);
    expect(starsOf(s)).toBe(3);
  });

  it('1つ違う糸・1つ空きで check → marks に入る。正しい糸を立てると marks から消える', () => {
    let s = s1State();
    s = reduce(s, { type: 'tapCell', index: 0 }); // kon-a (正解)
    s = reduce(s, { type: 'tapCell', index: 1 }); // kon-a (正解)
    s = reduce(s, { type: 'check' }); // 残り4つ空き
    expect(s.done).toBe(false);
    expect(s.marks).not.toBeNull();
    expect(s.marks!.wrong).toEqual([]); // 違う糸は無い (全部 null か正解)
    expect(s.marks!.empty).toEqual([2, 3, 4, 5]);
    // index 1 を別の糸に替えて、wrong を作る → s4 には kon-b があるが s1 には無い。
    // s1 の boxes は kon-a だけなので、wrong は箱を替えられない。→ 状態を手で作る
    const manual: CreelState = { ...s, placed: ['kon-a', 'kon-c', null, null, null, null] };
    const checked = reduce(manual, { type: 'check' });
    expect(checked.marks!.wrong).toEqual([1]);
    // 正しい糸を立てると marks から消える
    const fixed = reduce(checked, { type: 'tapCell', index: 1 });
    expect(fixed.marks!.wrong).toEqual([]);
    // 空きにも正しい糸を立てると empty から消える
    const fixed2 = reduce(fixed, { type: 'tapCell', index: 2 });
    expect(fixed2.marks!.empty).toEqual([3, 4, 5]);
  });

  it('はずすで null になる。しらべるで inspected が付き、次に箱を選ぶと null に戻る', () => {
    let s = s1State();
    s = reduce(s, { type: 'tapCell', index: 0 });
    expect(s.placed[0]).toBe('kon-a');
    s = reduce(s, { type: 'selectRemove' });
    s = reduce(s, { type: 'tapCell', index: 0 });
    expect(s.placed[0]).toBeNull();
    // しらべる (立っているコーン)
    s = reduce(s, { type: 'selectBox', yarn: 'kon-a' });
    s = reduce(s, { type: 'tapCell', index: 0 });
    s = reduce(s, { type: 'selectInspect' });
    s = reduce(s, { type: 'tapCell', index: 0 });
    expect(s.inspected).toBe(0);
    // 次に箱を選ぶと inspected は null に戻る
    s = reduce(s, { type: 'selectBox', yarn: 'kon-a' });
    expect(s.inspected).toBeNull();
    // 空いている軸を しらべる と inspected は null
    s = reduce(s, { type: 'selectInspect' });
    s = reduce(s, { type: 'tapCell', index: 3 });
    expect(s.placed[3]).toBeNull();
    expect(s.inspected).toBeNull();
  });

  it('tapCell の index が範囲外なら何もしない', () => {
    const s = s1State();
    const after = reduce(s, { type: 'tapCell', index: 99 });
    expect(after).toEqual(s);
  });
});

describe('check と hint', () => {
  it('check 1回ではヒント不可、2回目の失敗の後はヒント可。hint で一番小さい間違いが直る', () => {
    let s = s1State();
    // 1つ違う糸 (index 0 を kon-c にして失敗1回目)
    const wrong1: CreelState = { ...s, placed: ['kon-c', 'kon-a', 'kon-a', 'kon-a', 'kon-a', 'kon-a'] };
    s = reduce(wrong1, { type: 'check' });
    expect(canHint(s)).toBe(false); // checks 1回では不可
    // 失敗2回目
    const failed2 = reduce(s, { type: 'check' });
    expect(canHint(failed2)).toBe(true);
    // hint で一番小さい間違い (index 0) が直る
    const hinted = reduce(failed2, { type: 'hint' });
    expect(hinted.hints).toBe(1);
    expect(hinted.placed[0]).toBe('kon-a');
    expect(hinted.marks!.wrong).toEqual([]);
    expect(hinted.done).toBe(false); // hint だけでは done にしない
    // 最後は「たしかめる」
    const checked = reduce(hinted, { type: 'check' });
    expect(checked.done).toBe(true);
    expect(starsOf(checked)).toBe(1); // hints を使ったので 1
  });

  it('canHint は done なら false、marks が無ければ false', () => {
    const s = s1State();
    expect(canHint(s)).toBe(false); // checks 0・marks なし
    const checkedOnce: CreelState = { ...s, checks: 2, marks: { wrong: [], empty: [] } };
    expect(canHint(checkedOnce)).toBe(false); // wrong も empty も無い
  });
});

describe('done の後', () => {
  it('done の後の tapCell は状態を変えない', () => {
    let s = s1State();
    for (let i = 0; i < 6; i++) {
      s = reduce(s, { type: 'tapCell', index: i });
    }
    s = reduce(s, { type: 'check' });
    expect(s.done).toBe(true);
    const after = reduce(s, { type: 'tapCell', index: 0 });
    expect(after).toEqual(s);
    const after2 = reduce(s, { type: 'hint' });
    expect(after2).toEqual(s);
  });

  it('reduce は元の状態を書き換えない (JSON で比べる)', () => {
    const s = s1State();
    const before = JSON.stringify(s);
    void reduce(s, { type: 'tapCell', index: 0 });
    void reduce(s, { type: 'selectRemove' });
    void reduce(s, { type: 'tapCell', index: 0 });
    void reduce(s, { type: 'check' });
    void reduce(s, { type: 'hint' });
    expect(JSON.stringify(s1State())).toBe(before);
  });
});

describe('isValidResume', () => {
  it('正しい途中状態は true、存在しない puzzleId・長さ違い・done は false', () => {
    const s = s1State();
    const partial: CreelState = { ...s, placed: ['kon-a', null, null, null, null, null] };
    expect(isValidResume(structuredClone(partial), content)).toBe(true);

    const badId: CreelState = { ...partial, puzzleId: 's99' };
    expect(isValidResume(badId, content)).toBe(false);

    const badLen: CreelState = { ...partial, placed: ['kon-a', null] };
    expect(isValidResume(badLen, content)).toBe(false);

    const badAnswerLen: CreelState = { ...partial, answer: ['kon-a'] };
    expect(isValidResume(badAnswerLen, content)).toBe(false);

    const doneState: CreelState = { ...partial, done: true };
    expect(isValidResume(doneState, content)).toBe(false);

    expect(isValidResume({ foo: 1 }, content)).toBe(false);
    expect(isValidResume(null, content)).toBe(false);
  });
});
