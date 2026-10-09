import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHomeScreen } from './homeScreen';
import { createCardArt } from './homeCards';
import type { AppContext } from '../context';
import type { GameModule } from '../../core/game/types';
import { registerGame, clearGamesForTest } from '../../core/game/registry';
// アップデートの確認 (updater) は偽物にする。Service Worker は使わない
const upd = vi.hoisted(() => ({
  ready: false,
  listeners: new Set<(ready: boolean) => void>(),
  check: undefined as unknown as () => Promise<'available' | 'latest' | 'offline'>,
  apply: undefined as unknown as () => Promise<boolean>,
}));
vi.mock('../updater', () => ({
  isUpdateReady: () => upd.ready,
  checkForUpdate: () => upd.check(),
  applyUpdate: () => upd.apply(),
  onUpdateState: (cb: (ready: boolean) => void) => {
    upd.listeners.add(cb);
    return () => {
      upd.listeners.delete(cb);
    };
  },
}));


function fakeModule(id: GameModule['id'], titleTermKey: string, summary: string): GameModule {
  return {
    id,
    titleTermKey,
    phase: 'P1',
    embeddable: true,
    summary,
    tutorial: { pages: [] },
    mount: () => ({ unmount: () => undefined, suspend: () => undefined }) as unknown as ReturnType<GameModule['mount']>,
  };
}

function makeCtx(settings: { shopName: string; playerName: string; showDevGames?: boolean }): { ctx: AppContext; navigate: ReturnType<typeof vi.fn> } {
  const navigate = vi.fn();
  const names: Record<string, string> = {
    'game.creel': 'クリール立て',
    'game.winding': 'ドラム巻き',
    'game.drumsetup': 'ドラム設定',
    'game.beaming': 'ビーミング',
    'game.itowari': '糸割り',
    'game.shop': '整経屋の一日',
    'game.zukan': '柄の図鑑',
  };
  const ctx = {
    settings: { get: () => settings },
    terms: { t: (k: string) => names[k] ?? k },
    audio: { play: vi.fn() },
    navigate,
  } as unknown as AppContext;
  return { ctx, navigate };
}

function mountHome(settings: { shopName: string; playerName: string; showDevGames?: boolean } = { shopName: '山田整経', playerName: '', showDevGames: false }): {
  root: HTMLElement;
  navigate: ReturnType<typeof vi.fn>;
  unmount: () => void;
} {
  const { ctx, navigate } = makeCtx(settings);
  const screen = createHomeScreen(ctx);
  const root = document.createElement('div');
  document.body.appendChild(root);
  screen.mount(root, {});
  return { root, navigate, unmount: () => screen.unmount() };
}

