import type { AppContext } from '../context';
import type { Screen } from '../screenManager';
import type { ImportReport } from '../../core/storage/types';
import { createButton, setLockedReason } from '../../core/ui/widgets';
import { createCard, createPage, createScreenHeader, createSectionHeading } from '../../core/ui/layout';
import { collectDiagnostics, hasInstallPromptEvent, promptInstall } from '../diagnostics';
import { startRotationProbe } from './rotationProbe';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** バックアップのファイル名 seikei-backup-YYYYMMDD-HHmm.json */
function backupFileName(now: Date): string {
  return `seikei-backup-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}.json`;
}

/** 管理者メニュー (#/admin)。バックアップ・データの状態・ログ */
export function createAdminScreen(ctx: AppContext): Screen {
  let offProbe: (() => void) | null = null; // 回転の記録の監視をやめる関数 (unmount で解除)
  return {
    mount(container: HTMLElement): void {
      const root = document.createElement('div');
      root.classList.add('settings', 'admin');
      root.appendChild(createScreenHeader({ title: '管理者', onBack: () => ctx.navigate('/settings') }));
      const page = createPage({ width: 'form' });
      root.appendChild(page);

      /** 節 (見出し + 白いカード)。カードを返す */
      function section(heading: string): HTMLElement {
        const wrap = document.createElement('section');
        wrap.classList.add('admin__section');
        wrap.appendChild(createSectionHeading(heading));
        const card = createCard();
        card.classList.add('admin__card');
        wrap.appendChild(card);
        page.appendChild(wrap);
        return card;
      }

      /** 押せないボタンの理由を出す欄 (カードの中) */
      function noticeIn(card: HTMLElement): HTMLElement {
        const n = document.createElement('p');
        n.classList.add('admin__notice');
        card.appendChild(n);
        return n;
      }

      const diagCard = section('診断');
      const backupCard = section('バックアップ');
      const installCard = section('インストール');
      const logCard = section('ログ');
      const rotCard = section('回転の記録 (診断)');

      // ---- 回転の記録 (診断。iPhone で回転したときに画面全体が一瞬ずれる原因を数字で確定させる) ----
      const rotNote = document.createElement('p');
      rotNote.classList.add('admin__notice', 'admin__rot-note');
      rotNote.textContent = '画面を回すと記録します。回転のあと 2 秒間、フレームごとに画面の状態を測り、動いた値と時刻を出します。';
      rotCard.appendChild(rotNote);
      const rotList = document.createElement('ul');
      rotList.classList.add('admin__list', 'admin__rot-list');
      const rotFirst = document.createElement('li');
      rotFirst.textContent = 'まだ記録がありません';
      rotList.appendChild(rotFirst);
      rotCard.appendChild(rotList);
      const offProbeLocal = startRotationProbe((lines) => {
        rotList.textContent = '';
        for (const line of lines) {
          const li = document.createElement('li');
          li.textContent = line;
          rotList.appendChild(li);
        }
      });
      offProbe = offProbeLocal;

      // ---- バックアップを書き出す ----
      const exportBtn = createButton({
        label: 'バックアップを書き出す',
        variant: 'primary',
        onClick: async () => {
          try {
          const backup = await ctx.repo.exportAll();
          const json = JSON.stringify(backup, null, 2);
          const file = new File([json], backupFileName(new Date()), { type: 'application/json' });
          const saveByDownload = (): void => {
            // a 要素の download で保存する
            const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            a.click();
            setTimeout(() => {
              URL.revokeObjectURL(url);
            }, 5000);
          };
          const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
          if (canShare) {
            try {
              // Safari は、利用者の操作から時間が空くと share() を NotAllowedError で断ることがある。
              // そのときは a 要素の download で保存する。利用者が共有を閉じた (AbortError) ときは何もしない
              await navigator.share({ files: [file], title: '整経ゲームのバックアップ' });
              ctx.logger.log('info', `バックアップを書き出しました (${file.name})`);
            } catch (e) {
              if (e instanceof DOMException && e.name === 'AbortError') {
                ctx.logger.log('info', 'バックアップの共有をやめました');
                return;
              }
              if (e instanceof DOMException && e.name === 'NotAllowedError') {
                saveByDownload();
                ctx.logger.log('info', `バックアップをダウンロードに切り替えて保存しました (${file.name})`);
                return;
              }
              ctx.logger.log('error', `バックアップの書き出しに失敗: ${String(e)}`);
            }
          } else {
            saveByDownload();
            ctx.logger.log('info', `バックアップを書き出しました (${file.name})`);
          }
          } catch (e) {
            // exportAll などの失敗。記録を残し、処理されない Promise の失敗にしない
            ctx.logger.log('error', `バックアップの書き出しに失敗: ${String(e)}`);
          }
        },
      });
      backupCard.appendChild(exportBtn);

      // ---- バックアップを読み込む ----
      const importInput = document.createElement('input');
      importInput.type = 'file';
      importInput.accept = 'application/json';
      importInput.hidden = true; // 隠した input
      const importResult = document.createElement('p');
      importResult.classList.add('settings__value');
      const importBtn = createButton({
        label: 'バックアップを読み込む',
        variant: 'secondary',
        onClick: () => {
          importResult.textContent = '';
          importInput.click();
        },
      });
      importInput.addEventListener('change', () => {
        const file = importInput.files?.[0];
        if (file === undefined) {
          return;
        }
        void (async () => {
          try {
            const text = await file.text();
            const parsed: unknown = JSON.parse(text);
            const report: ImportReport = await ctx.repo.importAll(parsed as Parameters<typeof ctx.repo.importAll>[0]);
            importResult.textContent = `追加 ${report.added}件・更新 ${report.updated}件・変化なし ${report.unchanged}件・読み込めず ${report.rejected}件`;
            ctx.logger.log('info', `バックアップを読み込みました (追加${report.added}/更新${report.updated})`);
          } catch {
            // JSON として読み込めない
            importResult.textContent = 'ファイルを読み込めませんでした';
            ctx.logger.log('warn', 'バックアップの読み込みに失敗しました');
          }
          importInput.value = '';
        })();
      });
      backupCard.appendChild(importBtn);
      backupCard.appendChild(importInput);
      backupCard.appendChild(importResult);

      // ---- データの状態 ----
      const stateList = document.createElement('ul');
      stateList.classList.add('admin__list');
      diagCard.appendChild(stateList);

      void (async () => {
        const items: string[] = [];
        const schemaVersion = await ctx.repo.getMeta('schemaVersion');
        items.push(`スキーマの版: ${schemaVersion ?? '（まだ）'}`);
        items.push(`アプリの版: ${__APP_VERSION__}`);
        try {
          const persisted = await navigator.storage?.persisted?.();
          items.push(`永続化: ${persisted === undefined ? '不明' : persisted ? 'されている' : 'されていない'}`);
        } catch {
          items.push('永続化: 不明'); // 使えない環境
        }
        try {
          const est = await navigator.storage?.estimate?.();
          items.push(est?.usage !== undefined && est?.quota !== undefined ? `使用量の見積もり: 約 ${Math.round(est.usage! / 1024)} KB / ${Math.round(est.quota! / (1024 * 1024))} MB` : '使用量の見積もり: 不明');
        } catch {
          items.push('使用量の見積もり: 不明');
        }
        items.push(`端末ID: ${ctx.deviceId}`);
        stateList.textContent = '';
        for (const item of items) {
          const li = document.createElement('li');
          li.textContent = item;
          stateList.appendChild(li);
        }
      })();

      // ---- 診断 ----
      const diagList = document.createElement('ul');
      diagList.classList.add('admin__list');
      diagCard.appendChild(diagList);
      void (async () => {
        const items = await collectDiagnostics({ installPromptRecorded: false });
        diagList.textContent = '';
        for (const item of items) {
          const li = document.createElement('li');
          li.textContent = `${item.label}: ${item.value}`;
          diagList.appendChild(li);
        }
        // ビルドの識別 (版だけでは同じ 0.1.0 でも区別できないため)
        const buildLi = document.createElement('li');
        buildLi.textContent = `ビルドの識別: ${__BUILD_ID__}`;
        diagList.appendChild(buildLi);
      })();

      // ---- アプリとしてインストール (beforeinstallprompt が保存されているときだけ押せる) ----
      const installNotice = noticeIn(installCard);
      const installBtn = createButton({
        label: 'アプリとしてインストール',
        variant: 'secondary',
        lockedReason: hasInstallPromptEvent() ? undefined : 'この端末では、いまはインストールできません',
        onLocked: (reason) => {
          installNotice.textContent = reason;
        },
        onClick: async () => {
          const result = await promptInstall();
          if (result !== null) {
            ctx.logger.log('info', `インストールの確認: ${result.outcome === 'accepted' ? '受け入れられた' : '見送られた'} (${result.outcome})`);
          }
          setLockedReason(installBtn, 'インストールの確認は1回だけです'); // prompt() は1回しか使えないので押せなく戻す
        },
      });
      installCard.insertBefore(installBtn, installNotice);

      // ---- ログ ----
      const logList = document.createElement('ul');
      logList.classList.add('admin__list');
      for (const entry of ctx.logger.entries()) {
        const li = document.createElement('li');
        li.textContent = `${entry.at} [${entry.level}] ${entry.message}`;
        logList.appendChild(li);
      }
      logCard.appendChild(logList);

      container.textContent = '';
      container.appendChild(root);
    },

    unmount(): void {
      offProbe?.(); // 回転の記録の監視をやめる
      // root は container ごと取り除かれる
    },
  };
}
