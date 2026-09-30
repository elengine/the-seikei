import { describe, it, expect } from 'vitest';
import { initPedal, setPedal, speedOf, tensionOf, stepNoise, zoneOf } from './pedal';
import type { TensionParams } from './pedal';
import { seedFrom } from '../clock/clock';

/** テスト用のパラメータ (P2/README の初期値) */
function params(overrides?: Partial<TensionParams>): TensionParams {
  return {
    maxSpeed: 40,
    base: 30,
    perPedal: 0.4,
    yarnDrift: 4,
    noiseAmp: 2,
    noiseStepPerSec: 1,
    range: { min: 30, max: 70 },
    ...overrides,
  };
}

describe('pedal (T2-01)', () => {
  it('1. setPedal は 0〜100 に丸める (-5 → 0、130 → 100)。元の状態は変更しない', () => {
    const s0 = initPedal(seedFrom(1));
    expect(s0.pedal).toBe(0);
    expect(s0.noise).toBe(0);
    const s1 = setPedal(s0, -5);
    expect(s1.pedal).toBe(0);
    const s2 = setPedal(s0, 130);
    expect(s2.pedal).toBe(100);
    const s3 = setPedal(s0, 42.5);
    expect(s3.pedal).toBe(42.5);
    // 元の状態は変更しない
    expect(s0.pedal).toBe(0);
  });

  it('2. speedOf: pedal 0 で 0、pedal 50 で maxSpeed の半分', () => {
    const p = params({ maxSpeed: 40 });
    expect(speedOf(initPedal(seedFrom(1)), p)).toBe(0);
    expect(speedOf(setPedal(initPedal(seedFrom(1)), 50), p)).toBeCloseTo(20);
    expect(speedOf(setPedal(initPedal(seedFrom(1)), 100), p)).toBeCloseTo(40);
  });

  it('3. tensionOf: 式どおりの値。progress は 0〜1 に丸める', () => {
    const p = params();
    // base + perPedal * pedal + yarnDrift * progress + noise
    const s = { pedal: 40, noise: 0, rng: seedFrom(1) };
    expect(tensionOf(s, p, 0)).toBeCloseTo(30 + 0.4 * 40 + 0);
    expect(tensionOf(s, p, 0.5)).toBeCloseTo(30 + 0.4 * 40 + 2);
    expect(tensionOf(s, p, 1)).toBeCloseTo(30 + 0.4 * 40 + 4);
    // progress が範囲外なら丸める
    expect(tensionOf(s, p, -0.5)).toBeCloseTo(tensionOf(s, p, 0));
    expect(tensionOf(s, p, 1.5)).toBeCloseTo(tensionOf(s, p, 1));
    // noise も足される
    const s2 = { pedal: 40, noise: 2, rng: seedFrom(1) };
    expect(tensionOf(s2, p, 0)).toBeCloseTo(30 + 0.4 * 40 + 2);
  });

  it('4. stepNoise: 1000回進めても -noiseAmp〜+noiseAmp の中。1回の変化は上限以内。同じ種なら同じ結果', () => {
    const p = params();
    let s = initPedal(seedFrom(12345));
    const first = stepNoise(s, p, 100);
    for (let i = 0; i < 1000; i++) {
      const prev = s.noise;
      s = stepNoise(s, p, 100);
      expect(s.noise).toBeGreaterThanOrEqual(-p.noiseAmp);
      expect(s.noise).toBeLessThanOrEqual(p.noiseAmp);
      const change = Math.abs(s.noise - prev);
      expect(change, `step ${i}`).toBeLessThanOrEqual(p.noiseStepPerSec * 100 / 1000 + 1e-9);
    }
    // 同じ種なら同じ結果
    let a = initPedal(seedFrom(777));
    let b = initPedal(seedFrom(777));
    for (let i = 0; i < 50; i++) {
      a = stepNoise(a, p, 100);
      b = stepNoise(b, p, 100);
      expect(a.noise).toBe(b.noise);
    }
    // 1回目の比較 (first) は種が同じなら同じ
    const c = initPedal(seedFrom(12345));
    expect(stepNoise(c, p, 100).noise).toBe(first.noise);
  });

  it('5. 安全なペダルの保証: 3つの難易度で pedal 40・progress 0/0.5/1・noise -2/0/+2 のすべてで zoneOf が ok', () => {
    const ranges: Array<{ min: number; max: number }> = [
      { min: 30, max: 70 }, // 初級
      { min: 38, max: 62 }, // 中級
      { min: 44, max: 56 }, // 上級
    ];
    for (const range of ranges) {
      const p = params({ range });
      for (const progress of [0, 0.5, 1]) {
        for (const noise of [-2, 0, 2]) {
          const s = { pedal: 40, noise, rng: seedFrom(1) };
          const tension = tensionOf(s, p, progress);
          expect(zoneOf(tension, p), `range ${range.min}-${range.max} progress ${progress} noise ${noise} tension ${tension}`).toBe('ok');
        }
      }
    }
  });

  it('6. zoneOf: 範囲の境目 (min ちょうど・max ちょうど) は ok', () => {
    const p = params({ range: { min: 30, max: 70 } });
    expect(zoneOf(30, p)).toBe('ok');
    expect(zoneOf(70, p)).toBe('ok');
    expect(zoneOf(29.9, p)).toBe('low');
    expect(zoneOf(70.1, p)).toBe('high');
  });
});
