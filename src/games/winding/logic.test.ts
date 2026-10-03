import { describe, it, expect } from 'vitest';
import { init, reduce, qualities, starsOf, isValidResume, lastTapResult } from './logic';
import { resultOf, messageFor } from './messages';
import type { WindingState } from './logic';
import { paramsOf, SECTION_LENGTH, MAX_SPEED, TENSION, DRIFT, NOISE_AMP, RANGE_CENTER, RANGE_WIDTH, RANGE_WIDTH_SWING, YARN_FEEL } from './params';
import type { YarnFeel } from './params';
import { tensionOf } from '../../core/mechanics/pedal';
import { seedFrom } from '../../core/clock/clock';

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

  it('4. T2-09a: 初級で毎秒ペダルを合わせ直しながら全帯を巻くと、星3が取れる (時間内・適正 0.8 以上)', () => {
    const p1 = paramsOf(1);
    let passed = false;
    for (const seed of [1, 3, 7, 11, 21]) {
      let s = init({ level: 1, patternId: p1.patternId, sections: p1.sections, seed });
      let brokeOut = false;
      for (let sec = 0; sec < p1.sections; sec++) {
        s = reduce(s, { type: 'start' });
        s = reduce(s, { type: 'setPedal', value: 50 });
        for (let i = 0; i < 500 && s.phase === 'winding'; i++) {
          if (i % 10 === 0) {
            // 毎秒、張りを見てペダルを合わせ直す簡単なやり方
            const target = (s.range.min + s.range.max) / 2;
            const want = (target - 30 - s.pedal.drift - s.pedal.snag - s.pedal.noise) / 0.4;
            s = reduce(s, { type: 'setPedal', value: Math.min(100, Math.max(0, Math.round(want))) });
          }
          s = reduce(s, { type: 'tick', dtMs: 100 });
          if (s.phase === 'broken') {
            brokeOut = true;
            break;
          }
        }
        if (s.phase !== 'cutting') {
          brokeOut = true;
          break;
        }
        if (sec < p1.sections - 1) s = reduce(s, { type: 'cut' });
      }
      if (brokeOut || s.phase !== 'cutting') continue;
      s = reduce(s, { type: 'cut' });
      if (s.phase !== 'done') continue;
      const qs = qualities(s);
      const avg = qs.reduce((a, b) => a + b, 0) / qs.length;
      if (avg >= 0.8 && starsOf(s) === 3) {
        passed = true;
        break;
      }
    }
    expect(passed).toBe(true);
  });

  it("5. pedal 100 で巻くと、上級では同じ種で決まった回で 'broken'。切れた直後にペダル 0。tapThread で1回押すごとに1本つながり、全部で 'winding' に戻る。ペダル 0 のまま、breaks 1", () => {
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
    // tapThread で切れた糸を1回ずつ押すと 'winding' に戻る (T2-13c: 1回押し)
    if (a.brk.kind !== 'broken') throw new Error('brk should be broken');
    let next = a;
    const threads = [...a.brk.threads];
    for (let i = 0; i < threads.length; i++) {
      next = reduce(next, { type: 'tapThread', thread: threads[i]! });
      if (i < threads.length - 1) {
        expect(next.phase).toBe('broken'); // 残りがあるあいだは 'broken'
        expect(lastTapResult(a, next)).toBe('tiedOne');
      }
    }
    expect(next.phase).toBe('winding');
    expect(next.pedal.pedal).toBe(0); // ペダルは 0 のまま
    expect(next.breaks).toBe(1);
    expect(lastTapResult(a, next)).toBe('tiedAll');
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
    // 切れていない糸を探す (threads にも tied にも無い糸)
    const used = new Set<number>([...s.brk.threads, ...s.brk.tied]);
    let wrong = -1;
    for (let t = 0; t < 8; t++) {
      if (!used.has(t)) {
        wrong = t;
        break;
      }
    }
    expect(wrong).toBeGreaterThanOrEqual(0); // 8本のうち切れていない糸がある
    const next = reduce(s, { type: 'tapThread', thread: wrong });
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
    cur = reduce(cur, { type: 'tapThread', thread: 0 });
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

describe('winding logic T2-09a A (範囲がお題ごとに決まる・流れ・引っかかり)', () => {
  it('11. State の範囲 (range) は、難易度の幅と中心の範囲の中にある。中心はお題 (種) ごとに決まる', () => {
    const widths = { 1: 30, 2: 18, 3: 10 } as const;
    const centers = { 1: [45, 55], 2: [40, 60], 3: [35, 65] } as const;
    for (const level of [1, 2, 3] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const s = init({ level, patternId: 'x', sections: 3, seed });
        expect(s.range.max - s.range.min).toBe(widths[level]);
        const w = widths[level];
        expect(s.range.min).toBeGreaterThanOrEqual(centers[level][0] - w / 2 - 1e-9);
        expect(s.range.max).toBeLessThanOrEqual(centers[level][1] + w / 2 + 1e-9);
        // min と max の中心は範囲の中
        const c = (s.range.min + s.range.max) / 2;
        expect(c).toBeGreaterThanOrEqual(centers[level][0] - 1e-9);
        expect(c).toBeLessThanOrEqual(centers[level][1] + 1e-9);
      }
    }
  });

  it('12. 同じ種なら同じ範囲、違う種なら違うことがある', () => {
    const a = init({ level: 3, patternId: 'x', sections: 3, seed: 5 }).range;
    const b = init({ level: 3, patternId: 'x', sections: 3, seed: 5 }).range;
    expect(b).toEqual(a);
    // 12種のうち、少なくとも2つの違う中心が出る
    const centers = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = init({ level: 3, patternId: 'x', sections: 3, seed });
      centers.add(s.range.min + s.range.max);
    }
    expect(centers.size).toBeGreaterThanOrEqual(2);
  });

  it('13. 引っかかりのメッセージ用に、引っかかりの発生を State から分かる (snagged フラグは tick ごとに消える)', () => {
    let s = init({ level: 2, patternId: 'x', sections: 3, seed: 11 });
    s = reduce(s, { type: 'start' });
    s = reduce(s, { type: 'setPedal', value: 50 });
    let sawSnag = false;
    for (let i = 0; i < 3000; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
      if (s.snagRaised) sawSnag = true;
      // snagRaised は tick のあいだだけ立つ (前の tick の結果を消す)
      const next = reduce(s, { type: 'tick', dtMs: 100 });
      if (s.snagRaised && !next.snagRaised) break;
    }
    expect(sawSnag).toBe(true);
  });
});

