import { describe, it, expect } from 'vitest';
import { drumsetupTutorial } from './tutorial';
import { makeFakeCtx } from '../winding/renderer.test.helpers';

describe('drumsetup tutorial T2c-03b (遊び方)', () => {
  it('1. 4ページある', () => {
    expect(drumsetupTutorial.pages).toHaveLength(4);
  });

  it('2. 文は大人向けの4つ (設定・厚み・式と電卓・試し巻き)', () => {
    const texts = drumsetupTutorial.pages.map((p) => p.text);
    expect(texts[0]).toContain('羽の角度と、1回転で帯を横に送る量');
    expect(texts[1]).toContain('1回転ごとに少し太ります');
    expect(texts[1]).toContain('本数÷幅');
    expect(texts[2]).toContain('厚み ÷ tan');
    expect(texts[2]).toContain('電卓');
    expect(texts[3]).toContain('試し巻き');
    expect(texts[3]).toContain('潰れ');
    expect(texts[3]).toContain('崩れ');
  });

  it('3. 絵が描ける (偽の Canvas でエラーにならない)', () => {
    const { ctx } = makeFakeCtx();
    for (const page of drumsetupTutorial.pages) {
      expect(() => page.draw(ctx, 300, 200)).not.toThrow();
    }
  });
});
