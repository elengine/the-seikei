import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createItowariController } from './controller';
import { init, reduce } from './logic';
import type { ItowariState } from './logic';
import { itowariPuzzles } from './puzzles';
import { layoutFor, cellRect, lanePartsFor } from './geometry';
import { getContent } from '../../core/content/content';
import type { GameDeps, GameProps } from '../../core/game/types';
import { createAppContext } from '../../app/context';
import type { AppContext } from '../../app/context';
import { createFixedClock } from '../../core/clock/clock';

const content = getContent();
const puzzles = itowariPuzzles(content);
const p1 = puzzles.find((p) => p.id === 's1')!;

const drawBoardCalls: unknown[][] = [];
vi.mock('./renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./renderer')>();
  return { ...actual, drawBoard: (...args: unknown[]) => { drawBoardCalls.push(args); } };
});

let dbSeq = 0;

async function makeDeps(): Promise<{ deps: GameDeps; ctx: AppContext }> {
  const ctx = await createAppContext({
    dbName: `itowari-test-${Date.now().toString(36)}-${dbSeq++}`,
    clock: createFixedClock('2026-10-05T00:00:00Z'),
    navigate: () => undefined,
  });
  const deps: GameDeps = {
    terms: ctx.terms,
    audio: ctx.audio,
    records: ctx.records,
    clock: ctx.clock,
    log: () => undefined,
  };
  return { deps, ctx };
}

function makeProps(overrides?: Partial<GameProps>): GameProps & { finished: unknown[] } {
  const finished: unknown[] = [];
  const props = {
    mode: 'standalone' as const,
    resume: undefined,
    onStateChange: undefined,
    onFinish: (r: unknown) => finished.push(r),
    onExit: () => undefined,
    ...overrides,
  };
  return Object.assign(props, { finished });
}

/** 偽の requestAnimationFrame (手動で進める。1フレーム = 16ms) */
function installFakeRaf(): { advance(n: number): void } {
  const frames: Array<() => void> = [];
  let now = 0;
  let seq = 0;
  const cancelled = new Set<number>();
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void): number => {
    const at = now + 16;
    seq += 1;
    const id = seq;
    frames.push(() => {
      if (cancelled.has(id)) return; // cancelAnimationFrame されたフレームは動かない (T2-17)
      now = at;
      cb(at);
    });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
    cancelled.add(id);
  });
  return {
    advance(n: number): void {
      for (let i = 0; i < n; i++) {
        const f = frames.shift();
        if (f) f();
      }
    },
  };
}
/** レベル1 のお題を、6口すべてに 6,000m を設定した状態 (巻き始めると成功) */
function readyState(): ItowariState {
  let s = init(p1);
  for (let i = 0; i < 6; i++) {
    s = reduce(s, { type: 'mount', spindle: i, sourceId: p1.sources[i]!.id, slot: 0 }, p1);
    s = reduce(s, { type: 'setLength', spindle: i, slot: 0, lengthM: 6000 }, p1);
  }
  return s;
}

/** レベル1 を、口0だけ 7,000m (元の糸より多くて sourceShort で失敗) にした状態 */
function failingState(): ItowariState {
  let s = init(p1);
  s = reduce(s, { type: 'mount', spindle: 0, sourceId: p1.sources[0]!.id, slot: 0 }, p1);
  s = reduce(s, { type: 'setLength', spindle: 0, slot: 0, lengthM: 7000 }, p1);
  return s;
}

