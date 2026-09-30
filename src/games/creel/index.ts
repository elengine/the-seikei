import type { GameDeps, GameModule, GameProps, GameInstance } from '../../core/game/types';
import { getContent } from '../../core/content/content';
import { createListView } from './listView';
import { createController } from './controller';
import { creelTutorial } from './tutorial';
import { isValidResume } from './logic';
import { confirmDialog } from '../../core/ui/widgets';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import type { CreelState } from './logic';

/**
 * クリール立てのゲームモジュール。
 * mount すると、resume が有効ならプレイ画面、それ以外はお題一覧を開く。
 * プレイ画面の「戻る」は、お題の一覧に戻る (T1-15)。
 */
export function createCreelModule(deps: GameDeps): GameModule {
  return {
    id: 'creel',
    titleTermKey: 'game.creel',
    phase: 'P1',
    embeddable: true,
    summary: '依頼書のとおりにコーンを立てる',
    tutorial: creelTutorial,

    mount(container: HTMLElement, props: GameProps): GameInstance {
      const content = getContent();
      /** 途中の状態 (最後に onStateChange で受け取った状態、または props.resume) */
      let savedState: unknown = props.resume;
      /** プレイ中のコントローラ (お題一覧のあいだは null) */
      let current: GameInstance | null = null;
      /** 片付け済みか (片付けたあとに非同期の確認が解いても何もしない) */
      let disposed = false;
      /** 表示中のお題一覧 */
      let currentList: { destroy(): void } | null = null;

      /** onStateChange を包んで、プレイ中の状態を覚える */
      const wrappedProps: GameProps = {
        ...props,
        onStateChange: (state: unknown): void => {
          savedState = state;
          props.onStateChange?.(state);
        },
      };

      const showList = (): void => {
        container.textContent = '';
        const list = createListView(container, {
          records: deps.records,
          content,
          title: deps.terms.t('game.creel'),
          savedPuzzleId: savedPuzzleId(),
          onTutorial: () => {
            void showTutorial(container, creelTutorial, { renderText: (s) => deps.terms.render(s) });
          },
          onSelect: (puzzleId: string) => {
            void selectPuzzle(puzzleId);
          },
          onExit: () => props.onExit(),
        });
        currentList = list;
      };

      /** 途中の状態の puzzleId (無ければ null) */
      const savedPuzzleId = (): string | null =>
        savedState !== null && savedState !== undefined && typeof savedState === 'object' && 'puzzleId' in savedState
          ? String((savedState as { puzzleId: unknown }).puzzleId)
          : null;

      /** プレイ画面を開く。resume は呼び出し側で明示する (props.resume を流用しない) */
      const startPlay = (puzzleId: string, resume: CreelState | undefined): void => {
        currentList?.destroy();
        currentList = null;
        // プレイ画面の「戻る」をお題一覧への戻りに変える。完了時は途中の状態を消す
        const controllerProps: GameProps = {
          ...wrappedProps,
          resume, // ...wrappedProps のあとに上書き (mount の props.resume を残さない)
          onExit: onBackFromPlay,
          onFinish: (result: Parameters<GameProps['onFinish']>[0]) => {
            savedState = null;
            props.onFinish?.(result);
          },
        };
        current = createController(container, deps, controllerProps, {
          puzzleId,
          resume,
          content,
          tutorial: creelTutorial,
        });
      };

      /** 別のお題を選んだときの確認 (途中のお題があれば出す) */
      async function selectPuzzle(puzzleId: string): Promise<void> {
        const resumePuzzleId = savedPuzzleId();
        if (resumePuzzleId !== null && resumePuzzleId !== puzzleId) {
          const start = await confirmDialog(container, {
            message: '途中のお題があります。新しいお題を始めると、途中の状態は消えます。始めますか?',
            okLabel: '始める',
            cancelLabel: 'やめる',
          });
          if (disposed) {
            return;
          }
          if (!start) {
            return; // 一覧のまま
          }
        }
        // 選んだお題が途中のお題なら、その状態から再開する
        const resume =
          resumePuzzleId === puzzleId && isValidResume(savedState as CreelState, content)
            ? (savedState as CreelState)
            : undefined;
        startPlay(puzzleId, resume);
      }

      /** プレイ画面の「戻る」の処理。お題の一覧に戻る (仕事モードは今までどおり onExit) */
      const onBackFromPlay = (): void => {
        void (async () => {
          const back = await confirmDialog(container, {
            message: 'お題の一覧に戻りますか?(途中の状態は保存されます)',
            okLabel: '一覧に戻る',
            cancelLabel: 'やめる',
          });
          if (disposed) {
            return;
          }
          if (!back) {
            return; // 続ける
          }
          // 今の状態を保存してから片付ける
          const state = current !== null ? (current.suspend() as CreelState | null) : null;
          if (state !== null && state !== undefined) {
            savedState = state;
            props.onStateChange?.(state);
          }
          current?.unmount();
          current = null;
          showList();
        })();
      };

      // mode: 'job' は difficulty に対応する段数のお題をその場で作る (P5 まで使われないが形だけ用意)
      if (props.mode === 'job' && props.job !== undefined) {
        const job = props.job;
        const rows = job.difficulty === 1 ? 1 : job.difficulty === 2 ? 2 : 3;
        const puzzle = {
          id: `job-${job.orderId}`,
          stage: job.difficulty,
          patternId: job.patternId,
          rows,
          cols: 8,
        };
        return createController(container, deps, props, {
          puzzleId: puzzle.id,
          resume: props.resume,
          content,
          tutorial: creelTutorial,
          jobPuzzle: puzzle,
        });
      }

      // 途中保存からの再開 (isValidResume を満たすときだけ。props.resume は最初の1回だけ使う)
      if (props.resume !== undefined && isValidResume(props.resume, content)) {
        startPlay(props.resume.puzzleId, props.resume);
        return {
          suspend(): unknown {
            return current !== null ? current.suspend() : null;
          },
          unmount(): void {
            disposed = true;
            if (current !== null) {
              current.unmount();
              current = null;
            }
            currentList?.destroy();
            currentList = null;
          },
        };
      }

      // お題一覧を開く (途中の状態は消さない。T1-15)
      showList();
      return {
        suspend(): unknown {
          return current !== null ? current.suspend() : null; // お題一覧では途中保存しない
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
    },
  };
}
