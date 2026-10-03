import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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

describe('PU-10d: 遊び方の閉じるボタンと、画面の大きさへの合わせ方', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('右上に丸い「閉じる」(aria-label)。途中のページでも押すと閉じ、Promise が解決する (「始める」と同じ結果)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const done = showTutorial(host, spec);
    const close = host.querySelector<HTMLButtonElement>('.tutorial__close')!;
    expect(close.getAttribute('aria-label')).toBe('閉じる');
    expect(close.classList.contains('btn--circle')).toBe(true);
    expect(close.textContent).toBe('');
    expect(close.querySelector('svg')).not.toBeNull();
    button(host, '次へ')!.click(); // 2 ページ目 (最後まで読んでいない)
    close.click();
    await done;
    expect(host.querySelector('.tutorial')).toBeNull();
    // 二重に押しても何も起きない
    expect(() => close.click()).not.toThrow();
  });

  it('横長の低い画面 (915×412) では、絵を左・文を右に並べるクラス (tutorial--side) が付く。縦長 (412×915) や広い画面では付かない', () => {
    vi.stubGlobal('innerWidth', 915);
    vi.stubGlobal('innerHeight', 412);
    const a = document.createElement('div');
    document.body.appendChild(a);
    void showTutorial(a, spec);
    expect(a.querySelector('.tutorial')!.classList.contains('tutorial--side')).toBe(true);
    vi.stubGlobal('innerWidth', 412);
    vi.stubGlobal('innerHeight', 915);
    const b = document.createElement('div');
    document.body.appendChild(b);
    void showTutorial(b, spec);
    expect(b.querySelector('.tutorial')!.classList.contains('tutorial--side')).toBe(false);
    vi.stubGlobal('innerWidth', 1180);
    vi.stubGlobal('innerHeight', 820);
    const c = document.createElement('div');
    document.body.appendChild(c);
    void showTutorial(c, spec);
    expect(c.querySelector('.tutorial')!.classList.contains('tutorial--side')).toBe(false);
  });

  it('横長の低い画面では、絵は使える高さに収まる大きさ (幅 × 2/3 が 画面の高さの 90% から見出しと下のボタンを引いた残り以下)', () => {
    vi.stubGlobal('innerWidth', 915);
    vi.stubGlobal('innerHeight', 412);
    const host = document.createElement('div');
    document.body.appendChild(host);
    void showTutorial(host, spec);
    const canvas = host.querySelector<HTMLCanvasElement>('.tutorial__canvas')!;
    const h = parseFloat(canvas.style.height);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThanOrEqual(412 * 0.9 - 170);
    expect(parseFloat(canvas.style.width) / h).toBeCloseTo(1.5, 1); // 縦横の比を保つ
  });

  it('base.css: 小さい画面で幅いっぱい・高さ 90%、「前へ」「次へ」は下に固定 (sticky)。横並びは grid', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    expect(css.match(/\.tutorial \.dialog__actions\s*\{([^}]*)\}/)![1]).toContain('position: sticky');
    const side = css.match(/\.tutorial--side\s*\{([^}]*)\}/)![1]!;
    expect(side).toContain('display: grid');
    expect(side).toContain('grid-template-areas');
    expect(css).toMatch(/@media \(max-width: 599px\)\s*\{[^@]*\.dialog\.tutorial\s*\{[^}]*max-height: 90%/);
  });
});
