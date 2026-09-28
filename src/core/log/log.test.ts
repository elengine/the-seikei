import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { createLogger } from './log';
import { createLocalRepository } from '../storage/localRepository';
import { createFixedClock } from '../clock/clock';
import type { RawStore } from '../storage/types';

let dbSeq = 0;

async function makeStore() {
  const clock = createFixedClock('2026-09-28T00:00:00Z', 1000);
  const repo = await createLocalRepository({
    dbName: `log-test-${Date.now().toString(36)}-${dbSeq++}`,
    clock,
  });
  // RawStore は repo に含まれる
  return { store: repo as RawStore, clock };
}

describe('log', () => {
  it('1. max を 3 にして 5 件 log すると、新しい 3 件だけ残る', async () => {
    const { store, clock } = await makeStore();
    const logger = await createLogger(store, clock, 3);
    logger.log('info', '1つめ');
    logger.log('warn', '2つめ');
    logger.log('info', '3つめ');
    logger.log('error', '4つめ');
    logger.log('info', '5つめ');
    await logger.flush(); // 自動 flush を待たずに確定させる
    const es = logger.entries();
    expect(es).toHaveLength(3);
    expect(es.map((e) => e.message)).toEqual(['5つめ', '4つめ', '3つめ']); // 新しい順
    expect(es[0]!.level).toBe('info');
    expect(es[1]!.level).toBe('error');
  });

  it('2. flush 後に作り直した Logger でも entries が残る', async () => {
    const { store, clock } = await makeStore();
    const logger = await createLogger(store, clock, 100);
    logger.log('info', '保存される記録');
    await logger.flush();
    const logger2 = await createLogger(store, clock, 100); // 作り直す
    const es = logger2.entries();
    expect(es).toHaveLength(1);
    expect(es[0]!.message).toBe('保存される記録');
    expect(es[0]!.level).toBe('info');
  });

  it('追加: log() の後、1秒以内に自動で flush される (連続した log は1回にまとめる)', async () => {
    const { store, clock } = await makeStore();
    const setMetaSpy = vi.spyOn(store, 'setMeta');
    const logger = await createLogger(store, clock, 100);
    logger.log('info', '自動保存の確認1');
    logger.log('info', '自動保存の確認2'); // 連続しても setMeta はまだ呼ばれない
    expect(setMetaSpy).not.toHaveBeenCalled();
    // 1秒以上待つと自動で保存される
    await new Promise((r) => setTimeout(r, 1200));
    expect(setMetaSpy).toHaveBeenCalledTimes(1); // 連続した log は1回にまとまる
    const raw = await store.getMeta('logs');
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!) as { message: string }[];
    expect(parsed.map((e) => e.message)).toEqual(expect.arrayContaining(['自動保存の確認1', '自動保存の確認2']));
  }, 5000);

  it('追加: flush の失敗は無視する', async () => {
    const { clock } = await makeStore();
    const failingStore: RawStore = {
      deviceId: 'dev',
      getRaw: async () => undefined,
      putRaw: async () => undefined,
      allRaw: async () => [],
      getMeta: async () => undefined,
      setMeta: async () => {
        throw new Error('write failed');
      },
    };
    const logger = await createLogger(failingStore, clock, 100);
    logger.log('info', '失敗しても無視'); // 自動保存が失敗しても投げない
    await expect(logger.flush()).resolves.toBeUndefined(); // 例外を出さない
    expect(logger.entries()).toHaveLength(1); // メモリ上は残る
  });
});
