import { describe, it, expect, vi } from 'vitest';
import { createButton, createChoice, setButtonSound, setLockedReason, confirmDialog, textInputDialog } from './widgets';
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
    const primary = createButton({ label: 'はじめる', onClick, testId: 'b1', variant: 'primary' });
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

    const p1 = confirmDialog(parent, { title: '確認', message: 'もどる？', okLabel: 'もどる', cancelLabel: 'つづける' });
    const backdrop1 = parent.querySelector('.dialog-backdrop');
    expect(backdrop1).not.toBeNull();
    // 背景を押しても閉じない
    backdrop1?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(parent.querySelector('.dialog-backdrop')).not.toBeNull();
    clickButton(parent, 'dialog-ok');
    await expect(p1).resolves.toBe(true);
    expect(parent.querySelector('.dialog-backdrop')).toBeNull(); // DOM から取り除かれた

    const p2 = confirmDialog(parent, { title: '確認', message: 'もどる？', okLabel: 'もどる', cancelLabel: 'つづける' });
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

describe('T1-17: 確認の画面のボタンの並び', () => {
  it('confirmDialog の .dialog__actions の最初の子が取り消しのボタン、最後の子が決める側のボタン', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const p = confirmDialog(parent, { title: '確認', message: 'もどりますか?', okLabel: 'ホームに戻る', cancelLabel: 'やめる' });
    const actions = parent.querySelector('.dialog__actions')!;
    const children = Array.from(actions.children) as HTMLElement[];
    expect(children[0]!.textContent).toBe('やめる');
    expect(children[0]!.dataset.testid).toBe('dialog-cancel');
    expect(children[children.length - 1]!.textContent).toBe('ホームに戻る');
    expect(children[children.length - 1]!.dataset.testid).toBe('dialog-ok');
    // 片付ける
    (children[0] as HTMLButtonElement).click();
    await p;
  });

  it('textInputDialog の .dialog__actions も同じ並び (取り消しが左端・決定が右端)', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const p = textInputDialog(parent, { title: 'お名前', initial: '', maxLength: 10, okLabel: '決定', cancelLabel: 'やめる' });
    const actions = parent.querySelector('.dialog__actions')!;
    const children = Array.from(actions.children) as HTMLElement[];
    expect(children[0]!.textContent).toBe('やめる');
    expect(children[children.length - 1]!.textContent).toBe('決定');
    (children[0] as HTMLButtonElement).click();
    await p;
  });

  it('base.css: .dialog__actions に justify-content: space-between と 24px 以上の gap', () => {
    const css = baseCss();
    const i = css.indexOf('.dialog__actions {');
    const block = css.slice(i, css.indexOf('}', i));
    expect(block).toContain('justify-content: space-between');
    expect(block).toContain('gap: calc(var(--gap) * 2)');
  });
});

