import type { Content } from '../../core/content/content';
import type { Records } from '../../core/game/records';
import { getContent } from '../../core/content/content';

/**
 * お題一覧。段階の順に大きなボタンで並べる。
 * 選べるのは、クリア済みのお題と、最初の未クリアのお題まで。その先は「未解放」で押せない。
 */
export function createListView(parent: HTMLElement, opts: {
  records: Records;
  content?: Content;
  onSelect: (puzzleId: string) => void;
  onExit: () => void;
}): { destroy(): void } {
  const content = opts.content ?? getContent();
  const rec = opts.records.get('creel');

  const root = document.createElement('div');
  root.classList.add('creel-list');

  // 見出しと「戻る」
  const header = document.createElement('div');
  header.classList.add('creel-list__header');
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.textContent = '戻る';
  backBtn.classList.add('btn', 'btn--secondary');
  backBtn.dataset.testid = 'creel-list-back';
  backBtn.addEventListener('click', () => opts.onExit());
  const title = document.createElement('h1');
  title.classList.add('creel-list__title');
  title.textContent = 'お題を選ぶ';
  header.appendChild(backBtn);
  header.appendChild(title);
  root.appendChild(header);

  // お題のボタン (段階の順)
  const list = document.createElement('div');
  list.classList.add('creel-list__items');
  let firstUnclearedSeen = false;
  for (const puzzle of content.creelPuzzles) {
    const stars = rec.best[`puzzle:${puzzle.id}`] ?? 0;
    const cleared = stars > 0;
    const pattern = content.patterns.get(puzzle.patternId);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.classList.add('creel-list__item');
    btn.dataset.testid = `creel-puzzle-${puzzle.id}`;

    const stage = document.createElement('span');
    stage.classList.add('creel-list__stage');
    stage.textContent = `段階 ${puzzle.stage}`;
    const name = document.createElement('span');
    name.classList.add('creel-list__name');
    name.textContent = pattern?.name ?? puzzle.patternId;
    const size = document.createElement('span');
    size.classList.add('creel-list__size');
    size.textContent = `${puzzle.rows}段 × ${puzzle.cols}本`;
    const starLabel = document.createElement('span');
    starLabel.classList.add('creel-list__stars');
    if (cleared) {
      starLabel.textContent = '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars));
    }

    btn.appendChild(stage);
    btn.appendChild(name);
    btn.appendChild(size);
    btn.appendChild(starLabel);

    if (cleared) {
      btn.addEventListener('click', () => opts.onSelect(puzzle.id));
    } else if (!firstUnclearedSeen) {
      // 最初の未クリアのお題は押せる
      firstUnclearedSeen = true;
      btn.addEventListener('click', () => opts.onSelect(puzzle.id));
    } else {
      // その先は「未解放」
      btn.disabled = true;
      const still = document.createElement('span');
      still.classList.add('creel-list__locked');
      still.textContent = '未解放';
      btn.appendChild(still);
    }
    list.appendChild(btn);
  }
  root.appendChild(list);
  parent.textContent = '';
  parent.appendChild(root);

  return {
    destroy(): void {
      root.remove();
    },
  };
}
