import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawBoard } from './renderer';
import { init, reduce } from './logic';
import type { BeamingState } from './logic';
import { cmToX, FLANGE_W } from './geometry';
import { getContent } from '../../core/content/content';
import { COLORS } from '../../core/ui/tokens';
import { makeFakeCtx } from '../winding/renderer.test.helpers';

const content = getContent();
const fit = { scale: 1, offsetX: 0, offsetY: 0 };

/** 幅をぴったり合わせて巻き返し中にした状態 */
function beamState(over?: Partial<BeamingState>): BeamingState {
  let s = init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' });
  s = reduce(s, { type: 'moveFlange', side: 'left', deltaCm: -30 - s.leftCm });
  s = reduce(s, { type: 'moveFlange', side: 'right', deltaCm: 30 - s.rightCm });
  s = reduce(s, { type: 'finishSetup' });
  s = reduce(s, { type: 'setPedal', value: 50 });
  return over !== undefined ? { ...s, ...over } : s;
}

/** 直前の style をたどって fillRect の色を調べる (偽の Canvas は style を k:'style' で記録する) */
function styleBefore(ops: Array<{ k: string; v?: unknown }>, i: number): string | null {
  for (let j = i - 1; j >= 0; j--) {
    const o = ops[j]!;
    if (o.k === 'style') return String(o.v);
  }
  return null;
}

describe('beaming renderer T3-02 (盤面)', () => {
  it('1. 円盤 (緑) の位置が leftCm・rightCm で変わる', () => {
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, beamState(), content, 0);
    const flanges = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.machine)
      .map((e) => e.o.args as unknown[]);
    expect(flanges.length).toBe(2); // 左右の円盤
    const xs = flanges.map((a) => Number(a[0])).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(cmToX(60, -30) - FLANGE_W / 2, 6);
    expect(xs[1]).toBeCloseTo(cmToX(60, 30) - FLANGE_W / 2, 6);
    // 円盤を動かすと描画位置も動く
    const moved = beamState({ leftCm: -35 });
    const { ctx: ctx2, rec: rec2 } = makeFakeCtx();
    drawBoard(ctx2, fit, moved, content, 0);
    const flanges2 = rec2.ops
      .map((o, i) => ({ o, style: styleBefore(rec2.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.machine)
      .map((e) => e.o.args as unknown[]);
    const xs2 = flanges2.map((a) => Number(a[0])).sort((a, b) => a - b);
    expect(xs2[0]!).toBeLessThan(xs[0]!);
  });

  it('2. 巻いた厚み (progress) で巻き太りが変わる', () => {
    const drawWoundHeight = (progress: number): number => {
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, beamState({ progress }), content, 0);
      const rects = rec.ops
        .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
        .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.machineLight)
        .map((e) => Number(e.o.args?.[3])); // h
      if (rects.length === 0) return 0; // progress 0 では巻き太りは描かない
      return rects[0]!;
    };
    const h0 = drawWoundHeight(0);
    const h1 = drawWoundHeight(1);
    expect(h0).toBe(0);
    expect(h1).toBeGreaterThan(h0);
  });

  it('3. 乗り上げのとき、その側の円盤の縁が朱になり「乗り上げ」の文字 (20px 以上) が出る', () => {
    // 中央より左へ大きくずらす (シートの左端が左の円盤を越える)
    let s = beamState();
    for (let i = 0; i < 4; i++) {
      s = reduce(s, { type: 'nudge', dir: -1 });
    }
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, 0);
    const shuRects = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.shu);
    expect(shuRects.length).toBeGreaterThan(0);
    const texts = rec.ops.filter((o) => o.k === 'fillText' && String(o.args?.[0]).includes('乗り上げ'));
    expect(texts.length).toBeGreaterThan(0);
    // 直前の font の指定 (20px 以上)
    const idx = rec.ops.indexOf(texts[0]!);
    let font = '';
    for (let j = idx - 1; j >= 0; j--) {
      if (rec.ops[j]!.k === 'font') {
        font = String(rec.ops[j]!.v);
        break;
      }
    }
    expect(Number(/(\d+)px/.exec(font)?.[1] ?? 0)).toBeGreaterThanOrEqual(20);
    // 中央にあれば朱の縁も文字も無い
    const { ctx: ctx2, rec: rec2 } = makeFakeCtx();
    drawBoard(ctx2, fit, beamState(), content, 0);
    const shu2 = rec2.ops
      .map((o, i) => ({ o, style: styleBefore(rec2.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.shu);
    expect(shu2.length).toBe(0);
    expect(rec2.ops.some((o) => o.k === 'fillText' && String(o.args?.[0]).includes('乗り上げ'))).toBe(false);
  });

  it('4. 幅合わせの段階では目標の点線と目盛りが出る。巻き返しでは出ない', () => {
    const s = init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' });
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, 0);
    // 点線は線分の並び (stroke がある)
    expect(rec.ops.some((o) => o.k === 'stroke')).toBe(true);
    // 円盤の内側の線が目標に合っていれば藍の印、外れていれば朱の印
    const marks = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && (e.style === COLORS.ai || e.style === COLORS.shu));
    expect(marks.length).toBe(2); // 左右の印
    // 巻き返しでは点線は出ない (点線は線分の並び。setup でだけ stroke する)
    const { ctx: ctx2, rec: rec2 } = makeFakeCtx();
    drawBoard(ctx2, fit, beamState(), content, 0);
    const strokesInBeam = rec2.ops.filter((o) => o.k === 'stroke').length;
    expect(strokesInBeam).toBe(0);
  });

  it('5. 色の直書きが無い (renderer.ts・geometry.ts に hex のリテラルがない)', () => {
    for (const file of ['src/games/beaming/renderer.ts', 'src/games/beaming/geometry.ts']) {
      const src = readFileSync(file, 'utf8');
      expect(/#[0-9a-fA-F]{3,8}\b/.test(src), file).toBe(false);
    }
  });
});
