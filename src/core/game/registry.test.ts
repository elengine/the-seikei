import { describe, it, expect, beforeEach } from 'vitest';
import { registerGame, getGame, listGames, clearGamesForTest } from './registry';
import type { GameModule } from './types';

function fakeModule(id: GameModule['id'], titleTermKey = `game.${id}`): GameModule {
  return {
    id,
    titleTermKey,
    phase: 'P1',
    embeddable: true,
    tutorial: { pages: [] },
    mount: () => ({ suspend: () => undefined, unmount: () => undefined }),
  };
}

describe('registry', () => {
  beforeEach(() => {
    clearGamesForTest();
  });

  it('5. 二重登録で例外、listGames が登録順', () => {
    registerGame(fakeModule('creel'));
    registerGame(fakeModule('winding'));
    registerGame(fakeModule('shop'));
    expect(() => registerGame(fakeModule('creel'))).toThrow(); // 二重登録は例外

    const list = listGames();
    expect(list.map((g) => g.id)).toEqual(['creel', 'winding', 'shop']); // 登録順

    expect(getGame('winding')?.titleTermKey).toBe('game.winding');
    expect(getGame('beaming')).toBeUndefined(); // 未登録

    clearGamesForTest();
    expect(listGames()).toEqual([]);
  });
});
