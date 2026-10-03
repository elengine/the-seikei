import type { GameResult, GameProps } from '../../core/game/types';
import type { DrumSetupState, DrumSetupAction } from './logic';
import { density, thicknessPerTurn, correctFeed, judge } from './logic';
import type { DrumSetupPuzzle } from './puzzles';

/**
 * ドラム設定のメッセージと効果音と結果 (T2c-03a)。文は大人向け。
 */

type Render = (text: string) => string;

/** 状態に応じたメッセージを返す */
export function messageFor(s: DrumSetupState, render: Render): string {
  if (s.phase === 'trial') {
    return render('試し巻きをしています');
  }
  if (s.phase === 'done') {
    return render('設定できました');
  }
  // setting。試し巻きの結果があれば、その文を出し続ける (やり直しのときも分かるように)
  const r = s.lastResult;
  if (r !== null) {
    if (r.outcome === 'crush') {
      return render('潰れました。送り量が少なすぎます');
    }
    if (r.outcome === 'collapse') {
      return render('崩れました。送り量が多すぎます');
    }
    if (r.outcome === 'badAngle') {
      return s.angle === null ? render('羽の角度を選んでください') : render('その糸には、この角度は使えません');
    }
    return render('きれいに登りました。このままで大丈夫です');
  }
  if (s.angle === null) {
    return render('羽の角度を選んで、送り量を合わせてください');
  }
  return render('送り量を合わせて「試し巻き」を押してください');
}

/** 操作の効果音。試し巻きの始まりと終わり (音の名前を返す。音なしは null) */
export function soundFor(a: DrumSetupAction, prev: DrumSetupState, next: DrumSetupState): 'tap' | 'ok' | 'gentleNo' | null {
  if (a.type === 'trial' && next.phase === 'trial') {
    return 'tap';
  }
  if (a.type === 'trialEnd') {
    return next.phase === 'done' ? 'ok' : 'gentleNo';
  }
  return null;
}

/** 結果の GameResult (答え合わせの「正しい計算」を含む) */
export function resultOf(s: DrumSetupState, p: DrumSetupPuzzle, mode: GameProps['mode'], finishedAt: string): GameResult {
  const judged = judge(p, s.angle, s.feed);
  const stars = s.lastResult !== null && s.phase === 'done' ? s.lastResult.stars : judged.stars;
  const correct = correctFeed(p, s.angle !== null ? s.angle : 9);
  const dens = density(p);
  const thick = thicknessPerTurn(p);
  const lines = [
    { label: '羽の角度', value: s.angle !== null ? `${s.angle}°` : '未選択' },
    { label: '送り量', value: `${s.feed.toFixed(2)}mm(正しい値 ${correct.toFixed(2)}mm)` },
    { label: '試し巻きの回数', value: `${s.trials}回` },
    { label: '正しい計算 密度', value: `${Math.round(dens * 100) / 100}本/cm` },
    { label: '正しい計算 1回転の厚み', value: `${thick.toFixed(3)}mm` },
    { label: '正しい計算 送り量', value: `${correct.toFixed(2)}mm` },
  ];
  return {
    gameId: 'drumsetup',
    mode,
    stars,
    stats: { [`puzzle:${p.id}`]: stars, trials: s.trials },
    unlockedPatternIds: [],
    resultLines: lines,
    starHint: '送り量の誤差が5%以内で星3です',
    summary: lines.map((l) => `${l.label} ${l.value}`),
    finishedAt,
  };
}
