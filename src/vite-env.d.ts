/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** package.json の version (vite.config.ts の define で埋め込む) */
declare const __APP_VERSION__: string;

/** ビルド時刻の ISO 文字列 (vite.config.ts の define で埋め込む) */
declare const __BUILD_ID__: string;
