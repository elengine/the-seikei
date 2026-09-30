import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createAdminScreen } from './adminScreen';
import type { AppContext } from '../context';

describe('T1-14 C: バックアップの書き出しで、データの読み出しに失敗したときの記録', () => {
  beforeAll(() => {
    // vite の define で置き換えられるビルドの識別 (テスト環境では未定義)
    vi.stubGlobal('__BUILD_ID__', 'test-build');
    vi.stubGlobal('__APP_VERSION__', 'test');
  });

  it('exportAll が失敗しても例外が外に出ず、ログに error が1件残る', async () => {
    const errors: string[] = [];
    const ctx = {
      repo: {
        exportAll: vi.fn(async () => {
          throw new Error('読み出しに失敗');
        }),
        // mount 中の診断欄が読む meta (テスト対象外)
        getMeta: vi.fn(async () => undefined),
      },
      logger: {
        entries: vi.fn(() => []),
        log: vi.fn((level: string, message: string) => {
          if (level === 'error') {
            errors.push(message);
          }
        }),
      },
      navigate: () => undefined,
    } as unknown as AppContext;

    const screen = createAdminScreen(ctx);
    const container = document.createElement('div');
    document.body.appendChild(container);
    screen.mount(container, {});

    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'バックアップを書き出す');
    expect(btn).toBeDefined();
    let thrown: unknown = null;
    try {
      await btn!.click();
      await vi.waitFor(() => {
        expect(errors).toHaveLength(1);
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeNull();
    expect(errors[0]).toContain('バックアップの書き出しに失敗');
  });
});

describe('PU-03b: 管理者の画面の節と押せないボタン', () => {
  beforeAll(() => {
    vi.stubGlobal('__BUILD_ID__', 'test-build');
    vi.stubGlobal('__APP_VERSION__', 'test');
  });

  it('節の見出しがそろい、押せないボタンは disabled にせず、押すと理由が出る', () => {
    const ctx = {
      repo: { exportAll: vi.fn(), getMeta: vi.fn(async () => undefined) },
      logger: { entries: vi.fn(() => []), log: vi.fn() },
      navigate: () => undefined,
    } as unknown as AppContext;
    const container = document.createElement('div');
    document.body.appendChild(container);
    createAdminScreen(ctx).mount(container, {});
    const heads = Array.from(container.querySelectorAll('.section-heading')).map((h) => h.textContent);
    expect(heads).toEqual(['診断', '版の切り替え', 'バックアップ', 'インストール', 'ログ']);
    expect(container.querySelector('.screen-header__title')!.textContent).toBe('管理者');
    const update = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '今すぐ新しい版に切り替える')!;
    expect(update.classList.contains('btn--locked')).toBe(true);
    expect(update.hasAttribute('disabled')).toBe(false);
    update.click();
    expect(container.textContent).toContain('新しい版はまだ届いていません');
  });
});