describe('winding logic T2-09a B (目標の時間と星)', () => {
  it('14. elapsedMs は巻いていた時間と止まっていた時間の合計。糸切れを直している時間も含む', () => {
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    s = reduce(s, { type: 'start' });
    s = reduce(s, { type: 'tick', dtMs: 100 }); // winding (止まっていても数える)
    s = reduce(s, { type: 'tick', dtMs: 100 });
    const windingMs = s.elapsedMs;
    expect(windingMs).toBe(200);
    // 巻き切って cutting → 結ぶ → broken にする時間も数える
    let cur = s;
    cur = reduce(cur, { type: 'setPedal', value: 50 });
    for (let i = 0; i < 300 && cur.phase === 'winding'; i++) {
      cur = reduce(cur, { type: 'tick', dtMs: 100 });
    }
    expect(cur.phase).toBe('cutting');
    const afterCut = cur.elapsedMs;
    expect(afterCut).toBeGreaterThan(windingMs);
    // broken のあいだも進む ('broken' でも時間は進める。糸切れを直している時間も含む)
    let b = init({ level: 3, patternId: 'p-alt-kon', sections: 7, seed: 99 });
    b = reduce(b, { type: 'start' });
    for (let i = 0; i < 300; i++) {
      if (b.phase === 'broken') break;
      if (b.phase === 'winding') b = reduce(b, { type: 'setPedal', value: 100 });
      b = reduce(b, { type: 'tick', dtMs: 100 });
    }
    expect(b.phase).toBe('broken');
    const brokenMs = b.elapsedMs;
    for (let i = 0; i < 10; i++) b = reduce(b, { type: 'tick', dtMs: 100 });
    expect(b.elapsedMs).toBe(brokenMs + 1000);
  });

  it('15. starsOf: 目標の時間内なら星3 (適正 0.8 以上)、超えると星2 (適正 0.8 以上でも)', () => {
    const mk = (q: number, elapsedMs: number): WindingState => {
      const s = init({ level: 1, patternId: 'p-pin-kon', sections: 2, seed: 1 });
      return { ...s, sections: 2, windMs: [100, 100], okMs: [q * 100, q * 100], elapsedMs };
    };
    // 初級 2帯 = 30秒×2 = 60秒 = 60000ms が目標
    expect(starsOf(mk(0.9, 60000))).toBe(3);
    expect(starsOf(mk(0.9, 60001))).toBe(2);
    expect(starsOf(mk(0.7, 10000))).toBe(2);
    expect(starsOf(mk(0.5, 10000))).toBe(1);
  });

  it('16. 目標の時間は「1本あたりの秒数 × 帯の数」。resultOf の summary に「巻いた時間」が入る', () => {
    const r = resultOf({ ...init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 }), elapsedMs: 95000 }, 'standalone', '2026-09-30T19:00:00+09:00');
    const timeLine = (r.summary ?? []).find((s: string) => s.startsWith('巻いた時間'));
    expect(timeLine).toBeDefined();
    expect(timeLine).toContain('1分');
    expect(timeLine).toContain('1分30秒'); // 30秒 × 3 = 1分30秒
  });
});

