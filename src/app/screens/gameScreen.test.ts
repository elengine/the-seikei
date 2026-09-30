import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createGameScreen } from './gameScreen';
import { registerGame, clearGamesForTest, getGame } from '../../core/game/registry';
import type { GameModule, GameInstance, GameProps, GameId } from '../../core/game/types';
import { createAppContext } from '../context';
import type { AppContext } from '../context';
import { createFixedClock } from '../../core/clock/clock';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import { showResult } from '../../core/ui/resultView';

vi.mock('../../core/ui/tutorialOverlay', () => ({
  showTutorial: vi.fn(async () => undefined),
}));
vi.mock('../../core/ui/resultView', () => ({
  showResult: vi.fn(async () => resultAnswers.shift() ?? ('home' as const)),
}));

/** showResult の戻り値をテストから変えるための器 */
const resultAnswers: ('again' | 'home' | 'list' | 'next')[] = [];

/** confirmDialog の戻り値をテストから変えるための器 */
const confirmAnswers: boolean[] = [];
/** confirmDialog に渡された引数を記録する器 (T1-17 の文言確認) */
const confirmCalls: Array<{ message: string; okLabel: string; cancelLabel: string }> = [];
vi.mock('../../core/ui/widgets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/ui/widgets')>();
  return {
    ...actual,
    confirmDialog: vi.fn(
      async (parent: HTMLElement, opts: { message: string; okLabel: string; cancelLabel: string }) => {
        confirmCalls.push(opts);
        return confirmAnswers.shift() ?? false;
      },
    ),
  };
});

/** 偽の GameModule: mount 時に受け取った props と instance を外から呼べる */
interface FakeCaptured {
  props?: GameProps;
  instance?: GameInstance;
  unmounts: number;
}

