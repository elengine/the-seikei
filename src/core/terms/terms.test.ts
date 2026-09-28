import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { createTerms } from './terms';
import type { Terms } from './terms';
import { createLocalRepository } from '../storage/localRepository';
import { createFixedClock } from '../clock/clock';
import type { Repository } from '../storage/types';

const DEFAULTS: Record<string, { value: string; description: string }> = {
  drum: { value: 'ドラム', description: '桟を組んだかご状の胴。帯を順に巻き重ねる' },
  section: { value: '帯', description: 'ドラムに巻く糸のひとまとまり' },
  'game.knotting': { value: '糸継ぎ', description: 'ゲームの名前' },
};

let dbSeq = 0;

async function makeTerms(): Promise<{ repo: Repository; terms: Terms }> {
  const repo = await createLocalRepository({
    dbName: `terms-test-${Date.now().toString(36)}-${dbSeq++}`,
    clock: createFixedClock('2026-09-28T00:00:00Z'),
  });
  const terms = await createTerms(repo, DEFAULTS);
  return { repo, terms };
}

describe('terms', () => {
  it('1. 上書きがなければ初期値を返す', async () => {
    const { terms } = await makeTerms();
    expect(terms.t('drum')).toBe('ドラム');
    expect(terms.entries().find((e) => e.key === 'drum')?.overridden).toBe(false);
  });

  it('2. set の後 t が変わる。作り直しても変わったまま (保存されている)', async () => {
    const { repo, terms } = await makeTerms();
    await terms.set('drum', '  大枠  '); // 前後の空白は取り除く
    expect(terms.t('drum')).toBe('大枠');
    const terms2 = await createTerms(repo, DEFAULTS); // 作り直す
    expect(terms2.t('drum')).toBe('大枠');
  });

  it('3. reset で初期値に戻り、overridden が false になる', async () => {
    const { terms } = await makeTerms();
    await terms.set('drum', '大枠');
    expect(terms.t('drum')).toBe('大枠');
    await terms.reset('drum');
    expect(terms.t('drum')).toBe('ドラム'); // 初期値に戻る
    expect(terms.entries().find((e) => e.key === 'drum')?.overridden).toBe(false);
  });

  it('4. render が {{キー}} を置き換える。未知のキーは残る', async () => {
    const { terms } = await makeTerms();
    expect(terms.render('{{drum}}に{{section}}を巻く')).toBe('ドラムに帯を巻く');
    await terms.set('section', 'しま');
    expect(terms.render('{{drum}}に{{section}}を巻く')).toBe('ドラムにしまを巻く');
    expect(terms.render('{{unknownKey}}はそのまま')).toBe('{{unknownKey}}はそのまま');
  });

  it('5. 未知のキーの t はキー名を返す。未知のキーの set は例外', async () => {
    const { terms } = await makeTerms();
    expect(terms.t('unknownKey')).toBe('unknownKey');
    await expect(terms.set('unknownKey', 'なにか')).rejects.toThrow();
    await expect(terms.reset('unknownKey')).rejects.toThrow();
  });

  it('6. set で onChange が呼ばれる', async () => {
    const { terms } = await makeTerms();
    const cb = vi.fn();
    const off = terms.onChange(cb);
    expect(cb).not.toHaveBeenCalled();
    await terms.set('drum', '大枠');
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    await terms.set('drum', '大枠2');
    expect(cb).toHaveBeenCalledTimes(1); // 解除後は呼ばれない
  });

  it('追加: 空文字 (trim 後) の set は reset と同じになる', async () => {
    const { terms } = await makeTerms();
    await terms.set('drum', '大枠');
    expect(terms.t('drum')).toBe('大枠');
    await terms.set('drum', '   '); // trim 後空 → reset と同じ
    expect(terms.t('drum')).toBe('ドラム');
    expect(terms.entries().find((e) => e.key === 'drum')?.overridden).toBe(false);
  });

  it('追加: entries() は初期値ファイルの順。overridden は上書き済みのみ true', async () => {
    const { terms } = await makeTerms();
    await terms.set('section', 'しま');
    const es = terms.entries();
    expect(es.map((e) => e.key)).toEqual(['drum', 'section', 'game.knotting']); // 初期値の順
    expect(es.map((e) => e.overridden)).toEqual([false, true, false]);
    expect(es[0]).toEqual({
      key: 'drum',
      value: 'ドラム',
      defaultValue: 'ドラム',
      description: '桟を組んだかご状の胴。帯を順に巻き重ねる',
      overridden: false,
    });
  });

  it('追加修正1: 外から repo.put された場合も読み直して t が変わり、onChange が呼ばれる', async () => {
    const { repo, terms } = await makeTerms();
    const cb = vi.fn();
    terms.onChange(cb);
    expect(cb).not.toHaveBeenCalled();

    await repo.put<{ value: string }>('terms', { value: '大枠' }, 'drum'); // Terms の外から直接保存

    // 購読からの読み直しは非同期で走るので完了を待つ
    await vi.waitFor(() => {
      expect(cb).toHaveBeenCalled();
    });
    expect(terms.t('drum')).toBe('大枠'); // 上書きのキャッシュが読み直されている
  });
});