describe('糸割り controller T2b-03a → PU-16 (プレイ画面)', () => {
  let raf: ReturnType<typeof installFakeRaf>;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.textContent = '';
    raf = installFakeRaf();
    drawBoardCalls.length = 0;
    const fake = { canvas: document.createElement('canvas') } as unknown as Record<string, unknown>;
    for (const m of ['fillRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'arc', 'setLineDash', 'strokeRect', 'quadraticCurveTo', 'clearRect']) {
      fake[m] = () => undefined;
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake as unknown as CanvasRenderingContext2D);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function start(resume?: ItowariState): Promise<{ instance: { unmount(): void; suspend(): unknown }; finished: unknown[] }> {
    const { deps } = await makeDeps();
    const props = makeProps();
    const instance = createItowariController(container, deps, props, {
      puzzleId: 's1',
      resume,
      onBack: () => undefined,
    });
    return { instance, finished: (props as GameProps & { finished: unknown[] }).finished };
  }

  it('1. かけて長さを設定し「巻き始める」→ 偽の rAF で 4 秒進めると判定され、成功なら結果が出る', async () => {
    const { instance, finished } = await start(readyState());
    const startBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める');
    expect(startBtn).toBeDefined();
    startBtn!.click();
    // 4秒 = 250フレーム (16ms)。余裕をみて 300
    await vi.waitFor(
      () => {
        raf.advance(300);
        expect(finished.length).toBeGreaterThan(0);
      },
      { timeout: 60000, interval: 100 },
    );
    const result = finished[0] as { stars: number; resultLines: Array<{ label: string; value: string }>; starHint?: string };
    expect(result.stars).toBe(3);
    expect(result.resultLines.map((l) => l.label)).toContain('失敗した回数');
    expect(result.resultLines.map((l) => l.label)).toContain('糸を継いだ口');
    expect(result.starHint).toContain('星3');
    instance.unmount();
  }, 60000);

  it('2. 失敗なら重ね表示「足りないものがあります」と失敗の中身。「長さを設定し直す」で setup に戻る', async () => {
    const { instance } = await start(failingState());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    await vi.waitFor(
      () => {
        raf.advance(300);
        expect(container.textContent).toContain('足りないものがあります');
      },
      { timeout: 60000, interval: 100 },
    );
    // 失敗の中身 (1行ずつ)
    expect(container.textContent).toContain('元のチーズの残りが 5,000 m で、5,500 m に足りません');
    // 盤面の朱の印は renderer に失敗の状態が渡っている (盤面は phase 'failed')
    expect(container.querySelector('.sheet')).not.toBeNull();
    // 「長さを設定し直す」で setup に戻る (重ね表示が閉じて、巻き始められる)
    const retry = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '長さを設定し直す');
    expect(retry).toBeDefined();
    retry!.click();
    expect(container.querySelector('.sheet')).toBeNull();
    const startBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める');
    expect(startBtn).toBeDefined();
    expect(startBtn!.getAttribute('aria-disabled')).toBeNull();
    // 設定した長さ (7,000m) はそのまま残る
    expect((instance.suspend() as ItowariState).spindles[0]!.segments[0]!.lengthM).toBe(7000);
    instance.unmount();
  }, 60000);

  it('3. unmount で rAF が止まり、盤面の描画も止まる', async () => {
    const { instance, finished } = await start(readyState());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    raf.advance(50);
    const draws = drawBoardCalls.length;
    instance.unmount();
    raf.advance(100);
    expect(drawBoardCalls.length).toBe(draws); // 止まったあとは描かない
    expect(finished.length).toBe(0);
  });

  it('4. 題名の下は「レベルN 柄の名前」。操作欄に依頼書が出る', async () => {
    const { instance } = await start(readyState());
    const sub = container.querySelector('.screen-header__subtitle');
    expect(sub?.textContent).toContain('レベル1');
    expect(sub?.textContent).toContain(p1.name);
    expect(container.textContent).toContain('チーズ 6 個');
    instance.unmount();
  });

  /** Canvas の大きさを 1000×750 に見せる (盤面の画面 px と指の位置を同じにする) */
  function stubStage(): HTMLCanvasElement {
    const canvas = container.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1000, bottom: 750, width: 1000, height: 750, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    canvas.width = 1000;
    canvas.height = 750;
    return canvas;
  }

  /** 口 i の中心 (画面 px。レベル1 の 6 口を 1000×750 の盤面に並べたとき) */
  function laneCenter(i: number): { x: number; y: number } {
    const c = cellRect(layoutFor(6, 1000, 750), i);
    return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
  }

  /** 口 i の長さの数字の上 (継ぐ糸のある口は slot 行) */
  function lengthTextPoint(i: number, segs: number, slot = 0): { x: number; y: number } {
    const r = lanePartsFor(layoutFor(6, 1000, 750), i, segs).text[slot]!;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number, pointerId = 1): void {
    const ev = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(ev, 'pointerId', { value: pointerId });
    (type === 'pointermove' || type === 'pointerup' || type === 'pointercancel' ? window : canvas).dispatchEvent(ev);
  }

  /** 箱 (操作欄の段ボールの箱) の操作。PointerEvent を箱へ送る (窓でも受ける) */
  function boxPointer(target: Element | Window, type: string, x: number, y: number, id = 1): void {
    target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, bubbles: true, button: 0 }));
  }

  const firstBox = (): HTMLElement => container.querySelector<HTMLElement>('.creel-box[data-source]')!;
  const state = (instance: { suspend(): unknown }): ItowariState => instance.suspend() as ItowariState;
  const LIFT = 24 + 24; // 引っぱるチーズは指より (半径 24 + 24px) 上

  it('5. 箱の糸を口まで引っぱって離すと、その口にかかる (チーズの位置で口を決める)。かかった糸は箱から無くなる', async () => {
    const { instance } = await start(); // 何もかけていない状態
    stubStage();
    const target = laneCenter(2);
    const before = container.querySelectorAll('.creel-box[data-source]').length;
    boxPointer(firstBox(), 'pointerdown', 100, 600);
    boxPointer(window, 'pointermove', target.x, target.y + LIFT + 40);
    boxPointer(window, 'pointermove', target.x, target.y + LIFT);
    boxPointer(window, 'pointerup', target.x, target.y + LIFT);
    await vi.waitFor(() => {
      expect(state(instance).spindles[2]!.segments).toHaveLength(1);
    }, { timeout: 5000, interval: 50 });
    expect(container.querySelectorAll('.creel-box[data-source]').length).toBe(before - 1);
    expect(document.querySelector('.creel-drag')).toBeNull();
    instance.unmount();
  }, 20000);

  it('6. 箱を押すだけ (動かさない) ではかりに載る: 重さと、レベル1 の手伝い (長さと半分) がお知らせに出る', async () => {
    const { instance } = await start();
    boxPointer(firstBox(), 'pointerdown', 100, 600);
    boxPointer(window, 'pointerup', 100, 600);
    await vi.waitFor(() => {
      const notice = container.querySelector('.game-frame__notice')!.textContent!;
      expect(notice).toContain('糸 1:500 g');
      expect(notice).toContain('約 12,000 m');
      expect(notice).toContain('半分 6,000 m');
    }, { timeout: 5000, interval: 50 });
    expect(state(instance).weighed).toHaveLength(1);
    instance.unmount();
  }, 20000);

  it('7. 口の糸を盤面の外 (箱の帯の方) へ引っぱって離すと外れて、箱へ戻る。盤面の中の別の所で離すと元のまま', async () => {
    let s0 = init(p1);
    s0 = reduce(s0, { type: 'mount', spindle: 0, sourceId: p1.sources[0]!.id, slot: 0 }, p1);
    s0 = reduce(s0, { type: 'setLength', spindle: 0, slot: 0, lengthM: 6000 }, p1);
    const { instance } = await start(s0);
    const canvas = stubStage();
    const c = laneCenter(0);
    // 盤面の中で動かして離す → 元のまま
    pointer(canvas, 'pointerdown', c.x, c.y);
    pointer(canvas, 'pointermove', c.x + 60, c.y + 20);
    pointer(canvas, 'pointerup', c.x + 60, c.y + 20);
    expect(state(instance).spindles[0]!.segments).toHaveLength(1);
    // 盤面の外 (下) で離す → 外れる
    pointer(canvas, 'pointerdown', c.x, c.y);
    pointer(canvas, 'pointermove', c.x, 900);
    pointer(canvas, 'pointerup', c.x, 900);
    await vi.waitFor(() => {
      expect(state(instance).spindles[0]!.segments).toHaveLength(0);
    }, { timeout: 5000, interval: 50 });
    expect(container.querySelectorAll('.creel-box[data-source]').length).toBe(6);
    instance.unmount();
  }, 20000);

  it('8. 箱の糸の引っぱりの途中で pointercancel が来ると、何もかからない。次の pointerdown から新しく引っぱれる', async () => {
    const { instance } = await start();
    stubStage();
    const t = laneCenter(1);
    boxPointer(firstBox(), 'pointerdown', 100, 600);
    boxPointer(window, 'pointermove', t.x, t.y + LIFT);
    boxPointer(window, 'pointercancel', t.x, t.y + LIFT);
    expect(document.querySelector('.creel-drag')).toBeNull();
    expect(state(instance).spindles[1]!.segments).toHaveLength(0);
    boxPointer(firstBox(), 'pointerdown', 100, 600, 2);
    boxPointer(window, 'pointermove', t.x, t.y + LIFT, 2);
    boxPointer(window, 'pointerup', t.x, t.y + LIFT, 2);
    await vi.waitFor(() => {
      expect(state(instance).spindles[1]!.segments).toHaveLength(1);
    }, { timeout: 5000, interval: 50 });
    instance.unmount();
  }, 20000);

  it('9. 盤面の Canvas は touch-action: none (引っぱりの途中で画面がスクロールしない)', async () => {
    const { instance } = await start();
    const canvas = container.querySelector('canvas')!;
    expect(canvas.style.touchAction).toBe('none');
    instance.unmount();
  });

  it('10. 口の糸を引っぱっている間の 2 本目の指は無視する', async () => {
    let s0 = init(p1);
    s0 = reduce(s0, { type: 'mount', spindle: 0, sourceId: p1.sources[0]!.id, slot: 0 }, p1);
    s0 = reduce(s0, { type: 'setLength', spindle: 0, slot: 0, lengthM: 6000 }, p1);
    const { instance } = await start(s0);
    const canvas = stubStage();
    const c = laneCenter(0);
    pointer(canvas, 'pointerdown', c.x, c.y, 1);
    pointer(canvas, 'pointermove', c.x, 900, 2);
    pointer(canvas, 'pointerup', c.x, 900, 2);
    expect(state(instance).spindles[0]!.segments).toHaveLength(1);
    pointer(canvas, 'pointermove', c.x, 900, 1);
    pointer(canvas, 'pointerup', c.x, 900, 1);
    await vi.waitFor(() => {
      expect(state(instance).spindles[0]!.segments).toHaveLength(0);
    }, { timeout: 5000, interval: 50 });
    instance.unmount();
  }, 20000);

  it('11. 1つ目がある口に引っぱると、継ぐ糸 (2本目) としてかかる', async () => {
    const { instance } = await start();
    stubStage();
    const t = laneCenter(4);
    for (let k = 0; k < 2; k++) {
      boxPointer(firstBox(), 'pointerdown', 100, 600, k + 1);
      boxPointer(window, 'pointermove', t.x, t.y + LIFT, k + 1);
      boxPointer(window, 'pointerup', t.x, t.y + LIFT, k + 1);
      await vi.waitFor(() => {
        expect(state(instance).spindles[4]!.segments).toHaveLength(k + 1);
      }, { timeout: 5000, interval: 50 });
    }
    instance.unmount();
  }, 20000);

  it('12. 口の長さの数字を押すとテンキーが開き、数字を入れて「決定」で長さが入る。口の絵 (数字の上でない所) を押すだけなら選ぶだけ', async () => {
    let s0 = init(p1);
    s0 = reduce(s0, { type: 'mount', spindle: 0, sourceId: p1.sources[0]!.id, slot: 0 }, p1);
    s0 = reduce(s0, { type: 'setLength', spindle: 0, slot: 0, lengthM: 6000 }, p1);
    const { instance } = await start(s0);
    const canvas = stubStage();
    const yarn = lanePartsFor(layoutFor(6, 1000, 750), 0, 1).yarn;
    pointer(canvas, 'pointerdown', yarn.cx, yarn.cy);
    pointer(canvas, 'pointerup', yarn.cx, yarn.cy);
    expect(container.querySelector('.sheet')).toBeNull(); // 絵を押しただけではテンキーは開かない
    const t = lengthTextPoint(0, 1);
    pointer(canvas, 'pointerdown', t.x, t.y);
    pointer(canvas, 'pointerup', t.x, t.y);
    expect(container.querySelector('.sheet')).not.toBeNull();
    for (const d of '5500') {
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === d)!.click();
    }
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '決定')!.click();
    await vi.waitFor(() => {
      expect(state(instance).spindles[0]!.segments[0]!.lengthM).toBe(5500);
    }, { timeout: 5000, interval: 50 });
    expect(container.querySelector('.sheet')).toBeNull();
    instance.unmount();
  }, 20000);

  it('13. 糸がかかっていない口の長さの数字を押すと、テンキーは開かず理由が出る', async () => {
    const { instance } = await start();
    const canvas = stubStage();
    const t = lengthTextPoint(3, 0);
    pointer(canvas, 'pointerdown', t.x, t.y);
    pointer(canvas, 'pointerup', t.x, t.y);
    expect(container.querySelector('.sheet')).toBeNull();
    expect(container.querySelector('.game-frame__notice')!.textContent).toContain('口にかけてください');
    instance.unmount();
  });

  it('14. 6 つの増減ボタンが無い。操作欄は「電卓」「巻き始める」と箱の帯だけ (巻き始めるのボタンは 1 つ)', async () => {
    const { instance } = await start();
    const labels = Array.from(container.querySelectorAll('.game-frame__panel button')).map((b) => b.textContent);
    for (const l of ['−1000', '−100', '−10', '+10', '+100', '+1000']) expect(labels).not.toContain(l);
    expect(labels.filter((l) => l === '巻き始める')).toHaveLength(1);
    expect(container.querySelector('.game-frame--compact')).not.toBeNull(); // どの大きさでも詰めた形
    instance.unmount();
  });
});

