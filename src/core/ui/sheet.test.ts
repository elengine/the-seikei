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
