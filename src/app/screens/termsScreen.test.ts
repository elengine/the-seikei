import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createTermsScreen } from './termsScreen';
import { createAppContext } from '../context';
import type { AppContext } from '../context';
import { createFixedClock } from '../../core/clock/clock';

let dbSeq = 0;

async function makeCtx(): Promise<AppContext> {
  return createAppContext({
    dbName: `terms-screen-test-${Date.now().toString(36)}-${dbSeq++}`,
    clock: createFixedClock('2026-09-28T00:00:00Z'),
    navigate: () => undefined,
  });
}

describe('T1-19: 呼び名の変更画面の区分け', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('見出しが2つあり、1つ目の区画に game. で始まるキーの行が無く、2つ目には game. で始まる行だけがある', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const screen = createTermsScreen(ctx);
    screen.mount(container, {});
    // 見出しが2つ (h2)
    const heads = Array.from(document.querySelectorAll('h2'));
    expect(heads).toHaveLength(2);
    expect(heads[0]!.textContent).toBe('整経の用語');
    expect(heads[1]!.textContent).toBe('ゲームの名前');
    // 区画の行のキーは、行の「変更」ボタンの data-key で判別できるようにする
    const sections = Array.from(document.querySelectorAll('.terms__section'));
    expect(sections).toHaveLength(2);
    const keysOf = (sec: Element): string[] =>
      Array.from(sec.querySelectorAll('button[data-testid]')).map((b) => b.getAttribute('data-testid') ?? '');
    const first = keysOf(sections[0]!);
    const second = keysOf(sections[1]!);
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    // 1つ目に game. で始まるキーは無い
    for (const k of first) expect(k.startsWith('game.'), `first ${k}`).toBe(false);
    // 2つ目は game. で始まるキーだけ
    for (const k of second) expect(k.startsWith('game.'), `second ${k}`).toBe(true);
  });

  it('入力の画面の題名にキー (cone など) が含まれず、今の呼び名が含まれる', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const screen = createTermsScreen(ctx);
    screen.mount(container, {});
    // 最初の行の「変更」を押す → textInputDialog の題名を確認する
    // (textInputDialog は widgets の本物を使うので、DOM から題名を読む)
    const firstChange = Array.from(document.querySelectorAll('button[data-testid]'))[0] as HTMLButtonElement;
    const key = firstChange.getAttribute('data-testid')!;
    firstChange.click();
    // ダイアログが出るのを待つ
    await new Promise((r) => setTimeout(r, 30));
    const input = document.querySelector('.dialog input.text-input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    // 題名は input の aria-label に入る
    const titleText = input!.getAttribute('aria-label') ?? '';
    // キーがそのまま見えない
    expect(titleText).not.toContain(key);
    // 今の呼び名が含まれる (『○○』の呼び名)
    const currentValue = Array.from(document.querySelectorAll('.terms__value'))[0]!.textContent ?? '';
    expect(titleText).toContain(currentValue);
    expect(titleText).toContain('の呼び名');
  });

  it('「戻る」が題名と同じ見出しの要素の中にある', async () => {
    const ctx = await makeCtx();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const screen = createTermsScreen(ctx);
    screen.mount(container, {});
    const bar = document.querySelector('.screen-header');
    expect(bar).not.toBeNull();
    expect(bar!.querySelector('.screen-header__title')?.textContent).toBe('呼び名の変更');
    const backInBar = Array.from(bar!.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === '戻る');
    expect(backInBar).toBeDefined();
  });
});
