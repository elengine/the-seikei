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
