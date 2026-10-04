import type { GameDeps, GameModule, GameProps, GameInstance } from '../../core/game/types';
import { createListView } from './listView';
import { createBeamingController } from './controller';
import { beamingTutorial } from './tutorial';
import { isValidResume } from './logic';
import type { BeamingState } from './logic';
import type { Level } from './params';
import { beamingPuzzles, puzzleById } from './puzzles';
import type { BeamingPuzzle } from './puzzles';
import { getContent } from '../../core/content/content';
import { confirmDialog } from '../../core/ui/widgets';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import { PUZZLE_STAGE } from '../winding/params';

/**
 * ビーム巻きのゲームモジュール (P3 T3-03b)。ドラム巻きと同じ形。
 * mount すると、resume が有効ならプレイ画面 (ペダルは 0)、
 * mode 'job' なら仕事の内容でプレイ画面、それ以外はレベルの一覧を開く。
 * プレイ画面の「戻る」は、一覧に戻る。
 */
export function createBeamingModule(deps: GameDeps): GameModule {
  return {
    id: 'beaming',
    titleTermKey: 'game.beaming',
    phase: 'P3',
    embeddable: true,
    summary: 'ドラムからビームへ、均一に巻き返す',
    tutorial: beamingTutorial,

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

      /** お題の帯の数 (ドラム巻きのお題と同じ) */
      const bandsOf = (stage: number): number => PUZZLE_STAGE[stage as 1 | 2 | 3 | 4 | 5]!.sections;

      /** プレイ画面を開く (resume は呼び出し側で明示する。props.resume を流用しない) */
      const startPlay = (
        level: Level,
        patternId: string,
        widthCm: number,
        resume: BeamingState | undefined,
        puzzle?: { id: string; stage: number; name: string },
        onBack: () => void = onBackFromPlay,
      ): void => {
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
                  const puzzles = beamingPuzzles(getContent());
                  const idx = puzzle !== undefined ? puzzles.findIndex((p) => p.id === puzzle.id) : -1;
                  const nextPuzzle = idx >= 0 && idx + 1 < puzzles.length ? puzzles[idx + 1]! : null;
                  // 成績は best['puzzle:<id>']
                  const stats =
                    puzzle !== undefined
                      ? { ...result.stats, [`puzzle:${puzzle.id}`]: result.stars }
                      : result.stats;
                  props.onFinish({
                    ...result,
                    stats,
                    next:
                      nextPuzzle !== null
                        ? {
                            label: '次のお題へ',
                            start: () => {
                              leavePlay();
                              startPlay(nextPuzzle.level, nextPuzzle.patternId, nextPuzzle.widthCm, undefined, {
                                id: nextPuzzle.id,
                                stage: nextPuzzle.stage,
                                name: nextPuzzle.name,
                              });
                            },
                          }
                        : undefined,
                    again: () => {
                      leavePlay();
                      startPlay(level, patternId, widthCm, undefined,
                        puzzle !== undefined ? { id: puzzle.id, stage: puzzle.stage, name: puzzle.name } : undefined);
                    },
                    toList: () => {
                      leavePlay();
                      showList();
                    },
                  });
                },
              }
            : props;
        current = createBeamingController(container, deps, playProps, {
          level,
          patternId,
          widthCm,
          resume,
          tutorial: beamingTutorial,
          onBack,
          puzzleName: puzzle?.name,
          puzzleId: puzzle?.id,
          bands: puzzle !== undefined ? bandsOf(puzzle.stage) : undefined,
        });
      };

      /** プレイ画面の「戻る」。一覧に戻る (仕事モードは今までどおり onExit) */
      const onBackFromPlay = (): void => {
        void (async () => {
          const back = await confirmDialog(container, {
            title: '一覧に戻りますか',
            message: '一覧に戻りますか?(途中の状態は保存されます)',
            okLabel: '一覧に戻る',
            cancelLabel: 'やめる',
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
      async function selectPuzzle(puzzle: BeamingPuzzle): Promise<void> {
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
        const resume =
          savedId === puzzle.id && savedState !== undefined && isValidResume(savedState)
            ? (savedState as BeamingState)
            : undefined;
        startPlay(puzzle.level, puzzle.patternId, puzzle.widthCm, resume, {
          id: puzzle.id,
          stage: puzzle.stage,
          name: puzzle.name,
        });
      }

      /** 一覧を開く (途中の状態は消さない) */
      const showList = (): void => {
        container.textContent = '';
        currentList = createListView(container, {
          records: deps.records,
          title: deps.terms.t('game.beaming'),
          savedPuzzleId: savedPuzzleId(),
          onTutorial: () => {
            void showTutorial(container, beamingTutorial, { renderText: (s) => deps.terms.render(s) });
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
      // 巻き幅はそのレベルの最初のお題のもの。「戻る」は props.onExit
      if (props.mode === 'job' && props.job !== undefined) {
        const job = props.job;
        const puzzles = beamingPuzzles(getContent());
        const widthCm = puzzles.find((p) => p.level === job.difficulty)?.widthCm ?? 60;
        startPlay(job.difficulty as Level, job.patternId, widthCm, undefined, undefined, () => props.onExit());
        return wrap();
      }

      // 途中保存からの再開 (isValidResume を満たすときだけ。ペダルは controller で 0 にする)
      if (props.resume !== undefined && isValidResume(props.resume)) {
        const state = props.resume as BeamingState;
        const puzzle =
          state.puzzleId !== ''
            ? (() => {
                const p = puzzleById(getContent(), state.puzzleId);
                return p !== null ? { id: p.id, stage: p.stage, name: p.name } : undefined;
              })()
            : undefined;
        startPlay(state.level, state.patternId, state.widthCm, state, puzzle);
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
