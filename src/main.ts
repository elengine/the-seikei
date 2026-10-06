import './styles/base.css';
import { registerSW } from 'virtual:pwa-register';
import { createSystemClock } from './core/clock/clock';
import { boot } from './app/boot';
import { setInstallPromptRecorded } from './app/diagnostics';
import { checkForUpdate, markUpdateAvailable } from './app/updater';
import { createScreenManager } from './app/screenManager';
import { installScrollReset, installScrollGuard } from './core/viewport/viewport'; // 回転のあとの文書のずれを戻す (T1-21a-2)
import type { Route } from './app/screenManager';
import { createHomeScreen } from './app/screens/homeScreen';
import { createSettingsScreen } from './app/screens/settingsScreen';
import { createTermsScreen } from './app/screens/termsScreen';
import { createAdminScreen } from './app/screens/adminScreen';
import { createGameScreen } from './app/screens/gameScreen';
import { registerGame } from './core/game/registry';
import { createCreelModule } from './games/creel';
import { createDrumSetupModule } from './games/drumsetup';
import { createWindingModule } from './games/winding';
import { createBeamingModule } from './games/beaming';
import { createItowariModule } from './games/itowari';
import { gameDepsFrom } from './app/context';
import { getContent } from './core/content/content';

// Service Worker を登録する (registerType: 'prompt'。お父さん向けの画面では案内を出さず、
// 設定の画面の「アップデートを確認」と、起動時の自動の確認で届いたことを知らせ、「アップデートする」で切り替える)
const updateSW = registerSW({
  immediate: false,
  onNeedRefresh() {
    markUpdateAvailable(updateSW);
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
  registerGame(createItowariModule(gameDepsFrom(ctx)));
  registerGame(createCreelModule(gameDepsFrom(ctx)));
  registerGame(createDrumSetupModule(gameDepsFrom(ctx)));
  registerGame(createWindingModule(gameDepsFrom(ctx)));
  registerGame(createBeamingModule(gameDepsFrom(ctx)));
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
installScrollReset(); // 大きさの変化 (回転) のたびに window.scrollTo(0, 0) (T1-21a-2)
installScrollGuard(); // ずれた瞬間に描画される前に戻す (T1-21a-2 案1)
  screens.start();

  // 起動の 3 秒後に 1 回、新しい版を自動で確認する (待ち受けの間は確認しない)。届いていれば、ホームの「設定」にバッジが付く
  setTimeout(() => {
    if (document.visibilityState === 'visible') {
      void checkForUpdate();
    }
  }, 3000);
}

void main();
