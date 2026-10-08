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
  // 失敗 (糸切れ) は星なし (starsOf 0)。GameResult の形は 1〜3 なので、
  // 失敗の画面は題名と成績の行で分かるようにする (T3-04c)。
  const starsFor = stars === 0 ? 1 : stars;
  const lines = resultLines(s);
  return {
    gameId: 'beaming',
    mode,
    stars: starsFor,
    stats: { [`level:${s.level}`]: starsFor },
    unlockedPatternIds: [],
    resultLines: lines,
    starHint: '適正な速さ8割以上・止めた位置99%以上・微調整2回以下・幅1cm以内で星3です',
    summary: lines.map((l) => `${l.label} ${l.value}`),
    finishedAt,
  };
}
