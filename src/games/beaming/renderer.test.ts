import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawBoard, mainHex } from './renderer';
import { init, reduce } from './logic';
import type { BeamingState } from './logic';
import { cmToX, BOARD, setBoardHeight, FLANGE_RX, DRUM_X, DRUM_W, woundRadius, lampX, lampY, speedBarCenterX, SPEED_BAR_W, ROD_X0, ROD_X1, DRUM_TILT_RX, drumArcX, sheetTopY, sheetDropEndY, pxPerCm, BEAM_CENTER_X, THREAD_BAR_MARGIN, sheetShiftX, woundTopY, threadBarRange } from './geometry';
import { stripeRunsOf, stripeStrips } from './renderer';
import { DRUM_SURFACE_SIGN, BEAM_SURFACE_SIGN, DRUM_FLANGE_SIGN, BEAM_FLANGE_SIGN, DRUM_DEPTH_SHIFT } from './params';
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

  it('2. 巻いた糸は、軸を中心に上下に同じだけ太る円筒 (糸の色の塗り。中心 y が軸)。progress が大きいほど太い。progress 0 では描かない (PU-29 で端が「(」の曲線になったため、塗りの path で確かめる)', () => {
    const hex = mainHex(content, 'p-muji-kon');
    const wound = (p: number): Array<{ top: number; bottom: number }> => {
      const rec = draw(beamState({ progress: p }));
      return fillPaths(rec)
        .filter((f) => f.style === hex)
        .map((f) => ({ top: Math.min(...f.pts.map((q) => q.y)), bottom: Math.max(...f.pts.map((q) => q.y)) }))
        .filter((w) => w.bottom > BOARD.axisY + 1 && w.bottom - w.top > 2); // ビームの円筒 (軸より下まで塗る。シートは円筒の上端で止まる)
    };
    expect(wound(0).length).toBe(0);
    for (const p of [0.3, 0.6, 1]) {
      const w = wound(p);
      expect(w.length, `p=${p}`).toBeGreaterThanOrEqual(1);
      const top = Math.min(...w.map((x) => x.top));
      const bottom = Math.max(...w.map((x) => x.bottom));
      expect((top + bottom) / 2, `p=${p} の中心 y`).toBeCloseTo(BOARD.axisY, 6); // 上下に同じだけ
      expect((bottom - top) / 2).toBeCloseTo(woundRadius(p), 6);
    }
    const h = (p: number): number => {
      const w = wound(p);
      return Math.max(...w.map((x) => x.bottom)) - Math.min(...w.map((x) => x.top));
    };
    expect(h(1)).toBeGreaterThan(h(0.3));
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
    expect(ends[0]!.x, 'ドラムの右の端の円盤もドラム一式の奥行きぶん右 (PU-29 追加修正)').toBe(DRUM_X + DRUM_W + DRUM_DEPTH_SHIFT);
    expect(ends[0]!.rx).toBe(DRUM_TILT_RX);
    // 筋: 同じ軸の位置の点が、真ん中 (y = 中心) で x = 軸の位置 − DRUM_TILT_RX (丸みで左へふくらむ)、上下の端で x = 軸の位置
    const xs = DRUM_X + DRUM_DEPTH_SHIFT + 12 + 14 * 10;
    const pts: Array<{ x: number; y: number }> = [];
    for (const o of rec.ops) {
      if ((o.k === 'moveTo' || o.k === 'lineTo') && o.args) pts.push({ x: Number(o.args[0]), y: Number(o.args[1]) });
    }
    expect(pts.some((p) => Math.abs(p.x - drumArcX(xs, 0)) < 1e-6 && Math.abs(p.y - cy) < 1)).toBe(true);
    expect(pts.some((p) => Math.abs(p.x - xs) < 1e-6 && p.y < cy - BOARD.drumH * 0.3)).toBe(true);
    // 縦のまっすぐな筋 (x が同じ 2 点の線。胴の右の輪郭 x = 右の端を除く) で描いていない
    const straight = segments(rec).filter((g) => g.x1 === g.x2 && g.x1 >= DRUM_X + DRUM_DEPTH_SHIFT && g.x1 < DRUM_X + DRUM_W + DRUM_DEPTH_SHIFT && Math.min(g.y1, g.y2) >= BOARD.drumY && Math.max(g.y1, g.y2) <= BOARD.drumY + BOARD.drumH + 1 && Math.abs(g.y2 - g.y1) > BOARD.drumH * 0.5);
    expect(straight.length).toBe(0);
  });

  it('6. ドラムから降りる糸のシートの手前に、速さの木の棒 (横に長い赤茶の角材) がある (PU-28)', () => {
    const rec = draw(beamState());
    const bar = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.beamBar)
      .map((e) => e.o.args as number[])
      .find((a) => a[2]! > 300);
    expect(bar).toBeDefined();
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

describe('PU-24b・PU-28 (速さの木の棒・ランプ)', () => {
  const body = (rec: FakeRecorder): number[] | undefined =>
    rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.beamBar)
      .map((e) => e.o.args as number[])
      .find((a) => Math.abs(a[2]! - SPEED_BAR_W) < 1e-6);
  const top = (rec: FakeRecorder): number[] | undefined =>
    rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.beamBarTop)
      .map((e) => e.o.args as number[])
      .find((a) => Math.abs(a[2]! - SPEED_BAR_W) < 1e-6);
  const drawWith = (s: BeamingState, scale = 1, lever?: { active: boolean }): FakeRecorder => {
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, { scale, offsetX: 0, offsetY: 0 }, s, content, 0, null, 0, lever);
    return rec;
  };

  it('1. 木の棒は、手前の面 (濃い赤茶) と上の面 (明るい赤茶) の 2 面。棒全体の x の真ん中が speedBarCenterX(速さ)、長さは固定。厚み (2 面の合計) は画面上 28px 以上 (縮尺 1 と 0.39)', () => {
    for (const scale of [1, 0.39]) {
      for (const sp of [0, 30, 100]) {
        const rec = drawWith(beamState({ speed: sp }), scale);
        const f = body(rec)!;
        const t = top(rec)!;
        expect(f, `手前の面 scale=${scale}`).toBeDefined();
        expect(t, `上の面 scale=${scale}`).toBeDefined();
        expect(f[0]! + f[2]! / 2).toBeCloseTo(speedBarCenterX(sp), 6);
        expect(t[0]! + t[2]! / 2).toBeCloseTo(speedBarCenterX(sp), 6);
        expect(t[1]! + t[3]!).toBeCloseTo(f[1]!, 6); // 上の面は手前の面のすぐ上
        expect((f[3]! + t[3]!) * scale).toBeGreaterThanOrEqual(28 - 1e-6);
        expect(t[1]! + (t[3]! + f[3]!) / 2).toBeCloseTo(BOARD.guideY, 6); // 2 面の真ん中の高さがガイドの位置
      }
    }
    expect(body(drawWith(beamState({ speed: 0 })))![0]!).toBeLessThan(body(drawWith(beamState({ speed: 100 })))![0]!);
  });

  it('2. 「止」「速」「→」の字・溝・つまみは無い。両端に灰色の金属の金具 (steel の小さな四角)。棒の下の左右の端に止め金具', () => {
    const rec = drawWith(beamState({ speed: 40 }), 0.39);
    const texts = rec.ops.filter((o) => o.k === 'fillText').map((o) => String(o.args![0]));
    for (const t of ['止', '速', '→']) expect(texts, t).not.toContain(t);
    const f = body(rec)!;
    const caps = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.steel)
      .map((e) => e.o.args as number[])
      .filter((a) => a[2]! < 80 && a[3]! < 200 && Math.abs(a[1]! + a[3]! / 2 - (f[1]! + f[3]! / 2)) < f[3]!);
    expect(caps.some((a) => a[0]! <= f[0]! + 1 && a[0]! + a[2]! > f[0]!), '左の金具').toBe(true);
    expect(caps.some((a) => a[0]! + a[2]! >= f[0]! + f[2]! - 1 && a[0]! < f[0]! + f[2]!), '右の金具').toBe(true);
    const stops = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.steel)
      .map((e) => e.o.args as number[])
      .filter((a) => a[1]! > f[1]! + f[3]! && a[1]! < f[1]! + f[3]! + 120 && a[2]! < 80);
    expect(stops.length).toBeGreaterThanOrEqual(2); // 左右の止め金具
  });

  it('3. 引っぱっている間は、棒の縁を藍で細く囲む (線の太さ 1〜3)。引っぱっていないときは藍の縁は無い', () => {
    const widths = (rec: FakeRecorder): number[] => {
      const out: number[] = [];
      let w = 0;
      let style = '';
      for (const o of rec.ops) {
        if (o.k === 'lineWidth') w = Number(o.v);
        else if (o.k === 'style') style = String(o.v);
        else if ((o.k === 'strokeRect' || o.k === 'stroke') && style === COLORS.ai) out.push(w);
      }
      return out;
    };
    expect(widths(drawWith(beamState({ speed: 40 }), 1, { active: false }))).toHaveLength(0);
    const held = widths(drawWith(beamState({ speed: 40 }), 1, { active: true }));
    expect(held.length).toBeGreaterThan(0);
    for (const w of held) {
      expect(w).toBeGreaterThanOrEqual(1);
      expect(w).toBeLessThanOrEqual(3);
    }
  });

  it('4. 幅合わせ・糸を付ける段階では、棒は左端 (速さ 0 の位置) で少し暗く描く (押せない形)', () => {
    for (const st of [init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' }), beamState({ phase: 'attach', progress: 0, speed: 0 })]) {
      const rec = drawWith(st);
      const f = body(rec)!;
      expect(f[0]! + f[2]! / 2).toBeCloseTo(speedBarCenterX(0), 6);
      expect(rec.ops.some((o) => o.k === 'globalAlpha' && Number(o.v) < 1)).toBe(true);
    }
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

/** stroke ごとの (そのときの線の色, 直前の beginPath からの点) */
function strokes(rec: FakeRecorder): Array<{ style: string; pts: Array<{ x: number; y: number }> }> {
  const out: Array<{ style: string; pts: Array<{ x: number; y: number }> }> = [];
  let style = '';
  let pts: Array<{ x: number; y: number }> = [];
  for (const o of rec.ops) {
    if (o.k === 'style') style = String(o.v);
    else if (o.k === 'beginPath') pts = [];
    else if ((o.k === 'moveTo' || o.k === 'lineTo') && o.args) pts.push({ x: Number(o.args[0]), y: Number(o.args[1]) });
    else if (o.k === 'stroke') out.push({ style, pts: [...pts] });
  }
  return out;
}

describe('PU-26: ドラムをドラム巻きと同じ見た目で大きく・回る向き', () => {
  it('1. ドラムの胴はドラム巻きと同じ機械の緑 (machine 系) の勾配、端の円盤は灰色の金属の楕円に放射状の腕', () => {
    const rec = draw(beamState());
    const stops = rec.ops.filter((o) => o.k === 'addColorStop').map((o) => String((o.args as unknown[])[1]));
    expect(stops).toEqual(expect.arrayContaining([COLORS.machineDark, COLORS.machineLight, COLORS.machine]));
    const cy = BOARD.drumY + BOARD.drumH / 2;
    const arms = strokes(rec).filter((g) => g.style === COLORS.sumiSub && g.pts.length === 2 && Math.abs(g.pts[0]!.x - (DRUM_X + DRUM_W + DRUM_DEPTH_SHIFT)) < 1e-6 && Math.abs(g.pts[0]!.y - cy) < 1e-6);
    expect(arms.length).toBe(6);
  });

  it('2. ドラムの描く範囲の高さは、ビームの円盤の直径の 1.5 倍以上 (ドラムのほうが大きい)', () => {
    const rec = draw(beamState());
    const end = ellipses(rec).find((e) => e.fill === COLORS.steel && e.x === DRUM_X + DRUM_W + DRUM_DEPTH_SHIFT)!;
    expect(end.ry * 2).toBeGreaterThanOrEqual(1.5 * 2 * BOARD.flangeR);
  });

  it('3. 角度が進むと、ドラムの桟 (woodLight の線) が上へ動く。速さ 0 (角度が同じ) なら動かない', () => {
    const cy = BOARD.drumY + BOARD.drumH / 2;
    const half = BOARD.drumH / 2;
    const nearest = (angle: number): number => {
      const ys = strokes(draw(beamState({ progress: 0 }), angle))
        .filter((g) => g.style === COLORS.woodLight && g.pts.length === 2 && g.pts[0]!.y === g.pts[1]!.y)
        .map((g) => g.pts[0]!.y);
      return ys.reduce((best, y) => (Math.abs(y - cy) < Math.abs(best - cy) ? y : best), Infinity);
    };
    const y0 = nearest(0);
    const y1 = nearest(0.1);
    expect(y1).toBeLessThan(y0); // 上へ (y が小さくなる)
    expect(y1).toBeCloseTo(cy + DRUM_SURFACE_SIGN * half * Math.sin(0.1), 6);
    expect(nearest(0)).toBe(y0);
  });

  it('4. 角度が進むと、ビームの巻いた糸の上の明るさの帯 (薄い白の長方形) が下へ動く (巻き量があるとき)。円盤の穴も回る。横の線は描かない (PU-28)', () => {
    const r = woundRadius(0.5);
    const leftX = cmToX(60, -30);
    const rightX = cmToX(60, 30);
    const bands = (angle: number): number[] => {
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, beamState({ progress: 0.5 }), content, 0, null, angle);
      return rec.ops
        .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
        .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.white && Math.abs(Number((e.o.args as number[])[2]) - (rightX - leftX)) < 1e-6)
        .map((e) => Number((e.o.args as number[])[1]) + Number((e.o.args as number[])[3]) / 2);
    };
    const nearest = (ys: number[]): number => ys.reduce((best, y) => (Math.abs(y - BOARD.axisY) < Math.abs(best - BOARD.axisY) ? y : best), Infinity);
    const y0 = nearest(bands(0));
    expect(y0).toBeCloseTo(BOARD.axisY, 6);
    const y1 = nearest(bands(0.1));
    expect(y1).toBeGreaterThan(y0); // 下へ
    expect(y1).toBeCloseTo(BOARD.axisY + BEAM_SURFACE_SIGN * r * Math.sin(0.1), 6);
    // 巻いた糸の上に、横いっぱいの線は無い (2 点の水平な線で、長さが巻いた糸の幅の 8 割以上)
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, beamState({ progress: 0.5 }), content, 0, null, 0.3);
    const wide = strokes(rec).filter((g) => g.pts.length === 2 && g.pts[0]!.y === g.pts[1]!.y && Math.abs(g.pts[1]!.x - g.pts[0]!.x) >= 0.8 * (rightX - leftX) && Math.abs(g.pts[0]!.y - BOARD.axisY) <= r + 1);
    expect(wide).toHaveLength(0);
  });

  it('5. 描画に色の直書きが無い (renderer.ts に #xxxxxx や rgb( が無い)', () => {
    const src = readFileSync('src/games/beaming/renderer.ts', 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/rgba?\(/);
  });
});

/** fill ごとの (そのときの塗りの色, 直前の beginPath からの点) */
function fillPaths(rec: FakeRecorder): Array<{ style: string; pts: Array<{ x: number; y: number }> }> {
  const out: Array<{ style: string; pts: Array<{ x: number; y: number }> }> = [];
  let style = '';
  let pts: Array<{ x: number; y: number }> = [];
  for (const o of rec.ops) {
    if (o.k === 'style') style = String(o.v);
    else if (o.k === 'beginPath') pts = [];
    else if ((o.k === 'moveTo' || o.k === 'lineTo') && o.args) pts.push({ x: Number(o.args[0]), y: Number(o.args[1]) });
    else if (o.k === 'fill') out.push({ style, pts: [...pts] });
  }
  return out;
}

describe('PU-26 追加修正: 糸のシートは setup・attach では短く垂れ、beaming でビームまで届く', () => {
  const hex = mainHex(content, 'p-muji-kon');
  /** シートの縦の筋 (2 点の線。色は sumi。PU-29 で手まえほど左へずれる斜めの線になった) の下の端の最大 y */
  function sheetBottom(s: BeamingState): number {
    const ys = strokes(draw(s))
      .filter((g) => g.style === COLORS.sumi && g.pts.length === 2 && g.pts[1]!.y > g.pts[0]!.y && g.pts[0]!.y === sheetTopY(s.progress))
      .map((g) => g.pts[1]!.y);
    return ys.length === 0 ? -Infinity : Math.max(...ys);
  }

  it('1. setup と attach: シートの下の端はビームの円筒の上の端より上 (垂れた端 sheetDropEndY)', () => {
    const attach = beamState({ phase: 'attach', progress: 0, speed: 0 });
    const setup = init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' });
    for (const s of [attach, setup]) {
      const b = sheetBottom(s);
      expect(b, s.phase).toBeGreaterThan(sheetTopY(0));
      expect(b, s.phase).toBeLessThan(BOARD.axisY - woundRadius(0));
      expect(b, s.phase).toBeCloseTo(sheetDropEndY(0), 6);
    }
  });

  it('2. beaming: シートはビームの円筒の上の端まで届く', () => {
    const s = beamState({ progress: 0.3 });
    expect(sheetBottom(s)).toBeCloseTo(BOARD.axisY - woundRadius(0.3), 6);
  });

  /** 糸の束の先の木の棒 (wood の長方形で、横が束の幅 + 左右の余り) */
  function threadBars(rec: FakeRecorder, widthCm: number): Array<[number, number, number, number]> {
    const half = (widthCm * pxPerCm(widthCm)) / 2;
    return rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.wood && Math.abs(Number((e.o.args as number[])[2]) - (2 * half + 2 * THREAD_BAR_MARGIN)) < 1e-6)
      .map((e) => e.o.args as [number, number, number, number]);
  }

  it('3. setup・attach の糸の束の先に木の棒がある (束の幅より左右に長い・太さは画面上 12px 以上)。beaming・done では描かない (ビームに巻き込まれた)', () => {
    const half = (60 * pxPerCm(60)) / 2;
    for (const phase of ['attach', 'setup'] as const) {
      const s = phase === 'attach' ? beamState({ phase: 'attach', progress: 0, speed: 0 }) : init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' });
      const bars = threadBars(draw(s), 60);
      expect(bars.length, phase).toBe(1);
      const [x, y, w, h] = bars[0]!;
      expect(x + w / 2, `${phase} 棒の中心はその高さのシートのずれぶん右 (PU-29 追加修正)`).toBeCloseTo(BEAM_CENTER_X + sheetShiftX(sheetDropEndY(0), 0), 9);
      expect(w, phase).toBeCloseTo(2 * half + 2 * THREAD_BAR_MARGIN, 9);
      expect(y + h / 2, phase).toBeCloseTo(sheetDropEndY(0), 9); // 垂れた位置
      expect(h, phase).toBeGreaterThanOrEqual(12);
    }
    // 縮尺が小さい (393×852 相当) ときも、太さは画面上 12px 以上
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, { scale: 0.39, offsetX: 0, offsetY: 0 }, beamState({ phase: 'attach', progress: 0, speed: 0 }), content, 0);
    expect(threadBars(rec, 60)[0]![3] * 0.39).toBeGreaterThanOrEqual(12 - 1e-6);
    expect(threadBars(draw(beamState({ progress: 0.3 })), 60).length).toBe(0);
  });

  it('4. 引っぱっている間は、棒は水平のまま指の y に動き (x は動かない)、束は幅を変えずにドラムの下から棒まで伸びる (台形にしない)', () => {
    const s = beamState({ phase: 'attach', progress: 0, speed: 0 });
    const barY = sheetDropEndY(0) + 120;
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, 0, { x: BEAM_CENTER_X + 300, y: barY }); // x は無視される
    const [x, y, w, h] = threadBars(rec, 60)[0]!;
    expect(y + h / 2).toBeCloseTo(barY, 9);
    expect(x + w / 2, '棒の中心は、その高さのシートのずれぶん右 (ドラムの奥行き。PU-29 追加修正)').toBeCloseTo(BEAM_CENTER_X + sheetShiftX(barY, 0), 9);
    // 束の縦の筋は、手まえ (下) ほど左へずれる斜めの線 (ずれの大きさはどれも同じ = 幅は変わらない。PU-29) で、下の端が棒の y
    const half = (60 * pxPerCm(60)) / 2;
    const vs = strokes(rec).filter((g) => g.style === COLORS.sumi && g.pts.length === 2 && g.pts[1]!.y > g.pts[0]!.y && g.pts[0]!.y === sheetTopY(0));
    expect(vs.length).toBeGreaterThan(0);
    for (const g of vs) {
      expect(g.pts[1]!.y).toBeCloseTo(barY, 9);
      expect(g.pts[0]!.x - g.pts[1]!.x, 'ずれはどの筋も同じ (台形にしない)').toBeCloseTo(sheetShiftX(sheetTopY(0), 0) - sheetShiftX(barY, 0), 6);
      expect(Math.abs(g.pts[0]!.x - (BEAM_CENTER_X + sheetShiftX(sheetTopY(0), 0)))).toBeLessThanOrEqual(half + 1e-9);
    }
    // 束の面 (柄の色の多角形) の下の辺の幅は、上の辺の幅と同じ (台形ではない)
    const sheet = fillPaths(rec).find((f) => f.style === hex && f.pts.length === 4 && f.pts.some((p) => Math.abs(p.y - barY) < 1e-6));
    expect(sheet, '束').toBeDefined();
    const bottom = sheet!.pts.filter((p) => Math.abs(p.y - barY) < 1e-6).map((p) => p.x);
    const top = sheet!.pts.filter((p) => Math.abs(p.y - barY) >= 1e-6).map((p) => p.x);
    expect(Math.max(...bottom) - Math.min(...bottom)).toBeCloseTo(Math.max(...top) - Math.min(...top), 9);
  });
});

