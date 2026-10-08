import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawBoard, mainHex } from './renderer';
import { init, reduce } from './logic';
import type { BeamingState } from './logic';
import { cmToX, BOARD, setBoardHeight, FLANGE_RX, DRUM_X, DRUM_W, woundRadius, leverNotchX, leverY, lampX, lampY, ROD_X0, ROD_X1, DRUM_TILT_RX, drumArcX } from './geometry';
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
  s = reduce(s, { type: 'setSpeed', value: 50 }); // T3-05 でアクションの形が value になった (ここだけ機械的に直した)
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

  it('3b. 軸の長さは変えない: 円盤をどこへ動かしても、軸の両端の x は ROD_X0・ROD_X1 のまま。軸の中心の高さは円盤の楕円の中心の高さと同じ (軸が円盤の中心を貫く。PU-24a)', () => {
    const rodOf = (s: BeamingState): number[] => {
      const rec = draw(s);
      return rec.ops
        .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
        .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.steel)
        .map((e) => e.o.args as number[])
        .find((a) => a[2]! > 400 && a[3]! < 40)!;
    };
    const a = rodOf(beamState());
    const b = rodOf(beamState({ leftCm: -20, rightCm: 25 }));
    const c = rodOf(init({ level: 1, widthCm: 90, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' }));
    for (const r of [a, b, c]) {
      expect(r[0]!).toBe(ROD_X0);
      expect(r[0]! + r[2]!).toBe(ROD_X1);
      expect(r[1]! + r[3]! / 2).toBeCloseTo(BOARD.axisY, 6);
    }
    const faces = ellipses(draw(beamState())).filter((e) => e.fill === COLORS.flange && e.rx === FLANGE_RX);
    expect(faces.length).toBe(2);
    for (const f of faces) expect(f.y).toBeCloseTo(BOARD.axisY, 6); // 円盤の中心 = 軸の中心の高さ
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

  it('5. 奥のドラムは横に寝た円筒を少し斜めから見た形 (PU-24a): 端の楕円の面は右側の 1 つだけ (左の端は円筒の輪郭の曲線だけ)。糸の筋は円筒の丸みに沿って曲がる', () => {
    const rec = draw(beamState());
    const cy = BOARD.drumY + BOARD.drumH / 2;
    const ends = ellipses(rec).filter((e) => Math.abs(e.y - cy) < 1 && e.fill === COLORS.steel);
    expect(ends).toHaveLength(1); // 片側だけ
    expect(ends[0]!.x).toBe(DRUM_X + DRUM_W);
    expect(ends[0]!.rx).toBe(DRUM_TILT_RX);
    // 筋: 同じ軸の位置の点が、真ん中 (y = 中心) で x = 軸の位置 − DRUM_TILT_RX (丸みで左へふくらむ)、上下の端で x = 軸の位置
    const xs = DRUM_X + 12 + 14 * 10;
    const pts: Array<{ x: number; y: number }> = [];
    for (const o of rec.ops) {
      if ((o.k === 'moveTo' || o.k === 'lineTo') && o.args) pts.push({ x: Number(o.args[0]), y: Number(o.args[1]) });
    }
    expect(pts.some((p) => Math.abs(p.x - drumArcX(xs, 0)) < 1e-6 && Math.abs(p.y - cy) < 1)).toBe(true);
    expect(pts.some((p) => Math.abs(p.x - xs) < 1e-6 && p.y < cy - BOARD.drumH * 0.3)).toBe(true);
    // 縦のまっすぐな筋 (x が同じ 2 点の線。胴の右の輪郭 x = 右の端を除く) で描いていない
    const straight = segments(rec).filter((g) => g.x1 === g.x2 && g.x1 >= DRUM_X && g.x1 < DRUM_X + DRUM_W && Math.min(g.y1, g.y2) >= BOARD.drumY && Math.max(g.y1, g.y2) <= BOARD.drumY + BOARD.drumH + 1 && Math.abs(g.y2 - g.y1) > BOARD.drumH * 0.5);
    expect(straight.length).toBe(0);
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

  it('7. 乗り上げの表示は無い (T3-05 で偏りが無くなる。PU-24a): 糸が円盤に寄っていても、円盤の縁は朱にならず「乗り上げ」の文字も出ない', () => {
    const rec = draw(beamState({ shiftCm: -25 }));
    expect(rec.ops.filter((o, i) => o.k === 'ellipse' && styleBefore(rec.ops, i) === COLORS.shu).length).toBe(0);
    expect(rec.ops.some((o) => o.k === 'fillText' && String(o.args?.[0]).includes('乗り上げ'))).toBe(false);
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

  it('9b. 盤面の上の「巻いた N%」「巻き幅…合わせてください」の文字は無い (巻き量は操作欄の 1 か所。PU-15c)', () => {
    for (const s of [beamState({ progress: 0.5 }), init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' })]) {
      const texts = draw(s).ops.filter((o) => o.k === 'fillText').map((o) => String(o.args?.[0]));
      expect(texts.some((t) => t.includes('巻いた'))).toBe(false);
      expect(texts.some((t) => t.includes('合わせてください'))).toBe(false);
    }
  });

  it('9. 色の直書きが無い (renderer.ts・geometry.ts に hex のリテラルがない)', () => {
    for (const file of ['src/games/beaming/renderer.ts', 'src/games/beaming/geometry.ts']) {
      const src = readFileSync(file, 'utf8');
      expect(/#[0-9a-fA-F]{3,8}\b/.test(src), file).toBe(false);
    }
  });
});

describe('T3-04b (盤面の速さのレバー・ランプ)', () => {
  it("1. 'beaming' と 'setup' でレバーが描かれる (帯・3つの止まり・文字)。'done' では描かない", () => {
    const rec = draw(beamState());
    // レバーの帯 (丸い長方形): 止まり3つの位置に丸 (ノブ) がある
    const arcs = rec.ops.filter((o) => o.k === 'arc').map((o) => o.args as number[]);
    for (const sp of [0, 50, 100] as const) {
      const hit = arcs.some((a) => Math.abs((a[0] ?? 0) - leverNotchX(sp)) < 1 && Math.abs((a[1] ?? 0) - leverY()) < 1);
      expect(hit, `止まり ${sp} の丸`).toBe(true);
    }
    // 文字: 停止・50%・100% (20px 以上)
    const texts = rec.ops.filter((o) => o.k === 'fillText').map((o) => String((o.args as unknown[])[0]));
    expect(texts.some((x) => x.includes('停止'))).toBe(true);
    expect(texts.some((x) => x.includes('50%'))).toBe(true);
    expect(texts.some((x) => x.includes('100%'))).toBe(true);
    // setup でも描かれる
    const recSetup = draw(beamState({ phase: 'setup' as const, speed: 0 }));
    expect(recSetup.ops.some((o) => o.k === 'arc' && Math.abs(((o.args as number[])[1] ?? 0) - leverY()) < 1)).toBe(true);
    // done では描かない
    const recDone = draw(beamState({ phase: 'done' as const }));
    expect(recDone.ops.some((o) => o.k === 'arc' && Math.abs(((o.args as number[])[1] ?? 0) - leverY()) < 1)).toBe(false);
  });

  it("2. 今の巻き量で適正な止まりに藍の枠と「適正」の文字。重なる区間は2つとも", () => {
    // 巻き量 50%: 適正は 100 だけ
    const rec = draw(beamState({ progress: 0.5, speed: 100 }));
    const texts = rec.ops.filter((o) => o.k === 'fillText').map((o) => String((o.args as unknown[])[0]));
    expect(texts.filter((x) => x.includes('適正')).length).toBe(1);
    // 巻き量 27% (重なる区間): 50 も 100 も適正 → 「適正」が2つ
    const rec2 = draw(beamState({ progress: 0.27, speed: 50 }));
    const texts2 = rec2.ops.filter((o) => o.k === 'fillText').map((o) => String((o.args as unknown[])[0]));
    expect(texts2.filter((x) => x.includes('適正')).length).toBe(2);
  });

  it('3. ランプ: 適正なら緑の丸、速すぎならオレンジの上向きの記号、遅すぎならオレンジの下向き、停止では消灯', () => {
    // 巻き量 50%・速さ 100 → 適正 → 緑の丸
    const rec = draw(beamState({ progress: 0.5, speed: 100 }));
    const green = rec.ops.some((o) => o.k === 'arc' && Math.abs(((o.args as number[])[0] ?? 0) - lampX()) < 1 && Math.abs(((o.args as number[])[1] ?? 0) - lampY()) < 1 && styleBefore(rec.ops, rec.ops.indexOf(o)) === COLORS.lampOk);
    expect(green, '適正の緑のランプ').toBe(true);
    // 速すぎ: 巻き量 10% で 100 → 上向きの三角 (オレンジ)
    const rec2 = draw(beamState({ progress: 0.10, speed: 100 }));
    const tri = rec2.ops.some((o) => (o.k === 'moveTo') && Math.abs(((o.args as number[])[0] ?? 0) - lampX()) < 40 && styleBefore(rec2.ops, rec2.ops.indexOf(o)) === COLORS.lampWarn);
    expect(tri, '速すぎの記号').toBe(true);
    // 遅すぎ: 巻き量 50% で 50 → 下向きの三角
    const rec3 = draw(beamState({ progress: 0.50, speed: 50 }));
    const tri3 = rec3.ops.some((o) => (o.k === 'moveTo') && Math.abs(((o.args as number[])[0] ?? 0) - lampX()) < 40 && styleBefore(rec3.ops, rec3.ops.indexOf(o)) === COLORS.lampWarn);
    expect(tri3, '遅すぎの記号').toBe(true);
    // 停止 → ランプは描かない
    const rec4 = draw(beamState({ progress: 0.5, speed: 0 }));
    expect(rec4.ops.some((o) => o.k === 'arc' && Math.abs(((o.args as number[])[0] ?? 0) - lampX()) < 1)).toBe(false);
  });
});
