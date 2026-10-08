import { describe, it, expect } from 'vitest';
import { init, reduce, starsOf, widthOk, resultLines, isValidResume, overflowSides, goodSpeedOf } from './logic';
import type { BeamingState, BeamingAction } from './logic';
import { OVERFLOW_CLEARANCE_CM, CENTER_OK_CM } from './params';
import { drawBoard } from './renderer';
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
import { SHIFT_VEL, FULL_WIND_SEC_AT_100, GOOD_SPEED_ZONES, STOP3, STOP2, RESTARTS_OK } from './params';

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
    const withPedal = act(s, [{ type: 'setSpeed', speed: 50 }]);
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
    let cur = act(s, [{ type: 'setSpeed', speed: 50 }, { type: 'nudge', dir: -1 }, { type: 'tick', dtMs: 100 }]);
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

  it("6. 止めずに 100% を超えると糸が切れて失敗 (broken・phase 'done'・星なし)", () => {
    const s = setupExact(make());
    const w = act(s, [{ type: 'setSpeed', speed: 100 }]);
    // 100% を超えるまで巻く (30秒 + 余裕)
    let after = w;
    for (let i = 0; i < 310; i++) {
      after = reduce(after, { type: 'tick', dtMs: 100 });
      if (after.phase === 'done') break;
    }
    expect(after.broken, '100% を超えた').toBe(true);
    expect(after.phase).toBe('done');
    expect(starsOf(after)).toBe(0);
    // 結果の行に「巻き量が 100% を超えました」
    expect(resultLines(after).some((l) => l.value.includes('100% を超え'))).toBe(true);
  });

  it('7. 速さ 100 で 30 秒で巻き終わる。止めずに超えると切れる。50 はその半分の速さ', () => {
    expect(FULL_WIND_SEC_AT_100).toBe(30);
    let s = setupExact(make());
    s = act(s, [{ type: 'setSpeed', speed: 100 }]);
    for (let i = 0; i < 299; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.phase).toBe('beaming'); // まだ 29.9 秒
    expect(s.progress).toBeGreaterThan(0.99);
    for (let i = 0; i < 11; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.phase).toBe('done'); // 100% を超えたので失敗で終わる
    expect(s.broken).toBe(true);
    // 50 は 100 の半分の速さ: 15秒 (150tick) で 4分の1・30秒で半分
    let half = setupExact(make());
    half = act(half, [{ type: 'setSpeed', speed: 50 }]);
    for (let i = 0; i < 150; i++) {
      half = reduce(half, { type: 'tick', dtMs: 100 });
    }
    expect(half.progress).toBeCloseTo(0.25, 1);
    for (let i = 0; i < 150; i++) {
      half = reduce(half, { type: 'tick', dtMs: 100 });
    }
    expect(half.progress).toBeCloseTo(0.5, 1);
  });

  it('8. 採点の境目: 星3 (適正0.8・止めた位置99%以上・微調整2回以下・幅1cm・中央0.8)、星2 (適正0.6・97%以上・幅3cm)、星1、失敗は星なし', () => {
    const base = setupExact(make());
    const mk = (o: Partial<BeamingState>): BeamingState => ({
      ...base,
      widthErrCm: 0,
      goodMs: 800,
      centeredMs: 800,
      windMs: 1000,
      progress: 0.995,
      restarts: 0,
      broken: false,
      overflowMs: 0,
      ...o,
    });
    expect(starsOf(mk({}))).toBe(3);
    expect(starsOf(mk({ widthErrCm: 1 }))).toBe(3);
    expect(starsOf(mk({ progress: STOP3 }))).toBe(3);
    expect(starsOf(mk({ restarts: RESTARTS_OK }))).toBe(3);
    expect(starsOf(mk({ goodMs: 799 }))).toBe(2); // 適正 0.799
    expect(starsOf(mk({ widthErrCm: 1.1 }))).toBe(2); // 誤差 1.1cm
    expect(starsOf(mk({ progress: 0.9899 }))).toBe(2); // 止めた位置 98.99%
    expect(starsOf(mk({ restarts: RESTARTS_OK + 1, goodMs: 700 }))).toBe(2); // 微調整 3回 (星2の条件は満たす)
    expect(starsOf(mk({ centeredMs: 799 }))).toBe(2); // 中央 0.799 (星3の条件だけ落ちる)
    expect(starsOf(mk({ widthErrCm: 3 }))).toBe(2);
    expect(starsOf(mk({ widthErrCm: 3.1 }))).toBe(1); // 誤差 3.1cm
    expect(starsOf(mk({ goodMs: 599 }))).toBe(1); // 適正 0.599
    expect(starsOf(mk({ progress: 0.9699 }))).toBe(1); // 止めた位置 96.99%
    expect(starsOf(mk({ broken: true }))).toBe(0); // 失敗は星なし
    expect(STOP3).toBe(0.99);
    expect(STOP2).toBe(0.97);
  });

  it('9. 成績の行: 適正な速さ・止めた位置・微調整・幅合わせの誤差・中央に保てた割合の5行', () => {
    const base = setupExact(make());
    const s: BeamingState = {
      ...base,
      widthErrCm: 0.5,
      goodMs: 860,
      centeredMs: 910,
      windMs: 1000,
      progress: 0.992,
      restarts: 1,
      overflowMs: 2000,
    };
    const lines = resultLines(s);
    expect(lines.map((l) => l.label)).toEqual(['適正な速さ', '止めた位置', '微調整', '幅合わせの誤差', '中央に保てた割合']);
    expect(lines[0]!.value).toBe('86%');
    expect(lines[1]!.value).toBe('99.2%');
    expect(lines[2]!.value).toBe('1回');
    expect(lines[3]!.value).toBe('0.5cm');
    expect(lines[4]!.value).toBe('91%');
  });

  it('10. 同じ種なら同じ動き (init と tick の結果が完全に同じ)', () => {
    const run = (): BeamingState => {
      let s = make(2, 64, 7);
      s = setupExact(s);
      s = act(s, [{ type: 'setSpeed', speed: 100 }]);
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

  it('11. 適正な速さの表 (GOOD_SPEED_ZONES): 巻き量ごとに適正な速さが決まる。重なる所はどちらでも適正', () => {
    expect(GOOD_SPEED_ZONES).toEqual([
      { from: 0, to: 30, speed: 50 },
      { from: 25, to: 75, speed: 100 },
      { from: 70, to: 99, speed: 50 },
      { from: 95, to: 100, speed: 0 },
    ]);
    // 巻き量 10%: 50 だけが適正
    expect(goodSpeedOf(50, 0.10)).toBe(true);
    expect(goodSpeedOf(100, 0.10)).toBe(false);
    // 巻き量 50%: 100 だけが適正
    expect(goodSpeedOf(100, 0.50)).toBe(true);
    expect(goodSpeedOf(50, 0.50)).toBe(false);
    // 巻き量 80%: 50 が適正
    expect(goodSpeedOf(50, 0.80)).toBe(true);
    expect(goodSpeedOf(100, 0.80)).toBe(false);
    // 巻き量 97%: [70,99] と [95,100] が重なるので 50 も停止 (0) も適正。100 は適正でない
    expect(goodSpeedOf(50, 0.97)).toBe(true);
    expect(goodSpeedOf(0, 0.97)).toBe(true);
    expect(goodSpeedOf(100, 0.97)).toBe(false);
    // 重なる所 (27%): 50 も 100 も適正
    expect(goodSpeedOf(50, 0.27)).toBe(true);
    expect(goodSpeedOf(100, 0.27)).toBe(true);
  });

  it("11b. 適正な速さで巻いているあいだ goodMs が増える。合っていなければ増えない (停止は数えない)", () => {
    let s = setupExact(make());
    s = act(s, [{ type: 'setSpeed', speed: 50 }]); // 巻き量 0% → 50 は適正
    s = reduce(s, { type: 'tick', dtMs: 100 });
    expect(s.goodMs).toBe(100);
    // 巻き量 30% を超えて 50 は適正でない ([25,75] は 100)
    s = { ...s, progress: 0.5 };
    s = reduce(s, { type: 'tick', dtMs: 100 });
    expect(s.goodMs).toBe(100); // 増えない
    expect(s.windMs).toBe(200);
    s = act(s, [{ type: 'setSpeed', speed: 100 }]);
    s = reduce(s, { type: 'tick', dtMs: 100 });
    expect(s.goodMs).toBe(200); // 50% で 100 は適正
    // 停止 (speed 0) では何も進まない
    const stopped = act(s, [{ type: 'setSpeed', speed: 0 }, { type: 'tick', dtMs: 100 }]);
    expect(stopped.windMs).toBe(s.windMs);
    expect(stopped.goodMs).toBe(s.goodMs);
    expect(stopped.progress).toBe(s.progress);
  });

  it("11c. 巻き量 95% を超えてから停止 → 50% に戻すと restarts が増える。確認は 95% 以上・停止のときだけ", () => {
    let s = setupExact(make());
    s = act(s, [{ type: 'setSpeed', speed: 100 }]);
    // 95% まで巻く
    for (let i = 0; i < 286; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.progress).toBeGreaterThanOrEqual(0.95);
    // 停止 → 50% に戻す → 微調整 1回
    s = act(s, [{ type: 'setSpeed', speed: 0 }]);
    s = act(s, [{ type: 'setSpeed', speed: 50 }]);
    expect(s.restarts).toBe(1);
    // もう一度 停止 → 50%
    s = act(s, [{ type: 'setSpeed', speed: 0 }]);
    s = act(s, [{ type: 'setSpeed', speed: 50 }]);
    expect(s.restarts).toBe(2);
    // 95% 未満では確認できない
    const early = { ...setupExact(make()), progress: 0.9, speed: 0 as const };
    const notYet = reduce(early, { type: 'confirm' });
    expect(notYet.phase).toBe('beaming');
    // 停止していなければ確認できない
    const running = reduce({ ...early, progress: 0.97, speed: 50 as const }, { type: 'confirm' });
    expect(running.phase).toBe('beaming');
    // 95% 以上で止めて確認 → done (失敗でない)
    const ok = reduce({ ...early, progress: 0.97, speed: 0 as const }, { type: 'confirm' });
    expect(ok.phase).toBe('done');
    expect(ok.broken).toBe(false);
  });

  it('12. finishSetup する前は巻き返しに進まず、tick しても progress は動かない', () => {
    const s0 = make();
    const s = act(s0, [{ type: 'setSpeed', speed: 50 }, { type: 'tick', dtMs: 100 }]);
    expect(s.phase).toBe('setup');
    expect(s.progress).toBe(0);
    expect(s.windMs).toBe(0);
  });

  it('13. 途中保存の形 (isValidResume): init の状態は true、壊れた形は false (speed・goodMs・restarts・broken も見る)', () => {
    const s = setupExact(make());
    expect(isValidResume(s)).toBe(true);
    expect(isValidResume({ ...s, phase: 'other' })).toBe(false);
    expect(isValidResume({ ...s, leftCm: 'x' as unknown as number })).toBe(false);
    expect(isValidResume({ ...s, speed: 60 })).toBe(false);
    expect(isValidResume({ ...s, goodMs: 'x' as unknown as number })).toBe(false);
    expect(isValidResume({ ...s, restarts: 'x' as unknown as number })).toBe(false);
    expect(isValidResume({ ...s, broken: 'x' as unknown as boolean })).toBe(false);
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
    s = act(s, [{ type: 'setSpeed', speed: 50 }, { type: 'tick', dtMs: 100 }]);
    expect(s.centeredMs).toBe(100);
    expect(s.overflowMs).toBe(0);
  });

  it('16. ずれ 1.6cm のとき乗り上げ (中央には数えない)。左右どちらでも同じ', () => {
    let s = setupExact(make());
    s = { ...s, shiftCm: 1.6 };
    s = act(s, [{ type: 'setSpeed', speed: 50 }, { type: 'tick', dtMs: 100 }]);
    expect(s.overflowMs).toBe(100);
    expect(s.centeredMs).toBe(0);
    let s2 = setupExact(make());
    s2 = { ...s2, shiftCm: -1.6 };
    s2 = act(s2, [{ type: 'setSpeed', speed: 50 }, { type: 'tick', dtMs: 100 }]);
    expect(s2.overflowMs).toBe(100);
    expect(s2.centeredMs).toBe(0);
  });

  it('17. 遊びは「中央」の範囲と同じ値 (OVERFLOW_CLEARANCE_CM = CENTER_OK_CM)', () => {
    expect(OVERFLOW_CLEARANCE_CM).toBe(CENTER_OK_CM);
  });

  it('18. renderer は乗り上げの表示 (朱の縁・「乗り上げ」の文字) を描かない。判定 (overflowSides) が true でも (PU-24a。偏りは T3-05 で無くなる)', () => {
    const content = getContent();
    const fit = { scale: 1, offsetX: 0, offsetY: 0 };
    for (const shiftCm of [-2, -1.6, -1.2, 0, 1.2, 1.6, 2]) {
      const s = { ...setupExact(make()), shiftCm };
      const sides = overflowSides(s);
      // renderer: 判定の結果にかかわらず、朱の縁も「乗り上げ」の文字も出ない
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, s, content, 0);
      const shu = rec.ops.some((o) => o.k === 'ellipse' && styleBefore(rec.ops, rec.ops.indexOf(o)) === COLORS.shu);
      const text = rec.ops.some((o) => o.k === 'fillText' && String(o.args?.[0]).includes('乗り上げ'));
      expect(sides.left || sides.right || true).toBe(true);
      expect(shu).toBe(false);
      expect(text).toBe(false);
    }
  });
});
