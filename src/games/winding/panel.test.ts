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
    panel = createWindingPanel(document.body, { terms, range: { min: 30, max: 70 }, onAction });
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
    let w = reduce(s, { type: 'start' });
    panel.update(w);
    expect(root.className).not.toContain('disabled');
    void w;
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
