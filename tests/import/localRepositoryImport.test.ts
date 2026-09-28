import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createFixedClock, type Clock } from '../../src/core/clock/clock';
import { createLocalRepository } from '../../src/core/storage/localRepository';
import type { BackupFile, Rec } from '../../src/core/storage/types';

let dbSeq = 0;

function makeRepo(deviceId: string | undefined, clock: Clock = createFixedClock('2026-01-01T00:00:00.000Z')) {
  return createLocalRepository({
    dbName: `seikei-import-${Date.now().toString(36)}-${dbSeq++}`,
    clock,
    ...(deviceId !== undefined ? { deviceId } : {}),
  });
}

function backupFile(
  recs: Rec<unknown>[],
  schemaVersion = 1,
  app: BackupFile['app'] = 'seikei-game',
): BackupFile {
  return { app, exportedAt: '2026-01-01T00:00:00.000Z', schemaVersion, deviceId: 'dev-other', recs };
}

function rec(v: {
  id: string;
  collection: Rec<unknown>['collection'];
  data: unknown;
  updatedAt?: string;
  updatedBy?: string;
  deletedAt?: string;
}): Rec<unknown> {
  return {
    id: v.id,
    collection: v.collection,
    data: v.data,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: v.updatedAt ?? '2026-01-01T00:00:00.000Z',
    updatedBy: v.updatedBy ?? 'dev-other',
    ...(v.deletedAt !== undefined ? { deletedAt: v.deletedAt } : {}),
    schemaVersion: 1,
  };
}

describe('importAll (T0-07)', () => {
  it('4. 空の repository に読み込むと、全件 added', async () => {
    const repo = await makeRepo('dev-A');
    const file = backupFile([
      rec({ id: 'a', collection: 'terms', data: { t: 1 } }),
      rec({ id: 'b', collection: 'shop', data: { s: 1 } }),
    ]);
    const report = await repo.importAll(file);
    expect(report).toEqual({ added: 2, updated: 0, unchanged: 0, rejected: 0 });
    expect((await repo.getRaw('terms', 'a'))?.data).toEqual({ t: 1 });
    expect((await repo.getRaw('shop', 'b'))?.data).toEqual({ s: 1 });
  });

  it('5. 同じファイルを2回読み込むと、2回目は全件 unchanged', async () => {
    const repo = await makeRepo('dev-A');
    const file = backupFile([rec({ id: 'a', collection: 'terms', data: { t: 1 } })]);
    const r1 = await repo.importAll(file);
    expect(r1.added).toBe(1);
    const r2 = await repo.importAll(file);
    expect(r2).toEqual({ added: 0, updated: 0, unchanged: 1, rejected: 0 });
  });

  it('6. 手元の settings の名前が新しく、ファイルの屋号が新しい場合、両方が残る (fieldNewer)', async () => {
    const repo = await makeRepo('dev-A');
    // 手元: name が新しい (00:00:02)
    await repo.put(
      'settings',
      { name: '手元の名前', ya: '旧屋号', _updated: { name: '2026-01-01T00:00:02.000Z', ya: '2026-01-01T00:00:00.000Z' } },
      'set-1',
    );
    const file = backupFile([
      rec({
        id: 'set-1',
        collection: 'settings',
        data: { name: '旧名前', ya: '新しい屋号', _updated: { name: '2026-01-01T00:00:00.000Z', ya: '2026-01-01T00:00:05.000Z' } },
        updatedAt: '2026-01-01T00:00:05.000Z',
        updatedBy: 'dev-other',
      }),
    ]);
    const report = await repo.importAll(file);
    expect(report.updated).toBe(1);
    const merged = await repo.get<Record<string, unknown>>('settings', 'set-1');
    expect(merged?.data.name).toBe('手元の名前'); // 手元が新しい
    expect(merged?.data.ya).toBe('新しい屋号'); // ファイルが新しい
  });

  it('7. app が違うファイル、版が新しすぎるファイルは全件 rejected', async () => {
    const repo = await makeRepo('dev-A');
    const wrongApp = await repo.importAll({
      ...backupFile([rec({ id: 'a', collection: 'terms', data: {} })]),
      app: 'other-app' as BackupFile['app'],
    });
    expect(wrongApp).toEqual({ added: 0, updated: 0, unchanged: 0, rejected: 1 });
    expect(await repo.getRaw('terms', 'a')).toBeUndefined();

    const tooNew = await repo.importAll(
      backupFile([rec({ id: 'b', collection: 'terms', data: {} })], 99),
    );
    expect(tooNew).toEqual({ added: 0, updated: 0, unchanged: 0, rejected: 1 });
    expect(await repo.getRaw('terms', 'b')).toBeUndefined();
  });

  it('補助: 変更のあったコレクションの購読者に通知される', async () => {
    const repo = await makeRepo('dev-A');
    let calls = 0;
    repo.subscribe('terms', () => {
      calls++;
    });
    const file = backupFile([rec({ id: 'a', collection: 'terms', data: { t: 1 } })]);
    await repo.importAll(file);
    expect(calls).toBe(1); // added で1回
    await repo.importAll(file);
    expect(calls).toBe(1); // unchanged では呼ばれない
  });

  it('補助: migrateRecs が空 (MIGRATIONS=[]) のとき、現在の版と同じ Rec はそのまま取り込まれる', async () => {
    const repo = await makeRepo('dev-A');
    const cur: Rec<unknown> = {
      id: 'cur-1',
      collection: 'records',
      data: { keep: 'k' },
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      updatedBy: 'dev-other',
      schemaVersion: 1,
    };
    const report = await repo.importAll({
      app: 'seikei-game',
      exportedAt: '2025-01-01T00:00:00.000Z',
      schemaVersion: 1,
      deviceId: 'dev-other',
      recs: [cur],
    });
    expect(report.added).toBe(1);
    const got = await repo.getRaw('records', 'cur-1');
    expect(got?.schemaVersion).toBe(1);
    expect(got?.data).toEqual({ keep: 'k' });
  });
});
