import 'fake-indexeddb/auto';
import { createFixedClock, type Clock } from '../../src/core/clock/clock';
import { createLocalRepository } from '../../src/core/storage/localRepository';
import { runRepositoryContract } from './repositoryContract';

// dbName がグローバルに一意になるよう連番を付ける
let dbSeq = 0;

function makeWithClock(clock: Clock, deviceId: string | undefined) {
  return createLocalRepository({
    dbName: `seikei-test-${Date.now().toString(36)}-${dbSeq++}`,
    clock,
    ...(deviceId !== undefined ? { deviceId } : {}),
  });
}

runRepositoryContract('LocalRepository (Dexie)', async (clock, deviceId) =>
  makeWithClock(clock, deviceId),
);

describe('LocalRepository 固有の振る舞い (T0-05 仕様)', () => {
  it('deviceId を指定せずに作ると deviceId が UUID になり、同じ dbName で作り直しても同じ値になる', async () => {
    // 契約テストのファクトリとは別に、固定 dbName で検証する
    const { seedFrom } = await import('../../src/core/clock/clock');
    void seedFrom;
    const clockA = createFixedClock('2026-01-01T00:00:00.000Z');
    const dbName = `seikei-devcheck-${Date.now().toString(36)}`;
    const repoA = await createLocalRepository({ dbName, clock: clockA });
    const idA = repoA.deviceId;
    expect(idA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // 同じ dbName で作り直しても同じ deviceId
    const clockB = createFixedClock('2026-01-01T00:00:00.000Z');
    const repoB = await createLocalRepository({ dbName, clock: clockB });
    expect(repoB.deviceId).toBe(idA);
  });

  it('put は既存が削除済みの場合も createdAt を引き継ぎ、deletedAt を消して復活させる', async () => {
    const clock = createFixedClock('2026-01-01T00:00:00.000Z');
    const repo = await makeWithClock(clock, 'dev-A');
    const rec1 = await repo.put('records', { n: 1 }, 'r-1');
    await repo.remove('records', 'r-1');
    expect(await repo.get('records', 'r-1')).toBeUndefined();
    const rec3 = await repo.put('records', { n: 3 }, 'r-1');
    expect(rec3.createdAt).toBe(rec1.createdAt); // createdAt を引き継ぐ
    expect(rec3.deletedAt).toBeUndefined(); // 復活
    const got = await repo.get('records', 'r-1');
    expect(got?.data).toEqual({ n: 3 });
  });

  it('importAll は T0-05 時点では throw する', async () => {
    const clock = createFixedClock('2026-01-01T00:00:00.000Z');
    const repo = await makeWithClock(clock, 'dev-A');
    await expect(
      repo.importAll({ app: 'seikei-game', exportedAt: '', schemaVersion: 1, deviceId: 'x', recs: [] }),
    ).rejects.toThrow('T0-07 で実装');
  });
});

import { describe, it, expect } from 'vitest';
