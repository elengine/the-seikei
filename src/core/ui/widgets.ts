import { COLORS } from './tokens';

interface ButtonOpts {
  label: string;
  variant?: 'primary' | 'secondary';
  onClick: () => void;
  testId?: string;
}

/** 大きいボタン (主: machineDark 地・白文字 / 副: 白地・藍の枠と文字) */
export function createButton(opts: ButtonOpts): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = opts.label;
  btn.classList.add('btn');
  btn.classList.add(opts.variant === 'secondary' ? 'btn--secondary' : 'btn--primary');
  if (opts.testId !== undefined) {
    btn.dataset.testid = opts.testId;
  }
  btn.addEventListener('click', () => {
    opts.onClick();
  });
  return btn;
}

interface DialogBase {
  message?: string;
  title?: string;
  okLabel: string;
  cancelLabel: string;
}

/** ダイアログの共通組み立て。ok/cancel ボタンと閉じ関数を返す。 */
function buildDialog(
  parent: HTMLElement,
  opts: DialogBase,
  body: HTMLElement,
): { ok: HTMLButtonElement; cancel: HTMLButtonElement; close: () => void } {
  const backdrop = document.createElement('div');
  backdrop.classList.add('dialog-backdrop');
  const dialog = document.createElement('div');
  dialog.classList.add('dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  if (opts.message !== undefined) {
    const msg = document.createElement('p');
    msg.classList.add('dialog__message');
    msg.textContent = opts.message;
    dialog.appendChild(msg);
  }
  if (opts.title !== undefined) {
    const title = document.createElement('p');
    title.classList.add('dialog__message');
    title.textContent = opts.title;
    dialog.appendChild(title);
  }
  dialog.appendChild(body);

  const actions = document.createElement('div');
  actions.classList.add('dialog__actions');
  const cancel = createButton({
    label: opts.cancelLabel,
    variant: 'secondary',
    testId: 'dialog-cancel',
    onClick: () => closeWith(),
  });
  const ok = createButton({
    label: opts.okLabel,
    variant: 'primary',
    testId: 'dialog-ok',
    onClick: () => closeWith(),
  });
  actions.appendChild(cancel);
  actions.appendChild(ok);
  dialog.appendChild(actions);
  backdrop.appendChild(dialog);

  let closed = false;
  function closeWith(): void {
    if (closed) {
      return;
    }
    closed = true;
    backdrop.remove(); // 閉じたら DOM から取り除く
  }

  // 背景を押しても閉じない (backdrop には何もリスナーを付けない)
  parent.appendChild(backdrop);
  return { ok, cancel, close: closeWith };
}

/** 2択の確認。押したボタンの値で解決する。背景を押しても閉じない。 */
export function confirmDialog(
  parent: HTMLElement,
  opts: { message: string; okLabel: string; cancelLabel: string },
): Promise<boolean> {
  return new Promise((resolve) => {
    const empty = document.createElement('div');
    const { ok, cancel, close } = buildDialog(parent, opts, empty);
    ok.addEventListener('click', () => {
      close();
      resolve(true);
    });
    cancel.addEventListener('click', () => {
      close();
      resolve(false);
    });
  });
}

/** 文字入力。「決定」で入力値、「やめる」で null。空文字の決定は不可。 */
export function textInputDialog(
  parent: HTMLElement,
  opts: {
    title: string;
    initial: string;
    maxLength: number;
    okLabel?: string;
    cancelLabel?: string;
  },
): Promise<string | null> {
  return new Promise((resolve) => {
    const body = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'text';
    input.classList.add('text-input');
    input.value = opts.initial;
    input.maxLength = opts.maxLength;
    input.setAttribute('aria-label', opts.title);
    body.appendChild(input);

    const { ok, cancel, close } = buildDialog(
      parent,
      {
        title: opts.title,
        okLabel: opts.okLabel ?? '決定',
        cancelLabel: opts.cancelLabel ?? 'やめる',
      },
      body,
    );

    function syncOk(): void {
      ok.disabled = input.value.length === 0; // 空文字の決定は不可
    }
    syncOk();
    input.addEventListener('input', syncOk);

    ok.addEventListener('click', () => {
      const value = input.value;
      close();
      resolve(value);
    });
    cancel.addEventListener('click', () => {
      close();
      resolve(null);
    });
  });
}

// COLORS は CSS 変数と対応づけのため参照 (未使用変数の警告を避けるため明示)
void COLORS;
