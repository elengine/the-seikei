import type { GameDeps, GameModule, GameProps, GameInstance } from '../../core/game/types';
import { createListView } from './listView';
import { createWindingController } from './controller';
import { windingTutorial } from './tutorial';
import { isValidResume } from './logic';
import type { Level } from './params';
import { SECTIONS, STANDALONE_PATTERN } from './params';
import type { WindingState } from './logic';

/**
 * ドラム巻きのゲームモジュール (P2 T2-07)。
 * mount すると、resume が有効ならプレイ画面 (ペダルは 0)、
 * mode 'job' なら仕事の内容でプレイ画面、それ以外は難易度の一覧を開く。
 */
export function createWindingModule(deps: GameDeps): GameModule {
  return {
    id: 'winding',
    titleTermKey: 'game.winding',
    phase: 'P2',
    embeddable: true,
    tutorial: windingTutorial,

    mount(container: HTMLElement, props: GameProps): GameInstance {
      /** プレイ中のコントローラ (難易度の一覧のあいだは null) */
      let current: GameInstance | null = null;
      /** 表示中の難易度の一覧 */
      let currentList: { destroy(): void } | null = null;

      /** プレイ画面を開く (level・柄・帯の数は呼び出し側で決める) */
      const startPlay = (level: Level, patternId: string, sections: number, resume: unknown): void => {
        currentList?.destroy();
        currentList = null;
        container.textContent = '';
        current = createWindingController(container, deps, props, {
          level,
          patternId,
          sections,
          resume,
          tutorial: windingTutorial,
        });
      };

      // mode: 'job' は仕事の内容 (difficulty・sections・patternId) でプレイ画面を開く
      if (props.mode === 'job' && props.job !== undefined) {
        const job = props.job;
        startPlay(job.difficulty, job.patternId, job.sections, undefined);
        return wrap();
      }

      // 途中保存からの再開 (isValidResume を満たすときだけ。ペダルは controller で 0 にする)
      if (props.resume !== undefined && isValidResume(props.resume)) {
        const state = props.resume as WindingState;
        startPlay(state.level, state.patternId, state.sections, state);
        return wrap();
      }

      // 難易度の一覧を開く
      currentList = createListView(container, {
        records: deps.records,
        onSelect: (level: Level) => {
          startPlay(level, STANDALONE_PATTERN(level), SECTIONS(level), undefined);
        },
        onExit: () => props.onExit(),
      });

      return wrap();

      function wrap(): GameInstance {
        return {
          suspend(): unknown {
            return current !== null ? current.suspend() : null; // 一覧では途中保存しない
          },
          unmount(): void {
            if (current !== null) {
              current.unmount();
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
