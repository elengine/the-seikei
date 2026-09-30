import { describe, it, expect } from 'vitest';
import { initBreak, stepBreak, tapEnd } from './breakage';
import type { BreakParams } from './breakage';
import { seedFrom } from '../clock/clock';

/** テスト用のパラメータ (P2/README の初期値) */
function params(overrides?: Partial<BreakParams>): BreakParams {
  return {
    checkMs: 500,
    rate: 0.02,
    maxChance: 0.5,
    threadCount: 8,
    ...overrides,
  };
}

describe('breakage (T2-02)', () => {
  it('1. tension が範囲内なら、10分ぶん進めても切れない', () => {
    const p = params();
    let s = initBreak();
    let rng = seedFrom(1);
    // 10分 = 600000ms。切れない条件 (tension <= rangeMax) で進める
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

  it('2. tension が範囲の上を大きく外れる (chance が上限 0.5) と、同じ種で決まった回で切れ、thread が 0〜7。同じ種と同じ入力なら同じ結果', () => {
    const p = params();
    const run = () => {
      let s = initBreak();
      let rng = seedFrom(42);
      let brokeAt = -1;
      let thread = -1;
      for (let i = 0; i < 100; i++) {
        const r = stepBreak(s, p, 500, 80, 56, rng);
        s = r.state;
        rng = r.rng;
        if (r.broke) {
          brokeAt = i;
          if (s.kind === 'broken') thread = s.thread;
          break;
        }
      }
      return { brokeAt, thread };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(a.brokeAt).toBeGreaterThanOrEqual(0);
    expect(a.thread).toBeGreaterThanOrEqual(0);
    expect(a.thread).toBeLessThanOrEqual(7);
    expect(a.brokeAt).toBeLessThanOrEqual(3); // chance 0.5 なら数回以内に切れる
  });

  it('3. dtMs 1200・checkMs 500 で、判定が2回行われ、sinceCheckMs が 200 になる (切れない条件で)', () => {
    const p = params();
    const s0 = initBreak();
    const r = stepBreak(s0, p, 1200, 56, 56, seedFrom(1));
    expect(r.state.kind).toBe('running');
    if (r.state.kind === 'running') {
      expect(r.state.sinceCheckMs).toBe(200);
    }
  });

  it("4. 'broken' の間は stepBreak が何もしない", () => {
    const p = params();
    const broken = { kind: 'broken' as const, thread: 3, firstTapped: false };
    const r = stepBreak(broken, p, 1200, 80, 56, seedFrom(1));
    expect(r.state).toEqual(broken);
    expect(r.broke).toBe(false);
    expect(r.rng).toBe(seedFrom(1));
  });

  it("5. tapEnd: 正しい順 (creel → drum) で 'tied'、running に戻る", () => {
    const broken = { kind: 'broken' as const, thread: 3, firstTapped: false };
    const r1 = tapEnd(broken, 3, 'creel');
    expect(r1.result).toBe('first');
    if (r1.state.kind === 'broken') expect(r1.state.firstTapped).toBe(true);
    const r2 = tapEnd(r1.state, 3, 'drum');
    expect(r2.result).toBe('tied');
    expect(r2.state.kind).toBe('running');
  });

  it("6. tapEnd: 別の糸 → 'wrongThread'、firstTapped が false に戻る", () => {
    const broken = { kind: 'broken' as const, thread: 3, firstTapped: false };
    const r1 = tapEnd(broken, 3, 'creel');
    expect(r1.result).toBe('first');
    // 切れた糸 (3) と違う糸 (5) を押す
    const r2 = tapEnd(r1.state, 5, 'creel');
    expect(r2.result).toBe('wrongThread');
    if (r2.state.kind === 'broken') expect(r2.state.firstTapped).toBe(false);
    // 1手目を済ませていない状態で別の糸を押しても wrongThread
    const r3 = tapEnd(broken, 5, 'creel');
    expect(r3.result).toBe('wrongThread');
    if (r3.state.kind === 'broken') expect(r3.state.firstTapped).toBe(false);
  });

  it("7. tapEnd: drum を先に → 'retry'。running のとき → 'ignored'。creel の2回目は 'first' のまま", () => {
    const broken = { kind: 'broken' as const, thread: 3, firstTapped: false };
    // drum を先に押す
    const r1 = tapEnd(broken, 3, 'drum');
    expect(r1.result).toBe('retry');
    expect(r1.state).toEqual(broken); // 状態はそのまま
    // creel → creel は 'first' のまま (状態はそのまま)
    const r2 = tapEnd(broken, 3, 'creel');
    expect(r2.result).toBe('first');
    const r3 = tapEnd(r2.state, 3, 'creel');
    expect(r3.result).toBe('first');
    if (r3.state.kind === 'broken') expect(r3.state.firstTapped).toBe(true);
    // running のときは ignored
    const r4 = tapEnd(initBreak(), 3, 'creel');
    expect(r4.result).toBe('ignored');
  });
});
