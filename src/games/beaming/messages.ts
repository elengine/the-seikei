import type { GameResult, GameProps } from '../../core/game/types';
import { starsOf, resultLines } from './logic';
import type { BeamingState } from './logic';
import { OVERFLOW_CLEARANCE_CM } from './params';

/**
 * ビーム巻きのプレイ画面のメッセージと結果 (P3 T3-03a)。
 * 文は大人向け。{{…}} は呼び出し側の render で呼び名に置き換わる。
 * ビーム巻きでは糸切れは起きない (管理者の指示)。張りと偏りで品質が下がるだけ。
 */

type Render = (text: string) => string;

/** 秒を「1分20秒」の形にする */
export function msToText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min === 0) return `${sec}秒`;
  return `${min}分${sec}秒`;
}

/** 状態に応じたメッセージを返す。乗り上げ > 偏り > 張り の順で出す */
export function messageFor(s: BeamingState, render: Render): string {
  if (s.phase === 'setup') {
    return render('円盤を動かして、巻き幅に合わせてください');
  }
  if (s.phase === 'beaming') {
    const half = s.widthCm / 2;
    if (s.shiftCm - half < s.leftCm - OVERFLOW_CLEARANCE_CM) {
      return render('左の円盤に乗り上げています');
    }
    if (s.shiftCm + half > s.rightCm + OVERFLOW_CLEARANCE_CM) {
      return render('右の円盤に乗り上げています');
    }
    if (s.shiftCm > 1.5) {
      return render('糸が右に寄っています。寄せてください');
    }
    if (s.shiftCm < -1.5) {
      return render('糸が左に寄っています。寄せてください');
    }
    if (s.tension > s.range.center + s.range.width / 2) {
      return render('張りが強すぎます。{{pedal}}を戻してください');
    }
    if (s.tension < s.range.center - s.range.width / 2) {
      return render('張りが弱めです');
    }
    return render('適正な張りです');
  }
  // done
  return render('完成しました');
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
