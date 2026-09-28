import { describe, it, expect } from 'vitest';
import {
  createFixedClock,
  createSystemClock,
  seedFrom,
  nextFloat,
  nextInt,
  pick,
} from './clock';

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createFixedClock', () => {
  it('now() を2回呼ぶと1秒ずつ進む', () => {
    const clock = createFixedClock('2026-01-01T00:00:00.000Z');
    expect(clock.now()).toBe('2026-01-01T00:00:00.000Z');
    expect(clock.now()).toBe('2026-01-01T00:00:01.000Z');
    expect(clock.now()).toBe('2026-01-01T00:00:02.000Z');
  });
});

describe('createSystemClock', () => {
  it('uuid() が UUID v7 の形式に合う', () => {
    const clock = createSystemClock();
    const id = clock.uuid();
    expect(id).toMatch(UUID_V7_RE);
  });

  it('後から作った UUID v7 の方が文字列として大きい', async () => {
    const clock = createSystemClock();
    const a = clock.uuid();
    await new Promise((r) => setTimeout(r, 5));
    const b = clock.uuid();
    expect(b > a).toBe(true);
  });

  it('now() が ISO 8601 UTC の形式に合う', () => {
    const clock = createSystemClock();
    expect(clock.now()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('mulberry32 rng', () => {
  it('同じ種から nextFloat を100回回した列が2回とも同じになる', () => {
    const run = () => {
      let s = seedFrom(42);
      const out: number[] = [];
      for (let i = 0; i < 100; i++) {
        const [v, ns] = nextFloat(s);
        out.push(v);
        s = ns;
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('nextFloat の値がすべて 0 以上 1 未満', () => {
    let s = seedFrom(12345);
    for (let i = 0; i < 1000; i++) {
      const [v, ns] = nextFloat(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      s = ns;
    }
  });

  it('nextInt(s, 1, 6) を1000回回すと 1〜6 のすべてが出て範囲外は出ない', () => {
    let s = seedFrom(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const [v, ns] = nextInt(s, 1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
      s = ns;
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('pick に空配列を渡すと例外', () => {
    const s = seedFrom(1);
    expect(() => pick(s, [])).toThrow();
  });

  it('pick は items の要素を返す', () => {
    let s = seedFrom(99);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i++) {
      const [v, ns] = pick(s, items);
      expect(items).toContain(v);
      s = ns;
    }
  });
});
