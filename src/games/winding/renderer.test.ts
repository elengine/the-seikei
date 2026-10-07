import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawBoard } from './renderer';
import { drawScissors } from './renderer.parts';
import { endPoint, threadY, tableY, THREAD_MARK_X, CREEL_END_X, DRUM_END_X, drumSectionY, DRUM_AREA, REED_X, DIAL_X, DIAL_Y, DIAL_R, reedRect, setLogicalHeight, fontPx, surfaceY, ARC_RISE } from './geometry';
import { COLORS } from '../../core/ui/tokens';
import type { FakeRecorder } from './renderer.test.helpers';

// 偽の ctx (呼ばれた命令を記録する) は helpers に置く
import { makeFakeCtx } from './renderer.test.helpers';
import { SLAT_COUNT, PIN_ANGLE0, lampStateOf, lampGeometry, DRUM_BULGE, drumSectionPinY } from './renderer.parts';
import { WING_SIDE_MAX_RATIO, SLAT_OVER, SLAT_FLARE, STRIPE_H } from './params';
import { init, reduce } from './logic';

// T2-19c: 引っかかりで切れることがあるので、切れたらつないで、張りが範囲の真ん中に来るペダルで巻く
const windCenter = (s0: ReturnType<typeof init>, maxTicks: number): ReturnType<typeof init> => {
  let cur = s0;
  for (let i = 0; i < maxTicks && cur.phase !== 'cutting'; i++) {
    if (cur.phase === 'broken' && cur.brk.kind === 'broken') {
      for (const th of cur.brk.threads) cur = reduce(cur, { type: 'tapThread', thread: th });
      if (cur.phase !== 'winding') continue;
      cur = reduce(cur, { type: 'setPedal', value: 0 });
      cur = reduce(cur, { type: 'tick', dtMs: 100 });
      if (cur.phase !== 'winding') continue;
    }
    const want = Math.round(cur.range.center - (cur.tension - cur.pedal.pedal));
    cur = reduce(cur, { type: 'setPedal', value: Math.min(100, Math.max(0, want)) });
    cur = reduce(cur, { type: 'tick', dtMs: 100 });
  }
  return cur;
};

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
  s = reduce(s, { type: 'setPedal', value: 30 });
  s = reduce(s, { type: 'setPedal', value: 50 });
  // 揺れを止める (あいだを十分長く)・スパイクを起こさない (T2-20a: ランプや絵を決定的にするため)
  s = { ...s, wobble: { ...s.wobble, gapMs: 1e9 }, spikePlan: { left: 0, atMs: 0 } };
  return s;
}

/** 'broken' の状態 (上級で pedal 100) */
function brokenState(seed = 99): WindingState {
  let s = init({ level: 3, patternId: 'p-alt-kon', sections: 7, seed });
  s = reduce(s, { type: 'setPedal', value: 30 });
  s = { ...s, spikePlan: { left: 1, atMs: 0 } }; // スパイクを強制する (3秒で起こり、2秒の猶予で切れる。T2-20a)
  for (let i = 0; i < 300; i++) {
    if (s.phase === 'broken') break;
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
      s = windCenter(s, 2000);
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
      s = windCenter(s, 2000);
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

  it('2. 帯の縞は、帯の全幅にわたる楕円の弧 (上の縁と同じ横半径・縦半径。横の線ではない。T2-16 前2)', () => {
    const { ctx, rec } = makeFakeCtx();
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    s = reduce(s, { type: 'setPedal', value: 30 });
    s = reduce(s, { type: 'setPedal', value: 50 });
    for (let i = 0; i < 50 && s.phase === 'winding'; i++) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect((s.lengths[0] ?? 0)).toBeGreaterThan(0);
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    const rx = DRUM_AREA.w / 2 + 10;
    const stripes = rec.ops.filter(
      (op) => op.k === 'ellipse' && Math.abs(((op.args as number[])[2] ?? 0) - rx) < 1 && ((op.args as number[])[1] ?? 0) > DRUM_AREA.y,
    );
    expect(stripes.length).toBeGreaterThanOrEqual(1);
  });

  it('3. 台の縦の位置が今の帯の区画の中心に合う (fillRect の y が tableY 付近)', () => {
    const { ctx, rec } = makeFakeCtx();
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    s = reduce(s, { type: 'setPedal', value: 30 });
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
      s = windCenter(s, 2000);
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
    // 切れ端の垂れ下がり (クリール側の端・ドラム側の端の x から下へ)。帯の縞の曲線 (中心の x) は数えない
    const curves = rec.ops.filter(
      (op) => op.k === 'quadraticCurveTo' &&
        (Math.abs((op.args?.[2] as number) - CREEL_END_X) < 12 || Math.abs((op.args?.[2] as number) - DRUM_END_X) < 12),
    );
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
    // 縞 (T2-16 前の直しで、区画の下にも胴の塗り (区画の高さ) が入るので、細い縞だけを見る)
    const stripes = inBand.filter((f) => f.h <= 8);
    expect(stripes.length).toBeGreaterThan(1);
    // 縞1本の高さは STRIPE_H (6) 以下
    expect(Math.max(...stripes.map((f) => f.h))).toBeLessThanOrEqual(8);
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
        f.y >= DRUM_AREA.y - 13 && f.y < DRUM_AREA.y + DRUM_AREA.h, // 上端は弧の分だけ上がる (T2-16 その3-4)
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
        f.y >= DRUM_AREA.y - 13 && f.y <= DRUM_AREA.y + 1, // 上端は弧の分だけ上がる (T2-16 その3-4)
    );
    expect(boards.length).toBeGreaterThanOrEqual(10);
    // 板の高さは胴の高さ (区画の高さではない)
    expect(boards.every((b) => b.h > DRUM_AREA.h - 4)).toBe(true);
  });
});

