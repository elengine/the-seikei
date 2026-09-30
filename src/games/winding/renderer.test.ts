import { describe, it, expect } from 'vitest';
import { drawBoard } from './renderer';
import type { FakeRecorder } from './renderer.test.helpers';

// 偽の ctx (呼ばれた命令を記録する) は helpers に置く
import { makeFakeCtx } from './renderer.test.helpers';
import { init, reduce } from './logic';
import type { WindingState } from './logic';
import { loadContent } from '../../core/content/content';
import colorsJson from '../../content/colors.json';
import yarnsJson from '../../content/yarns.json';
import patternsJson from '../../content/patterns.json';
import creelPuzzlesJson from '../../content/creelPuzzles.json';

const content = loadContent({
  colors: colorsJson,
  yarns: yarnsJson,
  patterns: patternsJson,
  creelPuzzles: creelPuzzlesJson,
});

const fit = { scale: 1, offsetX: 0, offsetY: 0 };

/** 'winding' まで進めた状態 */
function windingState(seed = 1): WindingState {
  let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed });
  s = reduce(s, { type: 'start' });
  s = reduce(s, { type: 'setPedal', value: 50 });
  return s;
}

/** 'broken' の状態 (上級で pedal 100) */
function brokenState(seed = 99): WindingState {
  let s = init({ level: 3, patternId: 'p-alt-kon', sections: 7, seed });
  s = reduce(s, { type: 'start' });
  for (let i = 0; i < 300; i++) {
    if (s.phase === 'broken') break;
    if (s.phase === 'winding') s = reduce(s, { type: 'setPedal', value: 100 });
    s = reduce(s, { type: 'tick', dtMs: 100 });
  }
  return s;
}

/** 偽の ctx に shu (#B03A2E) の線 (strokeStyle) が描かれたか */
function hasShuStroke(rec: FakeRecorder): boolean {
  return rec.ops.some((op) => op.k === 'style' && op.v === '#B03A2E');
}

