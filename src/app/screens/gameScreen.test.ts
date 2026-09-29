import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createGameScreen } from './gameScreen';
import { registerGame, clearGamesForTest, getGame } from '../../core/game/registry';
import type { GameModule, GameInstance, GameProps, GameId } from '../../core/game/types';
import { createAppContext } from '../context';
import type { AppContext } from '../context';
import { createFixedClock } from '../../core/clock/clock';
import { showTutorial } from '../../core/ui/tutorialOverlay';

vi.mock('../../core/ui/tutorialOverlay', () => ({
  showTutorial: vi.fn(async () => undefined),
}));
vi.mock('../../core/ui/resultView', () => ({
  showResult: vi.fn(async () => 'home' as const),
}));

/** confirmDialog の戻り値をテストから変えるための器 */
const confirmAnswers: boolean[] = [];
vi.mock('../../core/ui/widgets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/ui/widgets')>();
  return {
    ...actual,
    confirmDialog: vi.fn(async () => confirmAnswers.shift() ?? false),
  };
});

/** 偽の GameModule: mount 時に受け取った props と instance を外から呼べる */
function makeFakeModule(id: GameId, suspendValue: unknown = null): { module: GameModule; captured: { props?: GameProps; instance?: GameInstance } } {
  const captured: { props?: GameProps; instance?: GameInstance } = {};
  const module: GameModule = {
    id,
    titleTermKey: 'game.creel',
    phase: 'P1',
    embeddable: true,
    tutorial: { pages: [{ draw: () => undefined, text: '遊び方' }] },
    mount(container: HTMLElement, props: GameProps): GameInstance {
      captured.props = props;
      const instance: GameInstance = {
        suspend: () => suspendValue,
        unmount: () => undefined,
      };
      captured.instance = instance;
      return instance;
    },
  };
  return { module, captured };
}

async function makeCtx(): Promise<AppContext> {
  return await createAppContext({
    dbName: 'test-game-screen',
    clock: createFixedClock('2026-09-28T00:00:00.000Z'),
    navigate: () => undefined,
  });
}

async function putSession(ctx: AppContext, id: GameId, state: unknown): Promise<void> {
  await ctx.repo.put('sessions', { state, savedAt: ctx.clock.now() }, id);
}

async function getSession(ctx: AppContext, id: GameId): Promise<{ state: unknown; savedAt: string } | undefined> {
  const rec = await ctx.repo.get<{ state: unknown; savedAt: string }>('sessions', id);
  return rec?.data;
}

beforeEach(async () => {
  vi.clearAllMocks();
  clearGamesForTest();
  confirmAnswers.length = 0;
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name !== undefined && db.name.startsWith('test-game-screen')) {
      indexedDB.deleteDatabase(db.name);
    }
  }
});

