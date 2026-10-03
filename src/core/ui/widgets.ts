type ButtonIcon = 'back' | 'next' | 'check' | 'settings' | 'help' | 'refresh';

interface ButtonOpts {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger'; // 既定は 'secondary'
  size?: 'normal' | 'large'; // 既定: primary は 'large' (72px)、ほかは 'normal' (64px)
  shape?: 'circle'; // 丸いボタン (直径 64px の正円)。文字は出さず、アイコンだけを置く。label は aria-label と title に入る
  icon?: ButtonIcon; // 線の SVG。文字の前 (back・check・settings・help) か後ろ (next)
  lockedReason?: string; // 指定すると「押せない」形。押すと onLocked(lockedReason) を呼ぶ
  onLocked?: (reason: string) => void;
  sound?: boolean; // 既定 true
  onClick: () => void;
  testId?: string;
}

/** 線の SVG (currentColor)。24x24 の枠 */
const ICON_SHAPES: Record<ButtonIcon, string[]> = {
  back: ['M15 5 L8 12 L15 19'],
  next: ['M9 5 L16 12 L9 19'],
  check: ['M5 12.5 L10 17.5 L19 7'],
  // 歯車: 外側の輪・中央の丸・歯 8 本
  settings: [
    'M19 12 A7 7 0 1 1 5 12 A7 7 0 1 1 19 12',
    'M15 12 A3 3 0 1 1 9 12 A3 3 0 1 1 15 12',
    'M19.0 12.0 L22.0 12.0',
    'M16.9 16.9 L19.1 19.1',
    'M12.0 19.0 L12.0 22.0',
    'M7.1 16.9 L4.9 19.1',
    'M5.0 12.0 L2.0 12.0',
    'M7.1 7.1 L4.9 4.9',
    'M12.0 5.0 L12.0 2.0',
    'M16.9 7.1 L19.1 4.9',
  ],
  help: ['M9 9.5 A3 3 0 1 1 12.8 12.3 C12.2 12.7 12 13.2 12 14.2', 'M12 18 L12.01 18'], // ? の線
  refresh: ['M20 12 A8 8 0 1 1 17.6 6.3', 'M18 2.5 L18 7 L13.5 7'], // 回る矢印 (円弧と矢じり)
};

function createIcon(icon: ButtonIcon, size = 24): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('btn__icon');
  for (const d of ICON_SHAPES[icon]) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

/** 押せない形のボタンの状態 (理由と、押したときの呼び出し先) */
const lockState = new WeakMap<HTMLButtonElement, { reason: string | null; onLocked?: (reason: string) => void }>();

let buttonSound: () => void = () => {};

/** boot で1回だけ呼ぶ。ボタンを押したときの音 */
export function setButtonSound(play: () => void): void {
  buttonSound = play;
}

/** 押せない形にする (理由を渡す) / 元に戻す (null) */
export function setLockedReason(btn: HTMLButtonElement, reason: string | null): void {
  const st = lockState.get(btn);
  if (st === undefined) {
    return;
  }
  st.reason = reason;
  btn.classList.toggle('btn--locked', reason !== null);
  if (reason === null) {
    btn.removeAttribute('aria-disabled');
  } else {
    btn.setAttribute('aria-disabled', 'true');
  }
}

