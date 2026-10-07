import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { createSettingsService, DEFAULT_SETTINGS } from './settings';
import type { SettingsData } from './settings';
import { createLocalRepository } from '../storage/localRepository';
import { createFixedClock } from '../clock/clock';

let dbSeq = 0;

async function make() {
  const clock = createFixedClock('2026-09-28T00:00:00Z', 1000);
  const repo = await createLocalRepository({
    dbName: `settings-test-${Date.now().toString(36)}-${dbSeq++}`,
    clock,
  });
  const settings = await createSettingsService(repo, clock);
  return { repo, clock, settings };
}

describe('settings', () => {
  it('1. 初回は DEFAULT_SETTINGS を返す', async () => {
    const { settings } = await make();
    expect(settings.get()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.playerName).toBe('');
    expect(DEFAULT_SETTINGS.shopName).toBe('整経所');
    expect(DEFAULT_SETTINGS.fontScale).toBe(1);
    expect(DEFAULT_SETTINGS.soundOn).toBe(true);
    expect(DEFAULT_SETTINGS.volume).toBe(0.7);
    expect(DEFAULT_SETTINGS.tutorialSeen).toEqual({});
  });

  it('2. update 後、作り直したサービスでも変わっている', async () => {
    const { repo, clock, settings } = await make();
    await settings.update({ shopName: '山田整経' });
    expect(settings.get().shopName).toBe('山田整経');
    const settings2 = await createSettingsService(repo, clock); // 作り直す
    expect(settings2.get().shopName).toBe('山田整経'); // 保存されている
  });

  it('3. update したキーだけ _updated が付く (repo から Rec を直接読む)', async () => {
    const { repo, settings } = await make();
    await settings.update({ shopName: '山田整経', soundOn: false });
    const rec = await repo.get<SettingsData & { _updated?: Record<string, string> }>('settings', 'main');
    expect(rec).toBeDefined();
    const updated = rec!.data._updated ?? {};
    expect(Object.keys(updated).sort()).toEqual(['shopName', 'soundOn']); // update したキーだけ
    // 時刻は clock.now() (固定時計なので START 以上)
    for (const v of Object.values(updated)) {
      expect(v).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('4. 保存データに一部のキーしかない場合も、残りは既定値で補われる', async () => {
    const { repo, clock } = await make();
    // 一部のキーしかない保存データを直接置く
    await repo.put('settings', { playerName: 'まさお' }, 'main');
    const settings = await createSettingsService(repo, clock);
    const s = settings.get();
    expect(s.playerName).toBe('まさお'); // 保存済みのキー
    expect(s.shopName).toBe('整経所'); // 無いキーは既定値
    expect(s.fontScale).toBe(1);
    expect(s.soundOn).toBe(true);
    expect(s.volume).toBe(0.7);
    expect(s.tutorialSeen).toEqual({});
  });

  it('5. onChange が呼ばれる (解除後は呼ばれない)', async () => {
    const { settings } = await make();
    const seen: SettingsData[] = [];
    const off = settings.onChange((s) => {
      seen.push(s);
    });
    expect(seen).toHaveLength(0);
    await settings.update({ volume: 0.5 });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.volume).toBe(0.5);
    off();
    await settings.update({ volume: 0.8 });
    expect(seen).toHaveLength(1); // 解除後は呼ばれない
  });

  it('追加: get() は _updated を含めずに返す', async () => {
    const { settings } = await make();
    await settings.update({ shopName: '山田整経' });
    const s = settings.get() as SettingsData & { _updated?: unknown };
    expect('_updated' in s).toBe(false);
  });

  it('追加: 未保存の settings Rec が論理削除されていた場合は既定値に戻る', async () => {
    const { repo, clock, settings } = await make();
    await settings.update({ shopName: '山田整経' });
    await repo.remove('settings', 'main'); // 論理削除
    const settings2 = await createSettingsService(repo, clock);
    expect(settings2.get()).toEqual(DEFAULT_SETTINGS); // 削除済みなら既定値
  });

  it('追加修正1: 外から repo.put された場合も読み直して get が変わり、onChange が呼ばれる', async () => {
    const { repo, settings } = await make();
    const seen: string[] = [];
    settings.onChange((s) => {
      seen.push(s.shopName);
    });
    expect(seen).toEqual([]);

    await repo.put<{ playerName: string; shopName: string }>('settings', { playerName: '', shopName: '山田整経' }, 'main'); // 外から直接保存

    // 購読からの読み直しは非同期で走るので完了を待つ
    await vi.waitFor(() => {
      expect(seen.length).toBeGreaterThan(0);
    });
    expect(settings.get().shopName).toBe('山田整経'); // 保存データが読み直されている
    expect(seen[seen.length - 1]).toBe('山田整経'); // onChange に新しい設定が渡る
  });
});

describe('PU-08c: fontScale は 1〜5 の数。古い値は読み込むときに置き換える', () => {
  async function loadWith(fontScale: unknown): Promise<number> {
    const { repo, clock } = await make();
    await repo.put('settings', { fontScale }, 'main');
    return (await createSettingsService(repo, clock)).get().fontScale;
  }

  it("'large' → 1、'xlarge' → 3、不明 → 1", async () => {
    expect(await loadWith('large')).toBe(1);
    expect(await loadWith('xlarge')).toBe(3);
    expect(await loadWith('はてな')).toBe(1);
    expect(await loadWith(undefined)).toBe(1);
  });

  it('1〜5 の数はそのまま。範囲の外・小数・数でないものは 1', async () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(await loadWith(n)).toBe(n);
    }
    expect(await loadWith(0)).toBe(1);
    expect(await loadWith(6)).toBe(1);
    expect(await loadWith(2.5)).toBe(1);
    expect(await loadWith('4')).toBe(1);
  });
});

describe('settings PU-18 (unlockAll)', () => {
  it('unlockAll の初期値は false。保存データに無い (古いデータ) ときも false。update で true になり、作り直しても残る', async () => {
    expect(DEFAULT_SETTINGS.unlockAll).toBe(false);
    const { repo, clock, settings } = await make();
    expect(settings.get().unlockAll).toBe(false);
    // 古い保存データ (unlockAll が無い)
    await repo.put('settings', { playerName: '', shopName: '整経所', fontScale: 1, soundOn: true, volume: 0.7, tutorialSeen: {}, _updated: {} }, 'main');
    const old = await createSettingsService(repo, clock);
    expect(old.get().unlockAll).toBe(false);
    await old.update({ unlockAll: true });
    expect(old.get().unlockAll).toBe(true);
    expect((await createSettingsService(repo, clock)).get().unlockAll).toBe(true);
    await old.update({ unlockAll: false });
    expect(old.get().unlockAll).toBe(false);
  });
});
