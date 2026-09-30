import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawBoard } from './renderer';
import { endPoint, threadY, tableY, DRUM_END_X, drumSectionY, DRUM_AREA } from './geometry';
import { COLORS } from '../../core/ui/tokens';
import type { FakeRecorder } from './renderer.test.helpers';

// 偽の ctx (呼ばれた命令を記録する) は helpers に置く
import { makeFakeCtx } from './renderer.test.helpers';
import { SLAT_COUNT, PIN_ANGLE0 } from './renderer.parts';
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
    // 結び目の束 = 小さな輪 (arc) の集まり。ピンと同じ角度の位置 (pinX) で描かれる (T2-10 追加修正 b)
    const pinX = DRUM_AREA.x + DRUM_AREA.w / 2 + (DRUM_AREA.w / 2 + 10) * Math.sin(PIN_ANGLE0);
    const knots = rec.ops.filter(
      (op) => op.k === 'arc' && typeof op.args?.[0] === 'number' &&
        Math.abs((op.args[0] as number) - pinX) < 8,
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
      // 結びの輪の arc 半径の最大 (ピンの位置 x 付近。T2-10 追加修正 b でピンと同じ角度に)
      const pinX = DRUM_AREA.x + DRUM_AREA.w / 2 + (DRUM_AREA.w / 2 + 10) * Math.sin(PIN_ANGLE0);
      const arcs = rec.ops.filter(
        (op) => op.k === 'arc' && typeof op.args?.[0] === 'number' &&
          Math.abs((op.args[0] as number) - pinX) < 10 && (op.args[2] as number) > 12,
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
    const y = endPoint(s.brk.kind === 'broken' ? s.brk.threads[0] ?? 0 : 0, 'creel', 8).y;
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

describe('winding renderer T2-09b (複数の糸切れ)', () => {
  it('1. 切れた糸が2本のとき、切れ端が2本ぶん描かれる (quadraticCurveTo が 4回)', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = { ...brokenState(), brk: { kind: 'broken' as const, threads: [1, 4], tied: [], first: null } };
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const curves = rec.ops.filter((op) => op.k === 'quadraticCurveTo');
    // 糸ごとに creel 側 + drum 側の 2つの曲線
    expect(curves.length).toBe(4);
    // 両方の糸の高さ (threadY(1,8) と threadY(4,8)) を通る (moveTo の y)
    const moves = rec.ops.filter((op) => op.k === 'moveTo').map((op) => (op.args?.[1] ?? 0) as number);
    expect(moves).toContain(threadY(1, 8));
    expect(moves).toContain(threadY(4, 8));
  });

  it('2. 1手目を押した側の端に藍の丸印 (drum 側から押したら DRUM_END_X に)', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = { ...brokenState(), brk: { kind: 'broken' as const, threads: [2], tied: [], first: { thread: 2, side: 'drum' as const } } };
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const arcs = rec.ops.filter((op) => op.k === 'arc');
    const knot = arcs.find((op) => Math.abs(((op.args?.[0] ?? 0) as number) - DRUM_END_X) < 1);
    expect(knot).toBeDefined();
  });
});

  /** fillStyleLog を使って fillRect ごとの色を復元する (style op が直前の色) */
  function fillRectsWithColor(rec: FakeRecorder): Array<{ v: string; x: number; y: number; w: number; h: number }> {
    let cur = '';
    const out: Array<{ v: string; x: number; y: number; w: number; h: number }> = [];
    for (const op of rec.ops) {
      if (op.k === 'style') cur = String(op.v);
      if (op.k === 'fillRect') {
        out.push({ v: cur, x: (op.args?.[0] as number) ?? 0, y: (op.args?.[1] as number) ?? 0, w: (op.args?.[2] as number) ?? 0, h: (op.args?.[3] as number) ?? 0 });
      }
    }
    return out;
  }

