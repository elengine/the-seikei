import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawBoard, mainHex } from './renderer';
import { init, reduce } from './logic';
import type { BeamingState } from './logic';
import { cmToX, BOARD, BOARD_W, FLANGE_RX, setBoardHeight, DRUM_W, DRUM_AXIS_X0, flangeHit, hitSheetEdge, woundRadius, lampX, lampY, speedBarCenterX, SPEED_BAR_W, sheetDropEndY, threadBarRange } from './geometry';
import { sidePath, project, viewAlpha, drumRadius, drumCoreRadius } from './side';
import { stripeRunsOf, stripeStrips } from './renderer';
import { SIDE_WOUND_MIN, BEAM_AXLE_R, DRUM_WING_LEN, DRUM_WING_FLARE, DRUM_SURFACE_SIGN, BEAM_SURFACE_SIGN, DRUM_TURN_RATE, BEAM_TURN_RATE, SIDE } from './params';
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

  it('1. 木の棒は、手前の面 (濃い赤茶) と上の面 (明るい赤茶) の 2 面。棒全体の x の真ん中が speedBarCenterX(速さ)、長さは固定。厚み (2 面の合計) は画面上 14px 以上 (今までの半分の細さ。縮尺 1 と 0.39)', () => {
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
        expect((f[3]! + t[3]!) * scale).toBeGreaterThanOrEqual(14 - 1e-6);
        expect((f[3]! + t[3]!) * scale).toBeLessThan(28); // 前の半分ほど (太い棒に戻っていない)
        expect(t[1]! + (t[3]! + f[3]!) / 2).toBeCloseTo(BOARD.guideY, 6); // 2 面の真ん中の高さがガイドの位置
      }
    }
    expect(body(drawWith(beamState({ speed: 0 })))![0]!).toBeLessThan(body(drawWith(beamState({ speed: 100 })))![0]!);
  }, 30000); // 全体を流すと描く回数が重なり 5 秒を超えることがあった (PU-32 追加修正 5)

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

  it('3. 速さのランプ (T3-07 で張りから速さの判定に変えた。ドラム巻きと同じ見た目): 範囲の中は緑の ○、速すぎは ▲、遅すぎは ▼。巻く段階でなければ消灯', () => {
    // 巻き量 50% (範囲 85〜100)・速さ 95 → 緑の ○
    const rec = draw(beamState({ progress: 0.5, speed: 95 }));
    const green = rec.ops.some((o) => o.k === 'arc' && Math.abs(((o.args as number[])[0] ?? 0) - lampX()) < 1 && Math.abs(((o.args as number[])[1] ?? 0) - lampY()) < 1 && styleBefore(rec.ops, rec.ops.indexOf(o)) === COLORS.lampOk);
    expect(green, '範囲の中の緑のランプ').toBe(true);
    // 記号はランプの中央に白い字で描く (ドラム巻きと同じ。▲▼ は三角の形でなく fillText の字)
    const symbolsOf = (rec: FakeRecorder): string[] =>
      rec.ops
        .filter((o) => o.k === 'fillText')
        .map((o) => String((o.args as unknown[])[0]))
        .filter((t) => ['▲', '▼', '○'].includes(t));
    // 速すぎ: 巻き量 90% (T3-08 で範囲はいつでも 0〜30) で速さ 80 → ▲ (オレンジ)
    const rec2 = draw(beamState({ progress: 0.9, speed: 80 }));
    expect(symbolsOf(rec2), '速すぎの ▲').toEqual(['▲']);
    // 遅すぎ: 巻き量 89% (目標 40・レベル1 の範囲 25〜55) で速さ 2 → ▼ (T3-08 で 90% は止めてよい範囲になったため 89% に移した)
    const rec3 = draw(beamState({ progress: 0.89, speed: 2 }));
    expect(symbolsOf(rec3), '遅すぎの ▼').toEqual(['▼']);
    // 巻き量 90% の止めてよい範囲 (0〜30): 速さ 2 (ほとんど止まっている) も範囲の中 → ○ (T3-08 で ▼ から変えた)
    const rec5 = draw(beamState({ progress: 0.9, speed: 2 }));
    expect(symbolsOf(rec5), '止めてよい範囲の ○').toEqual(['○']);
    // 範囲の中 (巻き量 90%・速さ 20) は ○
    const rec6 = draw(beamState({ progress: 0.9, speed: 20 }));
    expect(symbolsOf(rec6), '範囲の中の ○').toEqual(['○']);
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
  it('3. 角度が進むと、ドラムの桟 (woodLight の線) が上へ動く。速さ 0 (角度が同じ) なら動かない', () => {
    const cy = BOARD.drumY + BOARD.drumH / 2;
    const nearest = (angle: number): number => {
      const ys = strokes(draw(beamState({ progress: 0 }), angle))
        .filter((g) => g.style === COLORS.woodLight && g.pts.length === 2 && g.pts[0]!.y === g.pts[1]!.y)
        .map((g) => g.pts[0]!.y);
      return ys.reduce((best, y) => (Math.abs(y - cy) < Math.abs(best - cy) ? y : best), Infinity);
    };
    const y0 = nearest(0);
    const y1 = nearest(0.1);
    expect(y1).toBeLessThan(y0); // 上へ (y が小さくなる)
    expect(nearest(0)).toBe(y0);
  });

  it('5. 描画に色の直書きが無い (renderer.ts に #xxxxxx や rgb( が無い)', () => {
    const src = readFileSync('src/games/beaming/renderer.ts', 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/rgba?\(/);
  });
});


describe('PU-26 追加修正: 張りのランプの大きさ (ドラム巻きの lampGeometry と同じ決め方)', () => {
  it('393×852 相当 (縮尺 0.39) で、ランプの半径は画面上 16px 以上・中の記号の字は画面上 20px 以上', () => {
    const scale = 0.39;
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, { scale, offsetX: 0, offsetY: 0 }, beamState({ progress: 0.9, speed: 80 }), content, 0);
    const arc = rec.ops.filter((o) => o.k === 'arc' && Math.abs(((o.args as number[])[0] ?? 0) - lampX()) < 1).map((o) => (o.args as number[])[2]!);
    expect(Math.min(...arc) * scale).toBeGreaterThanOrEqual(16 - 1e-6);
    const fonts = rec.ops.filter((o) => o.k === 'font').map((o) => /([0-9.]+)px/.exec(String(o.v))![1]!);
    expect(Math.max(...fonts.map(Number)) * scale).toBeGreaterThanOrEqual(20 - 1e-6);
  });
});

