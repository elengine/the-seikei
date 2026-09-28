import type { GameId } from '../game/types';
import type { Repository, Rec } from '../storage/types';
import type { Clock } from '../clock/clock';

export type FontScale = 'large' | 'xlarge';

export interface SettingsData {
  playerName: string;
  shopName: string;
  fontScale: FontScale;
  soundOn: boolean;
  volume: number; // 0〜1
  tutorialSeen: Partial<Record<GameId, boolean>>;
}

export const DEFAULT_SETTINGS: SettingsData = {
  playerName: '',
  shopName: '整経所',
  fontScale: 'large',
  soundOn: true,
  volume: 0.7,
  tutorialSeen: {},
};

/** settings コレクションの data の形。SettingsData に項目ごとの更新日時を足したもの */
export interface StoredSettings extends SettingsData {
  _updated: Record<string, string>;
}

export interface SettingsService {
  get(): SettingsData; // 同期的に返す (キャッシュ)。_updated は含めない
  update(patch: Partial<SettingsData>): Promise<void>;
  onChange(cb: (s: SettingsData) => void): () => void;
}

const SETTINGS_ID = 'main';

/** 保存データを SettingsData に整える。無いキーは既定値で補う (将来キーが増えても壊れない) */
function normalize(data: Partial<SettingsData> | undefined): SettingsData {
  const d = data ?? {};
  return {
    playerName: typeof d.playerName === 'string' ? d.playerName : DEFAULT_SETTINGS.playerName,
    shopName: typeof d.shopName === 'string' ? d.shopName : DEFAULT_SETTINGS.shopName,
    fontScale: d.fontScale === 'xlarge' ? 'xlarge' : DEFAULT_SETTINGS.fontScale,
    soundOn: typeof d.soundOn === 'boolean' ? d.soundOn : DEFAULT_SETTINGS.soundOn,
    volume: typeof d.volume === 'number' ? d.volume : DEFAULT_SETTINGS.volume,
    tutorialSeen: d.tutorialSeen !== undefined && typeof d.tutorialSeen === 'object' ? d.tutorialSeen : DEFAULT_SETTINGS.tutorialSeen,
  };
}

export async function createSettingsService(repo: Repository, clock: Clock): Promise<SettingsService> {
  let cache: SettingsData;
  let stored: StoredSettings;

  // 起動時に読み込む。削除済み・未保存なら既定値
  const rec = await repo.get<StoredSettings>('settings', SETTINGS_ID);
  if (rec !== undefined && !rec.deletedAt) {
    stored = { ...normalize(rec.data), _updated: rec.data._updated ?? {} };
  } else {
    stored = { ...DEFAULT_SETTINGS, _updated: {} };
  }
  cache = strip(stored);

  const listeners = new Set<(s: SettingsData) => void>();

  function strip(s: StoredSettings): SettingsData {
    // get() は _updated を含めずに返す
    const { _updated, ...rest } = s;
    void _updated;
    return { ...rest, tutorialSeen: { ...rest.tutorialSeen } };
  }

  function notify(): void {
    for (const cb of listeners) {
      cb(cache);
    }
  }

  return {
    get(): SettingsData {
      return cache;
    },

    async update(patch: Partial<SettingsData>): Promise<void> {
      const now = clock.now();
      const next: StoredSettings = {
        ...stored,
        ...patch,
        tutorialSeen: { ...stored.tutorialSeen, ...(patch.tutorialSeen ?? {}) },
        _updated: { ...stored._updated },
      };
      // patch に含まれるキーだけ _updated[キー] = clock.now()
      for (const key of Object.keys(patch)) {
        next._updated[key] = now;
      }
      await repo.put<StoredSettings>('settings', next, SETTINGS_ID);
      stored = next;
      cache = strip(next);
      notify();
    },

    onChange(cb: (s: SettingsData) => void): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

/** テスト・移行用: settings Rec をそのまま読む (settings.test.ts のテスト3で使う) */
export type SettingsRec = Rec<StoredSettings>;
