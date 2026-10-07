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

describe('PU-19b: 切り替えに失敗したら、新しい版を見つけ直して 1 回だけやり直す', () => {
  let reload: ReturnType<typeof vi.fn<() => void>>;
  beforeEach(() => {
    reload = vi.fn<() => void>();
    setReloadForTest(reload);
  });
  afterEach(() => {
    setReloadForTest(null);
    vi.useRealTimers();
  });

  it('待っていた版が切り替えの途中で redundant になり、新しい版が waiting に入る → 5 秒を待たずに新しい版へ SKIP_WAITING を送り、切り替わったら読み込み直す', async () => {
    vi.useFakeTimers();
    const old = new FakeWorker('installed');
    const next = new FakeWorker('installed');
    const { swc, reg } = fakeRegistration({ waiting: old });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(10);
    expect(old.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    reg.waiting = next; // さらに新しい版が入り、待っていた版は捨てられる
    old.setState('redundant');
    await vi.advanceTimersByTimeAsync(10); // 5 秒は待たない
    expect(next.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    swc.dispatchEvent(new Event('controllerchange'));
    await expect(done).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('5 秒たっても切り替わらず、そのとき別の版が waiting にあれば、その版でもう 1 回やり直す', async () => {
    vi.useFakeTimers();
    const old = new FakeWorker('installed');
    const next = new FakeWorker('installed');
    const { reg } = fakeRegistration({ waiting: old });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(100);
    reg.waiting = next;
    await vi.advanceTimersByTimeAsync(5100);
    expect(next.postMessage).toHaveBeenCalledTimes(1);
    next.setState('activated');
    await expect(done).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('入れている途中 (installing) の新しい版があれば、入れ終わるのを待ってから切り替える', async () => {
    vi.useFakeTimers();
    const old = new FakeWorker('installed');
    const incoming = new FakeWorker('installing');
    const { reg } = fakeRegistration({ waiting: old });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(10);
    reg.installing = incoming;
    old.setState('redundant');
    await vi.advanceTimersByTimeAsync(1000);
    expect(incoming.postMessage).not.toHaveBeenCalled(); // まだ入れている途中
    reg.installing = null;
    reg.waiting = incoming;
    incoming.setState('installed');
    await vi.advanceTimersByTimeAsync(10);
    expect(incoming.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    incoming.setState('activated');
    await expect(done).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('やり直しも切り替わらなければ false (案内を出す)。やり直しは 1 回だけ (3 つ目の版には送らない)', async () => {
    vi.useFakeTimers();
    const first = new FakeWorker('installed');
    const second = new FakeWorker('installed');
    const third = new FakeWorker('installed');
    const { reg } = fakeRegistration({ waiting: first });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(10);
    reg.waiting = second;
    first.setState('redundant');
    await vi.advanceTimersByTimeAsync(10);
    expect(second.postMessage).toHaveBeenCalledTimes(1);
    reg.waiting = third;
    second.setState('redundant');
    await vi.advanceTimersByTimeAsync(6000);
    await expect(done).resolves.toBe(false);
    expect(third.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('待っていた版が redundant になっても、新しい版が無ければ、時間を待たずに false', async () => {
    vi.useFakeTimers();
    const old = new FakeWorker('installed');
    fakeRegistration({ waiting: old });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(10);
    old.setState('redundant');
    await vi.advanceTimersByTimeAsync(10);
    await expect(done).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