describe('PU-28: 柄の縞を縦縞で描く (糸のシート・ドラム・ビーム)', () => {

  it('1. stripeRunsOf: 柄の 1 リピートの色の並びと割合。ピンストライプは 地・線・地 の 3 つ (3:1:4 の割合)。stripeStrips: リピート回数ぶん繰り返して x の範囲を割る', () => {
    const runs = stripeRunsOf(content, 'p-pin-kon');
    expect(runs).toHaveLength(3);
    expect(runs[0]!.hex).toBe(runs[2]!.hex);
    expect(runs[0]!.hex).not.toBe(runs[1]!.hex);
    expect(runs.map((r) => r.frac)).toEqual([3 / 8, 1 / 8, 4 / 8]);
    const strips = stripeStrips(runs, 2, 100, 500);
    // 地 | 線 | 地+地 (くり返しのつなぎ目は同じ色なので 1 本にまとめる) | 線 | 地 の 5 本
    expect(strips).toHaveLength(5);
    expect(strips[0]!.x0).toBe(100);
    expect(strips[4]!.x1).toBeCloseTo(500, 9);
    expect(strips[1]!.x1 - strips[1]!.x0).toBeCloseTo(400 / 2 / 8, 9); // 線は 1 リピートの 1/8
    expect(strips[2]!.x1 - strips[2]!.x0).toBeCloseTo((400 / 2) * (4 / 8 + 3 / 8), 9); // 継ぎ目をまたいで 1 本
    for (let i = 1; i < strips.length; i++) expect(strips[i]!.x0).toBeCloseTo(strips[i - 1]!.x1, 9);
    // 無地は何回くり返しても 1 本 (継ぎ目の輪切りの線が出ない)
    expect(stripeStrips([{ hex: '#111', frac: 1 }], 3, 0, 300)).toHaveLength(1);
  });

  it('4. 無地の柄は今までどおり 1 色 (縞は 1 本)', () => {
    expect(stripeRunsOf(content, 'p-muji-kon')).toHaveLength(1);
    expect(stripeRunsOf(content, 'p-muji-kon')[0]!.frac).toBe(1);
  });
});

// ---------------- PU-32: 横から見た形を写した絵 ----------------

/** fill ごとの (そのときの塗りの色, 直前の beginPath からの点) */
function fillPolys(rec: FakeRecorder): Array<{ style: string; pts: Array<{ x: number; y: number }>; alpha: number }> {
  const out: Array<{ style: string; pts: Array<{ x: number; y: number }>; alpha: number }> = [];
  let style = '';
  let alpha = 1;
  let pts: Array<{ x: number; y: number }> = [];
  for (const o of rec.ops) {
    if (o.k === 'style') style = String(o.v);
    else if (o.k === 'globalAlpha') alpha = Number(o.v);
    else if (o.k === 'beginPath') pts = [];
    else if ((o.k === 'moveTo' || o.k === 'lineTo') && o.args) pts.push({ x: Number(o.args[0]), y: Number(o.args[1]) });
    else if (o.k === 'fill') out.push({ style, pts: [...pts], alpha });
  }
  return out;
}
const ext = (pts: Array<{ x: number; y: number }>): { x0: number; x1: number; y0: number; y1: number } => ({
  x0: Math.min(...pts.map((p) => p.x)),
  x1: Math.max(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)),
  y1: Math.max(...pts.map((p) => p.y)),
});
const pinState = (over?: Partial<BeamingState>): BeamingState => {
  let st = init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-pin-kon' });
  st = reduce(st, { type: 'moveFlange', side: 'left', deltaCm: -30 - st.leftCm });
  st = reduce(st, { type: 'moveFlange', side: 'right', deltaCm: 30 - st.rightCm });
  st = reduce(st, { type: 'finishSetup' });
  st = reduce(st, { type: 'attachThread' });
  st = reduce(st, { type: 'setSpeed', value: 50 });
  return { ...st, progress: 0.3, ...over };
};

const pt0 = (X: number, z: number, h: number): { x: number; y: number } => {
  const q = project(z, h, BOARD.H);
  return { x: X + q.dx, y: q.y };
};
const kon = (): string => stripeRunsOf(content, 'p-pin-kon')[0]!.hex;
const shiro = (): string => stripeRunsOf(content, 'p-pin-kon')[1]!.hex;

