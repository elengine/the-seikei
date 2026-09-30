import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHomeScreen } from './homeScreen';
import type { AppContext } from '../context';
import type { GameModule } from '../../core/game/types';
import { registerGame, clearGamesForTest } from '../../core/game/registry';

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
  clearGamesForTest();
  registerGame(fakeModule('creel', 'game.creel', '依頼書のとおりにコーンを立てる'));
  registerGame(fakeModule('winding', 'game.winding', '張りを見ながら、帯をドラムに巻く'));
});

afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
  clearGamesForTest();
});

describe('ホーム画面 (PU-03a)', () => {
  it('屋号とアプリ名「整経ゲーム」(明朝) が出る。上端に縞、右に「設定」', () => {
    const { root } = mountHome();
    expect(root.querySelector('.home__shop')!.textContent).toBe('山田整経');
    const app = root.querySelector('.home__app')!;
    expect(app.textContent).toBe('整経ゲーム');
    expect(app.classList.contains('font-heading')).toBe(true);
    expect(root.querySelector('.stripe-top')).not.toBeNull();
    const settings = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === '設定')!;
    expect(settings.classList.contains('btn--secondary')).toBe(true);
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

  it('準備中のカード (糸割り・ビーミング・整経屋の一日・柄の図鑑) は「準備中」。押すと「準備中です」が2秒出て、移らない', () => {
    vi.useFakeTimers();
    const { root, navigate } = mountHome();
    const soon = Array.from(root.querySelectorAll<HTMLButtonElement>('.game-card--soon'));
    expect(soon.map((c) => c.querySelector('.game-card__name')!.textContent)).toEqual([
      '糸割り',
      'ビーミング',
      '整経屋の一日',
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
