import type { DrumSetupPuzzle } from './puzzles';
import {
  ALLOWED_ANGLES, YARN_COEF, STAR3_ERR, STAR2_ERR, FEED_MAX,
} from './params';

/** 小数第2位に丸める */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 正しい値(角度ごと): 密度 本/cm = 本数 ÷ 幅cm */
export function density(p: DrumSetupPuzzle): number {
  return p.ends / p.widthCm;
}

/** 厚み h mm = 密度 × 糸の厚みの係数 */
export function thicknessPerTurn(p: DrumSetupPuzzle): number {
  return density(p) * YARN_COEF[p.grade];
}

/** 送り量 s mm = h ÷ tan(角度)。小数第2位に丸める */
export function correctFeed(p: DrumSetupPuzzle, angleDeg: number): number {
  return round2(thicknessPerTurn(p) / Math.tan((angleDeg * Math.PI) / 180));
}

export type TrialOutcome = 'good' | 'crush' | 'collapse' | 'badAngle';

export interface TrialResult {
  outcome: TrialOutcome;
  /** 誤差の割合 (feed − 正しい値) ÷ 正しい値 */
  errRatio: number;
  /** 正しい送り量 mm */
  correct: number;
  stars: 1 | 2 | 3;
}

/** 試し巻きの判定 (T2c-01) */
export function judge(p: DrumSetupPuzzle, angle: number | null, feed: number): TrialResult {
  const allowed = angle !== null ? ALLOWED_ANGLES[p.grade] : undefined;
  if (angle === null || allowed === undefined || !allowed.includes(angle)) {
    return { outcome: 'badAngle', errRatio: 0, correct: 0, stars: 1 };
  }
  const correct = correctFeed(p, angle);
  const errRatio = (feed - correct) / correct;
  const abs = Math.abs(errRatio);
  if (abs <= STAR3_ERR) {
    return { outcome: 'good', errRatio, correct, stars: 3 };
  }
  if (abs <= STAR2_ERR) {
    return { outcome: errRatio < 0 ? 'crush' : 'collapse', errRatio, correct, stars: 2 };
  }
  return { outcome: errRatio < 0 ? 'crush' : 'collapse', errRatio, correct, stars: 1 };
}

export interface DrumSetupState {
  puzzleId: string;
  /** 選んだ羽の角度(未選択は null) */
  angle: number | null;
  /** 合わせた送り量 mm(0〜FEED_MAX、小数第2位) */
  feed: number;
  /** 試し巻きの回数 */
  trials: number;
  phase: 'setting' | 'trial' | 'done';
  lastResult: TrialResult | null;
}

export type DrumSetupAction =
  | { type: 'selectAngle'; angle: number }
  | { type: 'stepFeed'; delta: number } // ±0.01・±0.1。0〜FEED_MAX に収める。小数第2位に丸める
  | { type: 'setFeed'; value: number }
  | { type: 'trial' } // 試し巻き → phase 'trial'、結果を決める
  | { type: 'trialEnd' } // 試し巻きの絵が終わった → 星3なら 'done'、それ以外は 'setting' に戻る
  | { type: 'finish' } // 「ここで終える」→ 星3でなくても done (T2c-03 の画面が呼ぶ)
  | { type: 'retry' }; // 'done' からもう一度

/** 新しいゲームの状態。角度は未選択、送り量 0 */
export function init(p: DrumSetupPuzzle): DrumSetupState {
  return {
    puzzleId: p.id,
    angle: null,
    feed: 0,
    trials: 0,
    phase: 'setting',
    lastResult: null,
  };
}

/** 元の s は変更しない */
export function reduce(s: DrumSetupState, p: DrumSetupPuzzle, a: DrumSetupAction): DrumSetupState {
  switch (a.type) {
    case 'selectAngle':
      if (s.phase !== 'setting') return s;
      return { ...s, angle: a.angle };
    case 'stepFeed': {
      if (s.phase !== 'setting') return s;
      const next = Math.min(FEED_MAX, Math.max(0, round2(s.feed + a.delta)));
      return { ...s, feed: next };
    }
    case 'setFeed': {
      if (s.phase !== 'setting') return s;
      const next = Math.min(FEED_MAX, Math.max(0, round2(a.value)));
      return { ...s, feed: next };
    }
    case 'trial': {
      if (s.phase !== 'setting' || s.angle === null) return s; // 角度が未選択のときは何もしない
      return { ...s, phase: 'trial', trials: s.trials + 1, lastResult: judge(p, s.angle, s.feed) };
    }
    case 'trialEnd': {
      if (s.phase !== 'trial') return s;
      if (s.lastResult !== null && s.lastResult.stars === 3) {
        return { ...s, phase: 'done' };
      }
      return { ...s, phase: 'setting' };
    }
    case 'finish': {
      if (s.phase === 'done') return s;
      return { ...s, phase: 'done' };
    }
    case 'retry': {
      if (s.phase !== 'done') return s;
      return init(p);
    }
  }
}

/**
 * 試し巻きで、回転 k(0〜turns)までの帯の断面の形。各回転の層の左端の x(mm)と高さ(mm)の並び。
 * 層 k の左端の x = k × 送り量、高さ y = k × 厚み。判定はしない (絵のために点の並びを返すだけ。T2c-02 が使う)。
 */
export function trialLayers(
  p: DrumSetupPuzzle,
  angle: number,
  feed: number,
  turns: number,
): { x: number; y: number }[] {
  const h = thicknessPerTurn(p);
  const layers: { x: number; y: number }[] = [];
  for (let k = 0; k <= turns; k++) {
    layers.push({ x: round2(k * feed), y: k * h });
  }
  return layers;
}
