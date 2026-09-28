import type { CollectionName, Rec } from './types';

export type MergeRule = 'newer' | 'union' | 'max' | 'fieldNewer';

export const RULES: Record<CollectionName, MergeRule> = {
  settings: 'fieldNewer',
  terms: 'newer',
  zukan: 'union',
  records: 'max',
  sessions: 'newer',
  shop: 'newer',
  memories: 'newer',
};

/** 「新しい方」の判定。updatedAt が大きい方。同じなら updatedBy の文字列が大きい方。 */
export function isNewer(a: Rec<unknown>, b: Rec<unknown>): boolean {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt > b.updatedAt;
  }
  return a.updatedBy > b.updatedBy;
}

function newerOf(a: Rec<unknown>, b: Rec<unknown>): Rec<unknown> {
  return isNewer(a, b) ? a : b;
}

function sameKey(a: Rec<unknown>, b: Rec<unknown>): boolean {
  return a.collection === b.collection && a.id === b.id;
}

function buildMerged(
  base: Rec<unknown>, // updatedAt・updatedBy・deletedAt の基準 (新しい方)
  data: unknown,
): Rec<unknown> {
  const out: Rec<unknown> = {
    id: base.id,
    collection: base.collection,
    data,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    updatedBy: base.updatedBy,
    schemaVersion: base.schemaVersion,
  };
  if (base.deletedAt !== undefined) {
    out.deletedAt = base.deletedAt;
  }
  return out;
}

// ---- 各ルールの data 合成 ----

interface ZukanData {
  obtainedAt: string;
  source: string;
  count: number;
}

function mergeZukanData(a: Rec<unknown>, b: Rec<unknown>, newer: Rec<unknown>): ZukanData {
  const da = a.data as Partial<ZukanData>;
  const db = b.data as Partial<ZukanData>;
  // obtainedAt は早い方。source は obtainedAt が早い方のもの (同時刻なら isNewer の新しい方)。count は大きい方
  const aTime = da.obtainedAt ?? '';
  const bTime = db.obtainedAt ?? '';
  const earlier = aTime < bTime ? da : aTime > bTime ? db : (newer.data as Partial<ZukanData>);
  const countA = da.count ?? 0;
  const countB = db.count ?? 0;
  return {
    obtainedAt: aTime <= bTime ? aTime : bTime,
    source: earlier.source ?? '',
    count: countA >= countB ? countA : countB,
  };
}

interface RecordsData {
  bestStars: number;
  plays: number;
  best: Record<string, number>;
}

function mergeRecordsData(a: Rec<unknown>, b: Rec<unknown>): RecordsData {
  const da = a.data as Partial<RecordsData>;
  const db = b.data as Partial<RecordsData>;
  const bestA = da.best ?? {};
  const bestB = db.best ?? {};
  const best: Record<string, number> = { ...bestA };
  for (const key of Object.keys(bestB)) {
    const va = bestA[key];
    const vb = bestB[key];
    if (vb !== undefined && (va === undefined || vb > va)) {
      best[key] = vb;
    }
  }
  return {
    bestStars: Math.max(da.bestStars ?? 0, db.bestStars ?? 0),
    plays: Math.max(da.plays ?? 0, db.plays ?? 0),
    best,
  };
}

