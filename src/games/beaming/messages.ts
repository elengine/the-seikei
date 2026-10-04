import type { GameResult, GameProps } from '../../core/game/types';
import { starsOf, resultLines } from './logic';
import type { BeamingState } from './logic';

/**
 * ビーム巻きの結果 (P3 T3-03a)。メッセージ欄は PU-15c で無くなった。
 * ビーム巻きでは糸切れは起きない (管理者の指示)。張りと偏りで品質が下がるだけ。
 */

/** 秒を「1分20秒」の形にする */
export function msToText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min === 0) return `${sec}秒`;
  return `${min}分${sec}秒`;
}

/** 結果の GameResult (大人向けの summary つき) */
export function resultOf(s: BeamingState, mode: GameProps['mode'], finishedAt: string): GameResult {
  const stars = starsOf(s);
  const lines = resultLines(s);
  return {
    gameId: 'beaming',
    mode,
    stars,
    stats: { [`level:${s.level}`]: stars },
    unlockedPatternIds: [],
    resultLines: lines,
    starHint: '幅の誤差1cm以内、張りと中央がそれぞれ8割以上で星3です',
    summary: lines.map((l) => `${l.label} ${l.value}`),
    finishedAt,
  };
}
