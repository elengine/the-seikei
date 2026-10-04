import { describe, it, expect } from 'vitest';
import { itowariTutorial } from './tutorial';
import { makeFakeCtx } from '../winding/renderer.test.helpers';

/**
 * 糸割りの遊び方のテスト (P2b T2b-04)。4ページ、大人向けの文。
 * 2ページ目は「押すだけで、はかりに載る」の形 (T2b-03 追加修正で確認役が決めた)。
 */

describe('糸割り tutorial T2b-04 (遊び方)', () => {
  it('1. 4ページある', () => {
    expect(itowariTutorial.pages).toHaveLength(4);
  });

  it('2. 文は大人向けの4つ (機械の使いどころ・かけるとはかり・長さの設定と巻き・継ぎと失敗)', () => {
    const texts = itowariTutorial.pages.map((p) => p.text);
    expect(texts[0]).toContain('糸を別のコーンに巻き返す機械');
    expect(texts[0]).toContain('コーンが足りなくなったとき');
    expect(texts[1]).toContain('箱から上の段へ引っぱってかけます');
    expect(texts[1]).toContain('押すと、はかりに載って重さが分かります');
    expect(texts[1]).toContain('重さ × 番手');
    expect(texts[1]).not.toContain('はかりへ引っぱる'); // 「押すだけ」の形に統一
    expect(texts[2]).toContain('口を押して選び');
    expect(texts[2]).toContain('設定した長さで止まります');
    expect(texts[2]).toContain('要る長さを残してください');
    expect(texts[3]).toContain('2本目の糸をかけて継ぎます');
    expect(texts[3]).toContain('失敗');
    expect(texts[3]).toContain('長さを設定し直して');
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
});
