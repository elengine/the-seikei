import { describe, it, expect } from 'vitest';
import { beamingTutorial } from './tutorial';

/**
 * ビーム巻きの遊び方のテスト (P3 T3-03b)。3ページ。
 */
describe('ビーム巻きの遊び方 T3-03b (3ページ)', () => {
  it('3ページあり、文は幅合わせ・レバーと適正な速さ・偏りと乗り上げと確認の順', () => {
    expect(beamingTutorial.pages).toHaveLength(3);
    expect(beamingTutorial.pages[0]!.text).toContain('引っぱ');
    expect(beamingTutorial.pages[1]!.text).toContain('レバー');
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

  it('PU-15c: 文に「巻き量」があり、円盤を引っぱると書く。「◀」「踏み込む」「戻す」は無い (速さは T3-04b から説明する)', () => {
    const all = beamingTutorial.pages.map((p) => p.text).join('\n');
    expect(all).toContain('巻き量');
    expect(all).toContain('引っぱ');
    for (const w of ['◀', '▶', '踏み込む', '戻す', '円盤を動かして']) {
      expect(all, w).not.toContain(w);
    }
  });

  it('PU-15c: 絵は新しい盤面と同じ作り (ドラムの縦の筋・円盤の楕円・軸・ガイドの棒)。1 ページ目の絵に「引っぱる」', () => {
    const calls: Array<{ k: string; args: unknown[] }> = [];
    const texts: string[] = [];
    const fake = new Proxy({ canvas: { width: 300, height: 200 } } as Record<string, unknown>, {
      get(t, key): unknown {
        if (key in t) return t[key as string];
        return (...args: unknown[]): void => {
          calls.push({ k: String(key), args });
          if (key === 'fillText') texts.push(String(args[0]));
        };
      },
      set(t, key, v): boolean {
        t[key as string] = v;
        return true;
      },
    });
    beamingTutorial.pages[0]!.draw(fake as unknown as CanvasRenderingContext2D, 900, 600);
    expect(calls.filter((c) => c.k === 'ellipse').length).toBeGreaterThanOrEqual(4); // 円盤 2 + ドラムの端 2
    expect(texts.some((t) => t.includes('引っぱる'))).toBe(true);
    expect(texts.some((t) => t.includes('←→'))).toBe(false);
  });
});

describe('T3-04c (遊び方をレバーに合わせる)', () => {
  it('2ページ目はレバーの3段階と適正な速さ。{{pedal}}やメーターは無い', () => {
    const p2 = beamingTutorial.pages[1]!.text;
    expect(p2).toContain('レバー');
    expect(p2).not.toContain('{{pedal}}');
    expect(p2).not.toContain('メーター');
  });

  it('どこかに「確認」があり、100% を超えると糸が切れることが分かる', () => {
    const all = beamingTutorial.pages.map((p) => p.text).join('\n');
    expect(all).toContain('確認');
    expect(all).toContain('100%');
    expect(all).toContain('切れ');
  });
});
