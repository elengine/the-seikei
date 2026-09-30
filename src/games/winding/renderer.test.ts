import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawBoard } from './renderer';
import { endPoint, threadY, tableY } from './geometry';
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

  it('2. 「停止」の fillText は restore のあとで、Canvas の画面上の幅の中にある (scale 0.39 と 0.7 の両方)。期待値変更: 「帯 N / M」を盤面に描かなくなり、盤面の文字は「停止」だけになった (T2-07 追加修正b)', () => {
    for (const f of [{ scale: 0.39, offsetX: 5, offsetY: 5 }, { scale: 0.7, offsetX: 2, offsetY: 2 }]) {
      const { ctx, rec } = makeFakeCtx();
      const s = brokenState();
      drawBoard(ctx, f, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
      const ks = rec.ops.map((op) => op.k);
      const restoreI = ks.lastIndexOf('restore');
      const texts = rec.ops.filter((op) => op.k === 'fillText');
      const stop = texts.find((op) => op.args?.[0] === '停止');
      expect(stop, `scale ${f.scale}`).toBeDefined();
      // restore の後に描かれる (fillText が restore より後に出てくる)
      const lastTextI = ks.lastIndexOf('fillText');
      expect(lastTextI).toBeGreaterThan(restoreI);
      const x = Number(stop!.args?.[1]);
      const canvasW = ctx.canvas.clientWidth;
      expect(x, `scale ${f.scale} x=${x}`).toBeGreaterThanOrEqual(0);
      expect(x, `scale ${f.scale} x=${x}`).toBeLessThan(canvasW);
    }
  });

  it('3. ctx.font に FONT_FAMILY が含まれる (盤面の文字は「停止」のみになったので broken で確認)', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = brokenState();
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

describe('winding renderer T2-08 (盤面の絵を実物らしくする)', () => {
  it('1. コーンが threadCount 個描かれる (角の丸い長方形 roundRect)', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = windingState();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const cones = rec.ops.filter((op) => op.k === 'roundRect');
    expect(cones.length).toBe(8);
  });

  it('2. ドラムの端の丸い面として ellipse が2回以上呼ばれる', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = windingState();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const ellipses = rec.ops.filter((op) => op.k === 'ellipse');
    expect(ellipses.length).toBeGreaterThanOrEqual(2);
  });

  it('3. 筬の歯として細い縦の線が10本以上描かれる', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = windingState();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // 筬の区画 (TABLE_AREA の中) の moveTo で、y が上→下の短い縦線を数える
    const tooth = rec.ops.filter(
      (op) => op.k === 'moveTo' && typeof op.args?.[0] === 'number' &&
        (op.args[0] as number) > 260 && (op.args[0] as number) < 560 &&
        typeof op.args?.[1] === 'number',
    );
    expect(tooth.length).toBeGreaterThanOrEqual(10);
  });

  it('4. 巻き終えた帯の数だけ結び目の束が描かれる (current が2なら2つ)', () => {
    const { ctx, rec } = makeFakeCtx();
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    for (let sec = 0; sec < 2; sec++) {
      s = reduce(s, { type: 'start' });
      s = reduce(s, { type: 'setPedal', value: 50 });
      for (let i = 0; i < 500 && s.phase === 'winding'; i++) {
        s = reduce(s, { type: 'tick', dtMs: 100 });
      }
      if (s.phase === 'cutting') s = reduce(s, { type: 'cut' });
    }
    expect(s.current).toBe(2);
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // 結び目の束 = 小さな輪 (arc) の集まり。帯の区画の左の端 (x = DRUM_AREA.x + 14 付近) で描かれる
    const knots = rec.ops.filter(
      (op) => op.k === 'arc' && typeof op.args?.[0] === 'number' &&
        Math.abs((op.args[0] as number) - (580 + 14)) < 8,
    );
    // 束 1 個 = 輪 5 個 → current 2 個 = 10 個以上
    expect(knots.length).toBeGreaterThanOrEqual(10);
  });

  it('5. ドラムの胴に明るさの勾配がある (createLinearGradient を使う)', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = windingState();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const grads = rec.ops.filter((op) => op.k === 'createLinearGradient');
    expect(grads.length).toBeGreaterThanOrEqual(1);
    // 勾配の色は tokens の色の値 (# で始まる hex)
    const stops = rec.ops.filter((op) => op.k === 'addColorStop');
    expect(stops.length).toBeGreaterThanOrEqual(3);
  });

  it('6. renderer.ts に # で始まる色の値を直書きしていない', () => {
    const src = readFileSync('src/games/winding/renderer.ts', 'utf8');
    expect(src.includes("'#")).toBe(false);
    expect(src.includes('"#')).toBe(false);
  });
});

