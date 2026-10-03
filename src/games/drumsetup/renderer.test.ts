import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawBoard, mainHex } from './renderer';
import type { DrumSetupView } from './renderer';
import { makeFakeCtx } from '../winding/renderer.test.helpers';
import { getContent } from '../../core/content/content';
import { COLORS } from '../../core/ui/tokens';
import type { DrumSetupPuzzle } from './puzzles';
import { correctFeed } from './logic';
import { DRUM_RECT, LAYER_H_PX, slopeXAt } from './geometry';

const content = getContent();

function p1(): DrumSetupPuzzle {
  return { id: 's1', stage: 1, patternId: 'p-muji-kon', name: '紺の無地', grade: '2/48', ends: 400, widthCm: 20 };
}

/** 柄の基本色 (層の色の期待値) */
function expectedHex(patternId: string): string {
  const pattern = content.patterns.get(patternId)!;
  let best = pattern.plan[0]!;
  for (const e of pattern.plan) {
    if (e.count > best.count) best = e;
  }
  return content.colors.get(content.yarns.get(best.yarn)!.color)!.hex;
}

/** ops[i] の直前に設定された style の値 */
function styleBefore(ops: { k: string; v?: unknown }[], idx: number): string {
  for (let i = idx - 1; i >= 0; i--) {
    if (ops[i]!.k === 'style') return String(ops[i]!.v);
  }
  return '';
}

function draw(p: DrumSetupPuzzle, view: DrumSetupView) {
  const { ctx, rec } = makeFakeCtx();
  drawBoard(ctx, { scale: 1, offsetX: 0, offsetY: 0 }, p, view, content);
  return rec;
}

