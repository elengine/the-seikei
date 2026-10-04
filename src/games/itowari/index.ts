import type { GameDeps, GameModule, GameProps, GameInstance } from '../../core/game/types';
import { createListView } from './listView';
import { createItowariController } from './controller';
import { itowariTutorial } from './tutorial';
import { isValidResume } from './logic';
import type { ItowariState } from './logic';
import { itowariPuzzles, puzzleById } from './puzzles';
import type { ItowariPuzzle } from './puzzles';
import { getContent } from '../../core/content/content';
import { confirmDialog } from '../../core/ui/widgets';
import { showTutorial } from '../../core/ui/tutorialOverlay';

/**
 * 糸割りのゲームモジュール (P2b T2b-04)。ビーム巻きと同じ形。
 * mount すると、resume が有効ならプレイ画面、それ以外はレベルの一覧を開く。
 * プレイ画面の「戻る」は、一覧に戻る (確認のボタンは「はい」「いいえ」)。
 */
export function createItowariModule(deps: GameDeps): GameModule {
  return {
    id: 'itowari',
    titleTermKey: 'game.itowari',
    phase: 'P2',
    embeddable: true,
    summary: '足りない糸を、ワインダーで巻き分ける',
    tutorial: itowariTutorial,

    mount(container: HTMLElement, props: GameProps): GameInstance {
      /** プレイ中のコントローラ (一覧のあいだは null) */
      let current: GameInstance | null = null;
      /** 表示中の一覧 */
      let currentList: { destroy(): void } | null = null;
      /** 片付け済みか */
      let disposed = false;
      /** 途中の状態 (最後に onStateChange で受け取った状態、または props.resume) */
      let savedState: unknown = props.resume;

      /** 途中の状態のお題の id (無ければ null) */
      const savedPuzzleId = (): string | null =>
        savedState !== null && savedState !== undefined && typeof savedState === 'object' && 'puzzleId' in savedState
          ? ((savedState as { puzzleId: unknown }).puzzleId as string)
          : null;

      /** プレイ画面を開く (resume は呼び出し側で明示する。props.resume を流用しない) */
      const startPlay = (puzzle: ItowariPuzzle | undefined, resume: ItowariState | undefined, onBack: () => void = onBackFromPlay): void => {
        currentList?.destroy();
        currentList = null;
        container.textContent = '';
        const leavePlay = (): void => {
          current?.unmount();
          current = null;
        };
        const playProps: GameProps =
          props.mode === 'standalone'
            ? {
                ...props,
                onFinish: (result) => {
                  // 次のお題。今のお題をクリアしたので、次のお題は解放されている
                  const puzzles = itowariPuzzles(getContent());
                  const idx = puzzle !== undefined ? puzzles.findIndex((p) => p.id === puzzle.id) : -1;
                  const nextPuzzle = idx >= 0 && idx + 1 < puzzles.length ? puzzles[idx + 1]! : null;
                  // 成績は best['puzzle:<id>']
                  const stats = puzzle !== undefined ? { ...result.stats, [`puzzle:${puzzle.id}`]: result.stars } : result.stats;
                  props.onFinish({
                    ...result,
                    stats,
                    next:
                      nextPuzzle !== null
                        ? {
                            label: '次へ',
                            start: () => {
                              leavePlay();
                              startPlay(nextPuzzle, undefined);
                            },
                          }
                        : undefined,
                    again: () => {
                      leavePlay();
                      startPlay(puzzle, undefined);
                    },
                    toList: () => {
                      leavePlay();
                      showList();
                    },
                  });
                },
              }
            : props;
        current = createItowariController(container, deps, playProps, {
          puzzleId: puzzle?.id ?? itowariPuzzles(getContent())[0]!.id,
          resume,
          onBack,
        });
      };

      /** プレイ画面の「戻る」。一覧に戻る (仕事モードは今までどおり onExit) */
      const onBackFromPlay = (): void => {
        void (async () => {
          const back = await confirmDialog(container, {
            title: '一覧に戻りますか',
            message: '一覧に戻りますか?(途中の状態は保存されます)',
            okLabel: 'はい',
            cancelLabel: 'いいえ',
          });
          if (disposed) {
            return;
          }
          if (!back) {
            return; // 続ける
          }
          const state = current !== null ? current.suspend() : null;
          if (state !== null && state !== undefined) {
            savedState = state;
            props.onStateChange?.(state);
          }
          current?.unmount();
          current = null;
          showList();
        })();
      };

      /** 別のお題を選んだときの確認 (途中のお題があれば出す) */
      async function selectPuzzle(puzzle: ItowariPuzzle): Promise<void> {
        const savedId = savedPuzzleId();
        if (savedId !== null && savedId !== '' && savedId !== puzzle.id) {
          const start = await confirmDialog(container, {
            title: '新しく始めますか',
            message: '途中のお題があります。新しく始めると、途中の状態は消えます。始めますか?',
            okLabel: '始める',
            cancelLabel: 'やめる',
          });
          if (disposed) {
            return;
          }
          if (!start) {
            return; // 一覧のまま
          }
          savedState = undefined; // 新しく始めるので途中は消す
        }
        // 選んだお題が途中のお題なら、その状態から再開する
        const resume = savedId === puzzle.id && savedState !== undefined && isValidResume(savedState) ? (savedState as ItowariState) : undefined;
        startPlay(puzzle, resume);
      }

      /** 一覧を開く (途中の状態は消さない) */
      const showList = (): void => {
        container.textContent = '';
        currentList = createListView(container, {
          records: deps.records,
          title: deps.terms.t('game.itowari'),
          savedPuzzleId: savedPuzzleId(),
          onTutorial: () => {
            void showTutorial(container, itowariTutorial, { renderText: (s) => deps.terms.render(s) });
          },
          onSelect: (puzzleId: string) => {
            const puzzle = puzzleById(getContent(), puzzleId);
            if (puzzle !== null) {
              void selectPuzzle(puzzle);
            }
          },
          onExit: () => props.onExit(),
        });
      };

      // mode: 'job' は仕事の内容 (difficulty・patternId) でプレイ画面を開く。
      // お題はそのレベルの最初のお題。「戻る」は props.onExit
      if (props.mode === 'job' && props.job !== undefined) {
        const job = props.job;
        const puzzles = itowariPuzzles(getContent());
        const puzzle = puzzles.find((p) => p.level === job.difficulty);
        startPlay(puzzle, undefined, () => props.onExit());
        return wrap();
      }

      // 途中保存からの再開 (isValidResume を満たすときだけ)
      if (props.resume !== undefined && isValidResume(props.resume)) {
        const state = props.resume as ItowariState;
        const puzzle = state.puzzleId !== '' ? puzzleById(getContent(), state.puzzleId) ?? undefined : undefined;
        startPlay(puzzle, state);
        return wrap();
      }

      // 一覧を開く
      showList();
      return wrap();

      function wrap(): GameInstance {
        return {
          suspend(): unknown {
            return current !== null ? current.suspend() : null; // 一覧では途中保存しない
          },
          unmount(): void {
            disposed = true;
            if (current !== null) {
              current.unmount(); // プレイ中なら片付ける
              current = null;
            }
            if (currentList !== null) {
              currentList.destroy();
              currentList = null;
            }
          },
        };
      }
    },
  };
}
