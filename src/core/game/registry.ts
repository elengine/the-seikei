import type { GameId, GameModule } from './types';

const games = new Map<GameId, GameModule>();
const order: GameId[] = [];

/** ゲームを登録する。同じ id の二重登録は例外 */
export function registerGame(m: GameModule): void {
  if (games.has(m.id)) {
    throw new Error(`game already registered: ${m.id}`);
  }
  games.set(m.id, m);
  order.push(m.id);
}

export function getGame(id: GameId): GameModule | undefined {
  return games.get(id);
}

/** 登録順にすべてのゲームを返す */
export function listGames(): GameModule[] {
  return order.map((id) => games.get(id) as GameModule);
}

/** テスト用に登録を全消去する */
export function clearGamesForTest(): void {
  games.clear();
  order.length = 0;
}