describe('winding renderer T2-10 追加修正 b (上下の端・結び目とピンも回る)', () => {
  const fit = { scale: 1, offsetX: 0, offsetY: 0 };

  it('5. ellipse の面を塗る (fill) は上の面の半円と下の端の円盤の2つ (T2-16 前2 で上の面も胴の色で塗る)', () => {
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
    expect(disks.length).toBe(2); // 上の面の半円 (胴の一部) + 下の端の円盤
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
    return { x: THREAD_MARK_X, y: threadY(t, 8) };
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
        f.y >= DRUM_AREA.y - 13 && f.y <= DRUM_AREA.y + 1, // 上端は弧の分だけ上がる (T2-16 その3-4)
    );
    expect(boards.length).toBeGreaterThanOrEqual(10); // 正面に見える板
    for (const b of boards) {
      expect(b.h, `板の高さ ${b.h}`).toBeGreaterThan(DRUM_AREA.h - 4); // 区画の高さ (SEC_H) ではなく胴の高さ
    }
  });

  it('4. 上の面の半円と下の端の円盤の面を塗る fill がある (T2-16 前2 で上の面も胴の色で塗る)', () => {
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
    expect(top, '上の面の半円 (胴の薄緑)').toBeDefined();
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
    expect(faces.length).toBeGreaterThanOrEqual(6); // 桟の数を減らした (PU-14c)
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

  it('ランプは画面上の直径 32px 以上 (縮尺 0.4・0.5・1 のどれでも)。ドラムの左の外 (光る輪も含めて、ドラムの桟の開きより左。PU-14 追加修正2)', () => {
    for (const scale of [0.4, 0.5, 1]) {
      const w = windingState();
      const rec = draw({ ...w, tension: (w.range.min + w.range.max) / 2 }, { scale, offsetX: 0, offsetY: 0 });
      const lamp = lampGeometry({ scale, offsetX: 0, offsetY: 0 });
      expect(lamp.r * scale * 2).toBeGreaterThanOrEqual(32);
      expect(lamp.x + lamp.r * 1.3).toBeLessThanOrEqual(DRUM_AREA.x - SLAT_FLARE);
      const arcs = rec.ops.filter((o) => o.k === 'arc').map((o) => o.args as number[]);
      expect(arcs.some((a) => a[0] === lamp.x && a[1] === lamp.y && a[2] === lamp.r)).toBe(true);
    }
  });
});

describe('PU-14c: 盤面の絵 (切れた糸・緑の竿・桟・糸の弓なり)', () => {
  const drawS = (s: WindingState): FakeRecorder => {
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0 });
    return rec;
  };

  /** moveTo→lineTo の線分 (論理座標) を集める */
  function segments(rec: FakeRecorder): Array<{ x1: number; y1: number; x2: number; y2: number }> {
    const out: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    let cur: { x: number; y: number } | null = null;
    for (const op of rec.ops) {
      const a = op.args as number[] | undefined;
      if (op.k === 'moveTo' && a) {
        cur = { x: a[0]!, y: a[1]! };
      } else if (op.k === 'lineTo' && a) {
        if (cur !== null) {
          out.push({ x1: cur.x, y1: cur.y, x2: a[0]!, y2: a[1]! });
        }
        cur = { x: a[0]!, y: a[1]! };
      } else if (op.k === 'quadraticCurveTo' && a) {
        cur = { x: a[2]!, y: a[3]! };
      } else if (op.k === 'beginPath') {
        cur = null;
      }
    }
    return out;
  }

  it('切れた糸は、クリール側の端とドラム側の端が別々に垂れ下がり、あいだが空く。ドラムまで届く 1 本の線が無い (切れた糸の y で、クリール側の端からドラム側の端をまたぐ線分が無い)', () => {
    const s = brokenState();
    const broken = (s.brk as { threads: number[] }).threads;
    expect(broken.length).toBeGreaterThan(0);
    const rec = drawS(s);
    const segs = segments(rec);
    for (const th of broken) {
      const y = threadY(th, 8);
      const onY = segs.filter((g) => Math.abs(g.y1 - y) < 0.5 && Math.abs(g.y2 - y) < 0.5);
      for (const g of onY) {
        const lo = Math.min(g.x1, g.x2);
        const hi = Math.max(g.x1, g.x2);
        const spans = lo <= CREEL_END_X + 0.5 && hi >= DRUM_END_X - 0.5;
        expect(spans, `糸 ${th} の線分 ${lo}→${hi} がクリール側の端からドラム側の端まで届いている`).toBe(false);
      }
      // 両側に垂れ下がる曲線がある (クリール側の端 x と ドラム側の端 x から下へ)
      const droops = rec.ops.filter((o) => o.k === 'quadraticCurveTo').map((o) => o.args as number[]);
      expect(droops.some((a) => Math.abs(a[2]! - CREEL_END_X) < 12 && a[3]! > y)).toBe(true);
      expect(droops.some((a) => Math.abs(a[2]! - DRUM_END_X) < 12 && a[3]! > y)).toBe(true);
    }
  });

  it('つながっている糸は、クリールからドラムまで (CONE_X から DRUM_AREA.x まで) 途切れず描く', () => {
    const s = brokenState();
    const broken = (s.brk as { threads: number[] }).threads;
    const ok = [0, 1, 2, 3, 4, 5, 6, 7].filter((t) => !broken.includes(t))[0]!;
    const segs = segments(drawS(s));
    const y = threadY(ok, 8);
    const onY = segs.filter((g) => Math.abs(g.y1 - y) < 0.5 && Math.abs(g.y2 - y) < 0.5);
    // 切れ端の位置をまたぐ区間も、線でつながっている
    expect(onY.some((g) => Math.abs(g.x1 - CREEL_END_X) < 0.5 && Math.abs(g.x2 - DRUM_END_X) < 0.5)).toBe(true);
  });

  it('帯を止める緑の竿は、下のはみ出しが上の 1.5 倍以下で、前より短い (PU-14 追加修正2。下は 16 だった)', () => {
    const rec = drawS(windingState());
    const rects = rec.ops.filter((o) => o.k === 'fillRect').map((o) => o.args as number[]);
    const poles = rects.filter((r) => r[3]! > DRUM_AREA.h + 1 && r[2]! <= 12 && r[0]! >= DRUM_AREA.x - 20);
    expect(poles.length).toBeGreaterThan(0);
    for (const p of poles) {
      const top = DRUM_AREA.y - p[1]!;
      const bottom = p[1]! + p[3]! - (DRUM_AREA.y + DRUM_AREA.h);
      expect(top).toBeGreaterThan(0);
      expect(bottom).toBeLessThanOrEqual(top * 1.5);
      expect(bottom).toBeLessThan(27); // 14 + 弧のぶん 12 (T2-16 その3-4)
    }
  });

  it('桟 (板) は、ドラムの上の縁より上へはみ出し、はみ出した所は外へ開く (左側の板は左へ、右側の板は右へ)。桟の数は減った (SLAT_COUNT 16 以下)', () => {
    expect(SLAT_COUNT).toBeLessThanOrEqual(16);
    const rec = drawS(windingState());
    const pts: Array<{ op: string; x: number; y: number }> = [];
    for (const o of rec.ops) {
      const a = o.args as number[] | undefined;
      if ((o.k === 'moveTo' || o.k === 'lineTo') && a) pts.push({ op: o.k, x: a[0]!, y: a[1]! });
    }
    // 上の縁 (y = DRUM_AREA.y) から SLAT_OVER 上 (y = DRUM_AREA.y - SLAT_OVER) までの台形を探す
    const cx = DRUM_AREA.x + DRUM_AREA.w / 2;
    let found = 0;
    for (let i = 0; i + 3 < pts.length; i++) {
      const [p0, p1, p2, p3] = [pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!];
      const baseY = surfaceY((p0.x + p1.x) / 2, DRUM_AREA.y); // 底辺は上の縁の弧の上 (T2-16 その3-4・その5)
      if (
        p0.op === 'moveTo' && Math.abs(p0.y - baseY) < 1 && Math.abs(p1.y - baseY) < 1 &&
        Math.abs(p2.y - (baseY - SLAT_OVER)) < 1 && Math.abs(p3.y - (baseY - SLAT_OVER)) < 1
      ) {
        found++;
        const bottomMid = (p0.x + p1.x) / 2;
        const topMid = (p2.x + p3.x) / 2;
        const outward = Math.sign(bottomMid - cx) || 1;
        expect(Math.sign(topMid - bottomMid) * outward).toBeGreaterThanOrEqual(0); // 外へ開く (中心の板は真上)
      }
    }
    expect(found).toBeGreaterThanOrEqual(3);
  });

  const cx2 = DRUM_AREA.x + DRUM_AREA.w / 2;
  const radius2 = (DRUM_AREA.w + DRUM_BULGE * 2) / 2;
  it('帯の縞は surfaceY を左から右へなぞる折れ線 (∩。T2-16 その5 で楕円から置き換え)', () => {
    let s = windingState();
    s = { ...s, phase: 'done' } as WindingState;
    const rec = drawS(s);
    const pts = rec.ops.filter((o) => o.k === 'lineTo').map((o) => o.args as number[]);
    // 縞の上の端の点は surfaceY(x, yy) の弧の上に乗る (yy は区画内の縞の高さ)
    // 弧の上にある点から基準の高さ (base = y + ARC_RISE・f(x)) を逆算し、それが縞の並び (STRIPE_H の倍数)
    // または区画のさかい (drumSectionY) に乗っている点を数える (縞と境目が surfaceY で描かれている証拠)
    const onCurve = pts.filter((a) => {
      const px = a[0] ?? 0;
      const yy = a[1] ?? 0;
      if (yy < DRUM_AREA.y - 1 || yy > DRUM_AREA.y + DRUM_AREA.h + 1) return false;
      const f = Math.sqrt(Math.max(0, 1 - ((px - cx2) / radius2) ** 2));
      const baseY = yy + ARC_RISE * f;
      const isStripe = Math.abs(baseY - DRUM_AREA.y) < 1.2 || Math.abs(((baseY - DRUM_AREA.y) % STRIPE_H)) < 1.2 || Math.abs(((baseY - DRUM_AREA.y) % STRIPE_H) - STRIPE_H) < 1.2;
      const isDivider = [0, 1, 2, 3].some((i) => Math.abs(baseY - drumSectionY(i, 3)) < 1.2);
      return isStripe || isDivider;
    });
    expect(onCurve.length, 'surfaceY の弧の上にある縞・境目の点').toBeGreaterThanOrEqual(10);
  });
});

