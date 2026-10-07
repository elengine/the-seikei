import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawBoard } from './renderer';
import { init, reduce } from './logic';
import type { ItowariState } from './logic';
import { itowariPuzzles } from './puzzles';
import { getContent } from '../../core/content/content';
import { COLORS } from '../../core/ui/tokens';
import { makeFakeCtx } from '../winding/renderer.test.helpers';
import type { FakeRecorder } from '../winding/renderer.test.helpers';
import { lanesFor, layoutFor, cellRect, lanePartsFor, HEADER_H } from './geometry';

/**
 * 糸割りの盤面の描画のテスト (PU-16a)。盤面は画面 px (カードの大きさ w×h) で描く。
 * 使う口だけを大きく: 元の糸・巻くコーン・設定した長さ。箱は盤面に描かない (操作欄の段ボールの箱の帯)。
 */

const content = getContent();
const puzzles = itowariPuzzles(content);
const puzzle = puzzles.find((p) => p.id === 's1')!; // レベル1 (6 口)
const SIZE = { w: 377, h: 333 };
const view = { windT: 0, selected: 0, hover: null as number | null };
const hexTest = content.colors.get(content.yarns.get(puzzle.yarnId)!.color)!.hex;

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

function draw(s: ItowariState, v = view, size = SIZE, p = puzzle): FakeRecorder {
  const { ctx, rec } = makeFakeCtx();
  drawBoard(ctx, size, s, content, p, v);
  return rec;
}

const texts = (rec: FakeRecorder): string[] => rec.ops.filter((o) => o.k === 'fillText').map((o) => String(o.args?.[0]));

function fontOf(rec: FakeRecorder, text: string): number {
  const idx = rec.ops.findIndex((o) => o.k === 'fillText' && String(o.args?.[0]) === text);
  for (let j = idx - 1; j >= 0; j--) {
    if (rec.ops[j]!.k === 'font') return Number(/(\d+(?:\.\d+)?)px/.exec(String(rec.ops[j]!.v))?.[1] ?? 0);
  }
  return 0;
}

function styleBefore(ops: FakeRecorder['ops'], i: number): string | null {
  for (let j = i - 1; j >= 0; j--) {
    if (ops[j]!.k === 'style') return String(ops[j]!.v);
  }
  return null;
}

const arcs = (rec: FakeRecorder): Array<{ x: number; y: number; r: number }> =>
  rec.ops.filter((o) => o.k === 'arc').map((o) => ({ x: Number(o.args![0]), y: Number(o.args![1]), r: Number(o.args![2]) }));

