import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWindingPanel } from './panel';
import type { WindingAction } from './logic';
import { init, reduce } from './logic';
import type { WindingState } from './logic';

const terms = { t: (k: string) => (k === 'pedal' ? 'ペダル' : k === 'tension' ? '張り' : k) };

/** 'cutting' まで進めた状態 */
function cuttingState(): WindingState {
  let s = init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 });
  s = reduce(s, { type: 'start' });
  s = reduce(s, { type: 'setPedal', value: 50 });
  for (let i = 0; i < 300 && s.phase === 'winding'; i++) {
    s = reduce(s, { type: 'tick', dtMs: 100 });
  }
  return s;
}

describe('winding panel (T2-06)', () => {
  let onAction: ReturnType<typeof vi.fn<(a: WindingAction) => void>>;
  let panel: ReturnType<typeof createWindingPanel>;

  beforeEach(() => {
    document.body.innerHTML = '';
    onAction = vi.fn();
    panel = createWindingPanel(document.body, { terms, onAction });
  });

  afterEach(() => {
    panel.destroy();
  });

  it("1. 'ready' で「巻き始める」があり、押すと start", () => {
    const s = init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 });
    panel.update(s);
    const btn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === '巻き始める');
    expect(btn).toBeDefined();
    btn!.click();
    expect(onAction).toHaveBeenLastCalledWith({ type: 'start' });
  });

  it("2. 'cutting' で「帯の端を結ぶ」があり、押すと cut", () => {
    panel.update(cuttingState());
    const btn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === '帯の端を結ぶ');
    expect(btn).toBeDefined();
    btn!.click();
    expect(onAction).toHaveBeenLastCalledWith({ type: 'cut' });
  });

  it("3. 'winding' 以外では、ペダルが押せない (setEnabled(false))", () => {
    const s = init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 });
    panel.update(s);
    const root = document.body.querySelector('.pedal-control')!;
    expect(root.className).toContain('disabled');
    // 'winding' なら押せる
    const w = reduce(s, { type: 'start' });
    panel.update(w);
    expect(root.className).not.toContain('disabled');
  });

  it('4. 「帯 2 / 5」の文字が current と sections に従う', () => {
    const s = init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 });
    // current 1 (2本目) の 'cutting' 状態を作る
    let cur = reduce(s, { type: 'start' });
    cur = reduce(cur, { type: 'setPedal', value: 50 });
    for (let i = 0; i < 300 && cur.phase === 'winding'; i++) {
      cur = reduce(cur, { type: 'tick', dtMs: 100 });
    }
    cur = reduce(cur, { type: 'cut' });
    panel.update(cur);
    const label = document.body.querySelector('.winding-panel__section')!;
    expect(label.textContent).toContain('帯 2 / 5');
  });

  it('5. ペダルを動かすと setPedal が渡る', () => {
    const s = init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 });
    const w = reduce(s, { type: 'start' });
    panel.update(w);
    onAction.mockClear();
    // 「踏み込む」ボタンで +10
    const plus = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === '踏み込む')!;
    plus.click();
    expect(onAction).toHaveBeenLastCalledWith({ type: 'setPedal', value: 10 });
  });

  it('6. destroy で DOM から消える', () => {
    panel.destroy();
    expect(document.body.querySelector('.winding-panel')).toBeNull();
  });
});

describe('winding panel T2-05-fix (横木が状態に合わせて戻る)', () => {
  it('ペダル 60 の状態で update したあと、ペダル 0 の状態で update すると、表示の数字が「速さ 0」になる', () => {
    document.body.innerHTML = '';
    const onAction2 = vi.fn();
    const panel2 = createWindingPanel(document.body, { terms, onAction: onAction2 });
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 });
    s = reduce(s, { type: 'start' });
    s = reduce(s, { type: 'setPedal', value: 60 });
    panel2.update(s);
    const value = document.body.querySelector('.pedal__value')!;
    expect(value.textContent).toContain('60');
    // ペダルが 0 の状態 (糸切れ・巻き終え・裏に回ったあと) で update
    const zero = reduce(s, { type: 'pausePedal' });
    panel2.update(zero);
    expect(value.textContent).toContain('0');
    panel2.destroy();
  });
});

