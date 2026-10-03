import { describe, it, expect } from 'vitest';
import { initBreak, stepBreak, tapThread } from './breakage';
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
    const broken = { kind: 'broken' as const, threads: [3], tied: [] };
    const r = stepBreak(broken, p, 1200, 80, 56, seedFrom(1));
    expect(r.state).toEqual(broken);
    expect(r.broke).toBe(false);
    expect(r.rng).toBe(seedFrom(1));
  });
});

describe('breakage T2-13c (切れた糸を1回押してつなぐ)', () => {
  const broken2 = { kind: 'broken' as const, threads: [2, 5], tied: [] };

  it("1. 切れた糸を押すと 'tiedOne'。threads から除かれ tied に入る (1回押し)", () => {
    const r = tapThread(broken2, 2);
    expect(r.result).toBe('tiedOne');
    if (r.state.kind === 'broken') {
      expect(r.state.threads).toEqual([5]);
      expect(r.state.tied).toEqual([2]);
      expect('first' in r.state).toBe(false); // 1手目の記録は無くなった
    }
  });

  it("2. 最後の1本を押すと 'tiedAll'。running に戻る", () => {
    const broken1 = { kind: 'broken' as const, threads: [3], tied: [] };
    const r = tapThread(broken1, 3);
    expect(r.result).toBe('tiedAll');
    expect(r.state.kind).toBe('running');
  });

  it('3. 2本切れているとき、1回押すごとに1本つながる', () => {
    const r1 = tapThread(broken2, 5);
    expect(r1.result).toBe('tiedOne');
    const r2 = tapThread(r1.state, 2);
    expect(r2.result).toBe('tiedAll');
    expect(r2.state.kind).toBe('running');
  });

  it("4. 切れていない糸 (tied も含む) を押すと 'wrongThread'", () => {
    expect(tapThread(broken2, 3).result).toBe('wrongThread');
    const r1 = tapThread(broken2, 2);
    expect(tapThread(r1.state, 2).result).toBe('wrongThread'); // つないだ糸をもう一度
  });

  it("5. running のときは 'ignored'", () => {
    expect(tapThread(initBreak(), 2).result).toBe('ignored');
  });
});
