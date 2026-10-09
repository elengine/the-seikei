import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBeamingController } from './controller';
import { init, reduce } from './logic';
import type { BeamingState } from './logic';
import type { GameDeps, GameProps, TutorialSpec } from '../../core/game/types';
import { createAppContext } from '../../app/context';
import type { AppContext } from '../../app/context';
import { createFixedClock } from '../../core/clock/clock';
import { cmToX, pxPerCm, BOARD, BEAM_CENTER_X, DRUM_X } from './geometry';
import { logicalHeightFor } from '../winding/geometry';
import { speedBarCenterX, SPEED_BAR_SHIFT_MAX } from './geometry';
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

/** 幅合わせ → 糸を付けた状態 (phase は beaming。T3-06) */
function setupWound(): BeamingState {
  let s = setupAligned();
  s = reduce(s, { type: 'finishSetup' });
  return reduce(s, { type: 'attachThread' });
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
/** stage (canvas の親) に pointer イベントを送る */
function fireAt(container: HTMLElement, p: { x: number; y: number }, type: string, id = 41): void {
  const stage = container.querySelector('canvas') as HTMLElement;
  stage.dispatchEvent(new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerId: id, button: 0 }));
}

const TEST_FIT = (): { toScreen: (x: number, y: number) => { x: number; y: number } } => {
  const fit = fitStage(1000, logicalHeightFor(600, 400), 600, 400);
  return { toScreen: (x: number, y: number) => ({ x: x * fit.scale + fit.offsetX, y: y * fit.scale + fit.offsetY }) };
};

/** ドラムの下の端の糸の当たり判定の位置 (画面の座標。T3-06) */
function sheetEdgePoint(): { x: number; y: number } {
  const { toScreen } = TEST_FIT();
  return toScreen(DRUM_X, BOARD.drumY + BOARD.drumH);
}

/** ビームの上 (巻いた面) の位置 (画面の座標。T3-06) */
function beamWindPoint(): { x: number; y: number } {
  const { toScreen } = TEST_FIT();
  return toScreen(BEAM_CENTER_X, BOARD.axisY);
}

/** jsdom に無い setPointerCapture を足す (ペダルの溝を指で動かす操作のため) */
if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture(): void {};
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {};
}

/** 画面の「速さ N」の今の値 (操作欄。無ければ 0) */
function currentSpeedOf(container: HTMLElement): number {
  const m = /速さ\s*(\d+)/.exec(container.querySelector('.beaming-panel__speed')?.textContent ?? '');
  return m === null ? 0 : Number(m[1]);
}

/** 茶色の棒を from の速さの位置から to の速さの位置まで引っぱる (pointerdown → pointermove → pointerup。PU-24b) */
function dragBarSpeed(
  stage: HTMLElement,
  toScreen: (x: number, y: number) => { x: number; y: number },
  from: number,
  to: number,
  id = 31,
): void {
  const a = toScreen(speedBarCenterX(from), BOARD.guideY);
  const z = toScreen(speedBarCenterX(to), BOARD.guideY);
  stage.dispatchEvent(new PointerEvent('pointerdown', { clientX: a.x, clientY: a.y, bubbles: true, pointerId: id, button: 0 }));
  stage.dispatchEvent(new PointerEvent('pointermove', { clientX: z.x, clientY: z.y, bubbles: true, pointerId: id, button: 0 }));
  stage.dispatchEvent(new PointerEvent('pointerup', { clientX: z.x, clientY: z.y, bubbles: true, pointerId: id, button: 0 }));
}