describe('糸割り renderer PU-16a (盤面)', () => {
  it('1. 使う口だけを描く: レベル1 は番号 1〜6 (20px 以上)。7 は無い。レベル2 は 12 まで', () => {
    const ts = texts(draw(init(puzzle)));
    for (let i = 1; i <= 6; i++) expect(ts).toContain(String(i));
    expect(ts).not.toContain('7');
    expect(fontOf(draw(init(puzzle)), '1')).toBeGreaterThanOrEqual(20);
    const p2 = puzzles.find((p) => p.id === 's2')!;
    const ts2 = texts(draw(init(p2), view, { w: 689, h: 637 }, p2));
    expect(ts2).toContain('12');
    expect(ts2).not.toContain('13');
  });

  it('2. 設定した長さは口ごとに大きく (24px 以上)。継ぐ糸ありは 2 行 (「4,200 m」「+ 1,800 m」)。未設定の口は「長さ未設定」(24px 以上)', () => {
    let s = setupState();
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: puzzle.sources[1]!.id, slot: 1 }, puzzle);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 1, lengthM: 1800 }, puzzle);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 4200 }, puzzle);
    const rec = draw(s);
    const ts = texts(rec);
    expect(ts).toContain('4,200 m');
    expect(ts).toContain('+ 1,800 m');
    expect(fontOf(rec, '4,200 m')).toBeGreaterThanOrEqual(24);
    // 口が狭い (幅 130px 未満。縦長のスマホ) ときは「未設定」に縮める。広いとき (689×637) は「長さ未設定」
    expect(ts).toContain('未設定');
    const wide = draw(init(puzzle), view, { w: 689, h: 637 });
    expect(texts(wide)).toContain('長さ未設定');
    expect(fontOf(wide, '長さ未設定')).toBeGreaterThanOrEqual(24);
    const rec2 = draw(setupState());
    expect(texts(rec2)).toContain('6,000 m');
    expect(fontOf(rec2, '6,000 m')).toBeGreaterThanOrEqual(24);
  });

  it('3. メーターとはかりは盤面の上の端に 1 行 (「メーター 0 m」「はかり 0 g」。24px 以上)。量った糸の重さが出る', () => {
    const rec = draw(init(puzzle));
    const ts = texts(rec);
    expect(ts).toContain('メーター 0 m');
    expect(ts).toContain('はかり 0 g');
    expect(fontOf(rec, 'メーター 0 m')).toBeGreaterThanOrEqual(24);
    const idx = rec.ops.findIndex((o) => o.k === 'fillText' && String(o.args?.[0]) === 'メーター 0 m');
    expect(Number(rec.ops[idx]!.args![2])).toBeLessThan(HEADER_H);
    const weighed = reduce(init(puzzle), { type: 'weigh', sourceId: puzzle.sources[0]!.id }, puzzle);
    expect(texts(draw(weighed))).toContain('はかり 500 g');
    const winding = { ...setupState(), phase: 'winding', progress: 0.5 } as ItowariState;
    expect(texts(draw(winding))).toContain('メーター 3,000 m');
  });

  it('4. 元の糸の絵は直径 48px 以上 (糸の色の丸)。巻いているあいだは元の糸が細り、巻くコーンが太る', () => {
    const lay = layoutFor(lanesFor(puzzle), SIZE.w, SIZE.h);
    const parts = lanePartsFor(lay, 0, 1);
    const near = (rec: FakeRecorder, c: { cx: number; cy: number }): Array<{ x: number; y: number; r: number }> =>
      arcs(rec).filter((a) => Math.abs(a.x - c.cx) < 1 && Math.abs(a.y - c.cy) < 1);
    const before = near(draw(setupState()), parts.yarn);
    expect(Math.max(...before.map((a) => a.r)) * 2).toBeGreaterThanOrEqual(48);
    const half = near(draw({ ...setupState(), phase: 'winding', progress: 0.9 } as ItowariState), parts.yarn);
    expect(Math.max(...half.map((a) => a.r))).toBeLessThan(Math.max(...before.map((a) => a.r)));
    const coneBefore = near(draw({ ...setupState(), phase: 'winding', progress: 0.1 } as ItowariState), parts.cone);
    const coneAfter = near(draw({ ...setupState(), phase: 'winding', progress: 0.9 } as ItowariState), parts.cone);
    expect(Math.max(...coneAfter.map((a) => a.r))).toBeGreaterThan(Math.max(...coneBefore.map((a) => a.r)));
  });

  it('5. 選んだ口は藍 (COLORS.ai) の太い枠。引っぱって重ねた口 (hover) も枠が出る', () => {
    const rec = draw(init(puzzle), { windT: 0, selected: 2, hover: null });
    const c = cellRect(layoutFor(6, SIZE.w, SIZE.h), 2);
    const frames = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => (e.o.k === 'strokeRect' || e.o.k === 'roundRect') && e.style === COLORS.ai);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.some((e) => Math.abs(Number(e.o.args![0]) - c.x) < 4)).toBe(true);
    const rec2 = draw(init(puzzle), { windT: 0, selected: 0, hover: 3 });
    const c3 = cellRect(layoutFor(6, SIZE.w, SIZE.h), 3);
    expect(rec2.ops.some((o) => (o.k === 'strokeRect' || o.k === 'roundRect') && Math.abs(Number(o.args![0]) - c3.x) < 4 && Math.abs(Number(o.args![1]) - c3.y) < 4)).toBe(true);
  });

  it('6. 失敗のとき、朱の枠と「✕ 足りない」の印が出る (20px 以上)', () => {
    const s = failedState();
    expect(s.phase).toBe('failed');
    const rec = draw(s);
    const shu = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => (e.o.k === 'strokeRect' || e.o.k === 'roundRect') && e.style === COLORS.shu);
    expect(shu.length).toBeGreaterThan(0);
    const mark = texts(rec).find((t) => t.includes('✕ 足りない'))!;
    expect(mark).toBeDefined();
    expect(fontOf(rec, mark)).toBeGreaterThanOrEqual(20);
  });

  it('7. 箱 (段ボール) は盤面に描かない (元の糸の箱は操作欄の帯。箱の色・「箱」の文字が無い)', () => {
    const rec = draw(init(puzzle));
    expect(rec.fillStyleLog).not.toContain(COLORS.cardboard);
    expect(rec.fillStyleLog).not.toContain(COLORS.cardboardTape);
    expect(texts(rec).some((t) => t.includes('箱'))).toBe(false);
  });

  it('8. 描いた範囲 (いちばん下の口の下端) が盤面の高さの 85% 以上 (6 つのカードの大きさで)', () => {
    for (const [w, h] of [[377, 333], [396, 363], [496, 282], [534, 305], [689, 637], [636, 278]] as Array<[number, number]>) {
      for (const n of [4, 5, 6, 12]) {
        const lay = layoutFor(n, w, h);
        let bottom = 0;
        for (let i = 0; i < n; i++) {
          const r = cellRect(lay, i);
          bottom = Math.max(bottom, r.y + r.h);
        }
        expect(bottom / h, `${w}×${h} n${n}`).toBeGreaterThanOrEqual(0.85);
      }
    }
  });

  it('9. 色の直書きが無い (renderer.ts・geometry.ts に hex のリテラルがない)', () => {
    for (const file of ['src/games/itowari/renderer.ts', 'src/games/itowari/geometry.ts']) {
      const src = readFileSync(file, 'utf8');
      expect(/#[0-9a-fA-F]{3,8}\b/.test(src), file).toBe(false);
    }
    expect(hexTest.length).toBeGreaterThan(0);
  });
});
