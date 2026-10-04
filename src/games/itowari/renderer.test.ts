import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawBoard } from './renderer';
import { init, reduce } from './logic';
import type { ItowariState } from './logic';
import { itowariPuzzles } from './puzzles';
import { getContent } from '../../core/content/content';
import { COLORS } from '../../core/ui/tokens';
import { makeFakeCtx } from '../winding/renderer.test.helpers';
import { fmtM } from './geometry';

/**
 * 糸割りの盤面の描画のテスト (P2b T2b-02)。
 * 設定した長さの数字・progress でコーンが太る・失敗の朱の印・メーター・はかり・色の直書きが無い。
 */

const content = getContent();
const puzzle = itowariPuzzles(content).find((p) => p.id === 's1')!;
const fit = { scale: 1, offsetX: 0, offsetY: 0 };
const yarnHexTest = content.colors.get(content.yarns.get(puzzle.yarnId)!.color)!.hex;

/** 口1に 6,000 m を設定した状態 */
function setupState(): ItowariState {
  let s = init(puzzle);
  s = reduce(s, { type: 'mount', spindle: 0, sourceId: puzzle.sources[0]!.id, slot: 0 }, puzzle);
  s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 6000 }, puzzle);
  return s;
}

/** 失敗した状態 (元の糸より多く設定して sourceShort) */
function failedState(): ItowariState {
  let s = init(puzzle);
  s = reduce(s, { type: 'mount', spindle: 0, sourceId: puzzle.sources[0]!.id, slot: 0 }, puzzle);
  s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 7000 }, puzzle);
  s = reduce(s, { type: 'start' }, puzzle);
  return reduce(s, { type: 'tick', dtMs: 4000 }, puzzle);
}

function texts(rec: { ops: Array<{ k: string; args?: unknown[]; v?: unknown }> }): string[] {
  return rec.ops.filter((o) => o.k === 'fillText').map((o) => String(o.args?.[0]));
}

function fontOf(rec: { ops: Array<{ k: string; v?: unknown; args?: unknown[] }> }, text: string): string {
  const ops = rec.ops;
  const idx = ops.findIndex((o) => o.k === 'fillText' && String(o.args?.[0]) === text);
  for (let j = idx - 1; j >= 0; j--) {
    if (ops[j]!.k === 'font') return String(ops[j]!.v);
  }
  return '';
}

/** 直前の style をたどる (偽の Canvas は style を k:'style' で記録する) */
function styleBefore(ops: Array<{ k: string; v?: unknown }>, i: number): string | null {
  for (let j = i - 1; j >= 0; j--) {
    if (ops[j]!.k === 'style') return String(ops[j]!.v);
  }
  return null;
}

describe('糸割り renderer T2b-02 (盤面)', () => {
  it('1. 設定した長さの数字 (継ぐ糸ありは「4,200 + 1,800 m」。無い口は「— m」。20px 以上)', () => {
    let s = setupState();
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: puzzle.sources[1]!.id, slot: 1 }, puzzle);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 1, lengthM: 1800 }, puzzle);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 4200 }, puzzle);
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, puzzle, 0);
    const ts = texts(rec);
    expect(ts).toContain('4,200 + 1,800 m');
    expect(ts).toContain('— m'); // 設定していない口
    expect(Number(/(\d+)px/.exec(fontOf(rec, '4,200 + 1,800 m'))?.[1] ?? 0)).toBeGreaterThanOrEqual(20);
    // 1本だけの口
    const s2 = setupState();
    const { ctx: ctx2, rec: rec2 } = makeFakeCtx();
    drawBoard(ctx2, fit, s2, content, puzzle, 0);
    expect(texts(rec2)).toContain('6,000 m');
    // 番号 1〜12
    for (let i = 1; i <= 12; i++) expect(ts).toContain(String(i));
  });

  it('2. 巻いている回の progress で、下のコーンが設定した長さに比例して太る', () => {
    const woundWidth = (progress: number): number => {
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, { ...setupState(), phase: 'winding', progress }, content, puzzle, 0);
      const rects = rec.ops
        .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
        .filter((e) => e.o.k === 'fillRect' && e.style === yarnHexTest)
        .map((e) => Number(e.o.args?.[2])); // w
      return Math.max(...rects, 0);
    };
    expect(woundWidth(0.8)).toBeGreaterThan(woundWidth(0.2));
  });

  it('3. 失敗のとき、朱の枠と「✕ 足りない」の印が出る (20px 以上)', () => {
    const s = failedState();
    expect(s.phase).toBe('failed');
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, puzzle, 0);
    const shu = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => (e.o.k === 'fillRect' || e.o.k === 'strokeRect') && e.style === COLORS.shu);
    expect(shu.length).toBeGreaterThan(0);
    const ts = texts(rec);
    expect(ts.some((t) => t.includes('✕ 足りない'))).toBe(true);
    const mark = ts.find((t) => t.includes('✕ 足りない'))!;
    expect(Number(/(\d+)px/.exec(fontOf(rec, mark))?.[1] ?? 0)).toBeGreaterThanOrEqual(20);
  });

  it('4. メーター: 巻いている回の、いちばん長い口の進みと周の数 (progress 0.5 × 6,000m = 3,000 m)', () => {
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, { ...setupState(), phase: 'winding', progress: 0.5 }, content, puzzle, 0);
    const ts = texts(rec);
    expect(ts).toContain('3,000 m');
    // 周の数 (窓)。1周 1,000m なので 3,000m は 3周
    expect(ts).toContain('3');
    // 針 (線) が描かれる
    expect(rec.ops.some((o) => o.k === 'lineTo')).toBe(true);
  });

  it('5. はかり: 最後に量った糸の重さ「500 g」', () => {
    let s = setupState();
    s = reduce(s, { type: 'weigh', sourceId: puzzle.sources[0]!.id }, puzzle);
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, puzzle, 0);
    expect(texts(rec)).toContain('500 g');
  });

  it('6. fmtM は 3桁ごとにカンマ', () => {
    expect(fmtM(6000)).toBe('6,000');
    expect(fmtM(0)).toBe('0');
    expect(fmtM(123456)).toBe('123,456');
  });

  it('7. 色の直書きが無い (renderer.ts・geometry.ts に hex のリテラルがない)', () => {
    for (const file of ['src/games/itowari/renderer.ts', 'src/games/itowari/geometry.ts']) {
      const src = readFileSync(file, 'utf8');
      expect(/#[0-9a-fA-F]{3,8}\b/.test(src), file).toBe(false);
    }
  });
});