describe('drumsetup renderer T2c-02 (盤面)', () => {
  it('1. 角度が null のとき羽は点線 (塗りの板はない)。角度を選ぶと板 (wood の塗り) になる', () => {
    const dashed = draw(p1(), { angle: null, feed: 1.07, outcome: null, progress: 0, showResult: false });
    // wood で塗る命令 (fill) は無い (表面は fillRect)。stroke の破線が複数セグメント
    const fillsWood = dashed.ops.filter((o, i) => o.k === 'fill' && styleBefore(dashed.ops, i) === COLORS.wood);
    expect(fillsWood).toHaveLength(0);
    const firstStroke = dashed.ops.findIndex((o) => o.k === 'stroke');
    expect(firstStroke).toBeGreaterThan(-1);
    const dashes = dashed.ops.filter((o, i) => i < firstStroke && o.k === 'lineTo');
    expect(dashes.length).toBeGreaterThanOrEqual(6); // 破線は複数の短い線

    const solid = draw(p1(), { angle: 9, feed: 1.07, outcome: null, progress: 0, showResult: false });
    const fillsWood2 = solid.ops.filter((o, i) => o.k === 'fill' && styleBefore(solid.ops, i) === COLORS.wood);
    expect(fillsWood2.length).toBeGreaterThanOrEqual(1); // 羽の板を塗る
  });

  it('2. progress 0.5 で、描く層の数がおよそ半分 (15層)。progress 1 で 30層', () => {
    const hex = expectedHex('p-muji-kon');
    const half = draw(p1(), { angle: 9, feed: 1.07, outcome: 'good', progress: 0.5, showResult: false });
    const layerRects = half.ops.filter((o, i) => o.k === 'fillRect' && styleBefore(half.ops, i) === hex);
    expect(layerRects.length).toBeGreaterThanOrEqual(13);
    expect(layerRects.length).toBeLessThanOrEqual(17);
    const full = draw(p1(), { angle: 9, feed: 1.07, outcome: 'good', progress: 1, showResult: false });
    const layerRects2 = full.ops.filter((o, i) => o.k === 'fillRect' && styleBefore(full.ops, i) === hex);
    expect(layerRects2.length).toBe(30);
  });

  it('3. 結果の印の文字: good は「きれいに登った」(藍)、crush は「潰れ」、collapse は「崩れ」(朱)。文字は 20px 以上', () => {
    const cases: Array<{ outcome: 'good' | 'crush' | 'collapse'; text: string; color: string }> = [
      { outcome: 'good', text: 'きれいに登った', color: COLORS.ai },
      { outcome: 'crush', text: '潰れ', color: COLORS.shu },
      { outcome: 'collapse', text: '崩れ', color: COLORS.shu },
    ];
    for (const c of cases) {
      const rec = draw(p1(), { angle: 9, feed: 1.07, outcome: c.outcome, progress: 1, showResult: true });
      const texts = rec.ops.filter((o) => o.k === 'fillText' && String(o.args?.[0]).includes(c.text));
      expect(texts.length, c.text).toBeGreaterThanOrEqual(1);
      // 文字の色
      const idx = rec.ops.findIndex((o) => o.k === 'fillText' && String(o.args?.[0]).includes(c.text));
      expect(styleBefore(rec.ops, idx)).toBe(c.color);
      // 文字の大きさ (fillText の直前の font)
      const fonts = rec.ops.filter((o) => o.k === 'font' && /(\d+)px/.test(String(o.v)));
      const sizes = fonts.map((o) => Number(/(\d+)px/.exec(String(o.v))![1]));
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(20);
    }
  });

  it('4. crush は上の層ほどふくらむ (層の左端が上ほど短い=右へ遅れる)。collapse は層の左端が斜面より内側 (T2c-04a 1)', () => {
    const hex = expectedHex('p-muji-kon');
    const lefts = (view: DrumSetupView): number[] => {
      const rec = draw(p1(), view);
      const xs: number[] = [];
      for (let i = 0; i < rec.ops.length; i++) {
        const o = rec.ops[i]!;
        if (o.k === 'fillRect' && styleBefore(rec.ops, i) === hex) {
          xs.push(Number(o.args?.[0])); // x = 左端
        }
      }
      return xs;
    };
    const crush = lefts({ angle: 9, feed: 1.07, outcome: 'crush', progress: 1, showResult: false });
    expect(crush.length).toBe(30);
    // crush は上の層ほど斜面から右へ遅れる (斜面とのずれ = ふくらみが増える)
    const slopeAt = (j: number): number => slopeXAt(j * LAYER_H_PX, 9);
    expect(crush[29]! - slopeAt(30)).toBeGreaterThan(crush[0]! - slopeAt(1));
    const collapse = lefts({ angle: 9, feed: 1.07, outcome: 'collapse', progress: 1, showResult: false });
    // collapse はどの層も斜面 (good の左端) より内側 (右)
    const good = lefts({ angle: 9, feed: 1.07, outcome: 'good', progress: 1, showResult: false });
    expect(collapse[0]!).toBeGreaterThan(good[0]!);
    expect(collapse[29]!).toBeGreaterThan(good[29]!);
  });

  it('5. 盤面の上の端に「1回転 送り ○.○○mm/羽 ○°」を出す', () => {
    const rec = draw(p1(), { angle: 9, feed: 1.07, outcome: null, progress: 0, showResult: false });
    const texts = rec.ops.filter((o) => o.k === 'fillText' && String(o.args?.[0]).includes('1回転 送り'));
    expect(texts).toHaveLength(1);
    expect(String(texts[0]!.args?.[0])).toContain('1.07');
    expect(String(texts[0]!.args?.[0])).toContain('9');
  });

  it('6. 色の直書きが無い (renderer.ts・geometry.ts に hex のリテラルがない)', () => {
    for (const file of ['renderer.ts', 'geometry.ts']) {
      const src = readFileSync(`src/games/drumsetup/${file}`, 'utf8');
      expect(/#[0-9a-fA-F]{3,8}\b/.test(src), `${file} に hex の直書き`).toBe(false);
    }
  });

  it('7. mainHex は柄のいちばん多い色の hex を返す', () => {
    expect(mainHex(content, 'p-muji-kon')).toBe(expectedHex('p-muji-kon'));
  });

  it('8. 送り量が正しい値のとき、すべての層の左の端が羽の斜面に乗る (ずれ 2px 以内。T2c-04a 1)', () => {
    const hex = expectedHex('p-muji-kon');
    const correct = correctFeed(p1(), 9); // 1.07
    const rec = draw(p1(), { angle: 9, feed: correct, outcome: 'good', progress: 1, showResult: false });
    const rects = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === hex)
      .map((e) => e.o.args as unknown[]);
    expect(rects.length).toBe(30);
    for (const [x, y] of rects) {
      const heightPx = DRUM_RECT.y - Number(y);
      expect(Math.abs(Number(x) - slopeXAt(heightPx, 9))).toBeLessThanOrEqual(2);
    }
  });

  it('9. 送り量が半分 (crush) なら層30の左の端は斜面より右。2倍 (collapse) なら左の端は斜面を越えない (T2c-04a 1)', () => {
    const hex = expectedHex('p-muji-kon');
    const correct = correctFeed(p1(), 9);
    const lefts = (view: DrumSetupView): number[] => {
      const rec = draw(p1(), view);
      return rec.ops
        .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
        .filter((e) => e.o.k === 'fillRect' && e.style === hex)
        .map((e) => Number(e.o.args?.[0]));
    };
    const crush = lefts({ angle: 9, feed: Math.round((correct / 2) * 100) / 100, outcome: 'crush', progress: 1, showResult: false });
    expect(crush.length).toBe(30);
    expect(crush[29]!).toBeGreaterThan(slopeXAt(30 * LAYER_H_PX, 9));
    const collapse = lefts({ angle: 9, feed: Math.round((correct * 2) * 100) / 100, outcome: 'collapse', progress: 1, showResult: false });
    expect(collapse.length).toBe(30);
    for (const left of collapse) {
      // 層の左端は斜面より右に止まる (斜面を越えない)
      expect(left).toBeGreaterThanOrEqual(slopeXAt(30 * LAYER_H_PX, 9) - 2);
    }
  });
});
