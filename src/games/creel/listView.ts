import type { Content } from '../../core/content/content';
import type { Records } from '../../core/game/records';
import { getContent } from '../../core/content/content';
import { createButton } from '../../core/ui/widgets';
import { createListRow, createPage, createScreenHeader, createSectionHeading } from '../../core/ui/layout';
import { createFabricSwatch } from '../../core/ui/fabricPreview';

/** 押せない行の理由を出しておく時間 (ミリ秒) */
const NOTICE_MS = 3000;

/**
 * お題一覧。段階ごとの節に、お題を1行ずつ並べる。
 * 選べるのは、クリア済みのお題と、最初の未クリアのお題 (「次はこれ」) まで。その先は鍵で、押すと理由が出る。
 */
export function createListView(parent: HTMLElement, opts: {
  records: Records;
  content?: Content;
  title?: string; // 見出しの行の題名 (ゲーム名)。無ければ「クリール立て」
  savedPuzzleId?: string | null; // 途中の状態が保存されているお題 (T1-15)
  unlockAll?: boolean; // true なら鍵のお題も押せる (管理者メニュー。PU-18)
  onSelect: (puzzleId: string) => void;
  onTutorial?: () => void; // 右の「遊び方」。無ければ出さない
  onExit: () => void;
}): { destroy(): void } {
  const content = opts.content ?? getContent();
  const rec = opts.records.get('creel');

  const root = document.createElement('div');
  root.classList.add('creel-list', 'list-screen');

  const right =
    opts.onTutorial !== undefined
      ? createButton({ label: '遊び方', variant: 'secondary', icon: 'help', shape: 'circle', testId: 'creel-list-tutorial', onClick: opts.onTutorial })
      : undefined;
  const header = createScreenHeader({ title: opts.title ?? 'クリール立て', onBack: opts.onExit, right });
  header.querySelector<HTMLElement>('.screen-header__left button')?.setAttribute('data-testid', 'creel-list-back');
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

  // 段階ごとの節 (段階の順)。段階の名前は内容のデータに無いので「段階N」
  let firstUnclearedSeen = false;
  let rows: HTMLElement | null = null;
  let currentStage = -1;
  for (const puzzle of content.creelPuzzles) {
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
      status = opts.unlockAll === true ? { kind: 'open' } : { kind: 'locked', reason: '前のお題をクリアすると遊べます' };
    }
    const row = createListRow({
      swatch: createFabricSwatch(pattern, content),
      name: pattern?.name ?? puzzle.patternId,
      meta: `${puzzle.rows}段×${puzzle.cols}本`,
      status,
      onClick: () => opts.onSelect(puzzle.id),
      onLocked: showNotice,
    });
    row.dataset.testid = `creel-puzzle-${puzzle.id}`;
    // 途中の状態が保存されているお題は「途中」を出す (T1-15)
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
