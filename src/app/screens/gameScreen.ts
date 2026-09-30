import type { AppContext } from '../context';
import type { Screen } from '../screenManager';
import { getGame } from '../../core/game/registry';
import type { GameId, GameModule, GameInstance, GameProps } from '../../core/game/types';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import { showResult } from '../../core/ui/resultView';
import { confirmDialog } from '../../core/ui/widgets';

/** 途中保存の保存データ (sessions コレクション) */
interface SessionData {
  state: unknown;
  savedAt: string;
}

const SAVE_INTERVAL_MS = 1000; // onStateChange の保存は1秒に1回まで

/** ゲーム画面 (#/games/:id)。開く → チュートリアル → 再開の確認 → 遊ぶ → 結果 → 記録 */
export function createGameScreen(ctx: AppContext): Screen {
  // 現在 mount しているゲームの片付け (instance.unmount、イベント解除、保留中の保存)。Screen.unmount から呼ぶ
  let cleanup: (() => void) | null = null;
  // 離れたあとはチュートリアルや確認ダイアログの続きを行わない
  let disposed = false;

  return {
    mount(container: HTMLElement, params: Record<string, string> = {}): void {
      cleanup = null;
      disposed = false;
      // /games/:id の id は screenManager が解決して params['id'] に入れる
      const rawId = params['id'];
      const known: GameId[] = ['creel', 'winding', 'beaming', 'shop'];
      const id = rawId !== undefined && known.includes(rawId as GameId) ? (rawId as GameId) : undefined;
      const root = document.createElement('div');
      root.classList.add('game-screen');
      container.textContent = '';
      container.appendChild(root);

      void (async () => {
        if (id === undefined) {
          ctx.navigate('/'); // 無効な id はホームへ
          return;
        }
        const module = getGame(id);
        if (module === undefined) {
          ctx.navigate('/'); // 登録簿に無いゲームもホームへ
          return;
        }

        // チュートリアル (settings.tutorialSeen[id] が true でなければ見せる)
        const settings = ctx.settings.get();
        if (settings.tutorialSeen[id] !== true) {
          await showTutorial(root, module.tutorial, { renderText: (s) => ctx.terms.render(s) });
          if (disposed) {
            return; // 表示中に離れた
          }
          await ctx.settings.update({ tutorialSeen: { ...settings.tutorialSeen, [id]: true } });
        }

        // 途中保存の確認
        let resume: unknown = undefined;
        const saved = await getSession(ctx, id);
        if (saved !== undefined) {
          const resumeChosen = await confirmDialog(root, {
            message: '前回の続きから始めますか?',
            okLabel: '続きから',
            cancelLabel: '最初から',
          });
          if (disposed) {
            return; // 確認中に離れた
          }
          if (resumeChosen) {
            resume = saved.state;
          } else {
            await ctx.repo.remove('sessions', id); // 「最初から」なら途中保存を消す
          }
        }
        if (disposed) {
          return;
        }

        mountGame(
          ctx,
          root,
          module,
          resume,
          (nextCleanup) => {
            cleanup = nextCleanup;
          },
          () => disposed,
        );
      })();
    },

    unmount(): void {
      disposed = true;
      if (cleanup !== null) {
        cleanup(); // instance.unmount、visibilitychange の解除、保留中の途中保存
        cleanup = null;
      }
    },
  };
}

async function getSession(ctx: AppContext, id: GameId): Promise<SessionData | undefined> {
  const rec = await ctx.repo.get<SessionData>('sessions', id);
  return rec !== undefined && rec.deletedAt === undefined ? rec.data : undefined;
}

