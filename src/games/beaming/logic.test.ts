import { describe, it, expect } from 'vitest';
import { init, reduce, starsOf, widthOk, resultLines, isValidResume, goodSpeedOf } from './logic';
import type { BeamingState, BeamingAction } from './logic';
import type { Level } from './params';
import { FULL_WIND_SEC_AT_100, GOOD_SPEED_ZONES, STOP3, STOP2, RESTARTS_OK, SPEED_OK_TOL } from './params';

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

  it("6. 止めずに 101% に届くと糸が切れて失敗 (broken・phase 'done'・星なし)。100.99 までは切れない (T3-05)", () => {
    const s = setupExact(make());
    const w = act(s, [{ type: 'setSpeed', value: 100 }]);
    // 100% を超えるまで巻く (30秒 + 余裕)
    let after = w;
    for (let i = 0; i < 310; i++) {
      after = reduce(after, { type: 'tick', dtMs: 100 });
      if (after.phase === 'done') break;
    }
    expect(after.broken, '100% を超えた').toBe(true);
    expect(after.phase).toBe('done');
    expect(starsOf(after)).toBe(0);
    // 結果の行に「巻き量が 101% に届きました」
    expect(resultLines(after).some((l) => l.value.includes('101% に届'))).toBe(true);
  });

  it('7. 速さ 100 で 30 秒で巻き終わる。止めずに 101% に届くと切れる。50 はその半分の速さ (T3-05)', () => {
    expect(FULL_WIND_SEC_AT_100).toBe(30);
    let s = setupExact(make());
    s = act(s, [{ type: 'setSpeed', value: 100 }]);
    for (let i = 0; i < 299; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.phase).toBe('beaming'); // まだ 29.9 秒 (巻き量 99.7%)
    expect(s.progress).toBeGreaterThan(0.99);
    for (let i = 0; i < 3; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.phase).toBe('beaming'); // 30.2 秒 = 巻き量 100.7%。まだ切れない (100.99 まで)
    for (let i = 0; i < 2; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.phase).toBe('done'); // 30.4 秒で 101% に届いたので失敗で終わる (小数の誤差で 30.3 秒は 100.999…%)
    expect(s.broken).toBe(true);
    // 50 は 100 の半分の速さ: 15秒 (150tick) で 4分の1・30秒で半分
    let half = setupExact(make());
    half = act(half, [{ type: 'setSpeed', value: 50 }]);
    for (let i = 0; i < 150; i++) {
      half = reduce(half, { type: 'tick', dtMs: 100 });
    }
    expect(half.progress).toBeCloseTo(0.25, 1);
    for (let i = 0; i < 150; i++) {
      half = reduce(half, { type: 'tick', dtMs: 100 });
    }
    expect(half.progress).toBeCloseTo(0.5, 1);
  });

  it('8. 採点の境目: 星3 (適正0.8・止めた位置99以上・微調整2回以下・幅1cm)、星2 (適正0.6・97以上・幅3cm)、星1、失敗は星なし。中央は採点に入れない (T3-05)', () => {
    const base = setupExact(make());
    const mk = (o: Partial<BeamingState>): BeamingState => ({
      ...base,
      widthErrCm: 0,
      goodMs: 800,
      windMs: 1000,
      progress: 0.995,
      restarts: 0,
      broken: false,
      ...o,
    });
    expect(starsOf(mk({}))).toBe(3);
    expect(starsOf(mk({ widthErrCm: 1 }))).toBe(3);
    expect(starsOf(mk({ progress: STOP3 }))).toBe(3);
    expect(starsOf(mk({ restarts: RESTARTS_OK }))).toBe(3);
    expect(starsOf(mk({ goodMs: 799 }))).toBe(2); // 適正 0.799
    expect(starsOf(mk({ widthErrCm: 1.1 }))).toBe(2); // 誤差 1.1cm
    expect(starsOf(mk({ progress: 0.9899 }))).toBe(2); // 止めた位置 98% (表示の値。99 未満)
    expect(starsOf(mk({ restarts: RESTARTS_OK + 1, goodMs: 700 }))).toBe(2); // 微調整 3回 (星2の条件は満たす)
    expect(starsOf(mk({ widthErrCm: 3 }))).toBe(2);
    expect(starsOf(mk({ widthErrCm: 3.1 }))).toBe(1); // 誤差 3.1cm
    expect(starsOf(mk({ goodMs: 599 }))).toBe(1); // 適正 0.599
    expect(starsOf(mk({ progress: 0.9699 }))).toBe(1); // 止めた位置 96% (表示の値)
    expect(starsOf(mk({ broken: true }))).toBe(0); // 失敗は星なし
    expect(STOP3).toBe(0.99);
    expect(STOP2).toBe(0.97);
  });

  it('9. 成績の行: 適正な速さ・止めた位置・微調整・幅合わせの誤差の4行。「中央に保てた割合」は T3-05 で無くなった。止めた位置は表示と同じ (切り捨て)', () => {
    const base = setupExact(make());
    const s: BeamingState = {
      ...base,
      widthErrCm: 0.5,
      goodMs: 860,
      windMs: 1000,
      progress: 0.992,
      restarts: 1,
    };
    const lines = resultLines(s);
    expect(lines.map((l) => l.label)).toEqual(['適正な速さ', '止めた位置', '微調整', '幅合わせの誤差']);
    expect(lines[0]!.value).toBe('86%');
    expect(lines[1]!.value).toBe('99%'); // 99.2% → 表示は切り捨ての 99
    expect(lines[2]!.value).toBe('1回');
    expect(lines[3]!.value).toBe('0.5cm');
  });

  it('10. 同じ種なら同じ動き (init と tick の結果が完全に同じ)', () => {
    const run = (): BeamingState => {
      let s = make(2, 64, 7);
      s = setupExact(s);
      s = act(s, [{ type: 'setSpeed', value: 100 }]);
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

  it('11. 適正な速さ: 目標 ±10 (SPEED_OK_TOL)。停止 (0) が目標の区間では「止めている」だけが適正。重なる所はどちらでも適正 (T3-05)', () => {
    expect(GOOD_SPEED_ZONES).toEqual([
      { from: 0, to: 30, speed: 50 },
      { from: 25, to: 75, speed: 100 },
      { from: 70, to: 99, speed: 50 },
      { from: 95, to: 100, speed: 0 },
    ]);
    expect(SPEED_OK_TOL).toBe(10);
    // 巻き量 10% (目標 50): 40〜60 が適正
    expect(goodSpeedOf(50, 0.10)).toBe(true);
    expect(goodSpeedOf(45, 0.10)).toBe(true);
    expect(goodSpeedOf(35, 0.10)).toBe(false);
    expect(goodSpeedOf(61, 0.10)).toBe(false);
    expect(goodSpeedOf(100, 0.10)).toBe(false);
    // 巻き量 50% (目標 100): 90〜100 が適正
    expect(goodSpeedOf(100, 0.50)).toBe(true);
    expect(goodSpeedOf(92, 0.50)).toBe(true);
    expect(goodSpeedOf(89, 0.50)).toBe(false);
    expect(goodSpeedOf(50, 0.50)).toBe(false);
    // 巻き量 80% (目標 50): 40〜60
    expect(goodSpeedOf(50, 0.80)).toBe(true);
    expect(goodSpeedOf(60, 0.80)).toBe(true);
    expect(goodSpeedOf(100, 0.80)).toBe(false);
    // 巻き量 97%: [70,99] の 50 (40〜60) と [95,100] の停止が重なる。50 も停止も適正
    expect(goodSpeedOf(50, 0.97)).toBe(true);
    expect(goodSpeedOf(0, 0.97)).toBe(true);
    expect(goodSpeedOf(5, 0.97)).toBe(false); // 停止の目標は「止めている」だけ。5 は適正でない
    expect(goodSpeedOf(100, 0.97)).toBe(false);
    // 重なる所 (27%): 50 も 100 も適正 (それぞれの ±10)
    expect(goodSpeedOf(50, 0.27)).toBe(true);
    expect(goodSpeedOf(100, 0.27)).toBe(true);
  });

  it("11b. 適正な速さで巻いているあいだ goodMs が増える。合っていなければ増えない (停止は数えない)", () => {
    let s = setupExact(make());
    s = act(s, [{ type: 'setSpeed', value: 50 }]); // 巻き量 0% → 50 は適正
    s = reduce(s, { type: 'tick', dtMs: 100 });
    expect(s.goodMs).toBe(100);
    // 巻き量 30% を超えて 50 は適正でない ([25,75] は 100)
    s = { ...s, progress: 0.5 };
    s = reduce(s, { type: 'tick', dtMs: 100 });
    expect(s.goodMs).toBe(100); // 増えない
    expect(s.windMs).toBe(200);
    s = act(s, [{ type: 'setSpeed', value: 100 }]);
    s = reduce(s, { type: 'tick', dtMs: 100 });
    expect(s.goodMs).toBe(200); // 50% で 100 は適正
    // 停止 (speed 0) では何も進まない
    const stopped = act(s, [{ type: 'setSpeed', value: 0 }, { type: 'tick', dtMs: 100 }]);
    expect(stopped.windMs).toBe(s.windMs);
    expect(stopped.goodMs).toBe(s.goodMs);
    expect(stopped.progress).toBe(s.progress);
  });

  it("11c. 巻き量 95% を超えてから停止 → 速さを 0 より大きく戻すと restarts が増える。確認は 95% 以上・停止のときだけ (T3-05)", () => {
    let s = setupExact(make());
    s = act(s, [{ type: 'setSpeed', value: 100 }]);
    // 95% まで巻く
    for (let i = 0; i < 286; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.progress).toBeGreaterThanOrEqual(0.95);
    // 停止 → 50% に戻す → 微調整 1回
    s = act(s, [{ type: 'setSpeed', value: 0 }]);
    s = act(s, [{ type: 'setSpeed', value: 50 }]);
    expect(s.restarts).toBe(1);
    // もう一度 停止 → 50%
    s = act(s, [{ type: 'setSpeed', value: 0 }]);
    s = act(s, [{ type: 'setSpeed', value: 50 }]);
    expect(s.restarts).toBe(2);
    // 95% 未満では確認できない
    const early = { ...setupExact(make()), progress: 0.9, speed: 0 };
    const notYet = reduce(early, { type: 'confirm' });
    expect(notYet.phase).toBe('beaming');
    // 停止していなければ確認できない
    const running = reduce({ ...early, progress: 0.97, speed: 50 }, { type: 'confirm' });
    expect(running.phase).toBe('beaming');
    // 95% 以上で止めて確認 → done (失敗でない)
    const ok = reduce({ ...early, progress: 0.97, speed: 0 as const }, { type: 'confirm' });
    expect(ok.phase).toBe('done');
    expect(ok.broken).toBe(false);
  });

  it('12. finishSetup する前は巻き返しに進まず、tick しても progress は動かない', () => {
    const s0 = make();
    const s = act(s0, [{ type: 'setSpeed', value: 50 }, { type: 'tick', dtMs: 100 }]);
    expect(s.phase).toBe('setup');
    expect(s.progress).toBe(0);
    expect(s.windMs).toBe(0);
  });

  it('13. 途中保存の形 (isValidResume): init の状態は true、壊れた形は false。速さは 0〜100 の数。古い形 (shiftVel がある) は読まない (T3-05)', () => {
    const s = setupExact(make());
    expect(isValidResume(s)).toBe(true);
    expect(isValidResume({ ...s, phase: 'other' })).toBe(false);
    expect(isValidResume({ ...s, leftCm: 'x' as unknown as number })).toBe(false);
    expect(isValidResume({ ...s, speed: 60 })).toBe(true); // 0〜100 なら何でもよい
    expect(isValidResume({ ...s, speed: 101 })).toBe(false);
    expect(isValidResume({ ...s, speed: -1 })).toBe(false);
    expect(isValidResume({ ...s, goodMs: 'x' as unknown as number })).toBe(false);
    expect(isValidResume({ ...s, restarts: 'x' as unknown as number })).toBe(false);
    expect(isValidResume({ ...s, broken: 'x' as unknown as boolean })).toBe(false);
    expect(isValidResume({ ...s, shiftVel: 0.3 } as unknown as BeamingState)).toBe(false); // 古い形
    expect(isValidResume(null)).toBe(false);
  });
});

describe('T3-05 (揺れをやめる・速さを連続に・止める判定を表示と同じに)', () => {
  it('19. setSpeed は 0〜100 に丸める。速さに比例して巻ける (25 は 100 の4分の1の速さ)', () => {
    let s = setupExact(make());
    s = reduce(s, { type: 'setSpeed', value: 128 });
    expect(s.speed).toBe(100);
    s = reduce(s, { type: 'setSpeed', value: -5 });
    expect(s.speed).toBe(0);
    s = reduce(s, { type: 'setSpeed', value: 25.6 });
    expect(s.speed).toBe(26);
    // 速さ 26 のときの 1tick (0.1秒) の巻き量
    s = reduce(s, { type: 'tick', dtMs: 100 });
    expect(s.progress).toBeCloseTo((26 / 100 / 30) * 0.1, 6);
    // 速さ 25 は 100 の4分の1: 30 秒で 4 分の 1 巻ける
    let q = setupExact(make());
    q = reduce(q, { type: 'setSpeed', value: 25 });
    for (let i = 0; i < 300; i++) {
      q = reduce(q, { type: 'tick', dtMs: 100 });
    }
    expect(q.progress).toBeCloseTo(0.25, 2);
  });

  it('20. 寄せる・揺れ・乗り上げの仕組みが無い (nudge のアクションが無い・shiftVel・overflowMs・centeredMs が無い・shiftCm は動かない)', () => {
    const s = setupExact(make());
    const keys = Object.keys(s);
    for (const k of ['shiftVel', 'overflowMs', 'centeredMs']) {
      expect(keys, k).not.toContain(k);
    }
    // nudge は送れない (実行しても状態が変わらない)
    const unknown = reduce(s, { type: 'nudge', dir: 1 } as unknown as BeamingAction);
    expect(unknown).toBe(s);
    // shiftCm は常に 0 (シートは中央。PU-24b で茶色の棒の操作とともに変わる予定)
    let cur = act(s, [{ type: 'setSpeed', value: 100 }]);
    for (let i = 0; i < 50; i++) {
      cur = reduce(cur, { type: 'tick', dtMs: 100 });
    }
    expect(cur.shiftCm).toBe(0);
  });

  it('21. 巻き量 100.5 で止めて確認すると「100% ぴったりで止めた」扱い (星3の止めた位置)。101.0 に届くと失敗', () => {
    // 100.5% で止めて確認 → 星3 (他の条件が揃っていれば)。止めた位置の表示は 100
    const base = setupExact(make());
    const s: BeamingState = { ...base, widthErrCm: 0, goodMs: 900, windMs: 1000, progress: 1.005, restarts: 0, broken: false, speed: 0 };
    expect(starsOf(s)).toBe(3);
    expect(resultLines(s).find((l) => l.label === '止めた位置')!.value).toBe('100%');
    // 100.99 でも星3
    expect(starsOf({ ...s, progress: 1.0099 })).toBe(3);
    // 101.0 に届いたら tick で切れる (100 で巻くと 101% は 30.3 秒)
    let cur = setupExact(make());
    cur = reduce(cur, { type: 'setSpeed', value: 100 });
    for (let i = 0; i < 310; i++) {
      cur = reduce(cur, { type: 'tick', dtMs: 100 });
      if (cur.broken) break;
    }
    expect(cur.broken).toBe(true);
  });

  it('22. 止めた位置の表示は切り捨て (99.99% は 99%)', () => {
    const base = setupExact(make());
    const s: BeamingState = { ...base, widthErrCm: 0, goodMs: 900, windMs: 1000, progress: 0.9999, restarts: 0, broken: false, speed: 0 };
    expect(resultLines(s).find((l) => l.label === '止めた位置')!.value).toBe('99%');
  });
});