describe('winding renderer (T2-05)', () => {
  it("'broken' で shu の線が描かれる (show 'red')", () => {
    const { ctx, rec } = makeFakeCtx();
    const s = brokenState();
    expect(s.phase).toBe('broken');
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    expect(hasShuStroke(rec)).toBe(true);
  });

  it('ランプの点灯・消灯で色が変わる (broken は shu、それ以外は灰色)', () => {
    const { ctx, rec } = makeFakeCtx();
    const broken = brokenState();
    drawBoard(ctx, fit, broken, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // ランプの直前の fillStyle が shu
    expect(rec.fillStyleLog).toContain('#B03A2E');
    const rec2 = makeFakeCtx();
    const winding = windingState();
    drawBoard(rec2.ctx, fit, winding, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // 消灯は灰色
    expect(rec2.rec.fillStyleLog).toContain('#B8BEC4');
    expect(rec2.rec.fillStyleLog).not.toContain('#B03A2E');
  });

  it("'done' で帯の数だけ表面が描かれる", () => {
    const { ctx, rec } = makeFakeCtx();
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    for (let sec = 0; sec < 3; sec++) {
      s = reduce(s, { type: 'start' });
      s = reduce(s, { type: 'setPedal', value: 50 });
      for (let i = 0; i < 500 && s.phase === 'winding'; i++) {
        s = reduce(s, { type: 'tick', dtMs: 100 });
      }
      if (s.phase === 'cutting') s = reduce(s, { type: 'cut' });
    }
    expect(s.phase).toBe('done');
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // 帯ごとの表面 (rect) が sections ぶん描かれる
    const rects = rec.ops.filter((op) => op.k === 'fillRect');
    expect(rects.length).toBeGreaterThanOrEqual(3);
  });

  it('文字は画面 px で 20 以上 (目盛り盤の帯の文字・停止・帯 3 / 5)', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = brokenState();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const fonts = rec.ops.filter((op) => op.k === 'font').map((op) => op.v as string);
    expect(fonts.length).toBeGreaterThan(0);
    for (const f of fonts) {
      const m = f.match(/(\d+(?:\.\d+)?)px/);
      expect(m, `font ${f}`).not.toBeNull();
      expect(parseFloat(m![1] ?? ''), `font ${f}`).toBeGreaterThanOrEqual(20);
    }
  });
});

describe('winding renderer T2-05-fix (座標の変換と決まり)', () => {
  it('1. drawBoard の中で save → translate(offset) → scale(scale) が呼ばれ、最後に restore が呼ばれる', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = windingState();
    drawBoard(ctx, { scale: 0.5, offsetX: 30, offsetY: 20 }, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const ks = rec.ops.map((op) => op.k);
    const saveI = ks.indexOf('save');
    const restoreI = ks.lastIndexOf('restore');
    expect(saveI).toBeGreaterThanOrEqual(0);
    expect(restoreI).toBeGreaterThan(saveI);
    const tr = rec.ops.find((op) => op.k === 'translate');
    expect(tr?.args).toEqual([30, 20]);
    const sc = rec.ops.find((op) => op.k === 'scale');
    expect(sc?.args).toEqual([0.5, 0.5]);
    // translate と scale は save の後
    const trI = ks.indexOf('translate');
    const scI = ks.indexOf('scale');
    expect(trI).toBeGreaterThan(saveI);
    expect(scI).toBeGreaterThan(trI);
    // restore のあとに来るのは文字 (style・font・fillText) だけ
    const afterRestore = ks.slice(restoreI + 1);
    for (const k of afterRestore) {
      expect(['style', 'font', 'fillText'], `after restore: ${k}`).toContain(k);
    }
  });

  it('2. 「帯 1 / 3」の fillText は restore のあとで、Canvas の画面上の幅の中にある (scale 0.39 と 0.7 の両方)', () => {
    for (const f of [{ scale: 0.39, offsetX: 5, offsetY: 5 }, { scale: 0.7, offsetX: 2, offsetY: 2 }]) {
      const { ctx, rec } = makeFakeCtx();
      const s = windingState();
      drawBoard(ctx, f, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
      const ks = rec.ops.map((op) => op.k);
      const restoreI = ks.lastIndexOf('restore');
      const texts = rec.ops.filter((op) => op.k === 'fillText');
      const sec = texts.find((op) => String(op.args?.[0]).startsWith('帯 '));
      expect(sec, `scale ${f.scale}`).toBeDefined();
      // restore の後に描かれる (fillText が restore より後に出てくる)
      const lastTextI = ks.lastIndexOf('fillText');
      expect(lastTextI).toBeGreaterThan(restoreI);
      const x = Number(sec!.args?.[1]);
      const canvasW = ctx.canvas.clientWidth;
      expect(x, `scale ${f.scale} x=${x}`).toBeGreaterThanOrEqual(0);
      expect(x, `scale ${f.scale} x=${x}`).toBeLessThan(canvasW);
    }
  });

  it('3. ctx.font に FONT_FAMILY が含まれる', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = windingState();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const fonts = rec.ops.filter((op) => op.k === 'font').map((op) => op.v as string);
    expect(fonts.length).toBeGreaterThan(0);
    for (const f of fonts) {
      expect(f).toContain('Hiragino Sans');
    }
  });

  it('4. 背景の fillRect は save の前に呼ばれ、大きさが Canvas の clientWidth・clientHeight', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = windingState();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const ks = rec.ops.map((op) => op.k);
    const saveI = ks.indexOf('save');
    const rects = rec.ops.filter((op) => op.k === 'fillRect') as Array<{ args: number[] }>;
    expect(rects.length).toBeGreaterThan(0);
    const first = rects[0]!;
    // 背景 = Canvas 全体 (1000×750 の clientWidth/clientHeight)
    expect(first.args?.[2]).toBe(ctx.canvas.clientWidth);
    expect(first.args?.[3]).toBe(ctx.canvas.clientHeight);
    // 最初の fillRect は save より前
    const firstRectI = ks.indexOf('fillRect');
    expect(firstRectI).toBeLessThan(saveI);
  });
});
