import type { GameDeps, GameModule, GameProps, GameInstance } from '../../core/game/types';
import { createListView } from './listView';
import { createWindingController } from './controller';
import { windingTutorial } from './tutorial';
import { isValidResume } from './logic';
import type { Level } from './params';
import { SECTIONS, STANDALONE_PATTERN } from './params';
import type { WindingState } from './logic';
import { windingPuzzles, puzzleById } from './puzzles';
import type { WindingPuzzle } from './puzzles';
import type { YarnFeel } from './params';
import { getContent } from '../../core/content/content';
import { confirmDialog } from '../../core/ui/widgets';
import { showTutorial } from '../../core/ui/tutorialOverlay';

/**
 * ドラム巻きのゲームモジュール (P2 T2-07・追加修正a)。
 * mount すると、resume が有効ならプレイ画面 (ペダルは 0)、
 * mode 'job' なら仕事の内容でプレイ画面、それ以外は難易度の一覧を開く。
 * プレイ画面の「戻る」は、難易度の一覧に戻る (T1-15 と同じ)。
 */
export function createWindingModule(deps: GameDeps): GameModule {
  return {
    id: 'winding',
    titleTermKey: 'game.winding',
    phase: 'P2',
    embeddable: true,
    summary: '張りを見ながら、帯をドラムに巻く',
    tutorial: windingTutorial,

    mount(container: HTMLElement, props: GameProps): GameInstance {
      /** プレイ中のコントローラ (難易度の一覧のあいだは null) */
      let current: GameInstance | null = null;
      /** 表示中の難易度の一覧 */
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
      const startPlay = (
        level: Level,
        patternId: string,
        sections: number,
        resume: WindingState | undefined,
        puzzle?: { id: string; stage: number; name: string; feel: YarnFeel },
        onBack: () => void = onBackFromPlay,
      ): void => {
        currentList?.destroy();
        currentList = null;
        container.textContent = '';
        // 結果の画面から、次の難易度・同じ難易度・難易度の一覧へ移れるようにする (PU-05a のつなぎ。単独プレイのみ)
        const leavePlay = (): void => {
          current?.unmount();
          current = null;
        };
        const playProps: GameProps =
          props.mode === 'standalone'
            ? {
                ...props,
                onFinish: (result) => {
                  // 次のお題 (T2-14a)。今のお題をクリアしたので、次のお題は解放されている
                  const puzzles = windingPuzzles(getContent());
                  const idx = puzzle !== undefined ? puzzles.findIndex((p) => p.id === puzzle.id) : -1;
                  const nextPuzzle = idx >= 0 && idx + 1 < puzzles.length ? puzzles[idx + 1]! : null;
                  // 成績は best['puzzle:<id>'] (クリール立てと同じ形。level:N はもう読まない)
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
                            label: '次へ',
                            start: () => {
                              leavePlay();
                              startPlay(nextPuzzle.level, nextPuzzle.patternId, nextPuzzle.sections, undefined, {
                                id: nextPuzzle.id,
                                stage: nextPuzzle.stage,
                                name: nextPuzzle.name,
                                feel: nextPuzzle.feel,
                              });
                            },
                          }
                        : undefined,
                    again: () => {
                      leavePlay();
                      startPlay(level, STANDALONE_PATTERN(level), SECTIONS(level), undefined,
                        puzzle !== undefined ? { id: puzzle.id, stage: puzzle.stage, name: puzzle.name, feel: puzzle.feel } : undefined);
                    },
                    toList: () => {
                      leavePlay();
                      showList();
                    },
                  });
                },
              }
            : props;
        current = createWindingController(container, deps, playProps, {
          level,
          patternId,
          sections,
          resume,
          tutorial: windingTutorial,
          onBack,
          puzzleStage: puzzle?.stage,
          puzzleName: puzzle?.name,
          puzzleId: puzzle?.id,
          feel: puzzle?.feel,
        });
      };

      /** プレイ画面の「戻る」。難易度の一覧に戻る (仕事モードは今までどおり onExit) */
      const onBackFromPlay = (): void => {
        void (async () => {
          const back = await confirmDialog(container, {
            title: '難易度の一覧に戻りますか',
            message: '難易度の一覧に戻りますか?(途中の状態は保存されます)',
            okLabel: 'はい',
            cancelLabel: 'いいえ',
          });
          if (disposed) {
            return;
          }
          if (!back) {
            return; // 続ける
          }
          // 今の状態を保存してから片付ける
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
      async function selectPuzzle(puzzle: WindingPuzzle): Promise<void> {
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
            ? (savedState as WindingState)
            : undefined;
        startPlay(puzzle.level, puzzle.patternId, puzzle.sections, resume, {
          id: puzzle.id,
          stage: puzzle.stage,
          name: puzzle.name,
          feel: puzzle.feel,
        });
      }

      /** 難易度の一覧を開く (途中の状態は消さない) */
      const showList = (): void => {
        container.textContent = '';
        currentList = createListView(container, {
          records: deps.records,
          unlockAll: deps.unlockAll?.() === true,
          title: deps.terms.t('game.winding'),
          savedPuzzleId: savedPuzzleId(),
          onTutorial: () => {
            void showTutorial(container, windingTutorial, { renderText: (s) => deps.terms.render(s) });
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

      // mode: 'job' は仕事の内容 (difficulty・sections・patternId) でプレイ画面を開く。
      // 「戻る」は props.onExit (追加修正a: 仕事モードは確認なしでホームへ)
      if (props.mode === 'job' && props.job !== undefined) {
        const job = props.job;
        startPlay(job.difficulty, job.patternId, job.sections, undefined, undefined, () => props.onExit());
        return wrap();
      }

      // 途中保存からの再開 (isValidResume を満たすときだけ。ペダルは controller で 0 にする)。
      // props.resume は最初の1回だけ使う (T1-15 追加修正の教訓)
      if (props.resume !== undefined && isValidResume(props.resume)) {
        const state = props.resume as WindingState;
        // 途中保存のお題の情報 (古い形で puzzleId が無い/空なら、お題でない扱いで開く)
        const puzzle =
          state.puzzleId !== ''
            ? (() => {
                const p = puzzleById(getContent(), state.puzzleId);
                return p !== null ? { id: p.id, stage: p.stage, name: p.name, feel: p.feel } : undefined;
              })()
            : undefined;
        startPlay(state.level, state.patternId, state.sections, state, puzzle);
        return wrap();
      }

      // 難易度の一覧を開く
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
