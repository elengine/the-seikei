import { describe, it, expect } from 'vitest';
import { runMigrations, migrateRecs, type Migration } from './migrations';
import type { Rec, RawStore } from './types';

function memStore(deviceId = 'dev-A'): RawStore & { _recs: Map<string, Rec<unknown>>; _meta: Map<string, string> } {
  const _recs = new Map<string, Rec<unknown>>();
  const _meta = new Map<string, string>();
  const keyOf = (c: string, id: string) => `${c}\u0000${id}`;
  return {
    deviceId,
    _recs,
    _meta,
    async getRaw(collection, id) {
      return _recs.get(keyOf(collection, id));
    },
    async putRaw(rec) {
      _recs.set(keyOf(rec.collection, rec.id), rec);
    },
    async allRaw() {
      return [..._recs.values()];
    },
    async getMeta(key) {
      return _meta.get(key);
    },
    async setMeta(key, value) {
      _meta.set(key, value);
    },
  };
}

function rec(v: { id: string; schemaVersion: number; data?: unknown; collection?: Rec<unknown>['collection'] }): Rec<unknown> {
  return {
    id: v.id,
    collection: v.collection ?? 'records',
    data: v.data ?? {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'dev-A',
    schemaVersion: v.schemaVersion,
  };
}

/** テスト用: 版1→2 で data に x: 1 を足す */
const mig1to2: Migration = {
  from: 1,
  to: 2,
  migrate(r) {
    return { ...r, schemaVersion: 2, data: { ...(r.data as Record<string, unknown>), x: 1 } };
  },
};

const mig2to3: Migration = {
  from: 2,
  to: 3,
  migrate(r) {
    return { ...r, schemaVersion: 3, data: { ...(r.data as Record<string, unknown>), y: 2 } };
  },
};

describe('runMigrations', () => {
  it('1. meta がない store では、何も移行せず schemaVersion を書く (初回起動)', async () => {
    const store = memStore();
    await store.putRaw(rec({ id: 'a', schemaVersion: 1 }));
    const result = await runMigrations(store, [mig1to2], 1);
    expect(result).toEqual({ from: 1, to: 1, migrated: 0 });
    expect(await store.getMeta('schemaVersion')).toBe('1');
    const all = await store.allRaw();
    expect(all).toHaveLength(1);
    expect(all[0]?.schemaVersion).toBe(1); // 変わっていない
  });

  it('2. テスト用 Migration (版1→2 で x:1 を足す) を渡すと全 Rec が版2になり data に x が入る', async () => {
    const store = memStore();
    await store.setMeta('schemaVersion', '1');
    await store.putRaw(rec({ id: 'a', schemaVersion: 1, data: { keep: 'k' } }));
    await store.putRaw(rec({ id: 'b', schemaVersion: 1, data: {} }));
    const result = await runMigrations(store, [mig1to2], 2);
    expect(result).toEqual({ from: 1, to: 2, migrated: 2 });
    expect(await store.getMeta('schemaVersion')).toBe('2');
    const all = await store.allRaw();
    expect(all.every((r) => r.schemaVersion === 2)).toBe(true);
    expect(all.every((r) => (r.data as Record<string, unknown>).x === 1)).toBe(true);
    expect((all[0]?.data as Record<string, unknown>).keep).toBe('k');
  });

  it('3. 版1→3 を求めたのに 2→3 の Migration がなければ例外で、データは変わらない', async () => {
    const store = memStore();
    await store.setMeta('schemaVersion', '1');
    await store.putRaw(rec({ id: 'a', schemaVersion: 1, data: { v: 1 } }));
    await expect(runMigrations(store, [mig1to2], 3)).rejects.toThrow();
    // データは変わらない
    expect(await store.getMeta('schemaVersion')).toBe('1');
    const all = await store.allRaw();
    expect(all[0]?.schemaVersion).toBe(1);
    expect(all[0]?.data).toEqual({ v: 1 });
  });

  it('移行中の例外はそのまま投げられ、保存済みデータは変わらない', async () => {
    const store = memStore();
    await store.setMeta('schemaVersion', '1');
    await store.putRaw(rec({ id: 'a', schemaVersion: 1 }));
    const boom: Migration = {
      from: 1,
      to: 2,
      migrate() {
        throw new Error('migrate boom');
      },
    };
    await expect(runMigrations(store, [boom], 2)).rejects.toThrow('migrate boom');
    expect(await store.getMeta('schemaVersion')).toBe('1');
    expect((await store.allRaw())[0]?.schemaVersion).toBe(1);
  });
});

describe('migrateRecs (純粋関数)', () => {
  it('版1の配列を版2に移行する (元の配列は書き換えない)', () => {
    const src = [rec({ id: 'a', schemaVersion: 1, data: { keep: 'k' } })];
    const out = migrateRecs(src, [mig1to2], 2);
    expect(out).toHaveLength(1);
    expect(out[0]?.schemaVersion).toBe(2);
    expect(out[0]?.data).toEqual({ keep: 'k', x: 1 });
    expect(src[0]?.schemaVersion).toBe(1); // 元は不変
  });

  it('対象より新しい Rec はそのまま残る', () => {
    const src = [rec({ id: 'a', schemaVersion: 2 })];
    const out = migrateRecs(src, [mig1to2], 1);
    expect(out[0]?.schemaVersion).toBe(2);
  });
});

describe('移行対象をまたぐ連鎖 (1→3)', () => {
  it('2段の Migration で順に移行できる', () => {
    const src = [rec({ id: 'a', schemaVersion: 1 })];
    const out = migrateRecs(src, [mig1to2, mig2to3], 3);
    expect(out[0]?.schemaVersion).toBe(3);
    expect(out[0]?.data).toEqual({ x: 1, y: 2 });
  });
});
