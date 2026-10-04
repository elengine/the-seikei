import { describe, it, expect } from 'vitest';
import { initPedal, setPedal, speedOf, tensionOf, stepNoise, zoneOf, stepDrift, stepSnag } from './pedal';
import type { TensionParams, DriftParams } from './pedal';
import { seedFrom } from '../clock/clock';

/** テスト用のパラメータ (P2/README の初期値) */
function params(overrides?: Partial<TensionParams>): TensionParams {
  return {
    maxSpeed: 40,
    base: 30,
    perPedal: 0.6,
    yarnDrift: 0, // T2-09 追加修正a で 0
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
    const s = { ...initPedal(seedFrom(1)), pedal: 40, noise: 0 };
    // yarnDrift は 0 (T2-09 追加修正a)。perPedal は 0.6 (T2-11a)
    expect(tensionOf(s, p, 0)).toBeCloseTo(30 + 0.6 * 40 + 0);
    expect(tensionOf(s, p, 0.5)).toBeCloseTo(30 + 0.6 * 40 + 0);
    expect(tensionOf(s, p, 1)).toBeCloseTo(30 + 0.6 * 40 + 0);
    // progress が範囲外なら丸める
    expect(tensionOf(s, p, -0.5)).toBeCloseTo(tensionOf(s, p, 0));
    expect(tensionOf(s, p, 1.5)).toBeCloseTo(tensionOf(s, p, 1));
    // noise も足される
    const s2 = { ...initPedal(seedFrom(1)), pedal: 40, noise: 2 };
    expect(tensionOf(s2, p, 0)).toBeCloseTo(30 + 0.6 * 40 + 2);
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

  // 旧テスト5「安全なペダルの保証」は T2-09a で「ゆっくり踏めば必ず適正範囲に入る」の約束が
  // なくなったため削除した (「置いておくだけでは外れる」を新しいテスト4で確かめる)。

  it('6. zoneOf: 範囲の境目 (min ちょうど・max ちょうど) は ok', () => {
    const p = params({ range: { min: 30, max: 70 } });
    expect(zoneOf(30, p)).toBe('ok');
    expect(zoneOf(70, p)).toBe('ok');
    expect(zoneOf(29.9, p)).toBe('low');
    expect(zoneOf(70.1, p)).toBe('high');
  });
});

/** テスト用の流れ・引っかかりのパラメータ (T2-09 の初期値) */
function driftParams(level: 1 | 2 | 3): DriftParams {
  const table = {
    1: { perSec: 0.6, turnRate: 0.15, max: 8, snagRate: 0.02, snagSize: 6 },
    2: { perSec: 1.0, turnRate: 0.15, max: 12, snagRate: 0.04, snagSize: 9 },
    3: { perSec: 1.6, turnRate: 0.15, max: 12, snagRate: 0.06, snagSize: 12 }, // max 16 → 12 (T2-11a)
  } as const;
  return table[level];
}

