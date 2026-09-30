import { describe, it, expect, afterEach } from 'vitest';
import { showTutorial } from './tutorialOverlay';
import type { TutorialSpec } from '../game/types';

const spec: TutorialSpec = {
  pages: [
    { draw: () => undefined, text: '1ページ目' },
    { draw: () => undefined, text: '2ページ目' },
    { draw: () => undefined, text: '3ページ目' },
  ],
};

function button(host: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find((x) => x.textContent === label);
}

afterEach(() => {
  document.body.textContent = '';
});

describe('showTutorial (PU-02b)', () => {
  it('見出し (明朝)・ページ番号・上端の縞が出る。1ページ目に「前へ」は無い', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    void showTutorial(host, spec);
    expect(host.querySelector('.dialog__title')!.textContent).toBe('遊び方');
    expect(host.querySelector('.dialog__title')!.classList.contains('font-heading')).toBe(true);
    expect(host.querySelector('.tutorial__counter')!.textContent).toBe('1 / 3');
    expect(host.querySelector('.dialog .stripe-top')).not.toBeNull();
    expect(button(host, '前へ')).toBeUndefined();
  });

  it('「前へ」で前のページに戻る。最後のページは「始める」(primary) で、押すと閉じる', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const done = showTutorial(host, spec);
    button(host, '次へ')!.click();
    expect(host.querySelector('.tutorial__text')!.textContent).toBe('2ページ目');
    const prev = button(host, '前へ')!;
    expect(prev.classList.contains('btn--secondary')).toBe(true);
    prev.click();
    expect(host.querySelector('.tutorial__text')!.textContent).toBe('1ページ目');
    button(host, '次へ')!.click();
    button(host, '次へ')!.click();
    expect(host.querySelector('.tutorial__counter')!.textContent).toBe('3 / 3');
    expect(button(host, '次へ')).toBeUndefined();
    const start = button(host, '始める')!;
    expect(start.classList.contains('btn--primary')).toBe(true);
    start.click();
    await done;
    expect(host.querySelector('.tutorial')).toBeNull();
  });

  it('title を渡すとその見出しになる', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    void showTutorial(host, spec, { title: 'ドラム巻きの遊び方' });
    expect(host.querySelector('.dialog__title')!.textContent).toBe('ドラム巻きの遊び方');
  });
});
