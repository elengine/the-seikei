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

/** 切り替えの完了を待つ最長の時間 (ミリ秒)。これを過ぎても切り替わらなければ失敗とする */
const SWITCH_WAIT_MS = 5000;

let reloadFn: () => void = () => window.location.reload();

/** テスト用: 再読み込みの処理を差し替える (null で戻す) */
export function setReloadForTest(fn: (() => void) | null): void {
  reloadFn = fn ?? (() => window.location.reload());
}

/**
 * 待っている版に SKIP_WAITING を送り、切り替わったら読み込み直す。切り替わった印は 2 つ:
 * controllerchange (この画面の担当が変わった) と、待っていた版が activated になること (クライアントを引き継がない
 * Service Worker では controllerchange が来ないことがあるため)。どちらが先でも、再読み込みは 1 回。
 * 5 秒たっても切り替わらなければ、読み込み直さず false を返す。待っていた版が捨てられた (redundant) ときは、
 * 5 秒を待たずに false を返す (呼び出し側が新しい版を見つけ直す。PU-19b)。
 */
function switchTo(w: ServiceWorker, swc: ServiceWorkerContainer): Promise<boolean> {
  return new Promise((resolve) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (w.state === 'activated') {
        finish(true); // 印を取りこぼしていても、切り替わっていれば読み込み直す
      } else {
        finish(false);
      }
    }, SWITCH_WAIT_MS);
    function cleanup(): void {
      clearTimeout(timer);
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
        reloadFn();
      }
      resolve(ok);
    }
    function onChange(): void {
      finish(true);
    }
    function onState(): void {
      if (w.state === 'activated') {
        finish(true);
      } else if (w.state === 'redundant') {
        finish(false); // さらに新しい版が入って捨てられた
      }
    }
    swc.addEventListener('controllerchange', onChange);
    w.addEventListener('statechange', onState);
    w.postMessage({ type: 'SKIP_WAITING' });
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
        if (await switchTo(w, swc)) {
          return true;
        }
        // 切り替え中にさらに新しい版が入って待っていた版が捨てられた、または別の版が待っている・入れている途中:
        // 新しい版を見つけ直して、1 回だけやり直す。それでも切り替わらなければ false (案内を出す)
        const next = await findNewer(reg, w);
        if (next === null) {
          return false;
        }
        waiting = next;
        return switchTo(next, swc);
      }
    }
  }
  if (isUpdateAvailable()) {
    await applyUpdateNow(); // registerSW の更新の関数 (reload=true)
    return true;
  }
  reloadFn(); // 待っている版が無い: ほかの画面ですでに切り替わっているかもしれない。読み込み直して今の版にそろえる
  return true;
}

export function resetUpdaterForTest(): void {
  waiting = null;
  listeners.clear();
  clearUpdateAvailableForTest();
}