/** 盤面のカードを 600×400 に見せて、茶色の棒を引っぱって速さを sp にする (T3-04a/b → PU-24b。canvas の fit が必要) */
function pressLeverOn(container: HTMLElement, raf: { advance(n: number): void }, sp: number): void {
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
    dragBarSpeed(stage, toScreen, currentSpeedOf(container), sp);
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

  it('1. 幅を合わせて「ビーム設定OK」→ 糸を付けて棒を引っぱって偽の rAF で進めると結果の画面 (幅の誤差 0cm)', async () => {
    const { instance, finished } = await startAligned(setupAligned());
    const start = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'ビーム設定OK');
    expect(start).toBeDefined();
    start!.click();
    showBoardOn(container, raf); // fit を立ててから糸を引っぱる
    // 糸を付ける: 糸の当たり判定からビームの上へ引っぱって離す (attachThread。T3-06)
    let s = instance.suspend() as BeamingState;
    expect(s.phase).toBe('attach');
    fireAt(container, sheetEdgePoint(), 'pointerdown');
    fireAt(container, beamWindPoint(), 'pointermove');
    fireAt(container, beamWindPoint(), 'pointerup');
    s = instance.suspend() as BeamingState;
    expect(s.phase).toBe('beaming'); // 糸が付いた
    pressLeverOn(container, raf, 100 as 0 | 50 | 100); // 全速
    // 95% まで巻く (速さ 100 は 25〜75% だけ適正。結果の星は問わない)
    await vi.waitFor(
      () => {
        raf.advance(300);
        const st = instance.suspend() as BeamingState | null;
        expect((st?.progress ?? 0)).toBeGreaterThanOrEqual(0.95);
      },
      { timeout: 60000, interval: 100 },
    );
    // 95% を超えたら停止して「完了」→ 結果 (T3-06 で「確認」から名前を変えた)
    pressLeverOn(container, raf, 0 as 0 | 50 | 100);
    const confirm = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '完了');
    expect(confirm, '完了のボタン').toBeDefined();
    confirm!.click();
    // 結果の画面 (rAF のフレームで done を検知する)
    await vi.waitFor(() => expect(finished.length).toBeGreaterThan(0), { timeout: 30000, interval: 50 });
    const result = finished[0] as { stars: number; resultLines: Array<{ label: string; value: string }> };
    expect(result.stars).toBeGreaterThanOrEqual(1);
    const width = result.resultLines.find((l) => l.label === '幅合わせの誤差');
    expect(width?.value).toBe('0.0cm');
    instance.unmount();
  }, 60000);


  it('3. unmount で rAF が止まり、盤面の描画も止まる', async () => {
    const { instance, finished } = await startAligned(setupWound());
    pressLeverOn(container, raf, 100 as 0 | 50 | 100);
    raf.advance(50);
    const draws = drawBoardCalls.length;
    instance.unmount();
    raf.advance(100);
    expect(drawBoardCalls.length).toBe(draws); // 止まったあとは描かない
    expect(finished.length).toBe(0);
  });

  it('4. 巻いているあいだ、ドラムが回る角度 (drumAngle) が renderer に渡る', async () => {
    const { instance } = await startAligned(setupWound());
    pressLeverOn(container, raf, 100 as 0 | 50 | 100);
    raf.advance(30);
    const a1 = lastDrumAngle();
    expect(typeof a1).toBe('number');
    raf.advance(30);
    const a2 = lastDrumAngle();
    expect(a2! > a1!).toBe(true); // 巻いているあいだは増える
    instance.unmount();
  });

  it('PU-26: ドラムとビームの回る角度。速さ 0 のあいだは両方とも変わらず、速さがあると両方とも増える', async () => {
    const { instance } = await startAligned(setupWound());
    raf.advance(30);
    const last = (): { drum: number; beam: number } => {
      const l = drawBoardCalls[drawBoardCalls.length - 1]!;
      return { drum: l[4] as number, beam: l[6] as number };
    };
    const a0 = last();
    raf.advance(30);
    expect(last()).toEqual(a0); // 速さ 0 では止まっている
    expect(a0.beam).toBe(0);
    pressLeverOn(container, raf, 100);
    raf.advance(30);
    const a1 = last();
    raf.advance(30);
    const a2 = last();
    expect(a2.drum).toBeGreaterThan(a1.drum);
    expect(a2.beam).toBeGreaterThan(a1.beam);
    instance.unmount();
  });

  describe('PU-26 決まり5: 糸を引っぱる操作の不足分', () => {
    /** 幅合わせ → 「ビーム設定OK」→ attach の状態にして、盤面を 600×400 に見せる */
    async function startAttach(): Promise<{ instance: { unmount(): void; suspend(): unknown } }> {
      const { instance } = await startAligned(setupAligned());
      const start = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'ビーム設定OK');
      start!.click();
      showBoardOn(container, raf);
      expect((instance.suspend() as BeamingState).phase).toBe('attach');
      return { instance };
    }
    const lastThread = (): unknown => drawBoardCalls[drawBoardCalls.length - 1]![5];

    it('1. ドラムの端を押さえて、ビームでない所で離すと attach のまま (糸は付かない・糸の線は消える)', async () => {
      const { instance } = await startAttach();
      const { toScreen } = TEST_FIT();
      fireAt(container, sheetEdgePoint(), 'pointerdown');
      const away = toScreen(BEAM_CENTER_X, BOARD.guideY);
      fireAt(container, away, 'pointermove');
      expect(lastThread()).not.toBeNull(); // 引っぱっているあいだは線を描く
      fireAt(container, away, 'pointerup');
      expect((instance.suspend() as BeamingState).phase).toBe('attach');
      expect(lastThread()).toBeNull();
      instance.unmount();
    });

    it('2. 糸を引っぱっている途中の pointercancel で attach のまま、糸の線が消える。そのあとの pointerup では何も起きない', async () => {
      const { instance } = await startAttach();
      fireAt(container, sheetEdgePoint(), 'pointerdown');
      fireAt(container, beamWindPoint(), 'pointermove');
      expect(lastThread()).not.toBeNull();
      fireAt(container, beamWindPoint(), 'pointercancel');
      expect((instance.suspend() as BeamingState).phase).toBe('attach');
      expect(lastThread()).toBeNull();
      fireAt(container, beamWindPoint(), 'pointerup');
      expect((instance.suspend() as BeamingState).phase).toBe('attach');
      instance.unmount();
    });

    it('3. 糸を引っぱっている途中で unmount しても例外が出ず、そのあとの pointerup で何も起きない (描かない)', async () => {
      const { instance } = await startAttach();
      fireAt(container, sheetEdgePoint(), 'pointerdown');
      fireAt(container, beamWindPoint(), 'pointermove');
      const canvas = container.querySelector('canvas')!;
      const draws = drawBoardCalls.length;
      expect(() => instance.unmount()).not.toThrow();
      expect(() => canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 10, bubbles: true, pointerId: 41, button: 0 }))).not.toThrow();
      raf.advance(5);
      expect(drawBoardCalls.length).toBe(draws);
    });
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
    // ビーム設定OK のあとは動かない (attach 段階。円盤は引っぱれない)
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'ビーム設定OK')!.click();
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

  const startWinding = (inst: { suspend(): unknown }): void => {
    // 糸を付ける (T3-06)。resume が setupWound (beaming) なら何もしない
    const s = inst.suspend() as BeamingState;
    if (s.phase !== 'attach') return;
    const { toScreen } = showBoardOn(container, raf);
    const stage = container.querySelector('canvas')!;
    const a = toScreen(DRUM_X, BOARD.drumY + BOARD.drumH);
    const b = toScreen(BEAM_CENTER_X, BOARD.axisY);
    stage.dispatchEvent(new PointerEvent('pointerdown', { clientX: a.x, clientY: a.y, bubbles: true, pointerId: 41, button: 0 }));
    stage.dispatchEvent(new PointerEvent('pointermove', { clientX: b.x, clientY: b.y, bubbles: true, pointerId: 41, button: 0 }));
    stage.dispatchEvent(new PointerEvent('pointerup', { clientX: b.x, clientY: b.y, bubbles: true, pointerId: 41, button: 0 }));
  };

  it('1. 茶色の棒を右へ引っぱると speed が増え、左へ引っぱると減る。いちばん右で 100・いちばん左で 0 (連続の値。PU-24b)', async () => {
    const { instance } = await mountAligned(setupWound());
    startWinding(instance);
    const { toScreen } = showBoardOn(container, raf);
    const stage = container.querySelector('canvas')!;
    const speed = (): number => (instance.suspend() as { speed: number }).speed;
    expect(speed()).toBe(0);
    dragBarSpeed(stage, toScreen, 0, 37);
    expect(speed()).toBe(37);
    dragBarSpeed(stage, toScreen, 37, 63);
    expect(speed()).toBe(63);
    dragBarSpeed(stage, toScreen, 63, 100);
    expect(speed()).toBe(100);
    // 右端を越えて引っぱっても 100、左端を越えても 0
    const a = toScreen(speedBarCenterX(100), BOARD.guideY);
    stagePointer('pointerdown', a.x, a.y);
    stagePointer('pointermove', a.x + 300, a.y);
    expect(speed()).toBe(100);
    stagePointer('pointermove', a.x - 2 * SPEED_BAR_SHIFT_MAX * 4, a.y);
    expect(speed()).toBe(0);
    stagePointer('pointerup', a.x - 2 * SPEED_BAR_SHIFT_MAX * 4, a.y);
    instance.unmount();
  });

  it('2. 引っぱっているあいだは速さが指に合わせて連続で変わり、離したあとも保たれる。棒のどこを押さえても (棒の上下 32px の中なら) 引っぱれる', async () => {
    const { instance } = await mountAligned(setupWound());
    startWinding(instance);
    const { toScreen } = showBoardOn(container, raf);
    const speed = (): number => (instance.suspend() as { speed: number }).speed;
    const left = toScreen(speedBarCenterX(0) - 200, BOARD.guideY + 28); // 棒の左の端に近い所・上下 28px ずれ
    const per = toScreen(1, 0).x - toScreen(0, 0).x;
    stagePointer('pointerdown', left.x, left.y);
    stagePointer('pointermove', left.x + 20 * (SPEED_BAR_SHIFT_MAX / 50) * per, left.y);
    expect(speed()).toBe(20);
    stagePointer('pointermove', left.x + 60 * (SPEED_BAR_SHIFT_MAX / 50) * per, left.y);
    expect(speed()).toBe(60);
    stagePointer('pointerup', left.x + 60 * (SPEED_BAR_SHIFT_MAX / 50) * per, left.y);
    expect(speed()).toBe(60);
    instance.unmount();
  });

  it('3. pointercancel では、引っぱる前の速さに戻す', async () => {
    const { instance } = await mountAligned(setupWound());
    startWinding(instance);
    const { toScreen } = showBoardOn(container, raf);
    const speed = (): number => (instance.suspend() as { speed: number }).speed;
    dragBarSpeed(container.querySelector('canvas')!, toScreen, 0, 40);
    expect(speed()).toBe(40);
    const a = toScreen(speedBarCenterX(40), BOARD.guideY);
    const b = toScreen(speedBarCenterX(90), BOARD.guideY);
    stagePointer('pointerdown', a.x, a.y);
    stagePointer('pointermove', b.x, b.y);
    expect(speed()).toBe(90);
    container.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointercancel', { clientX: b.x, clientY: b.y, bubbles: true, pointerId: 1, button: 0 }));
    expect(speed()).toBe(40);
    instance.unmount();
  });

  it("4. 幅合わせの段階 ('setup') では棒を引っぱっても speed は変わらない (押せない形)", async () => {
    const { instance } = await mountAligned(setupAligned());
    const { toScreen } = showBoardOn(container, raf);
    dragBarSpeed(container.querySelector('canvas')!, toScreen, 0, 80);
    expect((instance.suspend() as { phase: string }).phase).toBe('setup');
    expect((instance.suspend() as { speed: number }).speed).toBe(0);
    instance.unmount();
  });

  it('5. 棒の外 (上下 40px 以上はなれた所) を押しても何も起きない。止まっている棒の位置は盤面の中心より左', async () => {
    const { instance } = await mountAligned(setupWound());
    startWinding(instance);
    const { toScreen } = showBoardOn(container, raf);
    const a = toScreen(speedBarCenterX(0), BOARD.guideY + 60);
    stagePointer('pointerdown', a.x, a.y);
    stagePointer('pointermove', a.x + 200, a.y);
    stagePointer('pointerup', a.x + 200, a.y);
    expect((instance.suspend() as { speed: number }).speed).toBe(0);
    expect(speedBarCenterX(0)).toBeLessThan(500);
    expect(500 - speedBarCenterX(0)).toBe(SPEED_BAR_SHIFT_MAX);
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

  it('pointerup の pointerId が違っても (取りこぼしでも) 棒を離して引っぱりが終わり、速さは保たれる。次の操作 (別の id) も効く', async () => {
    const { instance } = await mountAligned(setupWound());
    const { toScreen } = showBoardOn(container, raf);
    const stage = () => container.querySelector('canvas')!;
    const speed = (): number => (instance.suspend() as { speed: number }).speed;
    const at = (sp: number): { x: number; y: number } => toScreen(speedBarCenterX(sp), BOARD.guideY);
    // down (id 1) → move (id 1) → up は id 2 (取りこぼしの代わり) → 50 のまま
    stage().dispatchEvent(new PointerEvent('pointerdown', { clientX: at(0).x, clientY: at(0).y, bubbles: true, pointerId: 1, button: 0 }));
    stage().dispatchEvent(new PointerEvent('pointermove', { clientX: at(50).x, clientY: at(50).y, bubbles: true, pointerId: 1, button: 0 }));
    stage().dispatchEvent(new PointerEvent('pointerup', { clientX: at(50).x, clientY: at(50).y, bubbles: true, pointerId: 2, button: 0 }));
    expect(speed()).toBe(50);
    // 固まっていない: 次の操作 (別の id) でさらに 100 まで引っぱれる
    stage().dispatchEvent(new PointerEvent('pointerdown', { clientX: at(50).x, clientY: at(50).y, bubbles: true, pointerId: 3, button: 0 }));
    stage().dispatchEvent(new PointerEvent('pointermove', { clientX: at(100).x, clientY: at(100).y, bubbles: true, pointerId: 3, button: 0 }));
    stage().dispatchEvent(new PointerEvent('pointerup', { clientX: at(100).x, clientY: at(100).y, bubbles: true, pointerId: 3, button: 0 }));
    expect(speed()).toBe(100);
    instance.unmount();
  });
});

