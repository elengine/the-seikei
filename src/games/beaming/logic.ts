import type { RngState } from '../../core/clock/clock';
import { seedFrom, nextFloat } from '../../core/clock/clock';
import {
  MAX_TICK_MS, STARS3, STARS2, STAR_WIDTH3, STAR_WIDTH2,
  FULL_WIND_SEC_AT_100, GOOD_SPEED_ZONES, SPEED_OK_TOL, CONFIRM_MIN, STOP3, STOP2, RESTARTS_OK, WIDTH_OK_CM,
} from './params';
import type { Level } from './params';

export type { Level } from './params';

/** その巻き量で、その速さが適正か (T3-05)。目標 ±10 (SPEED_OK_TOL) の中を適正とする。
 *  停止 (0) が目標の区間では「止めている」だけが適正 (0〜10 ではない)。重なる区間はどちらでも適正 */
export function goodSpeedOf(speed: number, progress: number): boolean {
  const pct = Math.min(100, Math.max(0, progress * 100));
  return GOOD_SPEED_ZONES.some((z) => {
    if (pct < z.from || pct > z.to) return false;
    if (z.speed === 0) return speed === 0; // 止めていること
    return Math.abs(speed - z.speed) <= SPEED_OK_TOL;
  });
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
  phase: 'setup' | 'beaming' | 'done';
  leftCm: number; rightCm: number;   // 円盤の位置(ビームの中心からの距離 cm。左は負の数)
  progress: number;                  // 巻いた割合 0〜1 (表示は % にして切り捨て。101% に届いたら糸切れ)
  speed: number;                     // 速さ 0〜100 (連続。0 = 停止)
  goodMs: number;                    // 適正な速さで巻いていた時間
  windMs: number;                    // 巻いていた時間 (speed > 0 の時間)
  restarts: number;                  // 95% を超えてから 停止 → 速さを 0 より大きく戻した回数 (微調整)
  broken: boolean;                   // 101% に届いて糸が切れた
  widthErrCm: number | null;         // 幅合わせを終えたときの誤差
  rng: RngState;
}
export type BeamingAction =
  | { type: 'moveFlange'; side: 'left' | 'right'; deltaCm: number } // ±1cm(ボタン)
  | { type: 'finishSetup' }          // 幅合わせを終えて巻き返しへ(誤差を記録)
  | { type: 'setSpeed'; value: number } // 速さを変える (0〜100 に丸める)
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
      return { ...s, phase: 'beaming', widthErrCm: widthError(s) };

    case 'setSpeed': {
      if (s.phase !== 'beaming') return s;
      const value = Math.max(0, Math.min(100, Math.round(a.value)));
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

/** tick。dtMs を MAX_TICK_MS で丸め、'beaming' で時間を進める */
function tick(s: BeamingState, dtMs: number): BeamingState {
  if (s.phase !== 'beaming' || s.speed === 0) return s;
  const dtMsC = Math.min(MAX_TICK_MS, Math.max(0, dtMs));
  const dt = dtMsC / 1000; // 秒

  // 1. 巻く。速さに比例 (100 で FULL_WIND_SEC_AT_100 秒、25 はその4分の1の速さ)
  const rate = s.speed / 100 / FULL_WIND_SEC_AT_100; // 1秒あたりの巻き量
  const progress = s.progress + rate * dt;
  const windMs = s.windMs + dtMsC;
  // 2. 適正な速さで巻いていた時間を数える
  const goodMs = goodSpeedOf(s.speed, s.progress) ? s.goodMs + dtMsC : s.goodMs;
  // 3. 巻き量 101% に届いたら糸が切れて失敗 (T3-05。100.99 までは切れない)
  if (progress * 100 >= 101) {
    return { ...s, progress, speed: 0, windMs, goodMs, broken: true, phase: 'done' };
  }
  return { ...s, progress, windMs, goodMs };
}

/**
 * 星 (T3-05)。失敗 (糸切れ) は 0 (星なし)。「中央に保てた割合」は採点に入れない。
 * 止めた位置は表示の値 (切り捨て) で比べる。巻き量 100.0〜100.99 で止めたら 100 (最良)。
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
    { label: '適正な速さ', value: pct(s.goodMs) },
    { label: '止めた位置', value: `${stopPosOf(s)}%` },
    { label: '微調整', value: `${s.restarts}回` },
    { label: '幅合わせの誤差', value: s.widthErrCm === null ? '—' : `${s.widthErrCm.toFixed(1)}cm` },
  ];
}

/** 途中保存の形を確かめる。速さは 0〜100 の数。古い形 (shiftVel がある) は読まない (T3-05)。
 * 再開したときのレバーは controller が停止 (0) にする */
export function isValidResume(x: unknown): x is BeamingState {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.phase !== 'string' || !['setup', 'beaming', 'done'].includes(o.phase)) return false;
  if (o.level !== 1 && o.level !== 2 && o.level !== 3) return false;
  if ('shiftVel' in o) return false; // 古い形 (揺れがある) は読まない
  for (const key of ['widthCm', 'leftCm', 'rightCm', 'progress', 'goodMs', 'windMs', 'restarts'] as const) {
    if (typeof o[key] !== 'number' || !Number.isFinite(o[key])) return false;
  }
  const progress = o.progress;
  if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 1.01) return false;
  if (typeof o.speed !== 'number' || !Number.isFinite(o.speed) || o.speed < 0 || o.speed > 100) return false;
  if (typeof o.broken !== 'boolean') return false;
  if (o.widthErrCm !== null && typeof o.widthErrCm !== 'number') return false;
  if (typeof o.puzzleId !== 'string' || typeof o.patternId !== 'string') return false;
  if (typeof o.rng !== 'number') return false;
  return true;
}
