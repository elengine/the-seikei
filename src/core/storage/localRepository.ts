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
import { MIGRATIONS, migrateRecs } from './migrations';
import { mergeRec } from './merge';

interface RecRow {
  key: string; // collection + '\u0000' + id
  collection: CollectionName;
  id: string;
  updatedAt: string; // rec.updatedAt と同じ値 (updatedAt 索引用)
  rec: Rec<unknown>;
}

interface MetaRow {
  key: string;
  value: string;
}

/** テストから updatedAt 索引などを検証するための export (アプリ側からは使わない) */
export class SeikeiDbForTest extends Dexie {
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

class SeikeiDb extends SeikeiDbForTest {}

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
      // 削除済みでも新しい rec に deletedAt を含めないので、そのまま復活になる
      const rec: Rec<T> = {
        id: newId,
        collection,
        data,
        createdAt: existing !== undefined ? existing.rec.createdAt : now,
        updatedAt: now,
        updatedBy: deviceId,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };
      await db.recs.put({ key, collection, id: newId, updatedAt: rec.updatedAt, rec: rec as Rec<unknown> });
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
      await db.recs.put({ key, collection, id, updatedAt: rec.updatedAt, rec });
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

    async importAll(file: BackupFile): Promise<ImportReport> {
      // 1. app が違うなら全件 rejected で何もしない
      if (file.app !== 'seikei-game') {
        return { added: 0, updated: 0, unchanged: 0, rejected: file.recs.length };
      }
      // 2. 新しすぎる版なら全件 rejected
      if (file.schemaVersion > CURRENT_SCHEMA_VERSION) {
        return { added: 0, updated: 0, unchanged: 0, rejected: file.recs.length };
      }
      // 3. 古ければ現在の版へ移行する
      const incoming = migrateRecs(file.recs, MIGRATIONS, CURRENT_SCHEMA_VERSION);
      const report: ImportReport = { added: 0, updated: 0, unchanged: 0, rejected: 0 };
      const changed = new Set<CollectionName>();
      for (const inc of incoming) {
        const local = await db.recs.get(rowKey(inc.collection, inc.id));
        if (local === undefined) {
          await db.recs.put({
            key: rowKey(inc.collection, inc.id),
            collection: inc.collection,
            id: inc.id,
            updatedAt: inc.updatedAt,
            rec: inc,
          });
          report.added++;
          changed.add(inc.collection);
          continue;
        }
        const merged = mergeRec(local.rec, inc);
        if (
          JSON.stringify(merged) === JSON.stringify(local.rec)
        ) {
          report.unchanged++;
          continue;
        }
        await db.recs.put({
          key: rowKey(inc.collection, inc.id),
          collection: merged.collection,
          id: merged.id,
          updatedAt: merged.updatedAt,
          rec: merged,
        });
        report.updated++;
        changed.add(inc.collection);
      }
      // 5. 変更のあったコレクションの購読者に通知する
      for (const c of changed) {
        notify(c);
      }
      return report;
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
        updatedAt: rec.updatedAt,
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
