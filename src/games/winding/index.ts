import type { GameDeps, GameModule, GameProps, GameInstance } from '../../core/game/types';
import { createListView } from './listView';
import { createWindingController } from './controller';
import { windingTutorial } from './tutorial';
import { isValidResume } from './logic';
import type { Level } from './params';
import { SECTIONS, STANDALONE_PATTERN } from './params';
import type { WindingState } from './logic';
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

      /** 途中の状態の level (無ければ null) */
      const savedLevel = (): Level | null =>
        savedState !== null && savedState !== undefined && typeof savedState === 'object' && 'level' in savedState
          ? ((savedState as { level: unknown }).level as Level)
          : null;

      /** プレイ画面を開く (resume は呼び出し側で明示する。props.resume を流用しない) */
      const startPlay = (
        level: Level,
        patternId: string,
        sections: number,
        resume: WindingState | undefined,
        onBack: () => void = onBackFromPlay,
      ): void => {
        currentList?.destroy();
        currentList = null;
        container.textContent = '';
        current = createWindingController(container, deps, props, {
          level,
          patternId,
          sections,
          resume,
          tutorial: windingTutorial,
          onBack,
        });
      };

      /** プレイ画面の「戻る」。難易度の一覧に戻る (仕事モードは今までどおり onExit) */
      const onBackFromPlay = (): void => {
        void (async () => {
          const back = await confirmDialog(container, {
            message: '難易度の一覧に戻りますか?(途中の状態は保存されます)',
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

      /** 別の難易度を選んだときの確認 (途中の難易度があれば出す) */
      async function selectLevel(level: Level): Promise<void> {
        const resumeLevel = savedLevel();
        if (resumeLevel !== null && resumeLevel !== level) {
          const start = await confirmDialog(container, {
            message: '途中の難易度があります。新しく始めると、途中の状態は消えます。始めますか?',
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
        // 選んだ難易度が途中の難易度なら、その状態から再開する
        const resume =
          resumeLevel === level && savedState !== undefined && isValidResume(savedState)
            ? (savedState as WindingState)
            : undefined;
        startPlay(level, STANDALONE_PATTERN(level), SECTIONS(level), resume);
      }

      /** 難易度の一覧を開く (途中の状態は消さない) */
      const showList = (): void => {
        container.textContent = '';
        currentList = createListView(container, {
          records: deps.records,
          title: deps.terms.t('game.winding'),
          savedLevel: savedLevel(),
          onTutorial: () => {
            void showTutorial(container, windingTutorial, { renderText: (s) => deps.terms.render(s) });
          },
          onSelect: (level: Level) => {
            void selectLevel(level);
          },
          onExit: () => props.onExit(),
        });
      };

      // mode: 'job' は仕事の内容 (difficulty・sections・patternId) でプレイ画面を開く。
      // 「戻る」は props.onExit (追加修正a: 仕事モードは確認なしでホームへ)
      if (props.mode === 'job' && props.job !== undefined) {
        const job = props.job;
        startPlay(job.difficulty, job.patternId, job.sections, undefined, () => props.onExit());
        return wrap();
      }

      // 途中保存からの再開 (isValidResume を満たすときだけ。ペダルは controller で 0 にする)。
      // props.resume は最初の1回だけ使う (T1-15 追加修正の教訓)
      if (props.resume !== undefined && isValidResume(props.resume)) {
        const state = props.resume as WindingState;
        startPlay(state.level, state.patternId, state.sections, state);
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
