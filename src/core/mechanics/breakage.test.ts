import { describe, it, expect } from 'vitest';
import { initBreak, stepBreak, tapEnd } from './breakage';
import type { BreakParams } from './breakage';
import { seedFrom } from '../clock/clock';

/** テスト用のパラメータ (T2-09b の初期値) */
function params(overrides?: Partial<BreakParams>): BreakParams {
  return {
    checkMs: 500,
    rate: 0.02,
    maxChance: 0.5,
    threadCount: 8,
    extraStep: 9,
    maxThreads: 3,
    ...overrides,
  };
}

describe('breakage (T2-02 の共通の決まり。T2-09b で型を変えた)', () => {
  it('1. tension が範囲内なら、10分ぶん進めても切れない', () => {
    const p = params();
    let s = initBreak();
    let rng = seedFrom(1);
    let broke = false;
    for (let i = 0; i < 600; i++) {
      const r = stepBreak(s, p, 1000, 56, 56, rng);
      s = r.state;
      rng = r.rng;
      if (r.broke) broke = true;
    }
    expect(broke).toBe(false);
    expect(s.kind).toBe('running');
  });

  it('2. 外れ方で本数が決まる: 外れ 1〜extraStep-1 なら 1本、extraStep ずつで +1本、最大 maxThreads。どの糸が切れるかは乱数で重ならない', () => {
    const p = params({ extraStep: 9, maxThreads: 3 });
    const run = (excess: number) => {
      let s = initBreak();
      let rng = seedFrom(77);
      for (let i = 0; i < 100; i++) {
        const r = stepBreak(s, p, 500, 56 + excess, 56, rng);
        s = r.state;
        rng = r.rng;
        if (r.broke) break;
      }
      return s;
    };
    // 外れ 1 (chance 0.02 なので切れるまで回る) → 1本
    const one = run(1);
    if (one.kind === 'broken') expect(one.threads.length).toBe(1);
    // 外れ 12 (1 + floor(12/9) = 2本)
    const two = run(12);
    if (two.kind === 'broken') expect(two.threads.length).toBe(2);
    // 外れ 40 (1 + floor(40/9) = 5 → 最大 3本)
    const many = run(40);
    if (many.kind === 'broken') {
      expect(many.threads.length).toBe(3);
      // 重ならない
      expect(new Set(many.threads).size).toBe(many.threads.length);
      for (const t of many.threads) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(7);
      }
    }
  });

  it('3. 同じ種と同じ入力なら同じ結果 (本数とどの糸も)', () => {
    const p = params();
    const run = () => {
      let s = initBreak();
      let rng = seedFrom(4242);
      for (let i = 0; i < 100; i++) {
        const r = stepBreak(s, p, 500, 80, 56, rng);
        s = r.state;
        rng = r.rng;
        if (r.broke) break;
      }
      return s;
    };
    expect(run()).toEqual(run());
  });

  it('4. dtMs 1200・checkMs 500 で、判定が2回行われ、sinceCheckMs が 200 になる (切れない条件で)', () => {
    const p = params();
    const s0 = initBreak();
    const r = stepBreak(s0, p, 1200, 56, 56, seedFrom(1));
    expect(r.state.kind).toBe('running');
    if (r.state.kind === 'running') {
      expect(r.state.sinceCheckMs).toBe(200);
    }
  });

  it("5. 'broken' の間は stepBreak が何もしない", () => {
    const p = params();
    const broken = { kind: 'broken' as const, threads: [3], tied: [], first: null };
    const r = stepBreak(broken, p, 1200, 80, 56, seedFrom(1));
    expect(r.state).toEqual(broken);
    expect(r.broke).toBe(false);
    expect(r.rng).toBe(seedFrom(1));
  });
});

describe('breakage T2-09b (複数の糸切れのつなぎ方)', () => {
  const broken2 = { kind: 'broken' as const, threads: [2, 5], tied: [], first: null };

  it("6. 1手目: 切れた糸の端を押すと 'first'。どちら側でもよい。押した端に first が記録される", () => {
    const r1 = tapEnd(broken2, 2, 'creel');
    expect(r1.result).toBe('first');
    if (r1.state.kind === 'broken') {
      expect(r1.state.first).toEqual({ thread: 2, side: 'creel' });
    }
    // drum 側からでもよい
    const r2 = tapEnd(broken2, 5, 'drum');
    expect(r2.result).toBe('first');
    if (r2.state.kind === 'broken') {
      expect(r2.state.first).toEqual({ thread: 5, side: 'drum' });
    }
  });

  it("7. 2手目: 同じ糸の反対側の端で 'tiedOne'。その糸が tied に入る。最後の1本なら 'tiedAll' で running に戻る", () => {
    const r1 = tapEnd(broken2, 2, 'creel');
    const r2 = tapEnd(r1.state, 2, 'drum');
    expect(r2.result).toBe('tiedOne');
    if (r2.state.kind === 'broken') {
      expect(r2.state.tied).toEqual([2]);
      expect(r2.state.threads).toEqual([5]); // 残りは結んでいない糸のみ
      expect(r2.state.first).toBeNull(); // 次の1手目のために戻す
    }
    // もう1本を結ぶと全部つながる
    const r3 = tapEnd(r2.state, 5, 'creel');
    const r4 = tapEnd(r3.state, 5, 'drum');
    expect(r4.result).toBe('tiedAll');
    expect(r4.state.kind).toBe('running');
  });

  it("8. 2手目に別の切れた糸の端 → 'mismatch'。1手目からやり直し (first が null)", () => {
    const r1 = tapEnd(broken2, 2, 'creel');
    const r2 = tapEnd(r1.state, 5, 'creel');
    expect(r2.result).toBe('mismatch');
    if (r2.state.kind === 'broken') {
      expect(r2.state.first).toBeNull();
      expect(r2.state.tied).toEqual([]);
    }
  });

  it('9. 切れていない糸を押すと wrongThread。切れていない糸は2手目でも wrongThread', () => {
    const r1 = tapEnd(broken2, 3, 'creel');
    expect(r1.result).toBe('wrongThread');
    // 1手目のあとに切れていない糸
    const r2 = tapEnd(broken2, 2, 'creel');
    const r3 = tapEnd(r2.state, 6, 'drum');
    expect(r3.result).toBe('wrongThread');
    // tied の糸をもう一度押しても wrongThread
    const r4 = tapEnd(broken2, 2, 'creel');
    const r5 = tapEnd(r4.state, 2, 'drum'); // 2 を結ぶ
    const r6 = tapEnd(r5.state, 2, 'creel');
    expect(r6.result).toBe('wrongThread');
  });

  it('10. どちら側から押してもつながる (drum 先 → creel でも tiedOne)', () => {
    const r1 = tapEnd(broken2, 5, 'drum');
    expect(r1.result).toBe('first');
    const r2 = tapEnd(r1.state, 5, 'creel');
    expect(r2.result).toBe('tiedOne');
  });

  it("11. running のときは 'ignored'", () => {
    const r = tapEnd(initBreak(), 2, 'creel');
    expect(r.result).toBe('ignored');
  });
});
