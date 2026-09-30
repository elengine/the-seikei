import './styles/base.css';
import { registerSW } from 'virtual:pwa-register';
import { createSystemClock } from './core/clock/clock';
import { boot } from './app/boot';
import { setInstallPromptRecorded, setUpdateAvailable } from './app/diagnostics';
import { createScreenManager } from './app/screenManager';
import type { Route } from './app/screenManager';
import { createHomeScreen } from './app/screens/homeScreen';
import { createSettingsScreen } from './app/screens/settingsScreen';
import { createTermsScreen } from './app/screens/termsScreen';
import { createAdminScreen } from './app/screens/adminScreen';
import { createGameScreen } from './app/screens/gameScreen';
import { registerGame } from './core/game/registry';
import { createCreelModule } from './games/creel';
import { createWindingModule } from './games/winding';
import { gameDepsFrom } from './app/context';
import { getContent } from './core/content/content';

// Service Worker を登録する (registerType: 'prompt'。お父さん向けの画面では案内を出さず、
// 次回起動時に自動で切り替わる。管理者メニューの「今すぐ新しい版に切り替える」ボタンからも切り替えられる)
const updateSW = registerSW({
  immediate: false,
  onNeedRefresh() {
    setUpdateAvailable(updateSW);
  },
});

// beforeinstallprompt を preventDefault して保存する (管理者メニューのボタンから prompt() する)。
// boot より前に登録して、起動直後のイベントも取りこぼさない
setInstallPromptRecorded();

// インストールが完了したらログに残す (boot 前に発生した分は boot 後に転記する)
let appInstalledSeen = false;
window.addEventListener('appinstalled', () => {
  appInstalledSeen = true;
});

async function main(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (app === null) {
    return;
  }

  const clock = createSystemClock();
  const result = await boot({
    dbName: 'seikei-game',
    clock,
    navigate: (path: string) => {
      window.location.hash = path;
    },
  });

  if (!result.ok) {
    // 画面に大きく表示し、それ以外は何もしない (データを書き換えない)
    app.textContent = '';
    const errorBox = document.createElement('div');
    errorBox.classList.add('boot-error');
    const msg = document.createElement('p');
    msg.textContent = 'データの準備でうまくいきませんでした。管理者に連絡してください。';
    errorBox.appendChild(msg);
    app.appendChild(errorBox);
    return;
  }
  const ctx = result.ctx;
  if (appInstalledSeen) {
    ctx.logger.log('info', 'appinstalled を受信');
  }

  // 利用者の操作のたびに audio を unlock する (iPad の Safari などでは利用者の操作が必要。
  // 裏に回って止まった音の出力を、操作の中で再開させるため。pointerdown は Safari に認められないことがある)
  for (const type of ['pointerup', 'touchend', 'click'] as const) {
    window.addEventListener(
      type,
      () => {
        ctx.audio.unlock();
      },
      { passive: true },
    );
  }

  // ゲームの登録 (クリール立て・ドラム巻き)。内容データの問題があればログに残す
  registerGame(createCreelModule(gameDepsFrom(ctx)));
  registerGame(createWindingModule(gameDepsFrom(ctx)));
  const contentProblems = getContent().problems;
  if (contentProblems.length > 0) {
    for (const problem of contentProblems) {
      ctx.logger.log('warn', `内容データ: ${problem}`);
    }
  }

  // ルート: / → ホーム、/settings → 設定、/settings/terms → 呼び名、/admin → 管理者
  const routes: Route[] = [
    { pattern: '/', create: () => createHomeScreen(ctx) },
    { pattern: '/settings', create: () => createSettingsScreen(ctx) },
    { pattern: '/settings/terms', create: () => createTermsScreen(ctx) },
    { pattern: '/games/:id', create: () => createGameScreen(ctx) },
    { pattern: '/admin', create: () => createAdminScreen(ctx) },
  ];
  const screens = createScreenManager(app, routes);
  screens.start();
}

void main();
