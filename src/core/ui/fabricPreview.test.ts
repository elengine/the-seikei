import { describe, it, expect } from 'vitest';
import { drawFabric, fabricSpecFor } from './fabricPreview';
import type { ColorId, Pattern } from '../domain/types';
import type { Content } from '../content/content';
import { COLORS } from './tokens';

/** fillRect / fillStyle / save / clip / restore を記録する偽の ctx */
function makeFakeCtx() {
  const rects: { x: number; y: number; w: number; h: number; fill: string }[] = [];
  const calls: string[] = [];
  const ctx = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    clip: () => calls.push('clip'),
    rect: () => calls.push('rect'),
    beginPath: () => calls.push('beginPath'),
    strokeRect: (x: number, y: number, w: number, h: number) => {
      calls.push('strokeRect');
      rects.push({ x, y, w, h, fill: 'stroke:' + String((ctx as { strokeStyle?: string }).strokeStyle) });
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      calls.push('fillRect');
      rects.push({ x, y, w, h, fill: String(ctx.fillStyle) });
    },
    fillStyle: '' as string,
    strokeStyle: '' as string,
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, calls };
}

describe('drawFabric', () => {
  it('warp 2色 (赤・白)、threadPx 4、幅 16px で経糸のマスが「赤・白・赤・白」の順に並ぶ', () => {
    const { ctx, rects } = makeFakeCtx();
    drawFabric(
      ctx,
      { warp: ['#FF0000', '#FFFFFF'], weft: '#0000FF' },
      { x: 0, y: 0, w: 16, h: 12 },
      { threadPx: 4 },
    );
    // 幅 16px / threadPx 4 = 4本ぶん。経糸の色のマス (row+col 偶数) を列ごとに拾うと
    // 左から「赤・白・赤・白」の順になる (col0row0, col1row1, col2row0, col3row1)
    const cells = rects.filter((r) => !r.fill.startsWith('stroke:'));
    const warpSquares: string[] = [];
    for (let col = 0; col < 4; col++) {
      const inCol = cells.filter((r) => r.x === col * 4);
      const warpSquare = inCol.find((r) => (r.y / 4 + col) % 2 === 0); // row+col が偶数 = 経糸のマス
      if (warpSquare !== undefined) {
        warpSquares.push(warpSquare.fill);
      }
    }
    expect(warpSquares).toEqual(['#FF0000', '#FFFFFF', '#FF0000', '#FFFFFF']);
    // マスは threadPx ごとに (x, y) に並ぶ。幅 16px なら列は x = 0, 4, 8, 12 の4列
    for (const [col, x] of [[0, 0], [1, 4], [2, 8], [3, 12]] as const) {
      const inCol = cells.filter((r) => r.x === x);
      expect(inCol.length).toBeGreaterThan(0);
      expect(inCol.every((r) => r.w === 4 && r.h === 4)).toBe(true);
      void col;
    }
  });

  it('描画の前後で save → clip → restore が呼ばれる', () => {
    const { ctx, calls } = makeFakeCtx();
    drawFabric(
      ctx,
      { warp: ['#FF0000'], weft: '#0000FF' },
      { x: 0, y: 0, w: 8, h: 8 },
    );
    expect(calls[0]).toBe('save');
    expect(calls).toContain('clip');
    expect(calls[calls.length - 1]).toBe('restore');
    expect(calls.indexOf('clip')).toBeLessThan(calls.indexOf('fillRect'));
  });

  it('市松で緯糸の色のマスが混ざる (縦 threadPx ごとに交互)', () => {
    const { ctx, rects } = makeFakeCtx();
    drawFabric(
      ctx,
      { warp: ['#FF0000'], weft: '#0000FF' },
      { x: 0, y: 0, w: 4, h: 8 },
      { threadPx: 4 },
    );
    // 1列ぶん (幅4px) で、縦に 赤の行 と 青の行 が交互
    const fills = rects.filter((r) => !r.fill.startsWith('stroke:')).map((r) => r.fill);
    expect(fills).toContain('#0000FF');
    expect(fills[0]).toBe('#FF0000');
    expect(fills[1]).toBe('#0000FF');
  });

  it('外周に 1px の枠線 (sumiSub) を描く', () => {
    const { ctx, rects } = makeFakeCtx();
    drawFabric(
      ctx,
      { warp: ['#FF0000'], weft: '#0000FF' },
      { x: 2, y: 3, w: 10, h: 8 },
    );
    expect(rects[rects.length - 1]).toMatchObject({ x: 2, y: 3, w: 10, h: 8, fill: `stroke:${COLORS.sumiSub}` });
  });
});

