import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachBoxDrag } from './boxDrag';

/**
 * 元の糸の箱 (操作欄の段ボールの箱の帯) の引っぱり (PU-16b)。クリール立ての dragView と同じ決まり:
 * 箱の全体から始められる・箱の上の動きは向きに関係なくすべて引っぱり・引っぱるチーズは指より上 (半径 + 24px)・
 * pointercancel で戻る・取り残された押さえは捨てる。押すだけ (8px 未満) は「はかりに載せる」。
 */

function setup(): {
  panel: HTMLElement;
  box: HTMLElement;
  child: HTMLElement;
  onTap: ReturnType<typeof vi.fn>;
  onDrop: ReturnType<typeof vi.fn>;
  onHover: ReturnType<typeof vi.fn>;
  laneAt: ReturnType<typeof vi.fn>;
  view: { cancel(): void; destroy(): void };
} {
  document.body.textContent = '';
  const panel = document.createElement('div');
  const box = document.createElement('div');
  box.className = 'creel-box';
  box.dataset.source = 's1-m0';
  const child = document.createElement('span');
  child.className = 'creel-box__hinban';
  box.appendChild(child);
  panel.appendChild(box);
  document.body.appendChild(panel);
  const onTap = vi.fn();
  const onDrop = vi.fn();
  const onHover = vi.fn();
  const laneAt = vi.fn((): number | null => null);
  const view = attachBoxDrag({
    panel,
    laneAt,
    look: () => ({ body: '#123456', core: '#abcdef' }),
    diameterPx: () => 48,
    onTap,
    onDrop,
    onHover,
  });
  return { panel, box, child, onTap, onDrop, onHover, laneAt, view };
}

function fire(el: Element | Window, type: string, x: number, y: number, id = 1): void {
  el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, bubbles: true, button: 0 }));
}
const layers = (): NodeListOf<HTMLElement> => document.querySelectorAll<HTMLElement>('.creel-drag');

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

describe('糸割り boxDrag PU-16b (箱の引っぱり)', () => {
  it('1. 押すだけ (8px 未満) で離すと onTap (はかりに載せる)。引っぱりの重ねは出ない', () => {
    const t = setup();
    fire(t.box, 'pointerdown', 100, 300);
    fire(t.box, 'pointermove', 103, 301);
    fire(t.box, 'pointerup', 103, 301);
    expect(t.onTap).toHaveBeenCalledWith('s1-m0');
    expect(layers()).toHaveLength(0);
    expect(t.onDrop).not.toHaveBeenCalled();
    t.view.destroy();
  });

  it('2. 箱の中のどこ (箱の枠・中の文字) から始めても、どの向きにも引っぱれる (スクロールとの分けは無い)', () => {
    const t = setup();
    let id = 1;
    for (const el of [t.box, t.child]) {
      for (const [dx, dy] of [[30, 0], [-30, 0], [0, -30], [0, 30], [20, -2], [9, 9]] as Array<[number, number]>) {
        fire(el, 'pointerdown', 100, 300, id);
        fire(el, 'pointermove', 100 + dx, 300 + dy, id);
        expect(layers(), `(${dx},${dy})`).toHaveLength(1);
        fire(el, 'pointerup', 100 + dx, 300 + dy, id);
        vi.advanceTimersByTime(400);
        id++;
      }
    }
    t.view.destroy();
  });

  it('3. 引っぱるチーズは指より (半径 + 24px) 上。糸の色で描く', () => {
    const t = setup();
    fire(t.box, 'pointerdown', 100, 300);
    fire(t.box, 'pointermove', 100, 250);
    const layer = layers()[0]!;
    const m = layer.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)!;
    const centerY = parseFloat(m[2]!) + 48 / 2;
    expect(centerY).toBeCloseTo(250 - (24 + 24), 5);
    expect(layer.style.getPropertyValue('--creel-drag-body')).toBe('#123456');
    t.view.destroy();
  });

  it('4. 口 (laneAt) の上で離すと onDrop(口, 糸)。判定はチーズの位置 (指より上)。離したら重ねは消える', () => {
    const t = setup();
    t.laneAt.mockImplementation((x: number, y: number) => (x === 300 && y === 200 - 48 ? 2 : null));
    fire(t.box, 'pointerdown', 100, 300);
    fire(t.box, 'pointermove', 250, 220);
    fire(t.box, 'pointermove', 300, 200);
    expect(t.onHover).toHaveBeenLastCalledWith(2);
    fire(t.box, 'pointerup', 300, 200);
    vi.advanceTimersByTime(400);
    expect(t.onDrop).toHaveBeenCalledWith(2, 's1-m0');
    expect(t.onHover).toHaveBeenLastCalledWith(null);
    expect(layers()).toHaveLength(0);
    t.view.destroy();
  });

  it('5. 口の外で離すと何もしない (箱へ戻る)。重ねは消える', () => {
    const t = setup();
    fire(t.box, 'pointerdown', 100, 300);
    fire(t.box, 'pointermove', 140, 260);
    fire(t.box, 'pointerup', 140, 260);
    vi.advanceTimersByTime(400);
    expect(t.onDrop).not.toHaveBeenCalled();
    expect(t.onTap).not.toHaveBeenCalled();
    expect(layers()).toHaveLength(0);
    t.view.destroy();
  });

  it('6. pointercancel で引っぱりが終わり、何も置かない。そのあとまた引っぱれる (PU-13c と同じ)', () => {
    const t = setup();
    fire(t.box, 'pointerdown', 100, 300);
    fire(t.box, 'pointermove', 100, 250);
    expect(layers()).toHaveLength(1);
    fire(window, 'pointercancel', 100, 250);
    vi.advanceTimersByTime(400);
    expect(layers()).toHaveLength(0);
    expect(t.onDrop).not.toHaveBeenCalled();
    fire(t.box, 'pointerdown', 100, 300, 2);
    fire(t.box, 'pointermove', 100, 250, 2);
    expect(layers()).toHaveLength(1);
    t.view.destroy();
  });

  it('7. 前の指の pointerup が届かないまま残っていても、次の押さえで引っぱれる。引っぱっている間の 2 本目の指は無視する', () => {
    const t = setup();
    fire(t.box, 'pointerdown', 100, 300, 1); // up も cancel も来ないまま
    fire(t.box, 'pointerdown', 100, 300, 2);
    fire(t.box, 'pointermove', 100, 250, 2);
    expect(layers()).toHaveLength(1);
    fire(t.box, 'pointerdown', 100, 300, 3); // 2 本目の指
    fire(t.box, 'pointermove', 400, 100, 3);
    expect(layers()).toHaveLength(1);
    fire(t.box, 'pointerup', 100, 250, 2);
    vi.advanceTimersByTime(400);
    expect(layers()).toHaveLength(0);
    t.view.destroy();
  });

  it('8. destroy すると、引っぱりの途中でも重ねが消え、以後は何も受けない', () => {
    const t = setup();
    fire(t.box, 'pointerdown', 100, 300);
    fire(t.box, 'pointermove', 100, 250);
    t.view.destroy();
    expect(layers()).toHaveLength(0);
    fire(t.box, 'pointerdown', 100, 300, 5);
    fire(t.box, 'pointermove', 100, 250, 5);
    expect(layers()).toHaveLength(0);
  });
});
