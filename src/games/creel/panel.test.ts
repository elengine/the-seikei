import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCreelPanel } from './panel';
import type { CreelPanel } from './panel';
import { init, reduce } from './logic';
import type { CreelState } from './logic';
import { getContent } from '../../core/content/content';

const content = getContent();

function s2State(): CreelState {
  const puzzle = content.creelPuzzles.find((p) => p.id === 's2')!;
  return init(puzzle, content);
}

beforeEach(() => {
  document.body.textContent = '';
});

function stateOf(id: string): CreelState {
  const puzzle = content.creelPuzzles.find((p) => p.id === id)!;
  return init(puzzle, content);
}

describe('createCreelPanel', () => {
  it('s2 の状態で update すると、依頼書が2行 (W-4812 × 7、W-2200 × 1)', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.update(s2State());
    const rows = Array.from(parent.querySelectorAll('[data-testid="creel-order-row"]'));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('W-4812');
    expect(rows[0]!.textContent).toContain('× 7');
    expect(rows[1]!.textContent).toContain('W-2200');
    expect(rows[1]!.textContent).toContain('× 1');
    panel.destroy();
  });

  it('箱のボタンを押すと onAction({ type: selectBox, yarn }) が呼ばれる。選んでいる箱だけに「✓」が付く', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onAction = vi.fn();
    const panel = createCreelPanel(parent, { content, onAction });
    let s = s2State();
    panel.update(s);
    const boxes = Array.from(parent.querySelectorAll<HTMLButtonElement>('[data-testid^="creel-box-"]'));
    expect(boxes.length).toBe(2); // kon-a と shiro-a
    // kon-a が選ばれている (初期 tool)
    expect(boxes[0]!.textContent).toContain('✓');
    expect(boxes[1]!.textContent).not.toContain('✓');
    // shiro-a を押す
    boxes[1]!.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'selectBox', yarn: 'shiro-a' });
    // 状態を替えて update すると ✓ が移る
    s = reduce(s, { type: 'selectBox', yarn: 'shiro-a' });
    panel.update(s);
    const boxes2 = Array.from(parent.querySelectorAll<HTMLButtonElement>('[data-testid^="creel-box-"]'));
    expect(boxes2[0]!.textContent).not.toContain('✓');
    expect(boxes2[1]!.textContent).toContain('✓');
    panel.destroy();
  });

  it('選んでいる箱と同じ品番の依頼書の行にだけ、選択中を表すクラスが付く', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    let s = s2State();
    panel.update(s);
    const rows = Array.from(parent.querySelectorAll('[data-testid="creel-order-row"]'));
    expect(rows[0]!.className).toContain('creel-order-row--selected');
    expect(rows[1]!.className).not.toContain('creel-order-row--selected');
    // tool を shiro-a に替える
    s = reduce(s, { type: 'selectBox', yarn: 'shiro-a' });
    panel.update(s);
    const rows2 = Array.from(parent.querySelectorAll('[data-testid="creel-order-row"]'));
    expect(rows2[0]!.className).not.toContain('creel-order-row--selected');
    expect(rows2[1]!.className).toContain('creel-order-row--selected');
    panel.destroy();
  });

  it('いまの帯の並びのマスの数が rows*cols と同じ。marks の wrong の数だけ ✕ が付く', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    let s = s2State();
    s = reduce(s, { type: 'tapCell', index: 0 });
    s = reduce(s, { type: 'selectBox', yarn: 'shiro-a' });
    s = reduce(s, { type: 'tapCell', index: 1 }); // 間違い (正解は kon-a)
    s = reduce(s, { type: 'check' });
    panel.update(s);
    const cells = Array.from(parent.querySelectorAll('[data-testid^="creel-cell-"]'));
    expect(cells).toHaveLength(8); // rows 1 × cols 8
    const crosses = Array.from(parent.querySelectorAll('[data-testid^="creel-cross-"]'));
    // placed=[kon-a, shiro-a, null×6] に対し正解は [kon-a×7, shiro-a] →
    // index1 が wrong、index2〜7 が empty (index0 は正解) で ✕ は 7つ
    expect(crosses.length).toBe(7);
    expect(parent.querySelector('[data-testid="creel-cross-1"]')).not.toBeNull(); // wrong
    expect(parent.querySelector('[data-testid="creel-cross-2"]')).not.toBeNull(); // empty
    expect(parent.querySelector('[data-testid="creel-cross-0"]')).toBeNull(); // 正解は ✕ なし
    panel.destroy();
  });

  it('帯の番号は各マスのまとまり (creel-item) の中に1つずつあり、position: absolute を使っていない', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.update(s2State());
    // まとまり (番号+マスの縦並び) が placed と同じ数ある
    const items = Array.from(parent.querySelectorAll('[data-testid^="creel-item-"]'));
    expect(items).toHaveLength(8);
    // 各まとまりの中に番号が1つあり、1 始まりの番号が入っている
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const num = item.querySelector('[data-testid^="creel-num-"]');
      expect(num).not.toBeNull();
      expect(num?.textContent).toBe(String(i + 1));
      // まとまりの中にマスが1つある
      expect(item.querySelector(`[data-testid="creel-cell-${i}"]`)).not.toBeNull();
    }
    // 番号は position: absolute を使わない (CSS クラスで確かめる)
    for (const num of items.map((it) => it.querySelector('[data-testid^="creel-num-"]'))) {
      expect(num?.classList.contains('creel-num')).toBe(true);
      expect(num?.classList.contains('creel-cell__num')).toBe(false);
    }
    panel.destroy();
  });

  it('canHint が false の状態ではヒントボタンが disabled、true になると押せる', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onAction = vi.fn();
    const panel = createCreelPanel(parent, { content, onAction });
    let s = s2State();
    // 失敗を2回作って canHint を true にする
    const wrong: CreelState = { ...s, placed: ['shiro-a', 'kon-a', null, null, null, null, null, null] };
    s = reduce(wrong, { type: 'check' });
    panel.update(s);
    const hint1 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-hint"]');
    expect(hint1?.disabled).toBe(true); // checks 1回では不可
    s = reduce(s, { type: 'check' });
    panel.update(s);
    const hint2 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-hint"]');
    expect(hint2?.disabled).toBe(false);
    hint2!.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'hint' });
    panel.destroy();
  });

  it('destroy で DOM から消える', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel: CreelPanel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.update(s2State());
    expect(parent.children.length).toBeGreaterThan(0);
    panel.destroy();
    expect(parent.children.length).toBe(0);
  });

  it('setMessage で操作欄の一番上に文字が出る', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.setMessage('テストのめっせージ');
    const msg = parent.querySelector('[data-testid="creel-message"]');
    expect(msg?.textContent).toBe('テストのめっせージ');
    panel.destroy();
  });

  it('はずす・しらべる・たしかめる のボタンも onAction を呼ぶ。選んでいる道具には ✓ が付く', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onAction = vi.fn();
    const panel = createCreelPanel(parent, { content, onAction });
    let s = s2State();
    panel.update(s);
    const removeBtn = parent.querySelector<HTMLButtonElement>('[data-testid="creel-tool-remove"]');
    const inspectBtn = parent.querySelector<HTMLButtonElement>('[data-testid="creel-tool-inspect"]');
    const checkBtn = parent.querySelector<HTMLButtonElement>('[data-testid="creel-check"]');
    // 初期は箱なので ✓ は付かない
    expect(removeBtn?.textContent).not.toContain('✓');
    removeBtn!.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'selectRemove' });
    s = reduce(s, { type: 'selectRemove' });
    panel.update(s);
    const removeBtn2 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-tool-remove"]');
    expect(removeBtn2?.textContent).toContain('✓');
    inspectBtn!.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'selectInspect' });
    checkBtn!.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'check' });
    panel.destroy();
  });

  describe('追加修正2: 依頼書を「1リピート分 + くりかえし N 回」で表示', () => {


    function render(id: string): { parent: HTMLElement; panel: ReturnType<typeof createCreelPanel> } {
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const panel = createCreelPanel(parent, { content, onAction: () => undefined });
      panel.update(stateOf(id));
      return { parent, panel };
    }

    it('s5: 依頼書の行が4つ。くりかえしの行があり、「2回」と「24本」を含む', () => {
      const { parent, panel } = render('s5');
      const rows = Array.from(parent.querySelectorAll('[data-testid="creel-order-row"]'));
      expect(rows.length).toBe(4);
      const rep = parent.querySelector('[data-testid="creel-order-repeat"]');
      expect(rep).not.toBeNull();
      expect(rep?.textContent).toContain('2回');
      expect(rep?.textContent).toContain('24本');
      panel.destroy();
    });

    it('s3: 行が2つ。くりかえしの行があり、「2回」と「16本」を含む', () => {
      const { parent, panel } = render('s3');
      const rows = Array.from(parent.querySelectorAll('[data-testid="creel-order-row"]'));
      expect(rows.length).toBe(2);
      const rep = parent.querySelector('[data-testid="creel-order-repeat"]');
      expect(rep?.textContent).toContain('2回');
      expect(rep?.textContent).toContain('16本');
      panel.destroy();
    });

    it('s2: 行が2つ (W-4812 × 7、W-2200 × 1)。くりかえしの行は無い', () => {
      const { parent, panel } = render('s2');
      const rows = Array.from(parent.querySelectorAll('[data-testid="creel-order-row"]'));
      expect(rows.length).toBe(2);
      expect(parent.querySelector('[data-testid="creel-order-repeat"]')).toBeNull();
      panel.destroy();
    });

    it('s1: 行が1つ。くりかえしの行は無い', () => {
      const { parent, panel } = render('s1');
      const rows = Array.from(parent.querySelectorAll('[data-testid="creel-order-row"]'));
      expect(rows.length).toBe(1);
      expect(parent.querySelector('[data-testid="creel-order-repeat"]')).toBeNull();
      panel.destroy();
    });

    it('s5 で選んでいる箱と同じ品番の行が2つとも選択中になる', () => {
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const panel = createCreelPanel(parent, { content, onAction: () => undefined });
      panel.update(stateOf('s5'));
      const rows = Array.from(parent.querySelectorAll('[data-testid="creel-order-row"]'));
      // s5 の依頼書は unit (12本) のラン: kon-a ×5, kon-b ×1, kon-a ×5, mizu-a ×1
      const selected = rows.filter((r) => r.className.includes('creel-order-row--selected'));
      // 初期 tool は boxes[0]。s5 の箱は kon-a, kon-b, mizu-a (answer の糸 + 紛らわしい箱)。kon-a が選ばれているはず
      expect(selected.length).toBe(2);
      panel.destroy();
    });
  });

  describe('T1-10fix 追加修正3: placeBand', () => {
    function make(id: string) {
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const panel = createCreelPanel(parent, { content, onAction: () => undefined });
      panel.update(stateOf(id));
      return { parent, panel };
    }

    it('placeBand(el) で「いまの帯の並び」の区画が el の中に移る', () => {
      const { panel } = make('s1');
      const target = document.createElement('div');
      document.body.appendChild(target);
      panel.placeBand(target);
      const band = target.querySelector('[data-testid="creel-band"]');
      expect(band).not.toBeNull();
      panel.destroy();
    });

    it('placeBand(null) で元の位置 (操作欄) に戻る', () => {
      const { parent, panel } = make('s1');
      const target = document.createElement('div');
      document.body.appendChild(target);
      panel.placeBand(target);
      panel.placeBand(null);
      expect(parent.querySelector('[data-testid="creel-band"]')).not.toBeNull();
      expect(target.querySelector('[data-testid="creel-band"]')).toBeNull();
      panel.destroy();
    });

    it('移しても帯の番号の構造は変わらない (creel-item のまとまりに番号が1つ)', () => {
      const { panel } = make('s2');
      const target = document.createElement('div');
      document.body.appendChild(target);
      panel.placeBand(target);
      const band = target.querySelector('[data-testid="creel-band"]')!;
      const items = Array.from(band.querySelectorAll('.creel-item'));
      expect(items.length).toBe(8); // s2 は 8本
      for (const item of items) {
        expect(item.querySelectorAll('.creel-num').length).toBe(1);
      }
      panel.destroy();
    });

    it('destroy で移した先 (el) からも消える', () => {
      const { panel } = make('s1');
      const target = document.createElement('div');
      document.body.appendChild(target);
      panel.placeBand(target);
      panel.destroy();
      expect(target.querySelector('[data-testid="creel-band"]')).toBeNull();
    });
  });
});
