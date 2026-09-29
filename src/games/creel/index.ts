import type { GameDeps, GameModule, GameProps, GameInstance } from '../../core/game/types';
import { getContent } from '../../core/content/content';
import { createListView } from './listView';
import { createController } from './controller';
import { creelTutorial } from './tutorial';
import { isValidResume } from './logic';

/**
 * クリール立てのゲームモジュール。
 * mount すると、resume が有効ならプレイ画面、それ以外はお題一覧を開く。
 */
export function createCreelModule(deps: GameDeps): GameModule {
  return {
    id: 'creel',
    titleTermKey: 'game.creel',
    phase: 'P1',
    embeddable: true,
    tutorial: creelTutorial,

    mount(container: HTMLElement, props: GameProps): GameInstance {
      const content = getContent();

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

      // 途中保存からの再開 (isValidResume を満たすときだけ)
      if (props.resume !== undefined && isValidResume(props.resume, content)) {
        return createController(container, deps, props, {
          puzzleId: props.resume.puzzleId,
          resume: props.resume,
          content,
          tutorial: creelTutorial,
        });
      }

      // お題一覧を開く (お題一覧のあいだは途中保存を消しておく)
      props.onStateChange?.(null);
      container.textContent = '';
      const list = createListView(container, {
        records: deps.records,
        content,
        onSelect: (puzzleId: string) => {
          // お題が選ばれたら一覧を消してプレイ画面に切り替える
          list.destroy();
          const instance = createController(container, deps, props, {
            puzzleId,
            content,
            tutorial: creelTutorial,
          });
          current = instance;
        },
        onExit: () => props.onExit(),
      });
      let current: GameInstance | null = null; // プレイ中のコントローラ (お題一覧のあいだは null)
      return {
        suspend(): unknown {
          return current !== null ? current.suspend() : null; // お題一覧では途中保存しない
        },
        unmount(): void {
          if (current !== null) {
            current.unmount(); // プレイ中なら片付ける
            current = null;
          }
          list.destroy();
        },
      };
    },
  };
}
