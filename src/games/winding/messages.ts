import type { GameResult, GameProps } from '../../core/game/types';
import { starsOf, qualities, targetMsOf } from './logic';
import type { WindingState, WindingAction } from './logic';
import { lastTapResult } from './logic';

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

/** 状態に応じたメッセージを返す */
export function messageFor(s: WindingState, prev: WindingState | undefined, next: WindingState | undefined, render: Render): string {
  if (s.phase === 'ready') {
    return render('{{pedal}}を踏むと巻き始めます。「巻き始める」を押してください');
  }
  if (s.phase === 'cutting') {
    return render('帯を巻き終えました。「帯の端を結ぶ」を押してください');
  }
  if (s.phase === 'broken') {
    const tap = prev !== undefined && next !== undefined ? lastTapResult(prev, next) : null;
    if (tap === 'wrongThread') {
      return render('その糸は切れていません');
    }
    if (tap === 'mismatch') {
      return render('その端は別の糸です。同じ糸の両端をつないでください');
    }
    if (tap === 'tiedOne' && s.brk.kind === 'broken') {
      const left = s.brk.threads.length;
      return render(`1本つながりました。あと ${left} 本です`);
    }
    if (s.brk.kind === 'broken') {
      if (s.brk.tied.length > 0 && s.brk.first === null) {
        const left = s.brk.threads.length;
        return render(`1本つながりました。あと ${left} 本です`);
      }
      if (s.brk.first !== null) {
        return render('もう一方の切れ端を押してください');
      }
    }
    return render('糸が切れました。切れた糸を探して、つないでください');
  }
  if (s.phase === 'winding') {
    // 引っかかりは、張りのメッセージより先に出す。引っかかりが戻りきるまで (最大2秒) 出し続ける
    if (s.pedal.snag > 0) {
      return render('糸が引っかかりました。張りに注意してください');
    }
    if (s.tension > s.range.max) {
      return render('張りが強すぎます。{{pedal}}を戻してください');
    }
    if (s.tension < s.range.min) {
      return render('張りが弱めです');
    }
    return render('適正な張りです');
  }
  // done
  return render('完成しました');
}

/** 操作の効果音。音の名前を返す (音なしは null) */
export function soundFor(a: WindingAction, prev: WindingState, next: WindingState): 'tap' | 'gentleNo' | 'knot' | 'stop' | null {
  if (a.type === 'tapEnd') {
    const tap = lastTapResult(prev, next);
    if (tap === 'wrongThread') return 'gentleNo';
    if (tap === 'mismatch') return 'gentleNo';
    if (tap === 'first') return 'tap';
    if (tap === 'tiedOne' || tap === 'tiedAll') return 'knot';
    return null;
  }
  if (a.type === 'start') {
    return 'tap';
  }
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
    summary: [
      `適正な張りで巻いた割合 ${okRate}%`,
      `巻いた時間 ${msToText(s.elapsedMs)}(目標 ${msToText(target)})`,
      `糸切れ ${s.breaks}回`,
      `違う糸を押した回数 ${s.wrongTaps}回`,
      `違う端を結ぼうとした回数 ${s.mismatches}回`,
    ],
    finishedAt,
  };
}
