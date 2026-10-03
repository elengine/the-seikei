import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkForUpdate,
  applyUpdate,
  onUpdateState,
  markUpdateAvailable,
  isUpdateReady,
  resetUpdaterForTest,
} from './updater';

/** 偽の Service Worker の登録。update() のあとに waiting が現れる (newVersion) か、現れない */
function fakeServiceWorker(opts: { newVersion?: boolean; updateRejects?: boolean; noRegistration?: boolean }): {
  update: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
} {
  const postMessage = vi.fn();
  const reg: { waiting: unknown; installing: unknown; update: ReturnType<typeof vi.fn> } = {
    waiting: null,
    installing: null,
    update: vi.fn(async () => {
      if (opts.updateRejects === true) {
        throw new TypeError('Failed to fetch');
      }
      if (opts.newVersion === true) {
        reg.waiting = { state: 'installed', postMessage };
      }
    }),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: async () => (opts.noRegistration === true ? undefined : reg),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
  return { update: reg.update, postMessage };
}

beforeEach(() => {
  resetUpdaterForTest();
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

afterEach(() => {
  // @ts-expect-error テストで足した偽物を外す
  delete navigator.serviceWorker;
});

describe('updater (PU-10a)', () => {
  it('新しい版が待っていれば available。update() が呼ばれ、状態が「届いている」になる', async () => {
    const sw = fakeServiceWorker({ newVersion: true });
    expect(isUpdateReady()).toBe(false);
    await expect(checkForUpdate()).resolves.toBe('available');
    expect(sw.update).toHaveBeenCalledTimes(1);
    expect(isUpdateReady()).toBe(true);
  });

  it('新しい版が無ければ latest', async () => {
    fakeServiceWorker({});
    await expect(checkForUpdate()).resolves.toBe('latest');
    expect(isUpdateReady()).toBe(false);
  });

  it('通信できなければ offline (update() の失敗、または navigator.onLine が false)', async () => {
    fakeServiceWorker({ updateRejects: true });
    await expect(checkForUpdate()).resolves.toBe('offline');
    const sw = fakeServiceWorker({});
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    await expect(checkForUpdate()).resolves.toBe('offline');
    expect(sw.update).not.toHaveBeenCalled();
  });

  it('Service Worker が無い (登録が無い・使えない) ときは latest (確認する相手がいない)', async () => {
    fakeServiceWorker({ noRegistration: true });
    await expect(checkForUpdate()).resolves.toBe('latest');
  });

  it('すでに届いているときは、もう一度問い合わせず available', async () => {
    const sw = fakeServiceWorker({});
    markUpdateAvailable(async () => undefined);
    await expect(checkForUpdate()).resolves.toBe('available');
    expect(sw.update).not.toHaveBeenCalled();
  });

  it('onUpdateState: 届いたときに true で呼ばれる。解除したら呼ばれない', () => {
    const cb = vi.fn();
    const off = onUpdateState(cb);
    markUpdateAvailable(async () => undefined);
    expect(cb).toHaveBeenCalledWith(true);
    off();
    cb.mockClear();
    resetUpdaterForTest();
    markUpdateAvailable(async () => undefined);
    expect(cb).not.toHaveBeenCalled();
  });

  it('applyUpdate: registerSW が渡した更新の関数 (reload=true) を呼ぶ。待っている版だけのときは SKIP_WAITING を送る', async () => {
    const apply = vi.fn(async () => undefined);
    markUpdateAvailable(apply);
    applyUpdate();
    await Promise.resolve();
    expect(apply).toHaveBeenCalledWith(true);
    // 関数が無く、チェックで待っている版が見つかった場合
    resetUpdaterForTest();
    const sw = fakeServiceWorker({ newVersion: true });
    await checkForUpdate();
    applyUpdate();
    expect(sw.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });
});
