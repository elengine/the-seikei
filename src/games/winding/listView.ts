import type { Records } from '../../core/game/records';
import { SECTIONS } from './params';

/**
 * 難易度の一覧 (P2 T2-07)。
 * 「初級」「中級」「上級」の大きなボタン。選べるのは、クリア済みの難易度と、
 * 最初の未クリアの難易度まで。その先は「未解放」で押せない。
 */
export function createListView(parent: HTMLElement, opts: {
  records: Records;
  onSelect: (level: 1 | 2 | 3) => void;
  onExit: () => void;
}): { destroy(): void } {
  const rec = opts.records.get('winding');

  const root = document.createElement('div');
  root.classList.add('winding-list');

  // 見出しと「戻る」
  const header = document.createElement('div');
  header.classList.add('creel-list__header'); // 配置はクリール立ての一覧と同じ形を使う
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.textContent = '戻る';
  backBtn.classList.add('btn', 'btn--secondary');
  backBtn.dataset.testid = 'winding-list-back';
  backBtn.addEventListener('click', () => opts.onExit());
  const title = document.createElement('h1');
  title.classList.add('creel-list__title');
  title.textContent = '難易度を選ぶ';
  header.appendChild(backBtn);
  header.appendChild(title);
  root.appendChild(header);

  // 難易度のボタン
  const list = document.createElement('div');
  list.classList.add('creel-list__items');
  const levels: Array<{ level: 1 | 2 | 3; name: string }> = [
    { level: 1, name: '初級' },
    { level: 2, name: '中級' },
    { level: 3, name: '上級' },
  ];
  let firstUnclearedSeen = false;
  for (const { level, name } of levels) {
    const stars = rec.best[`level:${level}`] ?? 0;
    const cleared = stars > 0;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.classList.add('creel-list__item');
    btn.dataset.testid = `winding-level-${level}`;

    const label = document.createElement('span');
    label.classList.add('creel-list__stage');
    label.textContent = name;
    const size = document.createElement('span');
    size.classList.add('creel-list__size');
    size.textContent = `帯 ${SECTIONS(level)}本`;
    const starLabel = document.createElement('span');
    starLabel.classList.add('creel-list__stars');
    if (cleared) {
      starLabel.textContent = '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars));
    }

    btn.appendChild(label);
    btn.appendChild(size);
    btn.appendChild(starLabel);
    if (cleared) {
      btn.addEventListener('click', () => opts.onSelect(level));
    } else if (!firstUnclearedSeen) {
      // 最初の未クリアの難易度は押せる
      firstUnclearedSeen = true;
      btn.addEventListener('click', () => opts.onSelect(level));
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
