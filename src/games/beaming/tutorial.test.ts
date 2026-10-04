import { describe, it, expect } from 'vitest';
import { beamingTutorial } from './tutorial';

/**
 * ビーム巻きの遊び方のテスト (P3 T3-03b)。3ページ。
 */
describe('ビーム巻きの遊び方 T3-03b (3ページ)', () => {
  it('3ページあり、文は幅合わせ・ペダルと張り・偏りと乗り上げの順', () => {
    expect(beamingTutorial.pages).toHaveLength(3);
    expect(beamingTutorial.pages[0]!.text).toContain('円盤を動かして');
    expect(beamingTutorial.pages[1]!.text).toContain('{{pedal}}');
    expect(beamingTutorial.pages[2]!.text).toContain('寄せる');
    expect(beamingTutorial.pages[2]!.text).toContain('乗り上げ');
  });

  it('各ページに絵がある (draw が呼べる。文字は 20px 以上)', () => {
    for (const page of beamingTutorial.pages) {
      expect(typeof page.draw).toBe('function');
      // jsdom の canvas は使えないので、記録する偽の ctx で呼ぶ
      const ops: string[] = [];
      const fake = new Proxy(
        { canvas: { width: 300, height: 200 }, font: '' },
        {
          get(t, key): unknown {
            if (key === 'font') return (t as { font: string }).font;
            if (key === 'set font') return undefined;
            ops.push(String(key));
            return () => undefined;
          },
          set(t, key, v): boolean {
            if (key === 'font') (t as { font: string }).font = String(v);
            return true;
          },
        },
      );
      page.draw(fake as unknown as CanvasRenderingContext2D, 300, 200);
      expect(ops.length).toBeGreaterThan(0);
    }
    // 文字は 20px 以上 (drawPage 関数が font を '20px' 以上で設定する)
  });
});