describe('T2-09 追加修正a (糸量の +4 をやめる)', () => {
  it('1. ペダル・ぶれ・流れ・引っかかりが同じなら、progress 0 と progress 0.9 で張りが同じ', () => {
    // TENSION.yarnDrift を 0 にするので、progress は張りに影響しない
    const p = { ...TENSION, range: { min: 30, max: 70 } };
    const s = { pedal: 50, noise: 1, drift: 3, snag: 0, rng: seedFrom(1) };
    const t0 = tensionOf(s, p, 0);
    const t9 = tensionOf(s, p, 0.9);
    expect(t0).toBe(t9);
  });
});

describe('T2-13c (1回押してつなぐ・文言)', () => {
  /** 2本切れた State を作る */
  function twoBroken(): WindingState {
    const s = init({ level: 3, patternId: 'p-alt-kon', sections: 7, seed: 5 });
    return { ...s, phase: 'broken', brk: { kind: 'broken', threads: [1, 4], tied: [] } };
  }

  it('1. 1本つないで残りがあるとき、文は「1本つながりました。あと 1 本です」の形', () => {
    const s = twoBroken();
    const next = reduce(s, { type: 'tapThread', thread: 1 });
    const text = messageFor(next, s, next, (x: string) => x);
    expect(text).toContain('1本つながりました');
    expect(text).toContain('あと 1 本');
  });

  it('2. 切れたときの文は「切れた糸のあたりを押して、つないでください」', () => {
    const s = twoBroken();
    const text = messageFor(s, undefined, undefined, (x: string) => x);
    expect(text).toContain('切れた糸のあたりを押して');
  });

  it('2b. 1本つながった状態 (操作の直後でなくても) は「1本つながりました。あと 1 本です」を出し続ける', () => {
    const s = twoBroken();
    const tied1 = { ...s, brk: { kind: 'broken' as const, threads: [4], tied: [1] } };
    // prev/next を渡さない再描画 (ループでの定期更新) でも同じ文を出す
    const text = messageFor(tied1, undefined, undefined, (x: string) => x);
    expect(text).toContain('1本つながりました');
    expect(text).toContain('あと 1 本');
  });

  it('3. 切れていない糸を押すと wrongTaps が1増える。mismatches は無くなった', () => {
    const s = twoBroken();
    const next = reduce(s, { type: 'tapThread', thread: 2 });
    expect(next.wrongTaps).toBe(s.wrongTaps + 1);
    expect('mismatches' in next).toBe(false);
    expect(lastTapResult(s, next)).toBe('wrongThread');
  });

  it('4. 途中保存: 新しい形 (brk に first が無い) は再開できる。古い形 (brk.first がある) は再開しない', () => {
    const s = twoBroken();
    expect(isValidResume(s)).toBe(true);
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    const brk = old.brk as Record<string, unknown>;
    brk.first = { thread: 1, side: 'creel' };
    expect(isValidResume(old as never)).toBe(false);
  });
});

