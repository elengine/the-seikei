import type { RawStore } from '../storage/types';
import type { Clock } from '../clock/clock';

export interface LogEntry {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface Logger {
  log(level: LogEntry['level'], message: string): void; // 同期。保存は後で行う
  entries(): LogEntry[]; // 新しい順
  flush(): Promise<void>; // meta 'logs' に保存
}

const LOGS_META_KEY = 'logs';
const AUTOFUSH_MS = 1000;

export async function createLogger(store: RawStore, clock: Clock, max: number = 100): Promise<Logger> {
  let entries: LogEntry[] = [];

  // 起動時に meta 'logs' を読み込む
  try {
    const raw = await store.getMeta(LOGS_META_KEY);
    if (raw !== undefined) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        entries = parsed.filter(
          (e): e is LogEntry =>
            typeof e === 'object' && e !== null && typeof (e as LogEntry).at === 'string' && typeof (e as LogEntry).message === 'string',
        );
      }
    }
  } catch {
    // 読めなくても日志は新規に始める
  }

  function trim(): void {
    if (entries.length > max) {
      entries = entries.slice(0, max); // 古いもの (配列の後ろ) から捨てる
    }
  }

  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  async function save(): Promise<void> {
    try {
      await store.setMeta(LOGS_META_KEY, JSON.stringify(entries));
    } catch {
      // flush の失敗は無視する
    }
  }

  return {
    log(level: LogEntry['level'], message: string): void {
      entries.unshift({ at: clock.now(), level, message }); // 新しい順を保つ
      trim();
      // log() の後、1秒以内に自動で flush (連続した log は1回にまとめる)
      if (flushTimer === null) {
        flushTimer = setTimeout(() => {
          flushTimer = null;
          void save();
        }, AUTOFUSH_MS);
      }
    },

    entries(): LogEntry[] {
      return [...entries];
    },

    async flush(): Promise<void> {
      // 予約済みの自動保存があれば取り消して今すぐ保存
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await save();
    },
  };
}
