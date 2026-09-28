import { describe, it, expect } from 'vitest';
import { mergeRec, isNewer, RULES } from './merge';
import type { Rec } from './types';

function rec(overrides: Partial<Rec<unknown>> & { updatedAt: string }): Rec<unknown> {
  return {
    id: 'r-1',
    collection: 'records',
    data: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'dev-A',
    schemaVersion: 1,
    ...overrides,
  };
}

function zukanData(obtainedAt: string, source: string, count: number) {
  return { obtainedAt, source, count };
}

function recordsData(bestStars: number, plays: number, best: Record<string, number>) {
  return { bestStars, plays, best };
}

describe('RULES', () => {
  it('全コレクションにルールが割り当てられている', () => {
    expect(Object.keys(RULES).sort()).toEqual(
      ['memories', 'records', 'sessions', 'settings', 'shop', 'terms', 'zukan'].sort(),
    );
    expect(RULES.settings).toBe('fieldNewer');
    expect(RULES.terms).toBe('newer');
    expect(RULES.zukan).toBe('union');
    expect(RULES.records).toBe('max');
  });
});

describe('isNewer', () => {
  it('updatedAt が大きい方が新しい', () => {
    const a = rec({ updatedAt: '2026-01-01T00:00:01.000Z' });
    const b = rec({ updatedAt: '2026-01-01T00:00:02.000Z', updatedBy: 'dev-A' });
    expect(isNewer(b, a)).toBe(true);
    expect(isNewer(a, b)).toBe(false);
  });

  it('updatedAt が同じときは updatedBy の文字列が大きい方が新しい', () => {
    const a = rec({ updatedAt: '2026-01-01T00:00:01.000Z', updatedBy: 'dev-A' });
    const b = rec({ updatedAt: '2026-01-01T00:00:01.000Z', updatedBy: 'dev-B' });
    expect(isNewer(b, a)).toBe(true);
    expect(isNewer(a, b)).toBe(false);
  });
});

describe('newer ルール (terms)', () => {
  it('新しい方が採られる', () => {
    const a = rec({ collection: 'terms', updatedAt: '2026-01-01T00:00:01.000Z', data: { v: 1 } });
    const b = rec({ collection: 'terms', updatedAt: '2026-01-01T00:00:02.000Z', data: { v: 2 } });
    const m = mergeRec(a, b);
    expect(m.data).toEqual({ v: 2 });
    expect(m.updatedAt).toBe('2026-01-01T00:00:02.000Z');
  });

  it('updatedAt が同じときは updatedBy の大きい方', () => {
    const a = rec({ collection: 'terms', updatedAt: '2026-01-01T00:00:01.000Z', updatedBy: 'dev-A', data: { v: 'a' } });
    const b = rec({ collection: 'terms', updatedAt: '2026-01-01T00:00:01.000Z', updatedBy: 'dev-B', data: { v: 'b' } });
    expect(mergeRec(a, b).data).toEqual({ v: 'b' });
    expect(mergeRec(b, a).data).toEqual({ v: 'b' });
  });

  it('新しい方が削除済みなら削除済みになる', () => {
    const a = rec({ collection: 'terms', updatedAt: '2026-01-01T00:00:01.000Z', data: { v: 1 } });
    const b = rec({
      collection: 'terms',
      updatedAt: '2026-01-01T00:00:02.000Z',
      data: { v: 1 },
      deletedAt: '2026-01-01T00:00:02.000Z',
    });
    expect(mergeRec(a, b).deletedAt).toBeDefined();
    expect(mergeRec(b, a).deletedAt).toBeDefined();
  });

  it('古い方が削除済みなら削除は解除される', () => {
    const a = rec({
      collection: 'terms',
      updatedAt: '2026-01-01T00:00:01.000Z',
      deletedAt: '2026-01-01T00:00:01.000Z',
      data: { v: 1 },
    });
    const b = rec({ collection: 'terms', updatedAt: '2026-01-01T00:00:02.000Z', data: { v: 1 } });
    expect(mergeRec(a, b).deletedAt).toBeUndefined();
  });
});

