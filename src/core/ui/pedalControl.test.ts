import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPedalControl, createTensionMeter } from './pedalControl';

/** getBoundingClientRect を偽の値に変える */
function fakeRect(el: Element, x: number, y: number, w: number, h: number): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }),
  });
}

/** PointerEvent を起こす (jsdom に無いので MouseEvent で代用) */
function pointer(el: Element, type: string, x: number, y: number): void {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  el.dispatchEvent(e);
}

/** setPointerCapture / releasePointerCapture を jsdom の Element に足す */
if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture(): void {};
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {};
}

describe('pedalControl (T2-03)', () => {
  let onChange: ReturnType<typeof vi.fn<(v: number) => void>>;
  let pc: ReturnType<typeof createPedalControl>;
  let groove: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    onChange = vi.fn();
    pc = createPedalControl(document.body, { label: 'ペダル', onChange });
    groove = document.body.querySelector('.pedal__groove')!;
    // 溝: x=100, y=200, 幅 200, 高さ 240
    fakeRect(groove, 100, 200, 200, 240);
  });

  afterEach(() => {
    pc.destroy();
  });

  it('1. 溝の上端から32px (横木の中心が来る位置) を押すと 0、下端から32px で 100、真ん中で 50 (押し下げるほど速い)', () => {
    // 確認役が横木の位置の計算を直したため、押した位置から値を求める範囲は
    // (横木の高さの半分 32px を上下から除いた範囲) に変わった
    pointer(groove, 'pointerdown', 200, 232); // 上端 + 32px
    expect(onChange).toHaveBeenLastCalledWith(0);
    pointer(groove, 'pointerdown', 200, 408); // 下端 - 32px
    expect(onChange).toHaveBeenLastCalledWith(100);
    pointer(groove, 'pointerdown', 200, 320); // 真ん中
    expect(onChange).toHaveBeenLastCalledWith(50);
  });

  it("T2-03-fix: 「踏み込む」「戻す」に btn (btn--secondary) のクラスがある", () => {
    const btns = Array.from(document.body.querySelectorAll('button'));
    const plus = btns.find((b) => b.textContent === '踏み込む')!;
    const minus = btns.find((b) => b.textContent === '戻す')!;
    expect(plus.className).toContain('btn');
    expect(plus.className).toContain('btn--secondary');
    expect(minus.className).toContain('btn');
    expect(minus.className).toContain('btn--secondary');
  });

  it('T2-03-fix: 値 0 で横木の上端が 0px、値 100 で 176px (240 - 64) になる', () => {
    const bar = document.body.querySelector('.pedal__bar') as HTMLElement;
    pc.setValue(0);
    const top0 = bar.style.top;
    pc.setValue(100);
    const top100 = bar.style.top;
    // top は px で、0 なら 0px、100 なら (240-64)=176px
    expect(top0).toBe('0px');
    expect(top100).toBe('176px');
  });

  it('2. pointermove は pointerdown の後だけ onChange を呼ぶ。pointerup の後は呼ばない', () => {
    pointer(groove, 'pointermove', 200, 300);
    expect(onChange).not.toHaveBeenCalled();
    pointer(groove, 'pointerdown', 200, 200);
    onChange.mockClear();
    pointer(groove, 'pointermove', 200, 320); // 真ん中
    expect(onChange).toHaveBeenLastCalledWith(50);
    pointer(groove, 'pointerup', 200, 320);
    onChange.mockClear();
    pointer(groove, 'pointermove', 200, 440);
    expect(onChange).not.toHaveBeenCalled();
    // pointercancel でも離す
    pointer(groove, 'pointerdown', 200, 200);
    onChange.mockClear();
    pointer(groove, 'pointercancel', 200, 440);
    onChange.mockClear();
    pointer(groove, 'pointermove', 200, 440);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('3. 「踏み込む」で +10、「戻す」で -10 (0〜100 に丸める)', () => {
    const btns = () => Array.from(document.body.querySelectorAll('button'));
    const plus = btns().find((b) => b.textContent === '踏み込む')!;
    const minus = btns().find((b) => b.textContent === '戻す')!;
    pc.setValue(45);
    onChange.mockClear();
    plus.click();
    expect(onChange).toHaveBeenLastCalledWith(55);
    pc.setValue(5);
    onChange.mockClear();
    minus.click();
    expect(onChange).toHaveBeenLastCalledWith(0);
    pc.setValue(95);
    onChange.mockClear();
    plus.click();
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it('4. setEnabled(false) の間は、押しても onChange が呼ばれない (見た目も薄い)', () => {
    pc.setEnabled(false);
    expect(pc.root.className).toContain('disabled');
    pointer(groove, 'pointerdown', 200, 320);
    expect(onChange).not.toHaveBeenCalled();
    const btns = () => Array.from(document.body.querySelectorAll('button'));
    btns().find((b) => b.textContent === '踏み込む')!.click();
    expect(onChange).not.toHaveBeenCalled();
    pc.setEnabled(true);
    expect(pc.root.className).not.toContain('disabled');
    pointer(groove, 'pointerdown', 200, 320);
    expect(onChange).toHaveBeenLastCalledWith(50);
  });

  it('5. setValue は onChange を呼ばず、表示の数字が変わる', () => {
    onChange.mockClear();
    pc.setValue(70);
    expect(onChange).not.toHaveBeenCalled();
    const num = document.body.querySelector('.pedal__value')!;
    expect(num.textContent).toContain('70');
  });

  it('7. destroy で DOM から消え、pointer のリスナーも外れる', () => {
    pc.destroy();
    expect(document.body.querySelector('.pedal-control')).toBeNull();
    // 離したあとの move でも例外が出ず、onChange も呼ばれない
    pointer(groove, 'pointerdown', 200, 200);
    pointer(groove, 'pointermove', 200, 320);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('tensionMeter (T2-03)', () => {
  let tm: ReturnType<typeof createTensionMeter>;

  beforeEach(() => {
    document.body.innerHTML = '';
    tm = createTensionMeter(document.body, { label: '張り' });
  });

  afterEach(() => {
    tm.destroy();
  });

  it('6. tension 50・範囲 38〜62 で「適正」、70 で「強すぎ」、30 で「弱い」。針の位置が tension に比例', () => {
    const needle = document.body.querySelector('.meter__needle') as HTMLElement;
    const text = document.body.querySelector('.meter__state')!;
    tm.update(50, { min: 38, max: 62 });
    expect(text.textContent).toContain('適正');
    expect(text.textContent).toContain('○');
    const at50 = parseFloat(needle.style.left);
    tm.update(70, { min: 38, max: 62 });
    expect(text.textContent).toContain('強すぎ');
    expect(text.textContent).toContain('▲');
    const at70 = parseFloat(needle.style.left);
    tm.update(30, { min: 38, max: 62 });
    expect(text.textContent).toContain('弱い');
    expect(text.textContent).toContain('▼');
    const at30 = parseFloat(needle.style.left);
    // 針の位置が tension に比例 (0〜100 の帯の上)
    expect(at70).toBeGreaterThan(at50);
    expect(at50).toBeGreaterThan(at30);
    tm.update(0, { min: 38, max: 62 });
    expect(parseFloat(needle.style.left)).toBeCloseTo(0, 5);
    tm.update(100, { min: 38, max: 62 });
    expect(needle.style.left).toBe('100%');
  });

  it('7. destroy で DOM から消える', () => {
    tm.destroy();
    expect(document.body.querySelector('.tension-meter')).toBeNull();
  });
});