describe('PU-27: 端の円盤の回る向き (胴はそのまま)', () => {
  it('ドラムの端の円盤の腕: 角度が進むと腕の先が下へ動く (PU-26 追加修正のときと逆)。符号は胴と別の定数', () => {
    expect(DRUM_FLANGE_SIGN).toBe(-DRUM_SURFACE_SIGN);
    expect(BEAM_FLANGE_SIGN).toBe(-BEAM_SURFACE_SIGN);
    const cy = BOARD.drumY + BOARD.drumH / 2;
    const tipY = (angle: number): number => {
      const arm = strokes(draw(beamState({ progress: 0 }), angle)).find(
        (g) => g.style === COLORS.sumiSub && g.pts.length === 2 && Math.abs(g.pts[0]!.x - (DRUM_X + DRUM_W + DRUM_DEPTH_SHIFT)) < 1e-6 && Math.abs(g.pts[0]!.y - cy) < 1e-6,
      )!;
      return arm.pts[1]!.y;
    };
    expect(tipY(0.1)).toBeGreaterThan(tipY(0)); // 下へ
  });

  it('ビームの円盤の穴: 角度が進むと内側の輪の穴が上へ動く (逆)。胴の筋 (糸の流れ) は今のまま下へ', () => {
    const holeY = (angle: number): number => {
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, beamState({ progress: 0.5 }), content, 0, null, angle);
      const cx = cmToX(60, -30);
      const kx = FLANGE_RX / BOARD.flangeR;
      const a = rec.ops
        .filter((o) => o.k === 'arc' && (o.args as number[])[2] === 4)
        .map((o) => o.args as number[])
        .filter((g) => Math.abs(g[0]! - (cx + 0.4 * BOARD.flangeR * kx * Math.cos(BEAM_FLANGE_SIGN * angle))) < 1e-6);
      return a[0]![1]!;
    };
    expect(holeY(0.1)).toBeLessThan(holeY(0)); // 逆の向き (0.3.59 は下へ)
    const streak = (angle: number): number => {
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, beamState({ progress: 0.5 }), content, 0, null, angle);
      const ys = rec.ops
        .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
        .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.white && Math.abs(Number((e.o.args as number[])[2]) - (cmToX(60, 30) - cmToX(60, -30))) < 1e-6)
        .map((e) => Number((e.o.args as number[])[1]) + Number((e.o.args as number[])[3]) / 2);
      return ys.reduce((best, y) => (Math.abs(y - BOARD.axisY) < Math.abs(best - BOARD.axisY) ? y : best), Infinity);
    };
    expect(streak(0.1)).toBeGreaterThan(streak(0)); // 胴の光の帯は下へ (変えない)
  });
});

