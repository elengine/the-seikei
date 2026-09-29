import type { Repository } from '../storage/types';
import type { Clock } from '../clock/clock';
import type { GameId } from '../game/types';

export interface ZukanData { obtainedAt: string; source: string; count: number; }

export interface ZukanRegistry {
  unlock(patternId: string, source: GameId): Promise<{ isNew: boolean }>;
  has(patternId: string): boolean;          // 同期(キャッシュ)
  all(): Map<string, ZukanData>;            // 同期(キャッシュ)
  onChange(cb: () => void): () => void;
}

/** 図鑑の登録窓口。zukan コレクション、id = patternId */
export async function createZukanRegistry(repo: Repository, clock: Clock): Promise<ZukanRegistry> {
  const cache = new Map<string, ZukanData>();
  const listeners = new Set<() => void>();

  // 起動時に zukan コレクションを読み込んでキャッシュする
  async function reload(): Promise<void> {
    const recs = await repo.list<ZukanData>('zukan');
    cache.clear();
    for (const rec of recs) {
      cache.set(rec.id, rec.data);
    }
  }
  await reload();

  // 共通の決まり: 外からの変更 (バックアップの読み込みと将来の同期) を見張って読み直す
  repo.subscribe('zukan', () => {
    void reload().then(() => {
      for (const cb of listeners) {
        cb();
      }
    });
  });

  return {
    async unlock(patternId: string, source: GameId): Promise<{ isNew: boolean }> {
      const existing = cache.get(patternId);
      if (existing !== undefined) {
        // 入手済み: count を 1 増やすだけ (isNew = false)
        const next: ZukanData = { ...existing, count: existing.count + 1 };
        await repo.put('zukan', next, patternId);
        cache.set(patternId, next);
        return { isNew: false };
      }
      // 未入手: 新規登録 (isNew = true)
      const data: ZukanData = { obtainedAt: clock.now(), source, count: 1 };
      await repo.put('zukan', data, patternId);
      cache.set(patternId, data);
      return { isNew: true };
    },

    has(patternId: string): boolean {
      return cache.has(patternId);
    },

    all(): Map<string, ZukanData> {
      return new Map(cache);
    },

    onChange(cb: () => void): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
