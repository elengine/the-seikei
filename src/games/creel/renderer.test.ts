import { describe, it, expect } from 'vitest';
import { drawBoard } from './renderer';
import { init } from './logic';
import type { CreelState } from './logic';
import { getContent } from '../../core/content/content';
import { fitStage, type StageFit } from '../../core/viewport/viewport';

const content = getContent();
const terms = { t: (k: string) => k };
const fit: StageFit = fitStage(1000, 750, 1180, 820);

/** 呼び出しを記録する偽の ctx */
function makeFakeCtx() {
  const calls: { op: string; args: unknown[]; fill?: string; stroke?: string; font?: string; lineWidth?: number; lineDash?: number[] }[] = [];
  const state = { fill: '', stroke: '', font: '', lineWidth: 1, lineDash: [] as number[] };
  const ctx = {
    canvas: { width: 800, height: 600 },
    get fillStyle() {
      return state.fill;
    },
    set fillStyle(v: string) {
      state.fill = v;
    },
    get strokeStyle() {
      return state.stroke;
    },
    set strokeStyle(v: string) {
      state.stroke = v;
    },
    get font() {
      return state.font;
    },
    set font(v: string) {
      state.font = v;
      calls.push({ op: 'font', args: [v] });
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(v: number) {
      state.lineWidth = v;
    },
    setLineDash(v: number[]) {
      state.lineDash = v;
      calls.push({ op: 'setLineDash', args: [v] });
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      calls.push({ op: 'fillRect', args: [x, y, w, h], fill: state.fill });
    },
    strokeRect: (x: number, y: number, w: number, h: number) => {
      calls.push({ op: 'strokeRect', args: [x, y, w, h], stroke: state.stroke, lineWidth: state.lineWidth });
    },
    beginPath: () => calls.push({ op: 'beginPath', args: [] }),
    closePath: () => calls.push({ op: 'closePath', args: [] }),
    moveTo: (x: number, y: number) => calls.push({ op: 'moveTo', args: [x, y] }),
    lineTo: (x: number, y: number) => calls.push({ op: 'lineTo', args: [x, y] }),
    stroke: () => calls.push({ op: 'stroke', args: [], stroke: state.stroke, lineWidth: state.lineWidth }),
    fill: () => calls.push({ op: 'fill', args: [], fill: state.fill }),
    fillText: (text: string, x: number, y: number) => {
      calls.push({ op: 'fillText', args: [text, x, y], fill: state.fill, font: state.font });
    },
    strokeText: (text: string, x: number, y: number) => {
      calls.push({ op: 'strokeText', args: [text, x, y], stroke: state.stroke, font: state.font });
    },
    save: () => calls.push({ op: 'save', args: [] }),
    restore: () => calls.push({ op: 'restore', args: [] }),
    arc: (x: number, y: number, r: number, a0: number, a1: number) => calls.push({ op: 'arc', args: [x, y, r, a0, a1] }),
    measureText: () => ({ width: 10 }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function s1Empty(): CreelState {
  const puzzle = content.creelPuzzles.find((p) => p.id === 's1')!;
  return init(puzzle, content);
}

describe('drawBoard', () => {
  it('s1 の空の状態で描くと、エラーなく終わり、点線の輪郭が 6 マスぶん描かれる', () => {
    const { ctx, calls } = makeFakeCtx();
    expect(() => drawBoard(ctx, fit, s1Empty(), content, terms)).not.toThrow();
    const dashes = calls.filter((c) => c.op === 'setLineDash' && (c.args[0] as number[]).length > 0);
    expect(dashes.length).toBe(6); // 空いている軸 6 つぶんの点線
  });

  it('marks に wrong が 2つあると、✕ の線が 2組描かれる (shu 色)', () => {
    const { ctx, calls } = makeFakeCtx();
    const s = { ...s1Empty(), marks: { wrong: [0, 2], empty: [] } };
    drawBoard(ctx, fit, s, content, terms);
    // ✕ は stroke 2本で 1組。wrong 2つ → shu 色で stroke 4回
    const shuStrokes = calls.filter((c) => c.op === 'stroke' && c.stroke === '#B03A2E');
    expect(shuStrokes.length).toBe(4);
  });

  it('描画で使った文字の大きさ (font の設定値) が、すべて fontPx(fit, 20) 以上', () => {
    const { ctx, calls } = makeFakeCtx();
    const s: CreelState = {
      ...s1Empty(),
      placed: ['kon-a', null, 'kon-a', null, null, null],
      marks: { wrong: [], empty: [1] },
      inspected: 0,
    };
    drawBoard(ctx, fit, s, content, terms);
    // 文字は画面 px で描く (NFR-U-01: 画面上 20px 以上) ので、font の設定値が 20 以上
    const fonts = calls.filter((c) => c.op === 'font').map((c) => c.args[0] as string);
    expect(fonts.length).toBeGreaterThan(0);
    for (const f of fonts) {
      const m = f.match(/(\d+(?:\.\d+)?)px/);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(20 - 0.001);
    }
  });

  it('背景は kinari 色で塗られる', () => {
    const { ctx, calls } = makeFakeCtx();
    drawBoard(ctx, fit, s1Empty(), content, terms);
    const bg = calls.find((c) => c.op === 'fillRect');
    expect(bg?.fill).toBe('#F7F3E8');
  });

  it('立っているコーンは塗りつぶし (fill) があり、段階1〜3 は品番の文字が出る', () => {
    const { ctx, calls } = makeFakeCtx();
    const s = { ...s1Empty(), placed: ['kon-a', null, null, null, null, null] };
    drawBoard(ctx, fit, s, content, terms);
    const texts = calls.filter((c) => c.op === 'fillText').map((c) => c.args[0] as string);
    expect(texts).toContain('W-4812'); // 品番 (段階1 なので表示)
    expect(texts).toContain('●'); // 色の記号
  });

  it('段階4 では品番を描かない', () => {
    const { ctx, calls } = makeFakeCtx();
    const puzzle = content.creelPuzzles.find((p) => p.id === 's4')!;
    const s = { ...init(puzzle, content), placed: ['kon-a', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null] };
    drawBoard(ctx, fit, s, content, terms);
    const texts = calls.filter((c) => c.op === 'fillText').map((c) => c.args[0] as string);
    expect(texts).not.toContain('W-4812');
  });

  it('inspected があると吹き出しに品番と説明 (spec) を描く', () => {
    const { ctx, calls } = makeFakeCtx();
    const s = { ...s1Empty(), placed: ['kon-a', null, null, null, null, null], inspected: 0 };
    drawBoard(ctx, fit, s, content, terms);
    const texts = calls.filter((c) => c.op === 'fillText').map((c) => c.args[0] as string);
    expect(texts).toContain('W-4812');
    expect(texts).toContain('ウール 2/48'); // spec
  });
});