describe('PU-14 追加修正2: 目盛り盤・桟の上の端', () => {
  const rectsOfArcs = (rec: FakeRecorder): Array<{ x: number; y: number; r: number }> =>
    rec.ops.filter((o) => o.k === 'arc').map((o) => ({ x: (o.args as number[])[0]!, y: (o.args as number[])[1]!, r: (o.args as number[])[2]! }));

  it('目盛り盤の円は、ドラムの胴の範囲 (x が DRUM_AREA.x 以上) に入らず、ドラムの左下 (ドラムの中ほどより下) にある', () => {
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, windingState(), content, { threadCount: 8, show: 'red', timeMs: 0 });
    const dial = rectsOfArcs(rec).find((a) => a.r === DIAL_R);
    expect(dial).toBeDefined();
    expect(dial!.x + DIAL_R).toBeLessThanOrEqual(DRUM_AREA.x);
    expect(dial!.y).toBeGreaterThan(DRUM_AREA.y + DRUM_AREA.h / 2);
    expect(dial!.y + DIAL_R).toBeLessThanOrEqual(DRUM_AREA.y + DRUM_AREA.h + 50);
  });

  it('目盛り盤は 3 つの大きさ (論理の高さ 750・1000・1400) でも、ドラムの左下で筬の四角と重ならない', () => {
    for (const H of [750, 1000, 1400]) {
      setLogicalHeight(H);
      for (const sections of [3, 7]) {
        for (let cur = 0; cur < sections; cur++) {
          const reed = reedRect(cur, sections);
          expect(DIAL_X - DIAL_R >= reed.x + reed.w || reed.y + reed.h <= DIAL_Y - DIAL_R || reed.y >= DIAL_Y + DIAL_R, `H${H} s${sections} c${cur}`).toBe(true);
        }
      }
      expect(DIAL_X + DIAL_R).toBeLessThanOrEqual(DRUM_AREA.x);
      expect(DIAL_Y + DIAL_R).toBeLessThanOrEqual(H);
    }
    setLogicalHeight(750);
  });

  it('桟の上の端 (SLAT_OVER) は、ドラムの上の縁の楕円 (半径 12px 分) より上へ出る (縮尺 0.4〜1 のどれでも。楕円の縦の半径は 12/縮尺)', () => {
    for (const scale of [0.4, 0.5, 1]) {
      expect(SLAT_OVER, `scale ${scale}`).toBeGreaterThan(12 / scale);
    }
  });
});

