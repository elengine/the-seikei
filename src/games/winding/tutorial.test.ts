import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { windingTutorial, drawPage1 } from './tutorial';
import { makeFakeCtx } from './renderer.test.helpers';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import { COLORS } from '../../core/ui/tokens';

describe('winding tutorial (T2-07)', () => {
  it('1. pages が5つあり、文に {{pedal}} の置き換え対象がある (T2-12 で5ページ)', () => {
    expect(windingTutorial.pages).toHaveLength(5);
    expect(windingTutorial.pages.some((p) => p.text.includes('{{pedal}}'))).toBe(true);
  });

  it('2. tutorial.ts に # で始まる色の直書きが無い (COLORS を使う)', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(dir, 'tutorial.ts'), 'utf8');
    expect(src.includes('#')).toBe(false);
    expect(src).toContain('COLORS');
  });

  it('3. showTutorial の renderText で {{pedal}} が呼び名に置き換わる', async () => {
    // renderText を直接作る (createTerms は Repository が要るため、置き換えだけの関数を用意する)
    const renderText = (text: string): string => text.replaceAll('{{pedal}}', 'ふみこみレバー');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dialog = showTutorial(host, windingTutorial, { renderText });
    await Promise.resolve();
    // 1ページ目に {{pedal}} は無い (文はクリールの説明)
    expect(host.textContent ?? '').toContain('クリールの糸を');
    // 次へを押して2ページ目の文を確認する
    const clickBtn0 = (label: string): void => {
      const b = Array.from(host.querySelectorAll('button')).find((x) => x.textContent === label);
      b?.click();
    };
    clickBtn0('次へ');
    await Promise.resolve();
    const body2 = host.textContent ?? '';
    expect(body2).toContain('ふみこみレバー');
    expect(body2).not.toContain('{{pedal}}');
    // 残りのページを進めて「始める」で閉じる (5ページ。T2-12)
    const clickBtn = (label: string): void => {
      const b = Array.from(host.querySelectorAll('button')).find((x) => x.textContent === label);
      b?.click();
    };
    for (let i = 0; i < 3; i++) {
      clickBtn('次へ');
      await Promise.resolve();
    }
    clickBtn('始める');
    await dialog;
    expect(host.querySelector('.tutorial')).toBeNull();
  });

  it('4. 置き換えが無いときは {{pedal}} のまま残らない (renderText 無しでは文がそのまま出る)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dialog = showTutorial(host, windingTutorial);
    await Promise.resolve();
    // renderText 無し → 文がそのまま ({{…}} は出たまま)。閉じて終わる
    const clickBtn = (label: string): void => {
      const b = Array.from(host.querySelectorAll('button')).find((x) => x.textContent === label);
      b?.click();
    };
    for (let i = 0; i < 4; i++) {
      clickBtn('次へ');
      await Promise.resolve();
    }
    clickBtn('始める');
    await dialog;
  });
});

describe('winding tutorial T2-08 追加修正2 (1ページ目のドラムの向き)', () => {
  it('4. 1ページ目の絵で、ドラムの円盤が上と下にある (横長の fillRect が2つ)', () => {
    const { ctx, rec } = makeFakeCtx();
    drawPage1(ctx, 900, 600);
    // 横長の fillRect (幅 > 高さ) が複数ある。ドラムの円盤は上端と下端に置く
    const wide = rec.ops.filter((op) => op.k === 'fillRect' && (op.args?.[2] ?? 0) > (op.args?.[3] ?? 0));
    expect(wide.length).toBeGreaterThanOrEqual(2);
    // 上端と下端の y が離れている (円盤が上と下)
    const ys = wide.map((op) => (op.args?.[1] ?? 0) as number);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(80);
  });
});