describe('gameScreen', () => {
  it('tutorialSeen が無ければチュートリアルが出て、終わると true で保存される', async () => {
    const ctx = await makeCtx();
    const { module } = makeFakeModule('creel');
    registerGame(module);
    const screen = createGameScreen(ctx);
    const container = document.createElement('div');
    screen.mount(container, { id: 'creel' });
    await vi.waitFor(() => {
      expect(showTutorial).toHaveBeenCalled();
    });
    // チュートリアル後に tutorialSeen が保存される
    await vi.waitFor(() => {
      expect(ctx.settings.get().tutorialSeen.creel).toBe(true);
    });
  });

  it('tutorialSeen が true ならチュートリアルは出ない', async () => {
    const ctx = await makeCtx();
    await ctx.settings.update({ tutorialSeen: { creel: true } });
    const { module } = makeFakeModule('creel');
    registerGame(module);
    const screen = createGameScreen(ctx);
    screen.mount(document.createElement('div'), { id: 'creel' });
    await vi.waitFor(() => {
      expect(getGame('creel')).toBeDefined();
    });
    // mount されるまで少し待つ
    await new Promise((r) => setTimeout(r, 20));
    expect(showTutorial).not.toHaveBeenCalled();
  });

  it('途中保存があるとき「つづきから」を選ぶと、mount に resume が渡る', async () => {
    const ctx = await makeCtx();
    await ctx.settings.update({ tutorialSeen: { creel: true } });
    const state = { stage: 2 };
    await putSession(ctx, 'creel', state);
    const { module, captured } = makeFakeModule('creel');
    registerGame(module);
    const screen = createGameScreen(ctx);
    confirmAnswers.push(true); // 「つづきから」
    screen.mount(document.createElement('div'), { id: 'creel' });
    await vi.waitFor(() => {
      expect(captured.props?.resume).toEqual(state);
    });
  });

  it('onFinish で、途中保存が消え、records と zukan に記録され、「ホームへ」で / へ移る', async () => {
    const ctx = await makeCtx();
    let navigated = '';
    ctx.navigate = (path: string) => {
      navigated = path;
    };
    await ctx.settings.update({ tutorialSeen: { creel: true } });
    await putSession(ctx, 'creel', { stage: 1 });
    const { module, captured } = makeFakeModule('creel');
    registerGame(module);
    const screen = createGameScreen(ctx);
    screen.mount(document.createElement('div'), { id: 'creel' });
    await vi.waitFor(() => {
      expect(captured.props?.onFinish).toBeDefined();
    });
    await captured.props!.onFinish({
      gameId: 'creel',
      mode: 'standalone',
      stars: 2,
      stats: { 'puzzle:s1': 2, lines: 10 },
      unlockedPatternIds: ['p-muji-kon', 'p-pin-kon'],
      finishedAt: ctx.clock.now(),
    });
    // 途中保存が消える
    await vi.waitFor(async () => {
      expect(await getSession(ctx, 'creel')).toBeUndefined();
    });
    // records に記録 ('puzzle:' で始まるキーだけ)
    await vi.waitFor(() => {
      expect(ctx.records.get('creel').plays).toBe(1);
    });
    const rec = ctx.records.get('creel');
    expect(rec.plays).toBe(1);
    expect(rec.bestStars).toBe(2);
    expect(rec.best).toEqual({ 'puzzle:s1': 2 });
    // zukan に記録
    await vi.waitFor(() => {
      expect(ctx.zukan.has('p-muji-kon')).toBe(true);
      expect(ctx.zukan.has('p-pin-kon')).toBe(true);
    });
    // showResult は 'home' を返す (mock) → / へ移る
    await vi.waitFor(() => {
      expect(navigated).toBe('/');
    });
  });

  it('onExit で suspend() が値を返すと確認が出て、「ホームにもどる」で途中保存される', async () => {
    const ctx = await makeCtx();
    let navigated = '';
    ctx.navigate = (path: string) => {
      navigated = path;
    };
    await ctx.settings.update({ tutorialSeen: { creel: true } });
    const state = { stage: 5 };
    const { module, captured } = makeFakeModule('creel', state);
    registerGame(module);
    const screen = createGameScreen(ctx);
    confirmAnswers.push(true); // 「ホームにもどる」
    screen.mount(document.createElement('div'), { id: 'creel' });
    await vi.waitFor(() => {
      expect(captured.props?.onExit).toBeDefined();
    });
    captured.props!.onExit();
    await vi.waitFor(async () => {
      const session = await getSession(ctx, 'creel');
      expect(session?.state).toEqual(state);
    });
    expect(navigated).toBe('/');
  });

  it('onStateChange を短い間に3回呼んでも、保存は最後の1回だけになる', async () => {
    const ctx = await makeCtx();
    await ctx.settings.update({ tutorialSeen: { creel: true } });
    const { module, captured } = makeFakeModule('creel');
    registerGame(module);
    const screen = createGameScreen(ctx);
    screen.mount(document.createElement('div'), { id: 'creel' });
    await vi.waitFor(() => {
      expect(captured.props?.onStateChange).toBeDefined();
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      captured.props!.onStateChange!({ n: 1 });
      captured.props!.onStateChange!({ n: 2 });
      captured.props!.onStateChange!({ n: 3 });
      // 1秒経たなければ保存されない
      await vi.advanceTimersByTimeAsync(500);
      expect(await getSession(ctx, 'creel')).toBeUndefined();
      // 1秒経つと最後の1回だけ保存される
      await vi.advanceTimersByTimeAsync(600);
      const session = await getSession(ctx, 'creel');
      expect(session?.state).toEqual({ n: 3 });
    } finally {
      vi.useRealTimers();
    }
  });
});
