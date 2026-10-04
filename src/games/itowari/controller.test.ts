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

  function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number, pointerId = 1): void {
    const ev = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(ev, 'pointerId', { value: pointerId });
    (type === 'pointermove' || type === 'pointerup' || type === 'pointercancel' ? window : canvas).dispatchEvent(ev);
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

  it('8. 引っぱりの途中で pointercancel が来ると、何もかからない。次の pointerdown から新しく引っぱれる', async () => {
    const { instance } = await start(); // 何もかけていない状態
    const canvas = stubStage();
    // 箱の糸を引っぱりはじめて、途中で取り消し (ブラウザがスクロールに奪った形)
    pointer(canvas, 'pointerdown', 41, 392);
    pointer(canvas, 'pointermove', 300, 300);
    pointer(canvas, 'pointercancel', 300, 300);
    await vi.waitFor(() => {
      // 取り消しなので何もかかっていない (口1は選ばれない。口1 = x 251〜318)
      expect(container.textContent).not.toContain('2番の口');
    }, { timeout: 5000, interval: 50 });
    // 次の pointerdown から新しく引っぱって、口7 にかかる
    pointer(canvas, 'pointerdown', 41, 392);
    pointer(canvas, 'pointermove', 680, 300);
    pointer(canvas, 'pointerup', 680, 300);
    await vi.waitFor(() => {
      expect(container.textContent).toContain('8番の口');
    }, { timeout: 5000, interval: 50 });
    instance.unmount();
  }, 20000);

  it('9. 盤面の Canvas は touch-action: none (引っぱりの途中で画面がスクロールしない)', async () => {
    const { instance } = await start();
    const canvas = container.querySelector('canvas')!;
    expect(canvas.style.touchAction).toBe('none');
    instance.unmount();
  });

  it('10. 2本目の指は無視する: ほかの指の move・up ではかからない', async () => {
    const { instance } = await start(); // 何もかけていない状態
    const canvas = stubStage();
    // 1本目の指でつかんでから、2本目の指で動かして離す → 何も起きない
    pointer(canvas, 'pointerdown', 41, 392);
    pointer(canvas, 'pointermove', 300, 300, 2);
    pointer(canvas, 'pointerup', 680, 300, 2);
    expect(container.textContent).not.toContain('8番の口');
    // 1本目の指で口7 に置いて離す → かかる
    pointer(canvas, 'pointermove', 680, 300, 1);
    pointer(canvas, 'pointerup', 680, 300, 1);
    await vi.waitFor(() => {
      expect(container.textContent).toContain('8番の口');
    }, { timeout: 5000, interval: 50 });
    instance.unmount();
  }, 20000);

  it('11. 1つ目がある口に引っぱると、継ぐ糸 (2本目) としてかかる', async () => {
    const { instance } = await start(); // 何もかけていない状態
    const canvas = stubStage();
    // 1本目を口7にかける
    pointer(canvas, 'pointerdown', 41, 392);
    pointer(canvas, 'pointermove', 680, 300);
    pointer(canvas, 'pointerup', 680, 300);
    await vi.waitFor(() => {
      expect(container.textContent).toContain('8番の口');
    }, { timeout: 5000, interval: 50 });
    // 2本目を同じ口に引っぱる → 継ぐ糸としてかかる (「1つ目」「継ぐ糸」の選びが出る)
    pointer(canvas, 'pointerdown', 41 + 32, 392); // 箱の2つ目の糸
    pointer(canvas, 'pointermove', 680, 500);
    pointer(canvas, 'pointerup', 680, 500);
    await vi.waitFor(() => {
      expect(container.textContent).toContain('継ぐ糸');
    }, { timeout: 5000, interval: 50 });
    instance.unmount();
  }, 20000);

  it('13. 箱が空でも、口の糸を箱へ持っていくと外れる', async () => {
    // 6本すべてを別々の口にかけて箱を空にする
    const { instance } = await start(); // 何もかけていない状態
    const canvas = stubStage();
    for (let i = 0; i < 6; i++) {
      const tx = 185 + i * 66.25 + 33; // 広い画面: 口は横1列
      pointer(canvas, 'pointerdown', 41, 392);
      pointer(canvas, 'pointermove', tx, 300);
      pointer(canvas, 'pointerup', tx, 300);
      await vi.waitFor(() => {
        expect(container.textContent).toContain(`${i + 1}番の口`);
      }, { timeout: 5000, interval: 50 });
    }
    // 口1の糸を、箱の糸が無い場所 (段ボールの下の段) へ持っていく → 外れる
    pointer(canvas, 'pointerdown', 218, 300);
    pointer(canvas, 'pointermove', 137, 444);
    pointer(canvas, 'pointerup', 137, 444);
    // 外れたら箱に糸が戻るので、もう一度引っぱってかけられる
    pointer(canvas, 'pointerdown', 41, 392);
    pointer(canvas, 'pointermove', 218, 300);
    pointer(canvas, 'pointerup', 218, 300);
    await vi.waitFor(() => {
      expect(container.textContent).toContain('1番の口');
    }, { timeout: 5000, interval: 50 });
    instance.unmount();
  }, 20000);

  it('12. 空の口を押すと選ばれる (tap で口を選ぶ)', async () => {
    const { instance } = await start(); // 何もかけていない状態
    const canvas = stubStage();
    pointer(canvas, 'pointerdown', 416, 300); // 口3の列 (x 384〜451)
    pointer(canvas, 'pointerup', 416, 300);
    await vi.waitFor(() => {
      expect(container.textContent).toContain('4番の口');
    }, { timeout: 5000, interval: 50 });
    instance.unmount();
  }, 20000);
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
