import { describe, it, expect, vi } from 'vitest';
import { createButton, confirmDialog, textInputDialog } from './widgets';
import { applyFontScale } from './tokens';

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
