import { describe, it, expect } from 'vitest';
import { init, reduce, starsOf, widthOk, resultLines, isValidResume } from './logic';
import type { BeamingState, BeamingAction } from './logic';
import type { Level } from './params';
import { RANGE_WIDTH, BEAM_LENGTH, SHIFT_VEL } from './params';

/** テスト用の状態を作る (seed 固定)。level と巻き幅を指定できる */
function make(level: Level = 1, widthCm = 60, seed = 42): BeamingState {
  return init({ level, widthCm, seed, puzzleId: 's1', patternId: 'p-muji-kon' });
}

/** 操作を順に送る */
function act(s: BeamingState, actions: BeamingAction[]): BeamingState {
  let cur = s;
  for (const a of actions) {
    cur = reduce(cur, a);
  }
  return cur;
}

/** 幅合わせをぴったり合わせて巻き返しへ (誤差 0) */
function setupExact(s: BeamingState): BeamingState {
  const w = s.widthCm;
  return act(s, [
    { type: 'moveFlange', side: 'left', deltaCm: -w / 2 - s.leftCm },
    { type: 'moveFlange', side: 'right', deltaCm: w / 2 - s.rightCm },
    { type: 'finishSetup' },
  ]);
}

describe('beaming logic T3-01 (ルール)', () => {
  it('1. 円盤を動かすと幅 (rightCm − leftCm) が変わる。leftCm は負の側に動く', () => {
    const s0 = make();
    const w0 = s0.rightCm - s0.leftCm;
    const s1 = act(s0, [
      { type: 'moveFlange', side: 'left', deltaCm: -2 },
      { type: 'moveFlange', side: 'right', deltaCm: 3 },
    ]);
    expect(s1.leftCm).toBeCloseTo(s0.leftCm - 2, 10);
    expect(s1.rightCm).toBeCloseTo(s0.rightCm + 3, 10);
    expect(s1.rightCm - s1.leftCm).toBeCloseTo(w0 + 5, 10);
  });

  it('2. 目標どおりに合わせて finishSetup すると誤差 0。widthOk が true になる', () => {
    const s = setupExact(make());
    expect(s.phase).toBe('beaming');
    expect(s.widthErrCm).toBe(0);
    expect(widthOk(s)).toBe(true);
  });

  it('3. 幅が合っていても中心がずれていると、誤差は大きいほう (中心のずれ) になる', () => {
    const s0 = make();
    const w = s0.widthCm;
    // まず目標どおりの位置へ動かしてから、両方を +3cm ずらす (幅は目標のまま、中心だけずれる)
    const s = act(s0, [
      { type: 'moveFlange', side: 'left', deltaCm: -w / 2 + 3 - s0.leftCm },
      { type: 'moveFlange', side: 'right', deltaCm: w / 2 + 3 - s0.rightCm },
      { type: 'finishSetup' },
    ]);
    expect(s.rightCm - s.leftCm).toBeCloseTo(w, 10);
    expect(s.widthErrCm).toBeCloseTo(3, 10);
    expect(widthOk(s)).toBe(false);
  });

  it('4. 偏り (shiftCm) は巻いているあいだ shiftVel で動き、nudge で NUDGE_CM 動く', () => {
    const s = setupExact(make());
    const withPedal = act(s, [{ type: 'setPedal', value: 50 }]);
    const v = Math.abs(withPedal.shiftVel);
    const after = act(withPedal, [
      { type: 'tick', dtMs: 100 },
      { type: 'tick', dtMs: 100 },
      { type: 'tick', dtMs: 100 },
      { type: 'tick', dtMs: 100 },
      { type: 'tick', dtMs: 100 },
      { type: 'tick', dtMs: 100 },
      { type: 'tick', dtMs: 100 },
      { type: 'tick', dtMs: 100 },
      { type: 'tick', dtMs: 100 },
      { type: 'tick', dtMs: 100 },
    ]);
    // 1秒ぶん動く (向きが変わることがあるので、動いた量は v 以内)
    expect(Math.abs(after.shiftCm - withPedal.shiftCm)).toBeLessThanOrEqual(v + 0.0001);
    expect(Math.abs(after.shiftCm - withPedal.shiftCm)).toBeGreaterThan(0);
    // nudge は shiftCm を dir の向きにちょうど NUDGE_CM 動かす (中央へ戻すのは UI が向きを選ぶ)
    const right = act(after, [{ type: 'nudge', dir: 1 }]);
    expect(right.shiftCm).toBeCloseTo(after.shiftCm + 1, 10);
    const left = act(after, [{ type: 'nudge', dir: -1 }]);
    expect(left.shiftCm).toBeCloseTo(after.shiftCm - 1, 10);
  });

  it('5. シートの端が円盤を越えると overflowMs が増える。centeredMs は増えない', () => {
    const s = setupExact(make());
    // 中央から大きく外れるまで nudげる (左へ)
    let cur = act(s, [{ type: 'setPedal', value: 50 }]);
    for (let i = 0; i < 20; i++) {
      cur = act(cur, [{ type: 'nudge', dir: -1 }, { type: 'tick', dtMs: 100 }]);
    }
    expect(cur.overflowMs).toBeGreaterThan(0);
    expect(cur.centeredMs).toBe(0);
    // 糸切れは起きない (phase は beaming のまま)
    expect(cur.phase).toBe('beaming');
  });

  it('6. 張りが範囲の外でも止まらない (糸切れが無い)。progress は進む', () => {
    const s = setupExact(make());
    // ペダル 100 は範囲の上より大きい張りになる
    const w = act(s, [{ type: 'setPedal', value: 100 }]);
    const after = act(w, [{ type: 'tick', dtMs: 100 }]);
    expect(after.phase).toBe('beaming');
    expect(after.progress).toBeGreaterThan(w.progress);
    // 張りが範囲の外でも okMs は増えない
    expect(after.okMs).toBe(w.okMs);
  });

  it('7. ペダル 50 で約 40 秒 (400tick) で done になる (BEAM_LENGTH)', () => {
    let s = setupExact(make());
    s = act(s, [{ type: 'setPedal', value: 50 }]);
    for (let i = 0; i < 395; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.phase).toBe('beaming'); // まだ 39.5 秒
    for (let i = 0; i < 10; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.phase).toBe('done'); // 40 秒前後 (丸めの誤差を含めて 405tick 以内)
    expect(s.progress).toBe(1);
    // 速さはペダルに比例する (BEAM_LENGTH = MAX_SPEED × 0.5 × 40)
    expect(BEAM_LENGTH).toBe(800);
  });

  it('8. 採点の境目: 星3 (誤差1cm・張り0.8・偏り0.8以上)、星2 (誤差3cm・0.6以上)、星1', () => {
    const base = setupExact(make());
    const mk = (widthErrCm: number | null, okMs: number, centeredMs: number, windMs = 1000): BeamingState => ({
      ...base,
      widthErrCm,
      okMs,
      centeredMs,
      windMs,
      overflowMs: 0,
    });
    expect(starsOf(mk(1, 800, 800))).toBe(3);
    expect(starsOf(mk(0, 800, 800))).toBe(3);
    expect(starsOf(mk(1, 799, 800))).toBe(2); // 張り 0.799
    expect(starsOf(mk(1.1, 800, 800))).toBe(2); // 誤差 1.1cm
    expect(starsOf(mk(1, 800, 799))).toBe(2); // 偏り 0.799
    expect(starsOf(mk(3, 600, 600))).toBe(2);
    expect(starsOf(mk(3, 600, 600))).toBe(2);
    expect(starsOf(mk(3.1, 800, 800))).toBe(1); // 誤差 3.1cm
    expect(starsOf(mk(0, 599, 800))).toBe(1); // 張り 0.599
    expect(starsOf(mk(0, 800, 599))).toBe(1); // 偏り 0.599
    expect(starsOf(mk(5, 100, 100))).toBe(1);
  });

  it('9. 成績の行: 幅合わせの誤差・適正な張り・中央に保てた割合・乗り上げの4行', () => {
    const base = setupExact(make());
    const s: BeamingState = { ...base, widthErrCm: 0.5, okMs: 860, centeredMs: 910, windMs: 1000, overflowMs: 2000 };
    const lines = resultLines(s);
    expect(lines.map((l) => l.label)).toEqual(['幅合わせの誤差', '適正な張り', '中央に保てた割合', '乗り上げ']);
    expect(lines[0]!.value).toBe('0.5cm');
    expect(lines[1]!.value).toBe('86%');
    expect(lines[2]!.value).toBe('91%');
    expect(lines[3]!.value).toBe('2.0秒');
  });

  it('10. 同じ種なら同じ動き (init と tick の結果が完全に同じ)', () => {
    const run = (): BeamingState => {
      let s = make(2, 64, 7);
      s = setupExact(s);
      s = act(s, [{ type: 'setPedal', value: 60 }]);
      for (let i = 0; i < 50; i++) {
        s = reduce(s, { type: 'tick', dtMs: 100 });
      }
      return s;
    };
    const a = run();
    const b = run();
    expect(b).toEqual(a);
    // 初期の円盤の位置も同じ (乱数で決まる)
    const i1 = make(2, 64, 7);
    const i2 = make(2, 64, 7);
    expect(i2.leftCm).toBe(i1.leftCm);
    expect(i2.rightCm).toBe(i1.rightCm);
    // 違う種なら位置が違うことがある
    const i3 = make(2, 64, 8);
    expect(i3.leftCm !== i1.leftCm || i3.rightCm !== i1.rightCm).toBe(true);
  });

  it('11. どのレベルでもペダル 10〜100 のどこかで範囲の中心に届く', () => {
    for (const level of [1, 2, 3] as const) {
      const s0 = setupExact(make(level, 60, 123));
      let hit = false;
      for (let p = 10; p <= 100; p++) {
        const s = act(s0, [{ type: 'setPedal', value: p }, { type: 'tick', dtMs: 0 }]);
        const half = RANGE_WIDTH(level) / 2;
        if (Math.abs(s.tension - s.range.center) <= half) {
          hit = true;
          break;
        }
      }
      expect(hit, `level ${level}`).toBe(true);
    }
  });

  it('12. finishSetup する前は巻き返しに進まず、tick しても progress は動かない', () => {
    const s0 = make();
    const s = act(s0, [{ type: 'setPedal', value: 50 }, { type: 'tick', dtMs: 100 }]);
    expect(s.phase).toBe('setup');
    expect(s.progress).toBe(0);
    expect(s.windMs).toBe(0);
  });

  it('13. 途中保存の形 (isValidResume): init の状態は true、壊れた形は false', () => {
    const s = setupExact(make());
    expect(isValidResume(s)).toBe(true);
    expect(isValidResume({ ...s, phase: 'other' })).toBe(false);
    expect(isValidResume({ ...s, leftCm: 'x' as unknown as number })).toBe(false);
    expect(isValidResume(null)).toBe(false);
  });

  it('14. 偏りの速さと向きはレベルで決まる (SHIFT_VEL)。向きは時間で変わることがある', () => {
    expect(SHIFT_VEL(1)).toBe(0.3);
    expect(SHIFT_VEL(2)).toBe(0.5);
    expect(SHIFT_VEL(3)).toBe(0.8);
    const s = setupExact(make(3, 126, 5));
    expect(Math.abs(s.shiftVel)).toBe(0.8);
  });
});
