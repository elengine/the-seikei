import type { RngState } from '../../core/clock/clock';
import { seedFrom, nextFloat } from '../../core/clock/clock';
import {
  MAX_TICK_MS, STARS3, STARS2, STAR_WIDTH3, STAR_WIDTH2, CENTER_OK_CM, OVERFLOW_CLEARANCE_CM,
  NUDGE_CM, SHIFT_VEL, SHIFT_TURN_RATE, FULL_WIND_SEC_AT_100, GOOD_SPEED_ZONES, CONFIRM_MIN, STOP3, STOP2, RESTARTS_OK, WIDTH_OK_CM,
} from './params';
import type { Level } from './params';

export type { Level } from './params';

/** レバーの速さ (0 = 停止・50 = 半分・100 = 全速) */
export type BeamingSpeed = 0 | 50 | 100;

/**
 * 乗り上げの判定 (T3-03a 追加修正)。シートの端 (中心 ± 巻き幅/2) が
 * 円盤の内側 (遊び OVERFLOW_CLEARANCE_CM) を越えたら乗り上げ。
 * renderer・messages はこの関数を使う (式を二重に持たない)。
 */
export function overflowSides(s: BeamingState): { left: boolean; right: boolean } {
  return {
    left: s.shiftCm - s.widthCm / 2 < s.leftCm - OVERFLOW_CLEARANCE_CM,
    right: s.shiftCm + s.widthCm / 2 > s.rightCm + OVERFLOW_CLEARANCE_CM,
  };
};

/** その巻き量で、その速さが適正か (T3-04a。表 GOOD_SPEED_ZONES で決める。重なる区間はどちらでも適正) */
export function goodSpeedOf(speed: BeamingSpeed, progress: number): boolean {
  const pct = Math.min(100, Math.max(0, progress * 100));
  return GOOD_SPEED_ZONES.some((z) => pct >= z.from && pct <= z.to && z.speed === speed);
}

/**
 * ビーム巻きのルール (P3 T3-04)。張り (ペダル) をやめ、速さの3段階のレバーで巻く。
 * 巻き量 100% を超えると糸が切れて失敗。95% 以上で止めて「確認」すると結果が出る。
 */
export interface BeamingState {
  level: Level;
  widthCm: number; // 巻き幅 (cm。目標)
  patternId: string;
  puzzleId: string;
  phase: 'setup' | 'beaming' | 'done';
  leftCm: number; rightCm: number;   // 円盤の位置(ビームの中心からの距離 cm。左は負の数)
  progress: number;                  // 巻いた割合 0〜1 (1 を超えたら糸切れ)
  speed: BeamingSpeed;               // レバーの位置 (停止・50%・100%)
  shiftCm: number;                   // 糸のシートの中心のずれ(cm。0 が中央)
  shiftVel: number;                  // 偏っていく向きと速さ
  goodMs: number;                    // 適正な速さで巻いていた時間
  centeredMs: number;                // 中央に保てた時間
  windMs: number;                    // 巻いていた時間 (speed > 0 の時間)
  overflowMs: number;                // 円盤に乗り上げていた時間
  restarts: number;                  // 95% を超えてから 停止 → 50% に戻した回数 (微調整)
  broken: boolean;                   // 100% を超えて糸が切れた
  widthErrCm: number | null;         // 幅合わせを終えたときの誤差
  rng: RngState;
}
export type BeamingAction =
  | { type: 'moveFlange'; side: 'left' | 'right'; deltaCm: number } // ±1cm(ボタン)
  | { type: 'finishSetup' }          // 幅合わせを終えて巻き返しへ(誤差を記録)
  | { type: 'setSpeed'; speed: BeamingSpeed } // レバーを動かす
  | { type: 'confirm' }              // 巻き量 95% 以上・停止のときだけ。結果判定して done
  | { type: 'nudge'; dir: -1 | 1 }   // 寄せる。shiftCm を NUDGE_CM だけ動かす
  | { type: 'tick'; dtMs: number };

/** 幅合わせの誤差: 幅のずれと中心のずれの大きいほう */
function widthError(s: BeamingState): number {
  return Math.max(Math.abs(s.rightCm - s.leftCm - s.widthCm), Math.abs((s.leftCm + s.rightCm) / 2));
}

/** 幅合わせが「合いました」か (±WIDTH_OK_CM 以内。表示用) */
export function widthOk(s: BeamingState): boolean {
  return widthError(s) <= WIDTH_OK_CM;
}

/** 新しいゲームの状態。円盤は目標から外れた位置 (乱数) */
export function init(opts: { level: Level; widthCm: number; seed: number; puzzleId?: string; patternId?: string }): BeamingState {
  let rng = seedFrom(opts.seed);
  // 円盤の初期位置: 目標から ±6cm 以内のずれ (乱数)
  const [r1, rng1] = nextFloat(rng);
  const [r2, rng2] = nextFloat(rng1);
  const [r3, rng3] = nextFloat(rng2);
  rng = rng3;
  const leftCm = -opts.widthCm / 2 + (r1 * 2 - 1) * 6;
  const rightCm = opts.widthCm / 2 + (r2 * 2 - 1) * 6;
  const dir = r3 < 0.5 ? -1 : 1;
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
    shiftCm: 0,
    shiftVel: dir * SHIFT_VEL(opts.level),
    goodMs: 0,
    centeredMs: 0,
    windMs: 0,
    overflowMs: 0,
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
      // 95% を超えてから 停止 → 50% に戻したら微調整 (T3-04a)
      const restarts =
        s.progress >= CONFIRM_MIN && s.speed === 0 && a.speed === 50 ? s.restarts + 1 : s.restarts;
      return { ...s, speed: a.speed, restarts };
    }

    case 'confirm':
      // 巻き量 95% 以上で、レバーが停止のときだけ受け付ける (T3-04a)
      if (s.phase !== 'beaming' || s.speed !== 0 || s.progress < CONFIRM_MIN) return s;
      return { ...s, phase: 'done' };

    case 'nudge':
      if (s.phase !== 'beaming') return s;
      return { ...s, shiftCm: s.shiftCm + a.dir * NUDGE_CM };

    case 'tick':
      return tick(s, a.dtMs);
  }
}

