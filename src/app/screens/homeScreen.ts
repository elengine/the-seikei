import type { AppContext } from '../context';
import type { Screen } from '../screenManager';
import { createButton } from '../../core/ui/widgets';
import { listGames } from '../../core/game/registry';
import { createCardArt, gameStatusText } from './homeCards';
import { isUpdateReady, onUpdateState } from '../updater';

/** 準備中のゲーム (名前は用語辞書の項目。無いものは固定の文字) */
const COMING_SOON: { termKey?: string; fixedName?: string; summary: string }[] = [
  { fixedName: '糸割り', summary: '決まった長さずつ巻き分ける' },
  { termKey: 'game.beaming', summary: 'ドラムからビームへ巻き返す' },
  { termKey: 'game.zukan', summary: '仕上げた柄を集めて眺める' },
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
  let offUpdate: (() => void) | null = null;

  function card(opts: {
    kind: 'creel' | 'drumsetup' | 'winding' | 'soon';
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
      app.textContent = '整経屋の一日';
      titles.appendChild(app);
      // 題名の下に、版の番号を小さく (アプリの版とビルドの日付)
      const version = el('p', 'home__version');
      const built = new Date(__BUILD_ID__); // ビルドの時刻 (ISO)。日付と時刻 (分まで) はこの端末の時刻で出す
      const pad2 = (n: number): string => String(n).padStart(2, '0');
      const day = Number.isNaN(built.getTime())
        ? __BUILD_ID__.slice(0, 10)
        : `${built.getFullYear()}-${pad2(built.getMonth() + 1)}-${pad2(built.getDate())} ${pad2(built.getHours())}:${pad2(built.getMinutes())}`;
      version.textContent = `バージョン ${__APP_VERSION__}(${day})`;
      titles.appendChild(version);
      const playerName = ctx.settings.get().playerName;
      if (playerName !== '') {
        const greeting = el('p', 'home__greeting');
        greeting.textContent = `${playerName}さん、こんにちは`;
        titles.appendChild(greeting);
      }
      header.appendChild(titles);
      const settingsBtn = createButton({
        label: '設定',
        variant: 'secondary',
        icon: 'settings',
        onClick: () => ctx.navigate('/settings'),
      });
      header.appendChild(settingsBtn);
      // 新しい版が届いていれば、「設定」に朱の小さな丸 (バッジ) を付ける (設定の画面で「アップデートがあります。」を出す)
      const applyBadge = (ready: boolean): void => {
        settingsBtn.querySelector('.btn__badge')?.remove();
        if (ready) {
          const badge = el('span', 'btn__badge');
          badge.setAttribute('aria-hidden', 'true');
          badge.textContent = '!';
          settingsBtn.appendChild(badge);
          settingsBtn.setAttribute('aria-label', '設定(アップデートがあります)');
        } else {
          settingsBtn.removeAttribute('aria-label');
        }
      };
      applyBadge(isUpdateReady());
      offUpdate?.();
      offUpdate = onUpdateState(applyBadge);
      root.appendChild(header);

      // 下: ゲームのカード
      const games = el('div', 'home__games');
      for (const m of listGames()) {
        games.appendChild(
          card({
            kind:
              m.id === 'winding'
                ? 'winding'
                : m.id === 'drumsetup'
                  ? 'drumsetup'
                  : 'creel',
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
      offUpdate?.();
      offUpdate = null;
      for (const t of timers) {
        clearTimeout(t);
      }
      timers.clear();
    },
  };
}
