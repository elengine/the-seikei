import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHomeScreen } from './homeScreen';
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


function fakeModule(id: 'creel' | 'winding', titleTermKey: string, summary: string): GameModule {
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

function makeCtx(settings: { shopName: string; playerName: string }): { ctx: AppContext; navigate: ReturnType<typeof vi.fn> } {
  const navigate = vi.fn();
  const names: Record<string, string> = {
    'game.creel': 'クリール立て',
    'game.winding': 'ドラム巻き',
    'game.beaming': 'ビーミング',
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

function mountHome(settings = { shopName: '山田整経', playerName: '' }): {
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

  it('登録済みのゲームのカードに、名前・説明・状態が出て、押すとそのゲームへ移る', () => {
    const { root, navigate } = mountHome();
    const cards = Array.from(root.querySelectorAll<HTMLButtonElement>('.game-card:not(.game-card--soon)'));
    expect(cards).toHaveLength(2);
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

  it('準備中のカード (糸割り・柄の図鑑。ビーム巻きは登録済みになった。題名と重なる「整経屋の一日」は無い) は「準備中」。押すと「準備中です」が2秒出て、移らない', () => {
    vi.useFakeTimers();
    const { root, navigate } = mountHome();
    const soon = Array.from(root.querySelectorAll<HTMLButtonElement>('.game-card--soon'));
    expect(soon.map((c) => c.querySelector('.game-card__name')!.textContent)).toEqual([
      '糸割り',
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
    const { root, unmount } = mountHome();
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
    const app = root.querySelector('.home__app')!;
    expect(app.nextElementSibling).toBe(v);
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const m = css.match(/\n\.home__version\s*\{([^}]*)\}/)![1]!;
    expect(m).toContain('color: var(--c-muted)');
    expect(parseInt(m.match(/font-size: (\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(20);
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
