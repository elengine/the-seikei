import type { RngState } from '../../core/clock/clock';
import { seedFrom, nextFloat } from '../../core/clock/clock';
import { initPedal, setPedal, speedOf, tensionOf, stepNoise, stepDrift } from '../../core/mechanics/pedal';
import type { PedalState } from '../../core/mechanics/pedal';
import {
  BEAM_LENGTH, MAX_TICK_MS, STARS3, STARS2, STAR_WIDTH3, STAR_WIDTH2, WIDTH_OK_CM, CENTER_OK_CM, OVERFLOW_CLEARANCE_CM,
  NUDGE_CM, RANGE_WIDTH, RANGE_CENTER_CM, NOISE_AMP, BEAM_DRIFT, SHIFT_VEL, SHIFT_TURN_RATE, TENSION,
} from './params';
import type { Level } from './params';

export type { Level } from './params';

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

/**
 * ビーム巻きのルール (P3 T3-01)。糸切れは起きない (管理者の指示)。
 * 張りはドラム巻きと同じ計算 (core/mechanics/pedal.ts) を使い回す。
 * 仕様書の型に、level・widthCm・patternId・tension を追加している
 * (難易度の数値と巻き幅は tick の計算に必要。報告に書く)。
 */
export interface BeamingState {
  level: Level;
  widthCm: number; // 巻き幅 (cm。目標)
  patternId: string;
  puzzleId: string;
  phase: 'setup' | 'beaming' | 'done';
  leftCm: number; rightCm: number;   // 円盤の位置(ビームの中心からの距離 cm。左は負の数)
  progress: number;                  // 巻いた割合 0〜1
  pedal: PedalState;
  tension: number; // 最後に計算した張り(描画用)
  range: { center: number; width: number };
  shiftCm: number;                   // 糸のシートの中心のずれ(cm。0 が中央)
  shiftVel: number;                  // 偏っていく向きと速さ
  okMs: number; centeredMs: number; windMs: number; // 適正な張り・中央にあった・巻いていた時間
  overflowMs: number;                // 円盤に乗り上げていた時間
  widthErrCm: number | null;         // 幅合わせを終えたときの誤差
  rng: RngState;
}
export type BeamingAction =
  | { type: 'moveFlange'; side: 'left' | 'right'; deltaCm: number } // ±1cm(ボタン)
  | { type: 'finishSetup' }          // 幅合わせを終えて巻き返しへ(誤差を記録)
  | { type: 'setPedal'; value: number }
  | { type: 'nudge'; dir: -1 | 1 }   // 寄せる。shiftCm を NUDGE_CM だけ動かす
  | { type: 'tick'; dtMs: number }
  | { type: 'pausePedal' };

/** 張りの計算のパラメータ (範囲は State のものを使う) */
function tensionParams(level: Level, range: { center: number; width: number }) {
  const min = range.center - range.width / 2;
  const max = range.center + range.width / 2;
  return { ...TENSION, noiseAmp: NOISE_AMP(level), range: { min, max } };
}

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
    pedal: initPedal(rng),
    tension: TENSION.base,
    range: { center: RANGE_CENTER_CM, width: RANGE_WIDTH(opts.level) },
    shiftCm: 0,
    shiftVel: dir * SHIFT_VEL(opts.level),
    okMs: 0,
    centeredMs: 0,
    windMs: 0,
    overflowMs: 0,
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

    case 'setPedal':
      if (s.phase !== 'beaming') return s;
      return { ...s, pedal: setPedal(s.pedal, a.value) };

    case 'nudge':
      if (s.phase !== 'beaming') return s;
      return { ...s, shiftCm: s.shiftCm + a.dir * NUDGE_CM };

    case 'tick':
      return tick(s, a.dtMs);

    case 'pausePedal':
      return { ...s, pedal: setPedal(s.pedal, 0) };
  }
}