beforeEach(() => {
  vi.stubGlobal('__APP_VERSION__', '0.1.0');
  vi.stubGlobal('__BUILD_ID__', '2026-10-04T12:00:00.000Z');
  clearGamesForTest();
  registerGame(fakeModule('creel', 'game.creel', '依頼書のとおりにコーンを立てる'));
  registerGame(fakeModule('winding', 'game.winding', '張りを見ながら、帯をドラムに巻く'));
  registerGame(fakeModule('itowari', 'game.itowari', '足りない糸を、ワインダーで巻き分ける'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.textContent = '';
  clearGamesForTest();
});

describe('ホーム画面 (PU-03a)', () => {
  it('屋号とアプリ名「整経屋の一日」(明朝) が出る。上端に縞、右に「設定」', () => {
    const { root } = mountHome();
    expect(root.querySelector('.home__shop')!.textContent).toBe('山田整経');
    const app = root.querySelector('.home__app')!;
    expect(app.textContent).toBe('整経屋の一日');
    expect(app.classList.contains('font-heading')).toBe(true);
    expect(root.querySelector('.stripe-top')).not.toBeNull();
    const settings = Array.from(root.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === '設定')!;
    expect(settings.classList.contains('btn--secondary')).toBe(true);
    expect(settings.classList.contains('btn--circle')).toBe(true); // 丸いアイコンだけのボタン (PU-12a)
    expect(settings.textContent).toBe(''); // 見える文字は無い (折り返さない)
    expect(settings.querySelector('svg')).not.toBeNull();
  });

  it('名前があれば「○○さん、こんにちは」。空なら挨拶が無い', () => {
    const a = mountHome({ shopName: '山田整経', playerName: '太郎' });
    expect(a.root.querySelector('.home__greeting')!.textContent).toBe('太郎さん、こんにちは');
    document.body.textContent = '';
    const b = mountHome({ shopName: '山田整経', playerName: '' });
    expect(b.root.querySelector('.home__greeting')).toBeNull();
  });

  it('登録済みのゲームのカードに、名前・説明・状態が出て、押すとそのゲームへ移る。並びはクリール立て・ドラム巻き・(開発中の区切り)・糸割り (PU-17a。PU-31 からは出す設定のときの確かめ)', () => {
    const { root, navigate } = mountHome({ shopName: '山田整経', playerName: '', showDevGames: true });
    const cards = Array.from(root.querySelectorAll<HTMLButtonElement>('.game-card:not(.game-card--soon)'));
    expect(cards).toHaveLength(3);
    const itowari = cards[2]!;
    expect(itowari.querySelector('.game-card__name')!.textContent).toBe('糸割り');
    expect(itowari.querySelector('.game-card__summary')!.textContent).toBe('足りない糸を、ワインダーで巻き分ける');
    expect(itowari.querySelector('.game-card__status')!.textContent).toBe('お題 15');
    itowari.click();
    expect(navigate).toHaveBeenCalledWith('/games/itowari');
    const creel = cards[0]!;
    expect(creel.tagName).toBe('BUTTON');
    expect(creel.querySelector('.game-card__name')!.textContent).toBe('クリール立て');
    expect(creel.querySelector('.game-card__name')!.classList.contains('font-heading')).toBe(true);
    expect(creel.querySelector('.game-card__summary')!.textContent).toBe('依頼書のとおりにコーンを立てる');
    expect(creel.querySelector('.game-card__status')!.textContent).toMatch(/^お題 \d+$/);
    expect(cards[1]!.querySelector('.game-card__status')!.textContent).toBe('初級・中級・上級');
    expect(creel.querySelector('.game-card__art')).not.toBeNull();
    creel.click();
    expect(navigate).toHaveBeenCalledWith('/games/creel');
    cards[1]!.click();
    expect(navigate).toHaveBeenCalledWith('/games/winding');
  });

  it('準備中のカード (柄の図鑑のみ。糸割り・ビーム巻きは登録済みになった。題名と重なる「整経屋の一日」は無い) は「準備中」。押すと「準備中です」が2秒出て、移らない', () => {
    vi.useFakeTimers();
    const { root, navigate } = mountHome({ shopName: '山田整経', playerName: '', showDevGames: true });
    const soon = Array.from(root.querySelectorAll<HTMLButtonElement>('.game-card--soon'));
    expect(soon.map((c) => c.querySelector('.game-card__name')!.textContent)).toEqual([
      '柄の図鑑',
    ]);
    for (const c of soon) {
      expect(c.querySelector('.game-card__status')!.textContent).toBe('準備中');
    }
    const first = soon[0]!;
    expect(first.querySelector('.game-card__notice')).toBeNull();
    first.click();
    expect(first.querySelector('.game-card__notice')!.textContent).toBe('準備中です');
    expect(navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(first.querySelector('.game-card__notice')).toBeNull();
  });

  it('unmount でタイマーが残らない', () => {
    vi.useFakeTimers();
    const { root, unmount } = mountHome({ shopName: '山田整経', playerName: '', showDevGames: true });
    root.querySelector<HTMLButtonElement>('.game-card--soon')!.click();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('PU-10a: ホームの「設定」ボタンのバッジ', () => {
  beforeEach(() => {
    upd.ready = false;
    upd.listeners.clear();
  });

  it('新しい版が届いていなければバッジは無く、届いていれば朱の小さな丸 (btn__badge) が付く。aria-label でも伝わる', () => {
    clearGamesForTest();
    const a = mountHome();
    expect(a.root.querySelector('.btn__badge')).toBeNull();
    document.body.textContent = '';
    upd.ready = true;
    const b = mountHome();
    const settings = Array.from(b.root.querySelectorAll('button')).find((x) => x.getAttribute('aria-label')?.startsWith('設定') === true)!;
    expect(settings.querySelector('.btn__badge')).not.toBeNull();
    expect(settings.getAttribute('aria-label')).toContain('アップデートがあります');
  });

  it('開いたあとで届いたことを知らされるとバッジが付く。unmount で購読を外す', () => {
    const { root, unmount } = mountHome();
    expect(root.querySelector('.btn__badge')).toBeNull();
    for (const cb of upd.listeners) {
      cb(true);
    }
    expect(root.querySelector('.btn__badge')).not.toBeNull();
    unmount();
    expect(upd.listeners.size).toBe(0);
  });
});

describe('PU-10e: 版の番号とアプリ名', () => {
  it('題名の下に「バージョン 0.1.0 (日付)」が小さく出る (20px 以上・muted)。題名と挨拶のあいだ', () => {
    const { root } = mountHome({ shopName: '山田整経', playerName: '太郎' });
    const v = root.querySelector('.home__version')!;
    // 日付だけ (時刻は出さない)。この端末の時刻の日付
    const d = new Date('2026-10-04T12:00:00.000Z');
    const p2 = (n: number): string => String(n).padStart(2, '0');
    expect(v.textContent).toBe(`バージョン 0.1.0 (${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())})`);
    expect(v.textContent).toMatch(/^バージョン \d+\.\d+\.\d+ \(\d{4}-\d{2}-\d{2}\)$/);
    // 版の行は、版の番号の部分と日付の部分の2つの要素 (それぞれ途中で折り返さない。T1-21b)
    const num = v.querySelector('.home__version-num')!;
    const date = v.querySelector('.home__version-date')!;
    expect(num.textContent).toMatch(/^バージョン \d+\.\d+\.\d+$/);
    expect(date.textContent).toBe(` (${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())})`); // 先頭の空白が折り返しの位置
    // 見出しの下に置く (題名の列から出して画面の幅いっぱい)。題名と挨拶のあいだではなく題名のブロックのあと
    const header = v.parentElement!;
    expect(header.className).toContain('home__header');
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const m = css.match(/\n\.home__version\s*\{([^}]*)\}/)![1]!;
    expect(m).toContain('color: var(--c-muted)');
    expect(parseInt(m.match(/font-size: (\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(20);
    expect(m).toContain('flex-basis: 100%'); // 画面の幅いっぱいの行
    const numCss = css.match(/\n\.home__version-num,\s*\n\.home__version-date\s*\{([^}]*)\}/)![1]!;
    expect(numCss).toContain('white-space: nowrap');
  });

  it('アプリ名: マニフェストの name・short_name とタブの <title> が「整経屋の一日」。id・start_url・scope は変わらない', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
    const vite = readFileSync(join(root, 'vite.config.ts'), 'utf-8');
    expect(vite).toContain("name: '整経屋の一日'");
    expect(vite).toContain("short_name: '整経屋の一日'");
    expect(vite).toContain("id: 'the-seikei'");
    expect(vite).toContain("start_url: './'");
    expect(vite).toContain("scope: './'");
    const html = readFileSync(join(root, 'index.html'), 'utf-8');
    expect(html).toContain('<title>整経屋の一日</title>');
  });
});

describe('PU-10f: 「設定」のバッジを目立たせる', () => {
  it('バッジは朱の丸の中に白い「!」。aria-hidden で、読み上げは「設定(アップデートがあります)」のまま', () => {
    upd.ready = true;
    const { root } = mountHome();
    const settings = Array.from(root.querySelectorAll('button')).find((b) => b.getAttribute('aria-label')?.startsWith('設定') === true)!;
    const badge = settings.querySelector('.btn__badge')!;
    expect(badge.textContent).toBe('!');
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(settings.getAttribute('aria-label')).toBe('設定(アップデートがあります)');
    upd.ready = false;
  });

  it('base.css: 直径 24px 以上・白い縁 3px・白い「!」・右上の角に半分はみ出す。2 秒ごとに脈打ち、動きを減らす設定では止める', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const m = css.match(/\n\.btn__badge\s*\{([^}]*)\}/)![1]!;
    const size = parseInt(m.match(/width: (\d+)px/)![1]!, 10);
    expect(size).toBeGreaterThanOrEqual(24);
    expect(m).toContain(`height: ${size}px`);
    expect(m).toContain('border: 3px solid var(--c-white)');
    expect(m).toContain('color: var(--c-white)');
    expect(m).toContain('background: var(--c-shu)');
    expect(m).toContain(`top: -${size / 2}px`);
    expect(m).toContain(`right: -${size / 2}px`);
    expect(m).toMatch(/animation: badge-pulse 2s/);
    expect(css).toMatch(/@keyframes badge-pulse/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^@]*\.btn__badge\s*\{[^}]*animation: none/);
  });
});

describe('PU-13a: ホームのドラム設定の絵 (羽の向き)', () => {
  it('羽の線は、上の端が下の端より左 (左上へ登る。遊ぶ画面と同じ向き)。層は右に寄って積み上がる', () => {
    const art = createCardArt('drumsetup');
    const wing = art.querySelector('line')!;
    expect(parseFloat(wing.getAttribute('x2')!)).toBeLessThan(parseFloat(wing.getAttribute('x1')!));
    expect(parseFloat(wing.getAttribute('y2')!)).toBeLessThan(parseFloat(wing.getAttribute('y1')!));
    // 層 (rect): 右の端がそろっている
    const layers = Array.from(art.querySelectorAll('rect')).filter((r) => r.getAttribute('fill') !== null && parseFloat(r.getAttribute('height')!) === 8);
    expect(layers.length).toBeGreaterThanOrEqual(3);
    const rights = layers.map((r) => parseFloat(r.getAttribute('x')!) + parseFloat(r.getAttribute('width')!));
    expect(new Set(rights).size).toBe(1);
  });
});

describe('T1-22b: カードの絵の大きさを確定させる (iPhone・iPad で回転のあとにカードの下に余白が残る直し)', () => {
  it('SVG に width・height の属性があり (縦横比 200:100)、base.css の .game-card__art にも aspect-ratio で同じ比を決めてある', () => {
    for (const kind of ['creel', 'drumsetup', 'winding', 'beaming', 'itowari', 'soon'] as const) {
      const art = createCardArt(kind);
      expect(art.getAttribute('width')).toBe('200');
      expect(art.getAttribute('height')).toBe('100');
      expect(art.getAttribute('viewBox')).toBe('0 0 200 100');
    }
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const m = css.match(/\n\.game-card__art\s*\{([^}]*)\}/)![1]!;
    expect(m).toMatch(/aspect-ratio:\s*200\s*\/\s*100/);
    expect(m).toContain('width: 100%');
    expect(m).toContain('height: auto');
  });
});

describe('T1-22c: 回転のあとにカードの並びの行の高さを計算し直させる', () => {
  it('大きさが変わるたびに、カードの並び (grid) を一瞬隠して戻し、少し後にもう1回行う (iPhone・iPad の Safari が行の高さを再計算しない対策)。画面を閉じたら監視をやめる', async () => {
    // onViewportChange は requestAnimationFrame で1回にまとめる。テストではすぐ実行させる
    const realRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(performance.now());
      return 0;
    }) as typeof requestAnimationFrame;
    try {
      const { root, unmount } = mountHome();
      const games = root.querySelector<HTMLElement>('.home__games')!;
      let reflowRead = 0;
      Object.defineProperty(games, 'offsetHeight', {
        get: () => {
          reflowRead += 1;
          return 100;
        },
        configurable: true,
      });
      expect(games.style.display).toBe(''); // 普段は隠していない
      window.dispatchEvent(new Event('resize'));
      expect(reflowRead).toBeGreaterThanOrEqual(1); // 大きさが変わったら高さを読んで強制的に計算させる
      expect(games.style.display).toBe(''); // 一瞬隠して戻すので、終わったあとは見えている
      await new Promise((r) => setTimeout(r, 250));
      expect(reflowRead).toBeGreaterThanOrEqual(2); // 回転直後の反映の遅れに備えて、少し後にもう1回
      unmount();
      reflowRead = 0;
      window.dispatchEvent(new Event('resize'));
      expect(reflowRead).toBe(0); // 画面を閉じたら監視をやめる
    } finally {
      globalThis.requestAnimationFrame = realRaf;
    }
  });
});

describe('ホーム画面 PU-17a (開発中の区切り)', () => {
  const NAMES = ['クリール立て', 'ドラム巻き', '開発中', 'ドラム設定', 'ビーミング', '糸割り', '柄の図鑑'];

  function mountAll(): HTMLElement {
    clearGamesForTest();
    // 登録の順は main.ts と同じ (クリール立て・ドラム巻き・ドラム設定・ビーミング・糸割り)
    registerGame(fakeModule('creel', 'game.creel', 'a'));
    registerGame(fakeModule('winding', 'game.winding', 'b'));
    registerGame(fakeModule('drumsetup', 'game.drumsetup', 'c'));
    registerGame(fakeModule('beaming', 'game.beaming', 'd'));
    registerGame(fakeModule('itowari', 'game.itowari', 'e'));
    return mountHome({ shopName: '山田整経', playerName: '', showDevGames: true }).root;
  }

  /** 並びの順に、カードの名前と区切りの見出しの文字を返す */
  function order(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll('.home__games > .game-card, .home__games > .home__dev'))
      .map((e) => (e.classList.contains('home__dev') ? e.querySelector('.section-heading')!.textContent! : e.querySelector('.game-card__name')!.textContent!));
  }

  it('並びは クリール立て・ドラム巻き → 「開発中」の区切り → ドラム設定・ビーミング・糸割り・柄の図鑑', () => {
    expect(order(mountAll())).toEqual(NAMES);
  });

  it('区切りは見出し「開発中」と、その下に 20px 以上の「遊びの中身を調整しています」。3 列の画面では行全体 (grid-column: 1 / -1)', () => {
    const root = mountAll();
    const dev = root.querySelector('.home__dev')!;
    expect(dev.querySelector('.section-heading')!.textContent).toBe('開発中');
    expect(dev.querySelector('.home__dev-note')!.textContent).toBe('遊びの中身を調整しています');
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf8');
    const rule = css.match(/\.home__dev \{([^}]*)\}/)![1]!;
    expect(rule).toContain('grid-column: 1 / -1');
    const note = css.match(/\.home__dev-note \{([^}]*)\}/)![1]!;
    expect(note).toMatch(/font-size: var\(--fs-body\)|font-size: (2\d|3\d)px/);
  });

  it('開発中のカードには右上に「開発中」の札 (文字つき)。区切りの上のカードには無い。柄の図鑑は「準備中」のまま', () => {
    const root = mountAll();
    const cards = Array.from(root.querySelectorAll<HTMLElement>('.home__games > .game-card'));
    for (const c of cards) {
      const name = c.querySelector('.game-card__name')!.textContent!;
      const tag = c.querySelector('.game-card__dev');
      if (['ドラム設定', 'ビーミング', '糸割り'].includes(name)) {
        expect(tag, name).not.toBeNull();
        expect(tag!.textContent).toBe('開発中');
      } else {
        expect(tag, name).toBeNull();
      }
    }
    expect(cards.at(-1)!.classList.contains('game-card--soon')).toBe(true);
    expect(cards.at(-1)!.querySelector('.game-card__status')!.textContent).toBe('準備中');
  });

  it('開発中のカードも押せばそのゲームへ移る', () => {
    const { ctx, navigate } = makeCtx({ shopName: '', playerName: '', showDevGames: true });
    clearGamesForTest();
    registerGame(fakeModule('creel', 'game.creel', 'a'));
    registerGame(fakeModule('itowari', 'game.itowari', 'e'));
    const screen = createHomeScreen(ctx);
    const root = document.createElement('div');
    document.body.appendChild(root);
    screen.mount(root, {});
    const itowari = Array.from(root.querySelectorAll<HTMLButtonElement>('.game-card')).find((c) => c.textContent!.includes('糸割り'))!;
    itowari.click();
    expect(navigate).toHaveBeenCalledWith('/games/itowari');
    screen.unmount();
  });

  it('DEV_GAMES から外したゲームは、区切りの上 (クリール立て・ドラム巻きと同じ側) に出る', async () => {
    vi.resetModules();
    vi.doMock('./homeCards', async (orig) => await orig());
    const mod = await import('./homeScreen');
    expect(mod.DEV_GAMES).toEqual(['drumsetup', 'beaming', 'itowari']);
    expect(mod.splitByDev(['creel', 'winding', 'drumsetup', 'beaming', 'itowari'] as never, ['beaming'] as never)).toEqual({
      main: ['creel', 'winding', 'drumsetup', 'itowari'],
      dev: ['beaming'],
    });
    vi.doUnmock('./homeCards');
  });

  it('PU-31: 既定 (showDevGames が false) では「開発中」の区切りと開発中・準備中のカードは出ない。メインのゲーム (クリール立て・ドラム巻き) は出る', () => {
    const { root } = mountHome(); // showDevGames は既定の false
    expect(root.querySelectorAll('.home__dev')).toHaveLength(0);
    expect(root.textContent).not.toContain('開発中');
    expect(root.textContent).not.toContain('遊びの中身を調整しています');
    const names = Array.from(root.querySelectorAll('.game-card__name')).map((e) => e.textContent);
    expect(names, 'メインのゲームは出る').toEqual(['クリール立て', 'ドラム巻き']);
    expect(root.querySelectorAll('.game-card--soon')).toHaveLength(0);
  });

  it('PU-31: showDevGames が true のときは今のとおり「開発中」の区切りと開発中・準備中のカードが出る', () => {
    const { root } = mountHome({ shopName: '山田整経', playerName: '', showDevGames: true });
    expect(root.querySelectorAll('.home__dev')).toHaveLength(1);
    const names = Array.from(root.querySelectorAll('.game-card__name')).map((e) => e.textContent);
    expect(names).toContain('糸割り');
    expect(root.querySelectorAll('.game-card--soon')).toHaveLength(1);
  });

  it('PU-31: 管理者メニューで切り替えたあと、ホームを開き直すと反映される (設定を読み直して描き直す)', () => {
    const stored = { shopName: '山田整経', playerName: '', showDevGames: false };
    const navigate = vi.fn();
    const ctx = {
      settings: { get: () => stored },
      terms: { t: (k: string) => k },
      audio: { play: vi.fn() },
      navigate,
    } as unknown as AppContext;
    const screen = createHomeScreen(ctx);
    const root = document.createElement('div');
    document.body.appendChild(root);
    screen.mount(root, {});
    expect(root.querySelectorAll('.home__dev')).toHaveLength(0);
    // 管理者メニューで「出す」に変えた (設定の値が変わる)
    stored.showDevGames = true;
    // ホームを開き直す (unmount → mount)
    screen.unmount();
    const root2 = document.createElement('div');
    document.body.appendChild(root2);
    screen.mount(root2, {});
    expect(root2.querySelectorAll('.home__dev')).toHaveLength(1);
    // 戻すと隠れる
    stored.showDevGames = false;
    screen.unmount();
    const root3 = document.createElement('div');
    document.body.appendChild(root3);
    screen.mount(root3, {});
    expect(root3.querySelectorAll('.home__dev')).toHaveLength(0);
  });
});
