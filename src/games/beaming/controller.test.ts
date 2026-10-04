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
import { leverNotchX, leverY } from './geometry';
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

/** 盤面のカードを 600×400 に見せる (fitStage が 0 にならないように。T3-04b/T3-04c/T2-17 で使う) */
function showBoardOn(container: HTMLElement, raf: { advance(n: number): void }): { toScreen: (x: number, y: number) => { x: number; y: number } } {
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
  return { toScreen: (x: number, y: number) => ({ x: x * fit.scale + fit.offsetX, y: y * fit.scale + fit.offsetY }) };
}

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
/** jsdom に無い setPointerCapture を足す (ペダルの溝を指で動かす操作のため) */
if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture(): void {};
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {};
}

/** 盤面のカードを 600×400 に見せてレバーを押す (T3-04a/b。canvas の fit が必要) */
function pressLeverOn(container: HTMLElement, raf: { advance(n: number): void }, sp: 0 | 50 | 100): void {
  const stage = container.querySelector('canvas');
  if (stage) {
    Object.defineProperty(stage.parentElement!, 'clientWidth', { configurable: true, value: 600 });
    Object.defineProperty(stage.parentElement!, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(stage, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400 }),
    });
    window.dispatchEvent(new Event('resize'));
    raf.advance(3);
    const fit = fitStage(1000, logicalHeightFor(600, 400), 600, 400);
    const toScreen = (x: number, y: number): { x: number; y: number } => ({ x: x * fit.scale + fit.offsetX, y: y * fit.scale + fit.offsetY });
    const at = toScreen(leverNotchX(sp), leverY());
    stage.dispatchEvent(new PointerEvent('pointerdown', { clientX: at.x, clientY: at.y, bubbles: true, pointerId: 31, button: 0 }));
    stage.dispatchEvent(new PointerEvent('pointerup', { clientX: at.x, clientY: at.y, bubbles: true, pointerId: 31, button: 0 }));
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
    pressLeverOn(container, raf, 100 as 0 | 50 | 100); // 全速
    // 寄せながら 95% まで巻く (速さ 100 は 25〜75% だけ適正。結果の星は問わない)
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
        const st = instance.suspend() as BeamingState | null;
        const shift = st?.shiftCm ?? 0;
        if (shift > 1.5) nudge(-1);
        else if (shift < -1.5) nudge(1);
        expect((st?.progress ?? 0)).toBeGreaterThanOrEqual(0.95);
      },
      { timeout: 60000, interval: 100 },
    );
    // 95% を超えたら停止して「確認」→ 結果 (T3-04a。確認の正式な出し方は T3-04c)
    pressLeverOn(container, raf, 0 as 0 | 50 | 100);
    const confirm = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '確認');
    expect(confirm, '確認のボタン (仮)').toBeDefined();
    confirm!.click();
    // 結果の画面 (rAF のフレームで done を検知する)
    await vi.waitFor(() => expect(finished.length).toBeGreaterThan(0), { timeout: 30000, interval: 50 });
    const result = finished[0] as { stars: number; resultLines: Array<{ label: string; value: string }> };
    expect(result.stars).toBeGreaterThanOrEqual(1);
    const width = result.resultLines.find((l) => l.label === '幅合わせの誤差');
    expect(width?.value).toBe('0.0cm');
    instance.unmount();
  }, 60000);

  it('2. 寄せるボタンで偏りが戻る (偏りが出たら反対へ寄せて、偏りが小さくなる)', async () => {
    const { instance } = await startAligned(setupAligned());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    pressLeverOn(container, raf, 100 as 0 | 50 | 100);
    const shift = (): number => (instance.suspend() as BeamingState).shiftCm;
    // 偏るまで進める
    await vi.waitFor(
      () => {
        raf.advance(100);
        expect(Math.abs(shift())).toBeGreaterThan(1.5);
      },
      { timeout: 60000, interval: 100 },
    );
    const before = Math.abs(shift());
    const nudgeBtn = (): HTMLButtonElement | undefined =>
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === (shift() > 0 ? '◀ 寄せる' : '寄せる ▶'));
    nudgeBtn()!.click();
    nudgeBtn()!.click();
    expect(Math.abs(shift())).toBeLessThan(before);
    instance.unmount();
  }, 60000);

  it('3. unmount で rAF が止まり、盤面の描画も止まる', async () => {
    const { instance, finished } = await startAligned(setupAligned());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    pressLeverOn(container, raf, 100 as 0 | 50 | 100);
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
    pressLeverOn(container, raf, 100 as 0 | 50 | 100);
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

describe('PU-15c: メッセージ欄を無くす', () => {
  it('ビーム巻きの画面に .game-frame__message が無い (frame の message: false)。ペダルの理由はお知らせ', async () => {
    document.body.textContent = '';
    const raf2 = installFakeRaf();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ canvas: document.createElement('canvas') } as unknown as CanvasRenderingContext2D);
    const c = document.createElement('div');
    document.body.appendChild(c);
    const { deps } = await makeDeps();
    const instance = createBeamingController(c, deps, makeProps(), {
      level: 1, widthCm: 60, puzzleId: 's1', patternId: 'p-muji-kon', puzzleName: '無地紺', bands: 3, tutorial, onBack: () => undefined,
      resume: setupAligned(),
    });
    expect(c.querySelector('.game-frame__message')).toBeNull();
    pressLeverOn(c, raf2, 100); // 巻く前にレバーを押しても無効 (幅合わせの段階では動かない。T3-04b)
    expect((instance.suspend() as { progress: number }).progress).toBe(0);
    raf2.advance(2);
    instance.unmount();
    vi.unstubAllGlobals();
  });
});

