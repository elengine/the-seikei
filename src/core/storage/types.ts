export type CollectionName =
  | 'settings' | 'terms' | 'zukan' | 'records' | 'sessions' | 'shop' | 'memories';

export interface Rec<T> {
  id: string;
  collection: CollectionName;
  data: T;
  createdAt: string;
  updatedAt: string;
  updatedBy: string; // 端末ID
  deletedAt?: string;
  schemaVersion: number;
}

export interface BackupFile {
  app: 'seikei-game';
  exportedAt: string;
  schemaVersion: number;
  deviceId: string;
  recs: Rec<unknown>[]; // 論理削除されたものも含む
}

export interface ImportReport {
  added: number;
  updated: number;
  unchanged: number;
  rejected: number;
}

export interface Repository {
  /** 削除済みは undefined */
  get<T>(collection: CollectionName, id: string): Promise<Rec<T> | undefined>;
  /** 削除済みは含めない。id の昇順 */
  list<T>(collection: CollectionName): Promise<Rec<T>[]>;
  /** id 省略時は uuid を振る */
  put<T>(collection: CollectionName, data: T, id?: string): Promise<Rec<T>>;
  /** 論理削除。存在しなければ何もしない */
  remove(collection: CollectionName, id: string): Promise<void>;
  /** 戻り値で購読解除 */
  subscribe(collection: CollectionName, cb: () => void): () => void;
  exportAll(): Promise<BackupFile>;
  /** T0-07 で実装 */
  importAll(file: BackupFile): Promise<ImportReport>;
}

/** 移行・同期・バックアップ用の内部窓口(ゲーム側からは使わない) */
export interface RawStore {
  /** この端末のID */
  readonly deviceId: string;
  /** 削除済みも返す */
  getRaw(collection: CollectionName, id: string): Promise<Rec<unknown> | undefined>;
  /** 日時や端末IDを書き換えずにそのまま保存 */
  putRaw(rec: Rec<unknown>): Promise<void>;
  allRaw(): Promise<Rec<unknown>[]>;
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
}

export const CURRENT_SCHEMA_VERSION = 1;
