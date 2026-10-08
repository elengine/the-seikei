import { applyUpdateNow, isUpdateAvailable, setUpdateAvailable, clearUpdateAvailableForTest } from './diagnostics';

/**
 * アプリの新しい版の確認と切り替え (PU-10a)。
 * Service Worker の registration.update() で新しい版を確かめ、見つかれば状態を「届いている」にして通知する。
 * main.ts の registerSW の onNeedRefresh からも状態を受ける (markUpdateAvailable)。
 */

export type UpdateResult = 'available' | 'latest' | 'offline';

/** 新しい版の取り込みを待つ最長の時間 (ミリ秒) */
const INSTALL_WAIT_MS = 15000;

let waiting: ServiceWorker | null = null; // 確認で見つかった、待っている新しい版
const listeners = new Set<(ready: boolean) => void>();

function notify(): void {
  const ready = isUpdateReady();
  for (const cb of listeners) {
    cb(ready);
  }
}

/** 新しい版が届いているか */
export function isUpdateReady(): boolean {
  return isUpdateAvailable() || waiting !== null;
}

/** 新しい版が届いたことを記録して知らせる (main.ts の registerSW の onNeedRefresh から呼ぶ。apply は registerSW が返す更新の関数) */
export function markUpdateAvailable(apply: (reload?: boolean) => Promise<void>): void {
  setUpdateAvailable(apply);
  notify();
}

/** 状態の変化を受け取る (届いたとき true)。戻り値で解除する */
export function onUpdateState(cb: (ready: boolean) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** 取り込み中の新しい版が「待っている」状態になるまで待つ (失敗・時間切れでも抜ける) */
function waitUntilInstalled(sw: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, INSTALL_WAIT_MS);
    function done(): void {
      clearTimeout(timer);
      sw.removeEventListener('statechange', onChange);
      resolve();
    }
    function onChange(): void {
      if (sw.state === 'installed' || sw.state === 'redundant') {
        done();
      }
    }
    sw.addEventListener('statechange', onChange);
  });
}

/** 新しい版があるか確かめる。通信できなければ 'offline'。Service Worker が無ければ確かめる相手がいないので 'latest' */
export async function checkForUpdate(): Promise<UpdateResult> {
  if (isUpdateReady()) {
    return 'available';
  }
  if (navigator.onLine === false) {
    return 'offline';
  }
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (sw === undefined) {
    return 'latest';
  }
  const reg = await sw.getRegistration();
  if (reg === undefined) {
    return 'latest';
  }
  try {
    await reg.update();
  } catch {
    return 'offline';
  }
  if (reg.installing !== null && reg.installing.state !== 'installed') {
    await waitUntilInstalled(reg.installing);
  }
  if (reg.waiting !== null) {
    waiting = reg.waiting;
    notify();
    return 'available';
  }
  return 'latest';
}

/** 切り替えの完了をまず待つ時間 (ミリ秒)。この時点で切り替わっていなければ、状態を見て延長するかあきらめる */
const SWITCH_WAIT_MS = 5000;
/** 5 秒の時点で activating (切り替えの途中) のときに、さらに待つ最長の時間 (ミリ秒。PU-23b) */
const ACTIVATING_EXTRA_MS = 20000;
/** 5 秒の時点で installed (動いていない) のとき、SKIP_WAITING をもう一度送って、さらに待つ最長の時間 (ミリ秒。PU-23b) */
const INSTALLED_EXTRA_MS = 10000;

let reloadFn: () => void = () => window.location.reload();

/** テスト用: 再読み込みの処理を差し替える (null で戻す) */
export function setReloadForTest(fn: (() => void) | null): void {
  reloadFn = fn ?? (() => window.location.reload());
}

// ---- 「アップデートする」の流れの記録 (PU-23a。診断用。直近 3 回を localStorage に置き、管理者メニューで見せる) ----

export interface UpdateLogEvent {
  /** 押した時刻からの経過ミリ秒 */
  ms: number;
  label: string;
}

export interface UpdateLogEntry {
  /** 押した時刻 (ISO) */
  at: string;
  events: UpdateLogEvent[];
  /** reloaded = 読み込み直した / failed = 案内を出した */
  result: 'reloaded' | 'failed';
}

