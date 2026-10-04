import { describe, it, expect } from 'vitest';
import { init, reduce, resultOf, isValidResume, metersPerGram } from './logic';
import type { ItowariState } from './logic';
import { itowariPuzzles } from './puzzles';
import type { ItowariPuzzle } from './puzzles';
import { getContent } from '../../core/content/content';

/**
 * 糸割りのルールのテスト (P2b T2b-01)。
 * 長さを設定して「巻き始める」と自動で止まり、巻き終わったら判定する (管理者の決定)。
 */

const content = getContent();
const puzzles = itowariPuzzles(content);
const p1 = puzzles.find((p) => p.id === 's1')!; // split レベル1
const p2 = puzzles.find((p) => p.id === 's2')!; // split レベル2
const p3 = puzzles.find((p) => p.id === 's3')!; // refill レベル3
const p4 = puzzles.find((p) => p.id === 's4')!; // refill レベル4

/** 失敗せずに巻き終えるまで進める */
function wind(s: ItowariState, puzzle: ItowariPuzzle): ItowariState {
  return reduce(s, { type: 'tick', dtMs: 4000 }, puzzle);
}

describe('糸割り T2b-01 (巻く・止める・判定)', () => {
  it('1. 何もかけていない start は無視される。かけて長さを設定すると巻き始まる', () => {
    let s = init(p1);
    const before = s;
    s = reduce(s, { type: 'start' }, p1);
    expect(s).toBe(before); // 何も変わらない (同じ状態)
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: p1.sources[0]!.id, slot: 0 }, p1);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 6000 }, p1);
    s = reduce(s, { type: 'start' }, p1);
    expect(s.phase).toBe('winding');
    expect(s.progress).toBe(0);
  });

  it('2. tick で4秒かけて進み、巻いているあいだの setLength・mount は無視される。4秒で判定される', () => {
    let s = init(p1);
    for (let i = 0; i < 6; i++) {
      s = reduce(s, { type: 'mount', spindle: i, sourceId: p1.sources[i]!.id, slot: 0 }, p1);
      s = reduce(s, { type: 'setLength', spindle: i, slot: 0, lengthM: 6000 }, p1);
    }
    s = reduce(s, { type: 'start' }, p1);
    s = reduce(s, { type: 'tick', dtMs: 2000 }, p1);
    expect(s.phase).toBe('winding');
    expect(s.progress).toBeCloseTo(0.5);
    const mid = s;
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 1000 }, p1);
    s = reduce(s, { type: 'mount', spindle: 6, sourceId: p1.sources[5]!.id, slot: 0 }, p1);
    s = reduce(s, { type: 'unmount', spindle: 0, slot: 0 }, p1);
    expect(s).toBe(mid); // 巻いているあいだは無視
    s = wind(s, p1);
    expect(s.phase).toBe('done'); // 6チーズ × 2本 = 12本で完成
    expect(s.runs).toBe(1);
    expect(s.failures).toBe(0);
    expect(s.made).toHaveLength(12); // 残り6本 + 作った6本
    expect(s.spindles.every((sp) => sp.segments.length === 0)).toBe(true); // 口は空
    expect(s.used).toHaveLength(6); // split のチーズは使い切り
  });

  it('3. レベル1 を半分 (6,000m) で巻くと成功・星3', () => {
    let s = init(p1);
    for (let i = 0; i < 6; i++) {
      s = reduce(s, { type: 'mount', spindle: i, sourceId: p1.sources[i]!.id, slot: 0 }, p1);
      s = reduce(s, { type: 'setLength', spindle: i, slot: 0, lengthM: 6000 }, p1);
    }
    s = wind(reduce(s, { type: 'start' }, p1), p1);
    const r = resultOf(s, p1);
    expect(r.stars).toBe(3);
    expect(r.lines.join('\n')).toContain('失敗した回数 0回');
    expect(r.lines.join('\n')).toContain('巻いた回数 1回(最少 1回)');
  });

  it('4. 半分より多く設定すると sourceShort で failed。残りは巻く前に戻る', () => {
    let s = init(p1);
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: p1.sources[0]!.id, slot: 0 }, p1);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 7000 }, p1);
    s = wind(reduce(s, { type: 'start' }, p1), p1);
    expect(s.phase).toBe('failed');
    expect(s.failures).toBe(1);
    expect(s.lastFailures).toEqual([{ kind: 'sourceShort', sourceId: p1.sources[0]!.id, leftM: 5000 }]);
    expect(s.remaining[p1.sources[0]!.id]).toBe(12000); // 巻く前に戻る
    expect(s.made).toHaveLength(0);
  });

  it('5. retry で setup に戻り、かけた糸と設定した長さは残る', () => {
    let s = init(p1);
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: p1.sources[0]!.id, slot: 0 }, p1);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 7000 }, p1);
    s = wind(reduce(s, { type: 'start' }, p1), p1);
    s = reduce(s, { type: 'retry' }, p1);
    expect(s.phase).toBe('setup');
    expect(s.progress).toBe(0);
    expect(s.spindles[0]!.segments).toEqual([{ sourceId: p1.sources[0]!.id, lengthM: 7000 }]);
  });

  it('6. 元の糸の残りより長く設定すると sourceEmpty', () => {
    let s = init(p3);
    const src = p3.sources[0]!; // 正味 100g → 2,400m
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: src.id, slot: 0 }, p3);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 2500 }, p3);
    s = wind(reduce(s, { type: 'start' }, p3), p3);
    expect(s.phase).toBe('failed');
    expect(s.lastFailures).toContainEqual({ kind: 'sourceEmpty', spindle: 0, sourceId: src.id });
  });

  it('7. 作ったコーンが要る長さに届かないと madeShort', () => {
    let s = init(p3);
    const src = p3.sources[0]!;
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: src.id, slot: 0 }, p3);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 1100 }, p3);
    s = wind(reduce(s, { type: 'start' }, p3), p3);
    expect(s.phase).toBe('failed');
    expect(s.lastFailures).toContainEqual({ kind: 'madeShort', spindle: 0, woundM: 1100 });
  });

  it('8. 継ぐ糸 (slot 1) の長さが合計される。refill の元の糸は使い切らず残る', () => {
    let s = init(p4);
    const a = p4.sources[2]!; // 余り 1,020m
    const b = p4.sources[3]!; // 余り 540m
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: a.id, slot: 0 }, p4);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 1020 }, p4);
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: b.id, slot: 1 }, p4);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 1, lengthM: 540 }, p4);
    s = wind(reduce(s, { type: 'start' }, p4), p4);
    expect(s.phase).toBe('setup'); // 作ったのは 1本 (あと2本)
    expect(s.made).toEqual([1560]);
    expect(s.spliced).toBe(1);
    expect(s.used).toHaveLength(0); // refill の元の糸は箱に戻る
    expect(s.remaining[a.id]).toBe(1500); // 2,520 − 1,020
    expect(s.remaining[b.id]).toBe(1500); // 2,040 − 540
    const r = resultOf(s, p4);
    expect(r.lines.join('\n')).toContain('糸を継いだ口 1');
  });

  it('8b. refill は「要る本数 − 残り」を作ると done (残り6本・9本要る → 3本)', () => {
    let s = init(p4);
    const make1500 = (src1: number, len1: number, src2: number | null, len2: number): void => {
      s = reduce(s, { type: 'mount', spindle: 0, sourceId: p4.sources[src1]!.id, slot: 0 }, p4);
      s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: len1 }, p4);
      if (src2 !== null) {
        s = reduce(s, { type: 'mount', spindle: 0, sourceId: p4.sources[src2]!.id, slot: 1 }, p4);
        s = reduce(s, { type: 'setLength', spindle: 0, slot: 1, lengthM: len2 }, p4);
      }
      s = wind(reduce(s, { type: 'start' }, p4), p4);
    };
    make1500(2, 1020, 3, 540); // 継ぎで 1,560 (余り 4%)
    expect(s.phase).toBe('setup'); // あと2本
    expect(s.made).toEqual([1560]);
    make1500(0, 1500, null, 0); // 3,480 の残りから 1,500 (残り 1,980)
    expect(s.phase).toBe('setup'); // あと1本
    make1500(1, 1500, null, 0); // 3,000 の残りから 1,500 (残り 1,500)
    expect(s.phase).toBe('done'); // 3本できたので完成
    expect(s.made).toEqual([1560, 1500, 1500]);
  });

  it('9. slot 1 は slot 0 が無いと mount できない。同じ糸は2か所にかけられない', () => {
    let s = init(p3);
    const src = p3.sources[0]!;
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: src.id, slot: 1 }, p3);
    expect(s.spindles[0]!.segments).toHaveLength(0);
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: src.id, slot: 0 }, p3);
    s = reduce(s, { type: 'mount', spindle: 1, sourceId: src.id, slot: 0 }, p3);
    expect(s.spindles[1]!.segments).toHaveLength(0); // 同じ糸はかけられない
  });

  it('10. setLength は 10m 単位に丸め、メーターの最大を超えない', () => {
    let s = init(p3);
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: p3.sources[0]!.id, slot: 0 }, p3);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 1234 }, p3);
    expect(s.spindles[0]!.segments[0]!.lengthM).toBe(1230);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 99999 }, p3);
    expect(s.spindles[0]!.segments[0]!.lengthM).toBe(10000);
  });

  it('11. レベル2 は2回に分けて巻き、2回目で done (重さごとに半分を設定すると星3)', () => {
    let s = init(p2);
    for (let i = 0; i < 12; i++) {
      s = reduce(s, { type: 'mount', spindle: i, sourceId: p2.sources[i]!.id, slot: 0 }, p2);
      s = reduce(s, { type: 'setLength', spindle: i, slot: 0, lengthM: p2.sources[i]!.grossG * 12 }, p2);
    }
    s = wind(reduce(s, { type: 'start' }, p2), p2);
    expect(s.phase).toBe('setup'); // まだ 24本 / 30本
    expect(s.made).toHaveLength(24);
    expect(s.runs).toBe(1);
    for (let i = 0; i < 3; i++) {
      s = reduce(s, { type: 'mount', spindle: i, sourceId: p2.sources[12 + i]!.id, slot: 0 }, p2);
      s = reduce(s, { type: 'setLength', spindle: i, slot: 0, lengthM: p2.sources[12 + i]!.grossG * 12 }, p2);
    }
    s = wind(reduce(s, { type: 'start' }, p2), p2);
    expect(s.phase).toBe('done');
    expect(s.made).toHaveLength(30);
    expect(s.runs).toBe(2);
    const r = resultOf(s, p2);
    expect(r.lines.join('\n')).toContain('巻いた回数 2回(最少 2回)');
    expect(r.stars).toBe(3);
  });

  it('12. 採点の境目: 失敗 0・余分 5% 以内・最少の回数で星3。失敗 1 回で星2。それ以外は星1', () => {
    const s = init(p1);
    const base = { ...s, phase: 'done' as const, runs: 1, made: [6000, 6000] };
    expect(resultOf({ ...base, failures: 0, extraPct: 5 }, p1).stars).toBe(3);
    expect(resultOf({ ...base, failures: 0, extraPct: 5.1 }, p1).stars).toBe(2);
    expect(resultOf({ ...base, failures: 1, extraPct: 0 }, p1).stars).toBe(2);
    expect(resultOf({ ...base, failures: 2, extraPct: 0 }, p1).stars).toBe(1);
    // 巻いた回数が最少より多いと星3にならない (失敗は無いので星2)
    expect(resultOf({ ...base, failures: 0, extraPct: 0, runs: 2 }, p1).stars).toBe(2);
  });

  it('13. weigh ではかりに載せた糸を記録する', () => {
    let s = init(p3);
    s = reduce(s, { type: 'weigh', sourceId: p3.sources[0]!.id }, p3);
    expect(s.weighed).toEqual([p3.sources[0]!.id]);
  });

  it('14. 途中保存できる形を確かめる', () => {
    let s = init(p4);
    expect(isValidResume(s)).toBe(true);
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: p4.sources[2]!.id, slot: 0 }, p4);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 1020 }, p4);
    expect(isValidResume(s)).toBe(true);
    expect(isValidResume({ ...s, phase: 'ねる' as unknown as ItowariState['phase'] })).toBe(false);
    expect(isValidResume({ ...s, progress: 2 })).toBe(false);
    expect(isValidResume({ ...s, remaining: { ...s.remaining, bad: -1 } })).toBe(false);
    expect(isValidResume({ ...s, spindles: [] as unknown as ItowariState['spindles'] })).toBe(false);
  });

  it('15. 番手の計算は logic にある (puzzles.test と同じ値)', () => {
    expect(metersPerGram('2/48')).toBe(24);
  });
});
