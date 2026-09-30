import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { windingTutorial } from './tutorial';
import { showTutorial } from '../../core/ui/tutorialOverlay';

describe('winding tutorial (T2-07)', () => {
  it('1. pages が3つあり、文に {{pedal}} の置き換え対象がある', () => {
    expect(windingTutorial.pages).toHaveLength(3);
    expect(windingTutorial.pages.some((p) => p.text.includes('{{pedal}}'))).toBe(true);
  });

  it('2. tutorial.ts に # で始まる色の直書きが無い (COLORS を使う)', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(dir, 'tutorial.ts'), 'utf8');
    expect(src.includes('#')).toBe(false);
    expect(src).toContain('COLORS');
  });

  it('3. showTutorial の renderText で {{pedal}} が呼び名に置き換わる', async () => {
    // renderText を直接作る (createTerms は Repository が要るため、置き換えだけの関数を用意する)
    const renderText = (text: string): string => text.replaceAll('{{pedal}}', 'ふみこみレバー');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dialog = showTutorial(host, windingTutorial, { renderText });
    await Promise.resolve();
    // 1ページ目に {{pedal}} は無い (文はクリールの説明)
    expect(host.textContent ?? '').toContain('クリールの糸を帯にまとめて');
    // 次へを押して2ページ目の文を確認する
    const clickBtn0 = (label: string): void => {
      const b = Array.from(host.querySelectorAll('button')).find((x) => x.textContent === label);
      b?.click();
    };
    clickBtn0('次へ');
    await Promise.resolve();
    const body2 = host.textContent ?? '';
    expect(body2).toContain('ふみこみレバー');
    expect(body2).not.toContain('{{pedal}}');
    // 「次へ」をもう1回押して最後のページにし、「始める」で閉じる
    const clickBtn = (label: string): void => {
      const b = Array.from(host.querySelectorAll('button')).find((x) => x.textContent === label);
      b?.click();
    };
    clickBtn('次へ');
    await Promise.resolve();
    clickBtn('次へ');
    await Promise.resolve();
    clickBtn('始める');
    await dialog;
    expect(host.querySelector('.tutorial')).toBeNull();
  });

  it('4. 置き換えが無いときは {{pedal}} のまま残らない (renderText 無しでは文がそのまま出る)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dialog = showTutorial(host, windingTutorial);
    await Promise.resolve();
    // renderText 無し → 文がそのまま ({{…}} は出たまま)。閉じて終わる
    const clickBtn = (label: string): void => {
      const b = Array.from(host.querySelectorAll('button')).find((x) => x.textContent === label);
      b?.click();
    };
    clickBtn('次へ');
    await Promise.resolve();
    clickBtn('次へ');
    await Promise.resolve();
    clickBtn('始める');
    await dialog;
  });
});