describe('T2-13c (成績欄)', () => {
  it('5. 結果の成績欄に「違う端を結ぼうとした回数」は無く、「違う糸を押した回数」はある', () => {
    const s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 3 });
    const done = { ...s, phase: 'done' as const, wrongTaps: 2 };
    const r = resultOf(done, 'standalone', '2026-10-05T23:00:00+09:00');
    expect(r.summary?.some((line) => line.includes('違う糸を押した回数 2回'))).toBe(true);
    expect(r.summary?.some((line) => line.includes('違う端'))).toBe(false);
    expect(r.resultLines?.some((line) => line.label.includes('違う端'))).toBe(false);
  });
});

describe('winding logic T2-11a (どの状態でも範囲に届く・範囲が動く)', () => {
  it('1. どの難易度でも、流れ・ぶれが最大に振れたときでも、ペダル 10〜100 で範囲の中に入れられる (min と max をカバー)', () => {
    // ペダル p の張り = base + perPedal × p + noise + drift (引っかかりは除く)。
    // 流れとぶれが同じ向きに最大に振れたとき、
    //   張りの最小 (p=10) ≤ 範囲の min、張りの最大 (p=100) ≥ 範囲の max
    // であれば、どの状態でも範囲の中に入れられる (T2-11a)
    for (const level of [1, 2, 3] as const) {
      const dp = DRIFT(level);
      const amp = NOISE_AMP(level);
      const c = RANGE_CENTER(level);
      const width = RANGE_WIDTH(level);
      for (const center of [c.min, c.max]) {
        const range = { min: center - width / 2, max: center + width / 2 };
        const worstLow = TENSION.base + TENSION.perPedal * 10 - dp.max - amp;
        const worstHigh = TENSION.base + TENSION.perPedal * 100 + dp.max + amp;
        expect(worstLow, `level ${level} c${center}`).toBeLessThanOrEqual(range.min);
        expect(worstHigh, `level ${level} c${center}`).toBeGreaterThanOrEqual(range.max);
      }
    }
  });

  it('2. winding で 10 秒進めると、範囲の中心か幅が変わる。broken のあいだは変わらない', () => {
    for (const level of [1, 3] as const) {
      let s = init({ level, patternId: 'x', sections: 3, seed: 3 });
      s = reduce(s, { type: 'start' });
      s = reduce(s, { type: 'setPedal', value: 50 });
      const before = { ...s.range };
      for (let i = 0; i < 100; i++) {
        s = reduce(s, { type: 'tick', dtMs: 100 });
        if (s.phase === 'broken') break;
      }
      const moved = s.range.center !== before.center || s.range.width !== before.width;
      expect(moved, `level ${level}`).toBe(true);
    }
    // broken のあいだは変わらない
    let s = init({ level: 3, patternId: 'x', sections: 3, seed: 3 });
    s = reduce(s, { type: 'start' });
    s = { ...s, phase: 'broken' as const };
    const before = { ...s.range };
    for (let i = 0; i < 50; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.range).toEqual(before);
  });

  it('3. 中心は RANGE_CENTER の中・幅は RANGE_WIDTH ± RANGE_WIDTH_SWING から外れない。同じ種と操作なら同じ動き', () => {
    const run = (seed: number): Array<{ center: number; width: number }> => {
      // 初級 (糸切れが起きにくく、10 秒以上巻ける) で確かめる
      let s = init({ level: 1, patternId: 'x', sections: 3, seed });
      s = reduce(s, { type: 'start' });
      s = reduce(s, { type: 'setPedal', value: 50 });
      const out: Array<{ center: number; width: number }> = [];
      for (let i = 0; i < 300 && s.phase === 'winding'; i++) {
        s = reduce(s, { type: 'tick', dtMs: 100 });
        out.push({ center: s.range.center, width: s.range.width });
      }
      return out;
    };
    const c = RANGE_CENTER(1);
    const w0 = RANGE_WIDTH(1);
    const sw = RANGE_WIDTH_SWING(1);
    const trace = run(3);
    expect(trace.length).toBeGreaterThan(100);
    for (const { center, width } of trace) {
      expect(center).toBeGreaterThanOrEqual(c.min - 1e-9);
      expect(center).toBeLessThanOrEqual(c.max + 1e-9);
      expect(width).toBeGreaterThanOrEqual(w0 - sw - 1e-9);
      expect(width).toBeLessThanOrEqual(w0 + sw + 1e-9);
    }
    expect(trace).toEqual(run(3)); // 同じ種なら同じ動き
  });
});

