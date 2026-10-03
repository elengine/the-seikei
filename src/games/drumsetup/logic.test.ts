import { describe, it, expect } from 'vitest';
import {
  density, thicknessPerTurn, correctFeed, init, reduce, judge, trialLayers,
} from './logic';
import type { DrumSetupPuzzle } from './puzzles';
import { FEED_MAX } from './params';

/** 段階1・2/48 のお題 (本数 400・幅 20cm。テスト用) */
function p1(): DrumSetupPuzzle {
  return { id: 's1', stage: 1, patternId: 'p-muji-kon', name: '紺の無地', grade: '2/48', ends: 400, widthCm: 20 };
}

describe('drumsetup logic T2c-01 (計算)', () => {
  it('1. 段階1・2/48: 密度 20本/cm、厚み 0.17mm、9° の送り量 1.07mm', () => {
    const p = p1();
    expect(density(p)).toBe(20);
    expect(thicknessPerTurn(p)).toBeCloseTo(0.17, 10);
    expect(correctFeed(p, 9)).toBe(1.07);
  });

  it('2. trialLayers: 回転 0 は原点、回転 k の左端 x = k × 送り量、高さ y = k × 厚み', () => {
    const p = p1();
    const layers = trialLayers(p, 9, 1.07, 3);
    expect(layers).toHaveLength(4);
    expect(layers[0]).toEqual({ x: 0, y: 0 });
    expect(layers[1]!.x).toBeCloseTo(1.07, 10);
    expect(layers[1]!.y).toBeCloseTo(0.17, 10);
    expect(layers[3]!.x).toBeCloseTo(3.21, 10);
    expect(layers[3]!.y).toBeCloseTo(0.51, 10);
  });
});

describe('drumsetup logic T2c-01 (judge)', () => {
  it('3. ぴったりで good・星3、+4% で星3、+10% で星2・collapse、−10% で星2・crush、−20% で星1・crush', () => {
    const p = p1();
    const s = correctFeed(p, 9); // 1.07
    expect(judge(p, 9, s)).toEqual({ outcome: 'good', errRatio: 0, correct: s, stars: 3 });
    const plus4 = Math.round(s * 1.04 * 100) / 100;
    expect(judge(p, 9, plus4).stars).toBe(3);
    const plus10 = Math.round(s * 1.1 * 100) / 100;
    const rPlus10 = judge(p, 9, plus10);
    expect(rPlus10.outcome).toBe('collapse');
    expect(rPlus10.stars).toBe(2);
    const minus10 = Math.round(s * 0.9 * 100) / 100;
    const rMinus10 = judge(p, 9, minus10);
    expect(rMinus10.outcome).toBe('crush');
    expect(rMinus10.stars).toBe(2);
    const minus20 = Math.round(s * 0.8 * 100) / 100;
    const rMinus20 = judge(p, 9, minus20);
    expect(rMinus20.outcome).toBe('crush');
    expect(rMinus20.stars).toBe(1);
  });

  it('4. 角度が null、または番手に使えない角度なら badAngle・星1', () => {
    const p = p1(); // 2/48 の使える角度は 7・9・11
    expect(judge(p, null, 1.07).outcome).toBe('badAngle');
    expect(judge(p, null, 1.07).stars).toBe(1);
    expect(judge(p, 5, 1.07).outcome).toBe('badAngle');
  });
});

describe('drumsetup logic T2c-01 (送り量の操作)', () => {
  it('5. stepFeed は 0 未満・FEED_MAX 超えにならず、小数第2位に丸まる (0.1 を3回足すと 0.3)', () => {
    const p = p1();
    let s = init(p);
    expect(s.angle).toBeNull();
    expect(s.feed).toBe(0);
    s = reduce(s, p, { type: 'stepFeed', delta: 0.1 });
    s = reduce(s, p, { type: 'stepFeed', delta: 0.1 });
    s = reduce(s, p, { type: 'stepFeed', delta: 0.1 });
    expect(s.feed).toBe(0.3);
    // 上限
    s = reduce(s, p, { type: 'setFeed', value: 99 });
    expect(s.feed).toBe(FEED_MAX);
    s = reduce(s, p, { type: 'stepFeed', delta: 0.1 });
    expect(s.feed).toBe(FEED_MAX);
    // 下限
    s = reduce(s, p, { type: 'setFeed', value: -1 });
    expect(s.feed).toBe(0);
    s = reduce(s, p, { type: 'stepFeed', delta: -0.01 });
    expect(s.feed).toBe(0);
  });

  it('6. setFeed も小数第2位に丸める', () => {
    const p = p1();
    let s = init(p);
    s = reduce(s, p, { type: 'setFeed', value: 1.073 });
    expect(s.feed).toBe(1.07);
  });
});

describe('drumsetup logic T2c-01 (試し巻きの流れ)', () => {
  it('7. 角度が null のとき trial は何もしない。selectAngle で角度が入る', () => {
    const p = p1();
    let s = init(p);
    s = reduce(s, p, { type: 'trial' });
    expect(s.phase).toBe('setting');
    expect(s.lastResult).toBeNull();
    s = reduce(s, p, { type: 'selectAngle', angle: 9 });
    expect(s.angle).toBe(9);
    expect(s.phase).toBe('setting');
  });

  it('8. 星3 の試し巻きは trialEnd で done になる', () => {
    const p = p1();
    let s = init(p);
    s = reduce(s, p, { type: 'selectAngle', angle: 9 });
    s = reduce(s, p, { type: 'setFeed', value: 1.07 });
    s = reduce(s, p, { type: 'trial' });
    expect(s.phase).toBe('trial');
    expect(s.trials).toBe(1);
    expect(s.lastResult?.stars).toBe(3);
    s = reduce(s, p, { type: 'trialEnd' });
    expect(s.phase).toBe('done');
  });

  it('9. 星2 の試し巻きは trialEnd で setting に戻り、lastResult が残る', () => {
    const p = p1();
    let s = init(p);
    s = reduce(s, p, { type: 'selectAngle', angle: 9 });
    s = reduce(s, p, { type: 'setFeed', value: 0.96 }); // −10% → crush・星2
    s = reduce(s, p, { type: 'trial' });
    expect(s.lastResult?.outcome).toBe('crush');
    s = reduce(s, p, { type: 'trialEnd' });
    expect(s.phase).toBe('setting');
    expect(s.lastResult?.stars).toBe(2);
  });

  it('10. finish で done になる (星3でなくても結果を出して終えられる)', () => {
    const p = p1();
    let s = init(p);
    s = reduce(s, p, { type: 'selectAngle', angle: 9 });
    s = reduce(s, p, { type: 'setFeed', value: 0.96 });
    s = reduce(s, p, { type: 'trial' });
    s = reduce(s, p, { type: 'finish' });
    expect(s.phase).toBe('done');
    expect(s.lastResult?.stars).toBe(2);
  });

  it('11. retry でもう一度 (角度・送り量・結果を戻す)', () => {
    const p = p1();
    let s = init(p);
    s = reduce(s, p, { type: 'selectAngle', angle: 9 });
    s = reduce(s, p, { type: 'setFeed', value: 1.07 });
    s = reduce(s, p, { type: 'trial' });
    s = reduce(s, p, { type: 'trialEnd' });
    expect(s.phase).toBe('done');
    s = reduce(s, p, { type: 'retry' });
    expect(s.phase).toBe('setting');
    expect(s.angle).toBeNull();
    expect(s.feed).toBe(0);
    expect(s.lastResult).toBeNull();
  });
});
