import type { Logger } from '../core/log/log';

/** 管理者メニュー「診断」に表示する1項目 */
export interface DiagnosticItem {
  label: string;
  value: string;
}

let installPromptSeen = false;
let installPromptEvent: BeforeInstallPromptEvent | null = null;

/** beforeinstallprompt イベントの必要な部分。prompt() は1回しか呼べない */
export interface BeforeInstallPromptEvent {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** インストール用イベントが保存されているか */
export function hasInstallPromptEvent(): boolean {
  return installPromptEvent !== null;
}

/**
 * beforeinstallprompt を preventDefault して保存する (main.ts から boot より前に呼ぶ)。
 * 保存したイベントは管理者メニューの「アプリとしてインストール」ボタンから prompt() する。
 */
export function setInstallPromptRecorded(): void {
  if (typeof window === 'undefined' || window.addEventListener === undefined) {
    return; // テスト環境など window が無い場合は何もしない
  }
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    installPromptEvent = e as unknown as BeforeInstallPromptEvent;
    installPromptSeen = true;
  });
}

/** 保存したイベントの prompt() を呼び、userChoice の結果を返す。呼んだ後はイベントを捨てる (1回だけ) */
export async function promptInstall(): Promise<{ outcome: 'accepted' | 'dismissed' } | null> {
  const event = installPromptEvent;
  if (event === null) {
    return null;
  }
  installPromptEvent = null; // prompt() は1回しか使えない
  await event.prompt();
  const choice = await event.userChoice;
  return { outcome: choice.outcome };
}

/** キャッシュの中の manifest.webmanifest から id を取り出す。無ければ既定の表示を返す */
export async function manifestIdFromCache(): Promise<string> {
  try {
    if (typeof caches === 'undefined') {
      return '(キャッシュなし)';
    }
    const keys = await caches.keys();
    for (const key of keys) {
      const cache = await caches.open(key);
      // workbox の precache は ?__WB_REVISION__= 付きの URL で保存するため、
      // cache.match の完全一致ではなく登録リストから manifest を探す
      const requests = await cache.keys();
      const manifestReq = requests.find((r) => r.url.includes('manifest.webmanifest'));
      if (manifestReq !== undefined) {
        try {
          const res = await cache.match(manifestReq);
          if (res === undefined) {
            continue;
          }
          const json = (await res.json()) as { id?: unknown };
          return typeof json.id === 'string' ? json.id : '(id なし)';
        } catch {
          return '(id なし)';
        }
      }
    }
    return '(キャッシュなし)';
  } catch {
    return '(キャッシュなし)';
  }
}

/** ネットワークから直接 manifest を取って id を取り出す (クエリでキャッシュを迂回) */
export async function manifestIdFromNetwork(nowMs: number): Promise<string> {
  try {
    const url = `manifest.webmanifest?diag=${nowMs}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return '(取得できず)';
    }
    const json = (await res.json()) as { id?: unknown };
    return typeof json.id === 'string' ? json.id : '(id なし)';
  } catch {
    return '(取得できず)';
  }
}

/** Service Worker の状態を調べる */
export async function serviceWorkerState(): Promise<{ registered: string; scriptURL: string; waiting: string }> {
  if (typeof navigator === 'undefined' || navigator.serviceWorker === undefined) {
    return { registered: 'いいえ', scriptURL: '—', waiting: 'いいえ' };
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg === undefined) {
      return { registered: 'いいえ', scriptURL: '—', waiting: 'いいえ' };
    }
    const scriptURL = reg.active?.scriptURL ?? '(active なし)';
    const waiting = reg.waiting !== undefined && reg.waiting !== null ? 'あり' : 'なし';
    return { registered: 'はい', scriptURL, waiting };
  } catch {
    return { registered: '(確認できず)', scriptURL: '—', waiting: '(確認できず)' };
  }
}

/** beforeinstallprompt の記録からインストール判定を返す */
export function installPromptState(recorded: boolean): string {
  return recorded ? 'はい' : 'いいえ';
}

/** 表示モード (standalone かどうか) */
export function displayModeState(matches: boolean): string {
  return matches ? 'standalone' : 'ブラウザ内';
}

/** 診断項目をすべて集める */
export async function collectDiagnostics(opts: {
  installPromptRecorded: boolean;
  logger?: Logger;
}): Promise<DiagnosticItem[]> {
  const [cachedId, networkId, sw] = await Promise.all([
    manifestIdFromCache(),
    manifestIdFromNetwork(Date.now()),
    serviceWorkerState(),
  ]);
  const items: DiagnosticItem[] = [
    { label: '保存済みの設定ファイル (キャッシュ内の id)', value: cachedId },
    { label: '最新の設定ファイル (ネットワークの id)', value: networkId },
    { label: 'Service Worker 登録', value: sw.registered },
    { label: 'Service Worker scriptURL', value: sw.scriptURL },
    { label: 'Service Worker 待機中', value: sw.waiting },
    { label: 'インストールの判定 (beforeinstallprompt)', value: installPromptState(opts.installPromptRecorded || installPromptSeen) },
    { label: '表示モード', value: displayModeState(typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) },
  ];
  return items;
}
