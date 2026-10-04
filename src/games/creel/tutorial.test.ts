import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { creelTutorial } from './tutorial';
import { COLORS } from '../../core/ui/tokens';

/** 呼び出しを記録する偽の描画文脈 (jsdom には Canvas が無い) */
interface Recorded {
  fills: string[];
  strokes: string[];
  texts: string[];
  arcs: number;
}

function record(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Recorded {
  const rec: Recorded = { fills: [], strokes: [], texts: [], arcs: 0 };
  const store: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(store, {
    set(t, k, v) {
      if (k === 'fillStyle') {
        rec.fills.push(String(v).toLowerCase());
      }
      if (k === 'strokeStyle') {
        rec.strokes.push(String(v).toLowerCase());
      }
      t[k] = v;
      return true;
    },
    get(t, k) {
      if (k in t) {
        return t[k];
      }
      if (k === 'arc') {
        return () => {
          rec.arcs++;
        };
      }
      if (k === 'fillText') {
        return (text: string) => {
          rec.texts.push(text);
        };
      }
      if (k === 'measureText') {
        return (text: string) => ({ width: text.length * 10 });
      }
      return () => undefined;
    },
  }) as unknown as CanvasRenderingContext2D;
  draw(ctx, 560, 373);
  return rec;
}

/** クリール立ての遊び方 (T1-20 → PU-11c) */
describe('creel tutorial (T1-20)', () => {
  it('4ページで、4ページ目の文に「ヒント」と「確認」が含まれる (PU-13b でボタン名が「確認」になった)', () => {
    expect(creelTutorial.pages).toHaveLength(4);
    const last = creelTutorial.pages[3]!;
    expect(last.text).toContain('ヒント');
    expect(last.text).toContain('確認');
    expect(last.text).not.toContain('完了');
    // 星の決まり (starsOf: ヒントを1回でも使うと星1) と食い違わない
    expect(last.text).toContain('星は1つ');
  });

  it('2ページ目の文は {{spindle}} と {{cone}} を含む (表示側で呼び名に置き換える)', () => {
    const second = creelTutorial.pages[1]!;
    expect(second.text).toContain('{{spindle}}');
    expect(second.text).toContain('{{cone}}');
  });

  it("tutorial.ts に '#' で始まる色の値が無い (tokens の COLORS を使う)", () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), 'tutorial.ts');
    const src = readFileSync(path, 'utf-8');
    const matches = src.match(/['"]#[0-9A-Fa-f]{3,8}['"]/g) ?? [];
    expect(matches, `直書きの色: ${matches.join(', ')}`).toHaveLength(0);
    // sans-serif の直書きも無い (FONT_FAMILY を使う)
    expect(src).not.toContain('sans-serif');
  });
});

describe('creel tutorial (PU-11c: 今の画面に合わせる)', () => {
  it('どのページの文にも、押して置く操作の説明 (箱を押してから…・押しても置ける) が無い。引っぱる・外す説明は 2 ページ目にある', () => {
    for (const p of creelTutorial.pages) {
      expect(p.text).not.toContain('押してから');
      expect(p.text).not.toContain('押しても置け');
      expect(p.text).not.toContain('確認する');
      expect(p.text).not.toContain('完了');
      expect(p.text).not.toContain('依頼書を見る');
    }
    const second = creelTutorial.pages[1]!.text;
    expect(second).toContain('引っぱ');
    expect(second).toContain('外す');
    expect(second).toContain('{{creel}}の外');
  });

  it('どのページの絵にも、段ボールの色 (cardboard) とチーズの丸 (arc) がある', () => {
    for (const [i, p] of creelTutorial.pages.entries()) {
      const r = record(p.draw);
      expect(r.fills, `${i + 1}ページ目に段ボールの色`).toContain(COLORS.cardboard.toLowerCase());
      expect(r.arcs, `${i + 1}ページ目にチーズの丸`).toBeGreaterThan(0);
    }
  });

  it('どのページの絵の色も tokens の COLORS のどれか (直書きの色を使わない)', () => {
    const known = new Set(Object.values(COLORS).map((c) => c.toLowerCase()));
    for (const [i, p] of creelTutorial.pages.entries()) {
      const r = record(p.draw);
      for (const c of [...r.fills, ...r.strokes]) {
        if (c.startsWith('#')) {
          expect(known.has(c), `${i + 1}ページ目の色 ${c}`).toBe(true);
        }
      }
    }
  });

  it('1ページ目: 依頼書の行の見本 (品番・個数「× 5」・繰り返しの行) と、同じ品番の箱', () => {
    const r = record(creelTutorial.pages[0]!.draw);
    expect(r.texts).toContain('W-4812');
    expect(r.texts.some((t) => t.includes('× 5'))).toBe(true);
    expect(r.texts.some((t) => t.includes('2回繰り返す'))).toBe(true);
    expect(r.texts.some((t) => t.includes('繰り返し ×'))).toBe(false);
    expect(r.texts.filter((t) => t === '依頼書').length).toBeGreaterThanOrEqual(2); // 見出しと「依頼書」のボタン
    // 箱の品番は依頼書の行と同じ (2 回出る)
    expect(r.texts.filter((t) => t === 'W-4812').length).toBeGreaterThanOrEqual(2);
  });

  it('2ページ目: 置く矢印 (藍) と、外す矢印 (朱) が描かれ、緑の柱と、空いた軸の丸 (木の色) がある', () => {
    const r = record(creelTutorial.pages[1]!.draw);
    expect(r.strokes).toContain(COLORS.ai.toLowerCase());
    expect(r.strokes).toContain(COLORS.shu.toLowerCase());
    expect(r.fills).toContain(COLORS.postLight.toLowerCase());
    expect(r.fills).toContain(COLORS.postDark.toLowerCase());
    expect(r.fills).toContain(COLORS.woodLight.toLowerCase());
    expect(r.texts).toContain('置く');
    expect(r.texts).toContain('外す');
  });

  it('3ページ目に「確認」のボタン、4ページ目に「ヒント」のボタンの絵がある', () => {
    expect(record(creelTutorial.pages[2]!.draw).texts).toContain('確認');
    expect(record(creelTutorial.pages[3]!.draw).texts).toContain('ヒント');
  });
});

describe('creel tutorial (PU-13d: 今の画面の文)', () => {
  it('ページの文に「依頼書」「確認」があり、1 ページ目は「依頼書」を押す説明、4 ページ目は「確認に2回失敗すると『ヒント』」', () => {
    const all = creelTutorial.pages.map((p) => p.text).join('\n');
    expect(all).toContain('依頼書');
    expect(all).toContain('確認');
    expect(creelTutorial.pages[0]!.text).toContain('「依頼書」を押すと');
    expect(creelTutorial.pages[2]!.text).toContain('「確認」を押します');
    expect(creelTutorial.pages[3]!.text).toContain('確認に2回失敗すると「ヒント」が使えます');
    expect(creelTutorial.pages[3]!.text).toContain('星は1つ');
  });
});