/** tick。dtMs を MAX_TICK_MS で丸め、'beaming' で時間を進める */
function tick(s: BeamingState, dtMs: number): BeamingState {
  if (s.phase !== 'beaming' || s.speed === 0) return s;
  const dtMsC = Math.min(MAX_TICK_MS, Math.max(0, dtMs));
  const dt = dtMsC / 1000; // 秒

  // 1. 偏りの向きをときどき変える (乱数)。動くのは巻いているあいだ
  const [raw, nextRng] = nextFloat(s.rng);
  let shiftVel = s.shiftVel;
  if (raw < SHIFT_TURN_RATE * dt) {
    shiftVel = -shiftVel;
  }
  const shiftCm = s.shiftCm + shiftVel * dt;

  // 2. 巻く。速さ 100 で FULL_WIND_SEC_AT_100 秒で 0→1 (50 はその半分)
  const rate = s.speed / 100 / FULL_WIND_SEC_AT_100; // 1秒あたりの巻き量
  const progress = s.progress + rate * dt;
  const windMs = s.windMs + dtMsC;
  // 3. 適正な速さで巻いていた時間を数える
  const goodMs = goodSpeedOf(s.speed, s.progress) ? s.goodMs + dtMsC : s.goodMs;
  // 4. 乗り上げ・中央の記録
  const over = overflowSides({ ...s, shiftCm });
  const overflowMs = over.left || over.right ? s.overflowMs + dtMsC : s.overflowMs;
  const centeredMs = !over.left && !over.right && Math.abs(shiftCm) <= CENTER_OK_CM ? s.centeredMs + dtMsC : s.centeredMs;
  // 5. 巻き量 100% を超えたら糸が切れて失敗 (T3-04a)
  if (progress > 1) {
    return { ...s, progress, speed: 0, shiftVel, shiftCm, rng: nextRng, windMs, goodMs, overflowMs, centeredMs, broken: true, phase: 'done' };
  }
  return { ...s, progress, shiftVel, shiftCm, rng: nextRng, windMs, goodMs, overflowMs, centeredMs };
}

/**
 * 星 (T3-04a)。失敗 (糸切れ) は 0 (星なし)。
 * - 星3: 適正 0.8 以上・止めた位置 99.0% 以上・微調整 2回以下・幅の誤差 1cm 以内・中央 0.8 以上
 * - 星2: 適正 0.6 以上・止めた位置 97.0% 以上・幅の誤差 3cm 以内
 * - 星1: それ以外
 */
export function starsOf(s: BeamingState): 0 | 1 | 2 | 3 {
  if (s.broken) return 0;
  const goodRatio = s.windMs > 0 ? s.goodMs / s.windMs : 0;
  const centerRatio = s.windMs > 0 ? s.centeredMs / s.windMs : 0;
  const err = s.widthErrCm;
  if (err !== null && err <= STAR_WIDTH3 && goodRatio >= STARS3 && s.progress >= STOP3 && s.restarts <= RESTARTS_OK && centerRatio >= STARS3) return 3;
  if (err !== null && err <= STAR_WIDTH2 && goodRatio >= STARS2 && s.progress >= STOP2) return 2;
  return 1;
}

/** 成績の行 (T3-04a) */
export function resultLines(s: BeamingState): { label: string; value: string }[] {
  if (s.broken) {
    return [{ label: '結果', value: '巻き量が 100% を超えました' }];
  }
  const pct = (ok: number): string => `${Math.round(s.windMs > 0 ? (ok / s.windMs) * 100 : 0)}%`;
  return [
    { label: '適正な速さ', value: pct(s.goodMs) },
    { label: '止めた位置', value: `${(s.progress * 100).toFixed(1)}%` },
    { label: '微調整', value: `${s.restarts}回` },
    { label: '幅合わせの誤差', value: s.widthErrCm === null ? '—' : `${s.widthErrCm.toFixed(1)}cm` },
    { label: '中央に保てた割合', value: pct(s.centeredMs) },
  ];
}

/** 途中保存の形を確かめる。再開したときのレバーは controller が停止 (0) にする */
export function isValidResume(x: unknown): x is BeamingState {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.phase !== 'string' || !['setup', 'beaming', 'done'].includes(o.phase)) return false;
  if (o.level !== 1 && o.level !== 2 && o.level !== 3) return false;
  for (const key of ['widthCm', 'leftCm', 'rightCm', 'progress', 'shiftCm', 'shiftVel', 'goodMs', 'centeredMs', 'windMs', 'overflowMs', 'restarts'] as const) {
    if (typeof o[key] !== 'number' || !Number.isFinite(o[key])) return false;
  }
  const progress = o.progress;
  if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 1) return false;
  if (o.speed !== 0 && o.speed !== 50 && o.speed !== 100) return false;
  if (typeof o.broken !== 'boolean') return false;
  if (o.widthErrCm !== null && typeof o.widthErrCm !== 'number') return false;
  if (typeof o.puzzleId !== 'string' || typeof o.patternId !== 'string') return false;
  if (typeof o.rng !== 'number') return false;
  return true;
}
