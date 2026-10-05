import { describe, it, expect } from 'vitest';
import { init, reduce, qualities, starsOf, isValidResume, lastTapResult, bandTargetMs, targetMsOf } from './logic';
import { TIME_ANCHOR } from './params';
import { resultOf, guideFor } from './messages';
import type { WindingState, Level } from './logic';
import { paramsOf, SECTION_LENGTH, MAX_SPEED, TENSION, DRIFT, NOISE_AMP, RANGE_CENTER, RANGE_WIDTH, RANGE_REACHABLE, YARN_FEEL } from './params';
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

describe('winding logic T2-09a A (範囲・流れ・引っかかり) T2-16a 改訂', () => {
  it('11. 最初の帯の範囲: 中心はメーターの中央 (50)、幅はレベルごとに固定 (RANGE_WIDTH)', () => {
    const widths = { 1: 30, 2: 18, 3: 10 } as const;
    for (const level of [1, 2, 3] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const s = init({ level, patternId: 'x', sections: 3, seed });
        expect(s.range.center, `level ${level} seed ${seed}`).toBe(50);
        expect(s.range.width).toBe(widths[level]);
        expect(s.range.min).toBe(50 - widths[level] / 2);
        expect(s.range.max).toBe(50 + widths[level] / 2);
      }
    }
  });

  it('12. 範囲は同じ種なら同じ (初期化は種によらないので、どの種も同じ範囲)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const a = init({ level: 3, patternId: 'x', sections: 3, seed }).range;
      const b = init({ level: 3, patternId: 'x', sections: 3, seed: 7 }).range;
      expect(b).toEqual(a);
    }
  });

  it('13. 引っかかりのメッセージ用に、引っかかりの発生を State から分かる (snagged フラグは tick ごとに消える)', () => {
    let sawSnag = false;
    let flagged: { now: boolean; next: boolean } | null = null;
    for (let seed = 1; seed <= 20 && !sawSnag; seed++) {
      let s = init({ level: 1, patternId: 'x', sections: 3, seed });
      s = reduce(s, { type: 'start' });
      s = reduce(s, { type: 'setPedal', value: 33 }); // 範囲の中央 (流れでも切れない)
      for (let i = 0; i < 3000 && !sawSnag; i++) {
        s = reduce(s, { type: 'tick', dtMs: 100 });
        if (s.snagRaised) sawSnag = true;
      }
      if (sawSnag) {
        // snagRaised は tick のあいだだけ立つ (前の tick の結果を消す)
        const next = reduce(s, { type: 'tick', dtMs: 100 });
        flagged = { now: s.snagRaised, next: next.snagRaised };
      }
    }
    expect(sawSnag).toBe(true);
    expect(flagged!.now).toBe(true);
    expect(flagged!.next).toBe(false);
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
    cur = reduce(cur, { type: 'setPedal', value: 40 }); // 範囲の上から十分中 (流れが強くても切れない)
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
    // 目標は帯ごとに足した合計 (T2-16b)。2帯の初級 = 2 × 約16.9秒
    const base2 = mk(0.9, 0);
    expect(starsOf(mk(0.9, targetMsOf(base2)))).toBe(3);
    expect(starsOf(mk(0.9, targetMsOf(base2) + 1))).toBe(2);
    expect(starsOf(mk(0.7, 10000))).toBe(2);
    expect(starsOf(mk(0.5, 10000))).toBe(1);
  });

  it('16. 目標の時間は、はじめに全帯ぶん決まっている (T2-16 その6)。summary に出る', () => {
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    // 始めるときに全帯ぶんの合計 (レベル1 は全帯が同じ範囲なので 3帯ぶん同じ値)
    const one = bandTargetMs(s.ranges[0]!);
    expect(targetMsOf(s)).toBeCloseTo(one * 3, 6);
    s = { ...s, phase: 'cutting' };
    s = reduce(s, { type: 'cut' });
    s = { ...s, phase: 'cutting' };
    s = reduce(s, { type: 'cut' });
    expect(targetMsOf(s)).toBeCloseTo(one * 3, 6);
    const r = resultOf({ ...s, elapsedMs: 95000 }, 'standalone', '2026-09-30T19:00:00+09:00');
    const timeLine = (r.summary ?? []).find((t: string) => t.startsWith('巻いた時間'));
    expect(timeLine).toBeDefined();
    expect(timeLine).toContain('1分'); // 巻いた時間 1分35秒
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

  it('2. 切れたときの案内 (一度きりのお知らせ。PU-14a でメッセージ欄は無くなった) は「切れた糸のあたりを押して、つないでください」。ready は巻き始める案内。cutting はハサミの案内 (T2-16c)。それ以外は無し', () => {
    const g = guideFor('broken', (x: string) => x)!;
    expect(g.key).toBe('broken');
    expect(g.text).toContain('切れた糸のあたりを押して');
    expect(guideFor('ready', (x: string) => x)!.text).toContain('巻き始める');
    expect(guideFor('winding', (x: string) => x)).toBeNull();
    expect(guideFor('cutting', (x: string) => x)!.text).toContain('ハサミを糸の所まで引っぱって切ります'); // T2-16c
    expect(guideFor('done', (x: string) => x)).toBeNull();
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

  it('2. winding で 10 秒進めても、範囲の中心も幅も変わらない (T2-16a: 巻いているあいだは動かない)。broken のあいだも変わらない', () => {
    for (const level of [1, 3] as const) {
      let s = init({ level, patternId: 'x', sections: 3, seed: 3 });
      s = reduce(s, { type: 'start' });
      s = reduce(s, { type: 'setPedal', value: 50 });
      const before = { ...s.range };
      for (let i = 0; i < 100; i++) {
        s = reduce(s, { type: 'tick', dtMs: 100 });
        if (s.phase === 'broken') break;
      }
      expect(s.range, `level ${level}`).toEqual(before);
    }
    // broken のあいだも変わらない
    let s = init({ level: 3, patternId: 'x', sections: 3, seed: 3 });
    s = reduce(s, { type: 'start' });
    s = { ...s, phase: 'broken' as const };
    const before = { ...s.range };
    for (let i = 0; i < 50; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.range).toEqual(before);
  });

  it('3. 巻いているあいだ、範囲の中心はメーターの中央 (50)・幅は RANGE_WIDTH のまま。同じ種と操作なら同じ', () => {
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
    const w0 = RANGE_WIDTH(1);
    const trace = run(3);
    expect(trace.length).toBeGreaterThan(100);
    for (const { center, width } of trace) {
      expect(center).toBe(50);
      expect(width).toBe(w0);
    }
    expect(trace).toEqual(run(3)); // 同じ種なら同じ
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
    const run = (feel: YarnFeel, seed: number): number => {
      let s = init({ level: 1, patternId: 'x', sections: 3, seed, feel });
      s = reduce(s, { type: 'start' });
      s = reduce(s, { type: 'setPedal', value: 100 }); // 範囲の上を外れ続ける
      for (let i = 0; i < 2000; i++) {
        s = reduce(s, { type: 'tick', dtMs: 500 });
        if (s.brk.kind === 'broken') return i;
      }
      return 2000;
    };
    // どの種でも、細い糸が標準より遅く切れることはない。種によっては早く切れる
    let strictlyEarlier = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const fine = run('fine', seed);
      const std = run('standard', seed);
      expect(fine, `seed ${seed}: fine ${fine} / standard ${std}`).toBeLessThanOrEqual(std);
      if (fine < std) strictlyEarlier++;
    }
    expect(strictlyEarlier).toBeGreaterThanOrEqual(1);
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

describe('winding logic T2-16a (張りと適正の範囲)', () => {
  /** 'cutting' に進めて cut (帯の端を結ぶ) を送る */
  function cutBand(s: WindingState): WindingState {
    const cutting = { ...s, phase: 'cutting' as const };
    return reduce(cutting, { type: 'cut' });
  }

  it('1. 帯が変わるときだけ範囲の位置が変わることがある (レベル2 ±10・レベル3 ±15。レベル1 は変わらない)。乱数は State の種から', () => {
    // レベル1: どの種でも中心は 50 のまま
    for (let seed = 1; seed <= 10; seed++) {
      let s = init({ level: 1, patternId: 'x', sections: 3, seed });
      s = cutBand(s);
      expect(s.range.center, `L1 seed ${seed}`).toBe(50);
      expect(s.range.width).toBe(RANGE_WIDTH(1));
    }
    // レベル2: 中心は 50±10 (届く範囲に丸める)。変わることがある
    const l2 = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      let s = init({ level: 2, patternId: 'x', sections: 3, seed });
      s = cutBand(s);
      expect(s.range.center).toBeGreaterThanOrEqual(40 - 1e-9);
      expect(s.range.center).toBeLessThanOrEqual(60 + 1e-9);
      expect(Math.abs(s.range.center - 50)).toBeLessThanOrEqual(10 + 1e-9);
      expect(s.range.width).toBe(RANGE_WIDTH(2));
      l2.add(Math.round(s.range.center * 100));
    }
    expect(l2.size).toBeGreaterThan(1); // 位置が変わることがある
    // レベル3: 中心は 36〜65 (ペダルで必ず届く範囲に丸める)・50±15
    const l3 = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      let s = init({ level: 3, patternId: 'x', sections: 3, seed });
      s = cutBand(s);
      expect(s.range.center).toBeGreaterThanOrEqual(35 - 1e-9); // RANGE_CENTER(3).min (T2-16 その3 で届く範囲が広がった)
      expect(s.range.center).toBeLessThanOrEqual(65 + 1e-9);
      expect(Math.abs(s.range.center - 50)).toBeLessThanOrEqual(15 + 1e-9);
      l3.add(Math.round(s.range.center * 100));
    }
    expect(l3.size).toBeGreaterThan(1);
  });

  it('2. 帯が変わったあとの範囲も、同じ種なら同じ', () => {
    const run = (seed: number): number => {
      let s = init({ level: 2, patternId: 'x', sections: 3, seed });
      s = { ...s, phase: 'winding' as const, lengths: [SECTION_LENGTH, 0, 0] };
      s = cutBand(s);
      return s.range.center;
    };
    expect(run(5)).toBe(run(5));
    expect(run(6)).toBe(run(6));
  });

  it('3. どのレベル・どの位置でも、ペダル 10〜100 で範囲の中心に届く', () => {
    for (const level of [1, 2, 3] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        let s = init({ level, patternId: 'x', sections: 3, seed });
        s = cutBand(s);
        const c = s.range.center;
        const pedalFor = (c - TENSION.base) / TENSION.perPedal;
        expect(pedalFor, `level ${level} seed ${seed} center ${c}`).toBeGreaterThanOrEqual(10 - 1e-9);
        expect(pedalFor).toBeLessThanOrEqual(100 + 1e-9);
      }
    }
  });

  it('4. 引っかかり: 巻いているあいだに張りが急に上がり (+15〜25・0.2秒)、1〜2秒かけて戻る', () => {
    // 引っかかりが起きて、戻りきるまで巻ける種を探す
    let found: { seed: number; maxSnag: number; riseMs: number; recoverMs: number } | null = null;
    for (let seed = 1; seed <= 40 && found === null; seed++) {
      let s = init({ level: 3, patternId: 'x', sections: 3, seed });
      s = reduce(s, { type: 'start' });
      s = reduce(s, { type: 'setPedal', value: 33 }); // 範囲の中央付近 (引っかかり以外の張りは安定)
      let maxSnag = 0;
      let eventMs = -1;
      let fullMs = -1;
      let zeroMs = -1;
      let t = 0;
      for (let i = 0; i < 300 && s.phase === 'winding' && zeroMs < 0; i++) {
        s = reduce(s, { type: 'tick', dtMs: 100 });
        t += 100;
        if (s.snagRaised) eventMs = t; // 引っかかった tick (上がり途中・snag は半分)
        if (eventMs > 0) {
          if (s.pedal.snag > maxSnag) {
            maxSnag = s.pedal.snag;
            fullMs = t;
          }
          if (maxSnag > 0 && s.pedal.snag === 0) zeroMs = t;
        }
      }
      if (eventMs > 0 && maxSnag >= 15 && fullMs > eventMs && zeroMs > fullMs) {
        found = { seed, maxSnag, riseMs: fullMs - eventMs, recoverMs: zeroMs - fullMs };
      }
    }
    expect(found, '引っかかりが起きて、戻りきるまで巻ける種').not.toBeNull();
    expect(found!.maxSnag, `上がり幅 ${found!.maxSnag}`).toBeLessThanOrEqual(25 + 1e-6);
    expect(found!.riseMs, '0.5秒ほどで上がる (T2-16 その3)').toBeLessThanOrEqual(500 + 1e-6);
    expect(found!.recoverMs, '2〜3秒かけて徐々に戻る (T2-16 その3)').toBeGreaterThanOrEqual(2000 - 1e-6);
    expect(found!.recoverMs).toBeLessThanOrEqual(3000 + 1e-6);
  });
});

describe('T2-16 その3: 張り≒ペダルの位置・引っかかりで切れる (猶予つき)', () => {
  it('1. 揺れが 0 のとき、ペダル 0 で張り 0・ペダル 50 で張り 50 (張り≒ペダルの位置)', () => {
    const zero = { pedal: 0, noise: 0, drift: 0, snag: 0, rng: seedFrom(1) };
    expect(tensionOf(zero, TENSION, 0)).toBe(0);
    const mid = { pedal: 50, noise: 0, drift: 0, snag: 0, rng: seedFrom(1) };
    expect(tensionOf(mid, TENSION, 0)).toBe(50);
  });

  it('2. 最初の帯で、ペダル 50 の張りは範囲の中。ペダル 0 の張りは範囲の外 (下)', () => {
    const s = init({ level: 1, patternId: 'x', sections: 3, seed: 1 });
    expect(s.range.min).toBeLessThanOrEqual(50);
    expect(50).toBeLessThanOrEqual(s.range.max);
    // ペダル 0 の張り (揺れが最大でも) は範囲の下より下
    expect(NOISE_AMP(1)).toBeLessThan(s.range.min);
  });

  it('3. RANGE_REACHABLE は新しい式に合う (ペダル 10〜100 で中心 10〜100 に届く)', () => {
    expect(RANGE_REACHABLE()).toEqual({ min: 10, max: 100 });
  });

  it('4. 引っかかりで張りが上の端 + 8 を超えると猶予があり、レベル1 では 2 秒続くと 1 本切れる', () => {
    // 流れでの糸切れが先に起きず、猶予の時間が溜まって 2 秒で切れる種を選ぶ
    let s: WindingState | null = null;
    for (let seed = 1; seed <= 60 && s === null; seed++) {
      let st = init({ level: 1, patternId: 'x', sections: 3, seed });
      st = reduce(st, { type: 'start' });
      st = reduce(st, { type: 'setPedal', value: 70 }); // 範囲の上の端 (65) より上
      // 引っかかり (+25) を手で立てる (張り 95。引っかかりが無ければ 70)
      st = { ...st, pedal: { ...st.pedal, snag: 25, snagTarget: 25 } };
      let over = false;
      for (let i = 0; i < 19; i++) {
        st = reduce(st, { type: 'tick', dtMs: 100 });
        if (st.snagOverMs > 0) over = true; // 猶予の時間が溜まっている
      }
      if (st.phase !== 'winding' || !over) continue;
      st = reduce(st, { type: 'tick', dtMs: 100 });
      if (st.phase === 'broken' && st.breaks === 1) s = st;
    }
    expect(s, '猶予 (2 秒) のあとで切れる種').not.toBeNull();
  });

  it('5. 猶予のうちにペダルを戻して張りが下がると数え直すので切れない', () => {
    let s = init({ level: 1, patternId: 'x', sections: 3, seed: 1 });
    s = reduce(s, { type: 'start' });
    s = reduce(s, { type: 'setPedal', value: 70 });
    s = { ...s, pedal: { ...s.pedal, snag: 25, snagTarget: 25 } };
    s = reduce(s, { type: 'tick', dtMs: 1500 }); // 1.5 秒超過 (猶予 2 秒の途中)
    expect(s.phase).toBe('winding');
    s = reduce(s, { type: 'setPedal', value: 30 }); // 張り 30 + 戻りかけの引っかかり
    for (let i = 0; i < 40; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.phase, '切れない').toBe('winding');
  });
});

describe('winding logic T2-16 その7 (制限時間の割合を 0.6 に)', () => {
  it('割合は 0.6 (範囲の下の端から 60% の所の張りで計算する。管理者「50% だと簡単すぎた」)', () => {
    expect(TIME_ANCHOR).toBe(0.6);
  });
});

describe('winding logic T2-16 その6 (制限時間: 各帯の範囲の中心の張りで巻いた時間の合計)', () => {
  /** 張り tension になるペダルの値 (張り = base + perPedal × pedal) */
  const pedalFor = (tension: number): number => (tension - TENSION.base) / TENSION.perPedal;
  /** 帯の計算の基準になる張り (範囲の TIME_ANCHOR の位置。0.5 なら中心) */
  const anchorOf = (range: { min: number; max: number }): number =>
    range.min + (range.max - range.min) * TIME_ANCHOR;
  /** その張りで最後まで巻いたときの時間 (ms) */
  const bandTime = (range: { min: number; max: number }): number => {
    const speed = (pedalFor(anchorOf(range)) / 100) * TENSION.maxSpeed;
    return (SECTION_LENGTH / speed) * 1000;
  };

  it('1. お題を始めるときに帯の数だけ範囲が決まっていて、どの範囲も 20〜80 に収まる (1本目は中心 50)', () => {
    for (const level of [1, 2, 3] as Level[]) {
      const s = init({ level, patternId: 'x', sections: 3 + level, seed: 7 });
      expect(s.ranges.length, `レベル${level} の範囲の数`).toBe(3 + level);
      for (const r of s.ranges) {
        expect(r.min, `レベル${level} の下の端`).toBeGreaterThanOrEqual(20);
        expect(r.max, `レベル${level} の上の端`).toBeLessThanOrEqual(80);
      }
      expect(s.ranges[0]!.center, '1本目は真ん中').toBe(50);
      expect(s.range).toEqual(s.ranges[0]);
    }
  });

  it('2. 制限時間 = 各帯の(帯の長さ ÷ 中心の張りの速さ)の合計', () => {
    const s = init({ level: 2, patternId: 'x', sections: 5, seed: 3 });
    const sum = s.ranges.reduce((acc, r) => acc + bandTime(r), 0);
    expect(s.targetMs).toBeCloseTo(sum, 6);
  });

  /** 全帯を pedal で巻き切るまでの時間 (ms)。切れたら -1 */
  const windAll = (level: Level, seed: number, pedal: number): number => {
    const s0 = init({ level, patternId: 'x', sections: 3, seed });
    let s = reduce(s0, { type: 'start' });
    s = reduce(s, { type: 'setPedal', value: pedal });
    let guard = 0;
    while (s.phase !== 'done' && s.phase !== 'broken' && guard < 1200) {
      s = reduce(s, { type: 'tick', dtMs: 200 });
      if (s.phase === 'cutting') {
        s = reduce(s, { type: 'cut' });
        s = reduce(s, { type: 'setPedal', value: pedal }); // 帯が変わるとペダルは 0 に戻るので、もう一度踏む
      }
      guard += 1;
    }
    return s.phase === 'done' ? s.elapsedMs : -1;
  };

  it('3. 制限時間の計算の位置 (範囲の下の端から 60%) の張りちょうどで巻くと、制限時間ちょうどで終わる', () => {
    const s0 = init({ level: 1, patternId: 'x', sections: 3, seed: 1 });
    const anchor = s0.ranges[0]!.min + (s0.ranges[0]!.max - s0.ranges[0]!.min) * TIME_ANCHOR;
    const pedal = pedalFor(anchor);
    let ms = -1;
    for (let seed = 1; seed <= 60 && ms < 0; seed++) ms = windAll(1, seed, pedal);
    expect(ms, '切れずに巻き切れる種').toBeGreaterThan(0);
    expect(Math.abs(ms - s0.targetMs), '制限時間ちょうど (タイマーの刻みの誤差をのぞく)').toBeLessThanOrEqual(200);
  });

  it('4. 制限時間の計算の位置より強めに巻けば制限時間より早く終わる', () => {
    const s0 = init({ level: 1, patternId: 'x', sections: 3, seed: 1 });
    const anchor = s0.ranges[0]!.min + (s0.ranges[0]!.max - s0.ranges[0]!.min) * TIME_ANCHOR;
    const pedal = pedalFor(anchor) + 5;
    let ms = -1;
    for (let seed = 1; seed <= 60 && ms < 0; seed++) ms = windAll(1, seed, pedal);
    expect(ms, '切れずに巻き切れる種').toBeGreaterThan(0);
    expect(ms, '制限時間より早い').toBeLessThan(s0.targetMs);
  });

  it('5. レベル2・3 では帯ごとに範囲の位置が動く (レベル1 は動かない)。結んで次の帯へ行くと今の範囲が切り替わる', () => {
    const s1 = init({ level: 1, patternId: 'x', sections: 3, seed: 5 });
    expect(s1.ranges.every((r) => r.center === 50), 'レベル1 は動かさない').toBe(true);
    const s2 = init({ level: 2, patternId: 'x', sections: 5, seed: 5 });
    const s = reduce({ ...s2, phase: 'cutting' }, { type: 'cut' });
    expect(s.current).toBe(1);
    expect(s.range).toEqual(s2.ranges[1]);
    // レベル2 は位置が動くことがある (種によっては同じ場合もある) ので、動く種も確かめる
    let moved = false;
    for (let seed = 1; seed <= 40 && !moved; seed++) {
      const st = init({ level: 2, patternId: 'x', sections: 5, seed });
      moved = st.ranges.some((r) => r.center !== 50);
    }
    expect(moved, 'レベル2 で範囲が動く種がある').toBe(true);
  });

  it('6. isValidResume は ranges を必須にする (持たない古い形の保存は再開しない)', () => {
    const s = init({ level: 1, patternId: 'x', sections: 3, seed: 1 });
    expect(isValidResume(s)).toBe(true);
    const old: Record<string, unknown> = { ...s };
    delete old.ranges;
    expect(isValidResume(old as never)).toBe(false);
  });

  it('7. 結果の「目標」は、足した目標の時間 (summary と resultLines に出る)', () => {
    const s: WindingState = { ...init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 }), targetMs: 90000, elapsedMs: 95000 };
    expect(targetMsOf(s)).toBe(90000);
    const r = resultOf(s, 'standalone', '2026-09-30T19:00:00+09:00');
    const line = (r.summary ?? []).find((t: string) => t.startsWith('巻いた時間')) ?? '';
    expect(line).toContain('1分35秒'); // 巻いた時間
    expect(line).toContain('(目標 1分30秒)');
  });
})