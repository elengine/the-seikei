import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
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
  frameEl: HTMLElement;
  calcOpened(): number;
  set(s: ItowariState): void;
  text(): string;
  button(label: string): HTMLButtonElement | undefined;
}

/** 詰めた形の枠 (.game-frame--compact。gameFrame が付けるクラスと data-layout を真似る) の中に操作欄を作る */
function make(puzzle: typeof p1, s?: ItowariState, layout: 'portrait' | 'landscape' = 'portrait'): Harness {
  const actions: ItowariAction[] = [];
  const notices: string[] = [];
  let calcOpened = 0;
  const frameEl = document.createElement('div');
  frameEl.className = 'game-frame game-frame--compact';
  frameEl.dataset.layout = layout;
  document.body.appendChild(frameEl);
  const host = document.createElement('div');
  frameEl.appendChild(host);
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
    frameEl,
    calcOpened(): number {
      return calcOpened;
    },
    set(next: ItowariState): void {
      panel.update(next);
    },
    text(): string {
      return frameEl.textContent ?? '';
    },
    button(label: string): HTMLButtonElement | undefined {
      return Array.from(frameEl.querySelectorAll('button')).find((b) => b.textContent === label);
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

afterEach(() => {
  document.body.textContent = '';
});

/** 数字キーを順に押す */
function typeDigits(h: Harness, digits: string): void {
  for (const d of digits) h.button(d)!.click();
}

describe('糸割り panel PU-16c (操作欄)', () => {
  it('5. 依頼書と手伝いが出る。「電卓」「巻き始める」が 1 つの行に並ぶ。電卓を押すと onCalculator が呼ばれる', () => {
    const h = make(p1);
    expect(h.text()).toContain('チーズ 6 個');
    const calc = h.button('電卓');
    expect(calc).toBeDefined();
    const row = h.host.querySelector('.itowari-panel__actions')!;
    expect(Array.from(row.children).map((b) => b.textContent)).toEqual(['電卓', '巻き始める']);
    calc!.click();
    expect(h.calcOpened()).toBe(1);
    expect(h.notices.length).toBe(0);
  });

  it('6. 長さを増減する 6 つのボタン (−1000〜+1000) と「N番の口:…」の大きな表示、「1つ目」「継ぐ糸」の切り替えは無い', () => {
    let s = init(p1);
    s = mounted(s, p1, 0, 6000);
    const h = make(p1, s);
    h.panel.select(0);
    h.set(s);
    for (const label of ['−1000', '−100', '−10', '+10', '+100', '+1000', 'ほかの口にも同じ長さ']) {
      expect(h.button(label), label).toBeUndefined();
    }
    expect(h.host.querySelector('.itowari-panel__keys')).toBeNull();
    expect(h.host.querySelector('.itowari-panel__length')).toBeNull();
    expect(h.text()).not.toContain('番の口:');
    expect(h.host.querySelector('.choice')).toBeNull();
  });

  it('7. 長さの数字を押す (openLength) とテンキーの重ね表示が開く。数字キー 0〜9・「消す」・「決定」。入れた値が 10m 単位に丸まって口に入る', () => {
    let s = init(p1);
    s = mounted(s, p1, 0, 6000);
    const h = make(p1, s);
    h.panel.openLength(0, 0);
    const sheet = h.frameEl.querySelector('.sheet')!;
    expect(sheet).not.toBeNull();
    for (const d of '0123456789') expect(h.button(d), d).toBeDefined();
    expect(h.button('消す')).toBeDefined();
    expect(h.button('決定')).toBeDefined();
    expect(sheet.querySelector('.itowari-numpad__value')!.textContent).toBe('6,000 m'); // 今の長さ
    typeDigits(h, '6004');
    expect(sheet.querySelector('.itowari-numpad__value')!.textContent).toBe('6,004 m');
    h.actions.length = 0;
    h.button('決定')!.click();
    expect(h.actions).toEqual([{ type: 'setLength', spindle: 0, slot: 0, lengthM: 6000 }]); // 10m 単位に丸める
    expect(h.frameEl.querySelector('.sheet')).toBeNull();
  });

  it('8. 「消す」で 1 桁戻る。入れ始めたら前の値は消える。5 桁より先は入らない。何も入れずに「決定」しても何も変えない', () => {
    let s = init(p1);
    s = mounted(s, p1, 0, 6000);
    const h = make(p1, s);
    h.panel.openLength(0, 0);
    const value = (): string => h.frameEl.querySelector('.itowari-numpad__value')!.textContent!;
    typeDigits(h, '1234');
    h.button('消す')!.click();
    expect(value()).toBe('123 m');
    typeDigits(h, '4567');
    expect(value()).toBe('12,345 m'); // 5 桁まで
    h.actions.length = 0;
    h.button('決定')!.click();
    expect(h.actions).toEqual([{ type: 'setLength', spindle: 0, slot: 0, lengthM: 12350 }]); // 論理側が 10,000 までに収める
    h.panel.openLength(0, 0);
    h.actions.length = 0;
    h.button('決定')!.click();
    expect(h.actions).toHaveLength(0);
  });

  it('9. 継ぐ糸の長さ (slot 1) を入れられる', () => {
    let s = init(p1);
    s = mounted(s, p1, 0, 4200, 0);
    s = reduce(s, { type: 'mount', spindle: 0, sourceId: p1.sources[1]!.id, slot: 1 }, p1);
    s = reduce(s, { type: 'setLength', spindle: 0, slot: 1, lengthM: 1800 }, p1);
    const h = make(p1, s);
    h.panel.openLength(0, 1);
    expect(h.frameEl.querySelector('.itowari-numpad__value')!.textContent).toBe('1,800 m');
    typeDigits(h, '900');
    h.actions.length = 0;
    h.button('決定')!.click();
    expect(h.actions).toEqual([{ type: 'setLength', spindle: 0, slot: 1, lengthM: 900 }]);
  });

  it('10. テンキーの中の「ほかの口にも同じ長さ」で、入れた長さをかけた口すべてに入れて閉じる', () => {
    let s = init(p1);
    s = mounted(s, p1, 0, 6000);
    s = mounted(s, p1, 1, 0);
    s = mounted(s, p1, 2, 0);
    const h = make(p1, s);
    h.panel.openLength(0, 0);
    typeDigits(h, '5500');
    h.actions.length = 0;
    h.button('ほかの口にも同じ長さ')!.click();
    const sets = h.actions.filter((x) => x.type === 'setLength') as Extract<ItowariAction, { type: 'setLength' }>[];
    expect(sets.map((x) => x.spindle).sort()).toEqual([0, 1, 2]);
    for (const x of sets) {
      expect(x.lengthM).toBe(5500);
      expect(x.slot).toBe(0);
    }
    expect(h.frameEl.querySelector('.sheet')).toBeNull();
  });

  it('11. 糸がかかっていない口の長さは入れられない (理由が出てテンキーは開かない)。電卓で出した値は、選んでいる口に入る (10m 単位)', () => {
    const h = make(p1, init(p1));
    h.panel.openLength(3, 0);
    expect(h.frameEl.querySelector('.sheet')).toBeNull();
    expect(h.notices.length).toBe(1);
    let s = init(p1);
    s = mounted(s, p1, 2, 6000);
    const h2 = make(p1, s);
    h2.panel.select(2);
    h2.actions.length = 0;
    h2.panel.setLength(5504);
    expect(h2.actions).toEqual([{ type: 'setLength', spindle: 2, slot: 0, lengthM: 5500 }]);
  });

  it('12. 「巻き始める」は、かけた口のどれかに長さが無いと押せない形 (理由が出る)。そろえば押せる', () => {
    let s = init(p1);
    s = mounted(s, p1, 0, 6000);
    s = mounted(s, p1, 1, 0); // 長さが無い口
    const h = make(p1, s);
    const start = h.button('巻き始める')!;
    expect(start.getAttribute('aria-disabled')).toBe('true');
    start.click();
    expect(h.notices.length).toBeGreaterThan(0);
    expect(h.actions).toHaveLength(0);
    s = reduce(s, { type: 'setLength', spindle: 1, slot: 0, lengthM: 6000 }, p1);
    h.set(s);
    expect(start.getAttribute('aria-disabled')).toBeNull();
    h.actions.length = 0;
    start.click();
    expect(h.actions).toContainEqual({ type: 'start' });
  });

  it('13. 巻いているあいだは、電卓・巻き始める・長さの入力が押せない (押すと理由「巻いています」)', () => {
    let s = init(p1);
    s = mounted(s, p1, 0, 6000);
    s = reduce(s, { type: 'start' }, p1);
    s = reduce(s, { type: 'tick', dtMs: 1000 }, p1);
    const h = make(p1, s);
    h.actions.length = 0;
    for (const label of ['電卓', '巻き始める']) {
      const b = h.button(label)!;
      b.click();
      expect(b.getAttribute('aria-disabled')).toBe('true');
    }
    h.panel.openLength(0, 0);
    expect(h.frameEl.querySelector('.sheet')).toBeNull();
    expect(h.actions).toHaveLength(0);
    expect(h.notices).toContain('巻いています');
  });

  it('14. 元の糸の箱は段ボールの箱の帯 (クリール立てと同じ .creel-box)。かけた糸・使い切った糸は箱に無い。箱は「糸 N」と糸の絵。押す・引っぱる元として data-source を持つ', () => {
    let s = init(p1);
    s = mounted(s, p1, 0, 6000);
    const h = make(p1, s);
    const boxes = Array.from(h.host.querySelectorAll<HTMLElement>('.creel-boxes .creel-box'));
    expect(boxes).toHaveLength(5); // 6 個のうち 1 個は口にかかっている
    expect(boxes.map((b) => b.dataset.source)).not.toContain(p1.sources[0]!.id);
    expect(boxes[0]!.textContent).toBe('糸 2');
    expect(boxes[0]!.querySelector('.creel-box__cheese')).not.toBeNull();
    s = reduce(s, { type: 'unmount', spindle: 0, slot: 0 }, p1);
    h.set(s);
    expect(h.host.querySelectorAll('.creel-boxes .creel-box')).toHaveLength(6); // 外すと箱へ戻る
  });

  it('15. 箱の帯の専用スクロールバー (クリール立てと同じ部品): 縦長は帯の下に横、横長は帯の右に縦。収まるときは出ない。回すと向きが変わる', async () => {
    const measure = (boxes: HTMLElement, view: number, total: number, axis: 'x' | 'y'): void => {
      const [v, t, p] = axis === 'x' ? ['clientWidth', 'scrollWidth', 'scrollLeft'] : ['clientHeight', 'scrollHeight', 'scrollTop'];
      Object.defineProperty(boxes, v!, { configurable: true, value: view });
      Object.defineProperty(boxes, t!, { configurable: true, value: total });
      Object.defineProperty(boxes, p!, { configurable: true, writable: true, value: 0 });
    };
    const h = make(p1, init(p1), 'portrait');
    const boxes = h.host.querySelector<HTMLElement>('.creel-boxes')!;
    measure(boxes, 300, 900, 'x');
    h.set(init(p1));
    const bar = h.host.querySelector<HTMLElement>('.scrollbar')!;
    expect(bar.classList.contains('scrollbar--x')).toBe(true);
    expect(bar.hidden).toBe(false);
    expect(boxes.nextElementSibling).toBe(bar);
    measure(boxes, 300, 300, 'x');
    h.set(init(p1));
    expect(h.host.querySelector<HTMLElement>('.scrollbar')!.hidden).toBe(true);
    measure(boxes, 200, 600, 'y');
    h.frameEl.dataset.layout = 'landscape';
    await Promise.resolve();
    await Promise.resolve();
    expect(h.host.querySelector('.scrollbar--x')).toBeNull();
    expect(h.host.querySelector('.scrollbar--y')).not.toBeNull();
    h.panel.destroy();
    expect(document.querySelector('.scrollbar')).toBeNull();
  });

  it('16. base.css: テンキーのキーは 64px 以上。依頼書の字は 24px 以上', () => {
    const css = readFileSync('src/styles/base.css', 'utf8');
    const key = css.match(/\.itowari-numpad__key\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(key.match(/min-height:\s*(\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(64);
    expect(parseInt(key.match(/min-width:\s*(\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(64);
    const order = css.match(/\.itowari-panel__order\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(order.match(/font-size:\s*(\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(24);
  });
});

describe('糸割り panel PU-16c (低い横長: 依頼書は重ね表示)', () => {
  it('17. 横長の詰めた形では、依頼書と手伝いは操作欄に出さず、「依頼書」ボタン (電卓・巻き始めると同じ行の左端) から重ね表示で見る。縦長では操作欄に出て、ボタンは無い', () => {
    const land = make(p1, init(p1), 'landscape');
    const row = land.host.querySelector('.itowari-panel__actions')!;
    expect(Array.from(row.children).map((b) => b.textContent)).toEqual(['依頼書', '電卓', '巻き始める']);
    expect(land.host.querySelector<HTMLElement>('.itowari-panel__order')!.hidden).toBe(true);
    land.button('依頼書')!.click();
    const sheet = land.frameEl.querySelector('.sheet')!;
    expect(sheet.querySelector('.sheet__title')!.textContent).toBe('依頼書');
    expect(sheet.textContent).toContain('チーズ 6 個');
    land.button('依頼書')!.click(); // もう一度押しても閉じる
    expect(land.frameEl.querySelector('.sheet')).toBeNull();
    land.panel.destroy();
    const port = make(p1, init(p1), 'portrait');
    expect(port.button('依頼書')).toBeUndefined();
    expect(port.host.querySelector<HTMLElement>('.itowari-panel__order')!.hidden).toBe(false);
  });

  it('18. 回して縦長になると、「依頼書」ボタンと重ね表示は消えて、依頼書が操作欄に戻る', async () => {
    const h = make(p1, init(p1), 'landscape');
    h.button('依頼書')!.click();
    h.frameEl.dataset.layout = 'portrait';
    await Promise.resolve();
    await Promise.resolve();
    expect(h.button('依頼書')).toBeUndefined();
    expect(h.frameEl.querySelector('.sheet')).toBeNull();
    expect(h.host.querySelector<HTMLElement>('.itowari-panel__order')!.hidden).toBe(false);
  });
});
