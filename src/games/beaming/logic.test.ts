import { describe, it, expect } from 'vitest';
import { init, reduce, starsOf, widthOk, resultLines, isValidResume, targetOf, okRangeOf } from './logic';
import type { BeamingState, BeamingAction } from './logic';
import type { Level } from './params';
import { FULL_WIND_SEC_AT_100, TARGET_POINTS, STOP3, STOP2, RESTARTS_OK, OK_TOL_BY_LEVEL } from './params';

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

/** 幅合わせをぴったり合わせて糸も付けた状態 (誤差 0。phase は beaming。T3-06) */
function setupExact(s: BeamingState): BeamingState {
  const w = s.widthCm;
  return act(s, [
    { type: 'moveFlange', side: 'left', deltaCm: -w / 2 - s.leftCm },
    { type: 'moveFlange', side: 'right', deltaCm: w / 2 - s.rightCm },
    { type: 'finishSetup' },
    { type: 'attachThread' },
  ]);
}

/** 幅合わせをぴったり合わせて糸を付ける前の状態 (phase は attach。T3-06) */
function setupAttach(s: BeamingState): BeamingState {
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

  it('9. 成績の行: ちょうどよい速さで巻いた割合・止めた位置・微調整・幅合わせの誤差の4行。止めた位置は表示と同じ (切り捨て)。行の名前は T3-07 で張りから速さに変えた', () => {
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
    expect(lines.map((l) => l.label)).toEqual(['ちょうどよい速さで巻いた割合', '止めた位置', '微調整', '幅合わせの誤差']);
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

  it('11. 張りの目標 (TARGET_POINTS を直線で結ぶ) と適正範囲 (目標から揺らぎを引いた値 ± レベルの幅。0〜100 に収める) (T3-06)', () => {
    expect(TARGET_POINTS).toEqual([[0, 0], [10, 50], [30, 50], [35, 100], [70, 100], [75, 50], [100, 0]]); // PU-27: 0〜10% で 50 に上がる
    // 仕様書の点 (追記): 0%→0、15%→25、30%→50、32.5%→75、50%→100、72.5%→75、87.5%→25、100%→0
    expect(targetOf(0)).toBe(0);
    expect(targetOf(0.05)).toBe(25);
    expect(targetOf(0.10)).toBe(50);
    expect(targetOf(0.15)).toBe(50);
    expect(targetOf(0.30)).toBe(50);
    expect(targetOf(0.325)).toBe(75);
    expect(targetOf(0.50)).toBe(100);
    expect(targetOf(0.725)).toBe(75);
    expect(targetOf(0.875)).toBe(25);
    expect(targetOf(1)).toBe(0);
    // 範囲は目標 (揺らぎを引いた値) ± レベルの幅。0〜100 に収める
    expect(OK_TOL_BY_LEVEL).toEqual({ 1: 15, 2: 10, 3: 6 });
    expect(okRangeOf(0.5, 2, 0)).toEqual({ min: 90, max: 100 });
    expect(okRangeOf(0.30, 2, 0)).toEqual({ min: 40, max: 60 });
    expect(okRangeOf(0.30, 1, 0)).toEqual({ min: 35, max: 65 }); // レベル1 は ±15
    expect(okRangeOf(0.50, 3, 20)).toEqual({ min: 74, max: 86 }); // 目標 100 − 揺らぎ 20 = 80 ± 6
    expect(okRangeOf(0.5, 1, 0).max).toBeLessThanOrEqual(100);
  });

  it("11b. 速さが適正範囲の中のときだけ goodMs が増える (巻いている間だけ。速さ 0 では増えない)。判定は張りでなく速さそのもの (T3-07。張りはやめた)", () => {
    // 巻き量 50% (目標 100・レベル2 の範囲 90〜100)。速さ 95 は範囲の中
    let s = setupExact(make(2));
    s = { ...s, speed: 95, progress: 0.5 };
    s = reduce(s, { type: 'tick', dtMs: 100 });
    expect(s.goodMs).toBe(100);
    // 速さが範囲の外 (50) だと増えない (巻きは進む)
    s = { ...s, speed: 50, progress: 0.5 };
    s = reduce(s, { type: 'tick', dtMs: 100 });
    expect(s.goodMs).toBe(100);
    expect(s.windMs).toBe(200);
    // 速さ 0 では巻きも goodMs も進まない
    s = { ...s, speed: 0, progress: 0.5 };
    const stopped = reduce(s, { type: 'tick', dtMs: 100 });
    expect(stopped.goodMs).toBe(100);
    expect(stopped.windMs).toBe(200);
    expect(stopped.progress).toBe(0.5);
    // state に張り (tension) は無い (T3-07 でやめた)
    expect(Object.keys(stopped)).not.toContain('tension');
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

  it('13. 途中保存の形 (isValidResume): init の状態は true、壊れた形は false。張り (tension) は無くてよい。古い途中保存 (tension を含む形) も読む (余分な tension は捨てる。T3-07 で張りをやめたため、期待値を変えた)', () => {
    const s = setupExact(make());
    expect(isValidResume(s)).toBe(true);
    expect(isValidResume({ ...s, phase: 'attach' })).toBe(true);
    expect(isValidResume({ ...s, phase: 'other' })).toBe(false);
    expect(isValidResume({ ...s, leftCm: 'x' as unknown as number })).toBe(false);
    expect(isValidResume({ ...s, speed: 60 })).toBe(true); // 0〜100 なら何でもよい
    expect(isValidResume({ ...s, speed: 101 })).toBe(false);
    expect(isValidResume({ ...s, goodMs: 'x' as unknown as number })).toBe(false);
    expect(isValidResume({ ...s, restarts: 'x' as unknown as number })).toBe(false);
    expect(isValidResume({ ...s, broken: 'x' as unknown as boolean })).toBe(false);
    // 古い途中保存 (T3-06 までの形。tension を含む) も読む。余分な tension は形が違っていても捨てる (中身を見ない)
    const oldSave: Record<string, unknown> = { ...(s as unknown as Record<string, unknown>), tension: 'x' as unknown as number };
    expect(isValidResume(oldSave)).toBe(true);
    expect(isValidResume(null)).toBe(false);
  });

  it('13b. 小数の速さの途中保存も読む (T3-07 追加修正で速さを丸めないため)', () => {
    const s = setupExact(make());
    expect(isValidResume({ ...s, speed: 37.25 })).toBe(true);
    expect(isValidResume({ ...s, speed: 0.5 })).toBe(true);
  });
});

describe('T3-05 (揺れをやめる・速さを連続に・止める判定を表示と同じに)', () => {
  it('19. setSpeed は 0〜100 に収める (丸めない。T3-07 追加修正)。速さに比例して巻ける (25 は 100 の4分の1の速さ)', () => {
    let s = setupExact(make());
    s = reduce(s, { type: 'setSpeed', value: 128 });
    expect(s.speed).toBe(100);
    s = reduce(s, { type: 'setSpeed', value: -5 });
    expect(s.speed).toBe(0);
    // 小数のまま (丸めない。T3-07 追加修正)
    s = reduce(s, { type: 'setSpeed', value: 37.25 });
    expect(s.speed).toBe(37.25);
    // 速さ 37.25 のときの 1tick (0.1秒) の巻き量
    s = reduce(s, { type: 'tick', dtMs: 100 });
    expect(s.progress).toBeCloseTo((37.25 / 100 / 30) * 0.1, 6);
    // 速さ 25 は 100 の4分の1: 30 秒で 4 分の 1 巻ける
    let q = setupExact(make());
    q = reduce(q, { type: 'setSpeed', value: 25 });
    for (let i = 0; i < 300; i++) {
      q = reduce(q, { type: 'tick', dtMs: 100 });
    }
    expect(q.progress).toBeCloseTo(0.25, 2);
  });

  it('20. 寄せる・揺れ・乗り上げの仕組みが無い (nudge のアクションが無い・shiftVel・overflowMs・centeredMs・shiftCm が無い)', () => {
    const s = setupExact(make());
    const keys = Object.keys(s);
    for (const k of ['shiftVel', 'overflowMs', 'centeredMs']) {
      expect(keys, k).not.toContain(k);
    }
    // nudge は送れない (実行しても状態が変わらない)
    const unknown = reduce(s, { type: 'nudge', dir: 1 } as unknown as BeamingAction);
    expect(unknown).toBe(s);
    // state に shiftCm (糸のシートの中心のずれ) は無い (T3-05 以降いつも 0 だったので消した。茶色の棒の位置は速さから決まる。PU-24b)
    expect(keys).not.toContain('shiftCm');
    let cur = act(s, [{ type: 'setSpeed', value: 100 }]);
    for (let i = 0; i < 50; i++) {
      cur = reduce(cur, { type: 'tick', dtMs: 100 });
    }
    expect(Object.keys(cur)).not.toContain('shiftCm');
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

describe('T3-06 (3つの作業と張り)', () => {
  it('23. 流れ: setup → finishSetup → attach → attachThread → beaming。attach では setSpeed が効かず、setup では attachThread が効かない', () => {
    let s = setupAttach(make());
    expect(s.phase).toBe('attach');
    // attach では速さを変えられない
    const notYet = reduce(s, { type: 'setSpeed', value: 50 });
    expect(notYet.speed).toBe(0);
    expect(notYet.phase).toBe('attach');
    // setup では attachThread が効かない
    const inSetup = reduce(make(), { type: 'attachThread' });
    expect(inSetup.phase).toBe('setup');
    // 糸を付けると beaming になり、速さは 0
    s = reduce(s, { type: 'attachThread' });
    expect(s.phase).toBe('beaming');
    expect(s.speed).toBe(0);
  });

  it('26. 35〜70% では目標がときどき下がって戻る (下がる量は 15 以内。区間の外では下がらない。同じ種なら同じ動き)', () => {
    // 巻き量 50% に固定して 60 秒巻くと、揺らぎで dip が 0 より大きくなることがある
    let s = setupExact(make(2, 60, 9));
    s = reduce(s, { type: 'setSpeed', value: 40 });
    s = { ...s, progress: 0.5 };
    let sawDip = false;
    let maxDip = 0;
    for (let i = 0; i < 600; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
      maxDip = Math.max(maxDip, s.dip);
      if (s.dip > 0) sawDip = true;
      s = { ...s, progress: 0.5 }; // 巻き量を固定して揺らぎだけを見る
    }
    expect(sawDip, `maxDip ${maxDip}`).toBe(true);
    expect(maxDip).toBeLessThanOrEqual(15);
    // 区間の外 (10%) では下がらない
    let s2 = setupExact(make(2, 60, 9));
    s2 = reduce(s2, { type: 'setSpeed', value: 40 });
    s2 = { ...s2, progress: 0.10 };
    for (let i = 0; i < 600; i++) {
      s2 = reduce(s2, { type: 'tick', dtMs: 100 });
      s2 = { ...s2, progress: 0.10 };
      expect(s2.dip).toBe(0);
    }
    // 同じ種なら同じ動き
    const run = (): number[] => {
      let c = setupExact(make(2, 60, 9));
      c = reduce(c, { type: 'setSpeed', value: 40 });
      c = { ...c, progress: 0.5 };
      const dips: number[] = [];
      for (let i = 0; i < 200; i++) {
        c = reduce(c, { type: 'tick', dtMs: 100 });
        c = { ...c, progress: 0.5 };
        dips.push(Math.round(c.dip * 100));
      }
      return dips;
    };
    expect(run()).toEqual(run());
  });
});
