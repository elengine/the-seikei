import { describe, it, expect } from 'vitest';
import { createItowariPanel } from './panel';
import { orderText, helpText } from './messages';
import { init, reduce } from './logic';
import type { ItowariState, ItowariAction } from './logic';
import { itowariPuzzles } from './puzzles';
import { getContent } from '../../core/content/content';

/**
 * 糸割りの操作欄のテスト (P2b T2b-03a)。
 * 依頼書・レベルごとの計算の手伝い・長さの設定 (10m 単位)・「ほかの口にも同じ長さ」・
 * 巻いているあいだはボタンが押せない形。
 */

const content = getContent();
const puzzles = itowariPuzzles(content);
const p1 = puzzles.find((p) => p.id === 's1')!; // split レベル1
const p2 = puzzles.find((p) => p.id === 's2')!; // split レベル2
const p3 = puzzles.find((p) => p.id === 's3')!; // refill レベル3
const p5 = puzzles.find((p) => p.id === 's5')!; // refill レベル5 (紙の芯)

interface Harness {
  panel: ReturnType<typeof createItowariPanel>;
  actions: ItowariAction[];
  notices: string[];
  host: HTMLElement;
  calcOpened(): number;
  set(s: ItowariState): void;
  text(): string;
  button(label: string): HTMLButtonElement | undefined;
}

function make(puzzle: typeof p1, s?: ItowariState): Harness {
  const actions: ItowariAction[] = [];
  const notices: string[] = [];
  let calcOpened = 0;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const panel = createItowariPanel(host, {
    onAction: (a) => actions.push(a),
    onNotice: (t) => notices.push(t),
    onCalculator: () => {
      calcOpened += 1;
    },
    puzzle,
  });
  const harness: Harness = {
    panel,
    actions,
    notices,
    host,
    calcOpened(): number {
      return calcOpened;
    },
    set(next: ItowariState): void {
      panel.update(next);
    },
    text(): string {
      return host.textContent ?? '';
    },
    button(label: string): HTMLButtonElement | undefined {
      return Array.from(host.querySelectorAll('button')).find((b) => b.textContent === label);
    },
  };
  panel.update(s ?? init(puzzle));
  return harness;
}

/** 口0に糸をかけて長さを設定した状態 */
function mounted(s0: ItowariState, puzzle: typeof p1, spindle: number, lengthM: number, slot: 0 | 1 = 0): ItowariState {
  let s = s0;
  s = reduce(s, { type: 'mount', spindle, sourceId: puzzle.sources[spindle]!.id, slot }, puzzle);
  if (lengthM > 0) s = reduce(s, { type: 'setLength', spindle, slot, lengthM }, puzzle);
  return s;
}

describe('糸割り messages T2b-03a (依頼書と手伝い)', () => {
  it('1. 依頼書: split は「チーズ 6 個 → クリールに 12 本。1本 5,500m 以上」。品番と番手も出す', () => {
    const t = orderText(p1);
    expect(t).toContain('紺の無地');
    expect(t).toContain('2/48');
    expect(t).toContain('チーズ 6 個');
    expect(t).toContain('クリールに 12 本');
    expect(t).toContain('1本 5,500m 以上');
  });

  it('2. 依頼書: refill は「あと 1,200m 巻く。クリールに 8 本要る(残り 6 本)」。レベル5 は「紙の芯 20g」', () => {
    const t3 = orderText(p3);
    expect(t3).toContain('あと 1,200m 巻く');
    expect(t3).toContain('クリールに 8 本要る(残り 6 本)');
    expect(orderText(p5)).toContain('紙の芯 20g');
    expect(orderText(p3)).not.toContain('紙の芯');
  });

  it('3. 手伝い: レベル1 は長さ「約 12,000 m」と半分「6,000 m」。レベル2 は長さだけ', () => {
    const t1 = helpText(p1, 500);
    expect(t1).toContain('約 12,000 m');
    expect(t1).toContain('半分 6,000 m');
    const t2 = helpText(p2, 450);
    expect(t2).toContain('約 10,800 m');
    expect(t2).not.toContain('半分');
  });

  it('4. 手伝い: レベル3〜4 は式の形「(重さ)× 24 = 長さ」。レベル5 は出さない', () => {
    expect(helpText(p3, 100)).toContain('(重さ)× 24 = 長さ');
    expect(helpText(p5, 165)).toBe('');
  });
});