describe('T2-16 前: ドラムの絵の直し (上の縁・帯の下の端。管理者の Fold 8 の指摘)', () => {
  const drum = (s: WindingState, angle = 0): FakeRecorder => {
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: angle });
    return rec;
  };
  /** 'done' に進めた状態 (3帯とも巻き終え、境目の線の問題が見える状態) */
  function doneState(): WindingState {
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    s = { ...s, phase: 'done' } as WindingState;
    return s;
  }

  it('1. 上の縁の内側は胴と同じ薄緑で塗る (板の前)。板のあとには塗り直さない (T2-16 前2)', () => {
    const rec = drum(windingState());
    const rx = DRUM_AREA.w / 2 + 10;
    const topEllipses: Array<{ i: number; filled: boolean }> = [];
    for (let i = 0; i < rec.ops.length; i++) {
      const op = rec.ops[i]!;
      const a = op.args as number[] | undefined;
      if (op.k === 'ellipse' && a && Math.abs((a[1] ?? 0) - DRUM_AREA.y) < 1 && Math.abs((a[2] ?? 0) - rx) < 1) {
        topEllipses.push({ i, filled: rec.ops[i + 1]?.k === 'fill' });
      }
    }
    expect(topEllipses.length).toBeGreaterThanOrEqual(2); // 塗り (胴の一部) と縁の線
    expect(topEllipses[0]!.filled, '上の縁の内側の塗り (胴の薄緑)').toBe(true);
    expect(topEllipses[topEllipses.length - 1]!.filled, '縁の線は塗りでない').toBe(false);
  });

  it('2. 帯と板は上の縁まで描かれる (いちばん上の帯の上の端の弧は縁の楕円と同じ。板の上端の y は縁と同じ)', () => {
    const s = { ...windingState(), lengths: windingState().lengths.map((v, i) => (i === 0 ? 1500 : v)) };
    const rec = drum(s);
    // 帯の上の端: surfaceY の折れ線 (surfaceY(x, DRUM_AREA.y) を 左から右までなぞる)。同じ種なら同じ
    const pts = rec.ops
      .filter((o) => o.k === 'lineTo' || o.k === 'moveTo')
      .map((o) => o.args as number[]);
    const onTopEdge = pts.filter((a) => Math.abs((a[1] ?? 0) - surfaceY((a[0] ?? 0), DRUM_AREA.y)) < 1);
    expect(onTopEdge.length, '帯の上の端が surfaceY の弧の上にある点').toBeGreaterThanOrEqual(5);
    // 板: 上端の y が縁の y と同じ (差 0)
    const boards = fillRectsWithColor(rec).filter((f) => f.v === COLORS.wood && f.h > DRUM_AREA.h - 4);
    expect(boards.length).toBeGreaterThan(0);
    for (const b of boards) {
      // 板の上端は、その x での上の縁の弧の y (T2-16 その3-4)
      expect(Math.abs(b.y - surfaceY(b.x + b.w / 2, DRUM_AREA.y)), `板の上端 ${b.y}`).toBeLessThan(1);
    }
  });

  it('3. 巻き終えた区画の山なりの下にも胴の緑がある (全区画に胴の塗り。ドラムの中に白っぽい塗りは無い)', () => {
    const s = doneState();
    const rec = drum(s);
    const secH = DRUM_AREA.h / s.sections;
    for (let i = 0; i < s.sections; i++) {
      const sy = drumSectionY(i, s.sections);
      const body = fillRectsWithColor(rec).find(
        (f) => Math.abs(f.x - (DRUM_AREA.x - 10)) < 1 && Math.abs(f.y - sy) < 1 && f.h > secH - 1,
      );
      expect(body, `区画 ${i} の胴の緑`).toBeDefined();
    }
    const inDrum = fillRectsWithColor(rec).filter(
      (f) => f.v === COLORS.kinari && f.x >= DRUM_AREA.x - 30 && f.x < DRUM_AREA.x + DRUM_AREA.w + 30,
    );
    expect(inDrum.length, 'ドラムの中に背景色 (kinari) の塗り').toBe(0);
  });

  it('4. 帯の境目に黒い横線を描かない (巻き終えた帯の四角い枠線 strokeRect は無い)', () => {
    const rec = drum(doneState());
    expect(rec.ops.some((o) => o.k === 'strokeRect'), '帯の境目の strokeRect').toBe(false);
  });
});

describe('T2-16 前2: ドラムの絵の直し (描く順と帯の上の端の弧。管理者の Fold 8 の指摘)', () => {
  const drum = (s: WindingState, angle = 0): FakeRecorder => {
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: angle });
    return rec;
  };

  it('1. 描く順: 胴の塗り (上の面の半円を含む) → 縁の線 → 板 → 板の丸い印 → 竿', () => {
    const rec = drum(windingState(), 0);
    const rx = DRUM_AREA.w / 2 + 10;
    const ops = rec.ops;
    // 胴の塗り: 上の縁の楕円の内側の半円 (ellipse → fill)
    let topFaceFill = -1;
    for (let i = 0; i < ops.length; i++) {
      const a = ops[i]!.args as number[] | undefined;
      if (ops[i]!.k === 'ellipse' && a && Math.abs((a[1] ?? 0) - DRUM_AREA.y) < 1 && Math.abs((a[2] ?? 0) - rx) < 1 && ops[i + 1]?.k === 'fill') {
        topFaceFill = i;
        break;
      }
    }
    expect(topFaceFill, '上の面の半円の塗り').toBeGreaterThanOrEqual(0);
    // 縁の線: 同じ楕円を stroke (fill が来ない)
    let edgeStroke = -1;
    for (let i = topFaceFill + 1; i < ops.length; i++) {
      const a = ops[i]!.args as number[] | undefined;
      if (ops[i]!.k === 'ellipse' && a && Math.abs((a[1] ?? 0) - DRUM_AREA.y) < 1 && Math.abs((a[2] ?? 0) - rx) < 1 && ops[i + 1]?.k !== 'fill') {
        edgeStroke = i;
        break;
      }
    }
    expect(edgeStroke, '縁の線 (灰色の線)').toBeGreaterThan(topFaceFill);
    // 板: 縁の線のあとに wood の fillRect
    const firstWood = ops.findIndex((o, i) => i > edgeStroke && o.k === 'style' && o.v === COLORS.wood);
    expect(firstWood, '板 (茶色) は縁の線のあと').toBeGreaterThan(edgeStroke);
    // 板の丸い印: 板のあとに machineDark の小さな arc の fill
    let firstHole = -1;
    for (let i = firstWood + 1; i < ops.length; i++) {
      const a = ops[i]!.args as number[] | undefined;
      if (ops[i]!.k === 'arc' && a && (a[2] ?? 0) < 10 && (a[0] ?? 0) > DRUM_AREA.x && (a[0] ?? 0) < DRUM_AREA.x + DRUM_AREA.w && ops[i + 1]?.k === 'fill') {
        firstHole = i;
        break;
      }
    }
    expect(firstHole, '板の丸い印 (深緑) は板のあと').toBeGreaterThan(firstWood);
    // 竿: 深緑 (machineDark) の縦長の fillRect が印のあと
    let pole = -1;
    for (let i = firstHole + 1; i < ops.length; i++) {
      const a = ops[i]!.args as number[] | undefined;
      if (ops[i]!.k === 'fillRect' && a && (a[3] ?? 0) > DRUM_AREA.h) {
        pole = i;
        break;
      }
    }
    expect(pole, '帯を止める竿 (深緑) は丸い印のあと').toBeGreaterThan(firstHole);
  });

  it('2. 帯の境目の線も surfaceY の ∩ に沿う (区画の上端の高さをなぞる。T2-16 その5 で楕円から置き換え)', () => {
    let s = windingState();
    s = { ...s, lengths: s.lengths.map((v, i) => (i === 0 ? 1500 : v)) };
    const rec = drum(s);
    const pts = rec.ops.filter((o) => o.k === 'lineTo').map((o) => o.args as number[]);
    // 境目 (区画 0 と 1 のさかい = drumSectionY(1)) の点が surfaceY の弧の上にある
    const by = drumSectionY(1, 3);
    const onDiv = pts.filter((a) => Math.abs((a[1] ?? 0) - surfaceY(a[0] ?? 0, by)) < 1);
    expect(onDiv.length, '境目の線が surfaceY の上にある点').toBeGreaterThanOrEqual(5);
  });
});

