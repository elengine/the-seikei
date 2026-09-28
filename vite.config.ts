import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

// ビルド時刻 (ISO 文字列)。アプリの版だけでは同じ 0.1.0 でも区別できないため診断に表示する
const buildId = new Date().toISOString();

export default defineConfig({
  base: '/the-seikei/',
  // アプリの版とビルドの識別をコードに埋め込む (管理者メニューに表示)
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    VitePWA({
      registerType: 'prompt', // 更新を促す表示は出さない。次回起動時に切り替わる (skipWaiting / clientsClaim は使わない)
      workbox: {
        // 全ファイルを事前にキャッシュする
        globPatterns: ['**/*.{js,css,html,png,json}'],
      },
      manifest: {
        name: '整経ゲーム',
        short_name: '整経',
        // アプリの識別子。解決後は https://elengine.github.io/the-seikei となる。
        // 実機にインストールした後に変えると別アプリ扱いになるため、00_rules.md のとおり今後は変更しない
        id: 'the-seikei',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#F7F3E8',
        theme_color: '#4F5B47',
        lang: 'ja',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
