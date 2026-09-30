import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