describe('pedal T2-09a A (張りが自然に動く)', () => {
  it('1. stepDrift: 同じ種と同じ操作なら、流れも同じ動きになる', () => {
    const p = driftParams(1);
    let a = initPedal(seedFrom(31));
    let b = initPedal(seedFrom(31));
    for (let i = 0; i < 200; i++) {
      a = stepDrift(a, p, 100);
      b = stepDrift(b, p, 100);
      expect(a.drift).toBe(b.drift);
    }
  });

  it('2. stepDrift: 流れは ±DRIFT_MAX を超えない。1秒あたりの動きは上限以内', () => {
    const p = driftParams(2);
    let s = initPedal(seedFrom(5));
    for (let i = 0; i < 500; i++) {
      const prev = s.drift;
      s = stepDrift(s, p, 100);
      expect(s.drift).toBeGreaterThanOrEqual(-p.max);
      expect(s.drift).toBeLessThanOrEqual(p.max);
      expect(Math.abs(s.drift - prev)).toBeLessThanOrEqual(p.perSec + 1e-9);
    }
  });

  it('3. stepSnag: 引っかかりが起きたら、張りの上がり分を返し、2秒かけて元に戻る', () => {
    const p = driftParams(1);
    let s = initPedal(seedFrom(9));
    // 引っかかりが起きるまで進める (長めに回す)
    let raised = 0;
    for (let i = 0; i < 6000 && raised === 0; i++) {
      const r = stepSnag(s, p, 100);
      s = r.state;
      if (r.raised > 0) raised = r.raised;
    }
    expect(raised).toBeGreaterThan(0);
    // 以降は 2 秒かけて 0 に戻る (上がり分は減っていく)
    let prev = raised;
    for (let i = 0; i < 30; i++) {
      const r = stepSnag(s, p, 100);
      s = r.state;
      expect(r.raised).toBeLessThanOrEqual(prev);
      prev = r.raised;
    }
    expect(s.snag).toBeCloseTo(0, 9);
  });

  it('4. 「置いておくだけでは外れる」: どの難易度でも、ペダルを範囲の中心に固定しても、流れとぶれで範囲から外れる時間がある (種をいくつか試す)', () => {
    const ranges = [
      { min: 30, max: 70, width: 30, centerMin: 45, centerMax: 55 },
      { min: 38, max: 62, width: 18, centerMin: 40, centerMax: 60 },
      { min: 44, max: 56, width: 10, centerMin: 35, centerMax: 65 },
    ];
    for (let level = 1; level <= 3; level++) {
      const r = ranges[level - 1]!;
      const range = { min: r.centerMin - r.width / 2, max: r.centerMin + r.width / 2 };
      const p = params({ noiseAmp: level === 1 ? 1 : level === 2 ? 1.5 : 2, range });
      const dp = driftParams(level as 1 | 2 | 3);
      let outOfRangeFound = false;
      for (const seed of [1, 7, 13, 42, 99]) {
        let s = initPedal(seedFrom(seed));
        let sawOutOfRange = false;
        for (let i = 0; i < 600; i++) {
          s = stepNoise(setPedal(s, r.centerMin), p, 100);
          s = stepDrift(s, dp, 100);
          const tension = tensionOf(s, p, 0) + s.drift + s.snag;
          if (tension < range.min || tension > range.max) sawOutOfRange = true;
        }
        if (sawOutOfRange) outOfRangeFound = true;
      }
      expect(outOfRangeFound, `level ${level}`).toBe(true);
    }
  });

  it('5. 「調整すれば上級でも星3が取れる」: 毎秒ペダルを合わせ直す簡単なやり方で、適正の割合が 0.8 以上 (中心と種をいくつか試す)', () => {
    const dp = driftParams(3);
    let anyAbove = false;
    // 上級の中心の範囲 35〜65 からいくつか試す (幅は RANGE_WIDTH 10)
    for (const center of [45, 50, 55, 60]) {
      if (anyAbove) break;
      const r = { min: center - 5, max: center + 5 };
      const p = params({ noiseAmp: 2, range: r });
      for (const seed of [1, 7, 13]) {
        let s = initPedal(seedFrom(seed));
        let okMs = 0;
        let windMs = 0;
        for (let i = 0; i < 600; i++) {
          // 毎秒 (10フレームごと) 張りを見てペダルを合わせ直す簡単なやり方
          if (i % 10 === 0) {
            // 目標の張り (範囲の中心) に合うペダルの値を、流れと引っかかりとぶれを見て出す
            const target = (r.min + r.max) / 2;
            const want = (target - p.base - s.drift - s.snag - s.noise) / p.perPedal;
            s = setPedal(s, Math.min(100, Math.max(0, Math.round(want))));
          }
          s = stepNoise(s, p, 100);
          s = stepDrift(s, dp, 100);
          const tension = tensionOf(s, p, 0);
          windMs += 100;
          if (tension >= r.min && tension <= r.max) okMs += 100;
        }
        if (okMs / windMs >= 0.8) {
          anyAbove = true;
          break;
        }
      }
    }
    expect(anyAbove).toBe(true);
  });
});