describe('PU-26 追加修正: 張りのランプの大きさ (ドラム巻きの lampGeometry と同じ決め方)', () => {
  it('393×852 相当 (縮尺 0.39) で、ランプの半径は画面上 16px 以上・中の記号の字は画面上 20px 以上', () => {
    const scale = 0.39;
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, { scale, offsetX: 0, offsetY: 0 }, beamState({ progress: 0.9, tension: 80 }), content, 0);
    const arc = rec.ops.filter((o) => o.k === 'arc' && Math.abs(((o.args as number[])[0] ?? 0) - lampX()) < 1).map((o) => (o.args as number[])[2]!);
    expect(Math.min(...arc) * scale).toBeGreaterThanOrEqual(16 - 1e-6);
    const fonts = rec.ops.filter((o) => o.k === 'font').map((o) => /([0-9.]+)px/.exec(String(o.v))![1]!);
    expect(Math.max(...fonts.map(Number)) * scale).toBeGreaterThanOrEqual(20 - 1e-6);
  });
});

describe('PU-28: 柄の縞を縦縞で描く (糸のシート・ドラム・ビーム)', () => {
  const pin = (over?: Partial<BeamingState>): BeamingState => {
    let st = init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-pin-kon' });
    st = reduce(st, { type: 'moveFlange', side: 'left', deltaCm: -30 - st.leftCm });
    st = reduce(st, { type: 'moveFlange', side: 'right', deltaCm: 30 - st.rightCm });
    st = reduce(st, { type: 'finishSetup' });
    st = reduce(st, { type: 'attachThread' });
    st = reduce(st, { type: 'setSpeed', value: 50 });
    return { ...st, progress: 0.4, ...over };
  };
  const kon = (): string => stripeRunsOf(content, 'p-pin-kon')[0]!.hex;
  const shiro = (): string => stripeRunsOf(content, 'p-pin-kon')[1]!.hex;

  it('1. stripeRunsOf: 柄の 1 リピートの色の並びと割合。ピンストライプは 地・線・地 の 3 つ (3:1:4 の割合)。stripeStrips: リピート回数ぶん繰り返して x の範囲を割る', () => {
    const runs = stripeRunsOf(content, 'p-pin-kon');
    expect(runs).toHaveLength(3);
    expect(runs[0]!.hex).toBe(runs[2]!.hex);
    expect(runs[0]!.hex).not.toBe(runs[1]!.hex);
    expect(runs.map((r) => r.frac)).toEqual([3 / 8, 1 / 8, 4 / 8]);
    const strips = stripeStrips(runs, 2, 100, 500);
    expect(strips).toHaveLength(6);
    expect(strips[0]!.x0).toBe(100);
    expect(strips[5]!.x1).toBeCloseTo(500, 9);
    expect(strips[1]!.x1 - strips[1]!.x0).toBeCloseTo(400 / 2 / 8, 9); // 線は 1 リピートの 1/8
    for (let i = 1; i < strips.length; i++) expect(strips[i]!.x0).toBeCloseTo(strips[i - 1]!.x1, 9);
  });

  it('2. 糸のシート: 同じ y の横の並びに地の色と線の色の両方がある。縞は手まえ (下) ほど左へずれる (PU-29 で縦の辺が斜めになったため、縦の判定を変えた)', () => {
    const rec = (() => {
      const { ctx, rec: r } = makeFakeCtx();
      drawBoard(ctx, fit, pin(), content, 0, null, 0, undefined, 3);
      return r;
    })();
    const topY = sheetTopY(0.4);
    const bottomY = BOARD.axisY - woundRadius(0.4);
    // シートの帯 (柄の色の塗り): 上の端 topY・下の端 bottomY
    const paths = fillPaths(rec).filter((f) => f.pts.length === 4 && f.pts.some((p) => Math.abs(p.y - topY) < 1e-6) && f.pts.some((p) => Math.abs(p.y - bottomY) < 1e-6));
    const colors = new Set(paths.map((f) => f.style));
    expect(colors.has(kon())).toBe(true);
    expect(colors.has(shiro())).toBe(true);
    for (const f of paths) {
      const topMin = Math.min(...f.pts.filter((p) => Math.abs(p.y - topY) < 1e-6).map((p) => p.x));
      const bottomMin = Math.min(...f.pts.filter((p) => Math.abs(p.y - bottomY) < 1e-6).map((p) => p.x));
      expect(bottomMin, '手まえ (下) ほど左へずれる (PU-29)').toBeLessThan(topMin);
      expect(topMin - bottomMin, 'ずれはシートの上端 (ドラムの下の端) で DRUM_DEPTH_SHIFT、下端で 0 (ドラムの奥行き。PU-29 追加修正)').toBeCloseTo(sheetShiftX(topY, 0.4) - sheetShiftX(bottomY, 0.4), 6);
    }
    // 線の色の帯は 3 リピートぶん (3 本)
    expect(paths.filter((f) => f.style === shiro())).toHaveLength(3);
  });

  it('3. ドラムとビームの巻いた糸にも、地と線の縦縞が出る。ビームの縞は円筒に沿った「(」の曲線 (長方形で描かない。PU-29)。ドラムの木の桟は、巻いた糸の幅の外にだけ描く', () => {
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, pin({ progress: 0.4 }), content, 0, null, 0, undefined, 3);
    // ビームの巻いた糸の縞 (塗り。軸を中心に上下に広がる path)
    const beamStrips = fillPaths(rec).filter((f) => {
      const ys = f.pts.map((p) => p.y);
      const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
      return Math.max(...ys) - Math.min(...ys) > 20 && Math.abs(mid - BOARD.axisY) < 1e-6;
    });
    const beamColors = new Set(beamStrips.map((e) => e.style));
    expect(beamColors.has(kon())).toBe(true);
    expect(beamColors.has(shiro())).toBe(true);
    for (const f of beamStrips) {
      const ys = f.pts.map((p) => p.y);
      const top = Math.min(...ys);
      const bottom = Math.max(...ys);
      const midX = Math.min(...f.pts.filter((p) => Math.abs(p.y - BOARD.axisY) < 1e-6).map((p) => p.x));
      const endX = Math.min(...f.pts.filter((p) => Math.abs(p.y - top) < 1e-6 || Math.abs(p.y - bottom) < 1e-6).map((p) => p.x));
      expect(midX, '縞の真ん中は上下の端より左 (「(」の曲線。PU-29)').toBeLessThan(endX);
    }
    const half = (60 * pxPerCm(60)) / 2;
    const w0 = BEAM_CENTER_X - half + DRUM_DEPTH_SHIFT; // ドラムの巻いた糸はドラムと同じだけ右へずれる (PU-29 追加修正)
    const w1 = BEAM_CENTER_X + half + DRUM_DEPTH_SHIFT;
    const slats = strokes(rec).filter((g) => g.style === COLORS.woodLight && g.pts.length === 2 && g.pts[0]!.y === g.pts[1]!.y && g.pts[0]!.y > BOARD.drumY && g.pts[0]!.y < BOARD.drumY + BOARD.drumH);
    expect(slats.length).toBeGreaterThan(0);
    for (const g of slats) {
      const [a, b] = [Math.min(g.pts[0]!.x, g.pts[1]!.x), Math.max(g.pts[0]!.x, g.pts[1]!.x)];
      expect(b <= w0 + 1e-6 || a >= w1 - 1e-6, `桟 ${a}〜${b} は巻いた糸 ${w0}〜${w1} に重ならない`).toBe(true);
    }
  });

  it('4. 無地の柄は今までどおり 1 色 (縞は 1 本)', () => {
    expect(stripeRunsOf(content, 'p-muji-kon')).toHaveLength(1);
    expect(stripeRunsOf(content, 'p-muji-kon')[0]!.frac).toBe(1);
  });
});

