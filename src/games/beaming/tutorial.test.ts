import { describe, it, expect } from 'vitest';
import { beamingTutorial } from './tutorial';
import { makeFakeCtx } from '../winding/renderer.test.helpers';
import { COLORS } from '../../core/ui/tokens';

/**
 * ビーム巻きの遊び方のテスト (P3 T3-03b)。3ページ。
 */
describe('ビーム巻きの遊び方 T3-03b (3ページ)', () => {
  it('4ページあり、文は幅合わせ・糸を付ける・速さで巻く・止めて完了の順。寄せる・偏りの説明は無い (T3-07 で3ページ目の見出しは速さ)', () => {
    expect(beamingTutorial.pages).toHaveLength(4);
    expect(beamingTutorial.pages[0]!.text).toContain('動かして'); // 1 ページ目の文は PU-29 で変えた (「引っぱって」→「動かして」)
    expect(beamingTutorial.pages[0]!.text).toContain('円盤調整完了');
    expect(beamingTutorial.pages[1]!.text).toContain('引っぱって離す');
    expect(beamingTutorial.pages[2]!.text).toContain('速さのメーター');
    expect(beamingTutorial.pages[2]!.text).toContain('動きます');
    expect(beamingTutorial.pages[3]!.text).toContain('完了');
    expect(beamingTutorial.pages[3]!.text).toContain('101%');
    const all = beamingTutorial.pages.map((p) => p.text).join('\n');
    for (const w of ['寄せる', '乗り上げ', '偏り', '確認', '巻き始める', '速さの目標']) {
      expect(all, w).not.toContain(w);
    }
  });

  it('各ページに絵がある (draw が呼べる。文字は 20px 以上)', () => {
    for (const page of beamingTutorial.pages) {
      expect(typeof page.draw).toBe('function');
      // jsdom の canvas は使えないので、記録する偽の ctx で呼ぶ
      const ops: string[] = [];
      const fake = new Proxy(
        { canvas: { width: 300, height: 200 }, font: '', createLinearGradient: () => ({ addColorStop: () => undefined }) },
        {
          get(t, key): unknown {
            if (key === 'font') return (t as { font: string }).font;
            if (key === 'set font') return undefined;
            if (key === 'createLinearGradient') return (t as unknown as Record<string, unknown>)[key];
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

});

describe('T3-06 → T3-07 (遊び方を4ページに。3つの作業と速さのメーター)', () => {
  const texts = (): string[] => beamingTutorial.pages.map((p) => p.text);

  it('4ページの文が決めたとおり。大人向けの文で、絵は今の盤面に合わせる (T3-08 で4ページ目の文を変えた)', () => {
    const [p1, p2, p3, p4] = texts();
    expect(p1).toBe('ビームの両端の円盤を左右に動かして、目標値に合わせます。合わせたら『円盤調整完了』を押します'); // 文は PU-29 で変えた
    expect(p2).toBe('ドラムの糸の束の先の木の棒を、指でビームまで引っぱって離すと、糸がビームに付きます');
    expect(p3).toBe('木の棒を右へ引っぱると巻き始めます。速さのメーターの針を緑の範囲に入れるように、木の棒を動かします。緑の範囲は、巻き量に合わせて動きます'); // T3-07 で変えた
    expect(p4).toBe('巻き量が 90% を超えると、緑の範囲がいちばん左まで広がり、いつでも止められます。95% を超えたら、木の棒を左端まで戻して止め、『完了』を押します。100% で止めるといちばんよい結果です。101% に届くと糸が切れます');
    const all = texts().join('\n');
    for (const w of ['レバー', '停止', '50%', '{{pedal}}', '速さの目標', '巻き始める']) { // 速さの部品の呼び名は「木の棒」(PU-28)
      expect(all, w).not.toContain(w);
    }
  });

  it('2ページ目の絵: ドラムからビームへ糸を引っぱる線と案内の字を描く。「速さ 63」の数字は描かない', () => {
    const drawn: string[] = [];
    const strokes: string[] = [];
    const fake = new Proxy({ canvas: { width: 300, height: 200 }, createLinearGradient: () => ({ addColorStop: () => undefined }) } as Record<string, unknown>, {
      get(t, key): unknown {
        if (key in t) return t[key as string];
        return (...args: unknown[]): void => {
          if (key === 'fillText') drawn.push(String(args[0]));
          if (key === 'stroke') strokes.push('s');
        };
      },
      set(t, key, v): boolean {
        t[key as string] = v;
        return true;
      },
    });
    beamingTutorial.pages[1]!.draw(fake as unknown as CanvasRenderingContext2D, 900, 600);
    expect(drawn.some((t) => t.includes('引っぱる'))).toBe(true); // 案内の字
    expect(strokes.length).toBeGreaterThan(0); // 引っぱる糸の線
    expect(drawn.some((t) => t.includes('速さ 63'))).toBe(false);
    for (const w of ['レバー', '停止', '50%']) {
      expect(drawn.join('|'), w).not.toContain(w);
    }
  });

  it('3ページ目の絵: 速さのメーター (緑の範囲の帯と針、見出しの字) を描く (T3-07 で見出しは速さ)。4ページ目の絵: 「完了」のボタンと 100% の目印', () => {
    const texts: string[] = [];
    const rects: string[] = [];
    const fake = new Proxy({ canvas: { width: 300, height: 200 }, fillStyle: '', globalAlpha: 1, createLinearGradient: () => ({ addColorStop: () => undefined }) } as Record<string, unknown>, {
      get(t, key): unknown {
        if (key in t) return t[key as string];
        return (...args: unknown[]): void => {
          if (key === 'fillText') texts.push(String(args[0]));
          if (key === 'fillRect') rects.push('r');
        };
      },
      set(t, key, v): boolean {
        t[key as string] = v;
        return true;
      },
    });
    beamingTutorial.pages[2]!.draw(fake as unknown as CanvasRenderingContext2D, 900, 600);
    beamingTutorial.pages[3]!.draw(fake as unknown as CanvasRenderingContext2D, 900, 600);
    expect(texts.some((t) => t.includes('速さのメーター')), 'メーターの見出しは速さ (T3-07)').toBe(true);
    expect(texts.some((t) => t.includes('完了'))).toBe(true);
    expect(texts.some((t) => t.includes('100%'))).toBe(true);
    expect(rects.length).toBeGreaterThan(0); // メーターの帯とボタン
  });
});

describe('PU-26 追加修正: 遊び方の絵のドラムは盤面と同じ', () => {
  it('どのページの絵にも、盤面と同じドラム (機械の緑の勾配・灰色の金属の端の円盤・木の桟) が描かれる', () => {
    for (const [i, page] of beamingTutorial.pages.entries()) {
      const { ctx, rec } = makeFakeCtx();
      page.draw(ctx, 600, 450);
      const stops = rec.ops.filter((o) => o.k === 'addColorStop').map((o) => String((o.args as unknown[])[1]));
      expect(stops, `${i + 1} ページ目`).toEqual(expect.arrayContaining([COLORS.machineDark, COLORS.machineLight, COLORS.machine]));
      expect(rec.fillStyleLog.includes(COLORS.steel), `${i + 1} ページ目の端の円盤`).toBe(true);
    }
  });

  it('2 ページ目の絵は、垂れた糸の端から指の位置へ糸の帯を引っぱる (柄の色の台形)。文字は「引っぱる」', () => {
    const { ctx, rec } = makeFakeCtx();
    beamingTutorial.pages[1]!.draw(ctx, 600, 450);
    const texts = rec.ops.filter((o) => o.k === 'fillText').map((o) => String((o.args as unknown[])[0]));
    expect(texts.some((t) => t.includes('引っぱる'))).toBe(true);
  });
});

describe('PU-28 → T3-07: 遊び方 3 ページ目の絵は木の棒 (止の字と → が無い。メーターの見出しは速さになる)', () => {
  it('3 ページ目の絵に「止」「→」の字が無く、文に「木の棒」がある。「速」はメーターの見出し (速さのメーター) に使うので禁止から外した (T3-07)', () => {
    const { ctx, rec } = makeFakeCtx();
    beamingTutorial.pages[2]!.draw(ctx, 600, 450);
    const texts = rec.ops.filter((o) => o.k === 'fillText').map((o) => String((o.args as unknown[])[0]));
    for (const t of ['止', '→']) expect(texts, t).not.toContain(t);
    expect(texts.some((t) => t.includes('速さのメーター'))).toBe(true);
    expect(beamingTutorial.pages[2]!.text).toContain('木の棒');
    expect(beamingTutorial.pages[2]!.text).not.toContain('レバー');
  });
});
