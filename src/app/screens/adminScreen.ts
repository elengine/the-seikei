import type { AppContext } from '../context';
import type { Screen } from '../screenManager';
import type { ImportReport } from '../../core/storage/types';
import { createButton } from '../../core/ui/widgets';
import { collectDiagnostics, hasInstallPromptEvent, promptInstall, isUpdateAvailable, applyUpdateNow } from '../diagnostics';
import { confirmDialog } from '../../core/ui/widgets';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** バックアップのファイル名 seikei-backup-YYYYMMDD-HHmm.json */
function backupFileName(now: Date): string {
  return `seikei-backup-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}.json`;
}

/** 管理者メニュー (#/admin)。バックアップ・データの状態・ログ */
export function createAdminScreen(ctx: AppContext): Screen {
  return {
    mount(container: HTMLElement): void {
      const root = document.createElement('div');
      root.classList.add('settings');

      const title = document.createElement('h1');
      title.classList.add('settings__title');
      title.textContent = '管理者';
      root.appendChild(title);

      const backBtn = createButton({
        label: '戻る',
        variant: 'secondary',
        onClick: () => {
          ctx.audio.play('tap');
          ctx.navigate('/settings');
        },
      });
      root.appendChild(backBtn);

      // ---- バックアップを書き出す ----
      const exportBtn = createButton({
        label: 'バックアップを書き出す',
        variant: 'primary',
        onClick: async () => {
          try {
            const backup = await ctx.repo.exportAll();
            const json = JSON.stringify(backup, null, 2);
            const file = new File([json], backupFileName(new Date()), { type: 'application/json' });
            const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
            if (canShare) {
              await navigator.share({ files: [file], title: '整経ゲームのバックアップ' });
            } else {
              // a 要素の download で保存する
              const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = file.name;
              a.click();
              setTimeout(() => {
                URL.revokeObjectURL(url);
              }, 5000);
            }
            ctx.logger.log('info', `バックアップを書き出しました (${file.name})`);
          } catch (e) {
            ctx.logger.log('error', `バックアップの書き出しに失敗: ${String(e)}`);
            void e;
          }
        },
      });
      root.appendChild(exportBtn);

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
      root.appendChild(importBtn);
      root.appendChild(importInput);
      root.appendChild(importResult);

      // ---- データの状態 ----
      const stateBox = document.createElement('div');
      stateBox.classList.add('admin__state');
      const stateTitle = document.createElement('p');
      stateTitle.classList.add('settings__label');
      stateTitle.textContent = 'データの状態';
      stateBox.appendChild(stateTitle);
      const stateList = document.createElement('ul');
      stateList.classList.add('admin__list');
      stateBox.appendChild(stateList);
      root.appendChild(stateBox);

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
      const diagBox = document.createElement('div');
      diagBox.classList.add('admin__state');
      const diagTitle = document.createElement('p');
      diagTitle.classList.add('settings__label');
      diagTitle.textContent = '診断';
      diagBox.appendChild(diagTitle);
      const diagList = document.createElement('ul');
      diagList.classList.add('admin__list');
      diagBox.appendChild(diagList);
      root.appendChild(diagBox);
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
      const installBtn = createButton({
        label: 'アプリとしてインストール',
        variant: 'primary',
        onClick: async () => {
          const result = await promptInstall();
          if (result !== null) {
            ctx.logger.log('info', `インストールの確認: ${result.outcome === 'accepted' ? '受け入れられた' : '見送られた'} (${result.outcome})`);
          }
          installBtn.disabled = true; // prompt() は1回しか使えないので押せなく戻す
        },
      });
      // 保存したイベントが無いときは押せない
      installBtn.disabled = !hasInstallPromptEvent();
      root.appendChild(installBtn);

      // ---- 今すぐ新しい版に切り替える (新しい版が届いているときだけ押せる) ----
      const updateBtn = createButton({
        label: '今すぐ新しい版に切り替える',
        variant: 'secondary',
        onClick: async () => {
          const ok = await confirmDialog(root, {
            message: '新しい版に切り替えますか? (画面が再読み込みされます)',
            okLabel: '切り替える',
            cancelLabel: 'やめる',
          });
          if (!ok) {
            return;
          }
          ctx.logger.log('info', '新しい版へ切り替え');
          await ctx.logger.flush(); // 再読み込み前にログを保存する
          await applyUpdateNow(); // 画面が再読み込みされる
        },
      });
      updateBtn.disabled = !isUpdateAvailable(); // 届いていないときは押せない
      root.appendChild(updateBtn);

      // ---- ログ ----
      const logBox = document.createElement('div');
      logBox.classList.add('admin__state');
      const logTitle = document.createElement('p');
      logTitle.classList.add('settings__label');
      logTitle.textContent = 'ログ';
      logBox.appendChild(logTitle);
      const logList = document.createElement('ul');
      logList.classList.add('admin__list');
      for (const entry of ctx.logger.entries()) {
        const li = document.createElement('li');
        li.textContent = `${entry.at} [${entry.level}] ${entry.message}`;
        logList.appendChild(li);
      }
      logBox.appendChild(logList);
      root.appendChild(logBox);

      container.textContent = '';
      container.appendChild(root);
    },

    unmount(): void {
      // root は container ごと取り除かれる
    },
  };
}
