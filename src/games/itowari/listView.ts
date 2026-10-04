import type { Records } from '../../core/game/records';
import type { Content as ContentData } from '../../core/content/content';
import { getContent } from '../../core/content/content';
import { createButton } from '../../core/ui/widgets';
import { createListRow, createPage, createScreenHeader, createSectionHeading } from '../../core/ui/layout';
import { createFabricSwatch } from '../../core/ui/fabricPreview';
import { itowariPuzzles } from './puzzles';
import type { ItowariPuzzle } from './puzzles';

/** 押せない行の理由を出しておく時間 (ミリ秒) */
const NOTICE_MS = 3000;

/** 節の見出しの下の場面の名前 (レベル1〜2・レベル3〜5) */
export function sceneName(level: number): string {
  return level <= 2 ? 'チーズを分ける' : '足りないコーンを作る';
}

/** 行の補足 (split はチーズの数、refill は残りと要る長さ) */
export function rowMeta(puzzle: ItowariPuzzle): string {
  if (puzzle.kind === 'split') {
    return `チーズ ${puzzle.sources.length} 個 → ${puzzle.needCount} 本`;
  }
  return `残り ${puzzle.sources.length} 本 → ${puzzle.needCount} 本・あと ${puzzle.needM.toLocaleString('en-US')}m`;
}

/**
 * 糸割りのお題一覧 (P2b T2b-04)。クリール立てと同じ柄のお題15題を、レベルごとの節に並べる。
 * 選べるのは、クリア済みのお題と、最初の未クリアのお題 (「次はこれ」) まで。その先は鍵で、押すと理由が出る。
 */
export function createListView(parent: HTMLElement, opts: {
  records: Records;
  content?: ContentData;
  title?: string;
  savedPuzzleId?: string | null;
  onSelect: (puzzleId: string) => void;
  onTutorial?: () => void;
  onExit: () => void;
}): { destroy(): void } {
  const content = opts.content ?? getContent();
  const rec = opts.records.get('itowari');
  const puzzles: ItowariPuzzle[] = itowariPuzzles(content);

  const root = document.createElement('div');
  root.classList.add('itowari-list', 'list-screen');

  const right =
    opts.onTutorial !== undefined
      ? createButton({ label: '遊び方', variant: 'secondary', icon: 'help', shape: 'circle', testId: 'itowari-list-tutorial', onClick: opts.onTutorial })
      : undefined;
  const header = createScreenHeader({ title: opts.title ?? '糸割り', onBack: opts.onExit, right });
  header.querySelector<HTMLElement>('.screen-header__left button')?.setAttribute('data-testid', 'itowari-list-back');
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

  // レベルごとの節 (お題はレベルの昇順に並んでいる)。見出しの下に場面の名前
  let firstUnclearedSeen = false;
  let rows: HTMLElement | null = null;
  let currentLevel = -1;
  for (const puzzle of puzzles) {
    if (puzzle.level !== currentLevel) {
      currentLevel = puzzle.level;
      const section = document.createElement('section');
      section.classList.add('list-section');
      section.appendChild(createSectionHeading(`レベル${puzzle.level}`, { underline: true }));
      const scene = document.createElement('p');
      scene.classList.add('itowari-list__scene');
      scene.textContent = sceneName(puzzle.level);
      section.appendChild(scene);
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
    const row = createListRow({
      swatch: createFabricSwatch(pattern, content),
      name: puzzle.name,
      meta: rowMeta(puzzle),
      status,
      onClick: () => opts.onSelect(puzzle.id),
      onLocked: showNotice,
    });
    row.dataset.testid = `itowari-puzzle-${puzzle.id}`;
    // 途中の状態が保存されているお題は「途中」を出す
    if (opts.savedPuzzleId === puzzle.id) {
      row.dataset.saved = '1';
    }
    rows!.appendChild(row);
  }

  root.appendChild(page);
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
