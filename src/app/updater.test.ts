import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkForUpdate,
  applyUpdate,
  onUpdateState,
  markUpdateAvailable,
  isUpdateReady,
  resetUpdaterForTest,
  setReloadForTest,
  readUpdateLogs,
  clearUpdateLogsForTest,
  recordStartup,
  startupSwitchFailed,
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
  window.localStorage.removeItem('seikei-update-retry');
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

const RETRY_KEY = 'seikei-update-retry';
function placeRetryMark(ageMs = 0, url = 'sw.js'): void {
  window.localStorage.setItem(RETRY_KEY, JSON.stringify({ at: Date.now() - ageMs, url }));
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
      expect(w.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }, [expect.anything()]);
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

  it('installed のまま (5 秒 + 送り直して 10 秒) 切り替わらなければ、再読み込みせず false を返す (画面に案内を出すため。PU-23b)。何度でも押し直せる', async () => {
    vi.useFakeTimers();
    placeRetryMark(); // 読み込み直しは済んでいる (PU-25。印がある間は読み込み直さない)
    const w = new FakeWorker('installed');
    fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(15100);
    await expect(done).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
    const again = applyUpdate();
    await vi.advanceTimersByTimeAsync(15100);
    await expect(again).resolves.toBe(false);
    expect(w.postMessage).toHaveBeenCalledTimes(4); // 1 回ごとに 2 回 (最初と送り直し)
  });

  it('registerSW の更新の関数が記録されていても、待っている版があればそれに直接 SKIP_WAITING を送る (関数には頼らない)', async () => {
    const w = new FakeWorker('installed');
    const { swc } = fakeRegistration({ waiting: w });
    const apply = vi.fn(async () => undefined);
    markUpdateAvailable(apply);
    const done = applyUpdate();
    await vi.waitFor(() => {
      expect(w.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }, [expect.anything()]);
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
    expect(old.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }, [expect.anything()]);
    reg.waiting = next; // さらに新しい版が入り、待っていた版は捨てられる
    old.setState('redundant');
    await vi.advanceTimersByTimeAsync(10); // 5 秒は待たない
    expect(next.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }, [expect.anything()]);
    expect(reload).not.toHaveBeenCalled();
    swc.dispatchEvent(new Event('controllerchange'));
    await expect(done).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('切り替わらず (installed のまま 15 秒)、そのとき別の版が waiting にあれば、その版でもう 1 回やり直す', async () => {
    vi.useFakeTimers();
    const old = new FakeWorker('installed');
    const next = new FakeWorker('installed');
    const { reg } = fakeRegistration({ waiting: old });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(100);
    reg.waiting = next;
    await vi.advanceTimersByTimeAsync(15100);
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
    expect(incoming.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }, [expect.anything()]);
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


describe('PU-23a: 「アップデートする」の流れの記録 (経過ミリ秒つき・直近 3 回)', () => {
  let reload: ReturnType<typeof vi.fn<() => void>>;
  beforeEach(() => {
    reload = vi.fn<() => void>();
    setReloadForTest(reload);
    clearUpdateLogsForTest();
  });
  afterEach(() => {
    setReloadForTest(null);
    vi.useRealTimers();
    clearUpdateLogsForTest();
  });

  it('1. 押した時の各部の状態・SKIP_WAITING を送った時刻・待っていた版の状態の変わり目・読み込み直したことが、経過ミリ秒つきで順に残る', async () => {
    vi.useFakeTimers();
    const w = new FakeWorker('installed');
    fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(1200);
    w.setState('activating');
    await vi.advanceTimersByTimeAsync(1800);
    w.setState('activated');
    await expect(done).resolves.toBe(true);
    const logs = readUpdateLogs();
    expect(logs).toHaveLength(1);
    const ev = logs[0]!.events;
    expect(ev.map((e) => e.label.split(':')[0])).toEqual(['押した', 'SKIP_WAITING を送った', 'installed → activating', 'activating → activated', '読み込み直した']);
    expect(ev[0]!.ms).toBe(0);
    expect(ev[0]!.label).toContain('待っている版=installed');
    expect(ev[0]!.label).toContain('active=なし');
    expect(ev[0]!.label).toContain('controller=');
    expect(ev[1]!.ms).toBeLessThan(50);
    expect(ev[2]!.ms).toBeGreaterThanOrEqual(1200);
    expect(ev[2]!.ms).toBeLessThan(1300);
    expect(ev[3]!.ms).toBeGreaterThanOrEqual(3000);
    expect(logs[0]!.result).toBe('reloaded');
    expect(typeof logs[0]!.at).toBe('string');
  });

  it('2. controllerchange の時刻も残る', async () => {
    vi.useFakeTimers();
    const w = new FakeWorker('installed');
    const { swc } = fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(700);
    swc.dispatchEvent(new Event('controllerchange'));
    await done;
    const ev = readUpdateLogs()[0]!.events;
    const cc = ev.find((e) => e.label.startsWith('controllerchange'))!;
    expect(cc.ms).toBeGreaterThanOrEqual(700);
  });

  it('3. 5 秒の時点の状態が残り、案内を出した (失敗) ときも記録が残る (result は failed)', async () => {
    vi.useFakeTimers();
    placeRetryMark(); // 読み込み直しは済んでいる (PU-25)
    const w = new FakeWorker('installed');
    fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(20000);
    await expect(done).resolves.toBe(false);
    const logs = readUpdateLogs();
    expect(logs[0]!.result).toBe('failed');
    const labels = logs[0]!.events.map((e) => e.label);
    expect(labels.some((l) => l.startsWith('5 秒の時点') && l.includes('待っている版=installed'))).toBe(true);
    expect(labels[labels.length - 1]).toBe('案内を出した');
  });

  it('4. 直近 3 回分だけ残す (4 回目で一番古いものが消える)。新しいものが先頭', async () => {
    vi.useFakeTimers();
    for (let k = 0; k < 4; k++) {
      const w = new FakeWorker('installed');
      fakeRegistration({ waiting: w });
      const done = applyUpdate();
      await vi.advanceTimersByTimeAsync(100 + k);
      w.setState('activated');
      await done;
      vi.setSystemTime(Date.now() + 60000);
    }
    const logs = readUpdateLogs();
    expect(logs).toHaveLength(3);
    expect(new Date(logs[0]!.at).getTime()).toBeGreaterThan(new Date(logs[2]!.at).getTime());
  });

  it('5. localStorage が使えなくても (読み書きで例外) 動く。記録は残らないだけ', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const w = new FakeWorker('installed');
    fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(100);
    w.setState('activated');
    await expect(done).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(readUpdateLogs()).toEqual([]);
    spy.mockRestore();
    getSpy.mockRestore();
  });
});

describe('PU-23b: 5 秒であきらめない (activating は最長 20 秒・installed は SKIP_WAITING をもう 1 回)', () => {
  let reload: ReturnType<typeof vi.fn<() => void>>;
  beforeEach(() => {
    reload = vi.fn<() => void>();
    setReloadForTest(reload);
    clearUpdateLogsForTest();
  });
  afterEach(() => {
    setReloadForTest(null);
    vi.useRealTimers();
    clearUpdateLogsForTest();
  });

  it('6. 5 秒の時点で activating → あきらめず、8 秒で activated になったら読み込み直す (案内は出さない)', async () => {
    vi.useFakeTimers();
    const w = new FakeWorker('installed');
    fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(1000);
    w.setState('activating');
    await vi.advanceTimersByTimeAsync(4500); // 5.5 秒: まだ activating
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2500); // 8 秒
    w.setState('activated');
    await expect(done).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(w.postMessage).toHaveBeenCalledTimes(1); // activating のときは送り直さない
    const labels = readUpdateLogs()[0]!.events.map((e) => e.label);
    expect(labels.some((l) => l.startsWith('5 秒の時点') && l.includes('待っている版=activating'))).toBe(true);
  });

  it('7. activating のまま 25 秒 (5 秒 + 20 秒) たっても activated にならなければ案内 (false)', async () => {
    vi.useFakeTimers();
    const w = new FakeWorker('installed');
    fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(500);
    w.setState('activating');
    await vi.advanceTimersByTimeAsync(24000);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(done).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('8. 5 秒の時点で installed のまま (動いていない) → SKIP_WAITING をもう 1 回だけ送り、7 秒で activated → 読み込み直す', async () => {
    vi.useFakeTimers();
    const w = new FakeWorker('installed');
    fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(5100);
    expect(w.postMessage).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1900);
    w.setState('activated');
    await expect(done).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(w.postMessage).toHaveBeenCalledTimes(2); // 3 回目は送らない
    const labels = readUpdateLogs()[0]!.events.map((e) => e.label);
    expect(labels.filter((l) => l.startsWith('SKIP_WAITING')).length).toBe(2);
  });

  it('9. installed のまま、さらに 10 秒 (合計 15 秒) たっても動かなければ案内。SKIP_WAITING は 2 回だけ', async () => {
    vi.useFakeTimers();
    placeRetryMark(); // 読み込み直しは済んでいる (PU-25)
    const w = new FakeWorker('installed');
    fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(14900);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    await expect(done).resolves.toBe(false);
    expect(w.postMessage).toHaveBeenCalledTimes(2);
  });

  it('10. 5 秒の時点で reg.active がすでに新しい版 (activated。印の取りこぼし) なら、すぐ読み込み直す', async () => {
    vi.useFakeTimers();
    const oldActive = new FakeWorker('activated');
    const w = new FakeWorker('installed');
    const { reg } = fakeRegistration({ waiting: w });
    (reg as unknown as { active: FakeWorker }).active = oldActive;
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(3000);
    (reg as unknown as { active: FakeWorker }).active = new FakeWorker('activated'); // 印 (statechange・controllerchange) が来ないまま入れ替わった
    await vi.advanceTimersByTimeAsync(2100);
    await expect(done).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(w.postMessage).toHaveBeenCalledTimes(1);
  });
});


describe('PU-25: installed のまま動かないときは、印を置いて 1 回だけ自分で読み込み直す', () => {
  let reload: ReturnType<typeof vi.fn<() => void>>;
  beforeEach(() => {
    reload = vi.fn<() => void>();
    setReloadForTest(reload);
    clearUpdateLogsForTest();
    window.localStorage.removeItem(RETRY_KEY);
  });
  afterEach(() => {
    setReloadForTest(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearUpdateLogsForTest();
    window.localStorage.removeItem(RETRY_KEY);
  });

  it('1. 15 秒たっても installed のまま: 案内を出さず (true)、読み込み直しが 1 回。印が置かれ、結果は retry-reload', async () => {
    vi.useFakeTimers();
    const w = new FakeWorker('installed') as FakeWorker & { scriptURL: string };
    w.scriptURL = 'https://example.test/sw.js';
    fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(15100);
    await expect(done).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    const mark = JSON.parse(window.localStorage.getItem(RETRY_KEY)!) as { at: number; url: string };
    expect(typeof mark.at).toBe('number');
    expect(mark.url).toBe('https://example.test/sw.js');
    const log = readUpdateLogs()[0]!;
    expect(log.result).toBe('retry-reload');
    expect(log.events.at(-1)!.label).toBe('読み込み直した(切り替えのやり直し)');
  });

  it('2. 印があるとき (10 分以内) に同じ失敗: 読み込み直さず false (今の案内)', async () => {
    vi.useFakeTimers();
    placeRetryMark(60_000);
    fakeRegistration({ waiting: new FakeWorker('installed') });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(15100);
    await expect(done).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(readUpdateLogs()[0]!.result).toBe('failed');
  });

  it('3. 印が 10 分より古ければ無いものとして消し、読み込み直す', async () => {
    vi.useFakeTimers();
    placeRetryMark(11 * 60_000);
    fakeRegistration({ waiting: new FakeWorker('installed') });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(15100);
    await expect(done).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(readUpdateLogs()[0]!.result).toBe('retry-reload');
  });

  it('4. activating のまま 25 秒など、installed でない失敗では読み込み直さない', async () => {
    vi.useFakeTimers();
    const w = new FakeWorker('installed');
    fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(500);
    w.setState('activating');
    await vi.advanceTimersByTimeAsync(25500);
    await expect(done).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(RETRY_KEY)).toBeNull();
  });

  it('5. SKIP_WAITING に MessageChannel の口を添える。返事があれば「返事があった」と記録する', async () => {
    vi.useFakeTimers();
    const channels: Array<{ port1: { onmessage: ((e: unknown) => void) | null }; port2: object }> = [];
    vi.stubGlobal(
      'MessageChannel',
      class {
        port1 = { onmessage: null as ((e: unknown) => void) | null };
        port2 = {};
        constructor() {
          channels.push(this);
        }
      },
    );
    const w = new FakeWorker('installed');
    fakeRegistration({ waiting: w });
    const done = applyUpdate();
    await vi.advanceTimersByTimeAsync(10);
    const [msg, transfer] = w.postMessage.mock.calls[0] as [{ type: string }, unknown[]];
    expect(msg).toEqual({ type: 'SKIP_WAITING' });
    expect(transfer).toEqual([channels[0]!.port2]);
    channels[0]!.port1.onmessage?.({}); // sw.js が返事をした
    w.setState('activated');
    await done;
    expect(readUpdateLogs()[0]!.events.some((e) => e.label === '返事があった')).toBe(true);
  });
});

describe('PU-25: recordStartup (起動したときの記録)', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '9.9.9');
    clearUpdateLogsForTest();
    window.localStorage.removeItem(RETRY_KEY);
    resetUpdaterForTest();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearUpdateLogsForTest();
    window.localStorage.removeItem(RETRY_KEY);
    // @ts-expect-error テストで足した偽物を外す
    delete navigator.serviceWorker;
  });

  function seedLog(): void {
    window.localStorage.setItem(
      'seikei-update-log',
      JSON.stringify([{ at: new Date().toISOString(), events: [{ ms: 0, label: '押した' }], result: 'retry-reload' }]),
    );
  }
  function fakeSw(reg: object, controller: boolean): void {
    const swc = new EventTarget() as EventTarget & { getRegistration?: () => Promise<unknown>; controller?: unknown };
    swc.controller = controller ? {} : null;
    swc.getRegistration = async () => reg;
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: swc });
  }

  it('6. 印があれば、一番新しい回に「起動した: 版=… / active=… / waiting=… / installing=… / controller=…」を足し、印を消す', async () => {
    seedLog();
    placeRetryMark(5000);
    fakeSw({ active: { state: 'activated' }, waiting: null, installing: null }, true);
    await recordStartup();
    const events = readUpdateLogs()[0]!.events;
    expect(events.at(-1)!.label).toBe('起動した: 版=9.9.9 / active=activated / waiting=なし / installing=なし / controller=あり');
    expect(window.localStorage.getItem(RETRY_KEY)).toBeNull();
    expect(startupSwitchFailed()).toBe(false);
  });

  it('7. それでも waiting があれば、設定画面に出す案内の印 (startupSwitchFailed) が true', async () => {
    seedLog();
    placeRetryMark(5000);
    fakeSw({ active: { state: 'activated' }, waiting: { state: 'installed' }, installing: null }, true);
    await recordStartup();
    expect(startupSwitchFailed()).toBe(true);
  });

  it('8. 印が無い・10 分より古いときは何も足さない (古い印は消す)', async () => {
    seedLog();
    fakeSw({ active: null, waiting: null, installing: null }, false);
    await recordStartup();
    expect(readUpdateLogs()[0]!.events).toHaveLength(1);
    placeRetryMark(11 * 60_000);
    await recordStartup();
    expect(readUpdateLogs()[0]!.events).toHaveLength(1);
    expect(window.localStorage.getItem(RETRY_KEY)).toBeNull();
    expect(startupSwitchFailed()).toBe(false);
  });
});