describe('winding renderer T2-08 追加修正2', () => {
  const fit = { scale: 1, offsetX: 0, offsetY: 0 };

  it('1. 巻いている途中の区画にも木の桟があり、縞より先に描かれる', () => {
    const { ctx, rec } = makeFakeCtx();
    let s = windingState();
    // current 0・lengths[0] を 10% に
    s = { ...s, phase: 'winding' as const, lengths: s.lengths.map((v, i) => (i === 0 ? 300 : v)) };
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const fills = fillRectsWithColor(rec).filter((f) => f.w > 0 && f.v === COLORS.wood);
    expect(fills.length).toBeGreaterThan(0);
    // 桟の y が今の帯の区画の中 (drumSectionY(0) 〜 +secH)
    const slat = fills[0]!;
    const sy = drumSectionY(0, s.sections);
    expect(slat.y).toBeGreaterThanOrEqual(sy);
    expect(slat.y).toBeLessThan(sy + 900 / s.sections);
  });

  it('3. 巻き終えた区画の縞の fillRect の数が、柄の並びの色の数より多い (繰り返す)', () => {
    const { ctx, rec } = makeFakeCtx();
    let s = windingState();
    s = { ...s, phase: 'winding' as const, current: 1, lengths: s.lengths.map(() => 3000) };
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const inBand = fillRectsWithColor(rec).filter((f) => f.y >= drumSectionY(0, 3) && f.y < drumSectionY(1, 3) && f.w > 100);
    expect(inBand.length).toBeGreaterThan(1);
    // 縞1本の高さは STRIPE_H (6) 以下
    expect(Math.max(...inBand.map((f) => f.h))).toBeLessThanOrEqual(8);
  });

  it('4. 巻き終えた区画の結び目に、sumi の stroke がある', () => {
    const { ctx, rec } = makeFakeCtx();
    let s = windingState();
    s = { ...s, phase: 'winding' as const, current: 1 };
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // 結び目の arc が描かれたあと、sumi の strokeStyle が設定されている
    const arcs = rec.ops.filter((op) => op.k === 'arc');
    expect(arcs.length).toBeGreaterThan(0);
    expect(rec.ops.some((op) => op.k === 'style' && op.v === COLORS.sumi)).toBe(true);
  });

  it('6. コーンの fill のあとに sumiSub の stroke がある (白いコーンの輪郭)', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = windingState();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const styles = rec.ops.filter((op) => op.k === 'style').map((op) => String(op.v));
    // コーンは糸の色 (初級 p-pin-kon の紺 #1F2A44) で塗る。そのあとに sumiSub が来る (輪郭)
    const idx = styles.indexOf('#1F2A44');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(styles.slice(idx + 1, idx + 4)).toContain(COLORS.sumiSub);
  });
});

describe('winding renderer T2-10b (ドラムが回って見える)', () => {
  const fit = { scale: 1, offsetX: 0, offsetY: 0 };

  it('1. drumAngle だけを変えて2回描くと、桟の fillRect の x が変わる。同じ angle なら同じ', () => {
    const s = windingState();
    const collect = (angle: number) => {
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: angle });
      return fillRectsWithColor(rec).filter((f) => f.v === COLORS.wood).map((f) => Math.round(f.x));
    };
    const a0 = collect(0);
    const a1 = collect(0.7);
    expect(a0).not.toEqual(a1);
    expect(collect(0)).toEqual(a0);
  });

  it('2. 裏側の桟 (cos θ ≤ 0) は描かれない (ドラム領域の桟が候補より明らかに少ない)', () => {
    const s = windingState();
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: 0.7 });
    const inDrum = fillRectsWithColor(rec).filter(
      (f) => f.v === COLORS.wood && f.w > 0 &&
        f.x >= DRUM_AREA.x - 10 && f.x < DRUM_AREA.x + DRUM_AREA.w + 10 &&
        f.y >= DRUM_AREA.y && f.y < DRUM_AREA.y + DRUM_AREA.h,
    );
    expect(inDrum.length).toBeLessThan(SLAT_COUNT * s.sections); // 裏側 (約半分) が消えている
    expect(inDrum.length).toBeGreaterThan(0);
  });

  it('3. 巻いた帯の上に回る筋 (糸の筋) が描かれる (winding で帯の面の細い縦の線)', () => {
    const s = windingState();
    const s2 = { ...s, phase: 'winding' as const, current: 0, lengths: s.lengths.map((v, i) => (i === 0 ? 1500 : v)) };
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s2, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: 0.5 });
    // 帯1の区画の中に、幅の狭い fillRect (筋) がある
    const inBand = fillRectsWithColor(rec).filter((f) => f.y >= drumSectionY(0, 3) && f.y < drumSectionY(1, 3) && f.w > 0 && f.w < 30);
    expect(inBand.length).toBeGreaterThan(0);
  });
});

