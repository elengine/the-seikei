import type { Rec, RawStore } from './types';

export interface Migration {
  from: number; // この版の Rec を
  to: number; // この版にする (from + 1 であること)
  migrate(rec: Rec<unknown>): Rec<unknown>;
}

/** P0 では空 */
export const MIGRATIONS: Migration[] = [];

function findMigration(migrations: Migration[], from: number): Migration {
  const m = migrations.find((x) => x.from === from);
  if (m === undefined) {
    throw new Error(`migration not found: from version ${from}`);
  }
  return m;
}

/** Rec の配列を targetVersion まで順に移行する (純粋関数)。対象より新しい Rec はそのまま。 */
export function migrateRecs(
  recs: Rec<unknown>[],
  migrations: Migration[],
  targetVersion: number,
): Rec<unknown>[] {
  return recs.map((r) => {
    let cur = r;
    while (cur.schemaVersion < targetVersion) {
      const m = findMigration(migrations, cur.schemaVersion);
      cur = m.migrate(cur);
    }
    return cur;
  });
}

/**
 * store 内の全 Rec を targetVersion まで順に移行して保存する。
 * meta 'schemaVersion' を読み、なければ targetVersion を書いて終わる (初回起動)。
 * 全 Rec を移行し終えてから保存する (途中で例外が出たら保存済みデータを変えない)。
 * 移行が終わったら meta 'schemaVersion' を更新する。
 */
export async function runMigrations(
  store: RawStore,
  migrations: Migration[],
  targetVersion: number,
): Promise<{ from: number; to: number; migrated: number }> {
  const stored = await store.getMeta('schemaVersion');
  if (stored === undefined) {
    // 初回起動: 何も移行せず targetVersion を書く
    await store.setMeta('schemaVersion', String(targetVersion));
    return { from: targetVersion, to: targetVersion, migrated: 0 };
  }
  const from = Number(stored);
  if (!Number.isInteger(from) || from < 0) {
    throw new Error(`invalid schemaVersion meta: ${stored}`);
  }
  if (from >= targetVersion) {
    return { from, to: from, migrated: 0 };
  }

  // 先に全 Rec を移行してから保存する (途中で例外が出たら何も書き換えない)
  const all = await store.allRaw();
  const migrated = migrateRecs(all, migrations, targetVersion);
  for (const rec of migrated) {
    await store.putRaw(rec);
  }
  await store.setMeta('schemaVersion', String(targetVersion));
  return { from, to: targetVersion, migrated: migrated.length };
}
