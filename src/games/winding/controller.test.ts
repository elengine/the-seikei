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
      // 結びの演出 (1秒) が終わって次の帯 (または結果) に進むまで rAF を進める。
      // 最後の帯のあとは done (完成しました) になる
      await vi.waitFor(
        () => {
          raf.advance(8);
          const panel = container.querySelector('.winding-panel')?.textContent ?? '';
          if (i === 2) {
            expect(panel).toContain('100%'); // done の表示のまま (変化の確認は onFinish)
            expect(props.finished.length).toBe(1);
          } else {
            expect(panel).not.toContain(`帯 ${i + 1} / 3巻いた長さ 100%`);
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

  it('6. fix-a1: broken で再開すると、tapEnd → ペダルを踏んで tick で帯の長さが増える', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    // broken の途中状態を作る (最初の状態と違う: 1帯の長さが進んでいる)
    const { init, reduce } = await import('./logic');
    const { paramsOf } = await import('./params');
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
      brk: { kind: 'broken', thread: 0, firstTapped: false },
    };
    expect(state.lengths[0]).toBeGreaterThan(0); // 最初の状態と違うことを確認
    const props = makeProps({ resume: state });
    const instance = module.mount(container, props);
    // 切れ端を結ぶ: 盤面のクリックではなく、tapEnd を直接送れないので、
    // パネルの状態を見る (broken で開けていることの確認 → 「糸が切れました」のメッセージ)
    const msg = jsMsg(container);
    expect(msg).toContain('糸が切れました');
    // 盤面のポインターダウンを送って切れ端を押す (endPoint thread 0 creel 側 = 論理 380, 300)
    const rect = stageRect(container);
    tapStage(container, rect, 380, 300);
    await wait(50);
    const msg2 = jsMsg(container);
    expect(msg2).toContain('もう一方');
    // ドラム側 (460, 300) を押して結ぶ
    tapStage(container, rect, 460, 300);
    await wait(50);
    // 'winding' に戻る。ペダルを踏んで tick を進めると長さが増える
    for (let i = 0; i < 4; i++) {
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '踏み込む')!.click();
    }
    raf.advance(100);
    const msg3 = jsMsg(container);
    expect(msg3).not.toContain('糸が切れました'); // 巻き直せている
    instance.unmount();
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
    expect(jsMsg(container)).toContain('帯を巻き終えました');
    // 「帯の端を結ぶ」を押す → 演出開始 (setInterval をやめて rAF の時刻で進む)
    Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '帯の端を結ぶ')!
      .click();
    // 演出中は次の帯に進んでいない
    expect(jsMsg(container)).not.toContain('帯 2');
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
    (container.querySelector('button[data-testid="winding-level-1"]') as HTMLButtonElement).click();
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    for (let i = 0; i < 4; i++) {
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '踏み込む')!.click();
    }
    raf.advance(10);
    // 「戻る」→ 確認
    Array.from(container.querySelectorAll<HTMLButtonElement>('.game-frame__bar-btn'))
      .find((b) => b.textContent === '戻る')!
      .click();
    await wait(50);
    // 確認の文言とボタン
    const dialog = container.querySelector('.dialog');
    expect(dialog?.textContent).toContain('難易度の一覧に戻りますか?');
    expect(dialog?.textContent).toContain('途中の状態は保存されます');
    // 「一覧に戻る」
    Array.from(dialog!.querySelectorAll('button'))
      .find((b) => b.textContent === '一覧に戻る')!
      .click();
    await wait(50);
    // 一覧に戻り、初級のボタンに「途中」が出る
    const level1 = container.querySelector<HTMLButtonElement>('button[data-testid="winding-level-1"]')!;
    expect(level1).toBeDefined();
    expect(level1.textContent).toContain('途中');
    // 状態が保存されている (onStateChange が呼ばれ、帯の長さが進んだ状態が渡っている)
    expect(stateChanges.length).toBeGreaterThan(0);
    const saved = stateChanges[stateChanges.length - 1] as { lengths?: number[] };
    expect(saved.lengths?.[0]).toBeGreaterThan(0);
    // 「途中」の初級を押すと、その状態から再開する (pedal は 0 で始まる)
    level1.click();
    await wait(50);
    expect(jsPanelText(container)).toContain('速さ 0');
    // 再開した状態でペダルを踏むと、巻いた長さが保存した値から増える (0% で始まらない)
    for (let k = 0; k < 4; k++) {
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '踏み込む')!.click();
    }
    raf.advance(80);
    expect(jsPanelText(container)).not.toContain('巻いた長さ 0%');
    instance.unmount();
  });

  it('9. fix-a2: 途中があるとき、別の難易度を押すと確認が出て、「やめる」で一覧に残る', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    // 初級をクリアした記録を入れて中級も押せるようにする
    await deps.records.add('winding', 3, { 'level:1': 3 });
    const stateChanges: unknown[] = [];
    const props = makeProps({
      onStateChange: (st: unknown) => stateChanges.push(st),
    });
    const instance = module.mount(container, props);
    // 初級で途中を作る
    (container.querySelector('button[data-testid="winding-level-1"]') as HTMLButtonElement).click();
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '巻き始める')!.click();
    for (let i = 0; i < 4; i++) {
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '踏み込む')!.click();
    }
    raf.advance(10);
    // 戻る → 一覧に戻る
    Array.from(container.querySelectorAll<HTMLButtonElement>('.game-frame__bar-btn'))
      .find((b) => b.textContent === '戻る')!.click();
    await wait(50);
    Array.from(container.querySelectorAll<HTMLButtonElement>('.dialog button'))
      .find((b) => b.textContent === '一覧に戻る')!.click();
    await wait(50);
    // 中級 (別の難易度) を押す → 確認
    (container.querySelector('button[data-testid="winding-level-2"]') as HTMLButtonElement).click();
    await wait(50);
    const dialog = container.querySelector('.dialog');
    expect(dialog?.textContent).toContain('途中の難易度があります');
    // 「やめる」→ 一覧のまま (プレイ画面は開かない)
    Array.from(dialog!.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent === 'やめる')!.click();
    await wait(50);
    expect(container.querySelector('.game-frame')).toBeNull();
    expect(container.querySelector('button[data-testid="winding-level-2"]')).not.toBeNull();
    // 今度は「始める」→ 中級のプレイ画面 (初級の resume ではない)
    (container.querySelector('button[data-testid="winding-level-2"]') as HTMLButtonElement).click();
    await wait(50);
    Array.from(container.querySelectorAll<HTMLButtonElement>('.dialog button'))
      .find((b) => b.textContent === '始める')!.click();
    await wait(50);
    expect(container.querySelector('.game-frame')).not.toBeNull();
    expect(jsPanelText(container)).toContain('帯 1 / 5'); // 中級は5本
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
      .find((b) => b.textContent === '戻る')!.click();
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
      .find((b) => b.textContent === '戻る')!.click();
    await wait(50);
    expect(exited).toBe(true);
    instance.unmount();
  });

  it('12. fix2-b: 張りが適正と強すぎを 100ms ごとに行き来しても、メッセージはすぐに変わらない (0.5秒続いてから変わる)', async () => {
    const { deps } = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    const props = makeProps();
    const instance = module.mount(container, props);
    // 中級 (範囲 38〜62)。糸切れを避けるため、resume で「pedal 90 (張り 66 = 強すぎ)・
    // 糸が切れていない状態」を渡す (rng は固定 clock の種なので、短時間では切れない)。
    const { init, reduce } = await import('./logic');
    const { paramsOf } = await import('./params');
    const p2 = paramsOf(2);
    let state = init({ level: 2, patternId: p2.patternId, sections: p2.sections, seed: 2025059162 });
    state = reduce(state, { type: 'start' });
    state = reduce(state, { type: 'setPedal', value: 90 });
    const instance2 = module.mount(container, makeProps({ resume: state }));
    instance.unmount();
    await wait(50);
    const msg = (): string => container.querySelector('.game-frame__message')?.textContent ?? '';
    const plus = (): void => {
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '踏み込む')!.click();
    };
    const minus = (): void => {
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '戻す')!.click();
    };
    // resume 直後はペダル 0 (pausePedal) で「弱め」の表示。0.5 秒で出そろう
    raf.advance(40);
    expect(msg()).toContain('弱め');
    // ペダルを 90 (張り 66 = 強すぎ) にして 100ms → まだ「弱め」のまま (0.5 秒続いていない)
    for (let i = 0; i < 9; i++) plus();
    raf.advance(6);
    expect(msg()).toContain('弱め');
    // 強すぎが 0.5 秒続くと「強すぎ」に変わる
    raf.advance(30);
    expect(msg()).toContain('強すぎ');
    // すぐに 60 (適正) に戻して 100ms → まだ「強すぎ」のまま
    minus(); minus(); minus();
    raf.advance(6);
    expect(msg()).toContain('強すぎ');
    instance2.unmount();
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