describe('union ルール (zukan)', () => {
  it('早い obtainedAt とその source が残り、count は大きい方', () => {
    const a = rec({
      collection: 'zukan',
      updatedAt: '2026-01-01T00:00:02.000Z',
      data: zukanData('2026-01-02T00:00:00.000Z', 'shop-A', 3),
    });
    const b = rec({
      collection: 'zukan',
      updatedAt: '2026-01-01T00:00:01.000Z',
      data: zukanData('2026-01-01T00:00:00.000Z', 'stage-1', 5),
    });
    const m1 = mergeRec(a, b);
    expect(m1.data).toEqual(zukanData('2026-01-01T00:00:00.000Z', 'stage-1', 5));
    const m2 = mergeRec(b, a);
    expect(m2.data).toEqual(zukanData('2026-01-01T00:00:00.000Z', 'stage-1', 5));
    // updatedAt・updatedBy は新しい方
    expect(m1.updatedAt).toBe('2026-01-01T00:00:02.000Z');
    expect(m1.updatedBy).toBe('dev-A');
  });

  it('片方が削除済みでも入手済みのまま (deletedAt は付かない)', () => {
    const a = rec({
      collection: 'zukan',
      updatedAt: '2026-01-01T00:00:02.000Z',
      deletedAt: '2026-01-01T00:00:02.000Z',
      data: zukanData('2026-01-02T00:00:00.000Z', 'shop-A', 3),
    });
    const b = rec({
      collection: 'zukan',
      updatedAt: '2026-01-01T00:00:01.000Z',
      data: zukanData('2026-01-01T00:00:00.000Z', 'stage-1', 1),
    });
    expect(mergeRec(a, b).deletedAt).toBeUndefined();
    expect(mergeRec(b, a).deletedAt).toBeUndefined();
  });
});

describe('max ルール (records)', () => {
  it('bestStars・plays・best の各キーで大きい方。片方にしかない best のキーが残る', () => {
    const a = rec({
      updatedAt: '2026-01-01T00:00:02.000Z',
      data: recordsData(4, 10, { stage1: 3, stage2: 2 }),
    });
    const b = rec({
      updatedAt: '2026-01-01T00:00:01.000Z',
      data: recordsData(5, 7, { stage1: 2, stage3: 4 }),
    });
    const m1 = mergeRec(a, b);
    expect(m1.data).toEqual(recordsData(5, 10, { stage1: 3, stage2: 2, stage3: 4 }));
    const m2 = mergeRec(b, a);
    expect(m2.data).toEqual(recordsData(5, 10, { stage1: 3, stage2: 2, stage3: 4 }));
    expect(m1.updatedAt).toBe('2026-01-01T00:00:02.000Z');
  });

  it('新しい方が削除済みなら削除済みになる', () => {
    const a = rec({ updatedAt: '2026-01-01T00:00:01.000Z', data: recordsData(1, 1, {}) });
    const b = rec({
      updatedAt: '2026-01-01T00:00:02.000Z',
      deletedAt: '2026-01-01T00:00:02.000Z',
      data: recordsData(1, 1, {}),
    });
    expect(mergeRec(a, b).deletedAt).toBeDefined();
  });
});

describe('fieldNewer ルール (settings)', () => {
  it('A 端末で名前、B 端末で屋号を変えた2つを統合すると両方の変更が残る', () => {
    // 共通の元: { name: '旧', ya: '旧' }
    const a = rec({
      collection: 'settings',
      updatedAt: '2026-01-01T00:00:02.000Z',
      updatedBy: 'dev-A',
      data: {
        name: 'あたらしい名前',
        ya: '旧',
        _updated: { name: '2026-01-01T00:00:02.000Z', ya: '2026-01-01T00:00:00.000Z' },
      },
    });
    const b = rec({
      collection: 'settings',
      updatedAt: '2026-01-01T00:00:01.000Z',
      updatedBy: 'dev-B',
      data: {
        name: '旧',
        ya: 'あたらしい屋号',
        _updated: { name: '2026-01-01T00:00:00.000Z', ya: '2026-01-01T00:00:01.000Z' },
      },
    });
    const m = mergeRec(a, b);
    expect(m.data).toEqual({
      name: 'あたらしい名前',
      ya: 'あたらしい屋号',
      _updated: { name: '2026-01-01T00:00:02.000Z', ya: '2026-01-01T00:00:01.000Z' },
    });
    expect(mergeRec(b, a).data).toEqual(m.data);
  });

  it('片方にしか _updated[キー] がない場合はそちらを採る', () => {
    const a = rec({
      collection: 'settings',
      updatedAt: '2026-01-01T00:00:01.000Z',
      data: { name: 'A側', _updated: { name: '2026-01-01T00:00:01.000Z' } },
    });
    const b = rec({
      collection: 'settings',
      updatedAt: '2026-01-01T00:00:02.000Z',
      data: { name: '旧', extra: 'Bのみ', _updated: { name: '2026-01-01T00:00:00.000Z', extra: '2026-01-01T00:00:02.000Z' } },
    });
    const m = mergeRec(a, b);
    expect((m.data as Record<string, unknown>).name).toBe('A側');
    expect((m.data as Record<string, unknown>).extra).toBe('Bのみ');
  });

  it('どちらにも _updated[キー] がない場合は Rec 全体で新しい方の値を採る', () => {
    const a = rec({
      collection: 'settings',
      updatedAt: '2026-01-01T00:00:01.000Z',
      data: { flag: 'a側' },
    });
    const b = rec({
      collection: 'settings',
      updatedAt: '2026-01-01T00:00:02.000Z',
      data: { flag: 'b側' },
    });
    const m = mergeRec(a, b);
    expect((m.data as Record<string, unknown>).flag).toBe('b側');
    expect(mergeRec(b, a).data).toEqual(m.data);
  });

  it('結果の _updated はキーごとに新しい方の日時', () => {
    const a = rec({
      collection: 'settings',
      updatedAt: '2026-01-01T00:00:02.000Z',
      data: { name: 'x', _updated: { name: '2026-01-01T00:00:02.000Z' } },
    });
    const b = rec({
      collection: 'settings',
      updatedAt: '2026-01-01T00:00:01.000Z',
      data: { name: 'y', _updated: { name: '2026-01-01T00:00:03.000Z' } },
    });
    // _updated.name は b の 00:00:03 が新しい → b の name を採る
    const m = mergeRec(a, b);
    const mData = m.data as Record<string, unknown>;
    expect(mData.name).toBe('y');
    expect((mData._updated as Record<string, string>).name).toBe('2026-01-01T00:00:03.000Z');
  });
});

