import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWindingModule } from './index';
import type { GameDeps, GameProps } from '../../core/game/types';
import { createAppContext } from '../../app/context';
import type { AppContext } from '../../app/context';
import { createFixedClock } from '../../core/clock/clock';
import { getContent } from '../../core/content/content';

const drawBoardCalls: unknown[][] = [];
vi.mock('./renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./renderer')>();
  return { ...actual, drawBoard: (...args: unknown[]) => { drawBoardCalls.push(args); } };
});

/** drawBoard に渡された opts (最後の呼び出し) */
function lastDrawOpts(): { drumAngle?: number } | undefined {
  const last = drawBoardCalls[drawBoardCalls.length - 1];
  if (last === undefined) return undefined;
  return last[4] as { drumAngle?: number } | undefined;
}


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

/** jsdom に無い setPointerCapture を足す (ペダルの溝を指で動かす操作のため) */
if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture(): void {};
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {};
}

/** ペダルの溝を指で動かして、いまの値から delta だけ変える (PU-14a。「踏み込む」「戻す」のボタンは無くなった)。溝は幅 364px (横木 64px を除いた 300px が動く範囲) に見せる */
function stepPedal(container: HTMLElement, delta: number): void {
  const groove = container.querySelector<HTMLElement>('.pedal__groove')!;
  const bar = container.querySelector<HTMLElement>('.pedal__bar')!;
  Object.defineProperty(groove, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 364, height: 64, right: 364, bottom: 64, x: 0, y: 0 }),
  });
  Object.defineProperty(bar, 'clientWidth', { configurable: true, value: 64 }); // 横木の幅
  const cur = parseFloat(bar.style.left || '0');
  const v = Math.max(0, Math.min(100, cur + delta));
  groove.dispatchEvent(new PointerEvent('pointerdown', { clientX: 32 + v * 3, clientY: 32, pointerId: 1, bubbles: true }));
}

