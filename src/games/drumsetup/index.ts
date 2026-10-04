import type { GameDeps, GameModule, GameProps, GameInstance } from '../../core/game/types';
import { createListView } from './listView';
import { createDrumSetupController } from './controller';
import { drumsetupTutorial } from './tutorial';
import { drumSetupPuzzles, puzzleById } from './puzzles';
import type { DrumSetupPuzzle } from './puzzles';
import type { DrumSetupState as State } from './logic';
import { getContent } from '../../core/content/content';
import { confirmDialog } from '../../core/ui/widgets';
import { showTutorial } from '../../core/ui/tutorialOverlay';

/**
 * ドラム設定のゲームモジュール (T2c-03b)。ドラム巻きと同じ形:
 * mount すると、途中保存があればそのお題のプレイ画面、それ以外はお題の一覧を開く。
 * プレイ画面の「戻る」は、お題の一覧に戻る (確認のうえ途中保存)。
 */
export function createDrumSetupModule(deps: GameDeps): GameModule {
  return {
    id: 'drumsetup',
    titleTermKey: 'game.drumsetup',
    phase: 'P2',
    embeddable: true,
    summary: '羽の角度と送り量を計算して合わせる',
    tutorial: drumsetupTutorial,

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

      /** プレイ画面を開く */
      const startPlay = (puzzle: DrumSetupPuzzle, resume: State | undefined, onBack: () => void = onBackFromPlay): void => {
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
                  // 次のお題 (今のお題をクリアしたので、次のお題は解放されている)
                  const puzzles = drumSetupPuzzles(getContent());
                  const idx = puzzles.findIndex((p) => p.id === puzzle.id);
                  const nextPuzzle = idx >= 0 && idx + 1 < puzzles.length ? puzzles[idx + 1]! : null;
                  const stats = { ...result.stats, [`puzzle:${puzzle.id}`]: result.stars };
                  props.onFinish({
                    ...result,
                    stats,
                    next:
                      nextPuzzle !== null
                        ? {
                            label: '次のお題へ',
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
        current = createDrumSetupController(container, deps, playProps, {
          puzzle,
          tutorial: drumsetupTutorial,
          onBack,
        });
      };

      /** プレイ画面の「戻る」。お題の一覧に戻る (途中の状態は保存) */
      const onBackFromPlay = (): void => {
        void (async () => {
          const back = await confirmDialog(container, {
            title: 'お題の一覧に戻りますか',
            message: 'お題の一覧に戻りますか?(途中の状態は保存されます)',
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
      async function selectPuzzle(puzzle: DrumSetupPuzzle): Promise<void> {
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
        const resume =
          savedId === puzzle.id && savedState !== undefined ? (savedState as State) : undefined;
        startPlay(puzzle, resume);
      }

      /** お題の一覧を開く (途中の状態は消さない) */
      const showList = (): void => {
        container.textContent = '';
        currentList = createListView(container, {
          records: deps.records,
          title: deps.terms.t('game.drumsetup'),
          savedPuzzleId: savedPuzzleId(),
          onTutorial: () => {
            void showTutorial(container, drumsetupTutorial, { renderText: (s) => deps.terms.render(s) });
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

      // 途中保存からの再開 (お題の id が今のデータにあれば)
      if (props.resume !== undefined) {
        const state = props.resume as State;
        const puzzle = puzzleById(getContent(), state.puzzleId);
        if (puzzle !== null) {
          startPlay(puzzle, state);
          return wrap();
        }
      }

      // お題の一覧を開く
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
            currentList?.destroy();
            currentList = null;
          },
        };
      }
    },
  };
}
