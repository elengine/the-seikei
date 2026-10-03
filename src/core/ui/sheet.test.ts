import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSheet } from './sheet';

afterEach(() => {
  document.body.textContent = '';
});

describe('下から出る重ね表示 (sheet。PU-09b)', () => {
  it('見出し (明朝)・上端の縞・右上の丸い「閉じる」があり、中身を入れる body がある。背景の覆いは作らない', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const sheet = openSheet({ parent, title: '依頼書' });
    expect(parent.querySelector('.sheet')).toBe(sheet.root);
    expect(sheet.root.getAttribute('role')).toBe('dialog');
    expect(sheet.root.querySelector('.sheet__title')!.textContent).toBe('依頼書');
    expect(sheet.root.querySelector('.sheet__title')!.classList.contains('font-heading')).toBe(true);
    expect(sheet.root.querySelector('.stripe-top')).not.toBeNull();
    const close = sheet.root.querySelector<HTMLButtonElement>('.sheet__close')!;
    expect(close.getAttribute('aria-label')).toBe('閉じる');
    expect(close.classList.contains('btn--circle')).toBe(true);
    expect(sheet.root.contains(sheet.body)).toBe(true);
    expect(parent.querySelector('.dialog-backdrop')).toBeNull(); // 盤面を押せる (閉じない)
    expect(sheet.isOpen()).toBe(true);
  });

  it('閉じるボタンか close() で閉じ、DOM から消え、onClose は 1 回だけ呼ばれる', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onClose = vi.fn();
    const sheet = openSheet({ parent, title: '依頼書', onClose });
    sheet.root.querySelector<HTMLButtonElement>('.sheet__close')!.click();
    expect(parent.querySelector('.sheet')).toBeNull();
    expect(sheet.isOpen()).toBe(false);
    sheet.close(); // 二重に閉じても何も起きない
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('重ね表示の外 (parent や盤面) を押しても閉じない', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const sheet = openSheet({ parent, title: '依頼書' });
    parent.click();
    document.body.click();
    expect(sheet.isOpen()).toBe(true);
  });

  it('base.css: 画面の下半分の高さ・白地・上の角 16 (var(--r-dialog))・position: fixed', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const m = css.match(/\.sheet\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('position: fixed');
    expect(m![1]).toContain('height: 50%');
    expect(m![1]).toContain('background: var(--c-white)');
    expect(m![1]).toContain('var(--r-dialog) var(--r-dialog) 0 0');
  });
});

describe('PU-11b: 縦に長い重ね表示 (size: tall)', () => {
  it('size を渡さないと今までどおり (sheet--tall は付かない)。tall を渡すと sheet--tall が付く', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const a = openSheet({ parent, title: 'a' });
    expect(a.root.classList.contains('sheet--tall')).toBe(false);
    a.close();
    const b = openSheet({ parent, title: 'b', size: 'tall' });
    expect(b.root.classList.contains('sheet--tall')).toBe(true);
    b.close();
  });

  it('tall は、親の中の見出しの行 (.screen-header) の下端から下を使う: --sheet-top にその下端を入れ、画面の大きさが変わると入れ直す。閉じたら監視をやめる', () => {
    const parent = document.createElement('div');
    const header = document.createElement('div');
    header.classList.add('screen-header');
    let bottom = 96;
    header.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom, width: 100, height: bottom, x: 0, y: 0, toJSON: () => undefined }) as DOMRect;
    parent.appendChild(header);
    document.body.appendChild(parent);
    const sheet = openSheet({ parent, title: '依頼書', size: 'tall' });
    expect(sheet.root.style.getPropertyValue('--sheet-top')).toBe('96px');
    bottom = 140;
    window.dispatchEvent(new Event('resize'));
    expect(sheet.root.style.getPropertyValue('--sheet-top')).toBe('140px');
    sheet.close();
    bottom = 200;
    window.dispatchEvent(new Event('resize'));
    expect(sheet.root.style.getPropertyValue('--sheet-top')).toBe('140px'); // 閉じたあとは触らない
  });

  it('見出しの行が測れないとき (高さ 0) は --sheet-top を入れず、CSS の既定 (画面の上から 25%) になる', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const sheet = openSheet({ parent, title: '依頼書', size: 'tall' });
    expect(sheet.root.style.getPropertyValue('--sheet-top')).toBe('');
    sheet.close();
  });

  it('base.css: sheet--tall は高さを自動 (top から bottom まで)・top は var(--sheet-top, 25%)', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const m = css.match(/\.sheet--tall\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('height: auto');
    expect(m![1]).toContain('top: var(--sheet-top, 25%)');
  });
});