describe('T2-16 前2 (3): 巻き量の目盛り盤 (白の内側・糸の束と重ならない)', () => {
  it('1. 目盛り盤の円の内側を白で塗る (外枠と針は黒のまま)', () => {
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, windingState(), content, { threadCount: 8, show: 'red', timeMs: 0 });
    let whiteFilled = false;
    let cur = '';
    for (let i = 0; i < rec.ops.length; i++) {
      const op = rec.ops[i]!;
      if (op.k === 'style') cur = String(op.v);
      const a = op.args as number[] | undefined;
      if (op.k === 'arc' && a && Math.abs((a[0] ?? 0) - DIAL_X) < 1 && Math.abs((a[1] ?? 0) - DIAL_Y) < 1 && Math.abs((a[2] ?? 0) - DIAL_R) < 1) {
        // 円の直後から次の描く命令 (fill/stroke) までの間に、fillStyle が白になっている
        let cur2 = cur;
        for (let j = i + 1; j < rec.ops.length; j++) {
          const o2 = rec.ops[j]!;
          if (o2.k === 'style') cur2 = String(o2.v);
          else {
            if (o2.k === 'fill' && cur2 === COLORS.white) whiteFilled = true;
            break;
          }
        }
      }
    }
    expect(whiteFilled, '目盛り盤の内側の白の塗り').toBe(true);
    // 枠と針は sumi (黒) の stroke
    const styles = rec.ops.filter((o) => o.k === 'style').map((o) => String(o.v));
    expect(styles).toContain(COLORS.sumi);
  });

  it('2. 目盛り盤は、筬からドラムへ向かう糸の束と重ならない (どの帯・どの帯の数・どの高さでも)', () => {
    for (const H of [750, 1000, 1400]) {
      setLogicalHeight(H);
      for (const sections of [3, 5, 7]) {
        for (let i = 0; i < sections; i++) {
          const ty = tableY(i, sections);
          const frac = (DIAL_X - REED_X) / (DRUM_AREA.x - REED_X);
          // 糸の束の3本 (dy −30・0・+30) のうち、目盛り盤の x でいちばん下になる線
          let maxBundleY = -Infinity;
          for (const dy of [-30, 0, 30]) {
            const reedY = ty - 40 + dy;
            const drumY = ty + dy * 0.4;
            maxBundleY = Math.max(maxBundleY, reedY + frac * (drumY - reedY));
          }
          expect(
            maxBundleY,
            `H${H} sections${sections} band${i}: 束の下端 ${maxBundleY.toFixed(1)} が目盛り盤の上端 ${DIAL_Y - DIAL_R} より上`,
          ).toBeLessThanOrEqual(DIAL_Y - DIAL_R + 1e-9);
        }
      }
      expect(DIAL_Y + DIAL_R).toBeLessThanOrEqual(H); // 盤面の中
    }
    setLogicalHeight(750);
  });
});