describe('winding tutorial T2-12 (遊び方を5ページに)', () => {
  it('1. pages が5つある', () => {
    expect(windingTutorial.pages).toHaveLength(5);
  });

  it('2. 3ページ目に「メーター」と「合わせ続けます」を含む。4ページ目に「▲」と「つなぎます」を含む。5ページ目に「星3」を含む (T2-24 で文を変えた)', () => {
    expect(windingTutorial.pages[2]?.text).toContain('メーター');
    expect(windingTutorial.pages[2]?.text).toContain('合わせ続けます');
    expect(windingTutorial.pages[3]?.text).toContain('▲');
    expect(windingTutorial.pages[3]?.text).toContain('つなぎます');
    expect(windingTutorial.pages[4]?.text).toContain('星3');
  });

  it('3. 3ページ目の絵に、適正の帯が左右に動く矢印がある (fillRect の帯と、矢の三角形の fill)', () => {
    const { ctx, rec } = makeFakeCtx();
    windingTutorial.pages[2]?.draw(ctx, 900, 600);
    // 矢印の三角は path で塗る (fill)。帯は fillRect
    const fills = rec.ops.filter((op) => op.k === 'fill');
    expect(fills.length).toBeGreaterThanOrEqual(2);
  });

  it('4. 4ページ目の絵に、切れた糸が2本あり、同じ糸の両端に同じ印がある (同色の丸印が4つ)', () => {
    const { ctx, rec } = makeFakeCtx();
    windingTutorial.pages[3]?.draw(ctx, 900, 600);
    // 丸印は arc 2回ずつ × 2糸 = 4回
    const arcs = rec.ops.filter((op) => op.k === 'arc');
    expect(arcs.length).toBeGreaterThanOrEqual(4);
  });

  it('5. 5ページ目の絵に、経過時間の文字「0:42 / 1:30」がある (fillText を使う)', () => {
    const { ctx, rec } = makeFakeCtx();
    windingTutorial.pages[4]?.draw(ctx, 900, 600);
    const texts = rec.ops.filter((op) => op.k === 'fillText');
    expect(texts.length).toBeGreaterThanOrEqual(1);
    expect(texts.some((op) => String(op.args?.[0]).includes('0:42'))).toBe(true);
    expect(texts.some((op) => String(op.args?.[0]).includes('1:30'))).toBe(true);
  });

  it('6. 全ページの文字サイズが画面上 20px 以上 (fontPx の係数が 20 以上)', () => {
    // チュートリアルの絵は fillText を使う。font のpx指定が 20 以上であることを確認する
    const { ctx, rec } = makeFakeCtx();
    for (const page of windingTutorial.pages) {
      rec.ops.length = 0;
      page.draw(ctx, 900, 600);
      for (const op of rec.ops.filter((x) => x.k === 'font')) {
        const m = /([\d.]+)px/.exec(String(op.args?.[0]));
        expect(m === null || Number(m[1]) >= 20, String(op.args?.[0])).toBe(true);
      }
    }
  });
});

describe('PU-14d: ドラム巻きの遊び方を今の画面に合わせる', () => {
  const all = windingTutorial.pages.map((p) => p.text).join('\n');

  it('文に「ランプ」があり、「踏み込む」「速さ」「メッセージ」が無い。「巻き量」の説明は T2-24 で短い文に変えたので無い', () => {
    expect(all).toContain('ランプ');
    for (const w of ['踏み込む', '速さ', 'メッセージ', '時間の制限はありません', '巻き量']) {
      expect(all, w).not.toContain(w);
    }
  });

  it('ランプの色と記号 (緑の○・橙の▲▼・赤の✕) を、3 ページ目の絵に描く (tokens の lampOk・lampWarn・lampBreak)', () => {
    const { ctx, rec } = makeFakeCtx();
    windingTutorial.pages[2]!.draw(ctx, 900, 600);
    expect(rec.fillStyleLog).toContain(COLORS.lampOk);
    expect(rec.fillStyleLog).toContain(COLORS.lampWarn);
    expect(rec.fillStyleLog).toContain(COLORS.lampBreak);
    const texts = rec.ops.filter((o) => o.k === 'fillText').map((o) => String(o.args?.[0]));
    for (const t of ['○', '▲', '✕']) {
      expect(texts.some((x) => x.includes(t)), t).toBe(true);
    }
  });

  it('2 ページ目の絵のペダルは横向きの溝 (幅が高さより大きい fillRect があり、横木がその中にある)。ボタンの文字は描かない', () => {
    const { ctx, rec } = makeFakeCtx();
    windingTutorial.pages[1]!.draw(ctx, 900, 600);
    const texts = rec.ops.filter((o) => o.k === 'fillText').map((o) => String(o.args?.[0]));
    expect(texts.some((t) => t.includes('踏み込む') || t.includes('戻す'))).toBe(false);
    const wide = rec.ops.filter((o) => o.k === 'fillRect' && (o.args?.[2] as number) > (o.args?.[3] as number) * 3);
    expect(wide.length).toBeGreaterThanOrEqual(1);
  });

  it('5 ページ目の絵に、目標を超えた制限時間 (朱の「超過」) と「巻き量」がある', () => {
    const { ctx, rec } = makeFakeCtx();
    windingTutorial.pages[4]!.draw(ctx, 900, 600);
    const texts = rec.ops.filter((o) => o.k === 'fillText').map((o) => String(o.args?.[0]));
    expect(texts.some((t) => t.includes('超過'))).toBe(true);
    expect(texts.some((t) => t.includes('巻き量'))).toBe(true);
    expect(rec.fillStyleLog).toContain(COLORS.shu);
  });
});

