import './styles/base.css';
import { createSystemClock } from './core/clock/clock';
import { createAppContext } from './app/context';
import { createScreenManager } from './app/screenManager';
import type { Route } from './app/screenManager';
import { createHomeScreen } from './app/screens/homeScreen';
import { createSettingsScreen } from './app/screens/settingsScreen';

async function main(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (app === null) {
    return;
  }

  const clock = createSystemClock();
  const ctx = await createAppContext({
    dbName: 'seikei-game',
    clock,
    navigate: (path: string) => {
      window.location.hash = path;
    },
  });

  // 最初の pointerdown で audio を unlock する (iPad の Safari などでは利用者の操作が必要)
  window.addEventListener(
    'pointerdown',
    () => {
      ctx.audio.unlock();
    },
    { once: true },
  );

  // ルート: / → ホーム、/settings → 設定
  const routes: Route[] = [
    { pattern: '/', create: () => createHomeScreen(ctx) },
    { pattern: '/settings', create: () => createSettingsScreen(ctx) },
  ];
  const screens = createScreenManager(app, routes);
  screens.start();
}

void main();
