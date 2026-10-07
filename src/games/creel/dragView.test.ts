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

describe('dragView PU-20a (箱の全体から始められる・箱の上の動きはすべて引っぱり)', () => {
  it('箱の中のどこ (型番の文字・チーズの絵・角) から始めても引っぱれる', () => {
    const t = setup('x');
    const hinban = document.createElement('span');
    hinban.className = 'creel-box__hinban';
    const cheese = document.createElement('span');
    cheese.className = 'creel-box__cheese';
    t.box.appendChild(hinban);
    t.box.appendChild(cheese);
    let id = 1;
    for (const el of [hinban, cheese, t.box]) {
      fire(el, 'pointerdown', 300, 300, id);
      fire(el, 'pointermove', 300, 250, id);
      expect(layers(), el.className).toHaveLength(1);
      fire(el, 'pointerup', 300, 250, id);
      vi.advanceTimersByTime(400);
      id++;
    }
    t.view.destroy();
  });

  it('箱の touch-action は none (pan-x・pan-y だと、斜めの動きをブラウザが奪って引っぱれない。送るのは dragView が行う)', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/styles/base.css', 'utf8');
    const rules = css.match(/[^{}]*\.creel-box\s*\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const r of rules) {
      expect(r, r).not.toMatch(/touch-action:\s*pan-/);
    }
    expect(rules.some((r) => /touch-action:\s*none/.test(r))).toBe(true);
  });

  it('箱の上の動きは向きに関係なくすべて引っぱり (縦長 x・横長 y のどちらでも): 真横・真上・真下・斜め・ほぼ水平のどれでも、チーズが出る。帯 (scrollLeft・scrollTop) は動かない', () => {
    for (const axis of ['x', 'y'] as const) {
      const t = setup(axis);
      Object.defineProperty(t.boxes, 'scrollLeft', { configurable: true, writable: true, value: 100 });
      Object.defineProperty(t.boxes, 'scrollTop', { configurable: true, writable: true, value: 50 });
      let id = 1;
      for (const [dx, dy] of [[30, 0], [-30, 0], [0, -30], [0, 30], [20, -2], [-20, 2], [9, 9], [-9, -9], [2, 20]] as Array<[number, number]>) {
        fire(t.box, 'pointerdown', 300, 300, id);
        fire(t.box, 'pointermove', 300 + dx, 300 + dy, id);
        expect(layers(), `${axis} (${dx},${dy})`).toHaveLength(1);
        fire(t.box, 'pointerup', 300 + dx, 300 + dy, id);
        vi.advanceTimersByTime(400);
        id++;
      }
      expect(t.boxes.scrollLeft).toBe(100);
      expect(t.boxes.scrollTop).toBe(50);
      t.view.destroy();
    }
  });

  it('箱の touch-action は none で、箱の帯 (.creel-boxes) は overflow: hidden (指でなぞってもスクロールしない。送るのは専用のバー)', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/styles/base.css', 'utf8');
    const boxesRules = css.match(/[^{}]*\.creel-boxes\s*\{[^}]*\}/g) ?? [];
    expect(boxesRules.some((r) => /overflow(-x|-y)?:\s*auto/.test(r))).toBe(false);
    expect(boxesRules.some((r) => /overflow:\s*hidden/.test(r))).toBe(true);
  });
});
