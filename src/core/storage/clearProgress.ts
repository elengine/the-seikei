import type { CollectionName, Repository } from './types';

/**
 * ゲームの記録を消す (PU-22。設定画面の「ゲームの記録を消す」)。
 * 消すもの: records (星・最高記録・次はこれ・鍵の進み)、sessions (途中の状態)、zukan (図鑑)。
 * 残すもの: settings・terms・shop・memories。
 * repo.remove で 1 行ずつ論理削除する (deletedAt の印。将来の同期と合う)。データベースそのものは消さない・作り直さない。
 * 消すと repo.subscribe が働き、記録を覚えている部品 (records など) が読み直される。
 */
const PROGRESS_COLLECTIONS: CollectionName[] = ['records', 'sessions', 'zukan'];

/** 消した行の数を返す。途中で失敗したら例外 (それまでに消した分は消えたまま) */
export async function clearProgress(repo: Repository): Promise<{ removed: number }> {
  let removed = 0;
  for (const collection of PROGRESS_COLLECTIONS) {
    const recs = await repo.list<unknown>(collection);
    for (const rec of recs) {
      await repo.remove(collection, rec.id);
      removed += 1;
    }
  }
  return { removed };
}