describe('PU-01c: createButton の種類・押せない形・音', () => {
  it('3つの種類で正しいクラスが付く。既定は secondary。primary の既定の大きさは large', () => {
    const p = createButton({ label: 'a', variant: 'primary', onClick: () => {} });
    const s = createButton({ label: 'b', variant: 'secondary', onClick: () => {} });
    const d = createButton({ label: 'c', variant: 'danger', onClick: () => {} });
    const def = createButton({ label: 'd', onClick: () => {} });
    expect(p.classList.contains('btn--primary')).toBe(true);
    expect(s.classList.contains('btn--secondary')).toBe(true);
    expect(d.classList.contains('btn--danger')).toBe(true);
    expect(def.classList.contains('btn--secondary')).toBe(true);
    expect(def.classList.contains('btn--primary')).toBe(false);
    expect(p.classList.contains('btn--large')).toBe(true);
    expect(s.classList.contains('btn--large')).toBe(false);
    const big = createButton({ label: 'e', variant: 'secondary', size: 'large', onClick: () => {} });
    expect(big.classList.contains('btn--large')).toBe(true);
    const small = createButton({ label: 'f', variant: 'primary', size: 'normal', onClick: () => {} });
    expect(small.classList.contains('btn--large')).toBe(false);
  });

  it('icon: 文字の前 (back) か後ろ (next) に線の SVG が付く。文字は残る', () => {
    const back = createButton({ label: '戻る', icon: 'back', onClick: () => {} });
    expect(back.querySelector('svg')).not.toBeNull();
    expect(back.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(back.textContent).toBe('戻る');
    const next = createButton({ label: '開く', icon: 'next', onClick: () => {} });
    expect(next.lastElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(next.textContent).toBe('開く');
  });

  it('lockedReason があると .btn--locked が付き、disabled は無く、押すと onLocked が理由付きで呼ばれ onClick は呼ばれない', () => {
    const onClick = vi.fn();
    const onLocked = vi.fn();
    const btn = createButton({ label: 'ヒント', lockedReason: '2回確認すると使えます', onLocked, onClick });
    expect(btn.classList.contains('btn--locked')).toBe(true);
    expect(btn.hasAttribute('disabled')).toBe(false);
    btn.click();
    expect(onLocked).toHaveBeenCalledTimes(1);
    expect(onLocked).toHaveBeenCalledWith('2回確認すると使えます');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('setLockedReason(btn, null) で元に戻り、onClick が呼ばれる。理由を後から付けることもできる', () => {
    const onClick = vi.fn();
    const onLocked = vi.fn();
    const btn = createButton({ label: 'ヒント', lockedReason: '理由', onLocked, onClick });
    setLockedReason(btn, null);
    expect(btn.classList.contains('btn--locked')).toBe(false);
    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onLocked).not.toHaveBeenCalled();
    setLockedReason(btn, '別の理由');
    expect(btn.classList.contains('btn--locked')).toBe(true);
    btn.click();
    expect(onLocked).toHaveBeenCalledWith('別の理由');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('setButtonSound を設定すると押すたびに1回呼ばれる。sound: false なら呼ばれない', () => {
    const play = vi.fn();
    setButtonSound(play);
    const btn = createButton({ label: 'a', onClick: () => {} });
    btn.click();
    expect(play).toHaveBeenCalledTimes(1);
    btn.click();
    expect(play).toHaveBeenCalledTimes(2);
    const quiet = createButton({ label: 'b', sound: false, onClick: () => {} });
    quiet.click();
    expect(play).toHaveBeenCalledTimes(2);
    // 押せない形のときは onLocked だけ (音は鳴らさない)
    const locked = createButton({ label: 'c', lockedReason: 'r', onClick: () => {} });
    locked.click();
    expect(play).toHaveBeenCalledTimes(2);
    setButtonSound(() => {});
  });
});

describe('PU-01c: createChoice', () => {
  it('選んだものに aria-pressed="true" と ✓。押すと onChange。setValue で表示が変わり onChange は呼ばれない', () => {
    const onChange = vi.fn();
    const c = createChoice<'a' | 'b'>({
      options: [
        { value: 'a', label: '大' },
        { value: 'b', label: '特大' },
      ],
      value: 'a',
      onChange,
      ariaLabel: '文字の大きさ',
    });
    expect(c.root.getAttribute('aria-label')).toBe('文字の大きさ');
    const btns = Array.from(c.root.querySelectorAll('button'));
    expect(btns).toHaveLength(2);
    expect(btns[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(btns[0]!.textContent).toContain('✓');
    expect(btns[1]!.getAttribute('aria-pressed')).toBe('false');
    expect(btns[1]!.textContent).not.toContain('✓');
    btns[1]!.click();
    expect(onChange).toHaveBeenCalledWith('b');
    c.setValue('b');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(btns[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(btns[1]!.textContent).toContain('✓');
    expect(btns[0]!.getAttribute('aria-pressed')).toBe('false');
    expect(btns[0]!.textContent).not.toContain('✓');
  });
});

describe('PU-01c: base.css のボタン', () => {
  function block(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`);
    return baseCss().match(re)?.[1] ?? '';
  }

  it('.btn:active に transform: translateY(4px)', () => {
    expect(block('.btn:active')).toContain('transform: translateY(4px)');
  });

  it('.btn に -webkit-appearance: none と touch-action: manipulation と -webkit-tap-highlight-color: transparent', () => {
    const b = block('.btn');
    expect(b).toContain('-webkit-appearance: none');
    expect(b).toContain('touch-action: manipulation');
    expect(b).toContain('-webkit-tap-highlight-color: transparent');
  });

  it('.btn--locked は点線の枠 (lock-border)、.choice の規則がある', () => {
    expect(block('.btn--locked')).toContain('dashed');
    expect(block('.btn--locked')).toContain('var(--c-lock-border)');
    expect(block('.choice')).not.toBe('');
  });
});

describe('PU-02b: ダイアログの見出しとボタン', () => {
  it('confirmDialog: 見出し (明朝) と本文が出る。上端に縞。取り消しが左 (secondary)、決定が右 (primary)', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const p = confirmDialog(parent, {
      title: '続きから',
      message: '前回の途中があります。',
      okLabel: '続ける',
      cancelLabel: 'やめる',
    });
    const title = parent.querySelector('.dialog__title')!;
    expect(title.textContent).toBe('続きから');
    expect(title.classList.contains('font-heading')).toBe(true);
    expect(parent.querySelector('.dialog__message')!.textContent).toBe('前回の途中があります。');
    expect(parent.querySelector('.dialog .stripe-top')).not.toBeNull();
    const children = Array.from(parent.querySelector('.dialog__actions')!.children) as HTMLElement[];
    expect(children[0]!.classList.contains('btn--secondary')).toBe(true);
    expect(children[children.length - 1]!.classList.contains('btn--primary')).toBe(true);
    children[0]!.click();
    await p;
  });

  it('textInputDialog: title が見出しとして出る', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const p = textInputDialog(parent, { title: 'お名前', initial: 'a', maxLength: 10 });
    expect(parent.querySelector('.dialog__title')!.textContent).toBe('お名前');
    (parent.querySelector('[data-testid="dialog-cancel"]') as HTMLButtonElement).click();
    await p;
  });
});

describe('PU-08a: 丸いボタン (shape: circle)', () => {
  it('文字は出さず、aria-label と title に label が入り、アイコン (28px) が中央にある。押すと onClick', () => {
    const onClick = vi.fn();
    const b = createButton({ label: '戻る', icon: 'back', shape: 'circle', onClick });
    expect(b.textContent).toBe('');
    expect(b.getAttribute('aria-label')).toBe('戻る');
    expect(b.title).toBe('戻る');
    expect(b.classList.contains('btn--circle')).toBe(true);
    expect(b.classList.contains('btn--secondary')).toBe(true);
    const svg = b.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('28');
    b.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('アイコン help (? の線) がある', () => {
    const b = createButton({ label: '遊び方', icon: 'help', shape: 'circle', onClick: () => {} });
    expect(b.querySelectorAll('svg path').length).toBeGreaterThan(0);
  });

  it('base.css: .btn--circle は 64px の正円', () => {
    const m = baseCss().match(/\.btn--circle\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('width: 64px');
    expect(m![1]).toContain('height: 64px');
    expect(m![1]).toContain('border-radius: 50%');
  });
});

describe('PU-08b: 歯車のアイコン (settings)', () => {
  it('外側の輪・中央の丸・歯 8 本の線 (計 10 本の線) で、今までの 3 本の横線の形ではない', () => {
    const b = createButton({ label: '設定', icon: 'settings', onClick: () => {} });
    const paths = Array.from(b.querySelectorAll('svg path')).map((p) => p.getAttribute('d') ?? '');
    expect(paths).toHaveLength(10);
    // 歯: 中心 (12, 12) から外へ向かう短い線が 8 本
    const teeth = paths.filter((d) => /^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/.test(d));
    expect(teeth).toHaveLength(8);
    // 輪と丸は円弧 (A) で描く
    expect(paths.filter((d) => d.includes('A'))).toHaveLength(2);
    // 今までの形 (横線 3 本のつまみ) が残っていない
    expect(paths.some((d) => d.startsWith('M4 7 H20'))).toBe(false);
    expect(b.textContent).toBe('設定'); // 文字も付いたまま
  });
});