describe('PU-29 b: 円筒に沿う「(」の曲線・糸の通り道 (盤面の絵)', () => {
  const wound = (over?: Partial<BeamingState>): BeamingState => {
    let st = init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' });
    st = reduce(st, { type: 'moveFlange', side: 'left', deltaCm: -30 - st.leftCm });
    st = reduce(st, { type: 'moveFlange', side: 'right', deltaCm: 30 - st.rightCm });
    st = reduce(st, { type: 'finishSetup' });
    st = reduce(st, { type: 'attachThread' });
    st = reduce(st, { type: 'setSpeed', value: 50 });
    return { ...st, progress: 0.9, ...over };
  };
  const hex = (): string => mainHex(content, 'p-muji-kon');

  /** ビームの巻いた糸の縞の塗り (軸を中心に上下に広がる path) */
  function beamStrips(rec: FakeRecorder): Array<{ style: string; pts: Array<{ x: number; y: number }> }> {
    return fillPaths(rec).filter((f) => {
      const ys = f.pts.map((p) => p.y);
      const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
      return Math.max(...ys) - Math.min(...ys) > 20 && Math.abs(mid - BOARD.axisY) < 1e-6;
    });
  }

  it('1. ドラムの巻いた糸の左の端は「(」の曲線: 真ん中の高さの x が上下の端の x より左 (PU-28a から曲線。続きの確認)', () => {
    const rec = draw(wound());
    const cy = BOARD.drumY + BOARD.drumH / 2;
    const half = (BOARD.drumH / 2) * (1 - 0.3 * 0.9);
    // ドラムの巻いた糸 (シートの幅と同じ。ドラムの胴の中ほど) の塗りのうち、左の端 (いちばん左の縞の左の辺)
    const drumPaths = fillPaths(rec).filter((f) => {
      const ys = f.pts.map((p) => p.y);
      const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
      return Math.max(...ys) - Math.min(...ys) > 20 && Math.abs(mid - cy) < 1e-6;
    });
    expect(drumPaths.length).toBeGreaterThan(0);
    const minXs = drumPaths.map((f) => Math.min(...f.pts.map((p) => p.x)));
    const leftmost = Math.min(...minXs);
    // 左の端の曲線: 真ん中 (t=0) の x は端 (t=±1) の x より左
    const edge = drumPaths.find((f) => Math.min(...f.pts.map((p) => p.x)) === leftmost)!;
    const topX = Math.min(...edge.pts.filter((p) => Math.abs(p.y - (cy - half)) < 1e-6).map((p) => p.x));
    const midX = Math.min(...edge.pts.filter((p) => Math.abs(p.y - cy) < 1e-6).map((p) => p.x));
    expect(midX).toBeLessThan(topX);
    expect(topX - midX).toBeCloseTo(DRUM_TILT_RX, 6);
  });

  it('2. ビームの巻いた糸の左の端も「(」の曲線: 上の端は糸のシートの下の端 (ずれ 0) につながり、真ん中 (巻いた糸の半径ぶんのふくらみ) がいちばん左 (PU-29 追加修正: つなぎのずれ wrapTiltX はやめ、シートの下の端のずれは 0)', () => {
    const rec = draw(wound());
    const leftX = cmToX(60, -30);
    const r = woundRadius(0.9);
    const strips = beamStrips(rec);
    expect(strips.length).toBeGreaterThan(0);
    const left = strips.reduce((a, b) => (Math.min(...b.pts.map((p) => p.x)) < Math.min(...a.pts.map((p) => p.x)) ? b : a));
    const topY = BOARD.axisY - r;
    const topX = Math.min(...left.pts.filter((p) => Math.abs(p.y - topY) < 1e-6).map((p) => p.x));
    const midX = Math.min(...left.pts.filter((p) => Math.abs(p.y - BOARD.axisY) < 1e-6).map((p) => p.x));
    expect(topX, '上の端はシートの下の端につながる (ずれ 0。PU-29 追加修正)').toBeCloseTo(leftX, 6);
    expect(midX, '真ん中のふくらみは FLANGE_RX × (巻いた半径 ÷ 円盤の半径)').toBeCloseTo(leftX - FLANGE_RX * (r / BOARD.flangeR), 6);
    expect(midX).toBeLessThan(topX); // 「(」の形
  });

  it('3. ビームの巻いた糸の縞は長方形で描かない (円筒に沿った曲線の塗りだけ)', () => {
    const rec = draw(wound());
    const rectStrips = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === hex() && Number((e.o.args as number[])[3]) > 20);
    expect(rectStrips).toHaveLength(0);
  });

  it('4. 糸のシートの左の端: ドラムの下の端より、ビームの上の端のほうが左 (手まえに近づくほど左へずれる)。下の端の y は巻いた糸の上の端と同じ (すき間が無い)', () => {
    for (const p of [0.3, 0.9]) {
      const rec = draw(wound({ progress: p }));
      const topY = sheetTopY(p);
      const bottomY = woundTopY(p);
      const sheet = fillPaths(rec).filter((f) => f.pts.length === 4 && f.pts.some((q) => Math.abs(q.y - topY) < 1e-6) && f.pts.some((q) => Math.abs(q.y - bottomY) < 1e-6));
      expect(sheet.length, `p=${p}`).toBeGreaterThan(0);
      const topMin = Math.min(...sheet.flatMap((f) => f.pts.filter((q) => Math.abs(q.y - topY) < 1e-6).map((q) => q.x)));
      const bottomMin = Math.min(...sheet.flatMap((f) => f.pts.filter((q) => Math.abs(q.y - bottomY) < 1e-6).map((q) => q.x)));
      expect(bottomMin, `p=${p} のビームの上の端`).toBeLessThan(topMin);
      expect(bottomY, `p=${p} の下の端の y`).toBeCloseTo(BOARD.axisY - woundRadius(p), 9);
    }
  });

  it('5. 巻く量が増えると、シートの下の端 (巻いた糸の上の端) も上へ動く', () => {
    expect(woundTopY(0.9)).toBeLessThan(woundTopY(0.3));
  });

  it('6. 糸のシートの縦の筋は、手まえ (下) ほど左へずれる斜めの線 (まっすぐ走る筋)', () => {
    const rec = draw(wound({ progress: 0.4 }));
    const topY = sheetTopY(0.4);
    const bottomY = woundTopY(0.4);
    const streaks = strokes(rec).filter((g) => g.style === COLORS.sumi && g.pts.length === 2 && Math.abs(g.pts[0]!.y - topY) < 1e-6 && Math.abs(g.pts[1]!.y - bottomY) < 1e-6);
    expect(streaks.length).toBeGreaterThan(0);
    for (const g of streaks) {
      expect(g.pts[1]!.x, '下の端のほうが左').toBeLessThan(g.pts[0]!.x);
      expect(g.pts[0]!.x - g.pts[1]!.x, '上端はドラムの下の端のずれ、下端は 0 (PU-29 追加修正)').toBeCloseTo(sheetShiftX(topY, 0.4) - sheetShiftX(bottomY, 0.4), 6);
    }
  });
});

