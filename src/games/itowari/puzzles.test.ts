import { describe, it, expect } from 'vitest';
import { itowariPuzzles } from './puzzles';
import type { ItowariPuzzle } from './puzzles';
import { metersPerGram, lengthOf } from './logic';
import { getContent } from '../../core/content/content';

/**
 * 糸割りのお題のテスト (P2b T2b-01)。
 * お題はクリール立ての15題から作る。レベル1〜2 は split、3〜5 は refill。
 * どのお題も解けること (乱数は使わない)。
 */

const content = getContent();
const puzzles = itowariPuzzles(content);

/** 正味の長さ (m) */
const net = (grossG: number, coreG: number, mpg: number): number => Math.floor((grossG - coreG) * mpg);

describe('糸割り T2b-01 (番手の計算)', () => {
  it('1. metersPerGram: 2/48 は 24、1/48 は 48、2/60 は 30', () => {
    expect(metersPerGram('2/48')).toBe(24);
    expect(metersPerGram('1/48')).toBe(48);
    expect(metersPerGram('2/60')).toBe(30);
  });

  it('2. lengthOf: (重さ − 芯) × m/g の切り捨て', () => {
    expect(lengthOf(500, 0, '2/48')).toBe(12000);
    expect(lengthOf(95.5, 20, '2/48')).toBe(1812); // floor(75.5 × 24)
    expect(lengthOf(100, 0, '2/60')).toBe(3000);
  });
});

describe('糸割り T2b-01 (お題15題)', () => {
  it('3. 15題あり、id・柄・名前・糸はクリール立てのお題と同じ (糸は柄の最初の糸)', () => {
    expect(puzzles).toHaveLength(15);
    expect(puzzles.map((p) => p.id)).toEqual(content.creelPuzzles.map((p) => p.id));
    for (const p of puzzles) {
      const pattern = content.patterns.get(p.patternId)!;
      expect(p.name, p.id).toBe(pattern.name);
      const firstYarn = pattern.plan[0]!.yarn;
      expect(p.yarnId, p.id).toBe(firstYarn);
      const spec = content.yarns.get(firstYarn)!.spec;
      expect(spec.endsWith(p.count), `${p.id} ${spec}`).toBe(true);
    }
  });

  it('4. レベル1〜2 は split、3〜5 は refill。レベル = 段階', () => {
    for (const p of puzzles) {
      expect(p.kind, `${p.id} stage ${p.stage}`).toBe(p.stage <= 2 ? 'split' : 'refill');
    }
    expect(puzzles.filter((p) => p.kind === 'split')).toHaveLength(6);
    expect(puzzles.filter((p) => p.kind === 'refill')).toHaveLength(9);
  });

  it('5. 紙の芯はレベル5だけ 20g (ほかは 0)', () => {
    for (const p of puzzles) {
      expect(p.coreG, p.id).toBe(p.stage === 5 ? 20 : 0);
    }
  });

  it('6. 数の目安 (レベル1: チーズ6個・要る12本・5,500m。レベル2: 15個・30本。レベル3: あと1,200m。レベル4〜5: あと1,500m)', () => {
    const byStage = (s: number): ItowariPuzzle[] => puzzles.filter((p) => p.stage === s);
    for (const p of byStage(1)) {
      expect(p.sources).toHaveLength(6);
      expect(p.needCount).toBe(12);
      expect(p.needM).toBe(5500);
      expect(new Set(p.sources.map((s) => s.grossG)).size).toBe(1); // どれも同じ重さ
    }
    for (const p of byStage(2)) {
      expect(p.sources).toHaveLength(15);
      expect(p.needCount).toBe(30);
      expect(p.needM).toBe(5200);
    }
    for (const p of byStage(3)) {
      expect(p.sources).toHaveLength(6);
      expect(p.needCount).toBe(8);
      expect(p.needM).toBe(1200);
    }
    for (const p of [...byStage(4), ...byStage(5)]) {
      expect(p.sources).toHaveLength(6);
      expect(p.needCount).toBe(9);
      expect(p.needM).toBe(1500);
    }
  });

  it('7. どのお題も解ける (split: チーズ1個で2本作れる。refill: 余りの合計 ≥ 作る本数 × 要る長さ)', () => {
    for (const p of puzzles) {
      const mpg = metersPerGram(p.count);
      const lengths = p.sources.map((s) => net(s.grossG, p.coreG, mpg));
      if (p.kind === 'split') {
        // チーズ1個 = 作ったコーン1本 + 残り1本。どちらも needM 以上になること
        for (const l of lengths) {
          expect(l, `${p.id} のチーズ`).toBeGreaterThanOrEqual(p.needM * 2);
        }
        expect(p.needCount).toBe(p.sources.length * 2);
      } else {
        const madeCount = p.needCount - p.sources.length;
        const surplus = lengths.map((l) => l - p.needM);
        for (const s of surplus) {
          expect(s, `${p.id} の元のコーン`).toBeGreaterThanOrEqual(0); // 元のコーンはみんな needM 以上残っている
        }
        const total = surplus.reduce((a, b) => a + b, 0);
        expect(total, `${p.id} の余りの合計`).toBeGreaterThanOrEqual(madeCount * p.needM);
      }
    }
  });

  it('8. レベル4〜5 は、継がないと作れない組み合わせを含む (1本の余りで足りる口が足りない) が、継げば解ける', () => {
    for (const p of puzzles.filter((x) => x.kind === 'refill' && x.stage >= 4)) {
      const mpg = metersPerGram(p.count);
      const madeCount = p.needCount - p.sources.length;
      const surplus = p.sources
        .map((s) => net(s.grossG, p.coreG, mpg) - p.needM)
        .sort((a, b) => b - a);
      // 1本の余りだけで作れる口の数
      const singles = surplus.filter((s) => s >= p.needM).length;
      expect(singles, `${p.id} は継ぎが必要`).toBeLessThan(madeCount);
      // 継げば解ける: 1本で作れる分を使い、残りを2個ずつ継いで needM 以上にできる
      let cones = singles;
      const rest = surplus.filter((s) => s < p.needM);
      for (let i = 0; i + 1 < rest.length; i += 2) {
        if (rest[i]! + rest[i + 1]! >= p.needM) cones++;
      }
      expect(cones, `${p.id} は継げば解ける`).toBeGreaterThanOrEqual(madeCount);
    }
  });
});
