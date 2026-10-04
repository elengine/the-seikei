import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawBoard } from './renderer';
import { endPoint, threadY, tableY, DRUM_END_X, drumSectionY, DRUM_AREA, REED_X } from './geometry';
import { COLORS } from '../../core/ui/tokens';
import type { FakeRecorder } from './renderer.test.helpers';

// 偽の ctx (呼ばれた命令を記録する) は helpers に置く
import { makeFakeCtx } from './renderer.test.helpers';
import { SLAT_COUNT, PIN_ANGLE0, lampStateOf, lampGeometry } from './renderer.parts';
import { WING_SIDE_MAX_RATIO } from './params';
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

/** 偽の ctx に shu の線 (strokeStyle) が描かれたか */
function hasShuStroke(rec: FakeRecorder): boolean {
  return rec.ops.some((op) => op.k === 'style' && op.v === COLORS.shu);
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
    expect(rec.fillStyleLog).toContain(COLORS.shu);
    const rec2 = makeFakeCtx();
    const winding = windingState();
    drawBoard(rec2.ctx, fit, winding, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // 消灯は灰色
    expect(rec2.rec.fillStyleLog).toContain('#B8BEC4');
    expect(rec2.rec.fillStyleLog).not.toContain(COLORS.shu);
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

  it('盤面の文字は、ランプの中の記号 (○▲▼✕) だけ (「帯 N / M」は T2-07 追加修正b で、「停止」は T2-13b でやめた。PU-14b でランプに記号が入った)', () => {
    for (const s of [windingState(), brokenState()]) {
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
      const texts = rec.ops.filter((op) => op.k === 'fillText');
      for (const t of texts) {
        expect(['○', '▲', '▼', '✕'], `${s.phase} の文字 ${String(t.args![0])}`).toContain(t.args![0]);
      }
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

  it('2. restore のあとに fillText を描かない (盤面の文字は無い。T2-13b で「停止」もやめた)', () => {
    for (const f of [{ scale: 0.39, offsetX: 5, offsetY: 5 }, { scale: 0.7, offsetX: 2, offsetY: 2 }]) {
      const { ctx, rec } = makeFakeCtx();
      const s = brokenState();
      drawBoard(ctx, f, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
      const ks = rec.ops.map((op) => op.k);
      const restoreI = ks.lastIndexOf('restore');
      // restore の後に来る命令は無い (ランプの記号は変換の中で描く)
      expect(ks.slice(restoreI + 1).length, `scale ${f.scale}`).toBe(0);
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

  it('3. 筬の歯として横向きの線が7本以上描かれる (8本の糸のすき間。T2-13a で横向きに)', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = windingState();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // 筬の区画 (REED_X 付近) の moveTo → lineTo で、y が同じ横線を数える
    let teeth = 0;
    for (let i = 0; i + 1 < rec.ops.length; i++) {
      const a = rec.ops[i]!;
      const b = rec.ops[i + 1]!;
      if (a.k === 'moveTo' && b.k === 'lineTo' &&
          Math.abs((a.args?.[0] as number) - REED_X) < 40 &&
          Math.abs((b.args?.[0] as number) - REED_X) < 40 &&
          Math.abs((a.args?.[1] as number) - (b.args?.[1] as number)) < 0.5) {
        teeth++;
      }
    }
    expect(teeth).toBeGreaterThanOrEqual(7);
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

  it('2. 帯の縞は横の線 (fillRect の幅が区画の全幅、高さが区画の高さ未満)。板は全高さなので数えない (T2-13a)', () => {
    const { ctx, rec } = makeFakeCtx();
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    s = reduce(s, { type: 'start' });
    s = reduce(s, { type: 'setPedal', value: 50 });
    // 巻き途中にする (tick で長さを進める。板は全高さになったので縞だけを見る)
    for (let i = 0; i < 50 && s.phase === 'winding'; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect((s.lengths[0] ?? 0)).toBeGreaterThan(0);
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // 帯の縞: 帯の領域 (leftX 570 〜 rightX 970) から始まる fillRect で、幅が帯の全幅・高さが区画の高さ (200) より小さい
    const stripes = rec.ops.filter(
      (op) => op.k === 'fillRect' && typeof op.args?.[0] === 'number' &&
        (op.args[0] as number) >= 560 && (op.args[0] as number) <= 580 &&
        (op.args[2] as number) > 300 &&
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
      (op) => op.k === 'style' && op.v === COLORS.wood,
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

  it("2. 'broken' でも「停止」の文字は描かない (赤いランプで分かる。T2-13b)", () => {
    const { ctx, rec } = makeFakeCtx();
    const s = brokenState();
    expect(s.phase).toBe('broken');
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const stop = rec.ops.find((op) => op.k === 'fillText' && op.args?.[0] === '停止');
    expect(stop).toBeUndefined();
  });
});

describe('winding renderer T2-09b (複数の糸切れ)', () => {
  it('1. 切れた糸が2本のとき、切れ端が2本ぶん描かれる (quadraticCurveTo が 4回)', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = { ...brokenState(), brk: { kind: 'broken' as const, threads: [1, 4], tied: [] } };
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const curves = rec.ops.filter((op) => op.k === 'quadraticCurveTo');
    // 糸ごとに creel 側 + drum 側の 2つの曲線
    expect(curves.length).toBe(4);
    // 両方の糸の高さ (threadY(1,8) と threadY(4,8)) を通る (moveTo の y)
    const moves = rec.ops.filter((op) => op.k === 'moveTo').map((op) => (op.args?.[1] ?? 0) as number);
    expect(moves).toContain(threadY(1, 8));
    expect(moves).toContain(threadY(4, 8));
  });

  it('2. 1手目の藍の丸印は無い (T2-13c で 1回押しに変わり、印の装飾は無くなった)', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = { ...brokenState(), brk: { kind: 'broken' as const, threads: [2], tied: [] } };
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const arcs = rec.ops.filter((op) => op.k === 'arc');
    const knot = arcs.find((op) => Math.abs(((op.args?.[0] ?? 0) as number) - DRUM_END_X) < 1);
    expect(knot).toBeUndefined();
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

  it('1. 巻いている途中の区画にも木の板があり、縞より先に描かれる。板は上端から下端まで1本 (T2-13a)', () => {
    const { ctx, rec } = makeFakeCtx();
    let s = windingState();
    // current 0・lengths[0] を 10% に
    s = { ...s, phase: 'winding' as const, lengths: s.lengths.map((v, i) => (i === 0 ? 300 : v)) };
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const fills = fillRectsWithColor(rec).filter((f) => f.w > 0 && f.v === COLORS.wood);
    expect(fills.length).toBeGreaterThan(0);
    // ドラムの板: y がドラムの上端から始まり、高さは胴の高さ (区画ごとに分かれない。T2-13a)
    const board = fills.find((f) => f.y >= DRUM_AREA.y - 1 && f.y <= DRUM_AREA.y + 1 && f.h > DRUM_AREA.h - 4);
    expect(board, '上端から下端までの板がある').toBeDefined();
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

  it('1. drumAngle 0 で、上端から下端までの板の fillRect が 10 本以上 (かごに見える)。板は区画ごとに分かれない (T2-13a)', () => {
    const s = windingState();
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: 0 });
    const boards = fillRectsWithColor(rec).filter(
      (f) => f.v === COLORS.wood && f.w > 0 && f.h > 20 &&
        f.x >= DRUM_AREA.x - 20 && f.x < DRUM_AREA.x + DRUM_AREA.w + 20 &&
        f.y >= DRUM_AREA.y - 1 && f.y <= DRUM_AREA.y + 1,
    );
    expect(boards.length).toBeGreaterThanOrEqual(10);
    // 板の高さは胴の高さ (区画の高さではない)
    expect(boards.every((b) => b.h > DRUM_AREA.h - 4)).toBe(true);
  });
});

describe('winding renderer T2-10 追加修正 b (上下の端・結び目とピンも回る)', () => {
  const fit = { scale: 1, offsetX: 0, offsetY: 0 };

  it('5. ellipse の面を塗る (fill) は上の端と下の端の2つ (T2-13a で上の端にも色を付ける)', () => {
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
        e.y >= DRUM_AREA.y - 1 && e.y <= DRUM_AREA.y + DRUM_AREA.h + 1,
    );
    expect(disks.length).toBe(2); // 上の端の面 + 下の端の円盤
    expect(Math.abs(disks[0]!.y - DRUM_AREA.y)).toBeLessThan(1);
    expect(Math.abs(disks[1]!.y - (DRUM_AREA.y + DRUM_AREA.h))).toBeLessThan(1);
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

describe('winding renderer T2-13b (切れた糸の印と「停止」)', () => {
  const fit = { scale: 1, offsetX: 0, offsetY: 0 };

  /** 糸道の印 (テンションの皿) の位置 (論理座標)。drawCreel と同じ式 */
  function markPos(t: number): { x: number; y: number } {
    return { x: 124, y: threadY(t, 8) };
  }

  /** 指定の位置に描かれた arc の直前の fillStyle */
  function markFill(rec: FakeRecorder, t: number): string | null {
    const p = markPos(t);
    let cur = '';
    for (const op of rec.ops) {
      if (op.k === 'style') cur = String(op.v);
      if (op.k === 'arc' &&
          Math.abs((op.args?.[0] as number) - p.x) < 1 &&
          Math.abs((op.args?.[1] as number) - p.y) < 1 &&
          Math.abs((op.args?.[2] as number) - 6) < 1) {
        return cur;
      }
    }
    return null;
  }

  it('1. broken で切れた糸の印が朱、切れていない糸の印は今の色のまま', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = { ...brokenState(), brk: { kind: 'broken' as const, threads: [1, 4], tied: [] } };
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    expect(markFill(rec, 1)).toBe(COLORS.shu);
    expect(markFill(rec, 4)).toBe(COLORS.shu);
    expect(markFill(rec, 0)).toBe(COLORS.steel);
    expect(markFill(rec, 7)).toBe(COLORS.steel);
  });

  it('2. winding では印はどれも朱にならない', () => {
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, windingState(), content, { threadCount: 8, show: 'red', timeMs: 0 });
    for (let t = 0; t < 8; t++) {
      expect(markFill(rec, t), `t${t}`).not.toBe(COLORS.shu);
    }
  });

  it('3. broken で切れた糸の印に白い×が重なる (色だけに頼らない)', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = { ...brokenState(), brk: { kind: 'broken' as const, threads: [2], tied: [] } };
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // 白い線 (×の2画) が描かれる。印の位置の付近の moveTo で見る
    const p = markPos(2);
    const cross = rec.ops.filter(
      (op) => op.k === 'moveTo' &&
        Math.abs((op.args?.[0] as number) - p.x) < 10 &&
        Math.abs((op.args?.[1] as number) - p.y) < 10,
    );
    expect(cross.length).toBeGreaterThanOrEqual(2);
    // ×を描くまえに白の strokeStyle が設定されている
    const styles = rec.ops.filter((op) => op.k === 'style').map((op) => String(op.v));
    expect(styles).toContain(COLORS.white);
  });

  it('4. broken でも「停止」の fillText を描かない (赤いランプで分かる。T2-13b)', () => {
    const { ctx, rec } = makeFakeCtx();
    const s = brokenState();
    expect(s.phase).toBe('broken');
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const texts = rec.ops.filter((op) => op.k === 'fillText').map((op) => String(op.args?.[0]));
    expect(texts).not.toContain('停止');
  });
});

describe('winding renderer T2-13a (実物の写真に合わせた絵)', () => {
  const fit = { scale: 1, offsetX: 0, offsetY: 0 };

  it('1. 筬の歯の線は横向き (始点と終点の y が同じ)。枠の中に上下に並ぶ', () => {
    const s = windingState();
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // 筬の枠の中 (REED_X 付近) の moveTo → lineTo のペアを集める
    const pairs: Array<{ y1: number; y2: number; x1: number; x2: number }> = [];
    for (let i = 0; i + 1 < rec.ops.length; i++) {
      const a = rec.ops[i]!;
      const b = rec.ops[i + 1]!;
      if (a.k === 'moveTo' && b.k === 'lineTo' &&
          Math.abs((a.args?.[0] as number) - REED_X) < 40 &&
          Math.abs((b.args?.[0] as number) - REED_X) < 40) {
        pairs.push({ x1: a.args?.[0] as number, y1: a.args?.[1] as number, x2: b.args?.[0] as number, y2: b.args?.[1] as number });
      }
    }
    const teeth = pairs.filter((p) => Math.abs(p.y1 - p.y2) < 0.5 && Math.abs(p.x1 - p.x2) > 5);
    expect(teeth.length, `横向きの歯 ${teeth.length} 本`).toBeGreaterThanOrEqual(7); // 8本の糸のすき間 = 7本
  });

  it('2. 筬の枠は縦長 (鋼色の fillRect の高さ > 幅)。枠の中に縦の歯の線は無い', () => {
    const s = windingState();
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    // 枠: REED_X 付近の fillRect で h > w
    const frames = fillRectsWithColor(rec).filter(
      (f) => f.v === COLORS.steel && Math.abs(f.x + f.w / 2 - REED_X) < 5 && f.h > f.w,
    );
    expect(frames.length).toBe(1);
    const frame = frames[0]!;
    // 縦の歯の線は無い (moveTo → lineTo で dx ≈ 0・dy > 3 の短い縦線。糸の斜めの線は数えない)
    const verticalTeeth: Array<{ dx: number; dy: number }> = [];
    for (let i = 0; i + 1 < rec.ops.length; i++) {
      const a = rec.ops[i]!;
      const b = rec.ops[i + 1]!;
      if (a.k === 'moveTo' && b.k === 'lineTo' &&
          Math.abs((a.args?.[0] as number) - REED_X) < 30 &&
          (a.args?.[1] as number) > frame.y && (a.args?.[1] as number) < frame.y + frame.h) {
        const dx = Math.abs((a.args?.[0] as number) - (b.args?.[0] as number));
        const dy = Math.abs((a.args?.[1] as number) - (b.args?.[1] as number));
        if (dx < 1 && dy > 3) verticalTeeth.push({ dx, dy });
      }
    }
    expect(verticalTeeth.length).toBe(0);
  });

  it('3. 板の fillRect の高さがドラムの胴の高さとほぼ同じ (区画ごとに分かれていない)', () => {
    const s = windingState();
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: 0 });
    const boards = fillRectsWithColor(rec).filter(
      (f) => f.v === COLORS.wood && f.w > 0 &&
        f.x >= DRUM_AREA.x - 30 && f.x < DRUM_AREA.x + DRUM_AREA.w + 30 &&
        f.y >= DRUM_AREA.y - 1 && f.y <= DRUM_AREA.y + 1,
    );
    expect(boards.length).toBeGreaterThanOrEqual(10); // 正面に見える板
    for (const b of boards) {
      expect(b.h, `板の高さ ${b.h}`).toBeGreaterThan(DRUM_AREA.h - 4); // 区画の高さ (SEC_H) ではなく胴の高さ
    }
  });

  it('4. 上の端の山なりの内側を塗る fill がある (ellipse のあとに fill)。下の端の円盤と合わせて2つ', () => {
    const s = windingState();
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: 0 });
    const filled: Array<{ y: number }> = [];
    for (let i = 0; i < rec.ops.length; i++) {
      if (rec.ops[i]!.k === 'ellipse' && rec.ops[i + 1]?.k === 'fill') {
        filled.push({ y: (rec.ops[i]!.args?.[1] as number) ?? 0 });
      }
    }
    expect(filled.length).toBe(2);
    const top = filled.find((e) => Math.abs(e.y - DRUM_AREA.y) < 1);
    const bottom = filled.find((e) => Math.abs(e.y - (DRUM_AREA.y + DRUM_AREA.h)) < 1);
    expect(top, '上の端の面').toBeDefined();
    expect(bottom, '下の端の円盤').toBeDefined();
  });

  it('5. 羽の側面: 中央の板の隣には側面が無く、端に近い板の隣には幅のある側面がある', () => {
    const s = windingState();
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: 0 });
    const boards = fillRectsWithColor(rec).filter(
      (f) => f.v === COLORS.wood && f.h > DRUM_AREA.h - 4 && f.y <= DRUM_AREA.y + 1,
    );
    const cx = DRUM_AREA.x + DRUM_AREA.w / 2;
    // 側面 = 左端が別の板の右端に一致する板 (面の右側に描く)
    const isSide = (b: { x: number }): boolean =>
      boards.some((f) => f !== b && Math.abs(f.x + f.w - b.x) < 2);
    const faces = boards.filter((b) => !isSide(b));
    const sides = boards.filter((b) => isSide(b));
    expect(faces.length).toBeGreaterThanOrEqual(10);
    // 中央の板 (面の中心 x が cx に最も近い) の右隣に側面は無い (sin θ = 0)
    const center = faces.reduce((m, b) => (Math.abs(b.x + b.w / 2 - cx) < Math.abs(m.x + m.w / 2 - cx) ? b : m), faces[0]!);
    const nextToCenter = sides.filter((b) => Math.abs(b.x - (center.x + center.w)) < 2);
    expect(nextToCenter.length, '中央の板の隣に側面は無い').toBe(0);
    // 端に近い板 (面の中心 x が cx から最も遠い) の右隣には幅のある側面がある
    const edge = faces.reduce((m, b) => (Math.abs(b.x + b.w / 2 - cx) > Math.abs(m.x + m.w / 2 - cx) ? b : m), faces[0]!);
    const nextToEdge = sides.filter((b) => Math.abs(b.x - (edge.x + edge.w)) < 2 && b.w > 2);
    expect(nextToEdge.length, '端の板の隣に側面がある').toBeGreaterThanOrEqual(1);
  });

  it('5b. 側面の幅はどの角度でも板の幅の 40% 以下 (T2-13 追加修正: 端で太すぎるのを直す)', () => {
    const s = windingState();
    // 板の幅 (fontPx(fit, 12)。fit scale 1 なので 12)
    const slatW = 12;
    const maxSide = slatW * WING_SIDE_MAX_RATIO + 0.5;
    for (const angle of [0, 0.25, 0.5, 0.8, 1.1, 1.4]) {
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: angle });
      const boards = fillRectsWithColor(rec).filter(
        (f) => f.v === COLORS.wood && f.h > DRUM_AREA.h - 4 && f.y <= DRUM_AREA.y + 1,
      );
      const isSide = (b: { x: number }): boolean =>
        boards.some((f) => f !== b && Math.abs(f.x + f.w - b.x) < 2);
      const sides = boards.filter((b) => isSide(b));
      for (const sd of sides) {
        expect(
          sd.w,
          `angle=${angle} の側面の幅が板の幅の 40% を超える`,
        ).toBeLessThanOrEqual(maxSide);
      }
    }
  });

  it('6. 板に丸い穴が並ぶ (正面に近い板に、暗い色の arc の fill が複数)', () => {
    const s = windingState();
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: 0 });
    // 穴: 半径が小さく (10 未満)、ドラムの中の arc
    const holes = rec.ops.filter(
      (op) => op.k === 'arc' && (op.args?.[2] as number) > 1 && (op.args?.[2] as number) < 10 &&
        (op.args?.[0] as number) > DRUM_AREA.x && (op.args?.[0] as number) < DRUM_AREA.x + DRUM_AREA.w &&
        (op.args?.[1] as number) > DRUM_AREA.y && (op.args?.[1] as number) < DRUM_AREA.y + DRUM_AREA.h &&
        rec.ops[rec.ops.indexOf(op) + 1]?.k === 'fill',
    );
    expect(holes.length).toBeGreaterThanOrEqual(10);
  });
});

describe('PU-14b: 張りのランプ (大きく・左寄り。緑・オレンジ・赤・消灯)', () => {
  const draw = (s: WindingState, f = { scale: 0.4, offsetX: 0, offsetY: 0 }): FakeRecorder => {
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, f, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    return rec;
  };
  const lampTexts = (rec: FakeRecorder): string[] =>
    rec.ops.filter((o) => o.k === 'fillText').map((o) => String((o.args as unknown[])[0]));

  it('lampStateOf: 切れた=break、巻いていない (ペダル 0・ready)=off、範囲の中=ok、強すぎ=high、弱すぎ=low', () => {
    const w = windingState();
    expect(lampStateOf({ ...w, tension: (w.range.min + w.range.max) / 2 })).toBe('ok');
    expect(lampStateOf({ ...w, tension: w.range.max + 5 })).toBe('high');
    expect(lampStateOf({ ...w, tension: w.range.min - 5 })).toBe('low');
    expect(lampStateOf(brokenState())).toBe('break');
    expect(lampStateOf(init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 }))).toBe('off');
    expect(lampStateOf({ ...w, pedal: { ...w.pedal, pedal: 0 } })).toBe('off');
  });

  it('適正は緑 (lampOk) に「○」、強すぎは橙 (lampWarn) に「▲」、弱すぎは橙に「▼」、切れたら赤 (lampBreak) に「✕」', () => {
    const w = windingState();
    const ok = draw({ ...w, tension: (w.range.min + w.range.max) / 2 });
    expect(ok.fillStyleLog).toContain(COLORS.lampOk);
    expect(lampTexts(ok)).toContain('○');
    const high = draw({ ...w, tension: w.range.max + 5 });
    expect(high.fillStyleLog).toContain(COLORS.lampWarn);
    expect(lampTexts(high)).toContain('▲');
    expect(high.fillStyleLog).not.toContain(COLORS.lampOk);
    const low = draw({ ...w, tension: w.range.min - 5 });
    expect(low.fillStyleLog).toContain(COLORS.lampWarn);
    expect(lampTexts(low)).toContain('▼');
    const brk = draw(brokenState());
    expect(brk.fillStyleLog).toContain(COLORS.lampBreak);
    expect(lampTexts(brk)).toContain('✕');
  });

  it('巻いていないときは消灯 (灰色。緑・橙・赤を使わず、記号も無い)', () => {
    const off = draw(init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 }));
    for (const c of [COLORS.lampOk, COLORS.lampWarn, COLORS.lampBreak]) {
      expect(off.fillStyleLog).not.toContain(c);
    }
    for (const t of ['○', '▲', '▼', '✕']) {
      expect(lampTexts(off)).not.toContain(t);
    }
  });

  it('ランプは画面上の直径 32px 以上 (縮尺 0.4・0.5・1 のどれでも)。ドラムの上の縁の左寄り (x がドラムの左半分)', () => {
    for (const scale of [0.4, 0.5, 1]) {
      const w = windingState();
      const rec = draw({ ...w, tension: (w.range.min + w.range.max) / 2 }, { scale, offsetX: 0, offsetY: 0 });
      const lamp = lampGeometry({ scale, offsetX: 0, offsetY: 0 });
      expect(lamp.r * scale * 2).toBeGreaterThanOrEqual(32);
      expect(lamp.x).toBeGreaterThanOrEqual(DRUM_AREA.x);
      expect(lamp.x).toBeLessThan(DRUM_AREA.x + DRUM_AREA.w / 2);
      const arcs = rec.ops.filter((o) => o.k === 'arc').map((o) => o.args as number[]);
      expect(arcs.some((a) => a[0] === lamp.x && a[1] === lamp.y && a[2] === lamp.r)).toBe(true);
    }
  });
});