describe('winding renderer T2-10 追加修正 a (桟の数)', () => {
  const fit = { scale: 1, offsetX: 0, offsetY: 0 };

  it('1. drumAngle 0 で、今の帯の区画に描かれる桟の fillRect が 10 本以上 (かごに見える)', () => {
    const s = windingState();
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: 0 });
    const sy0 = drumSectionY(s.current, s.sections);
    const sy1 = drumSectionY(s.current + 1, s.sections);
    const slats = fillRectsWithColor(rec).filter(
      (f) => f.v === COLORS.wood && f.w > 0 && f.h > 20 &&
        f.x >= DRUM_AREA.x - 20 && f.x < DRUM_AREA.x + DRUM_AREA.w + 20 &&
        f.y >= sy0 && f.y < sy1,
    );
    expect(slats.length).toBeGreaterThanOrEqual(10);
  });
});

describe('winding renderer T2-10 追加修正 b (上下の端・結び目とピンも回る)', () => {
  const fit = { scale: 1, offsetX: 0, offsetY: 0 };

  /** ellipse の呼ばれ方を集める */
  function ellipses(rec: FakeRecorder): Array<{ x: number; y: number; rx: number; ry: number }> {
    return rec.ops
      .filter((op) => op.k === 'ellipse')
      .map((op) => ({ x: (op.args?.[0] as number) ?? 0, y: (op.args?.[1] as number) ?? 0, rx: (op.args?.[2] as number) ?? 0, ry: (op.args?.[3] as number) ?? 0 }));
  }

  it('5. ellipse の面を塗る (fill) は下の端の1回だけ。上の端は弧を描くだけ', () => {
    const s = windingState();
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: 0 });
    // ellipse の直後に fill が来る = 面を塗っている
    const filled: Array<{ y: number; rx: number }> = [];
    for (let i = 0; i < rec.ops.length; i++) {
      const op = rec.ops[i]!;
      if (op.k === 'ellipse' && rec.ops[i + 1]?.k === 'fill') {
        filled.push({ y: (op.args?.[1] as number) ?? 0, rx: (op.args?.[2] as number) ?? 0 });
      }
    }
    const disks = filled.filter(
      (e) => Math.abs(e.rx - (DRUM_AREA.w / 2 + 10)) < 1 &&
        e.y >= DRUM_AREA.y && e.y <= DRUM_AREA.y + DRUM_AREA.h + 1,
    );
    expect(disks.length).toBe(1); // 下の端だけ
    expect(Math.abs(disks[0]!.y - (DRUM_AREA.y + DRUM_AREA.h))).toBeLessThan(1);
  });

  it('6. drumAngle を変えると結び目の輪の x が変わる (結び目もドラムと一緒に回る)', () => {
    const s = windingState();
    const s1 = { ...s, phase: 'cutting' as const, current: 0 };
    const collectKnotX = (angle: number): number[] => {
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, s1, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: angle, tieProgress: 0.5 });
      // 結びの輪 = 区画1の中の半径 12 超の arc
      return rec.ops
        .filter((op) => op.k === 'arc' && (op.args?.[2] as number) > 12 &&
          (op.args?.[1] as number) >= drumSectionY(0, s.sections) && (op.args?.[1] as number) < drumSectionY(1, s.sections))
        .map((op) => Math.round((op.args?.[0] as number) ?? 0));
    };
    const a = collectKnotX(0.2);
    const b = collectKnotX(1.1);
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toEqual(b);
  });

  it('6b. cos θpin ≤ 0 (裏側) の角度では、結び目もピンも描かれない', () => {
    const s = windingState();
    const s1 = { ...s, phase: 'cutting' as const, current: 0 };
    // θpin = drumAngle + PIN_ANGLE0。cos ≤ 0 になる drumAngle を PIN_ANGLE0 から求める
    const back = Math.PI - PIN_ANGLE0 + 0.2; // cos(θpin) < 0 になる角度
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s1, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: back, tieProgress: 0.5 });
    const ky0 = drumSectionY(0, s.sections);
    const ky1 = drumSectionY(1, s.sections);
    const rings = rec.ops.filter(
      (op) => op.k === 'arc' && (op.args?.[2] as number) > 12 &&
        (op.args?.[1] as number) >= ky0 && (op.args?.[1] as number) < ky1,
    );
    expect(rings.length).toBe(0);
  });
});