describe('T3-04c (糸切れの結果の画面)', () => {
  let raf: ReturnType<typeof installFakeRaf>;
  let container: HTMLElement;

  /** 幅を合わせて糸も付けた状態でマウントする (onBack を渡せる。T3-06) */
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
      resume: setupWound(),
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

  /** 茶色の棒を速さ 0 から sp まで引っぱる (down・move・up で同じ pointerId) */
  function pressLever(toScreen: (x: number, y: number) => { x: number; y: number }, sp: number): void {
    dragBarSpeed(container.querySelector('canvas')!, toScreen, 0, sp, 21);
  }

  it('1. 止めずに 101% に届くと「糸が切れました」の画面 (星は無い・もう一度と一覧)。結果のコールバックは呼ばない (T3-05)', async () => {
    const onBack = vi.fn();
    const { instance, finished } = await mountAligned(() => onBack());
    const { toScreen } = showBoardOn(container, raf);
    pressLever(toScreen, 100);
    // 30 秒以上巻いて 101% に届かせる (16ms × 2000 フレーム = 32 秒)
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
        expect(dlg!.textContent).toContain('巻き量が 101% に届きました');
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
    // 幅合わせの段階に戻る (巻き量 0%・ビーム設定OKのボタン)
    const st = instance.suspend() as BeamingState;
    expect(st.phase).toBe('setup');
    expect(st.progress).toBe(0);
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'ビーム設定OK')).toBe(true);
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
    const { instance } = await mountAligned(setupWound());
    showBoardOn(container, raf);
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
    const { instance } = await mountAligned(setupWound());
    showBoardOn(container, raf);
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
    const { instance } = await mountAligned(setupWound());
    showBoardOn(container, raf);
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
