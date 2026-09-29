import type { Repository } from '../storage/types';
import type { GameId } from './types';

export interface RecordData { bestStars: number; plays: number; best: Record<string, number>; }

export interface Records {
  get(gameId: GameId): RecordData;                         // 無ければ { 0, 0, {} }。同期(キャッシュ)
  add(gameId: GameId, stars: number, best: Record<string, number>): Promise<void>;
  onChange(cb: () => void): () => void;
}

/** 成績の記録窓口。records コレクション、id = gameId */
export async function createRecords(repo: Repository): Promise<Records> {
  const cache = new Map<GameId, RecordData>();
  const listeners = new Set<() => void>();

  // 起動時に records コレクションを読み込んでキャッシュする
  async function reload(): Promise<void> {
    const recs = await repo.list<RecordData>('records');
    cache.clear();
    for (const rec of recs) {
      cache.set(rec.id as GameId, rec.data);
    }
  }
  await reload();

  // 共通の決まり: 外からの変更 (バックアップの読み込みと将来の同期) を見張って読み直す
  repo.subscribe('records', () => {
    void reload().then(() => {
      for (const cb of listeners) {
        cb();
      }
    });
  });

  function get(gameId: GameId): RecordData {
    const data = cache.get(gameId);
    if (data !== undefined) {
      return data;
    }
    return { bestStars: 0, plays: 0, best: {} };
  }

  return {
    get,

    async add(gameId: GameId, stars: number, best: Record<string, number>): Promise<void> {
      const current = get(gameId);
      // plays は 1 増やし、bestStars は大きい方、best はキーごとに大きい方を残す
      const mergedBest: Record<string, number> = { ...current.best };
      for (const [key, value] of Object.entries(best)) {
        mergedBest[key] = Math.max(mergedBest[key] ?? 0, value);
      }
      const next: RecordData = {
        bestStars: Math.max(current.bestStars, stars),
        plays: current.plays + 1,
        best: mergedBest,
      };
      await repo.put('records', next, gameId);
      cache.set(gameId, next);
    },

    onChange(cb: () => void): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