/** ペダルの横木の位置 (0〜100) */
function pedalValue(container: HTMLElement): number {
  return parseFloat(container.querySelector<HTMLElement>('.pedal__bar')!.style.left || '0');
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
      Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-testid^="winding-puzzle-s"]'));
    // 記録が無い → 15行あり、最初のお題だけ押せる
    const b0 = btns();
    expect(b0).toHaveLength(15);
    expect(b0[0]!.disabled).toBe(false);
    expect(b0[1]!.classList.contains('list-row--locked')).toBe(true); // 未解放は disabled でなく、鍵の行 (押すと理由)
    expect(b0[2]!.classList.contains('list-row--locked')).toBe(true);
    expect(b0[1]!.dataset.reason).toBe('前のお題をクリアすると遊べます');
    // 初級をクリアした記録を入れる
    await deps.records.add('winding', 3, { 'puzzle:s1': 3 });
    container.textContent = '';
    module.mount(container, makeProps());
    const b1 = btns();
    expect(b1[0]!.disabled).toBe(false);
    expect(b1[1]!.disabled).toBe(false);
    expect(b1[2]!.classList.contains('list-row--locked')).toBe(true);
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
    const level1 = container.querySelector<HTMLButtonElement>('button[data-testid="winding-puzzle-s1"]')!;
    level1.click();
    // 「巻き始める」
    const start = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める');
    expect(start).toBeDefined();
    start!.click();
    // ペダル 40 (溝を 10 ずつ 4 回動かす)
    for (let i = 0; i < 4; i++) {
      stepPedal(container, 10);
    }
    // 帯1本: pedal 40 の速さ (16/秒) で 400 論理長 → 25秒。rAF 16ms ずつ → 約1563フレーム
    raf.advance(2000);
    // 「帯の端を結ぶ」が押せる (cutting)
    const cut = (): HTMLButtonElement | undefined =>
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '帯の端を結ぶ');
    expect(cut()).toBeDefined();
    // 3回 (演出の1秒ずつ)。ボタンが見えている (display が空) ときだけ押す。
    // cut のあとはペダルが 0 に戻るので、次の帯の前に溝をもう4回動かす
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        for (let k = 0; k < 4; k++) {
          stepPedal(container, 10);
        }
      }
      await vi.waitFor(
        () => {
          raf.advance(300); // まとめて進める (帯1本ぶん 約1563フレームを短い実時間で終わらせる。T2-15)
          const b = cut();
          expect(b).toBeDefined();
          expect(b!.style.display).not.toBe('none');
        },
        { timeout: 30000, interval: 100 },
      );
      cut()!.click();
      // 結びの演出 (1秒) が終わって次の帯 (または結果) に進むまで rAF を進める。
      // 最後の帯のあとは done (完成しました) になる
      await vi.waitFor(
        () => {
          raf.advance(100); // 結びの演出は1秒 = 約62フレーム。1回で進める (T2-15)
          const panel = container.querySelector('.winding-panel')?.textContent ?? '';
          if (i === 2) {
            expect(panel).toContain('100%'); // done の表示のまま (変化の確認は onFinish)
            expect(props.finished.length).toBe(1);
          } else {
            expect(panel).not.toContain(`帯 ${i + 1} / 3巻き量 100%`);
          }
        },
        { timeout: 30000, interval: 100 },
      );
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
    const level1 = container.querySelector<HTMLButtonElement>('button[data-testid="winding-puzzle-s1"]')!;
    level1.click();
    Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '巻き始める')!
      .click();
    // ペダルを踏む
    stepPedal(container, 10);
    raf.advance(10);
    const framesBefore = raf.frames.length;
    // 裏に回る
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    // rAF が止まる (新しいフレームが積まれない)
    const framesAfter = raf.frames.length;
    expect(framesAfter).toBeLessThanOrEqual(framesBefore);
    // ペダルの横木が 0
    expect(pedalValue(container)).toBe(0);
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
    const level1 = container.querySelector<HTMLButtonElement>('button[data-testid="winding-puzzle-s1"]')!;
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
    // プレイ画面が開き、ペダルの横木が 0 (pausePedal)
    expect(pedalValue(container)).toBe(0);
    instance.unmount();
  });

  it('5b. 手応えつきのお題で再開すると、題名の下に手応えが出る (T2-14b)', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    const { init, reduce } = await import('./logic');
    let state = init({ level: 2, patternId: 'p-shadow-char', sections: 6, seed: 1, puzzleId: 's4-2', feel: 'fine' });
    state = reduce(state, { type: 'start' });
    const props = makeProps({ resume: state });
    const instance = module.mount(container, props);
    const sub = container.querySelector('.screen-header__subtitle')!.textContent!;
    expect(sub).toContain('レベル4');
    expect(sub).toContain('細い糸(切れやすい)');
    instance.unmount();
  });

  it('6. fix-a1: broken で再開すると、切れたあたりを1回押すとつながり、ペダルを踏んで tick で帯の長さが増える (T2-13c)', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    // broken の途中状態を作る (最初の状態と違う: 1帯の長さが進んでいる)
    const { init, reduce } = await import('./logic');
    const { paramsOf } = await import('./params');
    const { threadY } = await import('./geometry');
    const p1 = paramsOf(1);
    let state = init({ level: 1, patternId: p1.patternId, sections: p1.sections, seed: 1 });
    state = reduce(state, { type: 'start' });
    state = reduce(state, { type: 'tick', dtMs: 1000 }); // 帯1を少し巻く
    state = reduce(state, { type: 'setPedal', value: 40 });
    state = reduce(state, { type: 'tick', dtMs: 5000 });
    state = {
      ...state,
      phase: 'broken',
      breaks: state.breaks + 1,
      brk: { kind: 'broken', threads: [0], tied: [] },
    };
    expect(state.lengths[0]).toBeGreaterThan(0); // 最初の状態と違うことを確認
    // jsdom では stage の clientWidth が 0 で fitStage の scale が 0 になるため、
    // 盤面のサイズ (1000×750) を返すように差し替える (scale 1 になる)
    const descW = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
    const descH = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
    Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get(): number { return 1000; } });
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get(): number { return 750; } });
    try {
      const props = makeProps({ resume: state });
      const instance = module.mount(container, props);
      // メッセージ欄は無い (PU-14a)。切れたことは状態で確かめる
      expect((instance.suspend() as { phase: string }).phase).toBe('broken');
      // 切れた糸 (thread 0) のあたりを1回押す (span の中 x=380、糸 0 の y=threadY(0,8)=300)
      const rect = stageRect(container);
      tapStage(container, rect, 380, threadY(0, 8));
      await wait(50);
      // 'winding' に戻る (1回押しでつながる。T2-13c)。
      // メッセージは張りの文をしばらく表示してから切り替えるので、状態のほうで確かめる
      const resumed = instance.suspend() as { phase: string };
      expect(resumed.phase).toBe('winding');
      // ペダルを踏んで tick を進めると長さが増える
      for (let i = 0; i < 4; i++) {
        stepPedal(container, 10);
      }
      raf.advance(100);
      expect(jsPanelText(container)).not.toContain('巻き量 0%'); // 巻き直せている
      instance.unmount();
    } finally {
      if (descW !== undefined) Object.defineProperty(Element.prototype, 'clientWidth', descW);
      if (descH !== undefined) Object.defineProperty(Element.prototype, 'clientHeight', descH);
    }
  });

  it('7. fix-a3: 偽の rAF で 1000ms 進めると結びの演出が終わり、次の帯に進む (cut が送られる)', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    // cutting の状態を作る (帯1が巻き終わった状態)
    const { init, reduce } = await import('./logic');
    const { paramsOf } = await import('./params');
    const p1 = paramsOf(1);
    let state = init({ level: 1, patternId: p1.patternId, sections: p1.sections, seed: 1 });
    state = reduce(state, { type: 'start' });
    state = { ...state, phase: 'cutting', current: 0 };
    const props = makeProps({ resume: state });
    const instance = module.mount(container, props);
    expect((instance.suspend() as { phase: string }).phase).toBe('cutting');
    // 「帯の端を結ぶ」を押す → 演出開始 (setInterval をやめて rAF の時刻で進む)
    Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '帯の端を結ぶ')!
      .click();
    // 演出中は次の帯に進んでいない
    expect(jsPanelText(container)).not.toContain('帯 2');
    // rAF で 1000ms 以上進める (16ms × 70 = 1120ms)
    raf.advance(70);
    await wait(50);
    // cut が送られ、次の帯 (帯 2 / 3) に進む
    const label = jsPanelText(container);
    expect(label).toContain('帯 2 / 3');
    // unmount のあとに進めても何も起きない (エラーが出ない)
    instance.unmount();
    raf.advance(10);
  });

  it('8. fix-a2: プレイ画面の「戻る」で確認が出て、「一覧に戻る」で難易度の一覧に戻る (途中は保存)', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    const stateChanges: unknown[] = [];
    const props = makeProps({
      onStateChange: (st: unknown) => stateChanges.push(st),
    });
    const instance = module.mount(container, props);
    // 初級 → 巻き始める → 少し巻く
    (container.querySelector('button[data-testid="winding-puzzle-s1"]') as HTMLButtonElement).click();
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    for (let i = 0; i < 4; i++) {
      stepPedal(container, 10);
    }
    raf.advance(10);
    // 「戻る」→ 確認
    Array.from(container.querySelectorAll<HTMLButtonElement>('.game-frame__bar-btn'))
      .find((b) => b.getAttribute('aria-label') === '戻る')!
      .click();
    await wait(50);
    // 確認の文言とボタン
    const dialog = container.querySelector('.dialog');
    expect(dialog?.textContent).toContain('難易度の一覧に戻りますか?');
    expect(dialog?.textContent).toContain('途中の状態は保存されます');
    // 「一覧に戻る」
    Array.from(dialog!.querySelectorAll('button'))
      .find((b) => b.textContent === 'はい')!
      .click();
    await wait(50);
    // 一覧に戻り、初級のボタンに「途中」が出る
    const level1 = container.querySelector<HTMLButtonElement>('button[data-testid="winding-puzzle-s1"]')!;
    expect(level1).toBeDefined();
    expect(level1.textContent).toContain('途中');
    // 状態が保存されている (onStateChange が呼ばれ、帯の長さが進んだ状態が渡っている)
    expect(stateChanges.length).toBeGreaterThan(0);
    const saved = stateChanges[stateChanges.length - 1] as { lengths?: number[] };
    expect(saved.lengths?.[0]).toBeGreaterThan(0);
    // 「途中」の初級を押すと、その状態から再開する (pedal は 0 で始まる)
    level1.click();
    await wait(50);
    expect(pedalValue(container)).toBe(0);
    // 再開した状態でペダルを踏むと、巻き量が保存した値から増える (0% で始まらない)
    for (let k = 0; k < 4; k++) {
      stepPedal(container, 10);
    }
    raf.advance(80);
    expect(jsPanelText(container)).not.toContain('巻き量 0%');
    instance.unmount();
  });

  it('9. fix-a2: 途中があるとき、別の難易度を押すと確認が出て、「やめる」で一覧に残る', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    // 初級をクリアした記録を入れて中級も押せるようにする
    await deps.records.add('winding', 3, { 'puzzle:s1': 3 });
    const stateChanges: unknown[] = [];
    const props = makeProps({
      onStateChange: (st: unknown) => stateChanges.push(st),
    });
    const instance = module.mount(container, props);
    // 初級で途中を作る
    (container.querySelector('button[data-testid="winding-puzzle-s1"]') as HTMLButtonElement).click();
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    for (let i = 0; i < 4; i++) {
      stepPedal(container, 10);
    }
    raf.advance(10);
    // 戻る → 一覧に戻る
    Array.from(container.querySelectorAll<HTMLButtonElement>('.game-frame__bar-btn'))
      .find((b) => b.getAttribute('aria-label') === '戻る')!.click();
    await wait(50);
    Array.from(container.querySelectorAll<HTMLButtonElement>('.dialog button'))
      .find((b) => b.textContent === 'はい')!.click();
    await wait(50);
    // 次のお題 (別のお題) を押す → 確認
    (container.querySelector('button[data-testid="winding-puzzle-s1-2"]') as HTMLButtonElement).click();
    await wait(50);
    const dialog = container.querySelector('.dialog');
    expect(dialog?.textContent).toContain('途中のお題があります');
    // 「やめる」→ 一覧のまま (プレイ画面は開かない)
    Array.from(dialog!.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent === 'やめる')!.click();
    await wait(50);
    expect(container.querySelector('.game-frame')).toBeNull();
    expect(container.querySelector('button[data-testid="winding-puzzle-s1-2"]')).not.toBeNull();
    // 今度は「始める」→ 次のお題のプレイ画面 (途中の resume ではない)
    (container.querySelector('button[data-testid="winding-puzzle-s1-2"]') as HTMLButtonElement).click();
    await wait(50);
    Array.from(container.querySelectorAll<HTMLButtonElement>('.dialog button'))
      .find((b) => b.textContent === '始める')!.click();
    await wait(50);
    expect(container.querySelector('.game-frame')).not.toBeNull();
    // s1-2 (段階1・黒の無地) のプレイ画面
    expect(container.querySelector('.screen-header__subtitle')!.textContent).toContain(
      getContent().patterns.get('p-muji-kuro')!.name,
    );
    instance.unmount();
  });

  it('10. fix-a2: 一覧の「戻る」でホームに戻る (props.onExit)', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    let exited = false;
    const props = makeProps({ onExit: () => (exited = true) });
    const instance = module.mount(container, props);
    Array.from(container.querySelectorAll('button'))
      .find((b) => b.getAttribute('aria-label') === '戻る')!.click();
    await wait(50);
    expect(exited).toBe(true);
    instance.unmount();
  });

  it('11. fix-a2: 仕事モードの「戻る」は props.onExit のまま', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    let exited = false;
    const props = makeProps({
      mode: 'job',
      job: { orderId: 'o1', patternId: 'p-pin-kon', ends: 8, lengthM: 100, sections: 3, difficulty: 1 },
      onExit: () => (exited = true),
    });
    const instance = module.mount(container, props);
    await wait(50);
    Array.from(container.querySelectorAll<HTMLButtonElement>('.game-frame__bar-btn'))
      .find((b) => b.getAttribute('aria-label') === '戻る')!.click();
    await wait(50);
    expect(exited).toBe(true);
    instance.unmount();
  });

});

