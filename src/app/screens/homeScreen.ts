import type { AppContext } from '../context';
import type { Screen } from '../screenManager';
import { createButton } from '../../core/ui/widgets';
import { listGames } from '../../core/game/registry';

/** ホーム画面。屋号の挨拶、ゲーム一覧 (P0 では準備中)、設定への入り口 */
export function createHomeScreen(ctx: AppContext): Screen {
  return {
    mount(container: HTMLElement): void {
      const root = document.createElement('div');
      root.classList.add('home');

      const header = document.createElement('header');
      header.classList.add('home__header');
      const shop = document.createElement('h1');
      shop.classList.add('home__shop');
      shop.textContent = ctx.settings.get().shopName;
      header.appendChild(shop);
      const name = ctx.settings.get().playerName;
      if (name !== '') {
        const greeting = document.createElement('p');
        greeting.classList.add('home__greeting');
        greeting.textContent = `${name}さん、こんにちは`;
        header.appendChild(greeting);
      }
      root.appendChild(header);

      const games = document.createElement('div');
      games.classList.add('home__games');
      const registered = listGames();
      if (registered.length === 0) {
        const notice = document.createElement('p');
        notice.classList.add('home__notice');
        notice.textContent = 'ゲームはただいま準備中です';
        games.appendChild(notice);
      } else {
        // 登録済みゲームごとに大きな主ボタン (題名は terms から引く)
        for (const m of registered) {
          const btn = createButton({
            label: ctx.terms.t(m.titleTermKey),
            variant: 'primary',
            onClick: () => {
              ctx.audio.play('tap');
            },
          });
          games.appendChild(btn);
        }
      }
      root.appendChild(games);

      const footer = document.createElement('footer');
      footer.classList.add('home__footer');
      const settingsBtn = createButton({
        label: 'せってい',
        variant: 'secondary',
        onClick: () => {
          ctx.audio.play('tap');
          ctx.navigate('/settings');
        },
      });
      footer.appendChild(settingsBtn);
      root.appendChild(footer);

      container.textContent = '';
      container.appendChild(root);
    },

    unmount(): void {
      // root は container ごと取り除かれる
    },
  };
}
