import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createScrollBar } from './scrollBar';

/** 溝の見た目の長さを (jsdom は測れないので) 決めて見せる */
function sizeIt(el: HTMLElement, w: number, h: number): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ x: 0, y: 0, left: 0, top: 0, right: w, bottom: h, width: w, height: h }),
  });
}

const ev = (type: string, x: number, y: number, id = 1): PointerEvent =>
  new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, bubbles: true, button: 0 });

describe('scrollBar PU-20a (専用のスクロールバー)', () => {
  let onChange: ReturnType<typeof vi.fn<(pos: number) => void>>;
  beforeEach(() => {
    document.body.textContent = '';
    onChange = vi.fn<(pos: number) => void>();
  });

  function make(orientation: 'x' | 'y', metrics: { view: number; total: number; pos: number }): ReturnType<typeof createScrollBar> {
    const bar = createScrollBar({ orientation, onChange, ariaLabel: '箱の列' });
    document.body.appendChild(bar.root);
    if (orientation === 'x') sizeIt(bar.root, 300, 64);
    else sizeIt(bar.root, 64, 300);
    bar.update(metrics);
    return bar;
  }

  it('全部見えているとき (全体 ≦ 見えている大きさ) は出さない (hidden)。収まらないときは出る。向きのクラスと role・aria が付く', () => {
    const bar = make('x', { view: 300, total: 300, pos: 0 });
    expect(bar.root.hidden).toBe(true);
    bar.update({ view: 300, total: 900, pos: 0 });
    expect(bar.root.hidden).toBe(false);
    expect(bar.root.classList.contains('scrollbar')).toBe(true);
    expect(bar.root.classList.contains('scrollbar--x')).toBe(true);
    expect(bar.root.getAttribute('role')).toBe('scrollbar');
    expect(bar.root.getAttribute('aria-orientation')).toBe('horizontal');
    expect(bar.root.getAttribute('aria-label')).toBe('箱の列');
    const y = make('y', { view: 100, total: 200, pos: 0 });
    expect(y.root.classList.contains('scrollbar--y')).toBe(true);
    expect(y.root.getAttribute('aria-orientation')).toBe('vertical');
    bar.destroy();
    y.destroy();
  });

  it('つまみの長さ = 見えている割合 (横は幅、縦は高さ)。位置は 0〜全体−見えている分 の割合。つまみに握りの印 (縦線) がある', () => {
    const bar = make('x', { view: 300, total: 900, pos: 0 });
    const thumb = bar.root.querySelector<HTMLElement>('.scrollbar__thumb')!;
    expect(parseFloat(thumb.style.width)).toBeCloseTo(100 / 3, 3);
    expect(parseFloat(thumb.style.left)).toBeCloseTo(0, 3);
    bar.update({ view: 300, total: 900, pos: 600 }); // 一番後ろ
    expect(parseFloat(thumb.style.left)).toBeCloseTo(100 - 100 / 3, 3);
    expect(thumb.querySelector('.scrollbar__grip')).not.toBeNull();
    const y = make('y', { view: 100, total: 400, pos: 150 });
    const ty = y.root.querySelector<HTMLElement>('.scrollbar__thumb')!;
    expect(parseFloat(ty.style.height)).toBeCloseTo(25, 3);
    expect(parseFloat(ty.style.top)).toBeCloseTo((150 / 300) * 75, 3);
    bar.destroy();
    y.destroy();
  });

  it('つまみを引っぱると帯の位置が変わる (溝 300px・つまみ 100px → 動く範囲 200px が 帯の 600 にあたる)。範囲の外には出ない', () => {
    const bar = make('x', { view: 300, total: 900, pos: 0 });
    const thumb = bar.root.querySelector<HTMLElement>('.scrollbar__thumb')!;
    thumb.dispatchEvent(ev('pointerdown', 10, 20));
    window.dispatchEvent(ev('pointermove', 110, 20)); // 100px = つまみの動く範囲の半分
    expect(onChange).toHaveBeenLastCalledWith(300);
    window.dispatchEvent(ev('pointermove', 900, 20));
    expect(onChange).toHaveBeenLastCalledWith(600);
    window.dispatchEvent(ev('pointermove', -500, 20));
    expect(onChange).toHaveBeenLastCalledWith(0);
    window.dispatchEvent(ev('pointerup', -500, 20));
    onChange.mockClear();
    window.dispatchEvent(ev('pointermove', 50, 20)); // 離したあとは何も起きない
    expect(onChange).not.toHaveBeenCalled();
    bar.destroy();
  });

  it('縦のバー: つまみを縦に引っぱると帯の位置が変わる', () => {
    const bar = make('y', { view: 100, total: 400, pos: 0 });
    const thumb = bar.root.querySelector<HTMLElement>('.scrollbar__thumb')!;
    thumb.dispatchEvent(ev('pointerdown', 20, 5));
    window.dispatchEvent(ev('pointermove', 20, 5 + 225)); // 溝 300・つまみ 75 → 動く範囲 225 = 帯の 300
    expect(onChange).toHaveBeenLastCalledWith(300);
    bar.destroy();
  });

  it('溝を押すと、その向きへ 1 画面分 (見えている大きさ) 送る。つまみより前を押すと戻る。範囲を超えない', () => {
    const bar = make('x', { view: 300, total: 900, pos: 0 });
    bar.root.dispatchEvent(ev('pointerdown', 250, 30)); // つまみ (0〜100px) より後ろ
    expect(onChange).toHaveBeenLastCalledWith(300);
    bar.update({ view: 300, total: 900, pos: 400 }); // つまみは 133〜233px あたり
    bar.root.dispatchEvent(ev('pointerdown', 20, 30)); // つまみより前
    expect(onChange).toHaveBeenLastCalledWith(100);
    bar.update({ view: 300, total: 900, pos: 500 });
    bar.root.dispatchEvent(ev('pointerdown', 295, 30));
    expect(onChange).toHaveBeenLastCalledWith(600);
    bar.destroy();
  });

  it('destroy すると、引っぱりの途中でも window の監視が外れ、以後は何も呼ばない', () => {
    const bar = make('x', { view: 300, total: 900, pos: 0 });
    bar.root.querySelector<HTMLElement>('.scrollbar__thumb')!.dispatchEvent(ev('pointerdown', 10, 20));
    bar.destroy();
    onChange.mockClear();
    window.dispatchEvent(ev('pointermove', 200, 20));
    expect(onChange).not.toHaveBeenCalled();
    expect(document.body.contains(bar.root)).toBe(false);
  });

  it('base.css: 押せる太さは 64px 以上 (横は高さ、縦は幅)。つまみは藍。touch-action: none', () => {
    const css = readFileSync('src/styles/base.css', 'utf8');
    const x = css.match(/\.scrollbar--x\s*\{([^}]*)\}/)![1]!;
    const y = css.match(/\.scrollbar--y\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(x.match(/height:\s*(\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(64);
    expect(parseInt(y.match(/width:\s*(\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(64);
    const base = css.match(/\n\.scrollbar\s*\{([^}]*)\}/)![1]!;
    expect(base).toContain('touch-action: none');
    expect(css.match(/\.scrollbar__thumb\s*\{([^}]*)\}/)![1]!).toContain('var(--c-ai)');
  });
});
