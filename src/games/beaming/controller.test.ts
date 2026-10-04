import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBeamingController } from './controller';
import { init, reduce } from './logic';
import type { BeamingState } from './logic';
import type { GameDeps, GameProps, TutorialSpec } from '../../core/game/types';
import { createAppContext } from '../../app/context';
import type { AppContext } from '../../app/context';
import { createFixedClock } from '../../core/clock/clock';
import { cmToX, pxPerCm, BOARD, BEAM_CENTER_X } from './geometry';
import { logicalHeightFor } from '../winding/geometry';
import { fitStage } from '../../core/viewport/viewport';
import type { StageFit } from '../../core/viewport/viewport';

const drawBoardCalls: unknown[][] = [];
vi.mock('./renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./renderer')>();
  return { ...actual, drawBoard: (...args: unknown[]) => { drawBoardCalls.push(args); } };
});

/** drawBoard に渡された drumAngle (最後の呼び出し) */
function lastDrumAngle(): number | undefined {
  const last = drawBoardCalls[drawBoardCalls.length - 1];
  if (last === undefined) return undefined;
  return last[4] as number | undefined;
}

let dbSeq = 0;

async function makeDeps(): Promise<{ deps: GameDeps; ctx: AppContext }> {
  const ctx = await createAppContext({
    dbName: `beaming-test-${Date.now().toString(36)}-${dbSeq++}`,
    clock: createFixedClock('2026-10-04T00:00:00Z'),
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

const tutorial: TutorialSpec = { pages: [{ draw: () => undefined, text: 'てすと' }] };

/** 目標どおりに合わせた幅合わせの状態 (まだ「巻き始める」の前) */
function setupAligned(): BeamingState {
  let s = init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' });
  s = reduce(s, { type: 'moveFlange', side: 'left', deltaCm: -30 - s.leftCm });
  s = reduce(s, { type: 'moveFlange', side: 'right', deltaCm: 30 - s.rightCm });
  return s;
}

/** 偽の requestAnimationFrame (手動で進める) */
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

/** ペダルを n 回「踏み込む」 */
function pressPedal(container: HTMLElement, n: number): void {
  for (let i = 0; i < n; i++) {
    const plus = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '踏み込む');
    plus!.click();
  }
}

describe('beaming controller T3-03a (プレイ画面)', () => {
  let raf: ReturnType<typeof installFakeRaf>;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.textContent = '';
    raf = installFakeRaf();
    drawBoardCalls.length = 0;
    // jsdom の canvas は getContext が null を返す。drawBoard が呼ばれるように偽の ctx を返す
    // (drawBoard は mock なので、中身は実行されない)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      canvas: document.createElement('canvas'),
    } as unknown as CanvasRenderingContext2D);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function startAligned(resume?: BeamingState): Promise<{ instance: { unmount(): void; suspend(): unknown }; finished: unknown[] }> {
    const { deps } = await makeDeps();
    const props = makeProps();
    const instance = createBeamingController(container, deps, props, {
      level: 1,
      widthCm: 60,
      puzzleId: 's1',
      patternId: 'p-muji-kon',
      puzzleName: '無地紺',
      bands: 3,
      resume,
      tutorial,
      onBack: () => undefined,
    });
    return { instance, finished: (props as GameProps & { finished: unknown[] }).finished };
  }

  it('1. 幅を合わせて「巻き始める」→ ペダルを踏んで偽の rAF で進めると結果の画面 (幅の誤差 0cm)', async () => {
    const { instance, finished } = await startAligned(setupAligned());
    const start = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める');
    expect(start).toBeDefined();
    start!.click();
    pressPedal(container, 4); // ペダル 40
    // ペダル 40 の速さ (16/秒) で 800 → 50秒 = 約3125フレーム。寄せながら進める
    const nudge = (dir: number): void => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === (dir < 0 ? '◀ 寄せる' : '寄せる ▶'),
      );
      btn?.click();
    };
    await vi.waitFor(
      () => {
        raf.advance(300);
        // 偏りを中央へ戻す (メッセージを見て寄せる方向を決める)
        const panel = container.querySelector('.beaming-panel')?.textContent ?? '';
        if (panel.includes('右に寄って')) nudge(-1);
        else if (panel.includes('左に寄って')) nudge(1);
        expect(finished.length).toBeGreaterThan(0);
      },
      { timeout: 60000, interval: 100 },
    );
    const result = finished[0] as { stars: number; resultLines: Array<{ label: string; value: string }> };
    expect(result.stars).toBeGreaterThanOrEqual(1);
    const width = result.resultLines.find((l) => l.label === '幅合わせの誤差');
    expect(width?.value).toBe('0.0cm');
    instance.unmount();
  }, 60000);

  it('2. 寄せるボタンで偏りが戻る (偏りの文が出たら反対へ寄せて、その側の文が消える)', async () => {
    const { instance } = await startAligned(setupAligned());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    pressPedal(container, 4);
    const message = (): string => container.querySelector('.game-frame__message')?.textContent ?? '';
    // 偏るまで進める (左か右に寄る/乗り上げる。偏りの文は「寄っています」か「乗り上げています」)
    await vi.waitFor(
      () => {
        raf.advance(100);
        expect(/寄っています|乗り上げています/.test(message())).toBe(true);
      },
      { timeout: 60000, interval: 100 },
    );
    const toLeft = message().includes('右'); // 右に寄っていたら ◀ で戻す
    const nudgeBtn = (): HTMLButtonElement | undefined =>
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === (toLeft ? '◀ 寄せる' : '寄せる ▶'));
    nudgeBtn()!.click();
    // 寄せた側の文は消える (逆に寄ったらもう1回)
    await vi.waitFor(
      () => {
        raf.advance(50);
        nudgeBtn()?.click();
        expect(message().includes(toLeft ? '右' : '左')).toBe(false);
      },
      { timeout: 60000, interval: 100 },
    );
    instance.unmount();
  }, 60000);

  it('3. unmount で rAF が止まり、盤面の描画も止まる', async () => {
    const { instance, finished } = await startAligned(setupAligned());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    pressPedal(container, 4);
    raf.advance(50);
    const draws = drawBoardCalls.length;
    instance.unmount();
    raf.advance(100);
    expect(drawBoardCalls.length).toBe(draws); // 止まったあとは描かない
    expect(finished.length).toBe(0);
  });

  it('4. 巻いているあいだ、ドラムが回る角度 (drumAngle) が renderer に渡る', async () => {
    const { instance } = await startAligned(setupAligned());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    pressPedal(container, 4);
    raf.advance(30);
    const a1 = lastDrumAngle();
    expect(typeof a1).toBe('number');
    raf.advance(30);
    const a2 = lastDrumAngle();
    expect(a2! > a1!).toBe(true); // 巻いているあいだは増える
    instance.unmount();
  });
});