describe('PU-05c: ドラム巻きの操作欄の並び', () => {
  function mountPanel(onNotice?: (t: string) => void): { panel: ReturnType<typeof createWindingPanel>; host: HTMLElement } {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = createWindingPanel(host, { terms, onAction: () => undefined, onNotice });
    return { panel: p, host };
  }

  it('節の見出しは「張り」「ペダル」(用語の呼び名)。一番下に主な操作 (primary)', () => {
    const { panel: p, host } = mountPanel();
    p.update(init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 }));
    expect(Array.from(host.querySelectorAll('.section-heading')).map((h) => h.textContent)).toEqual(['張り', 'ペダル']);
    const actions = host.querySelector('.winding-panel__actions')!;
    expect(actions).toBe(host.querySelector('.winding-panel')!.lastElementChild);
    for (const b of Array.from(actions.querySelectorAll('button'))) {
      expect(b.classList.contains('btn--primary')).toBe(true);
    }
    p.destroy();
  });

  it('帯の番号・巻いた長さ・経過時間が1行 (同じ要素) に入っている', () => {
    const { panel: p, host } = mountPanel();
    p.update(init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 }));
    const line = host.querySelector('.winding-panel__section')!;
    expect(line.textContent).toContain('帯 1 / 5');
    expect(line.textContent).toContain('巻いた長さ');
    expect(line.textContent).toMatch(/\d:\d\d \/ \d:\d\d/);
    expect(host.querySelector('.winding-panel__time')).toBeNull();
    p.destroy();
  });

  it('巻いていないとき、「踏み込む」「戻す」は押せない形 (disabled にしない)。押すと理由が onNotice に出る', () => {
    const notice = vi.fn();
    const { panel: p, host } = mountPanel(notice);
    p.update(init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 }));
    const plus = Array.from(host.querySelectorAll<HTMLButtonElement>('.pedal__btn')).find((b) => b.textContent === '踏み込む')!;
    expect(plus.classList.contains('btn--locked')).toBe(true);
    expect(plus.hasAttribute('disabled')).toBe(false);
    plus.click();
    expect(notice).toHaveBeenCalledTimes(1);
    expect(String(notice.mock.calls[0]![0])).toContain('巻き始める');
    // 巻いているあいだは押せる
    p.update(reduce(init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 }), { type: 'start' }));
    expect(plus.classList.contains('btn--locked')).toBe(false);
    p.destroy();
  });
});

describe('PU-09d: ドラム巻きの操作欄 (横向きのペダルと詰めた形)', () => {
  function mount(): { host: HTMLElement; p: ReturnType<typeof createWindingPanel> } {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = createWindingPanel(host, { terms, onAction: () => undefined });
    p.update(init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 }));
    return { host, p };
  }

  it('操作欄の並び: 1行の情報 → 張りのメーター → 横向きのペダル → 一番下に主な操作', () => {
    const { host, p } = mount();
    const kids = Array.from(host.querySelector('.winding-panel')!.children).map((c) => c.className.split(' ')[0]);
    expect(kids).toEqual(['winding-panel__section', 'winding-panel__block', 'winding-panel__block', 'winding-panel__actions']);
    expect(host.querySelector('.winding-panel__block .tension-meter')).not.toBeNull();
    p.destroy();
  });

  it('ペダルは横向き: 溝の左に「戻す」、右に「踏み込む」。溝は横木が左右に動く', () => {
    const { host, p } = mount();
    const row = host.querySelector('.winding-panel__pedal .pedal__row')!;
    const kids = Array.from(row.children) as HTMLElement[];
    expect(kids.map((k) => k.textContent)).toEqual(['戻す', '', '踏み込む']);
    expect(kids[1]!.classList.contains('pedal__groove')).toBe(true);
    p.destroy();
  });

  it('節 (張り・ペダル) に aria-label (見出しを詰めた形で隠しても、読み上げで分かる)', () => {
    const { host, p } = mount();
    const blocks = Array.from(host.querySelectorAll('.winding-panel__block'));
    expect(blocks.map((b) => b.getAttribute('aria-label'))).toEqual(['張り', 'ペダル']);
    p.destroy();
  });

  it('base.css: メーターは横いっぱいの 1 行 (帯 + 状態の文字)。詰めた形では節の見出しを隠して高さを使わない', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const meter = css.match(/\.tension-meter\s*\{([^}]*)\}/)![1]!;
    expect(meter).toContain('flex-direction: row');
    const band = css.match(/\.meter__band\s*\{([^}]*)\}/)![1]!;
    expect(band).toContain('flex: 1');
    expect(band).not.toContain('width: 320px');
    const head = css.match(/\.game-frame--compact \.winding-panel__block \.section-heading\s*\{([^}]*)\}/);
    expect(head![1]).toContain('display: none');
  });
});
