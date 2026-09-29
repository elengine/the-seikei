import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createAdminScreen } from './adminScreen';
import type { AppContext } from '../context';

describe('T1-14 C: バックアップの書き出しで、データの読み出しに失敗したときの記録', () => {
  beforeAll(() => {
    // vite の define で置き換えられるビルドの識別 (テスト環境では未定義)
    vi.stubGlobal('__BUILD_ID__', 'test-build');
  });

  it('exportAll が失敗しても例外が外に出ず、ログに error が1件残る', async () => {
    const errors: string[] = [];
    const ctx = {
      repo: {
        exportAll: vi.fn(async () => {
          throw new Error('読み出しに失敗');
        }),
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
      await new Promise((r) => setTimeout(r, 20));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('バックアップの書き出しに失敗');
  });
});
