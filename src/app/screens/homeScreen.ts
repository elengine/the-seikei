import type { AppContext } from '../context';
import type { Screen } from '../screenManager';
import { createButton } from '../../core/ui/widgets';
import { listGames } from '../../core/game/registry';
import { createCardArt, gameStatusText } from './homeCards';

/** 準備中のゲーム (名前は用語辞書の項目。無いものは固定の文字) */
const COMING_SOON: { termKey?: string; fixedName?: string; summary: string }[] = [
  { fixedName: '糸割り', summary: 'コーンの本数と長さを合わせる' },
  { termKey: 'game.beaming', summary: 'ドラムの糸をビームに巻き返す' },
  { termKey: 'game.shop', summary: '注文を受けて一日を切り盛りする' },
  { termKey: 'game.zukan', summary: '集めた柄を見返す' },
];

/** 「準備中です」を出しておく時間 (ミリ秒) */
const NOTICE_MS = 2000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, ...classes: string[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.classList.add(...classes);
  return e;
}

/** ホーム画面。屋号とアプリ名、ゲームのカード (登録済みと準備中)、設定への入り口 */
export function createHomeScreen(ctx: AppContext): Screen {
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function card(opts: {
    kind: 'creel' | 'winding' | 'soon';
    name: string;
    summary: string;
    status: string;
    onClick: () => void;
  }): HTMLButtonElement {
    const btn = el('button', 'game-card');
    btn.type = 'button';
    if (opts.kind === 'soon') {
      btn.classList.add('game-card--soon');
    }
    btn.appendChild(createCardArt(opts.kind));
    const name = el('span', 'game-card__name', 'font-heading');
    name.textContent = opts.name;
    btn.appendChild(name);
    const summary = el('span', 'game-card__summary');
    summary.textContent = opts.summary;
    btn.appendChild(summary);
    const status = el('span', 'game-card__status');
    status.textContent = opts.status;
    btn.appendChild(status);
    btn.addEventListener('click', opts.onClick);
    return btn;
  }

  return {
    mount(container: HTMLElement): void {
      const root = el('div', 'home');
      root.appendChild(el('div', 'stripe-top'));

      // 上: 屋号 (小)・アプリ名・挨拶。右に「設定」
      const header = el('header', 'home__header');
      const titles = el('div', 'home__titles');
      const shopName = ctx.settings.get().shopName;
      if (shopName !== '') {
        const shop = el('p', 'home__shop');
        shop.textContent = shopName;
        titles.appendChild(shop);
      }
      const app = el('h1', 'home__app', 'font-heading');
      app.textContent = '整経ゲーム';
      titles.appendChild(app);
      const playerName = ctx.settings.get().playerName;
      if (playerName !== '') {
        const greeting = el('p', 'home__greeting');
        greeting.textContent = `${playerName}さん、こんにちは`;
        titles.appendChild(greeting);
      }
      header.appendChild(titles);
      header.appendChild(
        createButton({
          label: '設定',
          variant: 'secondary',
          icon: 'settings',
          onClick: () => ctx.navigate('/settings'),
        }),
      );
      root.appendChild(header);

      // 下: ゲームのカード
      const games = el('div', 'home__games');
      for (const m of listGames()) {
        games.appendChild(
          card({
            kind: m.id === 'winding' ? 'winding' : 'creel',
            name: ctx.terms.t(m.titleTermKey),
            summary: m.summary ?? '',
            status: gameStatusText(m.id),
            onClick: () => ctx.navigate(`/games/${m.id}`),
          }),
        );
      }
      for (const s of COMING_SOON) {
        const btn: HTMLButtonElement = card({
          kind: 'soon',
          name: s.termKey !== undefined ? ctx.terms.t(s.termKey) : (s.fixedName ?? ''),
          summary: s.summary,
          status: '準備中',
          onClick: () => {
            if (btn.querySelector('.game-card__notice') !== null) {
              return;
            }
            const notice = el('span', 'game-card__notice');
            notice.textContent = '準備中です';
            btn.appendChild(notice);
            const t = setTimeout(() => {
              timers.delete(t);
              notice.remove();
            }, NOTICE_MS);
            timers.add(t);
          },
        });
        games.appendChild(btn);
      }
      root.appendChild(games);

      container.textContent = '';
      container.appendChild(root);
    },

    unmount(): void {
      for (const t of timers) {
        clearTimeout(t);
      }
      timers.clear();
    },
  };
}
