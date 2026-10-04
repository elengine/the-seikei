import { describe, it, expect } from 'vitest';
import { init, reduce, starsOf, widthOk, resultLines, isValidResume, overflowSides } from './logic';
import type { BeamingState, BeamingAction } from './logic';
import { OVERFLOW_CLEARANCE_CM, CENTER_OK_CM } from './params';
import { drawBoard } from './renderer';
import { messageFor } from './messages';
import { getContent } from '../../core/content/content';
import { COLORS } from '../../core/ui/tokens';
import { makeFakeCtx } from '../winding/renderer.test.helpers';

/** 直前の style をたどって fillRect の色を調べる (偽の Canvas は style を k:'style' で記録する) */
function styleBefore(ops: Array<{ k: string; v?: unknown }>, i: number): string | null {
  for (let j = i - 1; j >= 0; j--) {
    const o = ops[j]!;
    if (o.k === 'style') return String(o.v);
  }
  return null;
}
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
    // ずれ 1cm (nudge 1回) は「中央」のなか (乗り上げでない。T3-03a 追加修正)
    let cur = act(s, [{ type: 'setPedal', value: 50 }, { type: 'nudge', dir: -1 }, { type: 'tick', dtMs: 100 }]);
    expect(cur.centeredMs).toBe(100);
    expect(cur.overflowMs).toBe(0);
    // さらに外へ (ずれ 4cm) は乗り上げ。中央には数えられない
    cur = act(cur, [
      { type: 'nudge', dir: -1 },
      { type: 'nudge', dir: -1 },
      { type: 'nudge', dir: -1 },
      { type: 'tick', dtMs: 100 },
    ]);
    expect(cur.overflowMs).toBe(100);
    expect(cur.centeredMs).toBe(100); // 増えない
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

describe('T3-03a 追加修正 (乗り上げの判定を1か所に・遊びは中央の範囲と同じ)', () => {
  it('15. 幅を巻き幅ぴったりに合わせて、ずれ 1.2cm のとき乗り上げでなく中央に数えられる', () => {
    // ずれ 1.2cm は「中央」(±1.5cm) のなか。遊びも 1.5cm なので乗り上げにならない
    let s = setupExact(make());
    s = { ...s, shiftCm: 1.2 };
    s = act(s, [{ type: 'setPedal', value: 50 }, { type: 'tick', dtMs: 100 }]);
    expect(s.centeredMs).toBe(100);
    expect(s.overflowMs).toBe(0);
  });

  it('16. ずれ 1.6cm のとき乗り上げ (中央には数えない)。左右どちらでも同じ', () => {
    let s = setupExact(make());
    s = { ...s, shiftCm: 1.6 };
    s = act(s, [{ type: 'setPedal', value: 50 }, { type: 'tick', dtMs: 100 }]);
    expect(s.overflowMs).toBe(100);
    expect(s.centeredMs).toBe(0);
    let s2 = setupExact(make());
    s2 = { ...s2, shiftCm: -1.6 };
    s2 = act(s2, [{ type: 'setPedal', value: 50 }, { type: 'tick', dtMs: 100 }]);
    expect(s2.overflowMs).toBe(100);
    expect(s2.centeredMs).toBe(0);
  });

  it('17. 遊びは「中央」の範囲と同じ値 (OVERFLOW_CLEARANCE_CM = CENTER_OK_CM)', () => {
    expect(OVERFLOW_CLEARANCE_CM).toBe(CENTER_OK_CM);
  });

  it('18. renderer と messages が overflowSides と同じ結果になる (朱の縁・文が判定と一致)', () => {
    const content = getContent();
    const fit = { scale: 1, offsetX: 0, offsetY: 0 };
    for (const shiftCm of [-2, -1.6, -1.2, 0, 1.2, 1.6, 2]) {
      const s = { ...setupExact(make()), shiftCm };
      const sides = overflowSides(s);
      // renderer: 乗り上げの円盤の朱の縁と「乗り上げ」の文字は、判定が true のときだけ出る
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, s, content, 0);
      const shu = rec.ops.some((o) => o.k === 'ellipse' && styleBefore(rec.ops, rec.ops.indexOf(o)) === COLORS.shu);
      const text = rec.ops.some((o) => o.k === 'fillText' && String(o.args?.[0]).includes('乗り上げ'));
      expect(shu).toBe(sides.left || sides.right);
      expect(text).toBe(sides.left || sides.right);
      // messages: 乗り上げの文は、判定が true のときだけ出る
      const msg = messageFor(s, (x) => x);
      expect(msg.includes('乗り上げ')).toBe(sides.left || sides.right);
    }
  });
});
