import { describe, it, expect } from 'vitest';
import { init, reduce, qualities, starsOf, isValidResume, lastTapResult, bandTargetMs, targetMsOf } from './logic';
import { TIME_SCISSORS_TIE_MS, TIME_PER_SPIKE_MS, SPIKE_COUNT_RANGE } from './params';
import * as params from './params';
import { resultOf, guideFor } from './messages';
import type { WindingState, Level } from './logic';
import { paramsOf, SECTION_LENGTH, MAX_SPEED, TENSION, RANGE_CENTER, RANGE_WIDTH, RANGE_REACHABLE } from './params';

/** 20秒 + 少し の tick を送る (pedal 50 用)。pedal 40 など遅いときは、'cutting' まで続ける */
function windToCut(s: WindingState, pedal: number): WindingState {
  let cur = reduce(s, { type: 'setPedal', value: 30 });
  cur = reduce(cur, { type: 'setPedal', value: pedal });
  for (let i = 0; i < 2000; i++) {
    // 引っかかりで切れたら、切れた糸をつないで同じペダルで巻き直す (T2-19c で引っかかりが起きやすくなった)
    if (cur.phase === 'broken' && cur.brk.kind === 'broken') {
      for (const th of cur.brk.threads) cur = reduce(cur, { type: 'tapThread', thread: th });
      cur = reduce(cur, { type: 'setPedal', value: 30 });
      cur = reduce(cur, { type: 'setPedal', value: pedal });
      continue;
    }
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
    s = reduce(s, { type: 'setPedal', value: 30 });
    expect(s.phase).toBe('winding');
    s = reduce(s, { type: 'setPedal', value: 50 });
    for (let i = 0; i < 2001 && s.phase !== 'cutting'; i++) {
      // 引っかかりで切れたら、切れた糸をつなぎ、張りが収まってからもう一度巻く (T2-19c)
      if (s.phase === 'broken' && s.brk.kind === 'broken') {
        for (const th of s.brk.threads) s = reduce(s, { type: 'tapThread', thread: th });
        if (s.phase === 'winding') {
          // 張りを確かめてから、範囲の真ん中に来るペダルに戻す
          s = reduce(s, { type: 'setPedal', value: 0 });
          s = reduce(s, { type: 'tick', dtMs: 100 });
          const want = Math.round(50 - s.tension);
          s = reduce(s, { type: 'setPedal', value: Math.min(100, Math.max(0, want)) });
        }
        continue;
      }
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.phase).toBe('cutting');
    expect(s.pedal.pedal).toBe(0);
    // lengths[0] は SECTION_LENGTH に揃えられる
    expect(s.lengths[0]).toBe(SECTION_LENGTH);
  });

  it("2. 'broken' のとき setPedal は効かない (ready では 0 は始まらない・0 より大きいと巻き始まる。T2-18a)", () => {
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    s = reduce(s, { type: 'setPedal', value: 0 });
    expect(s.phase).toBe('ready');
    expect(s.pedal.pedal).toBe(0);
    // broken を作る: 上級でスパイクを強制する (切れるのはスパイクの猶予だけ。T2-20a)
    let b = init({ level: 3, patternId: 'p-alt-kon', sections: 7, seed: 42 });
    b = reduce(b, { type: 'setPedal', value: 30 });
    b = { ...b, spikePlan: { left: 1, atMs: 0 } };
    for (let i = 0; i < 200; i++) {
      if (b.phase === 'broken') break;
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
    s = reduce(s, { type: 'setPedal', value: 30 });
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
        s = reduce(s, { type: 'setPedal', value: 30 });
        s = reduce(s, { type: 'setPedal', value: 50 });
        for (let i = 0; i < 2000 && s.phase === 'winding'; i++) {
          // 毎フレーム、張りが範囲の真ん中から外れた分だけペダルを戻す簡単なやり方 (T2-19c で揺れが大きくなったため毎フレーム)
          const target = (s.range.min + s.range.max) / 2;
          const want = s.pedal.pedal + (target - s.tension);
          s = reduce(s, { type: 'setPedal', value: Math.min(100, Math.max(0, Math.round(want))) });
          s = reduce(s, { type: 'tick', dtMs: 100 });
          // 引っかかりで切れたら、つないで巻き直す (T2-19c)
          if (s.phase === 'broken' && s.brk.kind === 'broken') {
            for (const th of s.brk.threads) s = reduce(s, { type: 'tapThread', thread: th });
            s = reduce(s, { type: 'setPedal', value: 30 });
            s = reduce(s, { type: 'setPedal', value: 50 });
            continue;
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

  it("5. スパイクの猶予 (2秒) を過ぎると同じ種で決まった回で 'broken'。切れた直後にペダル 0。tapThread で1回押すごとに1本つながり、全部で 'winding' に戻る。ペダル 0 のまま、breaks 1 (T2-20a)", () => {
    const p3 = paramsOf(3);
    const run = () => {
      let s = init({ level: 3, patternId: p3.patternId, sections: p3.sections, seed: 99 });
      s = reduce(s, { type: 'setPedal', value: 30 });
      s = { ...s, spikePlan: { left: 1, atMs: 0 } }; // スパイクを強制する (切れるのはスパイクの猶予だけ。T2-20a)
      for (let i = 0; i < 300; i++) {
        if (s.phase === 'broken') break;
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
    s = reduce(s, { type: 'setPedal', value: 30 });
    s = { ...s, spikePlan: { left: 1, atMs: 0 } }; // スパイクを強制する (T2-20a)
    for (let i = 0; i < 300; i++) {
      if (s.phase === 'broken') break;
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
    s = reduce(s, { type: 'setPedal', value: 30 }); // 巻き始める (T2-18a)
    s = reduce(s, { type: 'setPedal', value: 0 }); // 止めたまま tick
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
    cur = reduce(cur, { type: 'setPedal', value: 30 });
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

describe('winding logic T2-09a B (目標の時間と星)', () => {
  it('14. elapsedMs は巻いていた時間と止まっていた時間の合計。糸切れを直している時間も含む', () => {
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    s = reduce(s, { type: 'setPedal', value: 30 });
    s = reduce(s, { type: 'tick', dtMs: 100 }); // winding (止まっていても数える)
    s = reduce(s, { type: 'tick', dtMs: 100 });
    const windingMs = s.elapsedMs;
    expect(windingMs).toBe(200);
    // 巻き切って cutting → 結ぶ → broken にする時間も数える
    let cur = s;
    cur = reduce(cur, { type: 'setPedal', value: 40 });
    cur = { ...cur, spikePlan: { left: 0, atMs: 0 } }; // スパイクを起こさない (切れるのはスパイクだけ。T2-20a)
    for (let i = 0; i < 300 && cur.phase === 'winding'; i++) {
      cur = reduce(cur, { type: 'tick', dtMs: 100 });
    }
    expect(cur.phase).toBe('cutting');
    const afterCut = cur.elapsedMs;
    expect(afterCut).toBeGreaterThan(windingMs);
    // broken のあいだも進む ('broken' でも時間は進める。糸切れを直している時間も含む)
    let b = init({ level: 3, patternId: 'p-alt-kon', sections: 7, seed: 99 });
    b = reduce(b, { type: 'setPedal', value: 30 });
    b = { ...b, spikePlan: { left: 1, atMs: 0 } }; // スパイクを強制する (3秒で起こり、2秒の猶予で切れる。T2-20a)
    for (let i = 0; i < 300; i++) {
      if (b.phase === 'broken') break;
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
    // 始めるときに全帯ぶんの合計 + 5秒 × 3 (帯ごとにスパイクの回数が違うので合計で。T2-20b)
    const sum = s.ranges.reduce((acc, r) => acc + bandTargetMs(r), 0);
    expect(targetMsOf(s)).toBeCloseTo(sum, 6); // 帯ごと 5 秒の足し算はやめた (T2-21)
    s = { ...s, phase: 'cutting' };
    s = reduce(s, { type: 'cut' });
    s = { ...s, phase: 'cutting' };
    s = reduce(s, { type: 'cut' });
    expect(targetMsOf(s)).toBeCloseTo(sum, 6);
    const r = resultOf({ ...s, elapsedMs: 95000 }, 'standalone', '2026-09-30T19:00:00+09:00');
    const timeLine = (r.summary ?? []).find((t: string) => t.startsWith('巻いた時間'));
    expect(timeLine).toBeDefined();
    expect(timeLine).toContain('1分'); // 巻いた時間 1分35秒
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
    expect(guideFor('ready', (x: string) => x)!.text).toContain('右へ動かすと巻き始めます'); // T2-18a: 巻き始めるのボタンは無くなった
    expect(guideFor('ready', (x: string) => x)!.text).not.toContain('巻き始める');
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
  it('1. どの難易度でも、ペダルの動く幅のどこでも範囲の中に入れられる (min と max をカバー)', () => {
    // 張り = ペダルの位置 + 揺れの量 + スパイクの量 (T2-20a)。揺れの限界は範囲の幅の半分なので、
    // ペダルを範囲の中心に置けば揺れても範囲の中。ここでは範囲がペダルの動ける幅 (RANGE_REACHABLE) に
    // 入ること (範囲の中のどこにもペダルで届くこと) を確かめる
    for (const level of [1, 2, 3] as const) {
      const c = RANGE_CENTER(level);
      const width = RANGE_WIDTH(level);
      for (const center of [c.min, c.max]) {
        const range = { min: center - width / 2, max: center + width / 2 };
        expect(range.min, `level ${level} c${center}`).toBeGreaterThanOrEqual(RANGE_REACHABLE().min);
        expect(range.max, `level ${level} c${center}`).toBeLessThanOrEqual(RANGE_REACHABLE().max);
      }
    }
  });

  it('2. winding で 10 秒進めても、範囲の中心も幅も変わらない (T2-16a: 巻いているあいだは動かない)。broken のあいだも変わらない', () => {
    for (const level of [1, 3] as const) {
      let s = init({ level, patternId: 'x', sections: 3, seed: 3 });
      s = reduce(s, { type: 'setPedal', value: 30 });
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
    s = reduce(s, { type: 'setPedal', value: 30 });
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
      s = reduce(s, { type: 'setPedal', value: 30 });
      s = reduce(s, { type: 'setPedal', value: 50 });
      const out: Array<{ center: number; width: number }> = [];
      for (let i = 0; i < 300 && out.length < 300; i++) {
        // 引っかかりで切れたら、つないでもう一度 (T2-19c)
        if (s.phase === 'broken' && s.brk.kind === 'broken') {
          for (const th of s.brk.threads) s = reduce(s, { type: 'tapThread', thread: th });
          s = reduce(s, { type: 'setPedal', value: 30 });
          s = reduce(s, { type: 'setPedal', value: 50 });
          continue;
        }
        if (s.phase !== 'winding') break;
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

});

describe('winding logic T2-16 その6 (制限時間: 各帯の範囲の中心の張りで巻いた時間の合計)', () => {
  /** 帯 1 本の目標の時間 (ms): 範囲の真ん中で巻いた時間 + 3.5秒 + スパイク1回 1秒 (T2-21) */
  const bandTime = (range: { center: number; spikes: number }): number => {
    const speed = (range.center / 100) * TENSION.maxSpeed;
    return (SECTION_LENGTH / speed) * 1000 + 3500 + range.spikes * 1000;
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

  it('2. 制限時間 = 各帯の(帯の長さ ÷ 中心の張りの速さ)の合計 + 5秒 × 帯の数 (T2-18a)', () => {
    const s = init({ level: 2, patternId: 'x', sections: 5, seed: 3 });
    const sum = s.ranges.reduce((acc, r) => acc + bandTime(r), 0);
    expect(s.targetMs).toBeCloseTo(sum, 6);
  });

  /** 全帯を pedal で巻き切るまでの時間 (ms)。切れたら -1 */
  const windAll = (level: Level, seed: number, pedal: number): number => {
    const s0 = init({ level, patternId: 'x', sections: 3, seed });
    let s = reduce(s0, { type: 'setPedal', value: 30 });
    s = reduce(s, { type: 'setPedal', value: pedal });
    s = { ...s, spikePlan: { left: 0, atMs: 0 } }; // スパイクを起こさない (T2-20b: 巻いた時間だけを確かめる)
    let guard = 0;
    while (s.phase !== 'done' && s.phase !== 'broken' && guard < 1200) {
      s = reduce(s, { type: 'tick', dtMs: 200 });
      if (s.phase === 'cutting') {
        s = reduce(s, { type: 'cut' });
        s = reduce(s, { type: 'setPedal', value: pedal }); // 帯が変わるとペダルは 0 に戻るので、もう一度踏む
        s = { ...s, spikePlan: { left: 0, atMs: 0 } };
      }
      guard += 1;
    }
    // 切れずに巻き切ったときだけ時間を返す (切れたら -1)
    return s.phase === 'done' && s.breaks === 0 ? s.elapsedMs : -1;
  };

  it('3. 範囲の真ん中のペダルで巻くと、巻いた時間 = 制限時間 − 5秒×帯数 − (1.5+3.5)秒×帯数 − スパイク1回2秒×回数 (T2-20b)', () => {
    const s0 = init({ level: 1, patternId: 'x', sections: 3, seed: 1 });
    const pedal = s0.ranges[0]!.center; // レベル1 は真ん中 50 で固定
    let ms = -1;
    for (let seed = 1; seed <= 60 && ms < 0; seed++) ms = windAll(1, seed, pedal);
    expect(ms, '切れずに巻き切れる種').toBeGreaterThan(0);
    const spikeMsSum = s0.ranges.reduce((acc, r) => acc + r.spikes * TIME_PER_SPIKE_MS, 0);
    const expected = s0.targetMs - TIME_SCISSORS_TIE_MS * 3 - spikeMsSum;
    // tick の刻み (100ms) で帯の終わりが丸められるので、帯の数ぶんの誤差は許す
    expect(Math.abs(ms - expected), `巻いた時間 ${(ms / 1000).toFixed(1)} 秒 = 期待 ${(expected / 1000).toFixed(1)} 秒`).toBeLessThanOrEqual(100 * 3);
  });

  it('4. 範囲の真ん中より強めに巻けば制限時間より早く終わる', () => {
    const s0 = init({ level: 1, patternId: 'x', sections: 3, seed: 1 });
    const pedal = s0.ranges[0]!.center + 5;
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
describe('T2-18a: 始まり方と時間 (巻き始めるのボタンは無い。ペダルを動かすと始まる。時間は最後の帯を結び終えるまで進む)', () => {
  it('1. ready では tick しても時間が進まない (ペダルを動かす前は時間が進まない)', () => {
    const s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    expect(s.phase).toBe('ready');
    expect(s.elapsedMs).toBe(0);
    const next = reduce(s, { type: 'tick', dtMs: 1000 });
    expect(next).toBe(s); // ready では何も進まない
    expect(next.elapsedMs).toBe(0);
  });

  it('2. ペダルを 0 より大きくすると巻き始まる (ready → winding)。0 のままでは始まらない', () => {
    const s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    const zero = reduce(s, { type: 'setPedal', value: 0 });
    expect(zero.phase).toBe('ready');
    const on = reduce(s, { type: 'setPedal', value: 30 });
    expect(on.phase).toBe('winding');
    expect(on.pedal.pedal).toBe(30);
  });

  it('3. 帯の端を結んでいるあいだ (cutting) も時間が進む', () => {
    const s = { ...init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 }), phase: 'cutting' as const, elapsedMs: 1000 };
    // dtMs は MAX_TICK_MS (100) で丸められるので 2 回送る
    let next = reduce(s, { type: 'tick', dtMs: 100 });
    next = reduce(next, { type: 'tick', dtMs: 100 });
    expect(next.elapsedMs).toBe(1200);
    // ほかの値は変わらない (巻き直しではない)
    expect(next.phase).toBe('cutting');
    expect(next.lengths).toEqual(s.lengths);
  });

  it('4. 最後の帯を結び終えたら (done) 時間は止まる', () => {
    const s = { ...init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 }), phase: 'done' as const, elapsedMs: 1234 };
    const next = reduce(s, { type: 'tick', dtMs: 500 });
    expect(next).toBe(s);
    expect(next.elapsedMs).toBe(1234);
  });

  it('5. 制限時間 = 各帯の目標の合計 (帯ごと 5 秒の足し算はやめた。T2-21)', () => {
    const s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    const bands = s.ranges.reduce((acc, r) => acc + bandTargetMs(r), 0);
    expect(s.targetMs).toBe(bands);
    const s5 = init({ level: 2, patternId: 'p-chalk-char', sections: 5, seed: 2 });
    const bands5 = s5.ranges.reduce((acc, r) => acc + bandTargetMs(r), 0);
    expect(s5.targetMs).toBe(bands5);
  });
});

describe('winding logic T2-19a (1本の帯を巻く時間を 6 割に)', () => {
  it('1. 同じペダル (50) で 1本の帯を巻き終える時間は、今までの長さ (pedal 50 で 20 秒 = 400) の 0.6 倍 (±5%)', () => {
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    s = reduce(s, { type: 'setPedal', value: 50 });
    let ms = 0;
    for (let i = 0; i < 2001 && s.phase !== 'cutting'; i++) {
      // 引っかかりで切れたら、切れた糸をつなぎ、範囲の真ん中に来るペダルに戻す (T2-19c)。巻いていた時間だけ数える
      if (s.phase === 'broken' && s.brk.kind === 'broken') {
        // 切れたらつないで、同じ pedal 50 で巻き直す (引っかかりが収まるまで切れてはつなぐを繰り返す)
        for (const th of s.brk.threads) s = reduce(s, { type: 'tapThread', thread: th });
        if (s.phase === 'winding') s = reduce(s, { type: 'setPedal', value: 50 });
        continue;
      }
      s = reduce(s, { type: 'tick', dtMs: 100 });
      ms += 100;
    }
    expect(s.phase, '1本目が巻き終わる').toBe('cutting');
    // 今までの長さ: pedal 50 (速さ 20/秒) で 400 ÷ 20 = 20 秒。0.6 倍 → 12 秒
    const oldSec = 400 / (MAX_SPEED * 0.5);
    const expectSec = oldSec * 0.6;
    expect(Math.abs(ms / 1000 - expectSec) / expectSec, `実際 ${(ms / 1000).toFixed(1)} 秒・期待 ${expectSec} 秒`).toBeLessThan(0.05);
  });

  it('2. 長さが 0.6 倍になったので、巻き量の計算も新しい長さで 100% になる', () => {
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    s = reduce(s, { type: 'setPedal', value: 50 });
    s = reduce(s, { type: 'tick', dtMs: 100 });
    const pct = ((s.lengths[0] ?? 0) / SECTION_LENGTH) * 100;
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(100);
  });
});

describe('T2-20a: 揺れとスパイク (張り = ペダルの位置 + 揺れの量 + スパイクの量)', () => {
  const DT = 100;
  const LIMIT = (width: number): number => width / 2; // 揺れの限界 = 範囲の幅の半分

  it('1. 揺れていないとき、張り = ペダルの位置 (帯の始まりから 3 秒は揺れない)', () => {
    for (const seed of [1, 2, 3]) {
      let s = init({ level: 1, patternId: 'x', sections: 3, seed });
      s = reduce(s, { type: 'setPedal', value: 50 });
      for (let i = 0; i < 29; i++) s = reduce(s, { type: 'tick', dtMs: DT }); // 2.9 秒 < 3 秒
      expect(s.tension, `seed ${seed}`).toBe(50); // 揺れもスパイクも無いので ペダルどおり
      expect(s.wobble.qty).toBe(0);
      expect(s.spike.qty).toBe(0);
    }
  });

  it('2. 揺れの量は ±(範囲の幅 ÷ 2) の中。動かしているあいだも 戻る先は今のペダルの位置', () => {
    let s = init({ level: 1, patternId: 'x', sections: 3, seed: 5 });
    s = reduce(s, { type: 'setPedal', value: 50 });
    const limit = LIMIT(s.range.width);
    let prevQty = 0;
    for (let i = 0; i < 400; i++) {
      if (i === 150) s = reduce(s, { type: 'setPedal', value: 45 }); // 揺れの途中で動かす
      if (i === 300) s = reduce(s, { type: 'setPedal', value: 55 });
      s = reduce(s, { type: 'tick', dtMs: DT });
      if (s.phase !== 'winding') { prevQty = 0; continue; } // 切れた tick は飛ぶ
      if (s.spike.qty > 0) continue; // スパイクのあいだは 0.5 秒で上がるので別の決まり (テスト 6)
      const qty = s.tension - s.pedal.pedal; // 張り − ペダル = 揺れの量
      expect(Math.abs(qty), `i=${i}`).toBeLessThanOrEqual(limit + 1e-9);
      // 揺れの量は連続に変わり、ペダルを動かしても飛ばない (戻る先は今のペダルの位置)
      expect(Math.abs(qty - prevQty), `i=${i}`).toBeLessThanOrEqual(limit * (DT / 1000) + 1e-9);
      prevQty = qty;
    }
  });

  it('3. ペダルを範囲の外に置くと揺れない (張り = ペダルの位置のまま)', () => {
    // スパイクの予定が無い帯 (spikePlan.left = 0) を探す (スパイクは範囲の外でも続く別の決まり)
    let s: WindingState | null = null;
    for (let seed = 1; seed <= 40; seed++) {
      const s0 = init({ level: 1, patternId: 'x', sections: 3, seed });
      if (s0.spikePlan.left === 0) {
        s = s0;
        break;
      }
    }
    expect(s, 'スパイクの予定が無い帯の種').not.toBeNull();
    s = reduce(s!, { type: 'setPedal', value: 50 });
    // いったん揺れを起こさせる (3 秒まち + 揺れの上がり)
    for (let i = 0; i < 60; i++) s = reduce(s!, { type: 'tick', dtMs: DT });
    // 範囲の上の外 (範囲の max より大きいペダル) へ動かす
    s = reduce(s!, { type: 'setPedal', value: 90 });
    for (let i = 0; i < 100; i++) {
      s = reduce(s!, { type: 'tick', dtMs: DT });
      expect(s.tension, `i=${i}`).toBe(90); // 揺れない (張り = ペダルの位置)
    }
  });

  it('4. 帯の始まりから 3 秒は揺れもスパイクも無い (種 20 通り・レベル 3 でも)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const level of [1, 2, 3] as Level[]) {
        let s = init({ level, patternId: 'x', sections: 3, seed });
        s = reduce(s, { type: 'setPedal', value: 50 });
        for (let i = 0; i < 30; i++) {
          s = reduce(s, { type: 'tick', dtMs: DT });
          expect(s.wobble.qty, `L${level} seed ${seed} t=${((i + 1) * DT) / 1000}秒`).toBe(0);
          expect(s.spike.qty, `L${level} seed ${seed} スパイク`).toBe(0);
          expect(s.bandClockMs).toBe((i + 1) * DT);
        }
      }
    }
  });

  it('5. 範囲の真ん中に固定すると、スパイクの無い時間は範囲の中に 100% (種 20 通り)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const level of [1, 2, 3] as Level[]) {
        let s = init({ level, patternId: 'x', sections: 3, seed });
        s = reduce(s, { type: 'setPedal', value: s.range.center });
        let guard = 0;
        let freeMs = 0; // スパイクの量が 0 の時間
        let freeOkMs = 0; // そのうち範囲の中にいた時間
        while (s.phase !== 'done' && guard < 60000) {
          const wasWinding = s.phase === 'winding';
          if (s.phase === 'cutting') s = reduce(s, { type: 'cut' });
          else if (s.phase === 'broken' && s.brk.kind === 'broken') {
            for (const th of s.brk.threads) s = reduce(s, { type: 'tapThread', thread: th });
            if (s.phase === 'winding') s = reduce(s, { type: 'setPedal', value: s.range.center });
          } else if (s.phase === 'winding') {
            s = reduce(s, { type: 'setPedal', value: s.range.center });
          }
          s = reduce(s, { type: 'tick', dtMs: DT });
          guard += 1;
          if (wasWinding && (s.phase === 'winding' || s.phase === 'cutting')) {
            if (s.spike.qty === 0) {
              freeMs += DT;
              if (s.tension >= s.range.min && s.tension <= s.range.max) freeOkMs += DT;
            }
          }
        }
        expect(s.phase, `L${level} seed ${seed}`).toBe('done');
        // スパイクの無い時間はすべて範囲の中 (揺れの限界 = 範囲の幅の半分だから)
        expect(freeOkMs / freeMs, `L${level} seed ${seed}`).toBeCloseTo(1, 6);
      }
    }
  });

  it('6. スパイク: 2 秒以内にペダルを 10 下げると切れずに戻る。下げないと 2 秒で切れる', () => {
    // スパイクを起こす: 予定の時間を帯の始めすぐにして、3 秒のまちを tick で進める
    const mk = (seed: number): WindingState => {
      let s = init({ level: 1, patternId: 'x', sections: 3, seed });
      s = { ...s, spikePlan: { left: 1, atMs: 0 } }; // 帯の始まりすぐに起こす (3 秒のまちのあと)
      s = reduce(s, { type: 'setPedal', value: 50 });
      for (let i = 0; i < 31; i++) s = reduce(s, { type: 'tick', dtMs: DT }); // 3 秒 (まち) の直後で起こす
      return s;
    };
    // (a) 下げない → 2 秒で切れる
    let a = mk(11);
    expect(a.spike.qty).toBeGreaterThan(0); // スパイクが起きている
    const pedalAtStart = a.spike.pedalAtStart;
    for (let i = 0; i < 19; i++) a = reduce(a, { type: 'tick', dtMs: DT }); // 1.9 秒
    expect(a.phase).toBe('winding'); // まだ切れない
    a = reduce(a, { type: 'tick', dtMs: DT }); // 2 秒
    expect(a.phase, '下げないと 2 秒で切れる').toBe('broken');
    expect(a.breaks).toBe(1);
    // (b) 1 秒で 10 下げる → 切れずに 0.5 秒で戻る
    let b = mk(11);
    for (let i = 0; i < 10; i++) b = reduce(b, { type: 'tick', dtMs: DT }); // 1 秒
    b = reduce(b, { type: 'setPedal', value: Math.max(0, pedalAtStart - 10) });
    for (let i = 0; i < 30; i++) b = reduce(b, { type: 'tick', dtMs: DT }); // 3 秒まつ
    expect(b.phase, '10 下げたら切れずに戻る').toBe('winding');
    expect(b.spike.qty).toBe(0); // 戻りきっている
    // スパイクが無くなれば 張り = ペダルの位置 + 揺れの量 (揺れは続く)
    expect(b.tension - b.pedal.pedal).toBe(b.wobble.qty);
  });

  it('7. スパイクの回数はレベルの決まりどおり (レベル1 は 0〜1・2 は 1・3 は 1〜2)。あいだは 5 秒以上あける', () => {
    // 帯ごとの予定の回数 (spikePlan) を init 直後と cut の直後に集める
    for (const level of [1, 2, 3] as Level[]) {
      const range = SPIKE_COUNT_RANGE(level);
      for (let seed = 1; seed <= 20; seed++) {
        let s = init({ level, patternId: 'x', sections: 3, seed });
        const perBand: number[] = [s.spikePlan.left];
        const ats: number[] = [s.spikePlan.atMs];
        for (let b = 1; b < s.sections; b++) {
          s = { ...s, phase: 'cutting' };
          s = reduce(s, { type: 'cut' });
          perBand.push(s.spikePlan.left);
          ats.push(s.spikePlan.atMs);
        }
        for (const c of perBand) {
          expect(c, `L${level} seed ${seed}`).toBeGreaterThanOrEqual(range.min);
          expect(c, `L${level} seed ${seed}`).toBeLessThanOrEqual(range.max);
        }
        // 最初のスパイクは帯の始まりから 3 秒以上あと (各帯とも)
        for (const at of ats) expect(at).toBeGreaterThanOrEqual(3000);
      }
    }
    // 2 回目のスパイクは 1 回目より 5 秒以上あと (レベル3 で予定を強制して確かめる)
    for (let seed = 1; seed <= 10; seed++) {
      let s = init({ level: 3, patternId: 'x', sections: 1, seed });
      s = { ...s, spikePlan: { left: 2, atMs: 3000 } };
      s = reduce(s, { type: 'setPedal', value: 50 });
      for (let i = 0; i < 31; i++) s = reduce(s, { type: 'tick', dtMs: DT }); // 3 秒 → 1 回目
      expect(s.spike.qty).toBeGreaterThan(0);
      expect(s.spikePlan.left).toBe(1);
      expect(s.spikePlan.atMs - 3000).toBeGreaterThanOrEqual(5000); // 次は 5 秒以上あける
    }
  });

  it('8. T2-19c の流れ・巻き進むほど上がる張り・引っかかりは無い (params からも無い)', () => {
    const p = params as unknown as Record<string, unknown>;
    expect(p['DRIFT']).toBeUndefined();
    expect(p['NOISE_AMP']).toBeUndefined();
    expect(p['TENSION_RISE']).toBeUndefined();
    expect(p['SNAG_BREAK_MARGIN']).toBeUndefined();
    expect(p['SNAG_GRACE_MS']).toBeUndefined();
    // 揺れの限界は範囲の幅の半分: 範囲の真ん中に固定した長時間の巻きで、張り − ペダルは限界の中
    let s = init({ level: 2, patternId: 'x', sections: 3, seed: 9 });
    s = reduce(s, { type: 'setPedal', value: s.range.center });
    const limit = LIMIT(s.range.width);
    for (let i = 0; i < 300; i++) {
      s = reduce(s, { type: 'tick', dtMs: DT });
      if (s.spike.qty > 0 || s.phase !== 'winding') continue; // スパイクは ±15〜25 の別の決まり (テスト 6)
      expect(s.tension - s.pedal.pedal).toBeLessThanOrEqual(limit + 1e-9);
      expect(s.tension - s.pedal.pedal).toBeGreaterThanOrEqual(-limit - 1e-9);
    }
  });
});

describe('T2-21: 制限時間の新しい計算 (二重に足さない・スパイク 1 秒) と帯留め 30%', () => {
  const DT = 100;

  it('1. レベル1・帯 3 本・真ん中 50・スパイク 0 回の目標の時間は 46.5 秒 (12秒×3 + 3.5秒×3)', () => {
    let s: WindingState | null = null;
    for (let seed = 1; seed <= 80; seed++) {
      const s0 = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed });
      if (s0.ranges.every((r) => r.spikes === 0)) {
        s = s0;
        break;
      }
    }
    expect(s, 'スパイクが 0 回の帯だけの種').not.toBeNull();
    // レベル1 は全帯が真ん中 50: 帯 12 秒 + ハサミ 3.5 秒 = 15.5 秒 × 3 = 46.5 秒
    expect(targetMsOf(s!)).toBe(46500);
    for (const r of s!.ranges) {
      expect(r.center).toBe(50);
      expect(bandTargetMs(r)).toBe(12000 + 3500);
    }
  });

  it('2. スパイクがある帯は 1 回につき 1 秒足す (TIME_PER_SPIKE_MS。猶予の 2 秒とは別の数)。帯ごと 5 秒の足し算はない', () => {
    expect(TIME_PER_SPIKE_MS).toBe(1000);
    let s: WindingState | null = null;
    for (let seed = 1; seed <= 80; seed++) {
      const s0 = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed });
      if (s0.ranges[0]!.spikes === 1 && s0.ranges[1]!.spikes === 0) {
        s = s0;
        break;
      }
    }
    expect(s, '1帯目だけスパイク 1 回の種').not.toBeNull();
    const expected = (12000 + 3500 + 1000) + (12000 + 3500) + (12000 + 3500);
    expect(targetMsOf(s!)).toBe(expected);
  });

  it('3. 真ん中のペダルで巻き、スパイクのたびに 10 下げて戻す遊び方なら、ハサミの 3.5 秒を含めて制限時間に間に合う (種 20 通り)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const level of [1, 2, 3] as Level[]) {
        let s = init({ level, patternId: 'x', sections: 3, seed });
        let cuttingMs = 0;
        let guard = 0;
        while (s.phase !== 'done' && guard < 60000) {
          if (s.phase === 'ready') {
            s = reduce(s, { type: 'setPedal', value: s.range.center });
          } else if (s.phase === 'cutting') {
            // ハサミで切って結ぶ動きの時間 (3.5 秒) も経過させてから結ぶ
            s = reduce(s, { type: 'tick', dtMs: DT });
            cuttingMs += DT;
            if (cuttingMs >= 3500) {
              s = reduce(s, { type: 'cut' });
              cuttingMs = 0;
            }
          } else if (s.phase === 'broken' && s.brk.kind === 'broken') {
            for (const th of s.brk.threads) s = reduce(s, { type: 'tapThread', thread: th });
          } else if (s.phase === 'winding') {
            // スパイクが起きたら 10 下げる (戻る)。無ければ範囲の真ん中
            const pedal = s.spike.qty > 0 ? Math.max(0, s.spike.pedalAtStart - 10) : s.range.center;
            s = reduce(s, { type: 'setPedal', value: pedal });
            s = reduce(s, { type: 'tick', dtMs: DT });
          }
          guard += 1;
        }
        expect(s.phase, `L${level} seed ${seed}`).toBe('done');
        expect(s.elapsedMs, `L${level} seed ${seed}: ${(s.elapsedMs / 1000).toFixed(1)}秒 ≤ 目標 ${(s.targetMs / 1000).toFixed(1)}秒`).toBeLessThanOrEqual(s.targetMs);
      }
    }
  });
});
