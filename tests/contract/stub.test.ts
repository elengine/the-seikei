import { describe } from 'vitest';
import type { Clock } from '../../src/core/clock/clock';
import type { CollectionName, Rec, Repository, RawStore } from '../../src/core/storage/types';
import { CURRENT_SCHEMA_VERSION } from '../../src/core/storage/types';
import { runRepositoryContract } from './repositoryContract';

type Factory = (clock: Clock, deviceId: string) => Promise<Repository & RawStore>;

/**
 * すべて未実装のメソッドを持つスタブ。
 * runRepositoryContract を「実装が存在しない段階でも」型の上で呼べることを確かめるためのもの。
 * T0-05 で本物の実装に対するテストファイルを別に作るので、ここでは skip して登録だけを行う。
 */

const stubClock: Clock = {
  now(): string {
    throw new Error('stub: not implemented');
  },
  uuid(): string {
    throw new Error('stub: not implemented');
  },
};

const stubRec = (collection: CollectionName, id: string): Rec<unknown> => ({
  id,
  collection,
  data: {},
  createdAt: '',
  updatedAt: '',
  updatedBy: 'stub',
  schemaVersion: CURRENT_SCHEMA_VERSION,
});

function makeStub(): Repository & RawStore {
  return {
    deviceId: 'stub-device',
    get: () => Promise.reject(new Error('stub: not implemented')),
    list: () => Promise.reject(new Error('stub: not implemented')),
    put: () => Promise.reject(new Error('stub: not implemented')),
    remove: () => Promise.reject(new Error('stub: not implemented')),
    subscribe: () => () => undefined,
    exportAll: () => Promise.reject(new Error('stub: not implemented')),
    importAll: () => Promise.reject(new Error('stub: not implemented')),
    getRaw: () => Promise.reject(new Error('stub: not implemented')),
    putRaw: () => Promise.reject(new Error('stub: not implemented')),
    allRaw: () => Promise.reject(new Error('stub: not implemented')),
    getMeta: () => Promise.reject(new Error('stub: not implemented')),
    setMeta: () => Promise.reject(new Error('stub: not implemented')),
  };
}

// 型の上で Factory に適合することを確かめてから skip 登録する
const makeStubFactory: Factory = () => Promise.resolve(makeStub());

describe.skip('stub repository (T0-05 で本実装に差し替え)', () => {
  // runRepositoryContract は内部で describe を登録するため、
  // skip の確認目的では「呼び出し可能であること」自体を型で担保する。
  // 実行時には skip され何も走らない。
  runRepositoryContract('stub repository contract', makeStubFactory);
});

// stub が Repository & RawStore に適合することの静的確認
const _typeCheck: Repository & RawStore = makeStub();
void _typeCheck;
void stubRec;
void stubClock;