describe('糸割り controller T2-17 (遊び方を開いているあいだの一時停止)', () => {
  let raf: ReturnType<typeof installFakeRaf>;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.textContent = '';
    raf = installFakeRaf();
    drawBoardCalls.length = 0;
    const fake = { canvas: document.createElement('canvas') } as unknown as Record<string, unknown>;
    for (const m of ['fillRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'arc', 'setLineDash', 'strokeRect', 'quadraticCurveTo', 'clearRect']) {
      fake[m] = () => undefined;
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake as unknown as CanvasRenderingContext2D);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function start(resume?: ItowariState): Promise<{ instance: { unmount(): void; suspend(): unknown }; finished: unknown[] }> {
    const { deps } = await makeDeps();
    const props = makeProps();
    const instance = createItowariController(container, deps, props, {
      puzzleId: 's1',
      resume,
      onBack: () => undefined,
    });
    return { instance, finished: (props as GameProps & { finished: unknown[] }).finished };
  }

  const helpBtn = (c: HTMLElement): HTMLButtonElement | null => c.querySelector<HTMLButtonElement>('button[aria-label="遊び方"]');
  const closeBtn = (c: HTMLElement): HTMLButtonElement | null => c.querySelector<HTMLButtonElement>('button[aria-label="閉じる"]');

  async function startWinding(): Promise<{ instance: { unmount(): void; suspend(): unknown }; finished: unknown[] }> {
    const { instance, finished } = await start(readyState());
    const startBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める');
    startBtn!.click();
    await vi.waitFor(() => expect((instance.suspend() as { phase: string }).phase).toBe('winding'));
    return { instance, finished };
  }

  it('1. 巻いているあいだに遊び方を開くと、5 秒進めても巻いている回の進みが変わらない', async () => {
    const { instance } = await startWinding();
    raf.advance(20);
    const before = instance.suspend() as { progress: number };
    expect(before.progress).toBeGreaterThan(0);
    helpBtn(container)!.click();
    await vi.waitFor(() => expect(container.querySelector('.dialog-backdrop')).not.toBeNull());
    raf.advance(312); // 5 秒ぶん
    const after = instance.suspend() as { progress: number };
    expect(after.progress).toBe(before.progress);
    instance.unmount();
  }, 30000);

  it('2. 閉じると自動で再開する。直後の 1 フレームで止めていた時間を足さない', async () => {
    const { instance } = await startWinding();
    raf.advance(20);
    const before = instance.suspend() as { progress: number };
    helpBtn(container)!.click();
    await vi.waitFor(() => expect(container.querySelector('.dialog-backdrop')).not.toBeNull());
    raf.advance(312);
    closeBtn(container)!.click();
    await vi.waitFor(() => expect(container.querySelector('.dialog-backdrop')).toBeNull());
    const afterFirst = instance.suspend() as { progress: number };
    expect(afterFirst.progress).toBe(before.progress); // 最初のフレームでは進まない (lastTs を測り直す)
    raf.advance(60);
    const later = instance.suspend() as { progress: number };
    expect(later.progress).toBeGreaterThan(before.progress);
    instance.unmount();
  }, 30000);

  it('3. 遊び方を開いたまま unmount すると rAF が止まる', async () => {
    const { instance } = await startWinding();
    raf.advance(10);
    helpBtn(container)!.click();
    await vi.waitFor(() => expect(container.querySelector('.dialog-backdrop')).not.toBeNull());
    const draws = drawBoardCalls.length;
    instance.unmount();
    raf.advance(30);
    expect(drawBoardCalls.length).toBe(draws);
  }, 30000);
});