describe('T2-16 その4b・その5 (ハサミの絵: 写真と同じ形・向き)', () => {
  const draw = (s: WindingState, scissors?: { x: number; y: number; cutReady: boolean; openK: number }): FakeRecorder => {
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, { threadCount: 8, show: 'red', timeMs: 0, scissors });
    return rec;
  };
  const styleBefore = (rec: FakeRecorder, i: number): string => {
    let style = '';
    for (let k = 0; k < i; k++) {
      const o = rec.ops[k];
      if (o !== undefined && o.k === 'style') style = String(o.v);
    }
    return style;
  };
  /** ハサミだけを直接描く (drawBoard を通さない) */
  const drawS = (cutReady: boolean, openK = 0): FakeRecorder => {
    const { ctx, rec } = makeFakeCtx();
    drawScissors(ctx, fit, { x: 570, y: 300 }, cutReady, openK);
    return rec;
  };

  it("1. 'cutting' で本物らしいハサミ: 白い円の土台は無く・銀色の刃 (steel の塗り)・赤いねじ (shu の塗り)・黒い輪の持つ手 2 つ", () => {
    const s = { ...windingState(), phase: 'cutting' } as WindingState;
    const rec = draw(s, { x: 570, y: 120, cutReady: false, openK: 1 });
    expect(rec.ops.some((o) => o.k === 'fill' && styleBefore(rec, rec.ops.indexOf(o)) === COLORS.steel), '銀色の刃').toBe(true);
    expect(rec.ops.some((o) => o.k === 'fill' && styleBefore(rec, rec.ops.indexOf(o)) === COLORS.shu), '赤いねじ').toBe(true);
    // 濃い色で線を引いた輪 (arc + stroke) が 2 つ
    let rings = 0;
    for (let i = 0; i < rec.ops.length; i++) {
      const o = rec.ops[i];
      if (o === undefined || o.k !== 'ellipse') continue;
      const a = o.args as number[];
      if ((a[2] ?? 0) < 8 || (a[2] ?? 0) > 20) continue;
      for (let j = i + 1; j < Math.min(i + 4, rec.ops.length); j++) {
        const st = rec.ops[j];
        if (st !== undefined && st.k === 'stroke' && styleBefore(rec, j) === COLORS.sumi) {
          rings += 1;
          break;
        }
      }
    }
    expect(rings, '黒い輪の持つ手').toBe(2);
  });

  it('2. 縦向き: 刃の先は持ち手の輪より上 (y が小さい)。閉じた形では 2 枚の刃が重なって 1 本に見える', () => {
    const rec = drawS(false);
    const pts = rec.ops.filter((o) => o.k === 'lineTo').map((o) => o.args as number[]);
    expect(pts.length).toBeGreaterThan(0);
    const minY = Math.min(...pts.map((a) => a[1] ?? 0)); // 刃の先 (いちばん上)
    const ringArcs = rec.ops.filter((o) => {
      if (o.k !== 'ellipse') return false;
      const a = o.args as number[];
      return (a[2] ?? 0) >= 8 && (a[2] ?? 0) <= 20;
    });
    expect(ringArcs.length, '輪の弧').toBe(2);
    const ringY = Math.min(...ringArcs.map((o) => (o.args as number[])[1] ?? 0));
    expect(minY, '刃の先は輪より上').toBeLessThan(ringY);
    // 閉じた形: 刃の先の x がそろっている (重なって 1 本)
    const tipXs = pts.filter((a) => Math.abs((a[1] ?? 0) - minY) < 1).map((a) => a[0] ?? 0);
    expect(Math.max(...tipXs) - Math.min(...tipXs), '閉じた形の刃の先の横のずれ').toBeLessThanOrEqual(2);
  });

  it('3. 切る所 (cutReady) では 2 枚の刃が X の形に開く (刃の開きは 30〜40 度)', () => {
    const rec = drawS(true);
    const pts = rec.ops.filter((o) => o.k === 'lineTo').map((o) => o.args as number[]);
    const minY = Math.min(...pts.map((a) => a[1] ?? 0));
    const tipXs = pts.filter((a) => Math.abs((a[1] ?? 0) - minY) < 1).map((a) => a[0] ?? 0);
    expect(tipXs.length).toBeGreaterThanOrEqual(2);
    // drawScissors の局所座標 (偽 ctx は translate を無視するので支点=ねじは原点)
    const pivotY = 0;
    const angleOf = (x: number): number => Math.atan2(Math.abs(x), pivotY - minY); // 上向きからの開き角
    const openDeg = (angleOf(Math.max(...tipXs)) + angleOf(Math.min(...tipXs))) * 180 / Math.PI;
    expect(openDeg, '刃の開き (度)').toBeGreaterThanOrEqual(30);
    expect(openDeg, '刃の開き (度)').toBeLessThanOrEqual(40);
  });

  it('4. 閉じる動き (openK 0→1) で刃の開きが 0 度に戻る', () => {
    const closed = drawS(false, 0);
    const pts = closed.ops.filter((o) => o.k === 'lineTo').map((o) => o.args as number[]);
    const minY = Math.min(...pts.map((a) => a[1] ?? 0));
    const tipXs = pts.filter((a) => Math.abs((a[1] ?? 0) - minY) < 1).map((a) => a[0] ?? 0);
    expect(Math.max(...tipXs) - Math.min(...tipXs), '閉じきった刃の横のずれ').toBeLessThanOrEqual(2);
  });

  it("5. 'winding' ではハサミは描かない。scissors を渡さなければ描かない", () => {
    // ハサミの刃 (銀の塗り) が、指定した場所 (570, 120) の近くに無ければ描かれていない
    const hasBladesNear = (rec: FakeRecorder, x: number, y: number): boolean =>
      rec.ops.some((o, i) => {
        if (o.k !== 'fill') return false;
        if (styleBefore(rec, i) !== COLORS.steel) return false;
        for (let j = i - 1; j >= 0 && j >= i - 8; j--) {
          const p = rec.ops[j];
          if (p !== undefined && p.k === 'lineTo') {
            const a = p.args as number[];
            return Math.abs((a[0] ?? 0) - x) < 80 && Math.abs((a[1] ?? 0) - y) < 80;
          }
        }
        return false;
      });
    const rec1 = draw(windingState(), { x: 570, y: 120, cutReady: false, openK: 0 });
    expect(hasBladesNear(rec1, 570, 120), 'winding でハサミを描いていない').toBe(false);
    const s = { ...windingState(), phase: 'cutting' } as WindingState;
    const rec2 = draw(s);
    expect(hasBladesNear(rec2, 570, 120)).toBe(false);
  });
});

