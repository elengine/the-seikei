import './styles/base.css';
import { registerSW } from 'virtual:pwa-register';
import { createSystemClock } from './core/clock/clock';
import { boot } from './app/boot';
import { createScreenManager } from './app/screenManager';
import type { Route } from './app/screenManager';
import { createHomeScreen } from './app/screens/homeScreen';
import { createSettingsScreen } from './app/screens/settingsScreen';
import { createTermsScreen } from './app/screens/termsScreen';
import { createAdminScreen } from './app/screens/adminScreen';

// Service Worker を登録する (registerType: 'prompt'。更新は次回起動時に切り替わる)
registerSW({ immediate: false });

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

  // 最初の pointerdown で audio を unlock する (iPad の Safari などでは利用者の操作が必要)
  window.addEventListener(
    'pointerdown',
    () => {
      ctx.audio.unlock();
    },
    { once: true },
  );

  // ルート: / → ホーム、/settings → 設定、/settings/terms → 呼び名、/admin → 管理者
  const routes: Route[] = [
    { pattern: '/', create: () => createHomeScreen(ctx) },
    { pattern: '/settings', create: () => createSettingsScreen(ctx) },
    { pattern: '/settings/terms', create: () => createTermsScreen(ctx) },
    { pattern: '/admin', create: () => createAdminScreen(ctx) },
  ];
  const screens = createScreenManager(app, routes);
  screens.start();
}

void main();