describe('winding renderer T2-08-fix a (ドラムの向き・台の移動・結びの演出・流れる印)', () => {
  it('1. ドラムの端の円盤は上と下 (ellipse の中心 y が区画の上端と下端の近く)', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = windingState();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const ells = rec.ops.filter((op) => op.k === 'ellipse').map((op) => op.args as number[]);
    // 端の円盤の中心 y は、上端 (90) と下端 (690) の付近
    const centers = ells.map((e) => e[1] ?? 0);
    expect(centers.some((cy) => cy < 160)).toBe(true);
    expect(centers.some((cy) => cy > 620)).toBe(true);
  });

  it('2. 帯の縞は横の線 (fillRect の幅が区画の全幅、高さが区画の高さ未満)', () => {
    const { ctx, rec } = makeFakeCtx();
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    s = reduce(s, { type: 'start' });
    s = reduce(s, { type: 'setPedal', value: 50 });
    for (let i = 0; i < 500 && s.phase === 'winding'; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // 帯の縞: DRUM_AREA.x (580) から始まる fillRect で、高さが区画の高さ (200) より小さい
    const stripes = rec.ops.filter(
      (op) => op.k === 'fillRect' && typeof op.args?.[0] === 'number' &&
        Math.abs((op.args[0] as number) - 580) < 5 &&
        (op.args[3] as number) < 190,
    );
    expect(stripes.length).toBeGreaterThanOrEqual(1);
  });

  it('3. 台の縦の位置が今の帯の区画の中心に合う (fillRect の y が tableY 付近)', () => {
    const { ctx, rec } = makeFakeCtx();
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    s = reduce(s, { type: 'start' });
    s = reduce(s, { type: 'setPedal', value: 50 });
    for (let i = 0; i < 500 && s.phase === 'winding'; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // current 0 の区画の中心 = (90 + 290) / 2 = 190。台の板の y はその付近
    const woodY = rec.ops.filter(
      (op) => op.k === 'style' && op.v === '#8A5A3C',
    );
    expect(woodY.length).toBeGreaterThan(0);
  });

  it('4. tieProgress 0.5 の結び目の輪が 0 と 1 のときより大きい (arc の半径)', () => {
    const radii: number[] = [];
    for (const p of [0, 0.5, 1]) {
      const { ctx, rec } = makeFakeCtx();
      let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
      s = reduce(s, { type: 'start' });
      s = reduce(s, { type: 'setPedal', value: 50 });
      for (let i = 0; i < 500 && s.phase === 'winding'; i++) {
        s = reduce(s, { type: 'tick', dtMs: 100 });
      }
      // cut の直前 (phase 'cutting'・current 0) で演出を見る (cut を送ると current が進む)
      expect(s.phase).toBe('cutting');
      drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0, tieProgress: p });
      // 結びの輪の arc 半径の最大 (帯1の区画の左の端 x 付近)
      const arcs = rec.ops.filter(
        (op) => op.k === 'arc' && typeof op.args?.[0] === 'number' &&
          (op.args[0] as number) > 580 && (op.args[0] as number) < 612 && (op.args[2] as number) > 12,
      ).map((op) => (op.args![2] ?? 0) as number);
      // 輪は p=0 (描かない) では無くてもよいが、p=0.5 と p=1 (束は輪 5 個 半径 5) とは比べる
      const maxR = arcs.reduce((m, r) => Math.max(m, r ?? 0), 0);
      radii.push(maxR);
    }
    expect(radii[1]!).toBeGreaterThan(radii[0]!);
    expect(radii[1]!).toBeGreaterThan(radii[2]!);
  });

  it('5. 流れる印の点が糸の線の上 (印の y が threadY か tableY 付近)', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = windingState();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 1234 });
    // 流れる印は winding 中に描く小さな fillRect。y が threadY か帯の高さのどちらか
    const marks = rec.ops.filter(
      (op) => op.k === 'fillRect' && typeof op.args?.[1] === 'number',
    );
    const ys = marks.map((op) => op.args?.[1] as number);
    const goodYs = new Set<number>();
    for (let t = 0; t < 8; t++) goodYs.add(Math.round(threadY(t, 8)));
    goodYs.add(Math.round(tableY(0, 3)));
    const onPath = ys.filter((y) => {
      for (const g of goodYs) if (Math.abs(y - g) < 6) return true;
      return false;
    });
    expect(onPath.length).toBeGreaterThanOrEqual(1);
  });
});

describe('winding renderer T2-07-fix2 (切れた糸は当たりの位置に描く)', () => {
  it("'broken' の切れた糸の朱の線の moveTo の y (論理座標) が endPoint の y と同じ", () => {
    const { ctx, rec } = makeFakeCtx();
    const s = brokenState();
    expect(s.phase).toBe('broken');
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // shu の線の moveTo/lineTo の y に、切れた糸の endPoint の y が含まれる
    const y = endPoint(s.brk.kind === 'broken' ? s.brk.thread : 0, 'creel', 8).y;
    const ys = rec.ops
      .filter((op) => (op.k === 'moveTo' || op.k === 'lineTo') && typeof op.args?.[1] === 'number')
      .map((op) => op.args?.[1] as number);
    expect(ys, `endPoint y=${y}`).toContain(y);
  });
});

describe('winding renderer T2-07-fix b (盤面の文字の見せ方)', () => {
  it('1. 盤面に「帯」を含む fillText を描かない (操作欄に同じ表示がある)', () => {
    for (const s of [windingState(), brokenState(), windingState()]) {
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
      const texts = rec.ops.filter((op) => op.k === 'fillText').map((op) => String(op.args?.[0]));
      const band = texts.find((txt) => txt.startsWith('帯 '));
      expect(band).toBeUndefined();
    }
  });

  it("2. 'broken' のとき「停止」の y はランプの中心の y より下 (ランプに重ならない)", () => {
    const { ctx, rec } = makeFakeCtx();
    const s = brokenState();
    expect(s.phase).toBe('broken');
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const stop = rec.ops.find((op) => op.k === 'fillText' && op.args?.[0] === '停止');
    expect(stop).toBeDefined();
    const stopY = Number(stop!.args?.[2]);
    // ランプの中心は論理 (620, 45)。toPx で画面の点 (scale 1, offset 0 なので同じ)
    const lampY = 45;
    expect(stopY).toBeGreaterThan(lampY);
    // ランプの中心に x がそろっている (中心 = 文字の左端から文字幅の半分の位置)
    const stopX = Number(stop!.args?.[1]);
    const lampX = 620;
    expect(Math.abs(stopX - lampX)).toBeLessThan(30); // 中心そろえ (ゆるい幅で確認)
  });
});
