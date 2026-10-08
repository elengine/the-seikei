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

describe('PU-07a: 引っぱる操作の reducer (place・removePeg・movePeg・pressPeg)', () => {
  it('place: その軸に糸が立ち (入れ替えでも上書き)、marks のその軸が消え、tool がその箱になる', () => {
    let s = s1State();
    s = reduce(s, { type: 'place', index: 2, yarn: 'kon-a' });
    expect(s.placed[2]).toBe('kon-a');
    const wrong: CreelState = { ...s, placed: ['kon-a', 'kon-a', 'kon-a', null, null, null], marks: { wrong: [], empty: [3, 4, 5] } };
    const after = reduce(wrong, { type: 'place', index: 3, yarn: 'kon-a' });
    expect(after.marks?.empty).toEqual([4, 5]);
    expect(after.tool).toEqual({ kind: 'box', yarn: 'kon-a' });
    // 入れ替え: すでに立っている軸に別の糸を立てる
    const s4 = s4State();
    const yarns = s4.boxes;
    let t = reduce(s4, { type: 'place', index: 0, yarn: yarns[0]! });
    t = reduce(t, { type: 'place', index: 0, yarn: yarns[1]! });
    expect(t.placed[0]).toBe(yarns[1]);
  });

  it('removePeg: 軸から外す。範囲外・空の軸は何もしない', () => {
    let s = reduce(s1State(), { type: 'place', index: 1, yarn: 'kon-a' });
    const before = s;
    expect(reduce(s, { type: 'removePeg', index: 4 })).toBe(before); // 空
    expect(reduce(s, { type: 'removePeg', index: 99 })).toBe(before);
    s = reduce(s, { type: 'removePeg', index: 1 });
    expect(s.placed[1]).toBeNull();
  });

  it('movePeg: from の糸を to へ移し、from は空く。to に糸があれば (前の糸は箱へ戻って) 上書き。from が空なら何もしない', () => {
    const s4 = s4State();
    let s = reduce(s4, { type: 'place', index: 0, yarn: s4.boxes[0]! });
    s = reduce(s, { type: 'place', index: 1, yarn: s4.boxes[1]! });
    const moved = reduce(s, { type: 'movePeg', from: 0, to: 1 });
    expect(moved.placed[0]).toBeNull();
    expect(moved.placed[1]).toBe(s4.boxes[0]);
    expect(reduce(s, { type: 'movePeg', from: 5, to: 1 })).toBe(s);
    expect(reduce(s, { type: 'movePeg', from: 0, to: 0 })).toBe(s);
  });

  it('pressPeg (PU-11a): 空の軸を押しても何も立たない (状態はそのまま)。糸のある軸なら吹き出し (inspected)。もう一度押すと消える', () => {
    let s = s1State();
    expect(reduce(s, { type: 'pressPeg', index: 0 })).toBe(s);
    s = reduce(s, { type: 'place', index: 0, yarn: 'kon-a' });
    s = reduce(s, { type: 'pressPeg', index: 0 });
    expect(s.inspected).toBe(0);
    expect(s.placed[0]).toBe('kon-a'); // 上書きや消去はしない
    s = reduce(s, { type: 'pressPeg', index: 0 });
    expect(s.inspected).toBeNull();
  });

  it('done の後はどれも状態を変えない', () => {
    let s = s1State();
    for (let i = 0; i < 6; i++) {
      s = reduce(s, { type: 'place', index: i, yarn: 'kon-a' });
    }
    s = reduce(s, { type: 'check' });
    expect(s.done).toBe(true);
    expect(reduce(s, { type: 'removePeg', index: 0 })).toBe(s);
    expect(reduce(s, { type: 'pressPeg', index: 0 })).toBe(s);
  });
});


describe('T1-23: クリール立てレベル2 の3題の並びに変化を付ける', () => {
  function answerOf(id: string): string[] {
    const puzzle = content.creelPuzzles.find((p) => p.id === id)!;
    return init(puzzle, content).answer;
  }

  it('s2 の答えの並び (展開した 8 本) は 紺3・白1・紺4', () => {
    expect(answerOf('s2')).toEqual([
      'kon-a', 'kon-a', 'kon-a', 'shiro-a', 'kon-a', 'kon-a', 'kon-a', 'kon-a',
    ]);
  });

  it('s2-2 の答えの並び (展開した 8 本) は 黒2・灰1・黒4・灰1', () => {
    expect(answerOf('s2-2')).toEqual([
      'kuro-a', 'kuro-a', 'hai-a', 'kuro-a', 'kuro-a', 'kuro-a', 'kuro-a', 'hai-a',
    ]);
  });

  it('s2-3 の答えの並び (展開した 8 本) は 茶3・ベージュ1・茶3・ベージュ1', () => {
    expect(answerOf('s2-3')).toEqual([
      'cha-a', 'cha-a', 'cha-a', 'beige-a', 'cha-a', 'cha-a', 'cha-a', 'beige-a',
    ]);
  });
});
