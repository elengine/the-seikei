import type { GameResult, GameProps } from '../../core/game/types';
import { starsOf, qualities, targetMsOf, lastTapResult } from './logic';
import type { WindingState, WindingAction } from './logic';

/**
 * プレイ画面のメッセージと効果音 (T2-07 追加修正a で controller.ts から分離)。
 * 文は大人向け。{{…}} は呼び出し側の render で呼び名に置き換わる。
 */

type Render = (text: string) => string;

/** 秒を「1分20秒」の形にする (T2-09a) */
export function msToText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min === 0) return `${sec}秒`;
  return `${min}分${sec}秒`;
}

/** 一度きりの案内の文 (PU-14a。メッセージ欄は無いので、盤面の中央のお知らせで出す。お題ごとに最初の 1 回)。無ければ null */
export function guideFor(phase: WindingState['phase'], render: Render): { key: string; text: string } | null {
  if (phase === 'ready') {
    return { key: 'ready', text: render('「巻き始める」を押して、{{pedal}}を右へ動かすと巻き始めます') };
  }
  if (phase === 'broken') {
    return { key: 'broken', text: render('糸が切れました。切れた糸のあたりを押して、つないでください') };
  }
  if (phase === 'cutting') {
    return { key: 'cutting', text: render('ハサミを糸の所まで引っぱって切ります') };
  }
  return null;
}

/** 操作の効果音。音の名前を返す (音なしは null) */
export function soundFor(a: WindingAction, prev: WindingState, next: WindingState): 'tap' | 'gentleNo' | 'knot' | 'stop' | null {
  if (a.type === 'tapThread') {
    const tap = lastTapResult(prev, next);
    if (tap === 'wrongThread') return 'gentleNo';
    if (tap === 'tiedOne' || tap === 'tiedAll') return 'knot';
    return null;
  }
  // 「巻き始める」などのボタンの音は、ボタンの部品 (createButton) が鳴らす
  return null; // setPedal などは音なし
}

/** 結果の GameResult (大人向けの summary つき) */
export function resultOf(s: WindingState, mode: GameProps['mode'], finishedAt: string): GameResult {
  const stars = starsOf(s);
  const qs = qualities(s);
  const total = qs.reduce((a: number, b: number) => a + b, 0);
  const okRate = Math.round((total / Math.max(1, qs.length)) * 100);
  const target = targetMsOf(s);
  return {
    gameId: 'winding',
    mode,
    stars,
    stats: { breaks: s.breaks, wrongTaps: s.wrongTaps, okRate, [`level:${s.level}`]: stars },
    unlockedPatternIds: [],
    resultLines: [
      { label: '適正な張りで巻いた割合', value: `${okRate}%` },
      { label: '巻いた時間', value: `${msToText(s.elapsedMs)}(目標 ${msToText(target)})` },
      { label: '糸切れ', value: `${s.breaks}回` },
      { label: '違う糸を押した回数', value: `${s.wrongTaps}回` },
    ],
    starHint: '適正な張りが8割以上、目標の時間内で星3です',
    summary: [
      `適正な張りで巻いた割合 ${okRate}%`,
      `巻いた時間 ${msToText(s.elapsedMs)}(目標 ${msToText(target)})`,
      `糸切れ ${s.breaks}回`,
      `違う糸を押した回数 ${s.wrongTaps}回`,
    ],
    finishedAt,
  };
}
