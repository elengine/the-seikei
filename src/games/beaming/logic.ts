import type { RngState } from '../../core/clock/clock';
import { seedFrom, nextFloat } from '../../core/clock/clock';
import {
  MAX_TICK_MS, STARS3, STARS2, STAR_WIDTH3, STAR_WIDTH2,
  FULL_WIND_SEC_AT_100, TARGET_POINTS, OK_TOL_BY_LEVEL,
  DIP_GAP_MIN_MS, DIP_GAP_MAX_MS, DIP_AMOUNT_MIN, DIP_AMOUNT_MAX,
  DIP_DOWN_MS, DIP_HOLD_MIN_MS, DIP_HOLD_MAX_MS, DIP_BACK_MS,
  STOP_ZONE, DIP_FROM_PCT, DIP_TO_PCT,
  CONFIRM_MIN, STOP3, STOP2, RESTARTS_OK, WIDTH_OK_CM,
} from './params';
import type { Level } from './params';

export type { Level } from './params';

/** その巻き量での速さの目標 (T3-07。TARGET_POINTS の点を直線で結んだ値) */
export function targetOf(progress: number): number {
  const pct = Math.min(100, Math.max(0, progress * 100));
  for (let i = 0; i < TARGET_POINTS.length - 1; i++) {
    const [x0, y0] = TARGET_POINTS[i]!;
    const [x1, y1] = TARGET_POINTS[i + 1]!;
    if (pct >= x0 && pct <= x1) {
      if (x1 === x0) return y1;
      return y0 + ((pct - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return TARGET_POINTS[TARGET_POINTS.length - 1]![1]!;
}

/** その巻き量での適正範囲 (目標から揺らぎを引いた値 ± レベルの幅。0〜100 に収める。T3-06 追記)。
 *  巻き量 90% 以上は止めてよい範囲で、いつでも 0〜30 (レベルと揺らぎを使わない。T3-08) */
export function okRangeOf(progress: number, level: Level, dip: number): { min: number; max: number } {
  if (progress * 100 >= STOP_ZONE.from) {
    return { min: STOP_ZONE.min, max: STOP_ZONE.max };
  }
  const target = targetOf(progress) - dip;
  const tol = OK_TOL_BY_LEVEL[level];
  return { min: Math.max(0, target - tol), max: Math.min(100, target + tol) };
}

/**
 * ビーム巻きのルール (P3 T3-04・T3-05)。左右の揺れ・寄せる・乗り上げは無く、
 * 速さ (0〜100 の連続) と止めるタイミングだけのゲーム。
 * 巻き量 101% に届くと糸が切れて失敗。95% 以上で止めて「確認」すると結果が出る。
 */
export interface BeamingState {
  level: Level;
  widthCm: number; // 巻き幅 (cm。目標)
  patternId: string;
  puzzleId: string;
  phase: 'setup' | 'attach' | 'beaming' | 'done';
  leftCm: number; rightCm: number;   // 円盤の位置(ビームの中心からの距離 cm。左は負の数)
  progress: number;                  // 巻いた割合 0〜1 (表示は % にして切り捨て。101% に届いたら糸切れ)
  speed: number;                     // 木の棒の速さ 0〜100 (即時に変わる)
  dip: number;                       // 目標の揺らぎの今の下がり量 (10〜80% だけ。T3-08 で区間を変えた)
  dipPhase: 'none' | 'down' | 'hold' | 'back'; // 揺らぎのいまの段階
  dipTimerMs: number;                // 揺らぎの段階の経過時間
  dipGapMs: number;                  // 次の揺らぎまでのあいだ (ms)
  dipAmount: number;                 // 揺らぎの下がる量 (8〜15)
  dipHoldMs: number;                 // 下がりきってからそのままの時間 (ms)
  goodMs: number;                    // 適正な速さで巻いていた時間
  windMs: number;                    // 巻いていた時間 (speed > 0 の時間)
  restarts: number;                  // 95% を超えてから 停止 → 速さを 0 より大きく戻した回数 (微調整)
  broken: boolean;                   // 101% に届いて糸が切れた
  widthErrCm: number | null;         // 幅合わせを終えたときの誤差
  rng: RngState;
}
export type BeamingAction =
  | { type: 'moveFlange'; side: 'left' | 'right'; deltaCm: number } // ±1cm(ボタン)
  | { type: 'finishSetup' }          // 幅合わせを終えて糸を付ける段階へ(誤差を記録)
  | { type: 'attachThread' }         // ドラムの糸をビームに付ける (attach → beaming。速さは 0)
  | { type: 'setSpeed'; value: number } // 速さを変える (0〜100 に収める。丸めない。T3-07 追加修正)
  | { type: 'confirm' }              // 巻き量 95% 以上・停止のときだけ。結果判定して done
  | { type: 'tick'; dtMs: number };

/** 幅合わせの誤差: 幅のずれと中心のずれの大きいほう */
function widthError(s: BeamingState): number {
  return Math.max(Math.abs(s.rightCm - s.leftCm - s.widthCm), Math.abs((s.leftCm + s.rightCm) / 2));
}

/** 幅合わせが「合いました」か (±WIDTH_OK_CM 以内。表示用) */
export function widthOk(s: BeamingState): boolean {
  return widthError(s) <= WIDTH_OK_CM;
}

/** 止めた位置の表示の値 (巻き量 % の切り捨て。T3-05。判定もこの値で行う) */
export function stopPosOf(s: BeamingState): number {
  return Math.floor(Math.max(0, s.progress * 100));
}

/** 新しいゲームの状態。円盤は目標から外れた位置 (乱数) */
export function init(opts: { level: Level; widthCm: number; seed: number; puzzleId?: string; patternId?: string }): BeamingState {
  let rng = seedFrom(opts.seed);
  // 円盤の初期位置: 目標から ±6cm 以内のずれ (乱数)
  const [r1, rng1] = nextFloat(rng);
  const [r2, rng2] = nextFloat(rng1);
  rng = rng2;
  const leftCm = -opts.widthCm / 2 + (r1 * 2 - 1) * 6;
  const rightCm = opts.widthCm / 2 + (r2 * 2 - 1) * 6;
  return {
    level: opts.level,
    widthCm: opts.widthCm,
    patternId: opts.patternId ?? '',
    puzzleId: opts.puzzleId ?? '',
    phase: 'setup',
    leftCm,
    rightCm,
    progress: 0,
    speed: 0,
    dip: 0,
    dipPhase: 'none',
    dipTimerMs: 0,
    dipGapMs: DIP_GAP_MIN_MS + r2 * (DIP_GAP_MAX_MS - DIP_GAP_MIN_MS),
    dipAmount: 0,
    dipHoldMs: DIP_HOLD_MIN_MS,
    goodMs: 0,
    windMs: 0,
    restarts: 0,
    broken: false,
    widthErrCm: null,
    rng,
  };
}

/** 元の s は変更しない */
export function reduce(s: BeamingState, a: BeamingAction): BeamingState {
  if (s.phase === 'done') return s; // 'done' の後はどの操作でも状態を変えない

  switch (a.type) {
    case 'moveFlange':
      if (s.phase !== 'setup') return s;
      return a.side === 'left'
        ? { ...s, leftCm: s.leftCm + a.deltaCm }
        : { ...s, rightCm: s.rightCm + a.deltaCm };

    case 'finishSetup':
      if (s.phase !== 'setup') return s;
      return { ...s, phase: 'attach', widthErrCm: widthError(s) };

    case 'attachThread':
      if (s.phase !== 'attach') return s;
      return { ...s, phase: 'beaming', speed: 0 };

    case 'setSpeed': {
      if (s.phase !== 'beaming') return s;
      const value = Math.max(0, Math.min(100, a.value)); // 丸めない (0〜100 に収めるだけ。T3-07 追加修正: 丸めると針が飛び飛びに動く)
      // 95% を超えてから 停止 → 速さを 0 より大きく戻したら微調整 (T3-05)
      const restarts =
        s.progress >= CONFIRM_MIN && s.speed === 0 && value > 0 ? s.restarts + 1 : s.restarts;
      return { ...s, speed: value, restarts };
    }

    case 'confirm':
      // 巻き量 95% 以上で、レバーが停止のときだけ受け付ける (T3-04a)
      if (s.phase !== 'beaming' || s.speed !== 0 || s.progress < CONFIRM_MIN) return s;
      return { ...s, phase: 'done' };

    case 'tick':
      return tick(s, a.dtMs);
  }
  return s; // 知らない形の操作は受けない
}

/** 揺らぎ (10〜80% だけ目標がときどき下がって戻る。T3-08) を 1tick 進める */
function stepDip(s: BeamingState, dtMsC: number, rng: RngState): { dip: number; dipPhase: BeamingState['dipPhase']; dipTimerMs: number; dipGapMs: number; dipAmount: number; dipHoldMs: number; rng: RngState } {
  const pct = s.progress * 100;
  let { dip, dipPhase, dipTimerMs, dipGapMs, dipAmount, dipHoldMs } = s;
  let nextRng = rng;
  if (pct < DIP_FROM_PCT || pct > DIP_TO_PCT) {
    // 区間の外では揺らぎはすぐ 0 に戻る
    return { dip: 0, dipPhase: 'none', dipTimerMs: 0, dipGapMs, dipAmount, dipHoldMs, rng: nextRng };
  }
  if (dipPhase === 'none') {
    dipTimerMs += dtMsC;
    if (dipTimerMs >= dipGapMs) {
      const [r1, rng1] = nextFloat(nextRng);
      const [r2, rng2] = nextFloat(rng1);
      const [r3, rng3] = nextFloat(rng2);
      nextRng = rng3;
      dipAmount = DIP_AMOUNT_MIN + r1 * (DIP_AMOUNT_MAX - DIP_AMOUNT_MIN);
      dipHoldMs = DIP_HOLD_MIN_MS + r2 * (DIP_HOLD_MAX_MS - DIP_HOLD_MIN_MS);
      dipGapMs = DIP_GAP_MIN_MS + r3 * (DIP_GAP_MAX_MS - DIP_GAP_MIN_MS);
      dipPhase = 'down';
      dipTimerMs = 0;
    }
  } else if (dipPhase === 'down') {
    dipTimerMs += dtMsC;
    dip = dipAmount * Math.min(1, dipTimerMs / DIP_DOWN_MS);
    if (dipTimerMs >= DIP_DOWN_MS) {
      dipPhase = 'hold';
      dipTimerMs = 0;
    }
  } else if (dipPhase === 'hold') {
    dipTimerMs += dtMsC;
    dip = dipAmount;
    if (dipTimerMs >= dipHoldMs) {
      dipPhase = 'back';
      dipTimerMs = 0;
    }
  } else {
    dipTimerMs += dtMsC;
    dip = dipAmount * Math.max(0, 1 - dipTimerMs / DIP_BACK_MS);
    if (dipTimerMs >= DIP_BACK_MS) {
      dip = 0;
      dipPhase = 'none';
      dipTimerMs = 0;
      dipAmount = 0;
    }
  }
  return { dip, dipPhase, dipTimerMs, dipGapMs, dipAmount, dipHoldMs, rng: nextRng };
}

/** tick。dtMs を MAX_TICK_MS で丸め、'beaming' で時間を進める */
function tick(s: BeamingState, dtMs: number): BeamingState {
  if (s.phase !== 'beaming') return s;
  const dtMsC = Math.min(MAX_TICK_MS, Math.max(0, dtMs));
  const dt = dtMsC / 1000; // 秒

  // 1. 巻いているあいだ (速さ > 0) は巻き量と時間と揺らぎが進む (T3-07: 張りはやめて、判定は速さそのもの)
  if (s.speed === 0) {
    return s;
  }
  const rate = s.speed / 100 / FULL_WIND_SEC_AT_100; // 1秒あたりの巻き量
  const progress = s.progress + rate * dt;
  const windMs = s.windMs + dtMsC;
  const d = stepDip(s, dtMsC, s.rng);
  const range = okRangeOf(progress, s.level, d.dip);
  const goodMs = s.speed >= range.min && s.speed <= range.max ? s.goodMs + dtMsC : s.goodMs;
  // 2. 巻き量 101% に届いたら糸が切れて失敗 (T3-05。100.99 までは切れない)
  if (progress * 100 >= 101) {
    return { ...s, progress, speed: 0, windMs, goodMs, ...d, broken: true, phase: 'done' };
  }
  return { ...s, progress, windMs, goodMs, ...d };
}

/**
 * 星 (T3-05)。失敗 (糸切れ) は 0 (星なし)。「中央に保てた割合」は採点に入れない。
 * 止めた位置は表示の値 (切り捨て) で比べる。巻き量 100.0〜100.99 で止めたら 100 (最良)。
 * 適正の割合は、速さが適正範囲の中で巻いた時間の割合 (T3-07 で判定は速さそのもの)。
 * - 星3: 適正 0.8 以上・止めた位置 99 以上・微調整 2回以下・幅の誤差 1cm 以内
 * - 星2: 適正 0.6 以上・止めた位置 97 以上・幅の誤差 3cm 以内
 * - 星1: それ以外
 */
export function starsOf(s: BeamingState): 0 | 1 | 2 | 3 {
  if (s.broken) return 0;
  const goodRatio = s.windMs > 0 ? s.goodMs / s.windMs : 0;
  const err = s.widthErrCm;
  const stop = stopPosOf(s);
  if (err !== null && err <= STAR_WIDTH3 && goodRatio >= STARS3 && stop >= STOP3 * 100 && s.restarts <= RESTARTS_OK) return 3;
  if (err !== null && err <= STAR_WIDTH2 && goodRatio >= STARS2 && stop >= STOP2 * 100) return 2;
  return 1;
}

/** 成績の行 (T3-05。「中央に保てた割合」「乗り上げ」は無い) */
export function resultLines(s: BeamingState): { label: string; value: string }[] {
  if (s.broken) {
    return [{ label: '結果', value: '巻き量が 101% に届きました' }];
  }
  const pct = (ok: number): string => `${Math.round(s.windMs > 0 ? (ok / s.windMs) * 100 : 0)}%`;
  return [
    { label: 'ちょうどよい速さで巻いた割合', value: pct(s.goodMs) }, // 行の名前は T3-07 で「張り」から「速さ」に変えた (判定も速さそのもの)
    { label: '止めた位置', value: `${stopPosOf(s)}%` },
    { label: '微調整', value: `${s.restarts}回` },
    { label: '幅合わせの誤差', value: s.widthErrCm === null ? '—' : `${s.widthErrCm.toFixed(1)}cm` },
  ];
}

/**
 * 途中保存の形を確かめる。速さは数。張り (tension) は求めない。古い途中保存 (tension を含む形) も読む —
 * 余分な tension の値は形が違っていても捨てる (中身を見ない。T3-07 で張りをやめた)。
 * 再開したときのレバーは controller が停止 (0) にする
 */
export function isValidResume(x: unknown): x is BeamingState {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.phase !== 'string' || !['setup', 'attach', 'beaming', 'done'].includes(o.phase)) return false;
  if (o.level !== 1 && o.level !== 2 && o.level !== 3) return false;
  for (const key of ['widthCm', 'leftCm', 'rightCm', 'progress', 'dip', 'dipTimerMs', 'dipGapMs', 'dipAmount', 'dipHoldMs', 'goodMs', 'windMs', 'restarts'] as const) {
    if (typeof o[key] !== 'number' || !Number.isFinite(o[key])) return false;
  }
  if (o.dipPhase !== 'none' && o.dipPhase !== 'down' && o.dipPhase !== 'hold' && o.dipPhase !== 'back') return false;
  const progress = o.progress;
  if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 1.01) return false;
  if (typeof o.speed !== 'number' || !Number.isFinite(o.speed) || o.speed < 0 || o.speed > 100) return false;
  if (typeof o.broken !== 'boolean') return false;
  if (o.widthErrCm !== null && typeof o.widthErrCm !== 'number') return false;
  if (typeof o.puzzleId !== 'string' || typeof o.patternId !== 'string') return false;
  if (typeof o.rng !== 'number') return false;
  return true;
}