describe('T3-04b (盤面の速さのレバー)', () => {
  let raf: ReturnType<typeof installFakeRaf>;
  let container: HTMLElement;

  /** 幅を合わせた状態でマウントする */
  async function mountAligned(resume?: BeamingState): Promise<{ instance: { unmount(): void; suspend(): unknown }; finished: unknown[] }> {
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

  /** 盤面にポインタ操作を送る */
  function stagePointer(type: 'pointerdown' | 'pointermove' | 'pointerup', sx: number, sy: number): void {
    const c = container.querySelector('canvas')!;
    c.dispatchEvent(new PointerEvent(type, { clientX: sx, clientY: sy, bubbles: true, pointerId: 1, button: 0 }));
  }

  it('1. 止まりを押すと speed が変わる (停止 → 50% → 100%)', async () => {
    const { instance } = await mountAligned(setupAligned());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    const { leverNotchX, leverY } = await import('./geometry');
    const { toScreen } = showBoardOn(container, raf);
    const at = (sp: 0 | 50 | 100): { x: number; y: number } => toScreen(leverNotchX(sp), leverY());
    const speed = (): number => (instance.suspend() as { speed: number }).speed;
    expect(speed()).toBe(0);
    stagePointer('pointerdown', at(50).x, at(50).y);
    stagePointer('pointerup', at(50).x, at(50).y);
    expect(speed()).toBe(50);
    stagePointer('pointerdown', at(100).x, at(100).y);
    stagePointer('pointerup', at(100).x, at(100).y);
    expect(speed()).toBe(100);
    instance.unmount();
  });

  it('2. 引っぱって離すと一番近い止まりに吸い付く', async () => {
    const { instance } = await mountAligned(setupAligned());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    const { leverNotchX, leverY } = await import('./geometry');
    const { toScreen } = showBoardOn(container, raf);
    // 停止の止まりから、100% の近くまで引っぱって離す → 100%
    const start = toScreen(leverNotchX(0), leverY());
    const end = toScreen(leverNotchX(100) - 40, leverY());
    stagePointer('pointerdown', start.x, start.y);
    stagePointer('pointermove', end.x, end.y);
    stagePointer('pointerup', end.x, end.y);
    expect((instance.suspend() as { speed: number }).speed).toBe(100);
    instance.unmount();
  });

  it("3. 幅合わせの段階 ('setup') ではレバーを押しても speed は変わらない", async () => {
    const { instance } = await mountAligned(setupAligned());
    const { leverNotchX, leverY } = await import('./geometry');
    const { toScreen } = showBoardOn(container, raf);
    const at = toScreen(leverNotchX(100), leverY());
    stagePointer('pointerdown', at.x, at.y);
    stagePointer('pointerup', at.x, at.y);
    expect((instance.suspend() as { speed: number; phase: string }).phase).toBe('setup');
    expect((instance.suspend() as { speed: number }).speed).toBe(0);
    instance.unmount();
  });
});

describe('T3-04b 不具合修正 (レバーの固まり)', () => {
  let raf: ReturnType<typeof installFakeRaf>;
  let container: HTMLElement;
  /** 幅を合わせた状態でマウントする */
  async function mountAligned(resume?: BeamingState): Promise<{ instance: { unmount(): void; suspend(): unknown }; finished: unknown[] }> {
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

  it('pointerup の pointerId が違っても (取りこぼしでも) レバーを離して速さが変わる。次の操作も効く', async () => {
    const { instance } = await mountAligned(setupAligned());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    const { leverNotchX, leverY } = await import('./geometry');
    const { toScreen } = showBoardOn(container, raf);
    const at = (sp: 0 | 50 | 100): { x: number; y: number } => toScreen(leverNotchX(sp), leverY());
    const stage = () => container.querySelector('canvas')!;
    const speed = (): number => (instance.suspend() as { speed: number }).speed;
    // down (id 1) → up は id 2 (取りこぼしの代わり) → それでも 50% に変わる
    stage().dispatchEvent(new PointerEvent('pointerdown', { clientX: at(50).x, clientY: at(50).y, bubbles: true, pointerId: 1, button: 0 }));
    stage().dispatchEvent(new PointerEvent('pointerup', { clientX: at(50).x, clientY: at(50).y, bubbles: true, pointerId: 2, button: 0 }));
    expect(speed()).toBe(50);
    // 固まっていない: 次の操作 (別の id) でも 100% に変えられる
    stage().dispatchEvent(new PointerEvent('pointerdown', { clientX: at(100).x, clientY: at(100).y, bubbles: true, pointerId: 3, button: 0 }));
    stage().dispatchEvent(new PointerEvent('pointerup', { clientX: at(100).x, clientY: at(100).y, bubbles: true, pointerId: 3, button: 0 }));
    expect(speed()).toBe(100);
    instance.unmount();
  });
});

describe('T3-04c (糸切れの結果の画面)', () => {
  let raf: ReturnType<typeof installFakeRaf>;
  let container: HTMLElement;

  /** 幅を合わせた状態でマウントする (onBack を渡せる) */
  async function mountAligned(onBack: () => void): Promise<{ instance: { unmount(): void; suspend(): unknown }; finished: unknown[] }> {
    const { deps } = await makeDeps();
    const props = makeProps();
    const instance = createBeamingController(container, deps, props, {
      level: 1,
      widthCm: 60,
      puzzleId: 's1',
      patternId: 'p-muji-kon',
      puzzleName: '無地紺',
      bands: 3,
      resume: setupAligned(),
      tutorial,
      onBack,
    });
    return { instance, finished: (props as GameProps & { finished: unknown[] }).finished };
  }

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

  /** 盤面のレバーを押す (down と up で同じ pointerId) */
  function pressLever(toScreen: (x: number, y: number) => { x: number; y: number }, sp: 0 | 50 | 100): void {
    const at = toScreen(leverNotchX(sp), leverY());
    const stage = container.querySelector('canvas')!;
    stage.dispatchEvent(new PointerEvent('pointerdown', { clientX: at.x, clientY: at.y, bubbles: true, pointerId: 21, button: 0 }));
    stage.dispatchEvent(new PointerEvent('pointerup', { clientX: at.x, clientY: at.y, bubbles: true, pointerId: 21, button: 0 }));
  }

  it('1. 止めずに 100% を超えると「糸が切れました」の画面 (星は無い・もう一度と一覧)。結果のコールバックは呼ばない', async () => {
    const onBack = vi.fn();
    const { instance, finished } = await mountAligned(() => onBack());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    const { toScreen } = showBoardOn(container, raf);
    pressLever(toScreen, 100);
    // 30 秒以上巻いて 100% を超える (16ms × 2000 フレーム = 32 秒)
    await vi.waitFor(
      () => {
        raf.advance(200);
        expect(instance.suspend()).toBeNull(); // finished で suspend が null になる
      },
      { timeout: 30000, interval: 50 },
    );
    // 1.5 秒の見せる時間のあと糸切れの画面
    await vi.waitFor(
      () => {
        const dlg = container.querySelector('.dialog-backdrop');
        expect(dlg).not.toBeNull();
        expect(dlg!.textContent).toContain('糸が切れました');
        expect(dlg!.textContent).toContain('巻き量が 100% を超えました');
      },
      { timeout: 5000, interval: 100 },
    );
    expect(finished.length).toBe(0); // 失敗は結果のコールバックを呼ばない (星を記録しない)
    const dlg = container.querySelector('.dialog-backdrop')!;
    expect(dlg.querySelector('.stars')).toBeNull(); // 星の欄は無い
    const labels = Array.from(dlg.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labels).toContain('もう一度');
    expect(labels).toContain('一覧');
    expect(labels).not.toContain('次へ');
    instance.unmount();
  }, 60000);

  it('2. 糸切れの画面の「もう一度」で同じお題をやり直す (幅合わせから)。「一覧」で戻る', async () => {
    const onBack = vi.fn();
    const { instance } = await mountAligned(() => onBack());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    const { toScreen } = showBoardOn(container, raf);
    pressLever(toScreen, 100);
    await vi.waitFor(
      () => {
        raf.advance(200);
        expect(instance.suspend()).toBeNull();
      },
      { timeout: 30000, interval: 50 },
    );
    await vi.waitFor(() => expect(container.querySelector('.dialog-backdrop')).not.toBeNull(), { timeout: 5000, interval: 100 });
    const dlg = container.querySelector('.dialog-backdrop')!;
    const again = Array.from(dlg.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'もう一度')!;
    again.click();
    // 幅合わせの段階に戻る (巻き量 0%・巻き始めるのボタン)
    const st = instance.suspend() as BeamingState;
    expect(st.phase).toBe('setup');
    expect(st.progress).toBe(0);
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === '巻き始める')).toBe(true);
    instance.unmount();
  }, 60000);
});