/** ボタン (主: 藍の塗り / 副: 白地・藍の枠 / 危険: 白地・朱の枠)。押せない形は lockedReason で作る */
export function createButton(opts: ButtonOpts): HTMLButtonElement {
  const variant = opts.variant ?? 'secondary';
  const size = opts.size ?? (variant === 'primary' ? 'large' : 'normal');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.classList.add('btn', `btn--${variant}`);
  if (size === 'large') {
    btn.classList.add('btn--large');
  }
  const circle = opts.shape === 'circle';
  const icon = opts.icon !== undefined ? createIcon(opts.icon, circle ? 28 : 24) : null;
  if (circle) {
    // 丸いボタン: 文字は出さず (文字の大きさの段階で形が崩れない)、読み上げと長押しのために label を入れる
    btn.classList.add('btn--circle');
    btn.setAttribute('aria-label', opts.label);
    btn.title = opts.label;
    if (icon !== null) {
      btn.appendChild(icon);
    }
  } else {
    if (icon !== null && opts.icon !== 'next') {
      btn.appendChild(icon);
    }
    btn.appendChild(document.createTextNode(opts.label));
  }
  if (!circle && icon !== null && opts.icon === 'next') {
    btn.appendChild(icon);
  }
  if (opts.testId !== undefined) {
    btn.dataset.testid = opts.testId;
  }
  lockState.set(btn, { reason: null, onLocked: opts.onLocked });
  setLockedReason(btn, opts.lockedReason ?? null);
  btn.addEventListener('click', () => {
    const st = lockState.get(btn);
    if (st?.reason != null) {
      st.onLocked?.(st.reason);
      return;
    }
    if (opts.sound !== false) {
      buttonSound();
    }
    opts.onClick();
  });
  return btn;
}

interface ChoiceOpts<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}

/** 選ぶもの (横につながった枠。選んだものは藍の塗り・白文字・先頭に ✓) */
export function createChoice<T extends string>(opts: ChoiceOpts<T>): { root: HTMLElement; setValue(v: T): void } {
  const root = document.createElement('div');
  root.classList.add('choice');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', opts.ariaLabel);
  const items = opts.options.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.classList.add('choice__item');
    const check = document.createElement('span');
    check.classList.add('choice__check');
    b.appendChild(check);
    b.appendChild(document.createTextNode(o.label));
    b.addEventListener('click', () => {
      opts.onChange(o.value);
    });
    root.appendChild(b);
    return { value: o.value, b, check };
  });
  function setValue(v: T): void {
    for (const it of items) {
      const on = it.value === v;
      it.b.setAttribute('aria-pressed', on ? 'true' : 'false');
      it.check.textContent = on ? '✓' : '';
    }
  }
  setValue(opts.value);
  return { root, setValue };
}

/** ダイアログの外枠 (背景・白い箱・上端の縞・見出し)。確認・入力・結果・遊び方が共通で使う */
export function createDialogShell(
  title?: string,
  extraClass?: string,
): { backdrop: HTMLElement; dialog: HTMLElement } {
  const backdrop = document.createElement('div');
  backdrop.classList.add('dialog-backdrop');
  const dialog = document.createElement('div');
  dialog.classList.add('dialog');
  if (extraClass !== undefined) {
    dialog.classList.add(extraClass);
  }
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const stripe = document.createElement('div');
  stripe.classList.add('stripe-top');
  dialog.appendChild(stripe);
  if (title !== undefined) {
    const h = document.createElement('h2');
    h.classList.add('dialog__title', 'font-heading');
    h.textContent = title;
    dialog.appendChild(h);
    dialog.setAttribute('aria-label', title);
  }
  backdrop.appendChild(dialog);
  return { backdrop, dialog };
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
  const { backdrop, dialog } = createDialogShell(opts.title);
  if (opts.message !== undefined) {
    const msg = document.createElement('p');
    msg.classList.add('dialog__message');
    msg.textContent = opts.message;
    dialog.appendChild(msg);
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
  opts: { title: string; message: string; okLabel: string; cancelLabel: string },
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
    // 開いたら入力欄にフォーカス
    queueMicrotask(() => {
      input.focus();
    });

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
      // 前後の空白を除いて空なら決定不可 (空白だけの入力を通さない)
      ok.disabled = input.value.trim().length === 0;
    }
    syncOk();
    input.addEventListener('input', syncOk);

    ok.addEventListener('click', () => {
      const value = input.value.trim(); // 決定値も前後の空白を除く
      close();
      resolve(value);
    });
    cancel.addEventListener('click', () => {
      close();
      resolve(null);
    });
  });
}