describe('pedal T2-16a (引っかかり: 急に上がって徐々に戻る)', () => {
  /** 上がる量と戻り方を変えたパラメータ (ドラム巻き T2-16a) */
  function snagParams(overrides?: Partial<DriftParams>): DriftParams {
    return {
      perSec: 0.6, turnRate: 0.15, max: 8, snagRate: 1, snagSize: 6,
      ...overrides,
    };
  }

  it('1. 引っかかりは 0.2 秒ほどかけて上がる (snagRiseMs)。上がりきってから 1〜2 秒かけて戻る', () => {
    const p = snagParams({ snagSizeMin: 20, snagSizeMax: 20, snagRiseMs: 200, snagRecoverMinMs: 2000, snagRecoverMaxMs: 2000 });
    let s = initPedal(seedFrom(3));
    let raised = 0;
    for (let i = 0; i < 10 && raised === 0; i++) {
      const r = stepSnag(s, p, 100);
      s = r.state;
      if (r.raised > 0) raised = r.raised;
    }
    expect(raised).toBe(20);
    // 上がり途中: 100ms ちょうどなので半分 (10)。さらに 100ms で上がりきる
    expect(s.snag).toBeCloseTo(10, 9);
    const r2 = stepSnag(s, p, 100);
    s = r2.state;
    expect(r2.raised).toBe(0); // 引っかかりの最中に重ねて起きない
    expect(s.snag).toBeCloseTo(20, 9);
    // 戻り: 1 秒で半分、2 秒で 0
    const r3 = stepSnag(s, p, 1000);
    s = r3.state;
    expect(s.snag).toBeCloseTo(10, 9);
    const r4 = stepSnag(s, p, 1000);
    s = r4.state;
    expect(s.snag).toBe(0);
  });

  it('2. 上がる量は snagSizeMin〜snagSizeMax の間 (種で決まる)。同じ種なら同じ', () => {
    const p = snagParams({ snagRate: 1000, snagSizeMin: 15, snagSizeMax: 25, snagRiseMs: 200, snagRecoverMinMs: 1000, snagRecoverMaxMs: 2000 });
    const raisedOf = (seed: number): number => {
      let s = initPedal(seedFrom(seed));
      for (let i = 0; i < 10; i++) {
        const r = stepSnag(s, p, 100);
        s = r.state;
        if (r.raised > 0) return r.raised;
      }
      return 0;
    };
    const values = [1, 2, 3, 4, 5, 6, 7, 8].map(raisedOf);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(15);
      expect(v).toBeLessThanOrEqual(25);
    }
    expect(new Set(values).size).toBeGreaterThan(1); // 幅の中で変わることがある
    expect(raisedOf(3)).toBe(values[2]); // 同じ種なら同じ
  });

  it('3. 上がる量と戻り方を渡さないときは今までどおり (snagSize で即上がり・2秒で戻る。ビーム巻きは変わらない)', () => {
    const p = snagParams({ snagRate: 1000 }); // snagSize 6・オプション無し・必ず発火
    let s = initPedal(seedFrom(3));
    let raised = 0;
    for (let i = 0; i < 10 && raised === 0; i++) {
      const r = stepSnag(s, p, 10);
      s = r.state;
      if (r.raised > 0) raised = r.raised;
    }
    expect(raised).toBe(6);
    // 即上がり (10ms 後でもほぼ snagSize)
    expect(s.snag).toBeCloseTo(6 * (1 - 10 / 2000), 9);
    // 2 秒で 0 に戻る
    const r2 = stepSnag(s, p, 1990);
    s = r2.state;
    expect(s.snag).toBeCloseTo(0, 9);
  });
});
