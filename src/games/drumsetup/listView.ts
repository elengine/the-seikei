import type { Records } from '../../core/game/records';
import type { Content as ContentData } from '../../core/content/content';
import { getContent } from '../../core/content/content';
import { createButton } from '../../core/ui/widgets';
import { createListRow, createPage, createScreenHeader, createSectionHeading } from '../../core/ui/layout';
import { createFabricSwatch } from '../../core/ui/fabricPreview';
import { drumSetupPuzzles } from './puzzles';
import type { DrumSetupPuzzle } from './puzzles';

/** 押せない行の理由を出しておく時間 (ミリ秒) */
const NOTICE_MS = 3000;

/**
 * お題一覧 (T2c-03b)。クリール立てと同じ柄のお題15題を、段階ごとの節に並べる。
 * 解放の決まりはドラム巻きと同じ:選べるのは、クリア済みのお題と、最初の未クリアのお題 (「次はこれ」)。
 * 補足は「2/48・帯 400本」。クリール立てで同じお題をクリアしていれば「クリール立て済み」を添える。
 */
export function createListView(parent: HTMLElement, opts: {
  records: Records;
  content?: ContentData;
  title?: string; // 見出しの行の題名 (ゲーム名)。無ければ「ドラム設定」
  savedPuzzleId?: string | null; // 途中の状態が保存されているお題 (T1-15 と同じ)
  onSelect: (puzzleId: string) => void;
  onTutorial?: () => void; // 右の「遊び方」。無ければ出さない
  onNotice?: (text: string) => void; // 鍵の理由の出し方 (テストで受け取る。無ければ行内に出す)
  onExit: () => void;
}): { destroy(): void } {
  const content = opts.content ?? getContent();
  const rec = opts.records.get('drumsetup');
  const creelRec = opts.records.get('creel');
  const puzzles: DrumSetupPuzzle[] = drumSetupPuzzles(content);

  const root = document.createElement('div');
  root.classList.add('drumsetup-list', 'list-screen');

  const right =
    opts.onTutorial !== undefined
      ? createButton({ label: '遊び方', variant: 'secondary', icon: 'help', shape: 'circle', testId: 'drumsetup-list-tutorial', onClick: opts.onTutorial })
      : undefined;
  const header = createScreenHeader({ title: opts.title ?? 'ドラム設定', onBack: opts.onExit, right });
  header.querySelector<HTMLElement>('.screen-header__left button')?.setAttribute('data-testid', 'drumsetup-list-back');
  root.appendChild(header);

  const page = createPage({ width: 'list' });
  const notice = document.createElement('p');
  notice.classList.add('list-notice');
  notice.setAttribute('role', 'status');
  page.appendChild(notice);
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  const showNotice = (text: string): void => {
    if (opts.onNotice !== undefined) {
      opts.onNotice(text);
      return;
    }
    notice.textContent = text;
    if (noticeTimer !== null) {
      clearTimeout(noticeTimer);
    }
    noticeTimer = setTimeout(() => {
      noticeTimer = null;
      notice.textContent = '';
    }, NOTICE_MS);
  };

  // 段階ごとの節 (お題は段階の昇順に並んでいる)
  let firstUnclearedSeen = false;
  let rows: HTMLElement | null = null;
  let currentStage = -1;
  for (const puzzle of puzzles) {
    if (puzzle.stage !== currentStage) {
      currentStage = puzzle.stage;
      const section = document.createElement('section');
      section.classList.add('list-section');
      section.appendChild(createSectionHeading(`レベル${puzzle.stage}`, { underline: true }));
      rows = document.createElement('div');
      rows.classList.add('list-rows');
      section.appendChild(rows);
      page.appendChild(section);
    }
    const stars = rec.best[`puzzle:${puzzle.id}`] ?? 0;
    const pattern = content.patterns.get(puzzle.patternId);
    let status: Parameters<typeof createListRow>[0]['status'];
    if (stars > 0) {
      status = { kind: 'stars', stars: Math.min(3, stars) as 1 | 2 | 3 };
    } else if (!firstUnclearedSeen) {
      firstUnclearedSeen = true; // 最初の未クリアのお題は押せる (次はこれ)
      status = { kind: 'next' };
    } else {
      status = { kind: 'locked', reason: '前のお題をクリアすると遊べます' };
    }
    // 補足: 番手と帯の本数。クリール立てで同じお題をクリアしていれば「クリール立て済み」を添える
    const creelCleared = (creelRec.best[`puzzle:${puzzle.id}`] ?? 0) > 0;
    const meta = `${puzzle.grade}・帯 ${puzzle.ends}本${creelCleared ? '・クリール立て済み' : ''}`;
    const row = createListRow({
      swatch: createFabricSwatch(pattern, content),
      name: puzzle.name,
      meta,
      status,
      onClick: () => opts.onSelect(puzzle.id),
      onLocked: showNotice,
    });
    row.dataset.testid = `drumsetup-puzzle-${puzzle.id}`;
    // 途中の状態が保存されているお題は「途中」を出す (T1-15 と同じ)
    if (opts.savedPuzzleId === puzzle.id) {
      const saved = document.createElement('span');
      saved.classList.add('list-row__saved');
      saved.textContent = '途中';
      row.insertBefore(saved, row.querySelector('.list-row__status'));
    }
    rows?.appendChild(row);
  }
  root.appendChild(page);
  parent.textContent = '';
  parent.appendChild(root);

  return {
    destroy(): void {
      if (noticeTimer !== null) {
        clearTimeout(noticeTimer);
        noticeTimer = null;
      }
      root.remove();
    },
  };
}