describe('T2-16 その5 (帯・板・竿・印・結び目が surfaceY の ∩ で動く)', () => {
  const cx = DRUM_AREA.x + DRUM_AREA.w / 2;
  const radius = (DRUM_AREA.w + DRUM_BULGE * 2) / 2;

  /** drumAngle を与えて描く */
  const drawAt = (th: number, phase = 'winding'): FakeRecorder => {
    const full = windingState();
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, phase === 'done' ? ({ ...full, phase: 'done', current: full.sections, lengths: Array(full.sections).fill(400), windMs: Array(full.sections).fill(40000), okMs: Array(full.sections).fill(40000) } as unknown as WindingState) : full, content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: th });
    return rec;
  };
  /** 竿の fillRect (machineDark・ドラムの高さにまたがる縦の棒) を探す */
  const rodOf = (rec: FakeRecorder, pinX: number): number[] => {
    const o = rec.ops.find((o) => {
      if (o.k !== 'fillRect') return false;
      const a = o.args as number[];
      const prevStyle = rec.ops.slice(0, rec.ops.indexOf(o)).reverse().find((p) => p.k === 'style');
      return String(prevStyle?.v) === COLORS.machineDark && Math.abs((a[0] ?? 0) + (a[2] ?? 0) / 2 - pinX) < 2 && (a[3] ?? 0) > DRUM_AREA.h * 0.8;
    });
    return o ? (o.args as number[]) : [];
  };
  /** 鋼の印 (steel の横長 fillRect) を探す */
  const marksOf = (rec: FakeRecorder, pinX: number): number[][] =>
    rec.ops
      .filter((o) => {
        if (o.k !== 'fillRect') return false;
        const a = o.args as number[];
        const prevStyle = rec.ops.slice(0, rec.ops.indexOf(o)).reverse().find((p) => p.k === 'style');
        return String(prevStyle?.v) === COLORS.steel && Math.abs((a[0] ?? 0) + (a[2] ?? 0) / 2 - pinX) < 6;
      })
      .map((o) => o.args as number[]);

  it('1. 竿の上の端・下の端とも surfaceY と一致し (∩)。下の端は x が中央のときいちばん高い', () => {
    for (const [th, label] of [[-0.5, '左寄り'], [0, '中央'], [0.5, '右寄り']] as Array<[number, string]>) {
      const thPin = th + PIN_ANGLE0;
      const pinX = cx + radius * Math.sin(thPin);
      const rec = drawAt(th);
      const rod = rodOf(rec, pinX);
      expect(rod.length, `竿 (th=${label})`).toBeGreaterThan(0);
      const top = rod[1] ?? 0;
      const bottom = (rod[1] ?? 0) + (rod[3] ?? 0);
      expect(Math.abs(top - (surfaceY(pinX, DRUM_AREA.y) - 24)), `竿の上の端 (${label})`).toBeLessThanOrEqual(1);
      expect(Math.abs(bottom - surfaceY(pinX, DRUM_AREA.y + DRUM_AREA.h)), `竿の下の端 (${label})`).toBeLessThanOrEqual(1);
    }
    // ∩: 中央の竿の下の端は、左右より小さい (高い)
    const pinC = cx + radius * Math.sin(PIN_ANGLE0);
    const pinL = cx + radius * Math.sin(PIN_ANGLE0 - 0.5);
    expect(surfaceY(pinC, DRUM_AREA.y + DRUM_AREA.h)).toBeLessThan(surfaceY(pinL, DRUM_AREA.y + DRUM_AREA.h));
  });

  it('2. 灰色の印 (鋼のピン) は surfaceY (drumSectionPinY) の高さにある (∩ の弓なり)', () => {
    const th = 0.3;
    const thPin = th + PIN_ANGLE0;
    const pinX = cx + radius * Math.sin(thPin);
    const rec = drawAt(th);
    const marks = marksOf(rec, pinX);
    expect(marks.length, '印の数').toBeGreaterThan(0);
    for (const a of marks) {
      const cy = (a[1] ?? 0) + (a[3] ?? 0) / 2;
      expect(Math.abs(cy - surfaceY(pinX, drumSectionPinY(marks.indexOf(a), 3))), `印 ${marks.indexOf(a)}`).toBeLessThanOrEqual(1);
    }
  });

  it('3. 結び目は surfaceY (区画の中心) の高さにある (∩)', () => {
    const th = 0.2;
    const thPin = th + PIN_ANGLE0;
    const pinX = cx + radius * Math.sin(thPin);
    const rec = drawAt(th, 'done');
    // 結び目 (kinari の縁取りの輪。arc が pinX の近くにある)
    const arcs = rec.ops.filter((o) => {
      if (o.k !== 'arc') return false;
      const a = o.args as number[];
      return Math.abs((a[0] ?? 0) - pinX) < 2 && (a[2] ?? 0) > 5 && (a[2] ?? 0) < 20;
    });
    expect(arcs.length, '結び目の輪').toBeGreaterThan(0);
    // 結び目は 5 つの輪を縦に重ねる (中心の輪が区画の中心= surfaceY の高さ)。区画ごとに中心の輪を確かめる
    for (let idx = 0; idx < 3; idx++) {
      const goal = surfaceY(pinX, drumSectionPinY(idx, 3));
      const best = Math.min(...arcs.map((o) => Math.abs(((o.args as number[])[1] ?? 0) - goal)));
      expect(best, `結び目の中心の輪 (区画 ${idx})`).toBeLessThanOrEqual(1);
    }
  });
});

describe('T2-16 その3 追加 (4)(5) (ドラムの板・竿・結び目が弧の上を動く・巻き終えの黒い横線を消す)', () => {
  const fit = { scale: 1, offsetX: 0, offsetY: 0 };

  it('4. 板の上の端の y は surfaceY の弧の上 (x が中央に近いほど小さい。差 1 以下)。下の端も同じ ∩ の向き', () => {
    const cx = DRUM_AREA.x + DRUM_AREA.w / 2;
    const radius = (DRUM_AREA.w + DRUM_BULGE * 2) / 2;
    // 中央に近いほど上の端は小さい (高い)
    expect(surfaceY(cx, DRUM_AREA.y)).toBeLessThan(surfaceY(cx + radius * 0.8, DRUM_AREA.y));
    // 弧の式: surfaceY (中央で ARC_RISE 高い ∩。下の端も同じ向き)
    for (const k of [-0.8, -0.4, 0, 0.4, 0.8]) {
      const x = cx + radius * k;
      const f = Math.sqrt(Math.max(0, 1 - k * k));
      expect(Math.abs(surfaceY(x, DRUM_AREA.y) - (DRUM_AREA.y - ARC_RISE * f))).toBeLessThanOrEqual(1);
      expect(Math.abs(surfaceY(x, DRUM_AREA.y + DRUM_AREA.h) - (DRUM_AREA.y + DRUM_AREA.h - ARC_RISE * f))).toBeLessThanOrEqual(1);
    }
    // 描いた板の上端が弧の上にある: drumAngle 0.5 の板の頂点を探す
    const th = 0.5;
    const sx = cx + radius * Math.sin(th);
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, windingState(), content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: th });
    const sw = fontPx(fit, 12) * Math.cos(th);
    // 板の面の fillRect (wood・上端が弧の上)
    const boards = rec.ops.filter((o) => {
      if (o.k !== 'fillRect') return false;
      const a = o.args as number[];
      return Math.abs((a[0] ?? 0) - (sx - sw / 2)) < 1.5;
    });
    expect(boards.length, '板の面').toBeGreaterThan(0);
    const y0 = (boards[0]!.args as number[])[1] ?? 0;
    expect(Math.abs(y0 - surfaceY(sx, DRUM_AREA.y))).toBeLessThanOrEqual(1);
  });

  it("5. 全部巻き終えた状態 ('done') に、同じ y が続く横の直線の命令が無い (質の波は上の縁と同じ弓なりに乗る)", () => {
    const { ctx } = makeFakeCtx();
    drawBoard(ctx, fit, windingState(), content, { threadCount: 8, show: 'red', timeMs: 0 });
    // done に変えてもう一度
    const rec2 = (() => {
      const { ctx: c2, rec: r2 } = makeFakeCtx();
      const full = windingState();
      // 適正な張りで巻いた (質 1・波 0) 状態。昔の描き方だと黒い横の直線になる
      drawBoard(c2, fit, {
        ...full, phase: 'done', current: full.sections,
        lengths: Array(full.sections).fill(400),
        windMs: Array(full.sections).fill(40000),
        okMs: Array(full.sections).fill(40000),
      } as unknown as WindingState, content, { threadCount: 8, show: 'red', timeMs: 0 });
      return r2;
    })();
    let run = 0;
    for (let n = 1; n < rec2.ops.length; n++) {
      const o = rec2.ops[n]!;
      if (o.k !== 'lineTo' || rec2.ops[n - 1]!.k !== 'lineTo') {
        run = 0;
        continue;
      }
      const y1 = (o.args as number[])[1] ?? -999;
      const y0 = (rec2.ops[n - 1]!.args as number[])[1] ?? -998;
      if (Math.abs(y1 - y0) < 0.01) {
        run += 1;
        expect(run, '同じ y の直線が続かない (黒い横線)').toBeLessThan(2);
      } else {
        run = 0;
      }
    }
  });
});

