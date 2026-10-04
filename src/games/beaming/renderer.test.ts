import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawBoard, mainHex } from './renderer';
import { init, reduce } from './logic';
import type { BeamingState } from './logic';
import { cmToX, BOARD, setBoardHeight, FLANGE_RX, DRUM_X, DRUM_W, woundRadius } from './geometry';
import { getContent } from '../../core/content/content';
import { COLORS } from '../../core/ui/tokens';
import { makeFakeCtx } from '../winding/renderer.test.helpers';
import type { FakeRecorder } from '../winding/renderer.test.helpers';

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

function draw(s: BeamingState, angle = 0): FakeRecorder {
  const { ctx, rec } = makeFakeCtx();
  drawBoard(ctx, fit, s, content, angle);
  return rec;
}

/** 直前の fillStyle (style の記録) をたどる */
function styleBefore(ops: Array<{ k: string; v?: unknown }>, i: number): string | null {
  for (let j = i - 1; j >= 0; j--) {
    const o = ops[j]!;
    if (o.k === 'style') return String(o.v);
  }
  return null;
}

type Ell = { x: number; y: number; rx: number; ry: number; fill: string | null };

/** ellipse の呼び出しと、そのときの塗りの色 (直後の fill の直前の style) */
function ellipses(rec: FakeRecorder): Ell[] {
  const out: Ell[] = [];
  rec.ops.forEach((o, i) => {
    if (o.k === 'ellipse') {
      const a = o.args as number[];
      out.push({ x: a[0]!, y: a[1]!, rx: a[2]!, ry: a[3]!, fill: styleBefore(rec.ops, i) });
    }
  });
  return out;
}

function segments(rec: FakeRecorder): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const out: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  let cur: { x: number; y: number } | null = null;
  for (const op of rec.ops) {
    const a = op.args as number[] | undefined;
    if (op.k === 'moveTo' && a) cur = { x: a[0]!, y: a[1]! };
    else if (op.k === 'lineTo' && a) {
      if (cur !== null) out.push({ x1: cur.x, y1: cur.y, x2: a[0]!, y2: a[1]! });
      cur = { x: a[0]!, y: a[1]! };
    } else if (op.k === 'beginPath') cur = null;
  }
  return out;
}

afterEach(() => {
  setBoardHeight(750);
});