describe('winding logic T2-14a (お題15題・puzzleId)', () => {
  it('1. init に puzzleId を渡すと、State が puzzleId を持つ。帯の数はお題どおり', () => {
    const s = init({ level: 2, patternId: 'p-chalk-char', sections: 5, seed: 7, puzzleId: 's3' });
    expect(s.puzzleId).toBe('s3');
    expect(s.sections).toBe(5);
  });

  it('2. 途中保存: puzzleId が無い古い形は再開しない。puzzleId があれば再開できる', () => {
    const s = init({ level: 1, patternId: 'p-muji-kon', sections: 3, seed: 1, puzzleId: 's1' });
    expect(isValidResume(s)).toBe(true);
    // 古い形: puzzleId のキーそのものが無い
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete old.puzzleId;
    expect(isValidResume(old as never)).toBe(false);
  });
});

describe('winding logic T2-14b (糸の手応え)', () => {
  it('1. 細い糸のお題は、同じ種・同じ外れ方で標準より早く切れる', () => {
    const run = (feel: YarnFeel): number => {
      let s = init({ level: 1, patternId: 'x', sections: 3, seed: 7, feel });
      s = reduce(s, { type: 'start' });
      s = reduce(s, { type: 'setPedal', value: 100 }); // 範囲の上を外れ続ける
      for (let i = 0; i < 2000; i++) {
        s = reduce(s, { type: 'tick', dtMs: 500 });
        if (s.brk.kind === 'broken') return i;
      }
      return 2000;
    };
    const fine = run('fine');
    const std = run('standard');
    expect(fine, `fine ${fine} / standard ${std}`).toBeLessThan(std);
  });

  it('2. 太い糸のお題は、同じ種で流れの動きが大きい (1フレームの流れの量を比べる)', () => {
    const run = (feel: YarnFeel, seed: number): number => {
      let s = init({ level: 2, patternId: 'x', sections: 3, seed, feel });
      s = reduce(s, { type: 'start' });
      s = reduce(s, { type: 'setPedal', value: 50 });
      s = reduce(s, { type: 'tick', dtMs: 100 });
      return Math.abs(s.pedal.drift);
    };
    for (const seed of [5, 11, 23]) {
      expect(run('thick', seed), `seed ${seed}`).toBeGreaterThan(run('standard', seed));
    }
  });

  it('3. どの手応え・どの難易度でも、流れ・ぶれが最大に振れたときペダル 10〜100 で範囲の中に入れられる (T2-11)', () => {
    for (const feel of ['standard', 'fine', 'thick'] as const) {
      const f = YARN_FEEL[feel];
      for (const level of [1, 2, 3] as const) {
        const dp = DRIFT(level);
        const eff = { ...dp, perSec: dp.perSec * f.driftMul, snagRate: dp.snagRate * f.snagMul };
        const amp = NOISE_AMP(level);
        const c = RANGE_CENTER(level);
        const width = RANGE_WIDTH(level);
        for (const center of [c.min, c.max]) {
          const range = { min: center - width / 2, max: center + width / 2 };
          const worstLow = TENSION.base + TENSION.perPedal * 10 - eff.max - amp;
          const worstHigh = TENSION.base + TENSION.perPedal * 100 + eff.max + amp;
          expect(worstLow, `feel ${feel} level ${level} c${center}`).toBeLessThanOrEqual(range.min);
          expect(worstHigh, `feel ${feel} level ${level} c${center}`).toBeGreaterThanOrEqual(range.max);
        }
      }
    }
  });
});
