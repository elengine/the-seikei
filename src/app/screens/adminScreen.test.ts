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
      settings: { get: () => ({ unlockAll: false }), update: vi.fn(async () => undefined) },
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
      settings: { get: () => ({ unlockAll: false }), update: vi.fn(async () => undefined) },
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
      settings: { get: () => ({ unlockAll: false }), update: vi.fn(async () => undefined) },
      navigate: () => undefined,
    } as unknown as AppContext;
    const container = document.createElement('div');
    document.body.appendChild(container);
    createAdminScreen(ctx).mount(container, {});
    const heads = Array.from(container.querySelectorAll('.section-heading')).map((h) => h.textContent);
    expect(heads).toEqual(['確認用', '診断', 'アップデートの記録', 'バックアップ', 'インストール', 'ログ', '回転の記録 (診断)']); // 「版の切り替え」は設定の画面に移した (PU-10a)。回転の記録は T1-21a-2 の診断
    expect(container.querySelector('.screen-header__title')!.textContent).toBe('管理者');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === '今すぐ新しい版に切り替える')).toBe(false);
    const install = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'アプリとしてインストール')!;
    expect(install.classList.contains('btn--locked')).toBe(true);
    expect(install.hasAttribute('disabled')).toBe(false);
    install.click();
    expect(container.textContent).toContain('この端末では、いまはインストールできません');
  });
});

describe('PU-18 管理者メニュー: すべてのお題を開ける(確認用)', () => {
  beforeAll(() => {
    vi.stubGlobal('__BUILD_ID__', 'test-build');
    vi.stubGlobal('__APP_VERSION__', 'test');
  });

  function mountAdmin(initial: boolean): { container: HTMLElement; update: ReturnType<typeof vi.fn> } {
    let unlockAll = initial;
    const update = vi.fn(async (patch: { unlockAll?: boolean }) => {
      if (patch.unlockAll !== undefined) unlockAll = patch.unlockAll;
    });
    const ctx = {
      repo: { exportAll: vi.fn(async () => ({})), getMeta: vi.fn(async () => undefined) },
      logger: { entries: vi.fn(() => []), log: vi.fn() },
      settings: { get: () => ({ unlockAll }), update },
      navigate: () => undefined,
    } as unknown as AppContext;
    const screen = createAdminScreen(ctx);
    const container = document.createElement('div');
    document.body.appendChild(container);
    screen.mount(container, {});
    return { container, update };
  }

  it('切り替え「すべてのお題を開ける(確認用)」と説明の 1 行がある。押すと設定が true になり、もう一度押すと false に戻る', async () => {
    const { container, update } = mountAdmin(false);
    const group = container.querySelector('[aria-label="すべてのお題を開ける(確認用)"]')!;
    expect(group).not.toBeNull();
    expect(container.textContent).toContain('クリアしていないお題も遊べます。記録(星)は変わりません');
    const buttons = Array.from(group.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual(['✓開けない', '開ける']); // 選んだものに ✓
    buttons.find((b) => b.textContent === '開ける')!.click();
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith({ unlockAll: true }));
    await vi.waitFor(() => expect(group.querySelector('[aria-pressed="true"]')!.textContent).toContain('開ける'));
    Array.from(group.querySelectorAll('button')).find((b) => b.textContent!.includes('開けない'))!.click();
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith({ unlockAll: false }));
  });

  it('設定が true のとき、最初から「開ける」が選ばれている', () => {
    const { container } = mountAdmin(true);
    const group = container.querySelector('[aria-label="すべてのお題を開ける(確認用)"]')!;
    expect(group.querySelector('[aria-pressed="true"]')!.textContent).toContain('開ける');
  });
});