describe('beaming renderer PU-15a (盤面。実物の写真に寄せた絵)', () => {
  it('1. 円盤 (暗い金属の楕円) が 2 つあり、位置が leftCm・rightCm で変わる。円盤を動かすと描画位置も動く', () => {
    const e = ellipses(draw(beamState())).filter((x) => x.fill === COLORS.flange && x.rx === FLANGE_RX);
    expect(e.length).toBe(2);
    const xs = e.map((x) => x.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(cmToX(60, -30), 6);
    expect(xs[1]).toBeCloseTo(cmToX(60, 30), 6);
    const e2 = ellipses(draw(beamState({ leftCm: -35 }))).filter((x) => x.fill === COLORS.flange && x.rx === FLANGE_RX);
    expect(e2.map((x) => x.x).sort((a, b) => a - b)[0]!).toBeLessThan(xs[0]!);
  });

  it('2. 巻いた糸は、軸を中心に上下に同じだけ太る円筒 (糸の色の長方形。中心 y が軸)。progress が大きいほど太い。progress 0 では描かない', () => {
    const hex = mainHex(content, 'p-muji-kon');
    const wound = (p: number): Array<{ y: number; h: number }> => {
      const rec = draw(beamState({ progress: p }));
      return rec.ops
        .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
        .filter((e) => e.o.k === 'fillRect' && e.style === hex && Math.abs(Number((e.o.args as number[])[0]) - cmToX(60, -30)) < 0.5)
        .map((e) => ({ y: Number((e.o.args as number[])[1]), h: Number((e.o.args as number[])[3]) }));
    };
    expect(wound(0).length).toBe(0);
    for (const p of [0.3, 0.6, 1]) {
      const r = wound(p);
      expect(r.length, `p=${p}`).toBeGreaterThanOrEqual(1);
      const w = r[0]!;
      expect(w.y + w.h / 2, `p=${p} の中心 y`).toBeCloseTo(BOARD.axisY, 6); // 上下に同じだけ
      expect(w.h / 2).toBeCloseTo(woundRadius(p), 6);
    }
    expect(wound(1)[0]!.h).toBeGreaterThan(wound(0.3)[0]!.h);
  });

  it('3. ビームの軸 (銀色の太い棒) は、左右の円盤の外へ飛び出す', () => {
    const rec = draw(beamState());
    const rod = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.steel)
      .map((e) => e.o.args as number[])
      .find((a) => a[2]! > 400 && a[3]! < 40)!;
    expect(rod).toBeDefined();
    expect(rod[0]!).toBeLessThan(cmToX(60, -30) - FLANGE_RX);
    expect(rod[0]! + rod[2]!).toBeGreaterThan(cmToX(60, 30) + FLANGE_RX);
    expect(rod[1]! + rod[3]! / 2).toBeCloseTo(BOARD.axisY, 6);
  });

  it('4. 円盤の穴は同心円状の輪 (2 重以上) に並ぶ (円盤の中心からの正規化した距離が 2 種類以上)', () => {
    const rec = draw(beamState());
    const cx = cmToX(60, -30);
    const holes = rec.ops.filter((o) => o.k === 'arc' && (o.args as number[])[2]! <= 6).map((o) => o.args as number[]);
    const kx = FLANGE_RX / BOARD.flangeR;
    const rings = new Set(
      holes
        .filter((a) => Math.abs(a[0]! - cx) <= FLANGE_RX + 1)
        .map((a) => Math.round(Math.hypot((a[0]! - cx) / kx, a[1]! - BOARD.axisY) / 4)),
    );
    expect(rings.size).toBeGreaterThanOrEqual(2);
  });

  it('5. 奥のドラムは横に寝た円筒。糸の筋は縦 (x が同じ moveTo→lineTo の線がドラムの幅いっぱいに並ぶ)。両端は楕円', () => {
    const rec = draw(beamState());
    const vert = segments(rec).filter(
      (g) => g.x1 === g.x2 && g.x1 >= DRUM_X && g.x1 <= DRUM_X + DRUM_W && g.y1 >= BOARD.drumY && g.y2 <= BOARD.drumY + BOARD.drumH + 1 && Math.abs(g.y2 - g.y1) > BOARD.drumH * 0.5,
    );
    expect(vert.length).toBeGreaterThanOrEqual(20);
    const ends = ellipses(rec).filter((e) => Math.abs(e.y - (BOARD.drumY + BOARD.drumH / 2)) < 1);
    expect(ends.length).toBeGreaterThanOrEqual(2);
  });

  it('6. ドラムから降りる糸のシートの手前に、茶色 (wood) の細い横棒 (ガイドの棒) がある', () => {
    const rec = draw(beamState());
    const bar = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.wood)
      .map((e) => e.o.args as number[])
      .find((a) => Math.abs(a[1]! + a[3]! / 2 - BOARD.guideY) < 1 && a[2]! > 300);
    expect(bar).toBeDefined();
    expect(bar![3]!).toBeLessThan(24);
  });

  it('7. 乗り上げのとき、その側の円盤の縁が朱になり「乗り上げ」の文字 (20px 以上) が出る。中央にあれば朱も文字も無い', () => {
    let s = beamState();
    for (let i = 0; i < 4; i++) s = reduce(s, { type: 'nudge', dir: -1 });
    const rec = draw(s);
    const shuEdge = rec.ops.filter((o, i) => o.k === 'ellipse' && styleBefore(rec.ops, i) === COLORS.shu);
    expect(shuEdge.length).toBeGreaterThan(0);
    const texts = rec.ops.filter((o) => o.k === 'fillText' && String(o.args?.[0]).includes('乗り上げ'));
    expect(texts.length).toBeGreaterThan(0);
    const idx = rec.ops.indexOf(texts[0]!);
    let font = '';
    for (let j = idx - 1; j >= 0; j--) {
      if (rec.ops[j]!.k === 'font') {
        font = String(rec.ops[j]!.v);
        break;
      }
    }
    expect(Number(/(\d+)px/.exec(font)?.[1] ?? 0)).toBeGreaterThanOrEqual(20);
    const rec2 = draw(beamState());
    expect(rec2.ops.filter((o, i) => o.k === 'ellipse' && styleBefore(rec2.ops, i) === COLORS.shu).length).toBe(0);
    expect(rec2.ops.some((o) => o.k === 'fillText' && String(o.args?.[0]).includes('乗り上げ'))).toBe(false);
  });

  it('8. 幅合わせの段階では、ビームの下に目標の点線 (y = 目標の点線の位置の線分) と目盛りが出て、円盤の内側の印が左右に 2 つ。巻き返しでは出ない', () => {
    const s = init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' });
    const rec = draw(s);
    const dots = segments(rec).filter((g) => g.y1 === BOARD.targetY && g.y2 === BOARD.targetY);
    expect(dots.length).toBeGreaterThan(5);
    const marks = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && (e.style === COLORS.ai || e.style === COLORS.shu));
    expect(marks.length).toBe(2);
    const rec2 = draw(beamState());
    expect(segments(rec2).filter((g) => g.y1 === BOARD.targetY && g.y2 === BOARD.targetY).length).toBe(0);
  });

  it('9. 色の直書きが無い (renderer.ts・geometry.ts に hex のリテラルがない)', () => {
    for (const file of ['src/games/beaming/renderer.ts', 'src/games/beaming/geometry.ts']) {
      const src = readFileSync(file, 'utf8');
      expect(/#[0-9a-fA-F]{3,8}\b/.test(src), file).toBe(false);
    }
  });
});
