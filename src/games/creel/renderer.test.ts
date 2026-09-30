import { describe, it, expect } from 'vitest';
import { drawBoard } from './renderer';
import { init } from './logic';
import type { CreelState } from './logic';
import { getContent } from '../../core/content/content';
import { fitStage, type StageFit } from '../../core/viewport/viewport';
import { COLORS } from '../../core/ui/tokens';

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
    measureText: (text: string) => ({ width: text.length * 12 }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** 偽の fit を作る (scale と offset を指定できる) */
function makeFit(scale: number, offsetX = 0, offsetY = 0): StageFit {
  return { scale, offsetX, offsetY };
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
    const shuStrokes = calls.filter((c) => c.op === 'stroke' && c.stroke === COLORS.shu);
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

  describe('追加修正1: 実際の幅を測って描く', () => {
    it('品番: マスの画面上の幅が 90px なら fillText に品番が渡され、40px なら渡されない', () => {
      // s1 は 1段×6軸。CREEL_AREA.w=880 → マス幅 146.7 論理。
      // 画面幅 = 146.7 × scale。scale=0.7 → 102px (90px より広い)。scale=0.25 → 36.7px (40px より狭い)
      const wide = makeFit(0.7);
      const { ctx, calls } = makeFakeCtx();
      const s = { ...s1Empty(), placed: ['kon-a', null, null, null, null, null] };
      drawBoard(ctx, wide, s, content, terms);
      let texts = calls.filter((c) => c.op === 'fillText').map((c) => c.args[0] as string);
      expect(texts).toContain('W-4812');

      const narrow = makeFit(0.25);
      const r2 = makeFakeCtx();
      drawBoard(r2.ctx, narrow, s, content, terms);
      texts = r2.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0] as string);
      expect(texts).not.toContain('W-4812');
    });

    it('吹き出し: 枠の幅が「2行のうち広い方の測った幅 + 20」で、左右が Canvas の内側に収まる', () => {
      // inspected の吹き出し。品番 W-4812 (6文字=72px)、spec ウール 2/48 (8文字=96px) → 枠幅 = 96+20 = 116
      const f = makeFit(1, 0, 0);
      const { ctx, calls } = makeFakeCtx();
      const s = { ...s1Empty(), placed: ['kon-a', null, null, null, null, null], inspected: 0 };
      drawBoard(ctx, f, s, content, terms);
      const rects = calls.filter((c) => c.op === 'strokeRect');
      // 吹き出しの枠 (strokeRect)。幅 116 で、x が 4 以上・x+116 が 800 以下
      const speech = rects.find((c) => Math.abs((c.args[2] as number) - 116) < 0.5);
      expect(speech).toBeDefined();
      expect(speech!.args[0] as number).toBeGreaterThanOrEqual(4 - 0.001);
      expect((speech!.args[0] as number) + (speech!.args[2] as number)).toBeLessThanOrEqual(800 + 0.001);
      // 文字が枠の内側 (左右の余白 10px)。吹き出しの文字は「品番の描画 (コーンの下)」と x が違う
      const texts = calls.filter((c) => c.op === 'fillText' && (c.args[0] === 'W-4812' || c.args[0] === 'ウール 2/48'));
      expect(texts.length).toBe(3); // コーンの下の品番 + 吹き出しの2行
      // 吹き出しの文字は、枠の左端 + 10 の位置から始まる
      const inSpeech = texts.filter((c) => Math.abs((c.args[1] as number) - ((speech!.args[0] as number) + 10)) < 0.001);
      expect(inSpeech.length).toBe(2);
      for (const t of inSpeech) {
        const tw = (t.args[0] as string).length * 12;
        expect((t.args[1] as number) + tw).toBeLessThanOrEqual((speech!.args[0] as number) + 116 - 10 + 0.001);
      }
      // コーンが左端のマス (inspected 0) でも枠が Canvas 内側
      const s2 = { ...s1Empty(), placed: ['kon-a', null, null, null, null, null], inspected: 0 };
      const r2 = makeFakeCtx();
      drawBoard(r2.ctx, makeFit(1, 0, 0), s2, content, terms);
      const speech2 = r2.calls.filter((c) => c.op === 'strokeRect').find((c) => Math.abs((c.args[2] as number) - 116) < 0.5);
      expect(speech2).toBeDefined();
      expect(speech2!.args[0] as number).toBeGreaterThanOrEqual(4 - 0.001);
    });

    it('番号: マスの画面上の幅が広ければ番号が描かれ textAlign が center。狭ければ描かれない', () => {
      // 段階5 (3段×8) は各段の最初だけ番号。scale 大なら描く・center
      const f = makeFit(0.7);
      const { ctx, calls } = makeFakeCtx();
      const puzzle = content.creelPuzzles.find((p) => p.id === 's5')!;
      const s = init(puzzle, content);
      drawBoard(ctx, f, s, content, terms);
      const numCalls = calls.filter((c) => c.op === 'fillText' && c.args[0] === '1');
      expect(numCalls.length).toBeGreaterThan(0);
      // textAlign は呼び出し履歴に無いので、s1 (全マス) で center を確認する
      const r2 = makeFakeCtx();
      drawBoard(r2.ctx, f, s1Empty(), content, terms);
      // 番号「1」はマスの中央揃えで描かれる。マス 0 の中心 x = toPx(60+73.3)*0.7
      const num = r2.calls.find((c) => c.op === 'fillText' && c.args[0] === '1');
      expect(num).toBeDefined();
      const cellW = (880 / 6) * f.scale;
      const centerX = 60 * f.scale + cellW / 2;
      expect(Math.abs((num!.args[1] as number) - centerX)).toBeLessThan(cellW / 2);

      // 狭い場合 (scale 0.1 → マス幅 14.7px、番号 1文字=12px は 14.7-4=10.7 を超える → 描かれない)
      const narrow = makeFit(0.1);
      const r3 = makeFakeCtx();
      drawBoard(r3.ctx, narrow, s1Empty(), content, terms);
      const nums3 = r3.calls.filter((c) => c.op === 'fillText' && c.args[0] === '1');
      expect(nums3.length).toBe(0);
    });
  });

  it('番号: マスが低くてもコーンの上端が下がるので番号が描かれる。コーンが 24px 未満になるなら番号は描かれない', () => {
    // 縦長相当: scale 0.4、マス (3段×8)。rect.h = 200 論理 → 80 画面。通常コーン上端 = y+14.4 画面、
    // 番号下端 = y+20 → 重なる。コーン上端を下げると coneH = 0.78h - (20+2)/scale 論理…
    const f = makeFit(0.4);
    const { ctx, calls } = makeFakeCtx();
    const puzzle = content.creelPuzzles.find((p) => p.id === 's5')!;
    const s = init(puzzle, content);
    drawBoard(ctx, f, s, content, terms);
    // 段階5は各段の最初のマス (1, 9, 17) に番号
    const nums = calls.filter((c) => c.op === 'fillText' && ['1', '9', '17'].includes(c.args[0] as string));
    expect(nums.length).toBe(3);
  });

  describe('追加修正4 A: 高精細な画面 (devicePixelRatio 2) でも吹き出しが Canvas の内側に収まる', () => {
    it('Canvas の実寸が 824 (2倍) でも、収める右の端は clientWidth (412) を使う', () => {
      const { ctx, calls } = makeFakeCtx();
      // 偽の canvas: 実寸 824×1010、画面上 412×505 (devicePixelRatio 2)
      (ctx.canvas as { width: number; height: number; clientWidth: number; clientHeight: number }).width = 824;
      (ctx.canvas as { width: number; height: number; clientWidth: number; clientHeight: number }).height = 1010;
      Object.defineProperty(ctx.canvas, 'clientWidth', { value: 412 });
      Object.defineProperty(ctx.canvas, 'clientHeight', { value: 505 });
      // 右の端のマス (段階1の6軸。マス5 = 右端) をしらべる
      const s = { ...s1Empty(), placed: [null, null, null, null, null, 'kon-a'], inspected: 5 };
      // fit は 412×505 相当で作る (画面 px の座標系)
      const f = fitStage(1000, 750, 412, 505);
      drawBoard(ctx, f, s, content, terms);
      const speech = calls.filter((c) => c.op === 'strokeRect');
      expect(speech.length).toBeGreaterThan(0);
      for (const c of speech) {
        const x = c.args[0] as number;
        const w = c.args[2] as number;
        expect(x + w).toBeLessThanOrEqual(408); // Canvas の画面幅 412 - 余白 4
      }
    });
  });
});