describe('PU-23a 管理者メニュー: アップデートの記録', () => {
  beforeAll(() => {
    vi.stubGlobal('__BUILD_ID__', 'test-build');
    vi.stubGlobal('__APP_VERSION__', 'test');
  });

  function mountAdmin(): HTMLElement {
    const ctx = {
      repo: { exportAll: vi.fn(async () => ({})), getMeta: vi.fn(async () => undefined) },
      logger: { entries: vi.fn(() => []), log: vi.fn() },
      settings: { get: () => ({ unlockAll: false }), update: vi.fn(async () => undefined) },
      navigate: () => undefined,
    } as unknown as AppContext;
    const container = document.createElement('div');
    document.body.appendChild(container);
    createAdminScreen(ctx).mount(container, {});
    return container;
  }

  it('1. 節「アップデートの記録」がある。記録が無いときは「記録はまだありません」', () => {
    window.localStorage.removeItem('seikei-update-log');
    const c = mountAdmin();
    const heading = Array.from(c.querySelectorAll('.section-heading')).find((h) => h.textContent === 'アップデートの記録');
    expect(heading).toBeDefined();
    expect(c.querySelector('.admin__update-log')!.textContent).toContain('記録はまだありません');
  });

  it('2. 直近 3 回の記録が表で出る: 押した日時・結果 (読み込み直した/案内を出した)・各行は「経過ミリ秒」と内容。新しい順', () => {
    const entries = [
      { at: '2026-10-08T05:00:00.000Z', result: 'failed', events: [{ ms: 0, label: '押した: 待っている版=installed / active=activated' }, { ms: 5001, label: '5 秒の時点: 待っている版=activating' }, { ms: 5002, label: '案内を出した' }] },
      { at: '2026-10-08T04:00:00.000Z', result: 'reloaded', events: [{ ms: 0, label: '押した: 待っている版=installed' }, { ms: 2500, label: 'activating → activated' }, { ms: 2501, label: '読み込み直した' }] },
    ];
    window.localStorage.setItem('seikei-update-log', JSON.stringify(entries));
    const c = mountAdmin();
    const tables = c.querySelectorAll('.admin__update-log table');
    expect(tables).toHaveLength(2);
    const first = tables[0]!;
    expect(first.querySelector('caption')!.textContent).toContain('案内を出した');
    const rows = Array.from(first.querySelectorAll('tbody tr')).map((r) => Array.from(r.children).map((td) => td.textContent));
    expect(rows[0]).toEqual(['0 ms', '押した: 待っている版=installed / active=activated']);
    expect(rows[1]).toEqual(['5,001 ms', '5 秒の時点: 待っている版=activating']);
    expect(tables[1]!.querySelector('caption')!.textContent).toContain('読み込み直した');
    window.localStorage.removeItem('seikei-update-log');
  });

  it('PU-25: 結果が retry-reload の回の見出しは「(読み込み直した・やり直し)」', () => {
    window.localStorage.setItem(
      'seikei-update-log',
      JSON.stringify([{ at: '2026-10-09T05:00:00.000Z', result: 'retry-reload', events: [{ ms: 0, label: '押した' }, { ms: 15000, label: '読み込み直した(切り替えのやり直し)' }] }]),
    );
    const c = mountAdmin();
    expect(c.querySelector('.admin__update-log caption')!.textContent).toContain('(読み込み直した・やり直し)');
    window.localStorage.removeItem('seikei-update-log');
  });

  it('3. 壊れた記録・読めない localStorage でも、画面は崩れない (「記録はまだありません」)', () => {
    window.localStorage.setItem('seikei-update-log', '{ここは壊れている');
    expect(mountAdmin().querySelector('.admin__update-log')!.textContent).toContain('記録はまだありません');
    window.localStorage.removeItem('seikei-update-log');
  });

  it('4. base.css: 記録の表の文字は 20px 以上', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/styles/base.css', 'utf8');
    const t = css.match(/\.admin__update-log table\s*\{([^}]*)\}/)![1]!;
    expect(t).toMatch(/font-size:\s*(var\(--fs-body\)|(2\d|3\d)px)/);
  });
});
