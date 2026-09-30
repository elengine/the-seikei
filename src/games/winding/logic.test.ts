import { describe, it, expect } from 'vitest';
import { init, reduce, qualities, starsOf, isValidResume, lastTapResult } from './logic';
import type { WindingState } from './logic';
import { paramsOf, SECTION_LENGTH, MAX_SPEED } from './params';

/** 20秒 + 少し の tick を送る (pedal 50 用)。pedal 40 など遅いときは、'cutting' まで続ける */
function windToCut(s: WindingState, pedal: number): WindingState {
  let cur = reduce(s, { type: 'start' });
  cur = reduce(cur, { type: 'setPedal', value: pedal });
  for (let i = 0; i < 500; i++) {
    if (cur.phase !== 'winding') break;
    cur = reduce(cur, { type: 'tick', dtMs: 100 });
  }
  return cur;
}

describe('winding logic (T2-04)', () => {
  it("1. init → start → setPedal(50) → 20秒+ の tick で帯0が 'cutting' になり、ペダルが 0", () => {
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    expect(s.phase).toBe('ready');
    expect(s.current).toBe(0);
    s = reduce(s, { type: 'start' });
    expect(s.phase).toBe('winding');
    s = reduce(s, { type: 'setPedal', value: 50 });
    for (let i = 0; i < 201; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.phase).toBe('cutting');
    expect(s.pedal.pedal).toBe(0);
    // lengths[0] は SECTION_LENGTH に揃えられる
    expect(s.lengths[0]).toBe(SECTION_LENGTH);
  });

  it("2. 'ready' のとき setPedal は効かない。'broken' のときも効かない", () => {
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    s = reduce(s, { type: 'setPedal', value: 50 });
    expect(s.pedal.pedal).toBe(0);
    // broken を作る: 上級で pedal 100
    let b = init({ level: 3, patternId: 'p-alt-kon', sections: 7, seed: 42 });
    b = reduce(b, { type: 'start' });
    for (let i = 0; i < 200; i++) {
      if (b.phase === 'broken') break;
      if (b.phase === 'winding') b = reduce(b, { type: 'setPedal', value: 100 });
      b = reduce(b, { type: 'tick', dtMs: 100 });
    }
    expect(b.phase).toBe('broken');
    const atBroken = b.pedal.pedal; // 切れた瞬間に 0 になっている
    const b2 = reduce(b, { type: 'setPedal', value: 80 });
    expect(b2.pedal.pedal).toBe(atBroken);
    expect(atBroken).toBe(0);
  });

  it('3. tick の dtMs 5000 は 100 として扱われる (長さの増え方で)', () => {
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    s = reduce(s, { type: 'start' });
    s = reduce(s, { type: 'setPedal', value: 50 });
    // 1回の tick dtMs=5000 → 100ms ぶんしか進まない
    const after = reduce(s, { type: 'tick', dtMs: 5000 });
    const speed = MAX_SPEED * 0.5;
    expect(after.lengths[0]).toBeCloseTo(speed * 0.1, 5);
  });

  it('4. pedal 40 (安全なペダル) で全帯を巻くと、糸切れ0回・qualities すべて1・星3 (cut を挟む)', () => {
    const p3 = paramsOf(3);
    let s = init({ level: 3, patternId: p3.patternId, sections: p3.sections, seed: 7 });
    for (let sec = 0; sec < p3.sections; sec++) {
      s = windToCut(s, 40);
      expect(s.phase).toBe('cutting');
      if (sec < p3.sections - 1) {
        s = reduce(s, { type: 'cut' });
        expect(s.phase).toBe('winding');
      }
    }
    s = reduce(s, { type: 'cut' });
    expect(s.phase).toBe('done');
    expect(s.breaks).toBe(0);
    const qs = qualities(s);
    expect(qs.length).toBe(p3.sections);
    for (const q of qs) expect(q).toBe(1);
    expect(starsOf(s)).toBe(3);
  });

  it("5. pedal 100 で巻くと、上級では同じ種で決まった回で 'broken'。切れた直後にペダル 0。tapEnd で creel → drum で 'winding' に戻り、ペダル 0 のまま、breaks 1", () => {
    const p3 = paramsOf(3);
    const run = () => {
      let s = init({ level: 3, patternId: p3.patternId, sections: p3.sections, seed: 99 });
      s = reduce(s, { type: 'start' });
      for (let i = 0; i < 300; i++) {
        if (s.phase === 'broken') break;
        if (s.phase === 'winding') s = reduce(s, { type: 'setPedal', value: 100 });
        s = reduce(s, { type: 'tick', dtMs: 100 });
      }
      return s;
    };
    const a = run();
    const b = run();
    expect(a.phase).toBe('broken');
    expect(a.breaks).toBe(1);
    expect(a.pedal.pedal).toBe(0);
    // 同じ種なら同じ結果 (決まった回で切れる)
    expect(a.current).toBe(b.current);
    expect(a.lengths[0]).toBe(b.lengths[0]);
    // tapEnd で creel → drum
    if (a.brk.kind !== 'broken') throw new Error('brk should be broken');
    let next = reduce(a, { type: 'tapEnd', thread: a.brk.thread, side: 'creel' });
    expect(next.phase).toBe('broken');
    next = reduce(next, { type: 'tapEnd', thread: a.brk.thread, side: 'drum' });
    expect(next.phase).toBe('winding');
    expect(next.pedal.pedal).toBe(0); // ペダルは 0 のまま
    expect(next.breaks).toBe(1);
    expect(lastTapResult(a, next)).toBe('tied');
  });

  it('6. 別の糸を押すと wrongTaps + 1', () => {
    const p3 = paramsOf(3);
    let s = init({ level: 3, patternId: p3.patternId, sections: p3.sections, seed: 99 });
    s = reduce(s, { type: 'start' });
    for (let i = 0; i < 300; i++) {
      if (s.phase === 'broken') break;
      if (s.phase === 'winding') s = reduce(s, { type: 'setPedal', value: 100 });
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.phase).toBe('broken');
    if (s.brk.kind !== 'broken') throw new Error('brk should be broken');
    const wrong = s.brk.thread === 0 ? 1 : 0;
    const next = reduce(s, { type: 'tapEnd', thread: wrong, side: 'creel' });
    expect(next.wrongTaps).toBe(s.wrongTaps + 1);
    expect(lastTapResult(s, next)).toBe('wrongThread');
  });

  it('7. 止まっている時間 (pedal 0) は windMs に入らない', () => {
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    s = reduce(s, { type: 'start' });
    // pedal 0 のまま tick
    s = reduce(s, { type: 'tick', dtMs: 100 });
    s = reduce(s, { type: 'tick', dtMs: 100 });
    expect(s.windMs[0]).toBe(0);
    // 動かしたぶんだけ入る
    s = reduce(s, { type: 'setPedal', value: 50 });
    s = reduce(s, { type: 'tick', dtMs: 100 });
    expect(s.windMs[0]).toBeCloseTo(100, 5);
  });

  it("8. 最後の帯で cut → 'done'。'done' の後の操作は状態を変えない", () => {
    const p1 = paramsOf(1);
    let s = init({ level: 1, patternId: p1.patternId, sections: p1.sections, seed: 1 });
    for (let sec = 0; sec < p1.sections - 1; sec++) {
      s = windToCut(s, 50);
      s = reduce(s, { type: 'cut' });
    }
    s = windToCut(s, 50);
    const done = reduce(s, { type: 'cut' });
    expect(done.phase).toBe('done');
    // 'done' の後はどの操作でも状態を変えない
    let cur = done;
    cur = reduce(cur, { type: 'start' });
    cur = reduce(cur, { type: 'setPedal', value: 50 });
    cur = reduce(cur, { type: 'tick', dtMs: 100 });
    cur = reduce(cur, { type: 'cut' });
    cur = reduce(cur, { type: 'tapEnd', thread: 0, side: 'creel' });
    cur = reduce(cur, { type: 'pausePedal' });
    expect(cur).toEqual(done);
  });

  it('9. starsOf: 平均 0.85 → 3、0.7 → 2、0.5 → 1', () => {
    const mk = (q: number): WindingState => {
      const s = init({ level: 1, patternId: 'p-pin-kon', sections: 2, seed: 1 });
      return {
        ...s,
        sections: 2,
        windMs: [100, 100],
        okMs: [q * 100, q * 100],
      };
    };
    expect(starsOf(mk(0.85))).toBe(3);
    expect(starsOf(mk(0.7))).toBe(2);
    expect(starsOf(mk(0.5))).toBe(1);
  });

  it('10. isValidResume: init の結果は true、配列の長さが違うと false', () => {
    const s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    expect(isValidResume(s)).toBe(true);
    expect(isValidResume({ ...s, lengths: [0, 0] })).toBe(false);
    expect(isValidResume({ ...s, windMs: [0, 0, 0, 0] })).toBe(false);
    expect(isValidResume({ ...s, okMs: [0, 0] })).toBe(false);
    expect(isValidResume({ ...s, phase: 'unknown' })).toBe(false);
    expect(isValidResume(null)).toBe(false);
  });
});