const UPDATE_LOG_KEY = 'seikei-update-log';
const UPDATE_LOG_KEEP = 3;

/** 直近の記録 (新しい順)。読めない・壊れているときは空 */
export function readUpdateLogs(): UpdateLogEntry[] {
  try {
    const raw = window.localStorage.getItem(UPDATE_LOG_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UpdateLogEntry[]).slice(0, UPDATE_LOG_KEEP) : [];
  } catch {
    return [];
  }
}

function writeUpdateLog(entry: UpdateLogEntry): void {
  try {
    const next = [entry, ...readUpdateLogs()].slice(0, UPDATE_LOG_KEEP);
    window.localStorage.setItem(UPDATE_LOG_KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても、切り替えは続ける
  }
}

/** テスト用: 記録を消す */
export function clearUpdateLogsForTest(): void {
  try {
    window.localStorage.removeItem(UPDATE_LOG_KEY);
  } catch {
    // 何もしない
  }
}

/** 1 回の「アップデートする」の記録を取る。finish で保存する (読み込み直しの前に呼ぶ) */
function startRun(): { add(label: string): void; finish(result: UpdateLogEntry['result']): void } {
  const t0 = Date.now();
  const at = new Date(t0).toISOString();
  const events: UpdateLogEvent[] = [];
  return {
    add(label: string): void {
      events.push({ ms: Date.now() - t0, label });
    },
    finish(result: UpdateLogEntry['result']): void {
      events.push({ ms: Date.now() - t0, label: result === 'reloaded' ? '読み込み直した' : '案内を出した' });
      writeUpdateLog({ at, events, result });
    },
  };
}

type Run = ReturnType<typeof startRun>;

/** 各部の状態の 1 行 (待っている版・active・waiting・installing・controller) */
function describeStates(w: ServiceWorker, reg: ServiceWorkerRegistration, swc: ServiceWorkerContainer): string {
  const st = (x: ServiceWorker | null | undefined): string => (x === null || x === undefined ? 'なし' : x.state);
  return `待っている版=${w.state} / active=${st(reg.active)} / waiting=${st(reg.waiting)} / installing=${st(reg.installing)} / controller=${swc.controller ? 'あり' : 'なし'}`;
}

/**
 * 待っている版に SKIP_WAITING を送り、切り替わったら読み込み直す。切り替わった印は 3 つ:
 * controllerchange (この画面の担当が変わった)、待っていた版が activated になること、5 秒の時点で reg.active が
 * すでに新しい版 (activated) になっていること (印の取りこぼし)。どれが先でも、再読み込みは 1 回。
 * 待っていた版が捨てられた (redundant) ときは、すぐ false を返す (呼び出し側が新しい版を見つけ直す。PU-19b)。
 * 5 秒の時点で切り替わっていなければ (PU-23b):
 *   activating (切り替えの途中) なら、あきらめずに最長 20 秒待つ。
 *   installed (動いていない) なら、SKIP_WAITING をもう一度だけ送り、さらに最長 10 秒待つ。
 * それでも切り替わらなければ、読み込み直さず false を返す。経過は run に記録する (PU-23a)。
 */
function switchTo(w: ServiceWorker, swc: ServiceWorkerContainer, reg: ServiceWorkerRegistration, run: Run): Promise<boolean> {
  return new Promise((resolve) => {
    let finished = false;
    let prevState = w.state;
    const activeAtStart = reg.active;
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(onFirstDeadline, SWITCH_WAIT_MS);
    function cleanup(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      swc.removeEventListener('controllerchange', onChange);
      w.removeEventListener('statechange', onState);
    }
    function finish(ok: boolean): void {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      if (ok) {
        run.finish('reloaded'); // 読み込み直しの前に保存する
        reloadFn();
      } else {
        run.add('この版の切り替えをあきらめた');
      }
      resolve(ok);
    }
    /** 印を取りこぼして、すでに新しい版が動いているか */
    function activeIsNew(): boolean {
      return w.state === 'activated' || (reg.active !== null && reg.active !== activeAtStart && reg.active.state === 'activated');
    }
    function onFirstDeadline(): void {
      timer = null;
      run.add(`5 秒の時点: ${describeStates(w, reg, swc)}`);
      if (activeIsNew()) {
        finish(true);
      } else if (w.state === 'activating') {
        run.add(`activating のまま。最長 ${ACTIVATING_EXTRA_MS / 1000} 秒待つ`);
        timer = setTimeout(onFinalDeadline, ACTIVATING_EXTRA_MS);
      } else if (w.state === 'installed') {
        run.add('installed のまま。SKIP_WAITING をもう一度送る');
        w.postMessage({ type: 'SKIP_WAITING' });
        run.add('SKIP_WAITING を送った (2 回目)');
        timer = setTimeout(onFinalDeadline, INSTALLED_EXTRA_MS);
      } else {
        finish(false);
      }
    }
    function onFinalDeadline(): void {
      timer = null;
      run.add(`延長の終わり: ${describeStates(w, reg, swc)}`);
      finish(activeIsNew());
    }
    function onChange(): void {
      run.add('controllerchange');
      finish(true);
    }
    function onState(): void {
      run.add(`${prevState} → ${w.state}`);
      prevState = w.state;
      if (w.state === 'activated') {
        finish(true);
      } else if (w.state === 'redundant') {
        finish(false); // さらに新しい版が入って捨てられた
      }
    }
    swc.addEventListener('controllerchange', onChange);
    w.addEventListener('statechange', onState);
    w.postMessage({ type: 'SKIP_WAITING' });
    run.add('SKIP_WAITING を送った');
  });
}

/**
 * 切り替えに失敗したあと、今の registration から新しい版 (失敗した版 prev とは別の版) を見つける。
 * 入れている途中の版があれば入れ終わるのを待つ。無ければ null (PU-19b)。
 */
async function findNewer(reg: ServiceWorkerRegistration, prev: ServiceWorker): Promise<ServiceWorker | null> {
  if (reg.installing !== null && reg.installing !== prev && reg.installing.state !== 'installed') {
    await waitUntilInstalled(reg.installing);
  }
  const next = reg.waiting;
  return next !== null && next !== prev && next.state !== 'redundant' ? next : null;
}

/**
 * 新しい版に切り替えて、読み込み直す (確認のダイアログは出さない)。成功なら true (読み込み直しを呼んだ)、
 * 切り替わらなければ false (新しい版が見つかれば 1 回だけやり直す)。待っている版は registration から直接見つける (registerSW の更新の関数には頼らない。
 * 関数は、待っている版が見つからないときの代わり)。
 */
export async function applyUpdate(): Promise<boolean> {
  const run = startRun();
  const swc = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (swc !== undefined) {
    const reg = await swc.getRegistration();
    if (reg !== undefined) {
      let w: ServiceWorker | null = reg.waiting ?? waiting;
      if (w === null && reg.installing !== null) {
        await waitUntilInstalled(reg.installing);
        w = reg.waiting;
      }
      if (w !== null) {
        run.add(`押した: ${describeStates(w, reg, swc)}`);
        if (await switchTo(w, swc, reg, run)) {
          return true;
        }
        // 切り替え中にさらに新しい版が入って待っていた版が捨てられた、または別の版が待っている・入れている途中:
        // 新しい版を見つけ直して、1 回だけやり直す。それでも切り替わらなければ false (案内を出す)
        const next = await findNewer(reg, w);
        if (next === null) {
          run.finish('failed');
          return false;
        }
        waiting = next;
        run.add(`新しい版を見つけ直した: ${describeStates(next, reg, swc)}`);
        const ok = await switchTo(next, swc, reg, run);
        if (!ok) {
          run.finish('failed');
        }
        return ok;
      }
    }
  }
  if (isUpdateAvailable()) {
    run.add('押した: registerSW の更新の関数で切り替える');
    run.finish('reloaded');
    await applyUpdateNow(); // registerSW の更新の関数 (reload=true)
    return true;
  }
  run.add('押した: 待っている版が見つからない');
  run.finish('reloaded');
  reloadFn(); // 待っている版が無い: ほかの画面ですでに切り替わっているかもしれない。読み込み直して今の版にそろえる
  return true;
}

export function resetUpdaterForTest(): void {
  waiting = null;
  listeners.clear();
  clearUpdateAvailableForTest();
}
