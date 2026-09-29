import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createZukanRegistry } from './zukan';
import { createLocalRepository } from '../storage/localRepository';
import { createFixedClock } from '../clock/clock';

function makeRepo() {
  return createLocalRepository({ dbName: 'test-zukan', clock: createFixedClock('2026-09-28T00:00:00.000Z') });
}

beforeEach(async () => {
  // 各テストで独立した DB にする
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name !== undefined && db.name.startsWith('test-zukan')) {
      indexedDB.deleteDatabase(db.name);
    }
  }
});

describe('zukan', () => {
  it('初めての unlock で isNew = true、2回目で false・count 2', async () => {
    const repo = await makeRepo();
    const clock = createFixedClock('2026-09-28T00:00:00.000Z');
    const zukan = await createZukanRegistry(repo, clock);
    const first = await zukan.unlock('p-muji-kon', 'creel');
    expect(first.isNew).toBe(true);
    expect(zukan.has('p-muji-kon')).toBe(true);
    const second = await zukan.unlock('p-muji-kon', 'creel');
    expect(second.isNew).toBe(false);
    expect(zukan.all().get('p-muji-kon')?.count).toBe(2);
  });

  it('作り直しても has が true (保存されている)', async () => {
    const repo = await makeRepo();
    const clock = createFixedClock('2026-09-28T00:00:00.000Z');
    const zukan1 = await createZukanRegistry(repo, clock);
    await zukan1.unlock('p-pin-kon', 'creel');
    const zukan2 = await createZukanRegistry(repo, clock);
    expect(zukan2.has('p-pin-kon')).toBe(true);
  });

  it('repo に直接 put した図鑑の記録が、has と onChange に反映される', async () => {
    const repo = await makeRepo();
    const clock = createFixedClock('2026-09-28T00:00:00.000Z');
    const zukan = await createZukanRegistry(repo, clock);
    expect(zukan.has('p-alt-kon')).toBe(false);
    const cb = vi.fn();
    zukan.onChange(cb);
    // 外からの変更をシミュレート (バックアップの読み込みと将来の同期)
    await repo.put('zukan', { obtainedAt: clock.now(), source: 'creel', count: 1 }, 'p-alt-kon');
    await vi.waitFor(() => {
      expect(zukan.has('p-alt-kon')).toBe(true);
    });
    expect(cb).toHaveBeenCalled();
  });
});
