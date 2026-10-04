import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachDrag } from './dragView';
import { liftFor } from './drag';
import { pegCenter, toPx } from './geometry';

/** チーズを引っぱる動きの画面まわり (PU-13c)。盤面は 600×400 に見せ、1 段 × 6 本の軸 */
const FIT = { scale: 0.6, offsetX: 0, offsetY: 0 };
const D = 60; // チーズの直径 (画面 px)

function rect(el: Element, w: number, h: number): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ x: 0, y: 0, left: 0, top: 0, right: w, bottom: h, width: w, height: h }),
  });
}

interface Setup {
  stage: HTMLCanvasElement;
  panel: HTMLElement;
  box: HTMLElement;
  boxes: HTMLElement;
  onDrop: ReturnType<typeof vi.fn>;
  view: { cancel(): void; destroy(): void };
}

function setup(axis: 'x' | 'y' | '' = ''): Setup {
  document.body.textContent = '';
  const stage = document.createElement('canvas');
  rect(stage, 600, 400);
  document.body.appendChild(stage);
  const panel = document.createElement('div');
  const boxes = document.createElement('div');
  boxes.dataset.scroll = axis;
  const box = document.createElement('div');
  box.className = 'creel-box';
  box.dataset.yarn = 'kon-a';
  rect(box, 100, 100);
  boxes.appendChild(box);
  panel.appendChild(boxes);
  document.body.appendChild(panel);
  const onDrop = vi.fn();
  const view = attachDrag({
    stage,
    panel,
    rows: 1,
    cols: 6,
    fit: () => FIT,
    placedAt: () => null,
    look: () => ({ body: '#123456', core: '#abcdef' }),
    diameterPx: () => D,
    onPress: () => undefined,
    onDrop,
    onHover: () => undefined,
  });
  return { stage, panel, box, boxes, onDrop, view };
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

describe('dragView (PU-13c)', () => {
  it('チーズは指より (半径 + 24px) 上に出る: 指の点とチーズの下の端の間が 24px', () => {
    const t = setup();
    fire(t.box, 'pointerdown', 300, 300);
    fire(t.box, 'pointermove', 300, 250);
    const layer = layers()[0]!;
    const m = layer.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)!;
    const topY = parseFloat(m[2]!);
    const centerY = topY + D / 2;
    expect(centerY).toBeCloseTo(250 - liftFor(D), 5);
    const bottomEdge = centerY + D / 2;
    expect(250 - bottomEdge).toBeCloseTo(24, 5);
    t.view.destroy();
  });

  it('離した所 (チーズの位置 = 指より liftFor 上) で軸を決める: 軸の中心の (liftFor 下) で離すとその軸に嵌まる', () => {
    const t = setup();
    const c = toPx(FIT, pegCenter(2, 1, 6));
    fire(t.box, 'pointerdown', 300, 380);
    fire(t.box, 'pointermove', 280, 300);
    fire(t.box, 'pointermove', c.x, c.y + liftFor(D));
    fire(t.box, 'pointerup', c.x, c.y + liftFor(D));
    expect(t.onDrop).toHaveBeenCalledWith({ kind: 'place', index: 2 }, 'kon-a');
    t.view.destroy();
  });

  it('pointercancel で引っぱりが終わり、チーズは箱へ戻って消える。何も置かない。そのあとまた引っぱれる', () => {
    const t = setup();
    fire(t.box, 'pointerdown', 300, 300);
    fire(t.box, 'pointermove', 300, 250);
    expect(layers()).toHaveLength(1);
    fire(window, 'pointercancel', 300, 250);
    vi.advanceTimersByTime(400);
    expect(layers()).toHaveLength(0);
    expect(t.onDrop).not.toHaveBeenCalled();
    fire(t.box, 'pointerdown', 300, 300, 2);
    fire(t.box, 'pointermove', 300, 250, 2);
    expect(layers()).toHaveLength(1);
    t.view.destroy();
  });

  it('縦長の帯 (data-scroll=x): 斜め上 (横 8・縦 −8) に動かしても引っぱりになる。ほぼ横 (横 20・縦 −2) は送る', () => {
    const t = setup('x');
    fire(t.box, 'pointerdown', 300, 300);
    fire(t.box, 'pointermove', 308, 292);
    expect(layers()).toHaveLength(1);
    fire(t.box, 'pointerup', 308, 292);
    vi.advanceTimersByTime(400);
    fire(t.box, 'pointerdown', 300, 300, 2);
    fire(t.box, 'pointermove', 320, 298, 2);
    expect(layers()).toHaveLength(0);
    t.view.destroy();
  });

  it('前の指の pointerup が届かないまま (指が動かず) 残っていても、次の押さえで引っぱれる (別の指でも、同じ番号でも)', () => {
    const t = setup();
    fire(t.box, 'pointerdown', 300, 300, 1); // up も cancel も来ないまま
    fire(t.box, 'pointerdown', 300, 300, 2);
    fire(t.box, 'pointermove', 300, 250, 2);
    expect(layers()).toHaveLength(1);
    fire(t.box, 'pointerup', 300, 250, 2);
    vi.advanceTimersByTime(400);
    expect(layers()).toHaveLength(0);
    fire(t.box, 'pointerdown', 300, 300, 3);
    fire(t.box, 'pointerdown', 300, 300, 3); // 同じ番号がもう一度
    fire(t.box, 'pointermove', 300, 250, 3);
    expect(layers()).toHaveLength(1);
    t.view.destroy();
  });

  it('引っぱっている間の 2 本目の指は無視する (今までどおり)', () => {
    const t = setup();
    fire(t.box, 'pointerdown', 300, 300, 1);
    fire(t.box, 'pointermove', 300, 250, 1);
    fire(t.box, 'pointerdown', 310, 310, 2);
    fire(t.box, 'pointermove', 320, 260, 2);
    expect(layers()).toHaveLength(1);
    t.view.destroy();
  });
});
