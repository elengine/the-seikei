import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDrumSetupController } from './controller';
import type { GameDeps, GameProps } from '../../core/game/types';
import { createAppContext } from '../../app/context';
import type { AppContext } from '../../app/context';
import { createFixedClock } from '../../core/clock/clock';
import type { DrumSetupPuzzle } from './puzzles';
import type { DrumSetupState } from './logic';
import { init } from './logic';

const drawBoardCalls: unknown[][] = [];
vi.mock('./renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./renderer')>();
  return { ...actual, drawBoard: (...args: unknown[]) => { drawBoardCalls.push(args); } };
});

/** drawBoard に渡された view (最後の呼び出し) */
function lastView(): { angle: number | null; feed: number; outcome: string | null; progress: number; showResult: boolean } | undefined {
  const last = drawBoardCalls[drawBoardCalls.length - 1];
  if (last === undefined) return undefined;
  return last[3] as { angle: number | null; feed: number; outcome: string | null; progress: number; showResult: boolean };
}

let dbSeq = 0;

async function makeDeps(): Promise<{ deps: GameDeps; ctx: AppContext }> {
  const ctx = await createAppContext({
    dbName: `drumsetup-test-${Date.now().toString(36)}-${dbSeq++}`,
    clock: createFixedClock('2026-10-04T00:00:00Z'),
    navigate: () => undefined,
  });
  const deps = {
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

function p1(): DrumSetupPuzzle {
  return { id: 's1', stage: 1, patternId: 'p-muji-kon', name: '紺の無地', grade: '2/48', ends: 400, widthCm: 20 };
}

/** 偽の requestAnimationFrame (手動で進める) */
function installFakeRaf(): { advance(n: number): void; count: number } {
  const frames: Array<() => void> = [];
  let now = 0;
  let count = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void): number => {
    const at = now + 16;
    frames.push(() => {
      now = at;
      cb(at);
    });
    count++;
    return count;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  return {
    get count(): number {
      return count;
    },
    advance(n: number): void {
      for (let i = 0; i < n; i++) {
        const f = frames.shift();
        if (f) f();
      }
    },
  };
}

async function wait(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function buttonByText(parent: HTMLElement, text: string): HTMLButtonElement {
  const b = Array.from(parent.querySelectorAll<HTMLButtonElement>('button')).find((x) => x.textContent?.trim() === text);
  if (b === undefined) {
    throw new Error(`button not found: ${text}`);
  }
  return b;
}

/** マウントして、角度 9°・電卓で 1.07 を入れるところまで進める */
async function setupToTrial(p: DrumSetupPuzzle, feedKeys: string[], angleLabel = '9°'): Promise<{ parent: HTMLElement; instance: ReturnType<typeof createDrumSetupController>; props: ReturnType<typeof makeProps>; raf: ReturnType<typeof installFakeRaf> }> {
  const { deps } = await makeDeps();
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const props = makeProps();
  const raf = installFakeRaf();
  const instance = createDrumSetupController(parent, deps, props, {
    puzzle: p,
    tutorial: { pages: [] },
    onBack: () => undefined,
  });
  buttonByText(parent, angleLabel === '9°' ? '9°○' : angleLabel).click();
  // 電卓を開いて答えを入れる
  buttonByText(parent, '電卓').click();
  for (const k of feedKeys) {
    buttonByText(parent, k).click();
  }
  buttonByText(parent, 'この答えを送り量に入れる').click();
  return { parent, instance, props, raf };
}

describe('drumsetup controller T2c-03a', () => {
  beforeEach(() => {
    document.body.textContent = '';
    installFakeRaf();
    // jsdom の canvas は getContext が null を返す。drawBoard が呼ばれるように偽の ctx を返す
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('1. 角度を選び、電卓で送り量を合わせ、試し巻きを 5 秒進めると結果の画面 (星3) になる', async () => {
    drawBoardCalls.length = 0;
    const { parent, instance, props, raf: r } = await setupToTrial(p1(), ['1', '.', '0', '7']);
    const feed = parent.querySelector('[data-testid="drumsetup-feed"]')!.textContent!;
    expect(feed).toContain('1.07 mm');
    // 試し巻き → 5 秒 (TRIAL_MS) 進める
    buttonByText(parent, '試し巻き').click();
    expect(lastView()?.outcome).toBe('good');
    r.advance(320); // 16ms × 320 = 5.1秒
    await wait(1700); // done の見せる時間 (1.5秒)
    expect(props.finished).toHaveLength(1);
    const result = props.finished[0] as { stars: number; resultLines: { label: string; value: string }[]; starHint?: string };
    expect(result.stars).toBe(3);
    const lines = result.resultLines.map((l) => `${l.label} ${l.value}`).join(' / ');
    expect(lines).toContain('羽の角度 9°');
    expect(lines).toContain('送り量 1.07mm(正しい値 1.07mm)');
    expect(lines).toContain('試し巻きの回数 1回');
    expect(lines).toContain('密度'); // 正しい計算 (答え合わせ)
    expect(result.starHint).toContain('5%');
    instance.unmount();
  });

  it('2. 送り量が少なすぎると「潰れました」のメッセージが出て、setting に戻り「ここで終える」で星2の結果になる', async () => {
    drawBoardCalls.length = 0;
    const { parent, instance, props, raf: r } = await setupToTrial(p1(), ['0', '.', '9', '6']);
    buttonByText(parent, '試し巻き').click();
    expect(lastView()?.outcome).toBe('crush');
    r.advance(320);
    // trialEnd で setting に戻る (結果の画面は出ない)
    expect(props.finished).toHaveLength(0);
    expect(parent.querySelector('.game-frame__message')?.textContent).toContain('潰れました');
    // やり直せる (ここで終える も出る)
    const finishBtn = buttonByText(parent, 'ここで終える');
    finishBtn.click();
    await wait(1700);
    const result = props.finished[0] as { stars: number };
    expect(result.stars).toBe(2);
    instance.unmount();
  });

  it('3. 使えない角度 (2/48 に 5°) で試し巻きをすると badAngle になり、盤面にその結果が渡る', async () => {
    drawBoardCalls.length = 0;
    const { parent, instance, raf: r } = await setupToTrial(p1(), ['1', '.', '0', '7'], '5°');
    buttonByText(parent, '試し巻き').click();
    expect(lastView()?.outcome).toBe('badAngle');
    r.advance(320);
    expect(parent.querySelector('.game-frame__message')?.textContent).toContain('使えません');
    instance.unmount();
  });

  it('4. unmount のあと rAF が止まる', async () => {
    drawBoardCalls.length = 0;
    const { instance, raf: r } = await setupToTrial(p1(), ['1', '.', '0', '7']);
    const before = drawBoardCalls.length;
    instance.unmount();
    r.advance(30);
    expect(drawBoardCalls.length).toBe(before);
  });

  it('5. resume で再開する (送り量と角度が復元される)', async () => {
    const { deps } = await makeDeps();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const p = p1();
    let s: DrumSetupState = init(p);
    s = { ...s, angle: 9, feed: 0.96 };
    const props = makeProps({ resume: s });
    const instance = createDrumSetupController(parent, deps, props, {
      puzzle: p,
      tutorial: { pages: [] },
      onBack: () => undefined,
    });
    expect(parent.querySelector('[data-testid="drumsetup-feed"]')?.textContent).toContain('0.96 mm');
    expect(lastView()?.angle).toBe(9);
    instance.unmount();
    vi.unstubAllGlobals();
  });

  it('6. 裏に回ったら試し巻きの絵を止めて、結果だけ決める', async () => {
    drawBoardCalls.length = 0;
    const { parent, instance, raf: r } = await setupToTrial(p1(), ['0', '.', '9', '6']);
    buttonByText(parent, '試し巻き').click();
    r.advance(30); // 途中まで
    // 裏に回る
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // 結果だけ決まって setting に戻る (メッセージが出る)
    expect(parent.querySelector('.game-frame__message')?.textContent).toContain('潰れました');
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    instance.unmount();
  });
});
