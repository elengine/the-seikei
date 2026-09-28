import { describe, it, expect } from 'vitest';
import type { Clock } from '../../src/core/clock/clock';
import { createFixedClock } from '../../src/core/clock/clock';
import type {
  BackupFile,
  CollectionName,
  Rec,
  Repository,
  RawStore,
} from '../../src/core/storage/types';
import { CURRENT_SCHEMA_VERSION } from '../../src/core/storage/types';

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const START_ISO = '2026-01-01T00:00:00.000Z';
const DEVICE_A = 'dev-A';

type Factory = (clock: Clock, deviceId: string) => Promise<Repository & RawStore>;

/**
 * どの Repository 実装でも守るべき振る舞いの契約テスト。
 * 実装側の前提: put 1 回につき clock.now() を 1 度だけ呼び、createdAt と updatedAt の両方に使う。
 * (createFixedClock は uuid() を呼んでも時刻が進むため、id 省略の put では
 *  uuid() を先に呼び、その後 now() を 1 度呼ぶ実装を想定する)
 */
export function runRepositoryContract(name: string, make: Factory): void {
  describe(name, () => {
    const makeRepo = async (): Promise<Repository & RawStore> => {
      const clock = createFixedClock(START_ISO);
      return make(clock, DEVICE_A);
    };

    it('1. 存在しない id の get は undefined', async () => {
      const repo = await makeRepo();
      const rec = await repo.get('settings', 'no-such-id');
      expect(rec).toBeUndefined();
    });

    it('2. id を省略した put で UUID v7・createdAt===updatedAt・updatedBy・schemaVersion', async () => {
      const repo = await makeRepo();
      const rec = await repo.put('settings', { a: 1 });
      expect(rec.id).toMatch(UUID_V7_RE);
      expect(rec.createdAt).toBe(rec.updatedAt);
      expect(rec.updatedBy).toBe(DEVICE_A);
      expect(rec.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(rec.collection).toBe('settings');
      expect(rec.data).toEqual({ a: 1 });
    });

    it('3. 同じ id に2回 put すると createdAt は1回目のまま・updatedAt が進む・data は新値', async () => {
      const repo = await makeRepo();
      const rec1 = await repo.put('records', { n: 1 }, 'rec-1');
      const rec2 = await repo.put('records', { n: 2 }, 'rec-1');
      expect(rec2.id).toBe('rec-1');
      expect(rec2.createdAt).toBe(rec1.createdAt);
      expect(rec2.updatedAt > rec1.updatedAt).toBe(true);
      expect(rec2.data).toEqual({ n: 2 });
      const fetched = await repo.get<{ n: number }>('records', 'rec-1');
      expect(fetched?.data).toEqual({ n: 2 });
      expect(fetched?.createdAt).toBe(rec1.createdAt);
    });

    it('4. list は削除済みを含まず id 昇順。別コレクションは含まない', async () => {
      const repo = await makeRepo();
      // id 昇順になるよう逆順に投入
      await repo.put('terms', { t: 'c' }, 'id-c');
      await repo.put('terms', { t: 'a' }, 'id-a');
      await repo.put('terms', { t: 'b' }, 'id-b');
      await repo.put('shop', { s: 1 }, 'shop-1');
      await repo.remove('terms', 'id-b');
      const listed = await repo.list<{ t: string }>('terms');
      expect(listed.map((r) => r.id)).toEqual(['id-a', 'id-c']);
      expect(listed.every((r) => r.collection === 'terms')).toBe(true);
    });

    it('5. remove 後 get は undefined・getRaw は deletedAt 付き。存在しない remove は例外なし', async () => {
      const repo = await makeRepo();
      await repo.put('memories', { m: 1 }, 'mem-1');
      await expect(repo.remove('memories', 'mem-1')).resolves.toBeUndefined();
      expect(await repo.get('memories', 'mem-1')).toBeUndefined();
      const raw = await repo.getRaw('memories', 'mem-1');
      expect(raw).toBeDefined();
      expect(raw?.deletedAt).toBeDefined();
      // 存在しない id の remove は例外を出さない
      await expect(repo.remove('memories', 'no-such-id')).resolves.toBeUndefined();
    });

    it('6. put と remove の後にそのコレクションの購読者が1回呼ばれる。解除後・別コレクションは呼ばれない', async () => {
      const repo = await makeRepo();
      let settingsCalls = 0;
      let shopCalls = 0;
      const unsubS = repo.subscribe('settings', () => {
        settingsCalls++;
      });
      repo.subscribe('shop', () => {
        shopCalls++;
      });
      await repo.put('settings', { a: 1 }, 's-1');
      expect(settingsCalls).toBe(1);
      await repo.put('shop', { s: 1 }, 'sh-1');
      expect(shopCalls).toBe(1);
      expect(settingsCalls).toBe(1); // 別コレクションの購読者は呼ばれない
      await repo.remove('settings', 's-1');
      expect(settingsCalls).toBe(2);
      unsubS();
      await repo.put('settings', { a: 2 }, 's-2');
      expect(settingsCalls).toBe(2); // 購読解除後は呼ばれない
      expect(shopCalls).toBe(1);
    });

    it('7. exportAll は削除済みを含む全 Rec と app・schemaVersion・deviceId を返す', async () => {
      const repo = await makeRepo();
      await repo.put('terms', { t: 1 }, 'id-1');
      await repo.put('terms', { t: 2 }, 'id-2');
      await repo.remove('terms', 'id-2');
      const file: BackupFile = await repo.exportAll();
      expect(file.app).toBe('seikei-game');
      expect(file.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(file.deviceId).toBe(DEVICE_A);
      expect(file.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      const ids = file.recs.map((r) => r.id).sort();
      expect(ids).toEqual(['id-1', 'id-2']); // 削除済みも含む
      const removed = file.recs.find((r) => r.id === 'id-2');
      expect(removed?.deletedAt).toBeDefined();
    });

    it('8. putRaw で入れた Rec は getRaw でそのまま(日時も含めて)取り出せる', async () => {
      const repo = await makeRepo();
      const rec: Rec<unknown> = {
        id: 'raw-1',
        collection: 'records',
        data: { x: '任意' },
        createdAt: '2020-05-05T05:05:05.005Z',
        updatedAt: '2021-06-06T06:06:06.006Z',
        updatedBy: 'dev-OTHER',
        schemaVersion: 99,
      };
      await repo.putRaw(rec);
      const got = await repo.getRaw('records', 'raw-1');
      expect(got).toEqual(rec); // 日時・端末ID・schemaVersion もそのまま
    });

    it('9. setMeta した値を getMeta で取り出せる', async () => {
      const repo = await makeRepo();
      expect(await repo.getMeta('k')).toBeUndefined();
      await repo.setMeta('k', 'v1');
      expect(await repo.getMeta('k')).toBe('v1');
      await repo.setMeta('k', 'v2');
      expect(await repo.getMeta('k')).toBe('v2');
    });

    it('補助: 各テストは新しい実装で clock を固定する(createdAt は ISO 8601 で START_ISO 以上)', async () => {
      const repo = await makeRepo();
      const rec = await repo.put('records', { n: 0 }, 'r0');
      // ISO 8601 UTC 形式であること。将来の同期実装で put 前に now() を呼ぶ可能性があるため、
      // START_ISO との完全一致ではなく「START_ISO 以上」までを確かめる。
      expect(rec.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(rec.createdAt >= START_ISO).toBe(true);
    });

    it('補助: allRaw は全コレクションの Rec を返す', async () => {
      const repo = await makeRepo();
      await repo.put('settings', { a: 1 }, 's-1');
      await repo.put('shop', { s: 1 }, 'sh-1');
      const all = await repo.allRaw();
      expect(all.map((r) => r.id).sort()).toEqual(['s-1', 'sh-1']);
    });
  });
}

// CollectionName の網羅性を型レベルで担保するためのダミー(実行時は何もしない)
const _allCollections: readonly CollectionName[] = [
  'settings', 'terms', 'zukan', 'records', 'sessions', 'shop', 'memories',
];
void _allCollections;