describe('PU-32: 糸の帯・隠れる順・盤面に収まる', () => {
  it('1. 隠れる順: ドラム → 糸 → 鉄の棒 1 → 糸 → 鉄の棒 2 → 糸 (棒 2 の上で糸が手前)。鉄の棒のつや (白い線) が 2 本、そのあいだと前後に糸の帯がある', () => {
    for (const st of [pinState(), pinState({ phase: 'attach', progress: 0 })]) {
      const rec = draw(st);
      const hex = new Set([kon(), shiro()]);
      const ribbon: number[] = [];
      const gloss: number[] = [];
      let style = '';
      let idx = 0;
      let grad = -1;
      for (const o of rec.ops) {
        if (o.k === 'createLinearGradient' && grad < 0) grad = idx;
        if (o.k === 'style') style = String(o.v);
        if (o.k === 'fill' && hex.has(style)) ribbon.push(idx);
        if (o.k === 'stroke' && style === COLORS.white) gloss.push(idx);
        idx++;
      }
      expect(gloss.length).toBeGreaterThanOrEqual(4);
      const [g1, g2] = [gloss[0]!, gloss[2]!]; // 棒 1 のつや 2 本 → 棒 2 のつや 2 本
      expect(grad, 'ドラムの胴 (グラデーション) が最初').toBeLessThan(ribbon[0]!);
      expect(ribbon.some((i) => i < g1), '棒 1 より前に糸 (ドラムの下から棒 1 まで)').toBe(true);
      expect(ribbon.some((i) => i > g1 && i < g2), '棒 1 と棒 2 のあいだに糸').toBe(true);
      expect(ribbon.some((i) => i > g2), '棒 2 のあとに糸 (棒 2 の上は糸が手前)').toBe(true);
    }
  });

  it('2. 帯の左の端の線 (画面): 上から下へ角が無い。ドラムの下 → 鉄の棒 1 の上 → 棒 2 の上 → 真下 → ビームの手前を回る、1 本のなめらかな線 (隣り合う区間の向きの差 25 度以下)', () => {
    const turn = (pts: Array<{ x: number; y: number }>): number => {
      let worst = 0;
      for (let i = 1; i + 1 < pts.length; i++) {
        const a = Math.atan2(pts[i]!.y - pts[i - 1]!.y, pts[i]!.x - pts[i - 1]!.x);
        const b = Math.atan2(pts[i + 1]!.y - pts[i]!.y, pts[i + 1]!.x - pts[i]!.x);
        let d = Math.abs(b - a);
        if (d > Math.PI) d = 2 * Math.PI - d;
        worst = Math.max(worst, (d * 180) / Math.PI);
      }
      return worst;
    };
    const X = cmToX(60, -30);
    for (const p of [0.05, 0.3, 0.8]) {
      for (const H of [750, 911, 1100]) {
        setBoardHeight(H);
        const edge = sidePath(p).map((q) => {
          const r = project(q.z, q.h, H);
          return { x: X + r.dx, y: r.y };
        });
        expect(turn(edge), `p=${p} H=${H}`).toBeLessThanOrEqual(25);
        // 上から下へ: ドラムを離れる点から鉄の棒を越えるまでは y が減る (上がる)・そのあとビームまでは増える (下る)
        expect(edge[edge.length - 1]!.y).toBeGreaterThan(edge[0]!.y);
      }
    }
    setBoardHeight(750);
  });

  it('3. 描いた絵が 412×915 相当 (H=911) と 1180×820 相当 (H=750) のどちらの盤面にも、四辺に触れずに収まる (attach と beaming 30%・柄あり)', () => {
    for (const H of [750, 911, 1100]) {
      setBoardHeight(H);
      for (const st of [pinState({ phase: 'attach', progress: 0 }), pinState()]) {
        const rec = draw(st);
        const xs: number[] = [];
        const ys: number[] = [];
        for (const o of rec.ops) {
          if ((o.k === 'moveTo' || o.k === 'lineTo' || o.k === 'arc' || o.k === 'ellipse') && o.args) {
            xs.push(Number(o.args[0]));
            ys.push(Number(o.args[1]));
          }
        }
        expect(Math.min(...xs), `H=${H} ${st.phase} の左`).toBeGreaterThan(0);
        expect(Math.max(...xs), `H=${H} ${st.phase} の右`).toBeLessThan(BOARD_W);
        expect(Math.min(...ys), `H=${H} ${st.phase} の上`).toBeGreaterThan(0);
        expect(Math.max(...ys), `H=${H} ${st.phase} の下`).toBeLessThan(H);
      }
    }
    setBoardHeight(750);
  });

  it('4. 柄の縞は縦縞 (ピンストライプ): 糸の帯は地の色と線の色の両方で、1 本ごとの帯の左右の線は同じ形を横にずらしたもの (縞が糸の流れる向きに走る)', () => {
    const rec = draw(pinState({ phase: 'attach', progress: 0 }));
    const polys = fillPolys(rec).filter((f) => (f.style === kon() || f.style === shiro()) && f.pts.length > 6 && f.pts.length % 2 === 1);
    expect(new Set(polys.map((f) => f.style)).size).toBe(2);
    const sample = polys.find((f) => f.pts.length >= 12)!;
    const len = sample.pts.length; // 最初の moveTo + 左の線 n 点 + 右の線 n 点 (逆順)
    const m = (len - 1) / 2;
    const dx = sample.pts[len - 1]!.x - sample.pts[1]!.x; // 左の線の最初の点と、右の線の最後の点 (同じ (z,h))
    for (let i = 0; i < m; i++) {
      expect(sample.pts[len - 1 - i]!.y).toBeCloseTo(sample.pts[1 + i]!.y, 6);
      expect(sample.pts[len - 1 - i]!.x - sample.pts[1 + i]!.x).toBeCloseTo(dx, 6);
    }
  });

  it('5. 巻いた糸の円筒は、横から見た巻いた糸の半径を写した大きさ: 糸の色の塗りの下の端が 軸の高さ + woundRadius (見える側面の下の端)、上の端 (帯が乗る所) は軸より上。progress 0 では描かない・大きいほど太い', () => {
    const wound = (p: number): Array<{ y0: number; y1: number }> => {
      const rec = draw(beamState({ progress: p }));
      const hex = mainHex(content, 'p-muji-kon');
      return fillPolys(rec)
        .filter((f) => f.style === hex && f.pts.length > 10)
        .map((f) => ext(f.pts))
        .filter((e) => Math.abs(e.y1 - (BOARD.axisY + woundRadius(p))) < 1e-6);
    };
    expect(wound(0)).toHaveLength(0);
    let prev = 0;
    for (const p of [0.3, 0.6, 1]) {
      const w = wound(p);
      expect(w.length, `p=${p}`).toBeGreaterThanOrEqual(1);
      expect(w[0]!.y0, `p=${p} の上の端 (帯が乗る所) は円筒の見える範囲の中`).toBeGreaterThan(BOARD.axisY - woundRadius(p) - 1e-6);
      expect(w[0]!.y0).toBeLessThan(w[0]!.y1 - 5);
      expect(w[0]!.y1 - w[0]!.y0).toBeGreaterThan(prev);
      prev = w[0]!.y1 - w[0]!.y0;
    }
  });

  it('6. 巻いた糸の上に、横いっぱいの線は無い (巻いた糸の幅の 8 割以上の水平な線)。ドラムの桟は巻いた糸の幅の外にだけ', () => {
    const st = pinState({ progress: 0.5 });
    const { ctx, rec } = makeFakeCtx();
    drawBoard(ctx, fit, st, content, 0.4, null, 0.3);
    const wLeft = cmToX(60, -30);
    const wRight = cmToX(60, 30);
    const wide = strokes(rec).filter((g) => g.pts.length === 2 && g.pts[0]!.y === g.pts[1]!.y && Math.abs(g.pts[1]!.x - g.pts[0]!.x) >= 0.8 * (wRight - wLeft) && Math.abs(g.pts[0]!.y - BOARD.axisY) <= woundRadius(0.5));
    // 例外は、帯が乗る所の境目の影の線 1 本だけ (平らな帯から丸い面へ変わる所。軸より上)
    expect(wide.length).toBeLessThanOrEqual(1);
    for (const g of wide) expect(g.pts[0]!.y).toBeLessThan(BOARD.axisY);
    // 桟 (woodLight の水平線) は、巻いた糸の幅の外 (胴の見えている左右の余り) にだけ: どの線も長さが余りの幅以下 (巻いた糸の上を横切らない)
    const margin = (DRUM_W - 700) / 2;
    const slats = strokes(rec).filter((g) => g.style === COLORS.woodLight && g.pts.length === 2 && g.pts[0]!.y === g.pts[1]!.y);
    expect(slats.length).toBeGreaterThan(0);
    for (const g of slats) {
      const len = Math.abs(g.pts[1]!.x - g.pts[0]!.x);
      expect(len).toBeGreaterThan(0);
      expect(len, '桟の長さ').toBeLessThanOrEqual(margin + 1e-6);
    }
  });

  it('7. ドラムの端の円盤の腕は上へ・ビームの円盤の穴は下へ (どちらも胴と同じ向き)。胴: 桟は上へ、光の帯は下へ', () => {
    expect(DRUM_SURFACE_SIGN).toBe(-1); // ドラムの手前の面は下から上
    expect(BEAM_SURFACE_SIGN).toBe(1); // ビームの手前の面は上から下
    // 1 コマ (60fps) の回りが、桟 (16 本) と円盤の穴 (内側の輪 9 個) の間隔の半分より小さい (速さ 100 でも逆向きに回って見えない)
    expect(DRUM_TURN_RATE * 100 / 60).toBeLessThan(Math.PI / 16);
    expect(BEAM_TURN_RATE * 100 / 60).toBeLessThan(Math.PI / 9);
    const face = pt0(DRUM_AXIS_X0 + DRUM_W, SIDE.drum.z, SIDE.drum.h);
    const tipY = (angle: number): number => {
      const arm = strokes(draw(beamState({ progress: 0 }), angle)).find(
        (g) => g.style === COLORS.sumiSub && g.pts.length === 2 && Math.abs(g.pts[0]!.x - face.x) < 1e-6 && Math.abs(g.pts[0]!.y - face.y) < 1e-6,
      );
      expect(arm, '腕').toBeDefined();
      return arm!.pts[1]!.y;
    };
    expect(tipY(0.1)).toBeLessThan(tipY(0)); // 円盤の腕もドラムの胴と同じ向き: 手前の点が上へ
    // 胴の桟 (見える側面): 手前の 1 本が上へ動く。光の帯は下へ動く
    const slatY = (angle: number): number => {
      const ys = strokes(draw(beamState({ progress: 0 }), angle))
        .filter((g) => g.style === COLORS.woodLight && g.pts.length === 2 && g.pts[0]!.y === g.pts[1]!.y)
        .map((g) => g.pts[0]!.y);
      const c = pt0(0, SIDE.drum.z + SIDE.drum.r * Math.cos(viewAlpha()), SIDE.drum.h + SIDE.drum.r * Math.sin(viewAlpha())).y; // 正面を向いた点の高さ
      return ys.reduce((best, y) => (Math.abs(y - c) < Math.abs(best - c) ? y : best), Infinity);
    };
    expect(slatY(0.1)).toBeLessThan(slatY(0));
    const bandY = (angle: number): number => {
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, beamState({ progress: 0.5 }), content, 0, null, angle);
      const c = BOARD.axisY;
      const ys = fillPolys(rec).filter((f) => f.style === COLORS.white && f.alpha < 0.5 && f.pts.length === 4).map((f) => (ext(f.pts).y0 + ext(f.pts).y1) / 2);
      return ys.reduce((best, y) => (Math.abs(y - c) < Math.abs(best - c) ? y : best), Infinity);
    };
    expect(bandY(0.1)).toBeGreaterThan(bandY(0));
    const holeY = (angle: number): number => {
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, beamState({ progress: 0.5 }), content, 0, null, angle);
      // 円盤は上下左右に対称な楕円 (中心 c、半径 FLANGE_RX と BOARD.flangeR): 穴は楕円の上の 0.55 の輪
      const c0 = { x: cmToX(60, -30), y: pt0(0, SIDE.beam.z, SIDE.beam.h).y }; // 円盤の楕円の中心 (x は幅の位置そのまま)
      const ph = -BEAM_SURFACE_SIGN * angle;
      const f0 = { x: c0.x - 0.55 * FLANGE_RX * Math.cos(ph), y: c0.y - 0.55 * BOARD.flangeR * Math.sin(ph) };
      const hole = rec.ops.filter((o) => o.k === 'arc' && (o.args as number[])[2] === 4).map((o) => o.args as number[]).find((a) => Math.abs(a[0]! - f0.x) < 1e-6 && Math.abs(a[1]! - f0.y) < 1e-6);
      expect(hole, '穴').toBeDefined();
      return hole![1]!;
    };
    expect(holeY(0.1)).toBeGreaterThan(holeY(0)); // 円盤の穴もビームの胴と同じ向き: 手前の点が下へ
  });

  it('8. 糸を付ける前: 木の棒は鉄の棒 2 の手前の面の真下に垂れ (棒の x の範囲は threadBarRange)、太さは画面上 12px 以上。引っぱると棒も帯の下の端も指の y。beaming では描かない', () => {
    const attach = beamState({ phase: 'attach', progress: 0, speed: 0 });
    const barRects = (rec: FakeRecorder): number[][] =>
      rec.ops
        .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
        .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.wood && Math.abs(Number((e.o.args as number[])[2]) - (threadBarRange(60).x1 - threadBarRange(60).x0)) < 1e-6)
        .map((e) => e.o.args as number[]);
    const r0 = barRects(draw(attach));
    expect(r0).toHaveLength(1);
    expect(r0[0]![0]).toBeCloseTo(threadBarRange(60).x0, 9);
    expect(r0[0]![1]! + r0[0]![3]! / 2).toBeCloseTo(sheetDropEndY(0), 9);
    expect(r0[0]![3]!).toBeGreaterThanOrEqual(12);
    const { ctx, rec } = makeFakeCtx();
    const y = (sheetDropEndY(0) + BOARD.axisY) / 2;
    drawBoard(ctx, { scale: 0.39, offsetX: 0, offsetY: 0 }, attach, content, 0, { x: 0, y });
    const r1 = barRects(rec);
    expect(r1[0]![1]! + r1[0]![3]! / 2).toBeCloseTo(y, 6);
    expect(r1[0]![3]! * 0.39).toBeGreaterThanOrEqual(12 - 1e-6);
    const hex = mainHex(content, 'p-muji-kon');
    const ribbonBottom = Math.max(...fillPolys(rec).filter((f) => f.style === hex && f.pts.length > 4).map((f) => ext(f.pts).y1));
    expect(ribbonBottom).toBeCloseTo(y, 6); // 帯の下の端は棒の位置
    expect(barRects(draw(beamState({ progress: 0.3 })))).toHaveLength(0);
  });

  it('9. 当たり判定が描いた位置と合う: 糸の端の木の棒 (描いた長方形の中) は hitSheetEdge が真、円盤の面 (描いた楕円の中心) は flangeHit が真', () => {
    const attach = beamState({ phase: 'attach', progress: 0, speed: 0 });
    const bar = (() => {
      const rec = draw(attach);
      return rec.ops
        .map((o, i) => ({ o, style: styleBefore(rec.ops, i) }))
        .filter((e) => e.o.k === 'fillRect' && e.style === COLORS.wood && Number((e.o.args as number[])[2]) > 600)
        .map((e) => e.o.args as number[])[0]!;
    })();
    expect(hitSheetEdge({ x: bar[0]! + bar[2]! / 2, y: bar[1]! + bar[3]! / 2 }, 60, 0)).toBe(true);
    expect(hitSheetEdge({ x: bar[0]! + 1, y: bar[1]! + bar[3]! / 2 }, 60, 0)).toBe(true);
    // 円盤: 描いた面 (COLORS.flange の塗り) の中心が、flangeHit の当たりの中
    const faces = fillPolys(draw(beamState())).filter((f) => f.style === COLORS.flange && f.pts.length > 20);
    expect(faces).toHaveLength(2);
    for (const f of faces) {
      const e = ext(f.pts);
      const c = { x: (e.x0 + e.x1) / 2, y: (e.y0 + e.y1) / 2 };
      expect(flangeHit(c, -30, 30, 60, 1)).not.toBeNull();
      expect(c.y).toBeGreaterThan(BOARD.axisY - BOARD.flangeR);
      expect(c.y).toBeLessThan(BOARD.axisY + BOARD.flangeR);
    }
  });

  it('10. ビームは帯とは別の円筒として見える: 巻いた糸の面に陰影 (上が明るく下が暗いグラデーション) があり、帯が乗る所に影の細い線がある。両端の円盤は穴の開いた円盤として大きく (楕円の横幅 ≥ 縦の 0.4 倍)、左は帯より奥・右は帯より手前に描く', () => {
    const rec = draw(pinState());
    const hexes = new Set([kon(), shiro()]);
    const flange: number[] = [];
    const ribbon: number[] = [];
    let style = '';
    let idx = 0;
    let grads = 0;
    for (const o of rec.ops) {
      if (o.k === 'createLinearGradient') grads++;
      if (o.k === 'style') style = String(o.v);
      if (o.k === 'fill' && style === COLORS.flange) flange.push(idx);
      if (o.k === 'fill' && hexes.has(style)) ribbon.push(idx);
      idx++;
    }
    const sheet = fillPolys(rec).map((f, i) => ({ f, i })).filter((q) => hexes.has(q.f.style) && ext(q.f.pts).y1 > BOARD.axisY - 10).length;
    expect(sheet, '糸の帯 (ビームまで届く)').toBeGreaterThan(0);
    expect(grads).toBeGreaterThanOrEqual(3); // ドラムの胴・ドラムの糸・ビームの糸の陰影
    expect(flange.length).toBe(2);
    // 帯 (ビームまで届く糸の塗り) の最初と最後の位置
    const reach: number[] = [];
    {
      let st2 = '';
      let k = 0;
      let pts: Array<{ y: number }> = [];
      for (const o of rec.ops) {
        if (o.k === 'style') st2 = String(o.v);
        else if (o.k === 'beginPath') pts = [];
        else if ((o.k === 'moveTo' || o.k === 'lineTo') && o.args) pts.push({ y: Number(o.args[1]) });
        else if (o.k === 'fill' && hexes.has(st2) && Math.max(...pts.map((p) => p.y)) > BOARD.axisY - 10) reach.push(k);
        k++;
      }
    }
    void ribbon;
    expect(flange[0]!, '左の円盤は帯より奥').toBeLessThan(reach[0]!);
    expect(flange[1]!, '右の円盤は帯より手前').toBeGreaterThan(reach[reach.length - 1]!);
    for (const f of fillPolys(rec).filter((q) => q.style === COLORS.flange && q.pts.length > 20)) {
      const e = ext(f.pts);
      expect((e.x1 - e.x0) / (e.y1 - e.y0)).toBeGreaterThanOrEqual(0.4);
    }
  });

  it('11. 帯の左の端は、鉄の棒 2 から下りてビームの手前を回る所で、左へ弓なりにふくらむ「(」: 412×915 相当 (縮尺 0.39) で画面上 12px 以上 (巻き量 30%・90%)', () => {
    const H = 911;
    setBoardHeight(H);
    const X = cmToX(60, -30);
    for (const p of [0.3, 0.9]) {
      const edge = sidePath(p).map((q) => {
        const r = project(q.z, q.h, H);
        return X + r.dx;
      });
      const i2 = sidePath(p).findIndex((q) => Math.abs(Math.hypot(q.z - SIDE.bar2.z, q.h - SIDE.bar2.h) - SIDE.bar2.r) < 1e-6 && q.z > SIDE.bar2.z);
      const bulge = edge[i2]! - Math.min(...edge.slice(i2));
      expect(bulge * 0.39, `p=${p}`).toBeGreaterThanOrEqual(12);
    }
    setBoardHeight(750);
  });

  it('12. ドラムの羽は帯から始まる: 羽の板の根元が、巻いた帯の左の端 (幅の左の端) にあり、いちばん端の帯が羽の斜面に乗る (帯の色の斜めの面が羽の根元に重なる)。羽を帯と離れた所から生やさない', () => {
    const st = pinState({ progress: 0.3 });
    const rec = draw(st);
    const half = (60 * 700 / 60) / 2;
    const w0 = 500 - half;
    const w0px = pt0(w0, SIDE.drum.z, SIDE.drum.h).x;
    const woods = fillPolys(rec).filter((f) => f.style === COLORS.wood && f.pts.length === 5);
    // 羽の板 (4 点 + 閉じる): 根元は帯の左の端の下 (帯の中へ入る) に隠れ、外へ出るのは短い (DRUM_WING_LEN。奥行きのずれ KX × 半径のぶんの余裕)
    expect(woods.length).toBeGreaterThan(3);
    const slack = 0.1 * SIDE.drum.r + 1;
    for (const f of woods) {
      const e = ext(f.pts);
      expect(e.x1, '根元は帯の左の端より中 (隠れる)').toBeGreaterThan(w0px);
      expect(e.x0, '先は帯の左の端から外へ DRUM_WING_LEN だけ').toBeGreaterThanOrEqual(w0px - DRUM_WING_LEN - slack);
      expect(e.x0, '先は帯の左の端より外へ出ている').toBeLessThan(w0px);
    }
    // 糸の束 (いちばん端の帯) は帯の幅の左の端から始まる。羽の斜面の上へは持ち上がらない
    const yarn = fillPolys(rec).filter((f) => f.style === kon() && f.pts.length > 40 && ext(f.pts).y0 < BOARD.H * 0.4);
    expect(Math.min(...yarn.map((f) => ext(f.pts).x0))).toBeGreaterThanOrEqual(w0px - slack);
  });

  it('13. 端の円盤の回る向きは PU-27 (0.3.61) と同じ画面の向き: ドラムの右の端の面の腕は画面で時計回り・ビームの円盤の穴は反時計回り (画面の角度 = atan2(y, x)。y は下向き)', () => {
    const turn = (a: number, b: number): number => {
      let d = b - a;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return d;
    };
    // ドラムの右の端の面の腕 (腕 0。面の中心からの向き)
    const face = pt0(DRUM_AXIS_X0 + DRUM_W, SIDE.drum.z, SIDE.drum.h);
    const armAngle = (angle: number): number => {
      const arm = strokes(draw(beamState({ progress: 0 }), angle)).find((g) => g.style === COLORS.sumiSub && g.pts.length === 2 && Math.abs(g.pts[0]!.x - face.x) < 1e-6 && Math.abs(g.pts[0]!.y - face.y) < 1e-6)!;
      return Math.atan2(arm.pts[1]!.y - face.y, arm.pts[1]!.x - face.x);
    };
    expect(turn(armAngle(0), armAngle(0.1))).toBeGreaterThan(0); // 時計回り (画面の角度が増える)
    // ビームの円盤の穴 (内側の輪の最初の穴の、円盤の面の中心からの向き)
    const c = { x: cmToX(60, -30), y: pt0(0, SIDE.beam.z, SIDE.beam.h).y };
    const holeAngle = (angle: number): number => {
      const q = { x: c.x - 0.55 * FLANGE_RX * Math.cos(-BEAM_SURFACE_SIGN * angle), y: c.y - 0.55 * BOARD.flangeR * Math.sin(-BEAM_SURFACE_SIGN * angle) };
      const { ctx, rec } = makeFakeCtx();
      drawBoard(ctx, fit, beamState({ progress: 0.5 }), content, 0, null, angle);
      const hole = rec.ops.filter((o) => o.k === 'arc' && (o.args as number[])[2] === 4).map((o) => o.args as number[]).find((a) => Math.abs(a[0]! - q.x) < 1e-6 && Math.abs(a[1]! - q.y) < 1e-6);
      expect(hole, '穴').toBeDefined();
      return Math.atan2((hole![1]! - c.y) / BOARD.flangeR, (hole![0]! - c.x) / FLANGE_RX);
    };
    expect(turn(holeAngle(0), holeAngle(0.1))).toBeLessThan(0); // 反時計回り
  });

  it('14. ドラムの胴の半径は糸の巻き芯: どの巻き量でも、胴 (緑の面) は糸の上の端より上にはみ出さない (糸の上に緑の胴が見えない)。糸の外側の半径だけが巻き量で減り、最後は胴の半径になる', () => {
    expect(drumRadius(0)).toBeGreaterThan(drumCoreRadius());
    expect(drumRadius(1)).toBeGreaterThan(drumCoreRadius() + 0.1); // 巻き量 100% ではまだ少し糸が残る
    expect(drumRadius(1.001)).toBeCloseTo(drumCoreRadius(), 9); // 100.1% でちょうど無くなる (100.1% で糸が切れて終わる)
    expect(drumRadius(1.2)).toBeCloseTo(drumCoreRadius(), 9);
    for (const [a, b] of [[0, 0.3], [0.3, 0.7], [0.7, 1], [1, 1.001]] as const) expect(drumRadius(a)).toBeGreaterThan(drumRadius(b)); // なめらかに減る
    for (const p of [0, 0.3, 0.6, 0.9, 1, 1.001]) {
      const rec = draw(beamState({ progress: p }));
      // 胴 (最初のグラデーション塗り) と、そのあとの最初の柄の色の塗り (ドラムの巻いた糸) の上の端
      let gradSeen = false;
      let style = '';
      let pts: Array<{ y: number }> = [];
      let frameTop: number | null = null;
      let yarnTop: number | null = null;
      for (const o of rec.ops) {
        if (o.k === 'createLinearGradient') gradSeen = true;
        else if (o.k === 'style') style = String(o.v);
        else if (o.k === 'beginPath') pts = [];
        else if ((o.k === 'moveTo' || o.k === 'lineTo') && o.args) pts.push({ y: Number(o.args[1]) });
        else if (o.k === 'fill' && gradSeen && frameTop === null) frameTop = Math.min(...pts.map((q) => q.y));
        else if (o.k === 'fill' && frameTop !== null && yarnTop === null && style === mainHex(content, 'p-muji-kon')) yarnTop = Math.min(...pts.map((q) => q.y));
      }
      expect(frameTop, `p=${p}`).not.toBeNull();
      if (p >= 0.999) {
        // 糸が無くなる (100.1%) (厚み 0.5 未満): ドラムの糸の面は描かない (ドラムの高さに柄の色の塗りが無い)
        const drumYarn = fillPolys(rec).filter((f) => f.style === mainHex(content, 'p-muji-kon') && ext(f.pts).y0 < frameTop! + 1 && f.pts.length > 40 && ext(f.pts).y1 < BOARD.H * 0.55);
        expect(drumYarn.length, `p=${p}: 糸は描かない`).toBe(0);
        continue;
      }
      expect(yarnTop, `p=${p}`).not.toBeNull();
      expect(frameTop!, `p=${p}: 胴の上の端 ≥ 糸の上の端`).toBeGreaterThanOrEqual(yarnTop! - 1e-6);
    }
  });

  it('15. ビームの糸が巻かれるのは帯の幅だけ: 円盤を巻き幅より広げても、巻いた糸の円筒の x の範囲は変わらない (円盤と帯のあいだは軸の太さのまま、何も巻かれない)', () => {
    const hex = mainHex(content, 'p-muji-kon');
    const woundOf = (st: BeamingState): Array<{ x0: number; x1: number }> => {
      const rec = draw(st);
      return fillPolys(rec)
        .filter((f) => f.style === hex && f.pts.length > 10)
        .map((f) => ext(f.pts))
        .filter((e) => Math.abs(e.y1 - (BOARD.axisY + woundRadius(0.6))) < 1e-6);
    };
    const normal = woundOf(beamState({ progress: 0.6 }));
    const wide = woundOf(beamState({ progress: 0.6, leftCm: -35, rightCm: 35 }));
    expect(normal.length).toBeGreaterThan(0);
    expect(wide.length).toBe(normal.length);
    expect(Math.min(...wide.map((e) => e.x0))).toBeCloseTo(Math.min(...normal.map((e) => e.x0)), 6);
    expect(Math.max(...wide.map((e) => e.x1))).toBeCloseTo(Math.max(...normal.map((e) => e.x1)), 6);
  });

  it('16. ドラムの糸の束の断面 (管理者の図): 上の輪郭は軸と平行で、羽の所だけ持ち上がらない。巻いた糸の多角形の上の端 (y の最小) はどれも同じ高さ。左は羽の斜面の上へ伸び、右は斜めに細くなって胴へ下りる', () => {
    for (const p of [0.1, 0.5, 0.9]) {
      const rec = draw(pinState({ progress: p }));
      const polys = fillPolys(rec).filter((f) => (f.style === kon() || f.style === shiro()) && f.pts.length > 6 && f.pts.length % 2 === 1 && ext(f.pts).y0 < BOARD.H * 0.4);
      expect(polys.length, `p=${p}`).toBeGreaterThan(1);
      const tops = polys.map((f) => ext(f.pts).y0);
      expect(Math.max(...tops) - Math.min(...tops), `p=${p}: 上の輪郭が水平`).toBeLessThan(1.5);
    }
    // 左の端は帯の幅の左の端 (羽の斜面の上へは持ち上がらない)
    const half = (60 * 700 / 60) / 2;
    const w0px = pt0(500 - half, SIDE.drum.z, SIDE.drum.h).x;
    const polys0 = fillPolys(draw(pinState({ progress: 0.1 }))).filter((f) => (f.style === kon() || f.style === shiro()) && f.pts.length > 6 && f.pts.length % 2 === 1 && ext(f.pts).y0 < BOARD.H * 0.4);
    expect(Math.min(...polys0.map((f) => ext(f.pts).x0))).toBeGreaterThanOrEqual(w0px - 0.1 * SIDE.drum.r - 1);
  });

  it('17. ビームの円盤は上下左右に対称な楕円: 面の楕円の中心が x の範囲の真ん中・y の範囲の真ん中にあり、軸が中心を貫く (軸の断面の円が円盤の中心にある。左右どちらの円盤にも)', () => {
    const rec = draw(beamState({ progress: 0.5 }));
    const faces = fillPolys(rec).filter((q) => q.style === COLORS.flange && q.pts.length > 20);
    expect(faces.length).toBe(2);
    for (const f of faces) {
      const e = ext(f.pts);
      const mx = (e.x0 + e.x1) / 2;
      const my = (e.y0 + e.y1) / 2;
      // 楕円の各点は中心について対称 (180 度回した点も楕円の上にある)
      for (const q of f.pts) {
        const nx = (q.x - mx) / ((e.x1 - e.x0) / 2);
        const ny = (q.y - my) / ((e.y1 - e.y0) / 2);
        expect(Math.hypot(nx, ny), '楕円の上').toBeCloseTo(1, 6);
      }
      // 円盤の面には軸の穴の楕円は描かない (steel の楕円は無い)
      expect(fillPolys(rec).filter((q) => q.style === COLORS.steel && q.pts.length > 20 && Math.abs((ext(q.pts).x0 + ext(q.pts).x1) / 2 - mx) < 1e-6 && Math.abs((ext(q.pts).y0 + ext(q.pts).y1) / 2 - my) < 1e-6).length, '穴の楕円は描かない').toBe(0);
    }
    // 左の円盤: 軸は円盤の面の中心から右へ出る (軸の四角は円盤の面を塗ったあとに描かれ、始まりが円盤の中心の x)
    const f0 = ext(faces[0]!.pts);
    const cx0 = (f0.x0 + f0.x1) / 2;
    const polys = fillPolys(rec);
    const iFace = polys.findIndex((q) => q.style === COLORS.flange && q.pts.length > 20);
    const iAxle = polys.findIndex((q, i) => i > iFace && q.style === COLORS.steel && ext(q.pts).x0 < cx0 && ext(q.pts).x1 > cx0 + 20);
    expect(iAxle, '軸が円盤の中心から').toBeGreaterThan(iFace);
    expect(ext(polys[iAxle]!.pts).x0, '軸の根元は「(」: 円盤の中心より少し左へふくらむ').toBeLessThan(cx0);
  });

  it('18. ドラムの羽は短く、開きが小さい: 外へ出る長さは DRUM_WING_LEN、羽の先の半径は糸の半径の 1.1 倍以下 (扇のように大きく開かない)', () => {
    expect(DRUM_WING_LEN).toBeLessThanOrEqual(30);
    expect(DRUM_WING_FLARE).toBeLessThanOrEqual(0.1);
  });

  it('19. 端の面は右を向いたものだけ楕円で見える: 左の端のつまみは「(」の輪郭 (楕円の右半分は描かない)、右の端のつまみは右の端に楕円。左の円盤の右の面に軸 (steel の四角) が円盤より手前に描かれる。右の真ちゅうの筒の左の端に楕円は無い', () => {
    const rec = draw(beamState({ progress: 0.5 }));
    const knobs = fillPolys(rec).filter((q) => q.style === COLORS.sumi && q.pts.length > 10 && ext(q.pts).y1 - ext(q.pts).y0 < 40 && ext(q.pts).x1 - ext(q.pts).x0 < 30);
    expect(knobs.length, '左右のつまみ (本体の「(」と右の端の楕円)').toBeGreaterThanOrEqual(4);
    // 真ちゅうの楕円 (gold) は右の筒の右の端と左の筒の右の端 (円盤の後ろ) の 2 つだけ。左の端 (円盤の面に付く側) には無い
    const golds = fillPolys(rec).filter((q) => q.style === COLORS.gold && q.pts.length > 20);
    expect(golds.length, '左右の筒の本体 (「(」の輪郭) と右の端の楕円').toBe(4);
  });

  it('20. 巻き幅 150〜200cm のお題でも、描いた絵 (四角も含む) は盤面の四辺に触れない: 円盤調整 (setup)・糸を付ける (attach)・巻く (beaming) の 3 つの段階を、盤面の高さ 750・911・1100 で (PU-32 追加修正 6)', () => {
    for (const widthCm of [150, 175, 200]) {
      for (const H of [750, 911, 1100]) {
        setBoardHeight(H);
        const base = init({ level: 1, widthCm, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' });
        const wide = reduce(reduce(base, { type: 'moveFlange', side: 'left', deltaCm: -widthCm / 2 - base.leftCm }), { type: 'moveFlange', side: 'right', deltaCm: widthCm / 2 - base.rightCm });
        const attached = reduce(reduce(wide, { type: 'finishSetup' }), { type: 'attachThread' });
        for (const st of [base, attached, { ...attached, progress: 0.4 }]) {
          const rec = draw(st);
          const xs: number[] = [];
          for (const o of rec.ops) {
            if (!o.args) continue;
            if (o.k === 'moveTo' || o.k === 'lineTo' || o.k === 'arc' || o.k === 'ellipse') xs.push(Number(o.args[0]));
            else if ((o.k === 'fillRect' || o.k === 'strokeRect') && Number(o.args[2]) < BOARD_W) xs.push(Number(o.args[0]), Number(o.args[0]) + Number(o.args[2]));
          }
          expect(Math.min(...xs), `${widthCm}cm H=${H} ${st.phase} の左`).toBeGreaterThan(4);
          expect(Math.max(...xs), `${widthCm}cm H=${H} ${st.phase} の右`).toBeLessThan(BOARD_W - 4);
        }
      }
    }
    setBoardHeight(750);
  });

  it('21. 巻き始めの帯は軸の表面に接する (巻いた糸の半径の割合 = 軸の半径 ÷ 円盤の半径)。円盤調整の目盛りは、縦長 (縮尺 0.39) でも盤面の下の端より内側に収まる (PU-32 追加修正 7)', () => {
    expect(SIDE_WOUND_MIN * SIDE.beam.r).toBeCloseTo(BEAM_AXLE_R, 9);
    for (const H of [750, 911, 1812]) {
      setBoardHeight(H);
      const u = H > 1500 ? 1 / 0.39 : 1; // 縦長 (H = 1812) は縮尺 0.39、それ以外は 1
      expect(BOARD.targetY + 28 * u, `H=${H}`).toBeLessThan(H);
      expect(BOARD.targetY, `H=${H}`).toBeGreaterThan(BOARD.axisY + BOARD.flangeR); // 円盤の下の端より下
    }
    setBoardHeight(750);
  });

  it('22. ドラムの糸は下側から消える (PU-32 追加修正 9・10): 巻き量 99.7% から 99.9% にかけて、糸の下の端が上へ上がり、99.9% で糸が無い。薄くなる処理は残る (半径は減り続ける)', () => {
    const yarnBottom = (p: number): number | null => {
      const polys = fillPolys(draw(beamState({ progress: p }))).filter((f) => f.style === mainHex(content, 'p-muji-kon') && f.pts.length > 20 && ext(f.pts).y0 < BOARD.H * 0.4);
      return polys.length === 0 ? null : Math.max(...polys.map((f) => ext(f.pts).y1));
    };
    const b99 = yarnBottom(0.99)!;
    const b997 = yarnBottom(0.997)!;
    const b998 = yarnBottom(0.998)!;
    expect(b99, '99% はまだ下まである').toBeGreaterThan(b997 - 3);
    expect(b998, '99.8% は下の半分ほどが消えている').toBeLessThan(b997 - 5);
    expect(yarnBottom(0.9991), '99.9% で糸は無い').toBeNull();
    expect(yarnBottom(1.001), '100.1% で無い').toBeNull();
    expect(drumRadius(0.99)).toBeLessThan(drumRadius(0.85)); // 薄くなる処理は残っている
  });

  it('23. ビームに巻いた帯の縞の境目は「(」の弧 (垂直の直線ではない): 巻いた糸の円筒の縞の多角形の左右の縁は、上から下へ x が変わる。帯の色は円筒の上の端へ向けて白を重ねてなじむ (白の重なりの濃さが下へ増え、0.28 まで)', () => {
    const rec = draw(beamState({ progress: 0.5 }));
    const polys = fillPolys(rec).filter((f) => f.style === mainHex(content, 'p-muji-kon') && f.pts.length > 30 && ext(f.pts).y0 > BOARD.H * 0.4);
    expect(polys.length).toBeGreaterThan(0);
    for (const f of polys) {
      const xs = f.pts.map((q) => q.x);
      expect(Math.max(...xs) - Math.min(...xs), '縞の左右の縁は弧で、幅より広がる').toBeGreaterThan(5);
    }
    const alphas = fillPolys(rec).filter((f) => f.style === COLORS.white && f.alpha > 0 && f.alpha < 0.28 && f.pts.length > 8).map((f) => f.alpha);
    expect(alphas.length, '白の重なりが何段階かある').toBeGreaterThan(3);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.28);
  });

  it('24. 糸を付ける前 (垂れている・引っぱっている間) の帯にも、下へ向けて白をだんだん重ねる (PU-32 追加修正 10)。0 → 0.28。固定直後 (巻き量 0) の帯にも重なる', () => {
    const attach = beamState({ phase: 'attach', progress: 0, speed: 0 });
    const whites = (st: BeamingState): number[] => fillPolys(draw(st)).filter((f) => f.style === COLORS.white && f.alpha > 0 && f.alpha < 0.28 && f.pts.length > 8).map((f) => f.alpha);
    const a = whites(attach);
    expect(a.length, '垂れた帯に白の重なりが何段階かある').toBeGreaterThan(3);
    expect(Math.max(...a)).toBeLessThanOrEqual(0.28);
    expect(whites(beamState({ progress: 0 })).length, '固定直後の帯にも').toBeGreaterThan(3);
  });
});
