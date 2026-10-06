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

describe('T1-21a-2 診断: 管理者の画面に回転の記録の節がある', () => {
  beforeAll(() => {
    vi.stubGlobal('__BUILD_ID__', 'test-build');
    vi.stubGlobal('__APP_VERSION__', 'test');
  });

  it('「回転の記録 (診断)」の節があり、説明の文と記録を出す欄がある', () => {
    const ctx = {
      repo: { exportAll: vi.fn(async () => ({})), getMeta: vi.fn(async () => undefined) },
      logger: { entries: vi.fn(() => []), log: vi.fn() },
      navigate: () => undefined,
    } as unknown as AppContext;
    const screen = createAdminScreen(ctx);
    const container = document.createElement('div');
    document.body.appendChild(container);
    screen.mount(container, {});
    const heading = Array.from(container.querySelectorAll('h2, h3, [class]')).find(
      (e) => e.textContent === '回転の記録 (診断)',
    );
    expect(heading).toBeDefined();
    const note = container.querySelector('.admin__rot-note');
    expect(note?.textContent).toContain('画面を回すと記録します');
    const list = container.querySelector('.admin__rot-list');
    expect(list).not.toBeNull();
    expect(list!.textContent).toContain('まだ記録がありません');
    screen.unmount();
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
    expect(heads).toEqual(['診断', 'バックアップ', 'インストール', 'ログ', '回転の記録 (診断)']); // 「版の切り替え」は設定の画面に移した (PU-10a)。回転の記録は T1-21a-2 の診断
    expect(container.querySelector('.screen-header__title')!.textContent).toBe('管理者');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === '今すぐ新しい版に切り替える')).toBe(false);
    const install = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'アプリとしてインストール')!;
    expect(install.classList.contains('btn--locked')).toBe(true);
    expect(install.hasAttribute('disabled')).toBe(false);
    install.click();
    expect(container.textContent).toContain('この端末では、いまはインストールできません');
  });
});