/** tick。dtMs を MAX_TICK_MS で丸め、'beaming' で時間を進める */
function tick(s: BeamingState, dtMs: number): BeamingState {
  if (s.phase !== 'beaming') return s;
  const dtMsC = Math.min(MAX_TICK_MS, Math.max(0, dtMs));
  const dt = dtMsC / 1000; // 秒
  const tp = tensionParams(s.level, s.range);
  const dp = BEAM_DRIFT(s.level);

  // 1. ぶれ → 流れを進める (引っかかりは無い)
  let pedal = stepNoise(s.pedal, tp, dtMsC);
  pedal = stepDrift(pedal, dp, dtMsC);
  // 2. 偏りの向きをときどき変える (乱数)
  const [raw, nextRng] = nextFloat(pedal.rng);
  pedal = { ...pedal, rng: nextRng };
  let shiftVel = s.shiftVel;
  let shiftCm = s.shiftCm;
  const speed = speedOf(pedal, tp);
  if (speed > 0) {
    if (raw < SHIFT_TURN_RATE * dt) {
      shiftVel = -shiftVel;
    }
    shiftCm = s.shiftCm + shiftVel * dt;
  }
  // 3. 張りを計算して保存する
  const tension = tensionOf(pedal, tp, s.progress);
  const cur: BeamingState = { ...s, pedal, tension, shiftVel, shiftCm, rng: nextRng };
  if (speed <= 0) {
    return cur;
  }

  // 4. 巻く速さはペダルに比例。時間と張り・偏りの記録を進める
  const progress = Math.min(1, s.progress + (speed * dt) / BEAM_LENGTH);
  const windMs = s.windMs + dtMsC;
  const half = s.range.width / 2;
  const okMs = tension >= s.range.center - half && tension <= s.range.center + half ? s.okMs + dtMsC : s.okMs;
  // シートの端が円盤の内側を越えると乗り上げ (朱。出来が下がるだけ。判定は overflowSides)
  const over = overflowSides({ ...s, shiftCm });
  const overflowMs = over.left || over.right ? s.overflowMs + dtMsC : s.overflowMs;
  const centeredMs = !over.left && !over.right && Math.abs(shiftCm) <= CENTER_OK_CM ? s.centeredMs + dtMsC : s.centeredMs;
  // 5. 巻き終わったら done (糸切れは無いので止まらない)
  if (progress >= 1) {
    return { ...cur, progress: 1, windMs, okMs, centeredMs, overflowMs, phase: 'done', pedal: setPedal(cur.pedal, 0) };
  }
  return { ...cur, progress, windMs, okMs, centeredMs, overflowMs };
}

/**
 * 星 (T3-01):
 * - 星3: 幅の誤差 1cm 以内・張り 0.8 以上・偏り 0.8 以上
 * - 星2: 幅の誤差 3cm 以内・張り 0.6 以上・偏り 0.6 以上
 * - 星1: それ以外
 */
export function starsOf(s: BeamingState): 1 | 2 | 3 {
  const tensionRatio = s.windMs > 0 ? s.okMs / s.windMs : 0;
  const centerRatio = s.windMs > 0 ? s.centeredMs / s.windMs : 0;
  const err = s.widthErrCm;
  if (err !== null && err <= STAR_WIDTH3 && tensionRatio >= STARS3 && centerRatio >= STARS3) return 3;
  if (err !== null && err <= STAR_WIDTH2 && tensionRatio >= STARS2 && centerRatio >= STARS2) return 2;
  return 1;
}

/** 成績の行 (T3-01) */
export function resultLines(s: BeamingState): { label: string; value: string }[] {
  const pct = (ok: number): string => `${Math.round(s.windMs > 0 ? (ok / s.windMs) * 100 : 0)}%`;
  return [
    { label: '幅合わせの誤差', value: s.widthErrCm === null ? '—' : `${s.widthErrCm.toFixed(1)}cm` },
    { label: '適正な張り', value: pct(s.okMs) },
    { label: '中央に保てた割合', value: pct(s.centeredMs) },
    { label: '乗り上げ', value: `${(s.overflowMs / 1000).toFixed(1)}秒` },
  ];
}

/** 途中保存の形を確かめる。再開したときのペダルは controller が pausePedal で 0 にする */
export function isValidResume(x: unknown): x is BeamingState {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.phase !== 'string' || !['setup', 'beaming', 'done'].includes(o.phase)) return false;
  if (o.level !== 1 && o.level !== 2 && o.level !== 3) return false;
  for (const key of ['widthCm', 'leftCm', 'rightCm', 'progress', 'tension', 'shiftCm', 'shiftVel', 'okMs', 'centeredMs', 'windMs', 'overflowMs'] as const) {
    if (typeof o[key] !== 'number' || !Number.isFinite(o[key])) return false;
  }
  const progress = o.progress;
  if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 1) return false;
  if (o.widthErrCm !== null && typeof o.widthErrCm !== 'number') return false;
  if (typeof o.puzzleId !== 'string' || typeof o.patternId !== 'string') return false;
  if (typeof o.rng !== 'number') return false;
  if (typeof o.pedal !== 'object' || o.pedal === null) return false;
  if (typeof o.range !== 'object' || o.range === null) return false;
  const r = o.range as Record<string, unknown>;
  if (typeof r.center !== 'number' || typeof r.width !== 'number') return false;
  return true;
}
