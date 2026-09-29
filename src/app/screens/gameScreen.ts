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
  return {
    mount(container: HTMLElement, params: Record<string, string> = {}): void {
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
          await showTutorial(root, module.tutorial);
          await ctx.settings.update({ tutorialSeen: { ...settings.tutorialSeen, [id]: true } });
        }

        // 途中保存の確認
        let resume: unknown = undefined;
        const saved = await getSession(ctx, id);
        if (saved !== undefined) {
          const resumeChosen = await confirmDialog(root, {
            message: '前に遊んでいたつづきから始めますか?',
            okLabel: 'つづきから',
            cancelLabel: 'はじめから',
          });
          if (resumeChosen) {
            resume = saved.state;
          } else {
            await ctx.repo.remove('sessions', id); // 「はじめから」なら途中保存を消す
          }
        }

        mountGame(ctx, root, module, resume, () => root);
      })();
    },

    unmount(): void {
      // instance とイベントは mountGame の cleanup が管理する (ここでは container ごと取り除かれる)
    },
  };
}

async function getSession(ctx: AppContext, id: GameId): Promise<SessionData | undefined> {
  const rec = await ctx.repo.get<SessionData>('sessions', id);
  return rec !== undefined && rec.deletedAt === undefined ? rec.data : undefined;
}

/** ゲーム本体を mount し、onStateChange / onFinish / onExit / visibilitychange をつなぐ */
function mountGame(
  ctx: AppContext,
  parent: HTMLElement,
  module: GameModule,
  resume: unknown,
  getContainer: () => HTMLElement,
): void {
  const gameId = module.id;
  const box = document.createElement('div');
  box.classList.add('game-screen__stage');
  getContainer().textContent = '';
  getContainer().appendChild(box);

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
      // stats の中で 'puzzle:' で始まるキーだけ成績に残す
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
      const praise = result.stars === 3 ? '完璧です!' : result.stars === 2 ? 'よくできました!' : 'できました!';
      const lines = [`星 ${result.stars}つ`];
      for (const [key, value] of Object.entries(puzzleStats)) {
        lines.push(`${key.replace(/^puzzle:/, '')} ${value}`);
      }
      const choice = await showResult(parent, {
        praise,
        stars: result.stars,
        lines,
        newPatternNames: newNames,
        againLabel: 'つづけて遊ぶ',
        homeLabel: 'ホームへ',
      });
      if (choice === 'again') {
        mountGame(ctx, parent, module, undefined, getContainer); // mount し直す
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
          message: 'ホームにもどりますか? (つづきは保存されます)',
          okLabel: 'ホームにもどる',
          cancelLabel: 'つづける',
        });
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

  // ---- ページが裏に回ったら途中保存 ----
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      void saveSuspended();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  // unmount 時に解除するため、box に解除処理を記憶させる
  const observer = new MutationObserver(() => {
    if (!box.isConnected) {
      instance.unmount();
      document.removeEventListener('visibilitychange', onVisibility);
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
        saveTimer = null;
        void flushState(); // 残っていた状態を保存してから離れる
      }
      observer.disconnect();
    }
  });
  observer.observe(parent, { childList: true, subtree: false });
}