/** 操作欄 (メッセージを含む) の文字 */
function jsMsg(container: HTMLElement): string {
  return (
    (container.querySelector('.game-frame__message')?.textContent ?? '') +
    (container.querySelector('.winding-panel')?.textContent ?? '')
  );
}

/** 操作欄の文字 (jsMsg の別名) */
function jsPanelText(container: HTMLElement): string {
  return jsMsg(container);
}

/** 盤面の rect を取る */
function stageRect(container: HTMLElement): { left: number; top: number; width: number; height: number } {
  const c = container.querySelector('canvas')!;
  return c.getBoundingClientRect();
}

/** 盤面の論理座標の点をポインターダウンする */
function tapStage(
  container: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
  lx: number,
  ly: number,
): void {
  const c = container.querySelector('canvas')!;
  // fitStage の実装と同じ: scale = min(w/1000, h/750)、offset は中央。
  // jsdom では rect がすべて 0 なので、scale 1・offset 0 (論理座標 = 画面座標) として送る
  const scale = rect.width > 0 ? Math.min(rect.width / 1000, rect.height / 750) : 1;
  const offsetX = rect.width > 0 ? (rect.width - 1000 * scale) / 2 : 0;
  const offsetY = rect.height > 0 ? (rect.height - 750 * scale) / 2 : 0;
  const x = rect.left + offsetX + lx * scale;
  const y = rect.top + offsetY + ly * scale;
  c.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
}