describe('fabricSpecFor', () => {
  function fakeContent(colors: { id: ColorId; hex: string }[]): Content {
    return {
      colors: new Map(colors.map((c) => [c.id, { id: c.id, name: c.id, hex: c.hex, symbol: '●' }])),
      cores: new Map(),
      yarns: new Map(),
      patterns: new Map(),
      creelPuzzles: [],
      problems: [],
    };
  }

  it('tone があると hex の明るさが変わり、正の tone は明るくなる (kon-a と kon-c で違い)', () => {
    const content = fakeContent([{ id: 'kon', hex: '#1F2A44' }]);
    content.yarns.set('kon-a', { id: 'kon-a', color: 'kon', hinban: 'W-4812', spec: 'ウール 2/48', core: 'green' });
    content.yarns.set('kon-c', { id: 'kon-c', color: 'kon', hinban: 'W-5310', spec: 'ウール紡毛 1/20', tone: 18, core: 'red' });
    const pattern: Pattern = {
      id: 'p1',
      name: 'シャドーストライプ',
      plan: [{ yarn: 'kon-a', count: 4 }, { yarn: 'kon-c', count: 4 }],
      weft: 'kon',
      era: { from: 1967, to: 2004 },
      description: '説明',
      difficulty: 2,
    };
    const spec = fabricSpecFor(pattern, content);
    expect(spec.warp.slice(0, 4)).toEqual(Array(4).fill('#1F2A44')); // tone 無しは元の色
    expect(spec.warp.slice(4, 8)).toEqual(Array(4).fill(spec.warp[4]!)); // 4本とも同じ色
    expect(spec.warp[4]).not.toBe('#1F2A44'); // tone で変わっている
    // 明るさの比較: 各チャンネルが元より大きい (正の tone は明るく)
    const orig = [0x1F, 0x2A, 0x44];
    const toned = spec.warp[4]!;
    for (let i = 0; i < 3; i++) {
      const ch = parseInt(toned.slice(1 + i * 2, 3 + i * 2), 16);
      expect(ch).toBeGreaterThan(orig[i]!);
    }
  });

  it('負の tone は暗くなる', () => {
    const content = fakeContent([{ id: 'kon', hex: '#1F2A44' }]);
    content.yarns.set('kon-b', { id: 'kon-b', color: 'kon', hinban: 'W-4821', spec: 'ウール 2/60', tone: -10, core: 'green' });
    const pattern: Pattern = {
      id: 'p1',
      name: 'シャドーストライプ',
      plan: [{ yarn: 'kon-b', count: 2 }],
      weft: 'kon',
      era: { from: 1967, to: 2004 },
      description: '説明',
      difficulty: 2,
    };
    const spec = fabricSpecFor(pattern, content);
    const orig = [0x1F, 0x2A, 0x44];
    const toned = spec.warp[0]!;
    for (let i = 0; i < 3; i++) {
      const ch = parseInt(toned.slice(1 + i * 2, 3 + i * 2), 16);
      expect(ch).toBeLessThan(orig[i]!);
    }
  });

  it('柄の plan が色の配列に展開される (kon×7, shiro×1 → 紺7つ・白1つ)', () => {
    const content = fakeContent([
      { id: 'kon', hex: '#1F2A44' },
      { id: 'shiro', hex: '#F2F0EA' },
    ]);
    const pattern: Pattern = {
      id: 'p1',
      name: 'ピンストライプ',
      plan: [{ yarn: 'kon-a', count: 7 }, { yarn: 'shiro-a', count: 1 }],
      weft: 'kon',
      era: { from: 1967, to: 2004 },
      description: '説明',
      difficulty: 1,
    };
    // plan の yarn (YarnTypeId) は糸→色をたどって色にするため、yarns も用意する
    content.yarns.set('kon-a', { id: 'kon-a', color: 'kon', hinban: 'W-4812', spec: 'ウール 2/48', core: 'green' });
    content.yarns.set('shiro-a', { id: 'shiro-a', color: 'shiro', hinban: 'W-2200', spec: 'ウール 2/48', core: 'green' });
    const spec = fabricSpecFor(pattern, content);
    expect(spec.warp).toEqual([
      '#1F2A44', '#1F2A44', '#1F2A44', '#1F2A44', '#1F2A44', '#1F2A44', '#1F2A44', '#F2F0EA',
    ]);
    expect(spec.weft).toBe('#1F2A44');
  });
});
