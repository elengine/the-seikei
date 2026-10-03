import { describe, it, expect } from 'vitest';
import { initialCalc, calc, displayValue, openCalculatorBody } from './calculator';
import type { CalcKey } from './calculator';
import { readFileSync } from 'node:fs';
import { openSheet } from '../../core/ui/sheet';

/** キーを順に押す */
function press(keys: CalcKey[]): ReturnType<typeof initialCalc> {
  let s = initialCalc();
  for (const k of keys) {
    s = calc(s, k);
  }
  return s;
}

describe('drumsetup calculator T2c-03a (電卓の計算)', () => {
  it('1. 「1」「.」「2」「×」「3」「=」で 3.6', () => {
    const s = press(['1', '.', '2', '*', '3', '=']);
    expect(displayValue(s)).toBe('3.6');
  });

  it('2. 0 で割ると「エラー」。C で 0 に戻る', () => {
    const s = press(['5', '/', '0', '=']);
    expect(displayValue(s)).toBe('エラー');
    const c = calc(s, 'C');
    expect(displayValue(c)).toBe('0');
  });

  it('3. 表示は小数第4位まで (1÷3 は 0.3333)。0.1+0.2 は 0.3', () => {
    expect(displayValue(press(['1', '/', '3', '=']))).toBe('0.3333');
    expect(displayValue(press(['0', '.', '1', '+', '0', '.', '2', '=']))).toBe('0.3');
  });

  it('4. 計算の続きができる (= のあとに演算子を押すと結果を使う)', () => {
    const s = press(['1', '.', '2', '*', '3', '=', '+', '1', '=']);
    expect(displayValue(s)).toBe('4.6');
  });
});

describe('drumsetup calculator T2c-04b (電卓の大きなポップアップ)', () => {
  /** 電卓をシート付きで開く (本編の controller と同じ形) */
  function mountCalc(): { root: HTMLElement; calcRoot: HTMLElement } {
    const parent = document.createElement('div');
    const sheet = openSheet({ parent, title: '電卓' });
    openCalculatorBody(sheet.body, { onUse: () => {} });
    return { root: sheet.root, calcRoot: sheet.body.querySelector('.drumsetup-calc') as HTMLElement };
  }

  it('5. 電卓の重ね表示は大きい形 (sheet--tall。T2c-04b)', () => {
    const { root } = mountCalc();
    expect(root.classList.contains('sheet--tall')).toBe(true);
  });

  it('6. ボタンは 4列×5段の格子 (= は横に2つ分)。C も格子の中。どのボタンも同じ幅で 64px 以上 (T2c-04b)', () => {
    const { calcRoot } = mountCalc();
    const pad = calcRoot.querySelector('.drumsetup-calc__keys') as HTMLElement;
    const labels = Array.from(pad.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', 'C', '+', '=']);
    const css = readFileSync('src/styles/base.css', 'utf8');
    expect(/\.drumsetup-calc__keys\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/.test(css)).toBe(true);
    expect(/\.drumsetup-calc__eq\s*\{[^}]*grid-column:\s*2\s*\/\s*span 2/.test(css)).toBe(true);
    expect(/\.drumsetup-calc__key\s*\{[^}]*min-width:\s*64px/.test(css)).toBe(true);
    expect(/\.drumsetup-calc__key\s*\{[^}]*min-height:\s*64px/.test(css)).toBe(true);
    // C は 2 段目の4つ目ではなく 4 段目 (0 . C +) にある
    const cBtn = pad.querySelectorAll('button')[14] as HTMLButtonElement;
    expect(cBtn.textContent?.trim()).toBe('C');
  });

  it('7. 表示は上・右寄せ・40px 以上。表は表示の下にあり、ボタンで開閉する (tan は小数第4位。T2c-04b)', () => {
    const { calcRoot } = mountCalc();
    const display = calcRoot.querySelector('[data-testid="drumsetup-calc-display"]') as HTMLElement;
    expect(display.textContent).toBe('0');
    const css = readFileSync('src/styles/base.css', 'utf8');
    expect(/\.drumsetup-calc__display\s*\{[^}]*font-size:\s*40px/.test(css)).toBe(true);
    expect(/\.drumsetup-calc__display\s*\{[^}]*text-align:\s*right/.test(css)).toBe(true);
    // 表示の下に表の入れ物がある
    const left = calcRoot.querySelector('.drumsetup-calc__left') as HTMLElement;
    expect(left.contains(display)).toBe(true);
    const table = left.querySelector('[data-testid="drumsetup-calc-table"]') as HTMLElement;
    expect(table.textContent).toBe(''); // 最初は閉じている
    const tanBtn = Array.from(calcRoot.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'tan の表') as HTMLButtonElement;
    tanBtn.click();
    expect(table.textContent).toContain('0.1584'); // tan 9°
    expect(table.textContent).toContain('0.0875'); // tan 5°
    tanBtn.click();
    expect(table.textContent).toBe(''); // もう一度押すと閉じる
  });

  it('8. 横長の低い画面では左に表示と表・右にボタンの格子 (T2c-04b)', () => {
    const css = readFileSync('src/styles/base.css', 'utf8');
    expect(/@media[^{]*orientation:\s*landscape[^{]*\{[\s\S]*?\.drumsetup-calc\s*\{[^}]*display:\s*grid/.test(css)).toBe(true);
  });
});
