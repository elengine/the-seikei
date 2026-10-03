import type { Records } from '../../core/game/records';
import type { Content as ContentData } from '../../core/content/content';
import { getContent } from '../../core/content/content';
import { createButton } from '../../core/ui/widgets';
import { createListRow, createPage, createScreenHeader, createSectionHeading } from '../../core/ui/layout';
import { createFabricSwatch } from '../../core/ui/fabricPreview';
import { windingPuzzles } from './puzzles';
import { feelLabel } from './puzzles';
import type { WindingPuzzle } from './puzzles';

/** 押せない行の理由を出しておく時間 (ミリ秒) */
const NOTICE_MS = 3000;

/**
 * お題一覧 (T2-14a)。クリール立てと同じ柄のお題15題を、段階ごとの節に並べる。
 * 選べるのは、クリア済みのお題と、最初の未クリアのお題 (「次はこれ」) まで。その先は鍵で、押すと理由が出る。
 * 補足は「帯 N本」。クリール立てで同じお題をクリアしていれば「クリール立て済み」を添える (遊べるかには関係しない)。
 */
export function createListView(parent: HTMLElement, opts: {
  records: Records;
  content?: ContentData;
  title?: string; // 見出しの行の題名 (ゲーム名)。無ければ「ドラム巻き」
  savedPuzzleId?: string | null; // 途中の状態が保存されているお題 (T1-15 と同じ)
  onSelect: (puzzleId: string) => void;
  onTutorial?: () => void; // 右の「遊び方」。無ければ出さない
  onExit: () => void;
}): { destroy(): void } {
  const content = opts.content ?? getContent();
  const rec = opts.records.get('winding');
  const creelRec = opts.records.get('creel');
  const puzzles: WindingPuzzle[] = windingPuzzles(content);

  const root = document.createElement('div');
  root.classList.add('winding-list', 'list-screen');

  const right =
    opts.onTutorial !== undefined
      ? createButton({ label: '遊び方', variant: 'secondary', icon: 'help', shape: 'circle', testId: 'winding-list-tutorial', onClick: opts.onTutorial })
      : undefined;
  const header = createScreenHeader({ title: opts.title ?? 'ドラム巻き', onBack: opts.onExit, right });
  header.querySelector<HTMLElement>('.screen-header__left button')?.setAttribute('data-testid', 'winding-list-back');
  root.appendChild(header);

  const page = createPage({ width: 'list' });
  const notice = document.createElement('p');
  notice.classList.add('list-notice');
  notice.setAttribute('role', 'status');
  page.appendChild(notice);
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  const showNotice = (text: string): void => {
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
      section.appendChild(createSectionHeading(`段階${puzzle.stage}`, { underline: true }));
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
    // 補足: 帯の数と手応え。クリール立てで同じお題をクリアしていれば「クリール立て済み」を添える
    const creelCleared = (creelRec.best[`puzzle:${puzzle.id}`] ?? 0) > 0;
    const feel = feelLabel(puzzle.feel);
    const meta = `帯 ${puzzle.sections}本${feel !== '' ? `・${feel}` : ''}${creelCleared ? '・クリール立て済み' : ''}`;
    const row = createListRow({
      swatch: createFabricSwatch(pattern, content),
      name: puzzle.name,
      meta,
      status,
      onClick: () => opts.onSelect(puzzle.id),
      onLocked: showNotice,
    });
    row.dataset.testid = `winding-puzzle-${puzzle.id}`;
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