describe('PU-15b: 円盤を絵の上で引っぱって合わせる', () => {
  let raf: ReturnType<typeof installFakeRaf>;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.textContent = '';
    raf = installFakeRaf();
    drawBoardCalls.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      canvas: document.createElement('canvas'),
    } as unknown as CanvasRenderingContext2D);
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** 幅合わせの画面を開く (盤面のカードは 600×400 に見せる) */
  async function open(): Promise<{ instance: { unmount(): void; suspend(): unknown }; stage: HTMLCanvasElement; fit: StageFit }> {
    const { deps } = await makeDeps();
    const instance = createBeamingController(container, deps, makeProps(), {
      level: 1, widthCm: 60, puzzleId: 's1', patternId: 'p-muji-kon', puzzleName: '無地紺', bands: 3, tutorial, onBack: () => undefined,
      resume: init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' }),
    });
    const stage = container.querySelector('canvas')!;
    Object.defineProperty(stage.parentElement!, 'clientWidth', { configurable: true, value: 600 });
    Object.defineProperty(stage.parentElement!, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(stage, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400 }),
    });
    window.dispatchEvent(new Event('resize'));
    raf.advance(3);
    const fit = fitStage(1000, logicalHeightFor(600, 400), 600, 400);
    return { instance, stage, fit };
  }

  const px = (fit: StageFit, x: number, y: number): { x: number; y: number } => ({ x: x * fit.scale + fit.offsetX, y: y * fit.scale + fit.offsetY });
  const fire = (el: Element, type: string, p: { x: number; y: number }, id = 1): void => {
    el.dispatchEvent(new PointerEvent(type, { clientX: p.x, clientY: p.y, pointerId: id, bubbles: true, button: 0 }));
  };
  const leftCm = (inst: { suspend(): unknown }): number => (inst.suspend() as BeamingState).leftCm;
  const rightCm = (inst: { suspend(): unknown }): number => (inst.suspend() as BeamingState).rightCm;

  it('左の円盤を引っぱると、leftCm が 1cm 単位で変わる。右も同じ', async () => {
    const { instance, stage, fit } = await open();
    const l0 = leftCm(instance);
    const r0 = rightCm(instance);
    const perCm = pxPerCm(60);
    const start = px(fit, cmToX(60, l0), BOARD.axisY);
    fire(stage, 'pointerdown', start);
    fire(stage, 'pointermove', { x: start.x + perCm * 3.4 * fit.scale, y: start.y });
    expect(leftCm(instance)).toBe(Math.round(l0 + 3.4));
    fire(stage, 'pointermove', { x: start.x - perCm * 2 * fit.scale, y: start.y });
    expect(leftCm(instance)).toBe(Math.round(l0 - 2));
    fire(stage, 'pointerup', { x: start.x - perCm * 2 * fit.scale, y: start.y });
    expect(Number.isInteger(leftCm(instance))).toBe(true); // 1cm 単位に吸い付く
    expect(rightCm(instance)).toBe(r0);
    const rStart = px(fit, cmToX(60, r0), BOARD.axisY);
    fire(stage, 'pointerdown', rStart, 2);
    fire(stage, 'pointermove', { x: rStart.x + perCm * 5 * fit.scale, y: rStart.y }, 2);
    expect(rightCm(instance)).toBe(Math.round(r0 + 5));
    fire(stage, 'pointerup', rStart, 2);
    instance.unmount();
  });

  it('pointercancel で、動かした分を戻す。円盤から離れた所を押しても何も動かない', async () => {
    const { instance, stage, fit } = await open();
    const l0 = leftCm(instance);
    const start = px(fit, cmToX(60, l0), BOARD.axisY);
    fire(stage, 'pointerdown', start);
    fire(stage, 'pointermove', { x: start.x + 60, y: start.y });
    expect(leftCm(instance)).not.toBe(l0);
    fire(stage, 'pointercancel', { x: start.x + 60, y: start.y });
    expect(leftCm(instance)).toBe(l0);
    // 遠い所
    const far = px(fit, BEAM_CENTER_X, BOARD.axisY);
    fire(stage, 'pointerdown', far);
    fire(stage, 'pointermove', { x: far.x + 80, y: far.y });
    expect(leftCm(instance)).toBe(l0);
    instance.unmount();
  });

  it('円盤を動かすボタン (◀▶) は無い。最初に「円盤を左右に引っぱって、巻き幅に合わせます」のお知らせが 1 回出る。巻き返しに入ると円盤は引っぱれない', async () => {
    const { instance, stage, fit } = await open();
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');
    expect(labels.some((l) => /円盤を(左|右)へ/.test(l))).toBe(false);
    expect(container.querySelectorAll('.game-frame__notice')).toHaveLength(1);
    expect(container.querySelector('.game-frame__notice')!.textContent).toBe('円盤を左右に引っぱって、巻き幅に合わせます');
    // 巻き始めたあとは動かない
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    const l0 = leftCm(instance);
    const start = px(fit, cmToX(60, l0), BOARD.axisY);
    fire(stage, 'pointerdown', start);
    fire(stage, 'pointermove', { x: start.x + 80, y: start.y });
    expect(leftCm(instance)).toBe(l0);
    instance.unmount();
  });
});
