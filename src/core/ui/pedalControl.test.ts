import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPedalControl, createTensionMeter } from './pedalControl';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

describe('pedalControl (T2-03。PU-09c で横向きに)', () => {
  let onChange: ReturnType<typeof vi.fn<(v: number) => void>>;
  let pc: ReturnType<typeof createPedalControl>;
  let groove: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    onChange = vi.fn();
    pc = createPedalControl(document.body, { label: 'ペダル', onChange });
    groove = document.body.querySelector('.pedal__groove')!;
    // 溝 (横長): x=100, y=200, 幅 264, 高さ 64
    fakeRect(groove, 100, 200, 264, 64);
  });

  afterEach(() => {
    pc.destroy();
  });

  it('1. 溝の左端から32px (横木の中心が来る位置) を押すと 0、右端から32px で 100、真ん中で 50 (右へ押すほど速い)', () => {
    pointer(groove, 'pointerdown', 132, 232); // 左端 + 32px
    expect(onChange).toHaveBeenLastCalledWith(0);
    pointer(groove, 'pointerdown', 332, 232); // 右端 - 32px
    expect(onChange).toHaveBeenLastCalledWith(100);
    pointer(groove, 'pointerdown', 232, 232); // 真ん中
    expect(onChange).toHaveBeenLastCalledWith(50);
  });

  it('PU-09c: 溝は横長で、「戻す」が左・「踏み込む」が右。溝の中を横木が左右に動く', () => {
    const row = document.body.querySelector('.pedal__row')!;
    const kids = Array.from(row.children) as HTMLElement[];
    expect(kids[0]!.textContent).toBe('戻す');
    expect(kids[1]).toBe(groove);
    expect(kids[2]!.textContent).toBe('踏み込む');
    expect(groove.querySelector('.pedal__bar')).not.toBeNull();
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

  it('PU-09c: 横木の位置は left の割合で決まる (0 で左端、100 で右端、50 で真ん中)。横木の幅の分は translateX で戻す', () => {
    const bar = document.body.querySelector('.pedal__bar') as HTMLElement;
    pc.setValue(0);
    expect(bar.style.left).toBe('0%');
    expect(bar.style.transform).toBe('translateX(-0%)');
    pc.setValue(100);
    expect(bar.style.left).toBe('100%');
    expect(bar.style.transform).toBe('translateX(-100%)'); // 右端 = 溝の右端に横木の右端が合う
    pc.setValue(50);
    expect(bar.style.left).toBe('50%');
    expect(bar.style.transform).toBe('translateX(-50%)');
    expect(bar.style.top).toBe(''); // もう上下には動かない
  });

  it('PU-09c: 溝の上で左右に動かすと値が変わる (指を離しても位置は保つ)', () => {
    pointer(groove, 'pointerdown', 132, 232);
    onChange.mockClear();
    pointer(groove, 'pointermove', 182, 232);
    const v = onChange.mock.calls[onChange.mock.calls.length - 1]![0];
    expect(v).toBeCloseTo((50 / 200) * 100, 5); // 左端から 50px / 使える幅 200px
    pointer(groove, 'pointermove', 332, 232);
    expect(onChange).toHaveBeenLastCalledWith(100);
    pointer(groove, 'pointerup', 332, 232);
    const bar = document.body.querySelector('.pedal__bar') as HTMLElement;
    expect(bar.style.left).toBe('100%');
  });

  it('PU-09c: 速さの表示は溝の右上 (溝より上の行の右寄せ)。20px 以上は CSS', () => {
    const value = document.body.querySelector('.pedal__value')!;
    const root = document.body.querySelector('.pedal-control')!;
    expect(Array.from(root.children).indexOf(value)).toBeLessThan(Array.from(root.children).indexOf(document.body.querySelector('.pedal__row')!));
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    expect(css.match(/\.pedal__value\s*\{([^}]*)\}/)![1]).toContain('align-self: flex-end');
    expect(css.match(/\.pedal__groove\s*\{([^}]*)\}/)![1]).toContain('height: 64px');
  });

  it('2. pointermove は pointerdown の後だけ onChange を呼ぶ。pointerup の後は呼ばない', () => {
    pointer(groove, 'pointermove', 232, 232);
    expect(onChange).not.toHaveBeenCalled();
    pointer(groove, 'pointerdown', 132, 232);
    onChange.mockClear();
    pointer(groove, 'pointermove', 232, 232); // 真ん中
    expect(onChange).toHaveBeenLastCalledWith(50);
    pointer(groove, 'pointerup', 232, 232);
    onChange.mockClear();
    pointer(groove, 'pointermove', 352, 232);
    expect(onChange).not.toHaveBeenCalled();
    // pointercancel でも離す
    pointer(groove, 'pointerdown', 132, 232);
    onChange.mockClear();
    pointer(groove, 'pointercancel', 352, 232);
    onChange.mockClear();
    pointer(groove, 'pointermove', 352, 232);
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
    pointer(groove, 'pointerdown', 232, 232);
    expect(onChange).not.toHaveBeenCalled();
    const btns = () => Array.from(document.body.querySelectorAll('button'));
    btns().find((b) => b.textContent === '踏み込む')!.click();
    expect(onChange).not.toHaveBeenCalled();
    pc.setEnabled(true);
    expect(pc.root.className).not.toContain('disabled');
    pointer(groove, 'pointerdown', 232, 232);
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
    pointer(groove, 'pointerdown', 132, 232);
    pointer(groove, 'pointermove', 232, 232);
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

describe('PU-05c: ペダルの「踏み込む」「戻す」の押せない形', () => {
  it('setEnabled(false, 理由) で btn--locked (disabled にしない)。押すと onLocked(理由) で onChange は呼ばれない。setEnabled(true) で戻る', () => {
    document.body.innerHTML = '';
    const onChange = vi.fn();
    const onLocked = vi.fn();
    const pc = createPedalControl(document.body, { label: 'ペダル', onChange, onLocked });
    pc.setEnabled(false, '巻き始めると使えます');
    const plus = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.pedal__btn')).find((b) => b.textContent === '踏み込む')!;
    expect(plus.classList.contains('btn--locked')).toBe(true);
    expect(plus.hasAttribute('disabled')).toBe(false);
    plus.click();
    expect(onLocked).toHaveBeenCalledWith('巻き始めると使えます');
    expect(onChange).not.toHaveBeenCalled();
    pc.setEnabled(true);
    expect(plus.classList.contains('btn--locked')).toBe(false);
    plus.click();
    expect(onChange).toHaveBeenCalledWith(10);
    pc.destroy();
  });
});

describe('PU-09c: 操作欄が狭いときは、溝を上の段にして「戻す」「踏み込む」を下の段に並べる', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('幅が 360px 未満なら pedal-control--stacked が付き、360px 以上で外れる。destroy で監視を止める', () => {
    let callback: (() => void) | null = null;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          callback = cb;
        }
        observe(): void {}
        disconnect = disconnect;
      },
    );
    document.body.innerHTML = '';
    const pc = createPedalControl(document.body, { label: '', onChange: () => undefined });
    let w = 300;
    Object.defineProperty(pc.root, 'clientWidth', { configurable: true, get: () => w });
    callback!();
    expect(pc.root.classList.contains('pedal-control--stacked')).toBe(true);
    w = 400;
    callback!();
    expect(pc.root.classList.contains('pedal-control--stacked')).toBe(false);
    pc.destroy();
    expect(disconnect).toHaveBeenCalled();
  });

  it('base.css: stacked のとき、溝は 1 行ぶんの幅を使い、ボタンは下の段で左右に広がる', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    expect(css.match(/\.pedal-control--stacked \.pedal__row\s*\{([^}]*)\}/)![1]).toContain('flex-wrap: wrap');
    const groove = css.match(/\.pedal-control--stacked \.pedal__groove\s*\{([^}]*)\}/)![1]!;
    expect(groove).toContain('order: -1');
    expect(groove).toContain('flex: 1 0 100%');
  });
});
