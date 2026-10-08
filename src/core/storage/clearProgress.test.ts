import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { clearProgress } from './clearProgress';
import { createLocalRepository } from './localRepository';
import { createRecords } from '../game/records';
import { createFixedClock } from '../clock/clock';
import type { CollectionName } from './types';

/**
 * ゲームの記録を消す関数のテスト (PU-22)。records・sessions・zukan の行を repo.remove で 1 つずつ消す。
 * settings・terms・shop・memories は残す。データベースそのものは消さない。
 */

let dbSeq = 0;
async function makeRepo(): Promise<Awaited<ReturnType<typeof createLocalRepository>>> {
  return createLocalRepository({
    dbName: `clear-progress-${Date.now().toString(36)}-${dbSeq++}`,
    clock: createFixedClock('2026-10-08T00:00:00.000Z'),
  });
}

const KEEP: CollectionName[] = ['settings', 'terms', 'shop', 'memories'];
const ERASE: CollectionName[] = ['records', 'sessions', 'zukan'];

describe('clearProgress PU-22', () => {
  it('1. records・sessions・zukan の行がすべて消え (get・list で見えない)、settings・terms・shop・memories は残る', async () => {
    const repo = await makeRepo();
    for (const c of [...ERASE, ...KEEP]) {
      await repo.put(c, { v: 1 }, `${c}-a`);
      await repo.put(c, { v: 2 }, `${c}-b`);
    }
    const r = await clearProgress(repo);
    expect(r.removed).toBe(6);
    for (const c of ERASE) {
      expect(await repo.list(c), c).toHaveLength(0);
      expect(await repo.get(c, `${c}-a`), c).toBeUndefined();
    }
    for (const c of KEEP) {
      expect(await repo.list(c), c).toHaveLength(2);
      expect(await repo.get(c, `${c}-a`), c).toBeDefined();
    }
  });

  it('2. 論理削除 (deletedAt) で消す: バックアップには削除の印つきで残り、データベースは消えない。もう一度呼んでも壊れない (0 件)', async () => {
    const repo = await makeRepo();
    await repo.put('records', { bestStars: 3, plays: 1, best: {} }, 'creel');
    const first = await clearProgress(repo);
    expect(first.removed).toBe(1);
    const backup = await repo.exportAll();
    const rec = backup.recs.find((x) => x.collection === 'records' && x.id === 'creel');
    expect(rec?.deletedAt).toBeDefined();
    expect((await clearProgress(repo)).removed).toBe(0);
    await repo.put('records', { bestStars: 1, plays: 1, best: {} }, 'creel'); // 消したあとも書ける (作り直しは要らない)
    expect(await repo.get('records', 'creel')).toBeDefined();
  });

  it('3. 消したあと、記録の部品 (records) が repo.subscribe で読み直される: 消す前は星あり → 消したあと星なし。聞いている画面にも知らせが届く', async () => {
    const repo = await makeRepo();
    const records = await createRecords(repo);
    await records.add('creel', 3, { 'puzzle:s1': 3 });
    expect(records.get('creel').best['puzzle:s1']).toBe(3);
    let notified = 0;
    records.onChange(() => {
      notified += 1;
    });
    await clearProgress(repo);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(records.get('creel').best['puzzle:s1']).toBeUndefined();
    expect(records.get('creel').bestStars).toBe(0);
    expect(notified).toBeGreaterThan(0);
  });
});
