import { describe, it, expect, vi } from 'vitest';
import { createButton, confirmDialog, textInputDialog } from './widgets';
import { applyFontScale } from './tokens';

// .btn:disabled の確認は CSS のため jsdom では判定できない (getComputedStyle 非対応)。
// スタイルの存在は tokens.test.ts と同様に base.css を読んで確認する。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function baseCss(): string {
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
}

function clickButton(root: ParentNode, testId: string): HTMLButtonElement {
  const btn = root.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (btn === null) {
    throw new Error(`button not found: ${testId}`);
  }
  btn.click();
  return btn;
}

describe('createButton', () => {
  it('1. クリックすると onClick が1回呼ばれる。variant ごとにクラスが付く', () => {
    const onClick = vi.fn();
    const primary = createButton({ label: 'はじめる', onClick, testId: 'b1' });
    expect(primary.tagName).toBe('BUTTON');
    expect(primary.textContent).toBe('はじめる');
    expect(primary.dataset.testid).toBe('b1');
    expect(primary.classList.contains('btn')).toBe(true);
    expect(primary.classList.contains('btn--primary')).toBe(true);
    primary.click();
    expect(onClick).toHaveBeenCalledTimes(1);

    const onClick2 = vi.fn();
    const secondary = createButton({ label: 'やめる', onClick: onClick2, variant: 'secondary' });
    expect(secondary.classList.contains('btn')).toBe(true);
    expect(secondary.classList.contains('btn--secondary')).toBe(true);
    expect(secondary.dataset.testid).toBeUndefined();
    secondary.click();
    expect(onClick2).toHaveBeenCalledTimes(1);
  });
});

describe('confirmDialog', () => {
  it('2. ok を押すと true、cancel で false。閉じた後に DOM に残らない。背景押下では閉じない', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const p1 = confirmDialog(parent, { message: 'もどる？', okLabel: 'もどる', cancelLabel: 'つづける' });
    const backdrop1 = parent.querySelector('.dialog-backdrop');
    expect(backdrop1).not.toBeNull();
    // 背景を押しても閉じない
    backdrop1?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(parent.querySelector('.dialog-backdrop')).not.toBeNull();
    clickButton(parent, 'dialog-ok');
    await expect(p1).resolves.toBe(true);
    expect(parent.querySelector('.dialog-backdrop')).toBeNull(); // DOM から取り除かれた

    const p2 = confirmDialog(parent, { message: 'もどる？', okLabel: 'もどる', cancelLabel: 'つづける' });
    clickButton(parent, 'dialog-cancel');
    await expect(p2).resolves.toBe(false);
    expect(parent.querySelector('.dialog-backdrop')).toBeNull();
  });
});

describe('textInputDialog', () => {
  it('3. 入力して決定すると値、やめると null。空のときは決定が disabled', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const p1 = textInputDialog(parent, { title: '名前', initial: '', maxLength: 20 });
    const input = parent.querySelector<HTMLInputElement>('.text-input');
    expect(input).not.toBeNull();
    const okBtn1 = parent.querySelector<HTMLButtonElement>('[data-testid="dialog-ok"]');
    expect(okBtn1?.disabled).toBe(true); // 空文字の決定は不可
    input!.value = 'まさお';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(okBtn1?.disabled).toBe(false);
    clickButton(parent, 'dialog-ok');
    await expect(p1).resolves.toBe('まさお');
    expect(parent.querySelector('.dialog-backdrop')).toBeNull();

    const p2 = textInputDialog(parent, { title: '屋号', initial: 'すずき', maxLength: 20 });
    clickButton(parent, 'dialog-cancel');
    await expect(p2).resolves.toBeNull();
    expect(parent.querySelector('.dialog-backdrop')).toBeNull();
  });

  it('maxLength を超える入力はできない', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    textInputDialog(parent, { title: '名前', initial: '', maxLength: 3 });
    const input = parent.querySelector<HTMLInputElement>('.text-input');
    expect(input?.maxLength).toBe(3);
  });

  it('initial が入った状態で決定ボタンは押せる', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const p = textInputDialog(parent, { title: '名前', initial: '初期値', maxLength: 20 });
    const okBtn = parent.querySelector<HTMLButtonElement>('[data-testid="dialog-ok"]');
    expect(okBtn?.disabled).toBe(false);
    clickButton(parent, 'dialog-ok');
    await expect(p).resolves.toBe('初期値');
  });

  it('追加修正1: .btn:disabled のスタイルが base.css にある (machine-light 地・sumi-sub 文字・沈まない)', () => {
    const css = baseCss();
    const m = css.match(/\.btn:disabled\s*\{([^}]*)\}/);
    expect(m, '.btn:disabled rule is missing').not.toBeNull();
    const block = m![1]!;
    expect(block).toContain('var(--c-machine-light)');
    expect(block).toContain('var(--c-sumi-sub)');
    expect(block).toContain('not-allowed');
    expect(block).toContain('transform: none');
  });

  it('追加修正2: 空白だけの入力では決定できず、決定値は前後の空白を除いたもの', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    // 空白だけ → disabled
    const p1 = textInputDialog(parent, { title: '名前', initial: '   ', maxLength: 20 });
    const okBtn1 = parent.querySelector<HTMLButtonElement>('[data-testid="dialog-ok"]');
    expect(okBtn1?.disabled).toBe(true);
    const input = parent.querySelector<HTMLInputElement>('.text-input');
    input!.value = '  まさお  ';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(okBtn1?.disabled).toBe(false);
    clickButton(parent, 'dialog-ok');
    await expect(p1).resolves.toBe('まさお'); // 前後の空白を除いた値

    // 半角空白1文字だけでも disabled
    const p2 = textInputDialog(parent, { title: '屋号', initial: '', maxLength: 20 });
    const input2 = parent.querySelectorAll<HTMLInputElement>('.text-input')[0];
    const okBtn2 = parent.querySelectorAll<HTMLButtonElement>('[data-testid="dialog-ok"]')[0];
    input2!.value = ' ';
    input2!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(okBtn2?.disabled).toBe(true);
    input2!.value = '　';
    input2!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(okBtn2?.disabled).toBe(true); // 全角空白も不可
    input2!.value = 'おけい';
    input2!.dispatchEvent(new Event('input', { bubbles: true }));
    clickButton(parent, 'dialog-ok');
    await expect(p2).resolves.toBe('おけい'); // 閉じて解消
  });

  it('追加修正4: 開いたら入力欄にフォーカスする', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const p = textInputDialog(parent, { title: '名前', initial: '', maxLength: 20 });
    await Promise.resolve(); // queueMicrotask のフォーカスを待つ
    const input = parent.querySelector<HTMLInputElement>('.text-input');
    expect(document.activeElement).toBe(input);
    // 後片付け (解決させないと後続に影響しないが明示的に閉じる)
    input!.value = 'x';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    parent.querySelector<HTMLButtonElement>('[data-testid="dialog-cancel"]')!.click();
    await expect(p).resolves.toBeNull();
  });
});

describe('applyFontScale', () => {
  it('4. data-font 属性が変わる', () => {
    const root = document.createElement('div');
    applyFontScale(root, 'large');
    expect(root.dataset.font).toBe('large');
    applyFontScale(root, 'xlarge');
    expect(root.dataset.font).toBe('xlarge');
  });
});
