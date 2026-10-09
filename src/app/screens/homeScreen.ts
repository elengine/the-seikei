import type { AppContext } from '../context';
import type { Screen } from '../screenManager';
import { createButton } from '../../core/ui/widgets';
import { listGames } from '../../core/game/registry';
import { createCardArt, gameStatusText } from './homeCards';
import { isUpdateReady, onUpdateState } from '../updater';
import { onViewportChange } from '../../core/viewport/viewport';
import { createSectionHeading } from '../../core/ui/layout';
import type { GameId } from '../../core/game/types';

/**
 * まだ遊びの中身を調整している (まともに遊べない) ゲーム。ホームでは「開発中」の区切りの下に並ぶ。
 * 仕上がったら、ここから外すだけで区切りの上へ移る (並びは登録の順。PU-17a)
 */
export const DEV_GAMES: GameId[] = ['drumsetup', 'beaming', 'itowari'];

/** ゲームの id を、区切りの上 (main) と下 (dev) に分ける。それぞれ元の順 */
export function splitByDev(ids: GameId[], dev: GameId[] = DEV_GAMES): { main: GameId[]; dev: GameId[] } {
  return { main: ids.filter((id) => !dev.includes(id)), dev: ids.filter((id) => dev.includes(id)) };
}

/** 準備中のゲーム (名前は用語辞書の項目。無いものは固定の文字) */
const COMING_SOON: { termKey?: string; fixedName?: string; summary: string }[] = [
  { termKey: 'game.zukan', summary: '仕上げた柄を集めて眺める' },
];

/** 「準備中です」を出しておく時間 (ミリ秒) */
const NOTICE_MS = 2000;

/** 回転のあと、もう一度行の高さを計算し直すまでの待ち時間 (ミリ秒)。iPhone・iPad の
 *  Safari は回転直後の大きさの反映が遅れることがあるため、後から念のためもう1回行う */
const RELAYOUT_DELAY_MS = 150;

/**
 * カードの並び (grid) を一瞬隠して戻し、行の高さを強制的に計算し直させる。
 * iPhone・iPad の Safari は回転のあとにグリッドの行の高さを計算し直さないことがあり、
 * カードの下に余白が残る (T1-22c)。隠すと戻すは同じ処理の中で行うので、
 * 画面に描かれる間の状態は無い。
 */
export function relayoutGrid(grid: HTMLElement): void {
  grid.style.display = 'none';
  void grid.offsetHeight; // 高さを読むことで、この時点で強制的に計算させる
  grid.style.display = '';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, ...classes: string[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.classList.add(...classes);
  return e;
}

/** ホーム画面。屋号とアプリ名、ゲームのカード (登録済みと準備中)、設定への入り口 */
export function createHomeScreen(ctx: AppContext): Screen {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let offUpdate: (() => void) | null = null;
  let offViewport: (() => void) | null = null;
  let gamesEl: HTMLElement | null = null;

  function card(opts: {
    kind: 'creel' | 'drumsetup' | 'winding' | 'beaming' | 'itowari' | 'soon';
    name: string;
    summary: string;
    status: string;
    dev?: boolean;
    onClick: () => void;
  }): HTMLButtonElement {
    const btn = el('button', 'game-card');
    btn.type = 'button';
    if (opts.kind === 'soon') {
      btn.classList.add('game-card--soon');
    }
    btn.appendChild(createCardArt(opts.kind));
    if (opts.dev === true) {
      const tag = el('span', 'game-card__dev'); // 右上の札。文字つき (色だけに頼らない)
      tag.textContent = '開発中';
      btn.appendChild(tag);
    }
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
      // 版の番号は題名の列から出して、見出しの下に画面の幅いっぱいの行で出す (T1-21b)。
      // 版の番号の部分と日付の部分はそれぞれ折り返さない (「(」の前でだけ折り返す)
      const version = el('p', 'home__version');
      const built = new Date(__BUILD_ID__); // ビルドの時刻 (ISO)。日付はこの端末の時刻で出す (時刻は出さない)
      const pad2 = (n: number): string => String(n).padStart(2, '0');
      const day = Number.isNaN(built.getTime())
        ? __BUILD_ID__.slice(0, 10)
        : `${built.getFullYear()}-${pad2(built.getMonth() + 1)}-${pad2(built.getDate())}`;
      const vNum = el('span', 'home__version-num');
      vNum.textContent = `バージョン ${__APP_VERSION__}`;
      const vDate = el('span', 'home__version-date');
      vDate.textContent = ` (${day})`;
      version.appendChild(vNum);
      version.appendChild(vDate);
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
        shape: 'circle', // 丸いアイコンだけ (文字は出さない。縦長の画面でも折り返さない)
        onClick: () => ctx.navigate('/settings'),
      });
      header.appendChild(settingsBtn);
      header.appendChild(version); // 版の行は幅いっぱい (flex-wrap で題名の下の行になる。T1-21b)
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
          settingsBtn.setAttribute('aria-label', '設定');
        }
      };
      applyBadge(isUpdateReady());
      offUpdate?.();
      offUpdate = onUpdateState(applyBadge);
      root.appendChild(header);

      // 下: ゲームのカード
      const games = el('div', 'home__games');
      const modules = listGames();
      const { main: mainIds } = splitByDev(modules.map((m) => m.id));
      const addGame = (m: (typeof modules)[number], dev: boolean): void => {
        games.appendChild(
          card({
            dev,
            kind:
              m.id === 'winding'
                ? 'winding'
                : m.id === 'beaming'
                  ? 'beaming'
                  : m.id === 'itowari'
                    ? 'itowari'
                    : m.id === 'drumsetup'
                      ? 'drumsetup'
                      : 'creel',
            name: ctx.terms.t(m.titleTermKey),
            summary: m.summary ?? '',
            status: gameStatusText(m.id),
            onClick: () => ctx.navigate(`/games/${m.id}`),
          }),
        );
      };
      for (const m of modules.filter((x) => mainIds.includes(x.id))) {
        addGame(m, false);
      }
      // 「開発中」の区切り (行全体) と、その下のカード (開発中のゲームと準備中)。設定で出し入れする (既定は出さない。PU-31)
      if (ctx.settings.get().showDevGames) {
        const dev = el('div', 'home__dev');
        dev.appendChild(createSectionHeading('開発中'));
        const devNote = el('p', 'home__dev-note');
        devNote.textContent = '遊びの中身を調整しています';
        dev.appendChild(devNote);
        games.appendChild(dev);
        for (const m of modules.filter((x) => !mainIds.includes(x.id))) {
          addGame(m, true);
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
      }
      root.appendChild(games);
      gamesEl = games;
      // 大きさが変わるたび (回転を含む) に、行の高さを強制的に計算し直させる (T1-22c)。
      // 回転直後は大きさの反映が遅れることがあるので、少し後にもう1回行う
      offViewport?.();
      offViewport = onViewportChange(() => {
        if (gamesEl === null) {
          return;
        }
        relayoutGrid(gamesEl);
        const t = setTimeout(() => {
          timers.delete(t);
          if (gamesEl !== null) {
            relayoutGrid(gamesEl);
          }
        }, RELAYOUT_DELAY_MS);
        timers.add(t);
      });

      container.textContent = '';
      container.appendChild(root);
    },

    unmount(): void {
      offUpdate?.();
      offUpdate = null;
      offViewport?.();
      offViewport = null;
      gamesEl = null;
      for (const t of timers) {
        clearTimeout(t);
      }
      timers.clear();
    },
  };
}