function mergeFieldNewerData(
  a: Rec<unknown>,
  b: Rec<unknown>,
  newer: Rec<unknown>,
  other: Rec<unknown>, // 新しい方でない方
): unknown {
  const da = (a.data ?? {}) as Record<string, unknown>;
  const db = (b.data ?? {}) as Record<string, unknown>;
  const ua = (da._updated ?? {}) as Record<string, string>;
  const ub = (db._updated ?? {}) as Record<string, string>;
  const out: Record<string, unknown> = {};
  const outUpdated: Record<string, string> = {};
  const keys = new Set([...Object.keys(da), ...Object.keys(db)]);
  keys.delete('_updated');
  const allUpdatedKeys = new Set([...Object.keys(ua), ...Object.keys(ub)]);
  for (const key of keys) {
    const ta = ua[key];
    const tb = ub[key];
    if (ta !== undefined && tb !== undefined) {
      // キーごとの更新日時が新しい方の値を採る。同時刻なら updatedBy の大きい方
      const aWins = ta > tb || (ta === tb && a.updatedBy >= b.updatedBy);
      out[key] = aWins ? da[key] : db[key];
      outUpdated[key] = ta >= tb ? ta : tb;
    } else if (ta !== undefined || tb !== undefined) {
      // 片方にしか _updated[キー] がない場合はそちらを採る
      out[key] = ta !== undefined ? da[key] : db[key];
      outUpdated[key] = (ta !== undefined ? ta : tb) as string;
    } else {
      // どちらにもない場合は、Rec 全体で新しい方の値を採る。新しい方に無ければ古い方の値を残す
      const newerData = newer.data as Record<string, unknown> | undefined;
      const olderData = other.data as Record<string, unknown> | undefined;
      const nv = newerData?.[key];
      out[key] = nv !== undefined ? nv : olderData?.[key];
    }
  }
  // 結果の _updated はキーごとに新しい方の日時 (_updated にのみ存在するキーも保持)
  for (const key of allUpdatedKeys) {
    if (!(key in outUpdated)) {
      const ta = ua[key];
      const tb = ub[key];
      if (ta !== undefined && tb !== undefined) {
        outUpdated[key] = ta >= tb ? ta : tb;
      } else {
        outUpdated[key] = (ta ?? tb) as string;
      }
    }
  }
  out._updated = outUpdated;
  return out;
}

/**
 * 同じ collection・同じ id の 2つの Rec を統合し、残すべき Rec を返す。
 * ルールは RULES[collection] で決まる。どちらかと完全に同じなら、その Rec をそのまま返す。
 */
export function mergeRec(a: Rec<unknown>, b: Rec<unknown>): Rec<unknown> {
  if (!sameKey(a, b)) {
    throw new Error(`mergeRec: collection/id mismatch (${a.collection}/${a.id} vs ${b.collection}/${b.id})`);
  }
  const newer = newerOf(a, b);
  const rule = RULES[a.collection];

  if (rule === 'newer') {
    // 削除(deletedAt)も新しい方に従う。完全一致ならそのまま返す
    if (
      JSON.stringify(a) === JSON.stringify(b)
    ) {
      return a;
    }
    return newer;
  }
  if (rule === 'union') {
    // 図鑑: 削除は無視する (どちらかが入手済みなら入手済み)。結果の deletedAt は付けない
    const data = mergeZukanData(a, b, newer);
    if (
      JSON.stringify(data) === JSON.stringify(a.data) &&
      a.deletedAt === undefined &&
      a.updatedAt === newer.updatedAt &&
      a.updatedBy === newer.updatedBy
    ) {
      return a;
    }
    if (
      JSON.stringify(data) === JSON.stringify(b.data) &&
      b.deletedAt === undefined &&
      b.updatedAt === newer.updatedAt &&
      b.updatedBy === newer.updatedBy
    ) {
      return b;
    }
    const out: Rec<unknown> = {
      id: newer.id,
      collection: newer.collection,
      data,
      createdAt: newer.createdAt,
      updatedAt: newer.updatedAt,
      updatedBy: newer.updatedBy,
      schemaVersion: newer.schemaVersion,
    };
    return out;
  }
  if (rule === 'max') {
    // 成績: 削除は newer と同じ扱い (新しい方に従う)
    const data = mergeRecordsData(a, b);
    if (
      JSON.stringify(data) === JSON.stringify(a.data) &&
      a.deletedAt === newer.deletedAt &&
      a.updatedAt === newer.updatedAt &&
      a.updatedBy === newer.updatedBy
    ) {
      return a;
    }
    if (
      JSON.stringify(data) === JSON.stringify(b.data) &&
      b.deletedAt === newer.deletedAt &&
      b.updatedAt === newer.updatedAt &&
      b.updatedBy === newer.updatedBy
    ) {
      return b;
    }
    return buildMerged(newer, data);
  }
  // fieldNewer
  const other = newer === a ? b : a;
  const data = mergeFieldNewerData(a, b, newer, other);
  if (
    JSON.stringify(data) === JSON.stringify(a.data) &&
    a.deletedAt === newer.deletedAt &&
    a.updatedAt === newer.updatedAt &&
    a.updatedBy === newer.updatedBy
  ) {
    return a;
  }
  if (
    JSON.stringify(data) === JSON.stringify(b.data) &&
    b.deletedAt === newer.deletedAt &&
    b.updatedAt === newer.updatedAt &&
    b.updatedBy === newer.updatedBy
  ) {
    return b;
  }
  return buildMerged(newer, data);
}