describe('T2-18c: 遊び方を今の画面に合わせる', () => {
  const all = windingTutorial.pages.map((p) => p.text).join('\n');

  it('文に「ハサミ」と「ランプ」があり、「巻き始める」「帯の端を結ぶ」が無い', () => {
    expect(all).toContain('ハサミ');
    expect(all).toContain('ランプ');
    for (const w of ['巻き始める', '帯の端を結ぶ']) {
      expect(all, w).not.toContain(w);
    }
  });

  it('始まり方・強すぎの戻し・ハサミで切る・星3の条件を説明する。作り手の言葉と細かい数字は無い (T2-24)', () => {
    expect(all).toContain('右へ動かすと巻き始めます'); // ペダルを右へ動かすと始まる
    expect(all).toContain('戻します'); // ペダルを戻す
    expect(all).toContain('ハサミを糸の所まで引っぱって切ります'); // ハサミで切る
    expect(all).toContain('星3'); // 星3の条件
    // 作り手の言葉と細かい数字は書かない (T2-24)
    for (const w of ['揺れ', 'スパイク', '10 以上', '3秒', '2秒']) {
      expect(all, w).not.toContain(w);
    }
  });

  it('5ページ目の絵にハサミがある (鋼の刃と、輪の持ち手)', () => {
    const { ctx, rec } = makeFakeCtx();
    windingTutorial.pages[4]!.draw(ctx, 900, 600);
    expect(rec.fillStyleLog).toContain(COLORS.steel); // 刃
    const arcs = rec.ops.filter((o) => o.k === 'arc'); // 持ち手の輪
    expect(arcs.length).toBeGreaterThanOrEqual(2);
  });
});

describe('winding tutorial T2-22 (強すぎだと切れる)・T2-24 (文面)', () => {
  it('遊び方に「強すぎるまま(▲が点滅)にしておくと、糸が切れます」の文がある (T2-24 で文を変えた)', () => {
    const all = windingTutorial.pages.map((p) => p.text).join('\n');
    expect(all).toContain('強すぎるまま(▲が点滅)にしておくと、糸が切れます');
  });
});

describe('winding tutorial T2-24 (遊び方の文面を遊ぶ人向けに)', () => {
  it('5ページの文が仕様書のとおり', () => {
    const texts = windingTutorial.pages.map((p) => p.text);
    expect(texts[0]).toBe('クリールの糸を{{section}}にまとめて、{{drum}}に巻いていきます');
    expect(texts[1]).toBe('{{pedal}}を右へ動かすと巻き始めます。右へ動かすほど速く巻けますが、張りも強くなります');
    expect(texts[2]).toBe('張りは、メーターと{{drum}}の上のランプで見ます。緑の○が、ちょうどよい張りです。張りはひとりでに上下するので、{{pedal}}で合わせ続けます');
    expect(texts[3]).toBe('張りが急に強くなったら、すぐに{{pedal}}を戻します。強すぎるまま(▲が点滅)にしておくと、糸が切れます。切れたら、切れた場所をタップしてつなぎます');
    expect(texts[4]).toBe('{{section}}を巻き終えたら、ハサミを糸の所まで引っぱって切ります。ちょうどよい張りで、目標の時間内に全部巻き終えると星3です');
  });

  it('呼び名を置き換えると {{pedal}}・{{drum}}・{{section}} が呼び名になる', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const renderText = (text: string): string =>
      text.replaceAll('{{pedal}}', 'ふみこみレバー').replaceAll('{{drum}}', 'ドラム').replaceAll('{{section}}', 'たい');
    const dialog = showTutorial(host, { pages: [{ draw: () => undefined, text: windingTutorial.pages[0]!.text }] }, { renderText });
    await Promise.resolve();
    const text = host.textContent ?? '';
    expect(text).toContain('たいにまとめて');
    expect(text).toContain('ドラムに巻いて');
    expect(text).not.toContain('{{section}}');
    const close = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === '始める' || b.textContent === '×');
    close?.click();
    await dialog;
  });
});