describe('T2-16 その4a (巻き終えの黒い線を全部消す・竿の下の端は下の円盤の手前の縁まで)', () => {
  const fit = { scale: 1, offsetX: 0, offsetY: 0 };

  /** 全部巻き終えた (質 1) の done の状態で描く */
  function drawDone(): ReturnType<typeof makeFakeCtx>['rec'] {
    const full = windingState();
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, {
      ...full, phase: 'done', current: full.sections,
      lengths: Array(full.sections).fill(400),
      windMs: Array(full.sections).fill(40000),
      okMs: Array(full.sections).fill(40000),
    } as unknown as WindingState, content, { threadCount: 8, show: 'red', timeMs: 0 });
    return rec;
  }

  it('1. 全部巻き終えた状態で、帯の上に濃い色 (sumi・sumiSub) の線を描く命令が無い (直線でも曲線でも)', () => {
    const rec = drawDone();
    // 糸の線の lineTo のあいだ、strokeStyle が濃い色なら帯の上の線。ドラムの面 (x が DRUM_AREA 内) で判定する
    const dark: Set<string> = new Set([COLORS.sumi, COLORS.sumiSub]);
    let style = '';
    let run = 0;
    for (const o of rec.ops) {
      if (o.k === 'style') {
        style = String(o.v);
        run = 0;
        continue;
      }
      if (o.k !== 'lineTo') {
        run = 0;
        continue;
      }
      run += 1;
      // 線らしいもの (4 点以上続く折れ線) が濃い色で、ドラムの面の x の範囲にあればアウト
      if (run >= 4 && dark.has(style)) {
        const x = (o.args as number[])[0] ?? 0;
        if (x >= DRUM_AREA.x - 20 && x <= DRUM_AREA.x + DRUM_AREA.w + 20) {
          expect.fail(`濃い色の線がドラムの上にある (${style} x=${x} run=${run})`);
        }
      }
    }
  });

  it('2. 竿の下の端の y は、その x での下の縁の楕円の手前の弧の y と差 1 以下 (はみ出さない)', () => {
    const cx = DRUM_AREA.x + DRUM_AREA.w / 2;
    const radius = (DRUM_AREA.w + DRUM_BULGE * 2) / 2;
    for (const th of [0, 0.6, -0.6]) {
      const thPin = th + PIN_ANGLE0;
      const pinX = cx + radius * Math.sin(thPin);
      if (Math.cos(th) <= 0) continue;
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, windingState(), content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: th });
      // 竿 (machineDark の縦の棒。x が pinX・幅 10 前後・ドラムの高さにまたがる)
      const rod = rec.ops.find((o) => {
        if (o.k !== 'fillRect') return false;
        const a = o.args as number[];
        const prevStyle = rec.ops.slice(0, rec.ops.indexOf(o)).reverse().find((p) => p.k === 'style');
        return String(prevStyle?.v) === COLORS.machineDark && Math.abs((a[0] ?? 0) + (a[2] ?? 0) / 2 - pinX) < 2 && (a[3] ?? 0) > DRUM_AREA.h * 0.8;
      });
      expect(rod, `竿 (th=${th})`).toBeDefined();
      const a = (rod as { args: number[] }).args;
      const bottom = (a[1] ?? 0) + (a[3] ?? 0);
      expect(Math.abs(bottom - surfaceY(pinX, DRUM_AREA.y + DRUM_AREA.h)), `竿の下の端 (th=${th})`).toBeLessThanOrEqual(1);
    }
  });

  it('3. 竿の上下の端は、x が中央に近いほど上下に広がる (弓なり)', () => {
    const cx = DRUM_AREA.x + DRUM_AREA.w / 2;
    const radius = (DRUM_AREA.w + DRUM_BULGE * 2) / 2;
    const rodHeight = (th: number): number => {
      const pinX = cx + radius * Math.sin(th + PIN_ANGLE0);
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, windingState(), content, { threadCount: 8, show: 'red', timeMs: 0, drumAngle: th });
      const rod = rec.ops.find((o) => {
        if (o.k !== 'fillRect') return false;
        const a = o.args as number[];
        const prevStyle = rec.ops.slice(0, rec.ops.indexOf(o)).reverse().find((p) => p.k === 'style');
        return String(prevStyle?.v) === COLORS.machineDark && Math.abs((a[0] ?? 0) + (a[2] ?? 0) / 2 - pinX) < 2 && (a[3] ?? 0) > DRUM_AREA.h * 0.8;
      });
      expect(rod, `竿 (th=${th})`).toBeDefined();
      const a = (rod as { args: number[] }).args;
      return (a[3] ?? 0);
    };
    // T2-16 その5: 竿の長さは x によらず一定 (上下の端とも surfaceY。中央は全体が上がるだけ)
    const center = rodHeight(-PIN_ANGLE0);
    const off = rodHeight(-PIN_ANGLE0 + 0.9);
    expect(Math.abs(center - off), '竿の長さの差').toBeLessThanOrEqual(1);
  });
});