describe('糸割り panel T2b-03a (操作欄)', () => {
  it('5. 依頼書と手伝いと「電卓」ボタンが出る。電卓を押すと onCalculator が呼ばれる', () => {
    const h = make(p1);
    expect(h.text()).toContain('チーズ 6 個');
    const calc = h.button('電卓');
    expect(calc).toBeDefined();
    calc!.click();
    expect(h.calcOpened()).toBe(1);
    expect(h.notices.length).toBe(0); // 電卓は onCalculator で開く (notice ではない)
  });

  it('6. 長さの設定: 選んだ口の大きな数字「1番の口:6,000 m」と ±10/100/1000 の6つのボタン。10m 単位', () => {
    let s = init(p1);
    s = mounted(s, p1, 0, 6000);
    const h = make(p1, s);
    h.panel.select(0);
    h.set(s);
    expect(h.text()).toContain('1番の口:6,000 m');
    for (const label of ['−1000', '−100', '−10', '+10', '+100', '+1000']) {
      expect(h.button(label), label).toBeDefined();
    }
    h.actions.length = 0;
    h.button('+100')!.click();
    const a = h.actions.find((x) => x.type === 'setLength');
    expect(a).toEqual({ type: 'setLength', spindle: 0, slot: 0, lengthM: 6100 });
    h.actions.length = 0;
    h.button('−1000')!.click();
    expect(h.actions[0]).toEqual({ type: 'setLength', spindle: 0, slot: 0, lengthM: 5000 });
  });

  it('7. 口を選んでいないときは長さの設定を使えない (理由が出る)', () => {
    const h = make(p1, init(p1));
    h.button('+10')!.click();
    expect(h.actions).toHaveLength(0);
    expect(h.notices.length).toBeGreaterThan(0);
  });

  it('8. 継ぐ糸のある口は「1つ目」「継ぐ糸」を切り替えられる。継ぐ糸を選ぶとそちらの長さが変わる', () => {
    let s = init(p1);
    s = mounted(s, p1, 0, 4200, 0);
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: p1.sources[1]!.id, slot: 1 }, p1); // 継ぐ糸は別のチーズから
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 1, lengthM: 1800 }, p1);
    const h = make(p1, s);
    h.panel.select(0);
    h.set(s);
    expect(h.text()).toContain('1つ目');
    expect(h.text()).toContain('継ぐ糸');
    expect(h.text()).toContain('1番の口:4,200 m');
    // 継ぐ糸へ切り替え
    const segBtn = Array.from(h.host.querySelectorAll<HTMLButtonElement>('.choice button')).find((b) => b.textContent === '継ぐ糸');
    segBtn!.click();
    h.set(s);
    expect(h.text()).toContain('1番の口:1,800 m');
    h.actions.length = 0;
    h.button('+10')!.click();
    expect(h.actions[0]).toEqual({ type: 'setLength', spindle: 0, slot: 1, lengthM: 1810 });
  });

  it('9. 「ほかの口にも同じ長さ」で、かけた口すべてに同じ長さを入れる', () => {
    let s = init(p1);
    s = mounted(s, p1, 0, 6000);
    s = mounted(s, p1, 1, 0);
    s = mounted(s, p1, 2, 0);
    const h = make(p1, s);
    h.panel.select(0);
    h.set(s);
    h.actions.length = 0;
    h.button('ほかの口にも同じ長さ')!.click();
    const sets = h.actions.filter((x) => x.type === 'setLength') as Extract<ItowariAction, { type: 'setLength' }>[];
    expect(sets).toHaveLength(2); // 口2と口3
    expect(sets.map((x) => x.spindle).sort()).toEqual([1, 2]);
    for (const x of sets) {
      expect(x.lengthM).toBe(6000);
      expect(x.slot).toBe(0);
    }
  });

  it('10. 「巻き始める」は、かけた口のどれかに長さが無いと押せない形 (理由が出る)。そろえば押せる', () => {
    let s = init(p1);
    s = mounted(s, p1, 0, 6000);
    s = mounted(s, p1, 1, 0); // 長さが無い口
    const h = make(p1, s);
    const start = h.button('巻き始める')!;
    expect(start.getAttribute('aria-disabled')).toBe('true');
    start.click();
    expect(h.notices.length).toBeGreaterThan(0);
    expect(h.actions).toHaveLength(0);
    // 長さをそろえる
    s = reduce(s, { type: 'setLength', spindle: 1, slot: 0, lengthM: 6000 }, p1);
    h.set(s);
    expect(start.getAttribute('aria-disabled')).toBeNull(); // panel.update で押せる形に変わる
    const h2 = make(p1, s);
    const start2 = h2.button('巻き始める')!;
    expect(start2.getAttribute('aria-disabled')).toBeNull();
    h2.actions.length = 0;
    start2.click();
    expect(h2.actions).toContainEqual({ type: 'start' });
  });

  it('11. 巻いているあいだは、操作欄のボタンがすべて押せない形 (押すと理由「巻いています」)', () => {
    let s = init(p1);
    s = mounted(s, p1, 0, 6000);
    s = reduce(s, { type: 'start' }, p1);
    s = reduce(s, { type: 'tick', dtMs: 1000 }, p1);
    const h = make(p1, s);
    h.actions.length = 0;
    for (const label of ['+10', '+100', '+1000', 'ほかの口にも同じ長さ', '電卓']) {
      const b = h.button(label);
      if (b !== undefined) {
        b.click();
        expect(b.getAttribute('aria-disabled')).toBe('true');
      }
    }
    expect(h.actions).toHaveLength(0);
    expect(h.notices).toContain('巻いています');
  });
});