/** ゲーム本体を mount し、onStateChange / onFinish / onExit / visibilitychange をつなぐ。cleanup を registerCleanup で渡す */
function mountGame(
  ctx: AppContext,
  parent: HTMLElement,
  module: GameModule,
  resume: unknown,
  registerCleanup: (cleanup: () => void) => void,
  isDisposed: () => boolean,
): void {
  const gameId = module.id;
  let lastCleanup: (() => void) | null = null; // この mountGame が登録した cleanup
  const box = document.createElement('div');
  box.classList.add('game-screen__stage');
  parent.textContent = '';
  parent.appendChild(box);

  // ---- onStateChange: 1秒に1回までまとめて保存。null なら消す ----
  let pendingState: unknown = undefined;
  let pendingClear = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  async function flushState(): Promise<void> {
    saveTimer = null;
    if (pendingClear) {
      await ctx.repo.remove('sessions', gameId);
      pendingClear = false;
      return;
    }
    if (pendingState !== undefined) {
      await ctx.repo.put('sessions', { state: pendingState, savedAt: ctx.clock.now() }, gameId);
      pendingState = undefined;
    }
  }
  const onStateChange = (state: unknown): void => {
    if (state === null) {
      pendingClear = true;
      pendingState = undefined;
    } else {
      pendingState = state;
      pendingClear = false;
    }
    if (saveTimer === null) {
      saveTimer = setTimeout(() => {
        void flushState();
      }, SAVE_INTERVAL_MS);
    }
  };

  // ---- 途中保存のヘルパー (onExit・visibilitychange 共用) ----
  async function saveSuspended(): Promise<void> {
    const state = instance.suspend();
    if (state !== null && state !== undefined) {
      await ctx.repo.put('sessions', { state, savedAt: ctx.clock.now() }, gameId);
    }
  }

  // ---- onFinish: 消す → 記録 → 図鑑 → 結果表示 ----
  const onFinish = (result: Parameters<GameProps['onFinish']>[0]): void => {
    void (async () => {
      await ctx.repo.remove('sessions', gameId); // 途中保存を消す
      // stats の中で 'puzzle:' で始まるキーだけ成績に残す (表示は summary を使う)
      const puzzleStats: Record<string, number> = {};
      for (const [key, value] of Object.entries(result.stats)) {
        if (key.startsWith('puzzle:')) {
          puzzleStats[key] = value;
        }
      }
      await ctx.records.add(result.gameId, result.stars, puzzleStats);
      // unlockedPatternIds をすべて図鑑に登録し、新しく入手した柄の名前を集める
      const content = await import('../../core/content/content');
      const all = ctx.zukan.all();
      const newNames: string[] = [];
      for (const patternId of result.unlockedPatternIds) {
        const had = all.has(patternId);
        await ctx.zukan.unlock(patternId, result.gameId);
        if (!had) {
          const pattern = content.getContent().patterns.get(patternId);
          if (pattern !== undefined) {
            newNames.push(pattern.name);
          }
        }
      }
      // 成績欄は summary だけ (無ければ空)。「星 Nつ」は星の表示と重なるので出さない
      const lines = result.summary ?? [];
      const praise = result.stars === 3 ? '完璧です!' : result.stars === 2 ? 'お見事です!' : '完成です!';
      const choice = await showResult(parent, {
        praise,
        stars: result.stars,
        lines,
        newPatternNames: newNames,
        againLabel: '続けて遊ぶ',
        homeLabel: 'ホームへ',
      });
      if (isDisposed()) {
        return; // 結果表示中に離れた
      }
      if (choice === 'again') {
        lastCleanup?.(); // 前のゲームを片付けてから mount し直す
        mountGame(ctx, parent, module, undefined, registerCleanup, isDisposed);
      } else {
        ctx.navigate('/');
      }
    })();
  };

  // ---- onExit: suspend の結果があれば確認して保存してホームへ ----
  const onExit = (): void => {
    void (async () => {
      const state = instance.suspend();
      if (state !== null && state !== undefined) {
        const goHome = await confirmDialog(parent, {
          message: 'ホームに戻りますか?(途中の状態は保存されます)',
          okLabel: 'ホームに戻る',
          cancelLabel: 'やめる',
        });
        if (isDisposed()) {
          return;
        }
        if (!goHome) {
          return; // つづける
        }
        await ctx.repo.put('sessions', { state, savedAt: ctx.clock.now() }, gameId);
      }
      ctx.navigate('/');
    })();
  };

  const props = {
    mode: 'standalone' as const,
    resume,
    onStateChange,
    onFinish,
    onExit,
  };

  const instance: GameInstance = module.mount(box, props);

  // ---- ページが裏に回ったら途中保存 (visibilitychange の後にすぐ止められることもあるため、
  //      アプリを閉じるときに出る pagehide でも同じ保存を行う) ----
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      void saveSuspended();
    }
  };
  const onPageHide = (): void => {
    void saveSuspended();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);

  // ---- 画面を離れるときの片付け (Screen.unmount と「続けて遊ぶ」から呼ぶ) ----
  const cleanupThis = (): void => {
    lastCleanup = null; // 二重呼び出し防止 (mount し直しで新しい cleanup が登録される)
    instance.unmount();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    void flushState(); // 保留中の状態を保存してから離れる
  };
  lastCleanup = cleanupThis;
  registerCleanup(cleanupThis);
}