describe('PU-29 追加修正: ドラム一式 (胴・巻いた糸・桟・右の端の円盤・ランプ) を DRUM_DEPTH_SHIFT だけ右へずらす', () => {
  it('1. ドラムの胴の左の端 (描く所) は DRUM_X + DRUM_DEPTH_SHIFT。右の端の円盤 (楕円) も同じだけ右', () => {
    const rec = draw(beamState({ progress: 0 }));
    const cy = BOARD.drumY + BOARD.drumH / 2;
    const top = BOARD.drumY;
    const body = fillPaths(rec).find(
      (f) =>
        f.pts.some((p) => Math.abs(p.x - (DRUM_X + DRUM_DEPTH_SHIFT)) < 1e-6 && Math.abs(p.y - top) < 1e-6) &&
        f.pts.some((p) => Math.abs(p.x - (DRUM_X + DRUM_W + DRUM_DEPTH_SHIFT)) < 1e-6 && Math.abs(p.y - top) < 1e-6),
    );
    expect(body, '胴の塗り (左の端 = DRUM_X + DRUM_DEPTH_SHIFT)').toBeDefined();
    const disk = rec.ops.find(
      (o) =>
        o.k === 'ellipse' &&
        Array.isArray(o.args) &&
        Math.abs((o.args as number[])[0]! - (DRUM_X + DRUM_W + DRUM_DEPTH_SHIFT)) < 1e-6 &&
        Math.abs((o.args as number[])[1]! - cy) < 1e-6,
    );
    expect(disk, 'ドラムの右の端の円盤').toBeDefined();
  });

  it('2. ドラムの巻いた糸の左の端も同じだけ右: 端 (t=±1) の x は BEAM_CENTER_X − 幅の半分 + DRUM_DEPTH_SHIFT (ドラムの左の端の当たり判定と同じ式)', () => {
    const rec = draw(beamState({ progress: 0.4 }));
    const cy = BOARD.drumY + BOARD.drumH / 2;
    const half = (BOARD.drumH / 2) * (1 - 0.3 * 0.4);
    const yarnPaths = fillPaths(rec).filter((f) => {
      const ys = f.pts.map((p) => p.y);
      const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
      return Math.max(...ys) - Math.min(...ys) > 20 && Math.abs(mid - cy) < 1e-6 && f.style === mainHex(content, 'p-muji-kon');
    });
    expect(yarnPaths.length).toBeGreaterThan(0);
    const wHalf = (60 * pxPerCm(60)) / 2;
    // いちばん左の縞の左の辺で確かめる
    const edge = yarnPaths.reduce((a, b) => (Math.min(...b.pts.map((p) => p.x)) < Math.min(...a.pts.map((p) => p.x)) ? b : a));
    const topX = Math.min(...edge.pts.filter((p) => Math.abs(p.y - (cy - half)) < 1e-6).map((p) => p.x));
    const bottomX = Math.min(...edge.pts.filter((p) => Math.abs(p.y - (cy + half)) < 1e-6).map((p) => p.x));
    expect(topX).toBeCloseTo(BEAM_CENTER_X - wHalf + DRUM_DEPTH_SHIFT, 6);
    expect(bottomX).toBeCloseTo(BEAM_CENTER_X - wHalf + DRUM_DEPTH_SHIFT, 6);
    const leftmost = Math.min(...edge.pts.map((p) => p.x));
    expect(leftmost, '真ん中の高さは「(」にふくらむぶん左').toBeLessThan(topX);
  });

  it('3. 糸の束の先の木の棒も、その高さのシートのずれぶん右 (当たり判定と同じ式)', () => {
    const s = beamState({ phase: 'attach', progress: 0, speed: 0 });
    const barY = sheetDropEndY(0) + 120;
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, s, content, 0, { x: BEAM_CENTER_X, y: barY });
    const bar = rec.ops
      .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
      .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.wood && Number((e.o.args as number[])[2]) > 100)[0]!;
    const x = (bar.o.args as number[])[0]!;
    expect(x).toBeCloseTo(threadBarRange(60).x0 + sheetShiftX(barY, 0), 6);
  });
});
