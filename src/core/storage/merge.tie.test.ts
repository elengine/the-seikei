import { describe, it, expect } from 'vitest';
import { mergeRec } from './merge';
import type { Rec } from './types';

/** 同点決着 (tie-break) のテスト。同時刻でも引数の順番に依存しないこと。 */

function rec(overrides: Partial<Rec<unknown>> & { updatedAt: string }): Rec<unknown> {
  return {
    id: 'r-1',
    collection: 'settings',
    data: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'dev-A',
    schemaVersion: 1,
    ...overrides,
  };
}

const T1 = '2026-01-01T00:00:01.000Z';

describe('T0-06 追加修正: 同点決着', () => {
  describe('fieldNewer: 同じキーの _updated が同時刻', () => {
    it('同時刻のときは updatedBy の大きい方の値を採る (mergeRec(a,b) === mergeRec(b,a))', () => {
      const a = rec({
        updatedAt: T1,
        updatedBy: 'dev-A',
        data: { name: 'A側', _updated: { name: T1 } },
      });
      const b = rec({
        updatedAt: T1,
        updatedBy: 'dev-B', // 文字列として大きい
        data: { name: 'B側', _updated: { name: T1 } },
      });
      const m1 = mergeRec(a, b);
      const m2 = mergeRec(b, a);
      expect(m1.data).toEqual(m2.data);
      expect((m1.data as Record<string, unknown>).name).toBe('B側'); // updatedBy が大きい方
    });
  });

  describe('fieldNewer: どちらの _updated にも無いキーで新しい方に値が無い場合', () => {
    it('新しい方に無ければ古い方の値を残す (undefined で消さない)', () => {
      // b が新しい (updatedAt 大) だが、キー legacy は b の data に無い
      const a = rec({
        updatedAt: '2026-01-01T00:00:00.000Z',
        updatedBy: 'dev-A',
        data: { legacy: 'のこるべき値' },
      });
      const b = rec({
        updatedAt: '2026-01-01T00:00:01.000Z',
        updatedBy: 'dev-B',
        data: { fresh: 'Bのみ' },
      });
      const m1 = mergeRec(a, b);
      const mData = m1.data as Record<string, unknown>;
      expect(mData.legacy).toBe('のこるべき値'); // 古い方の値が残る
      expect(mData.fresh).toBe('Bのみ');
      // 逆順でも同じ
      const m2 = mergeRec(b, a);
      expect((m2.data as Record<string, unknown>).legacy).toBe('のこるべき値');
    });
  });

  describe('union: obtainedAt が同じで source が違う場合', () => {
    it('同時刻のときは isNewer で新しい方の source を採る (引数順で変わらない)', () => {
      const mk = (updatedBy: string, source: string) =>
        rec({
          collection: 'zukan',
          updatedAt: T1,
          updatedBy,
          data: { obtainedAt: '2026-01-01T00:00:00.000Z', source, count: 1 },
        });
      const a = mk('dev-A', 'stage-1');
      const b = mk('dev-B', 'stage-9'); // updatedBy が大きい
      const m1 = mergeRec(a, b);
      const m2 = mergeRec(b, a);
      expect(m1.data).toEqual(m2.data);
      expect((m1.data as Record<string, unknown>).source).toBe('stage-9'); // isNewer の新しい方
      expect((m1.data as Record<string, unknown>).obtainedAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });
});
