import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkForUpdate,
  applyUpdate,
  onUpdateState,
  markUpdateAvailable,
  isUpdateReady,
  resetUpdaterForTest,
  setReloadForTest,
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
});

/** 偽の Service Worker (イベントを受け取れる)。待っている版 (waiting) と、取り込み中の版 (installing) を持てる */
class FakeWorker extends EventTarget {
  state: string;
  postMessage = vi.fn();
  constructor(state: string) {
    super();
    this.state = state;
  }
  setState(state: string): void {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

function fakeRegistration(opts: { waiting?: FakeWorker | null; installing?: FakeWorker | null }): {
  swc: EventTarget;
  reg: { waiting: FakeWorker | null; installing: FakeWorker | null; update: ReturnType<typeof vi.fn> };
} {
  const reg = {
    waiting: opts.waiting ?? null,
    installing: opts.installing ?? null,
    update: vi.fn(async () => undefined),
  };
  const swc = new EventTarget() as EventTarget & { getRegistration?: () => Promise<unknown> };
  swc.getRegistration = async () => reg;
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: swc });
  return { swc, reg };
}

describe('PU-10f: 「アップデートする」で確実に切り替える', () => {
  let reload: ReturnType<typeof vi.fn<() => void>>;
  beforeEach(() => {
    reload = vi.fn<() => void>();
    setReloadForTest(reload);
  });
  afterEach(() => {
    setReloadForTest(null);
    vi.useRealTimers();
  });

  it('待っている版があるとき、SKIP_WAITING をその版に送り、controllerchange で再読み込みを呼ぶ (true を返す)', async () => {
    const w = new FakeWorker('installed');
    const { swc } = fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.waitFor(() => {
      expect(w.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });
    expect(reload).not.toHaveBeenCalled();
    swc.dispatchEvent(new Event('controllerchange'));
    await expect(done).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('controllerchange が来なくても、待っていた版が activated になれば再読み込みする (クライアントを引き継がない Service Worker)', async () => {
    const w = new FakeWorker('installed');
    fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.waitFor(() => {
      expect(w.postMessage).toHaveBeenCalled();
    });
    w.setState('activating');
    expect(reload).not.toHaveBeenCalled();
    w.setState('activated');
    await expect(done).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('再読み込みは 1 回だけ (controllerchange と activated の両方が来ても)', async () => {
    const w = new FakeWorker('installed');
    const { swc } = fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.waitFor(() => {
      expect(w.postMessage).toHaveBeenCalled();
    });
    swc.dispatchEvent(new Event('controllerchange'));
    w.setState('activated');
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('5 秒たっても切り替わらなければ、再読み込みせず false を返す (画面に案内を出すため)。何度でも押し直せる', async () => {
    vi.useFakeTimers();
    const w = new FakeWorker('installed');
    fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(5100);
    await expect(done).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
    const again = applyUpdate();
    await vi.advanceTimersByTimeAsync(5100);
    await expect(again).resolves.toBe(false);
    expect(w.postMessage).toHaveBeenCalledTimes(2);
  });

  it('registerSW の更新の関数が記録されていても、待っている版があればそれに直接 SKIP_WAITING を送る (関数には頼らない)', async () => {
    const w = new FakeWorker('installed');
    const { swc } = fakeRegistration({ waiting: w });
    const apply = vi.fn(async () => undefined);
    markUpdateAvailable(apply);
    const done = applyUpdate();
    await vi.waitFor(() => {
      expect(w.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });
    swc.dispatchEvent(new Event('controllerchange'));
    await done;
    expect(apply).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('待っている版が見つからないとき、更新の関数があればそれを呼ぶ。無ければ再読み込みする', async () => {
    fakeRegistration({});
    const apply = vi.fn(async () => undefined);
    markUpdateAvailable(apply);
    void applyUpdate();
    await vi.waitFor(() => {
      expect(apply).toHaveBeenCalledWith(true);
    });
    resetUpdaterForTest();
    setReloadForTest(reload);
    await expect(applyUpdate()).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('取り込み中 (installing) のあいだは available にしない: installed になってから available。redundant になれば latest', async () => {
    vi.useFakeTimers();
    const installing = new FakeWorker('installing');
    const { reg } = fakeRegistration({ installing });
    const check = checkForUpdate();
    let settled = false;
    void check.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).toBe(false); // まだ取り込み中
    reg.waiting = installing;
    reg.installing = null;
    installing.setState('installed');
    await expect(check).resolves.toBe('available');
    // 失敗して redundant になった場合は、新しい版は無い
    resetUpdaterForTest();
    const bad = new FakeWorker('installing');
    fakeRegistration({ installing: bad });
    const check2 = checkForUpdate();
    await vi.advanceTimersByTimeAsync(10);
    bad.setState('redundant');
    await expect(check2).resolves.toBe('latest');
  });
});
