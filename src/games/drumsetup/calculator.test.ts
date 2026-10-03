import { describe, it, expect } from 'vitest';
import { initialCalc, calc, displayValue } from './calculator';
import type { CalcKey } from './calculator';

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
