import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
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

  it('where(updatedAt).above(時刻) で、それより後に更新された Rec だけが取れる', async () => {
    // stepMs を 1000 にして、1操作ごとに updatedAt が1秒ずつ進む
    const clock = createFixedClock('2026-01-01T00:00:00.000Z', 1000);
    const repo = await makeWithClock(clock, 'dev-A');
    // t=0s: old 生成 → 更新時刻 00:00:00
    await repo.put('records', { n: 1 }, 'old');
    // t=1s: mid 生成 → 00:00:01
    await repo.put('records', { n: 2 }, 'mid');
    // t=2s: new 生成 → 00:00:02
    await repo.put('records', { n: 3 }, 'new');
    // t=3s: old を更新 → old の updatedAt は 00:00:03 になる
    await repo.put('records', { n: 10 }, 'old');
    // t=4s: new を削除 → new の updatedAt は 00:00:04
    await repo.remove('records', 'new');

    // 00:00:01 より後に更新されたのは old(00:00:03) と new(00:00:04・削除済み) のみ
    const rows = await (repo as unknown as {
      __dbForTest?: never;
    }) !== undefined ? [] : [];

    // RawStore 経由ではなく updatedAt 索引を直接検証するため、
    // allRaw から得られる updatedAt の分布と where クエリ結果を照合する
    // (Dexie の where は Repository インターフェースの外なので、
    //  ここではテスト用に createLocalRepository を直接使って内部 DB にアクセスする)
    const { SeikeiDbForTest } = await import('../../src/core/storage/localRepository');
    const dbName = `seikei-idxcheck-${Date.now().toString(36)}`;
    const clock2 = createFixedClock('2026-01-01T00:00:00.000Z', 1000);
    const repo2 = await createLocalRepository({ dbName, clock: clock2, deviceId: 'dev-A' });
    await repo2.put('records', { n: 1 }, 'old');
    await repo2.put('records', { n: 2 }, 'mid');
    await repo2.put('records', { n: 3 }, 'new');
    await repo2.put('records', { n: 10 }, 'old'); // updatedAt が進む
    await repo2.remove('records', 'new'); // 削除も updatedAt を進める

    const db = new SeikeiDbForTest(dbName);
    await db.open();
    // 00:00:01.000 より後に更新された Rec
    const later = await db.recs.where('updatedAt').above('2026-01-01T00:00:01.000Z').toArray();
    const ids = later.map((r) => r.id).sort();
    expect(ids).toEqual(['new', 'old']); // mid は 00:00:01 なので対象外
    expect(later.every((r) => r.updatedAt === r.rec.updatedAt)).toBe(true);
    void rows;
  });

  it('importAll は T0-05 時点では throw する', async () => {
    const clock = createFixedClock('2026-01-01T00:00:00.000Z');
    const repo = await makeWithClock(clock, 'dev-A');
    await expect(
      repo.importAll({ app: 'seikei-game', exportedAt: '', schemaVersion: 1, deviceId: 'x', recs: [] }),
    ).rejects.toThrow('T0-07 で実装');
  });
});