describe('winding module T2-09 追加修正a (+4・止まる音。引っかかりのメッセージは PU-14a でメッセージ欄と一緒に無くした)', () => {
  let raf: ReturnType<typeof installFakeRaf>;
  let plays: string[];

  beforeEach(() => {
    document.body.textContent = '';
    raf = installFakeRaf();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function setup() {
    const { deps, ctx } = await makeDeps();
    plays = [];
    const orig = ctx.audio.play.bind(ctx.audio);
    ctx.audio.play = (n: string) => {
      plays.push(n);
      return orig(n as never);
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    const props = makeProps();
    module.mount(container, props);
    const msg = () => (container.querySelector('.game-frame__message')?.textContent ?? '');
    const btn = (label: string) => {
      const b = Array.from(container.querySelectorAll('button')).find((x) => x.textContent?.trim() === label);
      if (b) b.click();
      return b !== undefined;
    };
    return { container, msg, btn, deps };
  }

  it('3. 糸が切れたとき、止まる音は1回だけ (2秒進めても1回)', async () => {
    const { btn, deps, container } = await setup();
    const plays2: string[] = [];
    const orig = deps.audio.play.bind(deps.audio);
    deps.audio.play = (n: Parameters<typeof deps.audio.play>[0]) => { plays2.push(n); return orig(n); };
    btn('紺の無地帯 3本次はこれ'); // 一覧の行の文字 (名前・補足・状態)
    raf.advance(2);
    btn('巻き始める');
    raf.advance(2);
    // pedal 100 で切れるまで進める (切れない場合は中止)
    let broke = false;
    for (let i = 0; i < 600 && !broke; i++) {
      stepPedal(container, 10);
      raf.advance(2);
      broke = plays2.includes('stop');
    }
    expect(broke).toBe(true);
    const count = plays2.filter((n) => n === 'stop').length;
    for (let i = 0; i < 120; i++) raf.advance(2);
    expect(plays2.filter((n) => n === 'stop').length).toBe(count);
    expect(count).toBe(1);
  });
});

describe('winding module T2-10 追加修正 a (ドラムの回る速さ・drumAngle)', () => {
  let raf: ReturnType<typeof installFakeRaf>;

  beforeEach(() => {
    document.body.textContent = '';
    raf = installFakeRaf();
    drawBoardCalls.length = 0;
    // jsdom の canvas は getContext が null を返す。drawBoard が呼ばれるように偽の ctx を返す
    // (drawBoard は mock なので、中身は実行されない)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      canvas: document.createElement('canvas'),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function setup(): Promise<HTMLElement> {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    module.mount(container, makeProps());
    return container;
  }

  const btn = (container: HTMLElement, label: string): HTMLButtonElement | undefined =>
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);

  it('1. ペダル 50 で 1 秒進めると、drumAngle が 4.5〜5.5 増える (DRUM_TURN_PER_SPEED 0.25)', async () => {
    const container = await setup();
    container.querySelector<HTMLButtonElement>('button[data-testid="winding-puzzle-s1"]')!.click();
    await vi.waitFor(() => expect(btn(container, '巻き始める')).toBeDefined());
    btn(container, '巻き始める')!.click();
    // ペダル 50 (溝を 10 ずつ 5 回動かす)
    for (let i = 0; i < 5; i++) {
      stepPedal(container, 10);
    }
    await vi.waitFor(() => expect(lastDrawOpts()?.drumAngle).toBeDefined());
    raf.advance(1);
    raf.advance(60); // まず定常まで回す (イージングの立ち上がりを含めない。T2-10 追加修正 b)
    const before = lastDrawOpts()!.drumAngle!;
    // 1 秒 (62フレーム × 16ms)
    raf.advance(62);
    const after = lastDrawOpts()!.drumAngle!;
    expect(after - before).toBeGreaterThanOrEqual(4.5);
    expect(after - before).toBeLessThanOrEqual(5.5);
  });

  it('2. 糸が切れたあと・ペダル 0 のあいだは drumAngle が増えない', async () => {
    const container = await setup();
    container.querySelector<HTMLButtonElement>('button[data-testid="winding-puzzle-s1"]')!.click();
    await vi.waitFor(() => expect(btn(container, '巻き始める')).toBeDefined());
    btn(container, '巻き始める')!.click();
    // ペダルを踏まず (speed 0) のまま進める
    await vi.waitFor(() => expect(lastDrawOpts()?.drumAngle).toBeDefined());
    const before = lastDrawOpts()!.drumAngle!;
    raf.advance(30);
    const after = lastDrawOpts()!.drumAngle!;
    expect(after).toBe(before);
  });
});

describe('winding module T2-10 追加修正 b (なめらかな回り方・結ぶときの回転)', () => {
  let raf: ReturnType<typeof installFakeRaf>;

  beforeEach(() => {
    document.body.textContent = '';
    raf = installFakeRaf();
    drawBoardCalls.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      canvas: document.createElement('canvas'),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function setup(): Promise<HTMLElement> {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    module.mount(container, makeProps());
    return container;
  }

  const btn = (container: HTMLElement, label: string): HTMLButtonElement | undefined =>
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);

  async function startWinding(): Promise<HTMLElement> {
    const container = await setup();
    container.querySelector<HTMLButtonElement>('button[data-testid="winding-puzzle-s1"]')!.click();
    await vi.waitFor(() => expect(btn(container, '巻き始める')).toBeDefined());
    btn(container, '巻き始める')!.click();
    return container;
  }

  it('7. ペダル 100 直後の1フレームは角速度が目標の半分より小さい。0.6 秒で目標の 9 割以上', async () => {
    const container = await startWinding();
    for (let i = 0; i < 10; i++) {
      stepPedal(container, 10);
    }
    await vi.waitFor(() => expect(lastDrawOpts()?.drumAngle).toBeDefined());
    raf.advance(1); // lastFrameMs を埋める (dtMs 0 のフレーム)
    const a0 = lastDrawOpts()!.drumAngle!;
    raf.advance(1); // 1フレーム (16ms)
    const a1 = lastDrawOpts()!.drumAngle!;
    // 目標: speed 40 × 0.25 = 10 rad/s → 1フレームで 0.16 rad。半分より小さいこと
    expect(a1 - a0).toBeLessThan(0.16 / 2);
    // 0.6 秒後、角速度が目標の 9 割以上 (直近 4 フレーム = 0.064 秒の差分から測る)
    raf.advance(35);
    const a2 = lastDrawOpts()!.drumAngle!;
    raf.advance(4);
    const a3 = lastDrawOpts()!.drumAngle!;
    const omega = (a3 - a2) / 0.064;
    expect(omega).toBeGreaterThanOrEqual(10 * 0.9);
  });

  it('7b. ペダルを 0 に戻すと 0.4 秒ほどで止まる (DRUM_EASE_MS 遅いとき 400)', async () => {
    const container = await startWinding();
    for (let i = 0; i < 10; i++) {
      stepPedal(container, 10);
    }
    await vi.waitFor(() => expect(lastDrawOpts()?.drumAngle).toBeDefined());
    raf.advance(1);
    raf.advance(40); // 十分回す
    // ペダル 0 (溝を 10 ずつ 10 回戻す)
    for (let i = 0; i < 10; i++) {
      stepPedal(container, -10);
    }
    const a0 = lastDrawOpts()!.drumAngle!;
    raf.advance(40); // 0.64 秒
    const a1 = lastDrawOpts()!.drumAngle!;
    // 0.64 秒でほぼ止まっている (0.4 秒の緩みで残りは僅か)。目標 0 のときの累積は 0.64 秒で 10×0.4/2 程度以下
    expect(a1 - a0).toBeLessThan(10 * 0.4 / 2 + 0.01);
  });
});

describe('winding module T2-11a (範囲が動くとメーターの帯も動く)', () => {
  let raf: ReturnType<typeof installFakeRaf>;

  beforeEach(() => {
    document.body.textContent = '';
    raf = installFakeRaf();
    drawBoardCalls.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function startWinding(): Promise<HTMLElement> {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    module.mount(container, makeProps());
    container.querySelector<HTMLButtonElement>('button[data-testid="winding-puzzle-s1"]')!.click();
    await vi.waitFor(() => {
      const b = Array.from(container.querySelectorAll('button')).find((x) => x.textContent === '巻き始める');
      expect(b).toBeDefined();
    });
    Array.from(container.querySelectorAll('button')).find((x) => x.textContent === '巻き始める')!.click();
    return container;
  }

  it('メーターの適正の帯 (zone) の位置が、巻いているあいだに変わる', async () => {
    const container = await startWinding();
    const zoneLeft = (): string => {
      const z = container.querySelector<HTMLElement>('.meter__zone');
      expect(z).toBeDefined();
      return z!.style.left;
    };
    const before = zoneLeft();
    // 10 秒進める (メーターの帯が動く)
    raf.advance(620);
    const after = zoneLeft();
    expect(after).not.toBe(before);
  });
});

describe('PU-05c: ドラム巻きの結果のつなぎ', () => {
  let raf: ReturnType<typeof installFakeRaf>;

  beforeEach(() => {
    document.body.textContent = '';
    raf = installFakeRaf();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** 初級を最後まで遊び、結果 (onFinish に渡ったもの) を返す */
  async function finishLevel1(container: HTMLElement, props: ReturnType<typeof makeProps>): Promise<{
    resultLines: { label: string; value: string }[];
    starHint: string;
    next?: { label: string; start: () => void };
    again?: () => void;
    toList?: () => void;
  }> {
    container.querySelector<HTMLButtonElement>('button[data-testid="winding-puzzle-s1"]')!.click();
    const btn = (label: string): HTMLButtonElement | undefined =>
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);
    btn('巻き始める')!.click();
    const pedalUp = (): void => {
      for (let k = 0; k < 4; k++) {
        stepPedal(container, 10);
      }
    };
    pedalUp();
    raf.advance(2000);
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        pedalUp();
      }
      await vi.waitFor(
        () => {
          raf.advance(24);
          const b = btn('帯の端を結ぶ');
          expect(b).toBeDefined();
          expect(b!.style.display).not.toBe('none');
        },
        { timeout: 30000, interval: 100 },
      );
      btn('帯の端を結ぶ')!.click();
      await vi.waitFor(
        () => {
          raf.advance(8);
          if (i === 2) {
            expect(props.finished.length).toBe(1);
          } else {
            expect(container.querySelector('.winding-panel')?.textContent ?? '').not.toContain(`帯 ${i + 1} / 3巻き量 100%`);
          }
        },
        { timeout: 30000, interval: 100 },
      );
    }
    await vi.waitFor(
      () => {
        raf.advance(24);
        expect(props.finished).toHaveLength(1);
      },
      { timeout: 30000, interval: 100 },
    );
    return props.finished[0] as never;
  }

  it('見出しの行の題名の下に今のお題「レベル1 …」が出る。終わると resultLines 4行・starHint・next「次のお題へ」・again・toList が渡る (T2-13c で4行に・T2-14a でお題)', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    const props = makeProps();
    const instance = module.mount(container, props);
    const result = await finishLevel1(container, props);
    expect(container.querySelector('.screen-header__subtitle')!.textContent).toContain('レベル1');
    expect(result.resultLines).toHaveLength(4);
    expect(result.resultLines?.some((l) => l.label.includes('違う端'))).toBe(false);
    expect(result.starHint).toBe('適正な張りが8割以上、目標の時間内で星3です');
    expect(result.next?.label).toBe('次へ');
    expect(typeof result.again).toBe('function');
    expect(typeof result.toList).toBe('function');
    instance.unmount();
  }, 60000);

  it('next.start() で中級のプレイ画面、again() で初級をやり直し、toList() で難易度の一覧になる', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    const props = makeProps();
    const instance = module.mount(container, props);
    const result = await finishLevel1(container, props);
    result.next!.start();
    // 次のお題は s1-2 (段階1・黒の無地)
    expect(container.querySelector('.screen-header__subtitle')!.textContent).toContain('レベル1');
    expect(container.querySelector('.screen-header__subtitle')!.textContent).toContain(getContent().patterns.get('p-muji-kuro')!.name);
    result.again!();
    // やり直しは s1 (段階1・紺の無地)
    expect(container.querySelector('.screen-header__subtitle')!.textContent).toContain(getContent().patterns.get('p-muji-kon')!.name);
    result.toList!();
    expect(container.querySelector('.game-frame')).toBeNull();
    expect(container.querySelector('button[data-testid="winding-puzzle-s1"]')).not.toBeNull();
    instance.unmount();
  }, 60000);
});

describe('PU-14a: メッセージ欄を無くし、一度きりの案内はお知らせで出す', () => {
  let raf: ReturnType<typeof installFakeRaf>;
  beforeEach(() => {
    document.body.textContent = '';
    raf = installFakeRaf();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('メッセージ欄 (.game-frame__message) が無い。最初に「巻き始める」の案内が盤面のお知らせに 1 回出る', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    module.mount(container, makeProps());
    await vi.waitFor(() => expect(container.querySelector('[data-testid="winding-puzzle-s1"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[data-testid="winding-puzzle-s1"]')!.click();
    expect(container.querySelector('.game-frame__message')).toBeNull();
    const notice = container.querySelector('.game-frame__notice')!;
    expect(notice.textContent).toContain('巻き始める');
    expect(container.querySelectorAll('.game-frame__notice')).toHaveLength(1);
    raf.advance(10);
  });

  it('巻いていないときにペダルの溝を押すと、理由がお知らせに出る', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    module.mount(container, makeProps());
    await vi.waitFor(() => expect(container.querySelector('[data-testid="winding-puzzle-s1"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[data-testid="winding-puzzle-s1"]')!.click();
    stepPedal(container, 10);
    expect(container.querySelector('.game-frame__notice')!.textContent).toContain('巻き始める');
  });
});
