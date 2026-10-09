import { describe, it, expect } from 'vitest';
import { gameStatusText } from './homeCards';
import { getContent } from '../../core/content/content';
import { windingPuzzles } from '../../games/winding/puzzles';
import { beamingPuzzles } from '../../games/beaming/puzzles';
import { itowariPuzzles } from '../../games/itowari/puzzles';

describe('PU-34: スタート画面のカードの状態の文字 (お題 N)', () => {
  it('winding は「お題 N」(N はドラム巻きのお題の数)。「初級」の字は無い (PU-03a のときの「初級・中級・上級」から変える)', () => {
    const t = gameStatusText('winding');
    expect(t).toBe(`お題 ${windingPuzzles(getContent()).length}`);
    expect(t).not.toContain('初級');
  });

  it('ほかのゲームも「お題 N」で、N はそれぞれのゲームのお題の数', () => {
    expect(gameStatusText('creel')).toBe(`お題 ${getContent().creelPuzzles.length}`);
    expect(gameStatusText('beaming')).toBe(`お題 ${beamingPuzzles(getContent()).length}`);
    expect(gameStatusText('itowari')).toBe(`お題 ${itowariPuzzles(getContent()).length}`);
  });

  it('drumsetup: お題の一覧を返す関数が無いので今のまま (クリール立てと同じ数。PU-34 の規則 2)', () => {
    expect(gameStatusText('drumsetup')).toBe(`お題 ${getContent().creelPuzzles.length}`);
  });
});