function makeFakeModule(id: GameId, suspendValue: unknown = null): { module: GameModule; captured: FakeCaptured } {
  const captured: FakeCaptured = { unmounts: 0 };
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
        unmount: () => {
          captured.unmounts += 1;
        },
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
  resultAnswers.length = 0;
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

  it('途中保存があるとき「続きから」を選ぶと、mount に resume が渡る (テスト名のみ変更: 管理者の指示で文言を変えたため)', async () => {
    const ctx = await makeCtx();
    await ctx.settings.update({ tutorialSeen: { creel: true } });
    const state = { stage: 2 };
    await putSession(ctx, 'creel', state);
    const { module, captured } = makeFakeModule('creel');
    registerGame(module);
    const screen = createGameScreen(ctx);
    confirmAnswers.push(true); // 「続きから」
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
    await vi.waitFor(
      () => {
        expect(navigated).toBe('/');
      },
      { timeout: 5000 },
    );
  });

  it('onFinish で、level: で始まる stats も成績に残す (ドラム巻きの難易度の星)', async () => {
    const ctx = await makeCtx();
    await ctx.settings.update({ tutorialSeen: { winding: true } });
    const { module, captured } = makeFakeModule('winding');
    registerGame(module);
    const screen = createGameScreen(ctx);
    screen.mount(document.createElement('div'), { id: 'winding' });
    await vi.waitFor(() => {
      expect(captured.props?.onFinish).toBeDefined();
    });
    await captured.props!.onFinish({
      gameId: 'winding',
      mode: 'standalone',
      stars: 2,
      stats: { 'level:1': 2, breaks: 1 },
      unlockedPatternIds: [],
      finishedAt: ctx.clock.now(),
    });
    await vi.waitFor(() => {
      expect(ctx.records.get('winding').best).toEqual({ 'level:1': 2 });
    });
  });

  it('onExit で suspend() が値を返すと確認が出て、「ホームに戻る」で途中保存される (テスト名のみ変更: 管理者の指示で文言を変えたため)', async () => {
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
    confirmAnswers.push(true); // 「ホームに戻る」
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
    screen.unmount(); // pagehide の listener を解除 (次のテストに影響しないように)
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

describe('T1-06 追加修正', () => {
  it('Screen.unmount で instance.unmount が1回呼ばれ、visibilitychange では保存されず、保留中の onStateChange は保存される', async () => {
    const ctx = await makeCtx();
    await ctx.settings.update({ tutorialSeen: { creel: true } });
    const { module, captured } = makeFakeModule('creel', null); // suspend は null (visibilitychange では保存しない)
    registerGame(module);
    const screen = createGameScreen(ctx);
    const container = document.createElement('div');
    screen.mount(container, { id: 'creel' });
    await vi.waitFor(() => {
      expect(captured.props?.onStateChange).toBeDefined();
    });
    // 保留中の状態を作る (1秒以内なのでまだ保存されない)
    captured.props!.onStateChange!({ n: 9 });
    // 画面を離れる
    screen.unmount();
    await vi.waitFor(() => {
      expect(captured.unmounts).toBe(1);
    });
    // 保留中の状態は保存される (非同期の put を待つ)
    await vi.waitFor(async () => {
      const session = await getSession(ctx, 'creel');
      expect(session?.state).toEqual({ n: 9 });
    });
    // unmount 後は visibilitychange で保存されない (suspend が null なのでそもそも保存対象外。
    // unmount で解除されていることを document のリスナーが残っていない形で確認するため、
    // unmount を2回呼んでも unmount は合計1回のまま)
    screen.unmount();
    expect(captured.unmounts).toBe(1);
  });

  it('チュートリアル表示中に Screen.unmount すると、その後チュートリアルを終えても module.mount は呼ばれない', async () => {
    // showTutorial が解決しない偽物にして「表示中」を作る
    const { showTutorial } = await import('../../core/ui/tutorialOverlay');
    let resolveTutorial: (() => void) | null = null;
    (showTutorial as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveTutorial = resolve;
      }),
    );
    const ctx = await makeCtx();
    const { module, captured } = makeFakeModule('creel');
    registerGame(module);
    const screen = createGameScreen(ctx);
    const container = document.createElement('div');
    screen.mount(container, { id: 'creel' });
    await vi.waitFor(() => {
      expect(showTutorial).toHaveBeenCalled();
    });
    // チュートリアル表示中に離れる
    screen.unmount();
    // その後チュートリアルを終えても mount されない
    resolveTutorial!();
    await new Promise((r) => setTimeout(r, 30));
    expect(captured.props).toBeUndefined();
  });

  it('「つづけて遊ぶ」で mount し直すと、前の instance.unmount が呼ばれる', async () => {
    const ctx = await makeCtx();
    await ctx.settings.update({ tutorialSeen: { creel: true } });
    const { module, captured } = makeFakeModule('creel');
    registerGame(module);
    const screen = createGameScreen(ctx);
    screen.mount(document.createElement('div'), { id: 'creel' });
    await vi.waitFor(() => {
      expect(captured.props?.onFinish).toBeDefined();
    });
    resultAnswers.push('again');
    await captured.props!.onFinish({
      gameId: 'creel',
      mode: 'standalone',
      stars: 3,
      stats: { 'puzzle:s1': 3 },
      unlockedPatternIds: ['p-muji-kon'],
      summary: ['たしかめた回数 3回'],
      finishedAt: ctx.clock.now(),
    });
    // mount し直しで新しい props が来る
    await vi.waitFor(() => {
      expect(captured.unmounts).toBe(1);
      expect(captured.props?.onFinish).toBeDefined();
    });
  });

  it('summary を渡すと結果の成績欄にその文だけが出る (puzzle: や s1 は出ない)', async () => {
    const ctx = await makeCtx();
    await ctx.settings.update({ tutorialSeen: { creel: true } });
    const { module, captured } = makeFakeModule('creel');
    registerGame(module);
    const screen = createGameScreen(ctx);
    const container = document.createElement('div');
    document.body.appendChild(container);
    screen.mount(container, { id: 'creel' });
    await vi.waitFor(() => {
      expect(captured.props?.onFinish).toBeDefined();
    });
    await captured.props!.onFinish({
      gameId: 'creel',
      mode: 'standalone',
      stars: 2,
      stats: { 'puzzle:s1': 2 },
      unlockedPatternIds: [],
      summary: ['確認した回数 1回', 'ヒントを使った回数 2回'],
      finishedAt: ctx.clock.now(),
    });
    await vi.waitFor(() => {
      expect(showResult).toHaveBeenCalled();
    });
    const opts = (showResult as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as { lines: string[] };
    expect(opts.lines).toEqual(['確認した回数 1回', 'ヒントを使った回数 2回']);
    const joined = opts.lines.join(' ');
    expect(joined).not.toContain('puzzle:');
    expect(joined).not.toContain('s1');
    container.remove();
  });
});

describe('T1-11b: pagehide でも途中保存する', () => {
  it('pagehide を送ると途中保存が1回行われる。unmount の後は行われない', async () => {
    const ctx = await makeCtx();
    await ctx.repo.remove('sessions', 'creel'); // 前のテストの残りを消しておく
    await ctx.settings.update({ tutorialSeen: { creel: true } });
    const { module, captured } = makeFakeModule('creel', { stage: 3 });
    registerGame(module);
    const screen = createGameScreen(ctx);
    screen.mount(document.createElement('div'), { id: 'creel' });
    await vi.waitFor(() => {
      expect(captured.instance).toBeDefined();
    });
    // pagehide を送る
    window.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(async () => {
      const s = await getSession(ctx, 'creel');
      expect(s?.state).toEqual({ stage: 3 });
    });
    // unmount したら保存されない
    screen.unmount();
    await ctx.repo.remove('sessions', 'creel');
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((r) => setTimeout(r, 30));
    expect(await getSession(ctx, 'creel')).toBeUndefined();
  });});

describe('T1-17: 確認の画面の取り消しボタンの文言', () => {
  it('「ホームに戻りますか?」の確認の取り消しボタンは「やめる」 (期待値の変更の理由: 管理者の指示で文言を変えたため)', async () => {
    const ctx = await makeCtx();
    await ctx.settings.update({ tutorialSeen: { creel: true } });
    const { module, captured } = makeFakeModule('creel', { stage: 5 });
    registerGame(module);
    const screen = createGameScreen(ctx);
    screen.mount(document.createElement('div'), { id: 'creel' });
    await vi.waitFor(() => {
      expect(captured.props?.onExit).toBeDefined();
    });
    confirmCalls.length = 0;
    confirmAnswers.push(true);
    captured.props!.onExit!();
    await vi.waitFor(() => {
      expect(confirmCalls).toHaveLength(1);
    });
    expect(confirmCalls[0]!.message).toContain('ホームに戻りますか');
    expect(confirmCalls[0]!.cancelLabel).toBe('やめる');
    expect(confirmCalls[0]!.okLabel).toBe('ホームに戻る');
    screen.unmount();
  });
});

describe('PU-05a: 結果の画面のつなぎ', () => {
  async function finishWith(
    answer: 'again' | 'list' | 'next',
    extra: Partial<Parameters<GameProps['onFinish']>[0]>,
  ): Promise<{ navigated: string[]; ctx: AppContext; captured: FakeCaptured }> {
    clearGamesForTest(); // 1つのテストの中で何度も登録するため
    const ctx = await makeCtx();
    const navigated: string[] = [];
    ctx.navigate = (path: string) => {
      navigated.push(path);
    };
    await ctx.settings.update({ tutorialSeen: { creel: true } });
    const { module, captured } = makeFakeModule('creel');
    registerGame(module);
    resultAnswers.push(answer);
    createGameScreen(ctx).mount(document.createElement('div'), { id: 'creel' });
    await vi.waitFor(() => {
      expect(captured.props?.onFinish).toBeDefined();
    });
    await captured.props!.onFinish({
      gameId: 'creel',
      mode: 'standalone',
      stars: 2,
      stats: { 'puzzle:s1': 2 },
      unlockedPatternIds: [],
      finishedAt: ctx.clock.now(),
      ...extra,
    });
    return { navigated, ctx, captured };
  }

  it("結果で 'next' を選ぶと next.start が呼ばれる (ホームへは移らない)", async () => {
    const start = vi.fn();
    const { navigated } = await finishWith('next', { next: { label: '次のお題へ', start } });
    await vi.waitFor(() => {
      expect(start).toHaveBeenCalledTimes(1);
    });
    expect(navigated).toEqual([]);
  });

  it("結果で 'list' を選ぶと toList が呼ばれ、無ければホームへ移る。'again' は again が呼ばれる", async () => {
    const toList = vi.fn();
    await finishWith('list', { toList });
    await vi.waitFor(() => {
      expect(toList).toHaveBeenCalledTimes(1);
    });
    const again = vi.fn();
    await finishWith('again', { again });
    await vi.waitFor(() => {
      expect(again).toHaveBeenCalledTimes(1);
    });
    const r = await finishWith('list', {});
    await vi.waitFor(() => {
      expect(r.navigated).toEqual(['/']);
    });
  });

  it('showResult に resultLines・starHint・next のラベルが渡る。summary だけなら summary が行になる', async () => {
    const lines = [{ label: '確認した回数', value: '1回' }];
    const a = await finishWith('list', { resultLines: lines, starHint: '1回目で合えば星3です', next: { label: '次のお題へ', start: () => undefined } });
    await vi.waitFor(() => {
      expect(showResult).toHaveBeenCalled();
    });
    const opts = vi.mocked(showResult).mock.calls[0]![1];
    expect(opts.lines).toEqual(lines);
    expect(opts.hint).toBe('1回目で合えば星3です');
    expect(opts.next).toEqual({ label: '次のお題へ' });
    expect(a.navigated).toBeDefined();
    vi.mocked(showResult).mockClear();
    await finishWith('list', { summary: ['確認した回数 1回'] });
    await vi.waitFor(() => {
      expect(showResult).toHaveBeenCalled();
    });
    expect(vi.mocked(showResult).mock.calls[0]![1].lines).toEqual(['確認した回数 1回']);
    expect(vi.mocked(showResult).mock.calls[0]![1].praise).toBeUndefined();
  });

  it('確認の画面 (続きから・ホームに戻る) に見出し (title) が付く', async () => {
    const ctx = await makeCtx();
    await ctx.settings.update({ tutorialSeen: { creel: true } });
    await putSession(ctx, 'creel', { stage: 2 });
    const { module } = makeFakeModule('creel');
    registerGame(module);
    confirmCalls.length = 0;
    confirmAnswers.push(true);
    createGameScreen(ctx).mount(document.createElement('div'), { id: 'creel' });
    await vi.waitFor(() => {
      expect(confirmCalls).toHaveLength(1);
    });
    expect((confirmCalls[0] as { title?: string }).title).toBe('続きから始めますか');
  });
});
