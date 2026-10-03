import type { Records } from '../../core/game/records';
import { getContent } from '../../core/content/content';
import { createButton } from '../../core/ui/widgets';
import { createListRow, createPage, createScreenHeader, createSectionHeading } from '../../core/ui/layout';
import { createFabricSwatch } from '../../core/ui/fabricPreview';
import { SECTIONS, STANDALONE_PATTERN } from './params';

/** 押せない行の理由を出しておく時間 (ミリ秒) */
const NOTICE_MS = 3000;

/**
 * 難易度の一覧 (P2 T2-07)。節は「難易度」の1つに「初級」「中級」「上級」を1行ずつ並べる。
 * 選べるのは、クリア済みの難易度と、最初の未クリアの難易度 (「次はこれ」) まで。その先は鍵で、押すと理由が出る。
 */
export function createListView(parent: HTMLElement, opts: {
  records: Records;
  title?: string; // 見出しの行の題名 (ゲーム名)。無ければ「ドラム巻き」
  savedLevel?: 1 | 2 | 3 | null; // 途中の状態が保存されている難易度 (追加修正a)
  onSelect: (level: 1 | 2 | 3) => void;
  onTutorial?: () => void; // 右の「遊び方」。無ければ出さない
  onExit: () => void;
}): { destroy(): void } {
  const rec = opts.records.get('winding');

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

  const section = document.createElement('section');
  section.classList.add('list-section');
  section.appendChild(createSectionHeading('難易度', { underline: true }));
  const rows = document.createElement('div');
  rows.classList.add('list-rows');
  section.appendChild(rows);
  page.appendChild(section);

  const content = getContent();
  const levels: Array<{ level: 1 | 2 | 3; name: string }> = [
    { level: 1, name: '初級' },
    { level: 2, name: '中級' },
    { level: 3, name: '上級' },
  ];
  let firstUnclearedSeen = false;
  for (const { level, name } of levels) {
    const stars = rec.best[`level:${level}`] ?? 0;
    let status: Parameters<typeof createListRow>[0]['status'];
    if (stars > 0) {
      status = { kind: 'stars', stars: Math.min(3, stars) as 1 | 2 | 3 };
    } else if (!firstUnclearedSeen) {
      firstUnclearedSeen = true; // 最初の未クリアの難易度は押せる (次はこれ)
      status = { kind: 'next' };
    } else {
      status = { kind: 'locked', reason: '前のお題をクリアすると遊べます' };
    }
    const row = createListRow({
      swatch: createFabricSwatch(content.patterns.get(STANDALONE_PATTERN(level)), content),
      name,
      meta: `帯 ${SECTIONS(level)}本`,
      status,
      onClick: () => opts.onSelect(level),
      onLocked: showNotice,
    });
    row.dataset.testid = `winding-level-${level}`;
    // 途中の状態が保存されている難易度は「途中」を出す (追加修正a)
    if (opts.savedLevel === level) {
      const saved = document.createElement('span');
      saved.classList.add('list-row__saved');
      saved.textContent = '途中';
      row.insertBefore(saved, row.querySelector('.list-row__status'));
    }
    rows.appendChild(row);
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
