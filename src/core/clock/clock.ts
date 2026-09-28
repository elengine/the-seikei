export interface Clock {
  now(): string; // 現在時刻。ISO 8601 の UTC(例 '2026-10-01T11:00:00.000Z')
  uuid(): string; // UUID v7
}

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** ミリ秒時刻と 10 バイトの乱数部から UUID v7 を組み立てる。 */
function buildUuidV7(tsMs: number, rnd: Uint8Array): string {
  const b = new Uint8Array(16);
  const ts = BigInt(Math.floor(tsMs));
  // 先頭 48 bit = ミリ秒 Unix 時刻
  b[0] = Number((ts >> 40n) & 0xffn);
  b[1] = Number((ts >> 32n) & 0xffn);
  b[2] = Number((ts >> 24n) & 0xffn);
  b[3] = Number((ts >> 16n) & 0xffn);
  b[4] = Number((ts >> 8n) & 0xffn);
  b[5] = Number(ts & 0xffn);
  // version 7 / variant 10、残りは rnd
  b[6] = (rnd[0]! & 0x0f) | 0x70;
  b[7] = rnd[1]!;
  b[8] = (rnd[2]! & 0x3f) | 0x80;
  b[9] = rnd[3]!;
  b[10] = rnd[4]!;
  b[11] = rnd[5]!;
  b[12] = rnd[6]!;
  b[13] = rnd[7]!;
  b[14] = rnd[8]!;
  b[15] = rnd[9]!;
  let hex = '';
  for (const x of b) {
    hex += x.toString(16).padStart(2, '0');
  }
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  if (!UUID_V7_RE.test(id)) {
    throw new Error(`invalid uuid generated: ${id}`);
  }
  return id;
}

export function createSystemClock(): Clock {
  return {
    now(): string {
      return new Date().toISOString();
    },
    uuid(): string {
      const ts = Date.now();
      const rnd = new Uint8Array(10);
      crypto.getRandomValues(rnd);
      return buildUuidV7(ts, rnd);
    },
  };
}

/** now()/uuid() を呼ぶたびに stepMs(既定 1000)ずつ進む。uuid() は now() の時刻を使い、残りを連番で埋める(再現性のため)。 */
export function createFixedClock(startIso: string, stepMs: number = 1000): Clock {
  let current = Date.parse(startIso);
  if (Number.isNaN(current)) {
    throw new Error(`invalid ISO string: ${startIso}`);
  }
  let seq = 0;
  return {
    now(): string {
      const iso = new Date(current).toISOString();
      current += stepMs;
      return iso;
    },
    uuid(): string {
      const ts = current;
      current += stepMs;
      const n = seq++;
      const rnd = new Uint8Array(10);
      rnd[0] = n & 0xff;
      rnd[1] = (n >>> 8) & 0xff;
      rnd[2] = (n >>> 16) & 0xff;
      rnd[3] = (n >>> 24) & 0xff;
      for (let i = 4; i < 10; i++) {
        rnd[i] = (n + i) & 0xff;
      }
      return buildUuidV7(ts, rnd);
    },
  };
}

// ---- 擬似乱数 (mulberry32) ----

export type RngState = number; // 32bit 符号なし整数

export function seedFrom(n: number): RngState {
  return Math.trunc(n) >>> 0;
}

function mulberry32Step(state: RngState): [number, RngState] {
  let s = state >>> 0;
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const raw = (t ^ (t >>> 14)) >>> 0;
  return [raw, s];
}

export function nextFloat(s: RngState): [number, RngState] {
  const [raw, next] = mulberry32Step(s);
  return [raw / 4294967296, next];
}

export function nextInt(s: RngState, min: number, max: number): [number, RngState] {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new Error(`invalid range: min=${min}, max=${max}`);
  }
  const [raw, next] = mulberry32Step(s);
  const span = max - min + 1;
  return [min + (raw % span), next];
}

export function pick<T>(s: RngState, items: readonly T[]): [T, RngState] {
  if (items.length === 0) {
    throw new Error('pick: items must not be empty');
  }
  const [raw, next] = mulberry32Step(s);
  const item = items[raw % items.length];
  if (item === undefined) {
    throw new Error('pick: index out of range');
  }
  return [item, next];
}