describe('T2-17 (遊び方を開いているあいだの一時停止)', () => {
  let raf: ReturnType<typeof installFakeRaf>;
  let container: HTMLElement;

  /** 幅を合わせた状態でマウントする */
  async function mountAligned(resume?: BeamingState): Promise<{ instance: { unmount(): void; suspend(): unknown }; finished: unknown[] }> {
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

  const helpBtn = (c: HTMLElement): HTMLButtonElement | null => c.querySelector<HTMLButtonElement>('button[aria-label="遊び方"]');
  const closeBtn = (c: HTMLElement): HTMLButtonElement | null => c.querySelector<HTMLButtonElement>('button[aria-label="閉じる"]');

  it('1. 巻いているあいだに遊び方を開くと、5 秒進めても巻き量が変わらない', async () => {
    const { instance } = await mountAligned(setupAligned());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    pressLeverOn(container, raf, 50);
    raf.advance(30);
    const before = instance.suspend() as { progress: number; windMs: number };
    expect(before.progress).toBeGreaterThan(0);
    helpBtn(container)!.click();
    await vi.waitFor(() => expect(container.querySelector('.dialog-backdrop')).not.toBeNull());
    raf.advance(312); // 5 秒ぶん
    const after = instance.suspend() as { progress: number; windMs: number };
    expect(after.progress).toBe(before.progress);
    expect(after.windMs).toBe(before.windMs);
    instance.unmount();
  }, 30000);

  it('2. 閉じると自動で再開する。レバーは開く前のまま (50%)。直後の 1 フレームでは進まない', async () => {
    const { instance } = await mountAligned(setupAligned());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    pressLeverOn(container, raf, 50);
    raf.advance(30);
    const before = instance.suspend() as { progress: number; windMs: number; speed: number };
    helpBtn(container)!.click();
    await vi.waitFor(() => expect(container.querySelector('.dialog-backdrop')).not.toBeNull());
    raf.advance(312);
    closeBtn(container)!.click();
    await vi.waitFor(() => expect(container.querySelector('.dialog-backdrop')).toBeNull());
    const resumed = instance.suspend() as { progress: number; windMs: number; speed: number };
    expect(resumed.speed).toBe(50); // レバーの位置はそのまま
    expect(resumed.progress).toBe(before.progress); // 最初のフレームでは進まない (dt 0)
    raf.advance(60);
    const later = instance.suspend() as { progress: number };
    expect(later.progress).toBeGreaterThan(before.progress);
    instance.unmount();
  }, 30000);

  it('3. 遊び方を開いたまま unmount すると rAF が止まる', async () => {
    const { instance } = await mountAligned(setupAligned());
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    pressLeverOn(container, raf, 50);
    raf.advance(10);
    helpBtn(container)!.click();
    await vi.waitFor(() => expect(container.querySelector('.dialog-backdrop')).not.toBeNull());
    const draws = drawBoardCalls.length;
    instance.unmount();
    raf.advance(30);
    expect(drawBoardCalls.length).toBe(draws);
  }, 30000);
});
