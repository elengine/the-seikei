import type { Repository } from '../storage/types';

export interface TermEntry {
  key: string;
  value: string;
  defaultValue: string;
  description: string;
  overridden: boolean;
}

export interface Terms {
  t(key: string): string; // 上書きがあればそれ、なければ初期値。未知のキーはキー名をそのまま返す
  render(text: string): string; // '{{drum}}に巻く' → 'ドラムに巻く'。未知のキーは '{{キー}}' のまま残す
  set(key: string, value: string): Promise<void>; // 上書きを保存(terms コレクション、id = キー、data = { value })
  reset(key: string): Promise<void>; // 上書きを消す(論理削除)
  entries(): TermEntry[]; // 初期値ファイルの順
  onChange(cb: () => void): () => void;
}

type Defaults = Record<string, { value: string; description: string }>;

export async function createTerms(repo: Repository, defaults: Defaults): Promise<Terms> {
  const keys = Object.keys(defaults);
  const overrides = new Map<string, string>(); // key → value (上書き値)

  // 起動時に terms コレクションを読み込んでキャッシュする
  const recs = await repo.list<{ value: string }>('terms');
  for (const rec of recs) {
    if (keys.includes(rec.id) && typeof rec.data.value === 'string') {
      overrides.set(rec.id, rec.data.value);
    }
  }

  const listeners = new Set<() => void>();

  function notify(): void {
    for (const cb of listeners) {
      cb();
    }
  }

  function isKnown(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(defaults, key);
  }

  return {
    t(key: string): string {
      const override = overrides.get(key);
      if (override !== undefined) {
        return override;
      }
      const def = defaults[key];
      if (def === undefined) {
        return key; // 未知のキーはキー名をそのまま返す
      }
      return def.value;
    },

    render(text: string): string {
      return text.replace(/\{\{([^}]+)\}\}/g, (whole, key: string) => {
        const def = defaults[key];
        if (def === undefined && !overrides.has(key)) {
          return whole; // 未知のキーは '{{キー}}' のまま残す
        }
        const override = overrides.get(key);
        if (override !== undefined) {
          return override;
        }
        return def?.value ?? key;
      });
    },

    async set(key: string, value: string): Promise<void> {
      if (!isKnown(key)) {
        throw new Error(`unknown term key: ${key}`);
      }
      const trimmed = value.trim(); // 前後の空白は取り除く
      if (trimmed === '') {
        // 空文字になる場合は set せずに reset と同じにする
        await repo.remove('terms', key);
        overrides.delete(key);
        notify();
        return;
      }
      await repo.put<{ value: string }>('terms', { value: trimmed }, key);
      overrides.set(key, trimmed);
      notify();
    },

    async reset(key: string): Promise<void> {
      if (!isKnown(key)) {
        throw new Error(`unknown term key: ${key}`);
      }
      await repo.remove('terms', key); // 論理削除
      overrides.delete(key);
      notify();
    },

    entries(): TermEntry[] {
      return keys.map((key) => {
        const def = defaults[key]!;
        const override = overrides.get(key);
        return {
          key,
          value: override ?? def.value,
          defaultValue: def.value,
          description: def.description,
          overridden: override !== undefined,
        };
      });
    },

    onChange(cb: () => void): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
