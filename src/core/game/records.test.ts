import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createRecords } from './records';
import { createLocalRepository } from '../storage/localRepository';
import { createFixedClock } from '../clock/clock';

function makeRepo() {
  return createLocalRepository({ dbName: 'test-records', clock: createFixedClock('2026-09-28T00:00:00.000Z') });
}

beforeEach(async () => {
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name !== undefined && db.name.startsWith('test-records')) {
      indexedDB.deleteDatabase(db.name);
    }
  }
});

describe('records', () => {
  it('add を2回 (星2・星3) で plays 2・bestStars 3・best がキーごとに大きい方', async () => {
    const repo = await makeRepo();
    const records = await createRecords(repo);
    await records.add('creel', 2, { 'puzzle:s1': 2 });
    await records.add('creel', 3, { 'puzzle:s1': 3, 'puzzle:s2': 1 });
    const rec = records.get('creel');
    expect(rec.plays).toBe(2);
    expect(rec.bestStars).toBe(3);
    expect(rec.best).toEqual({ 'puzzle:s1': 3, 'puzzle:s2': 1 });
  });

  it('星の低い結果を後から add しても、bestStars と best は下がらない', async () => {
    const repo = await makeRepo();
    const records = await createRecords(repo);
    await records.add('creel', 3, { 'puzzle:s1': 3, 'puzzle:s2': 1 });
    await records.add('creel', 1, { 'puzzle:s1': 2, 'puzzle:s2': 0 });
    const rec = records.get('creel');
    expect(rec.bestStars).toBe(3);
    expect(rec.best).toEqual({ 'puzzle:s1': 3, 'puzzle:s2': 1 });
    expect(rec.plays).toBe(2);
  });

  it('無いゲームの get は { bestStars: 0, plays: 0, best: {} }', async () => {
    const repo = await makeRepo();
    const records = await createRecords(repo);
    expect(records.get('creel')).toEqual({ bestStars: 0, plays: 0, best: {} });
  });

  it('repo に直接 put した成績が get と onChange に反映される', async () => {
    const repo = await makeRepo();
    const records = await createRecords(repo);
    const cb = vi.fn();
    records.onChange(cb);
    await repo.put('records', { bestStars: 2, plays: 1, best: { 'puzzle:s1': 2 } }, 'creel');
    await vi.waitFor(() => {
      expect(records.get('creel').bestStars).toBe(2);
    });
    expect(cb).toHaveBeenCalled();
  });
});
