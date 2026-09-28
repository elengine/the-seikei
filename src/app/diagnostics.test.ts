import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  manifestIdFromCache,
  manifestIdFromNetwork,
  serviceWorkerState,
  installPromptState,
  displayModeState,
  collectDiagnostics,
  hasInstallPromptEvent,
  promptInstall,
  setInstallPromptRecorded,
} from './diagnostics';

/** CacheStorage の偽物 */
function makeFakeCaches(entries: Record<string, { id?: string } | 'invalid-json'>) {
  const store = new Map<string, { id?: string } | 'invalid-json'>(Object.entries(entries));
  const fakeCache = {
    keys: async () => [...store.keys()].map((k) => new Request(`http://localhost/the-seikei/${k}?__WB_REVISION__=x`)),
    match: async (req: RequestInfo) => {
      const url = typeof req === 'string' ? req : req.url;
      const name = url.replace(/^.*\//, '').split('?')[0]!;
      const v = store.get(name);
      if (v === undefined) {
        return undefined;
      }
      const body = v === 'invalid-json' ? '{not json' : JSON.stringify(v);
      return new Response(body);
    },
  };
  return {
    keys: async () => [...store.keys()].map((k) => `sw-${k}`),
    open: async () => fakeCache,
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('diagnostics', () => {
  it('キャッシュ内の manifest から id を返す', async () => {
    vi.stubGlobal('caches', makeFakeCaches({ 'manifest.webmanifest': { id: 'the-seikei' } }));
    expect(await manifestIdFromCache()).toBe('the-seikei');
  });

  it('manifest に id が無ければ「(id なし)」', async () => {
    vi.stubGlobal('caches', makeFakeCaches({ 'manifest.webmanifest': {} }));
    expect(await manifestIdFromCache()).toBe('(id なし)');
  });

  it('キャッシュに manifest が無ければ「(キャッシュなし)」', async () => {
    vi.stubGlobal('caches', makeFakeCaches({}));
    expect(await manifestIdFromCache()).toBe('(キャッシュなし)');
  });

  it('ネットワークからはクエリ付きで no-store で取得し id を返す', async () => {
    const fetchSpy = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain('manifest.webmanifest?diag=');
      expect(init?.cache).toBe('no-store');
      return new Response(JSON.stringify({ id: 'the-seikei' }));
    });
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    const id = await manifestIdFromNetwork(1234567890);
    expect(id).toBe('the-seikei');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('Service Worker 未登録なら「いいえ」', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => undefined } });
    const s = await serviceWorkerState();
    expect(s.registered).toBe('いいえ');
    expect(s.scriptURL).toBe('—');
    expect(s.waiting).toBe('いいえ');
  });

  it('Service Worker 登録済みなら scriptURL と waiting を返す', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: async () =>
          ({
            active: { scriptURL: 'https://example.com/sw.js' },
            waiting: { scriptURL: 'https://example.com/sw.js' },
          }) as unknown as ServiceWorkerRegistration,
      },
    });
    const s = await serviceWorkerState();
    expect(s.registered).toBe('はい');
    expect(s.scriptURL).toBe('https://example.com/sw.js');
    expect(s.waiting).toBe('あり');
  });

  it('インストール判定と表示モードの文字列', () => {
    expect(installPromptState(true)).toBe('はい');
    expect(installPromptState(false)).toBe('いいえ');
    expect(displayModeState(true)).toBe('standalone');
    expect(displayModeState(false)).toBe('ブラウザ内');
  });

  it('collectDiagnostics が7項目をそろえる', async () => {
    vi.stubGlobal('caches', makeFakeCaches({ 'manifest.webmanifest': { id: 'the-seikei' } }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'the-seikei' }))) as unknown as typeof fetch);
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => undefined } });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })) as unknown as typeof matchMedia);
    const items = await collectDiagnostics({ installPromptRecorded: false });
    const labels = items.map((i) => i.label);
    expect(labels).toEqual([
      '保存済みの設定ファイル (キャッシュ内の id)',
      '最新の設定ファイル (ネットワークの id)',
      'Service Worker 登録',
      'Service Worker scriptURL',
      'Service Worker 待機中',
      'インストールの判定 (beforeinstallprompt)',
      '表示モード',
    ]);
    expect(items.find((i) => i.label === '保存済みの設定ファイル (キャッシュ内の id)')?.value).toBe('the-seikei');
    expect(items.find((i) => i.label === 'インストールの判定 (beforeinstallprompt)')?.value).toBe('いいえ');
  });
});

describe('install prompt (T0-19)', () => {
  function makeFakeEvent(outcome: 'accepted' | 'dismissed') {
    const prompt = vi.fn(async () => undefined);
    const event = {
      prompt,
      userChoice: Promise.resolve({ outcome }),
      preventDefault: vi.fn(),
    };
    return { event, prompt };
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('beforeinstallprompt を preventDefault して保存する', async () => {
    const { event } = makeFakeEvent('accepted');
    const fakeWindow = {
      addEventListener: (type: string, cb: (e: Event) => void) => {
        if (type === 'beforeinstallprompt') {
          cb(event as unknown as Event);
        }
      },
      removeEventListener: () => undefined,
    };
    vi.stubGlobal('window', fakeWindow);
    setInstallPromptRecorded();
    expect(event.preventDefault).toHaveBeenCalledTimes(1); // preventDefault する
    expect(hasInstallPromptEvent()).toBe(true); // 保存されている
  });

  it('prompt() が1回だけ呼ばれ、userChoice の結果が返る。2回目は null', async () => {
    const { event, prompt } = makeFakeEvent('accepted');
    const fakeWindow = {
      addEventListener: (type: string, cb: (e: Event) => void) => {
        if (type === 'beforeinstallprompt') {
          cb(event as unknown as Event);
        }
      },
      removeEventListener: () => undefined,
    };
    vi.stubGlobal('window', fakeWindow);
    setInstallPromptRecorded();
    expect(hasInstallPromptEvent()).toBe(true);

    const result = await promptInstall();
    expect(result?.outcome).toBe('accepted');
    expect(prompt).toHaveBeenCalledTimes(1); // 1回だけ
    expect(hasInstallPromptEvent()).toBe(false); // 呼んだ後は捨てられる
    expect(await promptInstall()).toBeNull(); // 2回目は null (押せなくなる)
  });

  it('dismissed の結果も返る', async () => {
    const { event } = makeFakeEvent('dismissed');
    const fakeWindow = {
      addEventListener: (type: string, cb: (e: Event) => void) => {
        if (type === 'beforeinstallprompt') {
          cb(event as unknown as Event);
        }
      },
      removeEventListener: () => undefined,
    };
    vi.stubGlobal('window', fakeWindow);
    setInstallPromptRecorded();
    const result = await promptInstall();
    expect(result?.outcome).toBe('dismissed');
  });

  it('イベントが無いとき promptInstall は null (押せない状態に相当)', async () => {
    expect(hasInstallPromptEvent()).toBe(false);
    expect(await promptInstall()).toBeNull();
  });
});