describe('例外と対称性', () => {
  it('collection か id が違う Rec を渡すと例外', () => {
    const a = rec({ collection: 'terms', updatedAt: '2026-01-01T00:00:01.000Z' });
    const b = rec({ collection: 'shop', updatedAt: '2026-01-01T00:00:01.000Z' });
    expect(() => mergeRec(a, b)).toThrow();
    const c = rec({ id: 'r-2', updatedAt: '2026-01-01T00:00:01.000Z' });
    expect(() => mergeRec(a, c)).toThrow();
  });

  it('mergeRec(a, b) と mergeRec(b, a) の結果が (data・deletedAt・updatedAt で) 同じになる — 全ルール', () => {
    const pairs: Array<[Rec<unknown>, Rec<unknown>]> = [
      // newer
      [
        rec({ collection: 'terms', updatedAt: '2026-01-01T00:00:01.000Z', data: { v: 'a' } }),
        rec({ collection: 'terms', updatedAt: '2026-01-01T00:00:02.000Z', updatedBy: 'dev-B', data: { v: 'b' } }),
      ],
      // union
      [
        rec({ collection: 'zukan', updatedAt: '2026-01-01T00:00:01.000Z', data: zukanData('2026-01-03T00:00:00.000Z', 'x', 2) }),
        rec({ collection: 'zukan', updatedAt: '2026-01-01T00:00:02.000Z', updatedBy: 'dev-B', data: zukanData('2026-01-02T00:00:00.000Z', 'y', 9) }),
      ],
      // max
      [
        rec({ updatedAt: '2026-01-01T00:00:01.000Z', data: recordsData(2, 3, { s1: 1 }) }),
        rec({ updatedAt: '2026-01-01T00:00:02.000Z', updatedBy: 'dev-B', data: recordsData(4, 1, { s2: 5 }) }),
      ],
      // fieldNewer
      [
        rec({ collection: 'settings', updatedAt: '2026-01-01T00:00:01.000Z', data: { n: 'a', _updated: { n: '2026-01-01T00:00:01.000Z' } } }),
        rec({ collection: 'settings', updatedAt: '2026-01-01T00:00:02.000Z', updatedBy: 'dev-B', data: { n: 'b', _updated: { n: '2026-01-01T00:00:00.000Z' } } }),
      ],
    ];
    for (const [a, b] of pairs) {
      const m1 = mergeRec(a, b);
      const m2 = mergeRec(b, a);
      expect(m2.data).toEqual(m1.data);
      expect(m2.deletedAt).toBe(m1.deletedAt);
      expect(m2.updatedAt).toBe(m1.updatedAt);
    }
  });

  it('どちらかと完全に同じなら、その Rec をそのまま返す (同一インスタンスか同値)', () => {
    const a = rec({ collection: 'terms', updatedAt: '2026-01-01T00:00:01.000Z', data: { v: 1 } });
    const same = { ...a };
    // 「その Rec をそのまま返してよい」= 同値の Rec が返ればよい (仕様書の文言)
    expect(mergeRec(a, same)).toEqual(a);
    expect(mergeRec(same, a)).toEqual(a);
    // 自分自身とマージした場合は必ず同一インスタンス
    expect(mergeRec(a, a)).toBe(a);
  });
});
