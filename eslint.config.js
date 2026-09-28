import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// アプリ本体 (src/**, ただし *.test.ts を除く) で禁止する Node 専用モジュール
const NODE_BLOCKED = [
  'fs', 'fs/promises', 'path', 'process', 'os', 'url', 'util', 'crypto',
  'child_process', 'stream', 'http', 'https', 'net', 'zlib', 'worker_threads',
].flatMap((m) => [{ name: m }, { name: `node:${m}` }]);

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['**/app/**', '**/games/**', '**/zukan/**'],
        },
      ],
    },
  },
  {
    // アプリ本体から Node の機能を使わせない (テストのみ node:* を許可)
    files: ['src/**'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...NODE_BLOCKED.map((m) => ({
              group: [m.name, `${m.name}/*`],
              message: 'アプリ本体では Node のモジュールを使えない (テストでのみ可)',
            })),
            {
              group: ['node:*'],
              message: 'アプリ本体では node:* を import できない (テストでのみ可)',
            },
          ],
        },
      ],
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
);
