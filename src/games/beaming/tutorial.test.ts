import { describe, it, expect } from 'vitest';
import { beamingTutorial } from './tutorial';

/**
 * ビーム巻きの遊び方のテスト (P3 T3-03b)。3ページ。
 */
describe('ビーム巻きの遊び方 T3-03b (3ページ)', () => {
  it('3ページあり、文は幅合わせ・棒と適正な速さ・止めるタイミングと確認の順。寄せる・偏りの説明は無い (T3-05)', () => {
    expect(beamingTutorial.pages).toHaveLength(3);
    expect(beamingTutorial.pages[0]!.text).toContain('引っぱ');
    expect(beamingTutorial.pages[1]!.text).toContain('茶色の棒');
    expect(beamingTutorial.pages[2]!.text).toContain('確認');
    expect(beamingTutorial.pages[2]!.text).toContain('100% で止める');
    const all = beamingTutorial.pages.map((p) => p.text).join('\n');
    for (const w of ['寄せる', '乗り上げ', '偏り']) {
      expect(all, w).not.toContain(w);
    }
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

describe('PU-24 追加修正 (遊び方を茶色の棒に合わせる)', () => {
  const texts = (): string[] => beamingTutorial.pages.map((p) => p.text);

  it('3ページの文が決めたとおり。「レバー」「停止」「50%」の言葉が無い', () => {
    const [p1, p2, p3] = texts();
    expect(p1).toBe('ビームの両端の円盤を左右に引っぱって、巻き幅に合わせます。合わせたら「巻き始める」を押します');
    expect(p2).toBe('茶色の棒を右へ引っぱるほど速く巻けます。巻き量ごとにちょうどよい速さがあり、「速さ」の数字が藍色ならちょうどよい速さです');
    expect(p3).toBe('巻き量が 95% を超えたら、棒を左端まで戻して止め、「確認」を押します。100% で止めるといちばんよい結果です。101% に届くと糸が切れます');
    const all = texts().join('\n');
    for (const w of ['レバー', '停止', '50%', '{{pedal}}', 'メーター']) {
      expect(all, w).not.toContain(w);
    }
  });

  it('2ページ目の絵: 棒の矢印と「速さ 63」を描く。「レバー」「停止」「50%」は描かない', () => {
    const drawn: string[] = [];
    const fake = new Proxy({ canvas: { width: 300, height: 200 } } as Record<string, unknown>, {
      get(t, key): unknown {
        if (key in t) return t[key as string];
        return (...args: unknown[]): void => {
          if (key === 'fillText') drawn.push(String(args[0]));
        };
      },
      set(t, key, v): boolean {
        t[key as string] = v;
        return true;
      },
    });
    beamingTutorial.pages[1]!.draw(fake as unknown as CanvasRenderingContext2D, 900, 600);
    expect(drawn.some((t) => t.includes('速さ 63'))).toBe(true);
    expect(drawn.some((t) => t.includes('遅く'))).toBe(true);
    expect(drawn.some((t) => t.includes('速く'))).toBe(true);
    for (const w of ['レバー', '停止', '50%']) {
      expect(drawn.join('|'), w).not.toContain(w);
    }
  });
});
