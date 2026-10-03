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

/** 待っている新しい版に切り替えて、読み込み直す (確認のダイアログは出さない) */
export function applyUpdate(): void {
  if (isUpdateAvailable()) {
    void applyUpdateNow(); // registerSW の更新の関数 (reload=true)
    return;
  }
  const w = waiting;
  const sw = navigator.serviceWorker;
  if (w !== null && sw !== undefined) {
    sw.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    w.postMessage({ type: 'SKIP_WAITING' });
  }
}

export function resetUpdaterForTest(): void {
  waiting = null;
  listeners.clear();
  clearUpdateAvailableForTest();
}
