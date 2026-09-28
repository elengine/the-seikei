import Dexie, { type Table } from 'dexie';
import type { Clock } from '../clock/clock';
import type {
  BackupFile,
  CollectionName,
  ImportReport,
  Rec,
  Repository,
  RawStore,
} from './types';
import { CURRENT_SCHEMA_VERSION } from './types';

interface RecRow {
  key: string; // [collection+id]
  collection: CollectionName;
  id: string;
  rec: Rec<unknown>;
}

interface MetaRow {
  key: string;
  value: string;
}

class SeikeiDb extends Dexie {
  recs!: Table<RecRow, string>;
  meta!: Table<MetaRow, string>;

  constructor(dbName: string) {
    super(dbName);
    this.version(1).stores({
      recs: 'key, collection, updatedAt',
      meta: 'key',
    });
  }
}

function rowKey(collection: CollectionName, id: string): string {
  return `${collection}\u0000${id}`;
}

/** 端末内 IndexedDB (Dexie) に保存する Repository。契約テスト (tests/contract) の対象。 */
export async function createLocalRepository(opts: {
  dbName: string;
  clock: Clock;
  deviceId?: string;
}): Promise<Repository & RawStore> {
  const db = new SeikeiDb(opts.dbName);
  await db.open();

  // deviceId: 指定があればそれを使い、なければ meta から読み、なければ生成して保存
  let deviceId: string;
  if (opts.deviceId !== undefined) {
    deviceId = opts.deviceId;
  } else {
    const stored = await db.meta.get('deviceId');
    if (stored !== undefined) {
      deviceId = stored.value;
    } else {
      deviceId = opts.clock.uuid();
      await db.meta.put({ key: 'deviceId', value: deviceId });
    }
  }

  const listeners = new Map<CollectionName, Set<() => void>>();

  function notify(collection: CollectionName): void {
    const set = listeners.get(collection);
    if (set === undefined) {
      return;
    }
    for (const cb of set) {
      cb();
    }
  }

  async function getAny<T>(
    collection: CollectionName,
    id: string,
  ): Promise<Rec<T> | undefined> {
    const row = await db.recs.get(rowKey(collection, id));
    return row?.rec as Rec<T> | undefined;
  }

  const repo: Repository & RawStore = {
    deviceId,

    async get<T>(collection: CollectionName, id: string): Promise<Rec<T> | undefined> {
      const rec = await getAny<T>(collection, id);
      if (rec === undefined || rec.deletedAt !== undefined) {
        return undefined;
      }
      return rec;
    },

    async list<T>(collection: CollectionName): Promise<Rec<T>[]> {
      const rows = await db.recs.where('collection').equals(collection).toArray();
      return rows
        .map((r) => r.rec as Rec<T>)
        .filter((r) => r.deletedAt === undefined)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },

    async put<T>(collection: CollectionName, data: T, id?: string): Promise<Rec<T>> {
      const newId = id ?? opts.clock.uuid();
      const key = rowKey(collection, newId);
      const existing = await db.recs.get(key);
      const now = opts.clock.now();
      const rec: Rec<T> = {
        id: newId,
        collection,
        data,
        createdAt: existing !== undefined ? existing.rec.createdAt : now,
        updatedAt: now,
        updatedBy: deviceId,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };
      // 既存が削除済みの場合は deletedAt を消して復活させる
      if (existing !== undefined && existing.rec.deletedAt === undefined) {
        rec.deletedAt = undefined;
      }
      await db.recs.put({ key, collection, id: newId, rec: rec as Rec<unknown> });
      notify(collection);
      return rec;
    },

    async remove(collection: CollectionName, id: string): Promise<void> {
      const key = rowKey(collection, id);
      const existing = await db.recs.get(key);
      if (existing === undefined) {
        return; // 存在しなければ何もしない
      }
      const now = opts.clock.now();
      const rec: Rec<unknown> = { ...existing.rec, deletedAt: now, updatedAt: now, updatedBy: deviceId };
      await db.recs.put({ key, collection, id, rec });
      notify(collection);
    },

    subscribe(collection: CollectionName, cb: () => void): () => void {
      let set = listeners.get(collection);
      if (set === undefined) {
        set = new Set();
        listeners.set(collection, set);
      }
      set.add(cb);
      return () => {
        set?.delete(cb);
      };
    },

    async exportAll(): Promise<BackupFile> {
      const rows = await db.recs.toArray();
      return {
        app: 'seikei-game',
        exportedAt: opts.clock.now(),
        schemaVersion: CURRENT_SCHEMA_VERSION,
        deviceId,
        recs: rows.map((r) => r.rec),
      };
    },

    async importAll(): Promise<ImportReport> {
      // 引数は使わない (T0-07 で実装)
      throw new Error('T0-07 で実装');
    },

    async getRaw(collection: CollectionName, id: string): Promise<Rec<unknown> | undefined> {
      const row = await db.recs.get(rowKey(collection, id));
      return row?.rec;
    },

    async putRaw(rec: Rec<unknown>): Promise<void> {
      await db.recs.put({
        key: rowKey(rec.collection, rec.id),
        collection: rec.collection,
        id: rec.id,
        rec,
      });
      notify(rec.collection);
    },

    async allRaw(): Promise<Rec<unknown>[]> {
      const rows = await db.recs.toArray();
      return rows.map((r) => r.rec);
    },

    async getMeta(key: string): Promise<string | undefined> {
      const row = await db.meta.get(key);
      return row?.value;
    },

    async setMeta(key: string, value: string): Promise<void> {
      await db.meta.put({ key, value });
    },
  };

  return repo;
}
