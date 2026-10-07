import { describe, it, expect } from 'vitest';
import { itowariTutorial } from './tutorial';
import { makeFakeCtx } from '../winding/renderer.test.helpers';
import { COLORS } from '../../core/ui/tokens';

/**
 * 糸割りの遊び方のテスト (P2b T2b-04)。4ページ、大人向けの文。
 * 2ページ目は「押すだけで、はかりに載る」の形 (T2b-03 追加修正で確認役が決めた)。
 */

describe('糸割り tutorial T2b-04 (遊び方)', () => {
  it('1. 4ページある', () => {
    expect(itowariTutorial.pages).toHaveLength(4);
  });

  it('2. 文は大人向けの4つ (機械の使いどころ・箱とはかり・引っぱってかける/長さのテンキー・継ぎと失敗)。今の画面の言葉 (箱・口・テンキー・バー) で書く。古い言い方 (上の段・押して選び) は無い', () => {
    const texts = itowariTutorial.pages.map((p) => p.text);
    expect(texts[0]).toContain('糸を別のコーンに巻き返す機械');
    expect(texts[0]).toContain('コーンが足りなくなったとき');
    expect(texts[0]).toContain('そのお題で使う数だけ');
    expect(texts[1]).toContain('段ボールの箱');
    expect(texts[1]).toContain('押すと、はかりに載って重さが分かります');
    expect(texts[1]).toContain('重さ × 番手');
    expect(texts[1]).toContain('バー');
    expect(texts[2]).toContain('口へ引っぱってかけます');
    expect(texts[2]).toContain('数字を押すとテンキーが開く');
    expect(texts[2]).toContain('設定した長さで止まります');
    expect(texts[2]).toContain('要る長さを残してください');
    expect(texts[3]).toContain('2本目の糸をかけて継ぎます');
    expect(texts[3]).toContain('失敗');
    expect(texts[3]).toContain('長さを設定し直して');
    const all = texts.join('\n');
    for (const old of ['上の段', '口を押して選び', 'はかりへ引っぱる', '増減']) {
      expect(all, old).not.toContain(old);
    }
  });

  it('3. 絵が描ける (偽の Canvas でエラーにならない)', () => {
    const { ctx } = makeFakeCtx();
    for (const page of itowariTutorial.pages) {
      expect(() => page.draw(ctx, 400, 260)).not.toThrow();
    }
  });

  it('4. 絵の中の文字は 24px 以上', () => {
    const { ctx, rec } = makeFakeCtx();
    for (const page of itowariTutorial.pages) {
      page.draw(ctx, 400, 260);
    }
    const fonts = rec.ops.filter((o) => o.k === 'font' && /(\d+)px/.test(String(o.v)));
    expect(fonts.length).toBeGreaterThan(0);
    const sizes = fonts.map((o) => Number(/(\d+)px/.exec(String(o.v))![1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(24);
  });

  it('5. 絵は今の画面と同じ作り: 1 ページ目に口 (糸の丸・「長さ未設定」・メーターとはかり)、2 ページ目に段ボールの箱 3 つ・バー・はかり、3 ページ目にテンキーと「口へ引っぱる」、4 ページ目に継ぎ (+ 1,800 m) と朱の印', () => {
    const run = (i: number): { texts: string[]; fills: string[]; arcs: number } => {
      const { ctx, rec } = makeFakeCtx();
      itowariTutorial.pages[i]!.draw(ctx, 400, 260);
      return {
        texts: rec.ops.filter((o) => o.k === 'fillText').map((o) => String(o.args?.[0])),
        fills: rec.fillStyleLog,
        arcs: rec.ops.filter((o) => o.k === 'arc').length,
      };
    };
    const p1 = run(0);
    expect(p1.texts).toContain('長さ未設定');
    expect(p1.texts).toContain('メーター 0 m');
    expect(p1.arcs).toBeGreaterThan(3);
    const p2 = run(1);
    expect(p2.fills.filter((c) => c === COLORS.cardboard).length).toBeGreaterThanOrEqual(3);
    expect(p2.texts).toContain('バー');
    expect(p2.texts).toContain('はかり 500 g');
    expect(p2.texts).toContain('糸 1');
    const p3 = run(2);
    expect(p3.texts).toContain('口へ引っぱる');
    expect(p3.texts).toContain('テンキー');
    expect(p3.texts).toContain('6,000 m');
    const p4 = run(3);
    expect(p4.texts).toContain('+ 1,800 m');
    expect(p4.texts).toContain('✕ 足りない');
  });
});
