import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawBoard, mainHex } from './renderer';
import { init, reduce } from './logic';
import type { BeamingState } from './logic';
import { cmToX, BOARD, setBoardHeight, FLANGE_RX, DRUM_X, DRUM_W, woundRadius, lampX, lampY, speedBarCenterX, SPEED_BAR_W, ROD_X0, ROD_X1, DRUM_TILT_RX, drumArcX } from './geometry';
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
  s = reduce(s, { type: 'attachThread' }); // T3-06 で糸を付ける段階が増えた
  s = reduce(s, { type: 'setSpeed', value: 50 });
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
    const rec = draw(beamState());
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

describe('PU-24b (茶色の棒・ランプ)', () => {
  const barRect = (rec: FakeRecorder): number[] | undefined =>
    rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.wood)
      .map((e) => e.o.args as number[])
      .find((a) => Math.abs(a[1]! + a[3]! / 2 - BOARD.guideY) < 1 && a[2]! > 300);

  it('1. 茶色の棒の真ん中は speedBarCenterX(速さ) にある。速さ 0 は中心より左、100 は右。幅は固定', () => {
    const at = (sp: number): number[] => barRect(draw(beamState({ speed: sp })))!;
    for (const sp of [0, 30, 50, 100]) {
      const r = at(sp);
      expect(r).toBeDefined();
      expect(r[0]! + r[2]! / 2).toBeCloseTo(speedBarCenterX(sp), 6);
      expect(r[2]).toBe(SPEED_BAR_W);
    }
    expect(at(0)[0]!).toBeLessThan(at(100)[0]!);
    // 幅合わせの段階では速さ 0 の位置に、うすく (押せない形) 描く
    const setup = draw(init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' }));
    const r0 = barRect(setup)!;
    expect(r0[0]! + r0[2]! / 2).toBeCloseTo(speedBarCenterX(0), 6);
    expect(setup.ops.some((o) => o.k === 'globalAlpha' && Number(o.v) < 1)).toBe(true);
  });

  it('2. 3 つの丸いボタン (停止・50%・100%) と「適正」の札は盤面に無い', () => {
    for (const p of [0, 0.3, 0.6]) {
      const rec = draw(beamState({ progress: p, speed: 50 }));
      const texts = rec.ops.filter((o) => o.k === 'fillText').map((o) => String(o.args?.[0]));
      for (const t of ['停止', '50%', '100%', '適正']) expect(texts, `progress ${p}`).not.toContain(t);
    }
  });

  it('3. 張りのランプ (T3-06 追記。ドラム巻きと同じ見た目): 範囲の中は緑の ○、強すぎは ▲、弱すぎは ▼。巻く段階でなければ消灯', () => {
    // 巻き量 50% (範囲 90〜100)・張り 95 → 緑の ○
    const rec = draw(beamState({ progress: 0.5, tension: 95 }));
    const green = rec.ops.some((o) => o.k === 'arc' && Math.abs(((o.args as number[])[0] ?? 0) - lampX()) < 1 && Math.abs(((o.args as number[])[1] ?? 0) - lampY()) < 1 && styleBefore(rec.ops, rec.ops.indexOf(o)) === COLORS.lampOk);
    expect(green, '範囲の中の緑のランプ').toBe(true);
    // 記号はランプの中央に白い字で描く (ドラム巻きと同じ。▲▼ は三角の形でなく fillText の字)
    const symbolsOf = (rec: FakeRecorder): string[] =>
      rec.ops
        .filter((o) => o.k === 'fillText')
        .map((o) => String((o.args as unknown[])[0]))
        .filter((t) => ['▲', '▼', '○'].includes(t));
    // 強すぎ: 巻き量 90% (目標 20・範囲 5〜35) で張り 80 → ▲ (オレンジ)
    const rec2 = draw(beamState({ progress: 0.9, tension: 80 }));
    expect(symbolsOf(rec2), '強すぎの ▲').toEqual(['▲']);
    // 弱すぎ: 巻き量 90% で張り 2 → ▼
    const rec3 = draw(beamState({ progress: 0.9, tension: 2 }));
    expect(symbolsOf(rec3), '弱すぎの ▼').toEqual(['▼']);
    // 範囲の中 (巻き量 90%・張り 20) は ○
    const rec5 = draw(beamState({ progress: 0.9, tension: 20 }));
    expect(symbolsOf(rec5), '範囲の中の ○').toEqual(['○']);
    // attach の段階 → ランプは描かない
    const rec4 = draw(beamState({ phase: 'attach' }));
    expect(rec4.ops.some((o) => o.k === 'arc' && Math.abs(((o.args as number[])[0] ?? 0) - lampX()) < 1)).toBe(false);
  });
});
