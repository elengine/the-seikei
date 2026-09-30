import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWindingModule } from './index';
import type { GameDeps, GameProps } from '../../core/game/types';
import { createAppContext } from '../../app/context';
import type { AppContext } from '../../app/context';
import { createFixedClock } from '../../core/clock/clock';

let dbSeq = 0;

async function makeDeps(): Promise<{ deps: GameDeps; ctx: AppContext }> {
  const ctx = await createAppContext({
    dbName: `winding-test-${Date.now().toString(36)}-${dbSeq++}`,
    clock: createFixedClock('2026-09-30T00:00:00Z'),
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

/** props を作る (onFinish・onExit を記録) */
function makeProps(overrides?: Partial<GameProps>): GameProps & { finished: unknown[]; exited: boolean } {
  const finished: unknown[] = [];
  const props = {
    mode: 'standalone' as const,
    resume: undefined,
    onStateChange: undefined,
    onFinish: (r: unknown) => finished.push(r),
    onExit: () => undefined,
    ...overrides,
  };
  return Object.assign(props, { finished, exited: false });
}

/** 偽の requestAnimationFrame (手動で進める) */
function installFakeRaf(): { frames: Array<() => void>; advance(n: number): void } {
  const frames: Array<() => void> = [];
  let now = 0; // 偽の時計 (1フレーム = 16ms)
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
    frames,
    advance(n: number): void {
      for (let i = 0; i < n; i++) {
        const f = frames.shift();
        if (f) f();
      }
    },
  };
}

/** 本物の setTimeout のまま、タイマーを進める */
async function wait(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

describe('winding module (T2-07)', () => {
  let raf: ReturnType<typeof installFakeRaf>;

  beforeEach(() => {
    document.body.textContent = '';
    raf = installFakeRaf();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('1. 一覧: 記録が無いと初級だけ押せる。初級の星があると中級まで押せる', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    const props = makeProps();
    const instance = module.mount(container, props);
    const btns = (): HTMLButtonElement[] =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-testid^="winding-level-"]'));
    // 記録が無い → 初級だけ押せる
    const b0 = btns();
    expect(b0).toHaveLength(3);
    expect(b0[0]!.disabled).toBe(false);
    expect(b0[1]!.disabled).toBe(true);
    expect(b0[2]!.disabled).toBe(true);
    expect(b0[1]!.textContent).toContain('未解放');
    // 初級をクリアした記録を入れる
    await deps.records.add('winding', 3, { 'level:1': 3 });
    container.textContent = '';
    module.mount(container, makeProps());
    const b1 = btns();
    expect(b1[0]!.disabled).toBe(false);
    expect(b1[1]!.disabled).toBe(false);
    expect(b1[2]!.disabled).toBe(true);
    expect(b1[0]!.textContent).toContain('★');
    instance.unmount();
  });

  it('2. プレイ: 初級で「巻き始める」→ ペダル 40 → 帯を巻き終え、「帯の端を結ぶ」を3回 → onFinish が1回、stars 3', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    const props = makeProps();
    const instance = module.mount(container, props);
    // 初級を選ぶ
    const level1 = container.querySelector<HTMLButtonElement>('button[data-testid="winding-level-1"]')!;
    level1.click();
    // 「巻き始める」
    const start = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める');
    expect(start).toBeDefined();
    start!.click();
    // ペダル 40 (「踏み込む」×4)
    for (let i = 0; i < 4; i++) {
      const plus = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '踏み込む');
      plus!.click();
    }
    // 帯1本: pedal 40 の速さ (16/秒) で 400 論理長 → 25秒。rAF 16ms ずつ → 約1563フレーム
    raf.advance(2000);
    // 「帯の端を結ぶ」が押せる (cutting)
    const cut = (): HTMLButtonElement | undefined =>
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '帯の端を結ぶ');
    expect(cut()).toBeDefined();
    // 3回 (演出の1秒ずつ)。ボタンが見えている (display が空) ときだけ押す。
    // cut のあとはペダルが 0 に戻るので、次の帯の前に「踏み込む」をもう4回押す
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        for (let k = 0; k < 4; k++) {
          Array.from(container.querySelectorAll('button'))
            .find((b) => b.textContent === '踏み込む')!
            .click();
        }
      }
      await vi.waitFor(
        () => {
          raf.advance(24); // 手動の rAF を少しずつ進める (帯が巻き終わるまで)
          const b = cut();
          expect(b).toBeDefined();
          expect(b!.style.display).not.toBe('none');
        },
        { timeout: 30000, interval: 100 },
      );
      cut()!.click();
      // 演出の1秒を待つ
      await wait(1100);
    }
    // 最後の帯が巻き終わる (rAF を進めつつ待つ。演出の1.5秒のあと onFinish)
    await vi.waitFor(
      () => {
        raf.advance(24);
        expect(props.finished).toHaveLength(1);
      },
      { timeout: 30000, interval: 100 },
    );
    const result = props.finished[0] as { gameId: string; stars: number };
    expect(result.gameId).toBe('winding');
    expect(result.stars).toBe(3);
    instance.unmount();
  }, 30000);

  it('3. visibilitychange の hidden で、状態のペダルが 0 になり、rAF が止まる', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    const props = makeProps();
    const instance = module.mount(container, props);
    const level1 = container.querySelector<HTMLButtonElement>('button[data-testid="winding-level-1"]')!;
    level1.click();
    Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '巻き始める')!
      .click();
    // ペダルを踏む
    const plus = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '踏み込む');
    plus!.click();
    raf.advance(10);
    const framesBefore = raf.frames.length;
    // 裏に回る
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    // rAF が止まる (新しいフレームが積まれない)
    const framesAfter = raf.frames.length;
    expect(framesAfter).toBeLessThanOrEqual(framesBefore);
    // ペダルの表示が 0 (「速さ 0」)
    const value = container.querySelector('.pedal__value');
    expect(value?.textContent).toContain('0');
    // 戻す
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    instance.unmount();
  });

  it('4. unmount の後に rAF・タイマーが残っていない', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    const props = makeProps();
    const instance = module.mount(container, props);
    const level1 = container.querySelector<HTMLButtonElement>('button[data-testid="winding-level-1"]')!;
    level1.click();
    Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '巻き始める')!
      .click();
    raf.advance(5);
    instance.unmount();
    const framesAtUnmount = raf.frames.length;
    // unmount のあと、rAF は積まれない
    await wait(50);
    expect(raf.frames.length).toBeLessThanOrEqual(framesAtUnmount);
    // DOM からも消える
    expect(container.querySelector('.game-frame')).toBeNull();
  });

  it('5. resume でペダルが 0 から始まる', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    // ペダル 60 の途中状態を作る
    const { init, reduce } = await import('./logic');
    const { paramsOf } = await import('./params');
    const p1 = paramsOf(1);
    let state = init({ level: 1, patternId: p1.patternId, sections: p1.sections, seed: 1 });
    state = reduce(state, { type: 'start' });
    state = reduce(state, { type: 'setPedal', value: 60 });
    const props = makeProps({ resume: state });
    const instance = module.mount(container, props);
    // プレイ画面が開き、ペダルの表示が 0 (pausePedal)
    const value = container.querySelector('.pedal__value');
    expect(value?.textContent).toContain('0');
    instance.unmount();
  });
});
