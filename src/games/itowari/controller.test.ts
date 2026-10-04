import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createItowariController } from './controller';
import { init, reduce } from './logic';
import type { ItowariState } from './logic';
import { itowariPuzzles } from './puzzles';
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
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void): number => {
    const at = now + 16;
    frames.push(() => {
      now = at;
      cb(at);
    });
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
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

describe('糸割り controller T2b-03a (プレイ画面)', () => {
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
    expect(container.textContent).toContain('1番の口:7,000 m');
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

  /** Canvas の当たり判定を固定する (論理座標 = 画面座標) */
  function stubStage(): HTMLCanvasElement {
    const canvas = container.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1000, bottom: 750, width: 1000, height: 750, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    canvas.width = 1000;
    canvas.height = 750;
    return canvas;
  }

  function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number): void {
    const ev = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(ev, 'pointerId', { value: 1 });
    (type === 'pointermove' || type === 'pointerup' ? window : canvas).dispatchEvent(ev);
  }

  it('5. ドラッグ: 箱の糸を口まで引っぱって離すと、その口にかかる (かかった口が選ばれる)', async () => {
    const { instance } = await start(); // 何もかけていない状態
    const canvas = stubStage();
    // 箱の1つ目の糸 (BOX.x+26, BOX.y+62) から口7 (x 649〜715・y 300) へ
    pointer(canvas, 'pointerdown', 15 + 26, 330 + 62);
    raf.advance(2);
    pointer(canvas, 'pointermove', 680, 300);
    raf.advance(2);
    pointer(canvas, 'pointerup', 680, 300);
    await vi.waitFor(() => {
      expect(container.textContent).toContain('8番の口');
    }, { timeout: 5000, interval: 50 });
    instance.unmount();
  }, 20000);

  it('6. 押すだけではかりに載せる: 箱の糸を押すと重さが出て、レベル1 の手伝い (長さと半分) が出る', async () => {
    const { instance } = await start(); // 何もかけていない状態
    const canvas = stubStage();
    pointer(canvas, 'pointerdown', 15 + 26, 330 + 62);
    pointer(canvas, 'pointerup', 15 + 26, 330 + 62); // 動かさずに離す
    await vi.waitFor(() => {
      expect(container.textContent).toContain('約 12,000 m');
      expect(container.textContent).toContain('半分 6,000 m');
    }, { timeout: 5000, interval: 50 });
    instance.unmount();
  }, 20000);

  it('7. ドラッグ: 口の糸を箱へ戻すと外れる (押せる形が変わる)', async () => {
    // 口0だけにかけておく
    let s0 = init(p1);
    s0 = reduce(s0, { type: 'mount', spindle: 0, sourceId: p1.sources[0]!.id, slot: 0 }, p1);
    s0 = reduce(s0, { type: 'setLength', spindle: 0, slot: 0, lengthM: 6000 }, p1);
    const { instance } = await start(s0);
    const canvas = stubStage();
    // 口0 の糸 (x 200・y 400) を箱 (15+26, 330+62) へ
    pointer(canvas, 'pointerdown', 200, 400);
    raf.advance(2);
    pointer(canvas, 'pointermove', 41, 392);
    pointer(canvas, 'pointerup', 41, 392);
    await vi.waitFor(() => {
      expect(container.textContent).toContain('1番の口:— m');
    }, { timeout: 5000, interval: 50 });
    instance.unmount();
  }, 20000);
});
