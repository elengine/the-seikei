import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCreelPanel } from './panel';
import type { CreelPanel } from './panel';
import { init, reduce } from './logic';
import type { CreelState } from './logic';
import { getContent } from '../../core/content/content';
import { ORDER_RANGE_MAX_STAGE } from './params';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

  it('canHint が false の状態ではヒントボタンが押せない形 (btn--locked。disabled は付けない)、true になると押せる', () => {
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
    expect(hint1?.classList.contains('btn--locked')).toBe(true); // checks 1回では不可
    expect(hint1?.hasAttribute('disabled')).toBe(false);
    s = reduce(s, { type: 'check' });
    panel.update(s);
    const hint2 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-hint"]');
    expect(hint2?.classList.contains('btn--locked')).toBe(false);
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

  it('PU-07b: 「立てる・外す・調べる」の切り替えは無い。確認するのボタンは onAction を呼ぶ', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onAction = vi.fn();
    const panel = createCreelPanel(parent, { content, onAction });
    panel.update(s2State());
    expect(parent.querySelector('.choice')).toBeNull();
    expect(parent.querySelector('[data-testid="creel-tool-place"]')).toBeNull();
    expect(parent.querySelector('[data-testid="creel-tool-remove"]')).toBeNull();
    expect(parent.querySelector('[data-testid="creel-tool-inspect"]')).toBeNull();
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-check"]')!.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'check' });
    panel.destroy();
  });

  it('PU-07b: 箱は data-yarn を持ち、touch-action: none (引っぱっている間に画面がスクロール・拡大しない)', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.update(s2State());
    const boxes = Array.from(parent.querySelectorAll<HTMLElement>('.creel-box'));
    expect(boxes.map((b) => b.dataset.yarn)).toEqual(['kon-a', 'shiro-a']);
    panel.destroy();
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const m = css.match(/\.btn\.creel-box\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('touch-action: none');
    const stage = css.match(/\.game-frame__stage canvas\s*\{([^}]*)\}/);
    expect(stage![1]).toContain('touch-action: none');
  });

  it('PU-05b: 「確認する」は primary で、操作欄の一番下の右。「ヒント」はその左 (secondary)', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.update(s2State());
    const actions = parent.querySelector('.creel-actions')!;
    expect(actions).toBe(parent.querySelector('.creel-panel')!.lastElementChild);
    const kids = Array.from(actions.children) as HTMLElement[];
    expect(kids[kids.length - 1]!.getAttribute('data-testid')).toBe('creel-check');
    expect(kids[kids.length - 1]!.classList.contains('btn--primary')).toBe(true);
    expect(kids[0]!.getAttribute('data-testid')).toBe('creel-hint');
    expect(kids[0]!.classList.contains('btn--secondary')).toBe(true);
    panel.destroy();
  });

  it('PU-05b: ヒントが使えないとき、押すと理由が出て、onAction は呼ばれない。理由は message の欄に出る', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onAction = vi.fn();
    const msg = document.createElement('div');
    document.body.appendChild(msg);
    const panel = createCreelPanel(parent, { content, onAction, message: msg });
    panel.update(s2State());
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-hint"]')!.click();
    expect(msg.textContent).toBe('2回確認すると使えます');
    expect(onAction).not.toHaveBeenCalled();
    panel.destroy();
  });

  it('PU-05b: 節の見出しは「依頼書」「糸の箱」。「現在の帯の並び」は無い', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.update(s2State());
    const heads = Array.from(parent.querySelectorAll('.section-heading')).map((h) => h.textContent);
    expect(heads).toEqual(['依頼書', '糸の箱']);
    expect(parent.querySelector('[data-testid="creel-band"]')).toBeNull();
    expect(parent.textContent).not.toContain('現在の帯の並び');
    expect(parent.querySelector('.creel-box')!.classList.contains('btn')).toBe(true);
    panel.destroy();
  });

  it('PU-05b: 選んでいる箱は aria-pressed=true', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.update(s2State());
    const boxes = Array.from(parent.querySelectorAll<HTMLButtonElement>('.creel-box'));
    expect(boxes[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(boxes[1]!.getAttribute('aria-pressed')).toBe('false');
    panel.destroy();
  });

  describe('PU-05b: 依頼書の各行に何本目かを書き添える (段階1〜3だけ)', () => {
    function rowsOf(id: string): { rows: string[]; repeat: string | null } {
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const panel = createCreelPanel(parent, { content, onAction: () => undefined });
      panel.update(stateOf(id));
      const rows = Array.from(parent.querySelectorAll('[data-testid="creel-order-row"]')).map((r) => r.textContent ?? '');
      const repeat = parent.querySelector('[data-testid="creel-order-repeat"]')?.textContent ?? null;
      panel.destroy();
      return { rows, repeat };
    }

    it('ORDER_RANGE_MAX_STAGE は 3', () => {
      expect(ORDER_RANGE_MAX_STAGE).toBe(3);
    });

    it('段階1 (s1): 「(1〜6本目)」。段階2 (s2): 「(1〜7本目)」と「(8本目)」', () => {
      expect(rowsOf('s1').rows[0]).toContain('(1〜6本目)');
      const s2 = rowsOf('s2').rows;
      expect(s2[0]).toContain('(1〜7本目)');
      expect(s2[1]).toContain('(8本目)');
      expect(s2[1]).not.toContain('〜');
    });

    it('段階3 (s3): 1リピート分の行に番号が付き、くりかえしの行に「(N本目から同じ並びを M 回)」', () => {
      const { rows, repeat } = rowsOf('s3');
      expect(rows).toHaveLength(2);
      const puzzle = content.creelPuzzles.find((p) => p.id === 's3')!;
      const unitLen = (puzzle.rows * puzzle.cols) / 2; // s3 は 2 回くりかえし
      expect(rows[0]).toContain('(1');
      expect(rows[rows.length - 1]).toContain(`${unitLen}本目)`);
      expect(repeat).toContain('↻ 繰り返し × 2');
      expect(repeat).toContain(`(${unitLen + 1}本目から同じ並びを 1 回)`);
    });

    it('段階4 (s4)・段階5 (s5) では出さない', () => {
      for (const id of ['s4', 's5']) {
        const { rows, repeat } = rowsOf(id);
        for (const r of rows) {
          expect(r, `${id} の行`).not.toContain('本目');
        }
        expect(repeat ?? '', `${id} のくりかえし`).not.toContain('本目');
      }
    });
  });

  describe('追加修正2: 依頼書を「1リピート分 + くりかえし N 回」で表示', () => {


    function render(id: string): { parent: HTMLElement; panel: ReturnType<typeof createCreelPanel> } {
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const panel = createCreelPanel(parent, { content, onAction: () => undefined });
      panel.update(stateOf(id));
      return { parent, panel };
    }

    it('s5: 依頼書の行が4つ。くりかえしの行があり、「くりかえし」「× 2」を含む(期待値変更の理由: 管理者の指示で文言を変えたため)', () => {
      const { parent, panel } = render('s5');
      const rows = Array.from(parent.querySelectorAll('[data-testid="creel-order-row"]'));
      expect(rows.length).toBe(4);
      const rep = parent.querySelector('[data-testid="creel-order-repeat"]');
      expect(rep).not.toBeNull();
      // 期待値を変えた理由: 確認役が文字を変えたため (「(ぜんぶで M本)」を外した)
      expect(rep?.textContent).toBe('↻ 繰り返し × 2');
      panel.destroy();
    });

    it('s3: 行が2つ。くりかえしの行が「↻ くりかえし × 2」(期待値変更の理由: 管理者の指示で文言を変えたため)', () => {
      const { parent, panel } = render('s3');
      const rows = Array.from(parent.querySelectorAll('[data-testid="creel-order-row"]'));
      expect(rows.length).toBe(2);
      const rep = parent.querySelector('[data-testid="creel-order-repeat"]');
      // 段階3 は何本目かを書き添える (PU-05b)。文頭は今までどおり
      expect(rep?.textContent?.startsWith('↻ 繰り返し × 2')).toBe(true);
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

  describe('追加修正4 B: メッセージ欄を1つにする・くりかえしの行を短くする', () => {
    it('message を渡すと、setMessage の文字がその要素に入り、creel-panel__message は作らない', () => {
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const frameMessage = document.createElement('div');
      frameMessage.classList.add('game-frame__message');
      document.body.appendChild(frameMessage);
      const panel = createCreelPanel(parent, { content, onAction: () => undefined, message: frameMessage });
      panel.setMessage('こんにちは');
      expect(frameMessage.textContent).toBe('こんにちは');
      expect(parent.querySelector('.creel-panel__message')).toBeNull();
      panel.destroy();
    });

    it('message を渡さないときは、今までどおり creel-panel__message に書く', () => {
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const panel = createCreelPanel(parent, { content, onAction: () => undefined });
      panel.setMessage('こんにちは');
      const msg = parent.querySelector('.creel-panel__message');
      expect(msg?.textContent).toBe('こんにちは');
      panel.destroy();
    });

    it('s5 のくりかえしの行が「くりかえし」と「× 2」を含む (短い文字。期待値変更の理由: 管理者の指示で文言を変えたため)', () => {
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const panel = createCreelPanel(parent, { content, onAction: () => undefined });
      panel.update(stateOf('s5'));
      const rep = parent.querySelector('[data-testid="creel-order-repeat"]');
      expect(rep).not.toBeNull();
      // 期待値を変えた理由: 確認役が文字を変えたため (追加修正5)
      expect(rep?.textContent).toBe('↻ 繰り返し × 2');
      panel.destroy();
    });
  });
});

describe('T1-20: ヒントボタンの文字に条件を出す', () => {
  it('最初は「ヒント(あと 2 回)」で押せない。1回確認して ✕ があると「ヒント(あと 1 回)」。2回で「ヒント」になり押せる', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onAction = vi.fn();
    const panel = createCreelPanel(parent, { content, onAction });
    let s = s2State();
    // 最初 (checks 0)
    panel.update(s);
    const hint0 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-hint"]')!;
    expect(hint0.textContent).toBe('ヒント(あと 2 回)');
    expect(hint0.classList.contains('btn--locked')).toBe(true);
    // 1回確認 (✕ が出る)
    const wrong: CreelState = { ...s, placed: ['shiro-a', 'kon-a', null, null, null, null, null, null] };
    s = reduce(wrong, { type: 'check' });
    panel.update(s);
    expect(hint0.textContent).toBe('ヒント(あと 1 回)');
    expect(hint0.classList.contains('btn--locked')).toBe(true);
    // 2回確認 → 使える
    s = reduce(s, { type: 'check' });
    panel.update(s);
    expect(hint0.textContent).toBe('ヒント');
    expect(hint0.classList.contains('btn--locked')).toBe(false);
    panel.destroy();
  });
});

describe('PU-06a: 依頼書の行と箱に紙の芯の色を出す', () => {
  it('依頼書の行と箱に「芯:赤」のような名前と、16px の丸が出る', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.update(stateOf('s2'));
    const kon = content.yarns.get('kon-a')!;
    const coreName = content.cores.get(kon.core)!.name;
    const row = parent.querySelector('[data-testid="creel-order-row"]')!;
    expect(row.textContent).toContain(`芯:${coreName}`);
    expect(row.querySelector('.core-dot')).not.toBeNull();
    const box = parent.querySelector('.creel-box')!;
    expect(box.textContent).toContain(`芯:${coreName}`);
    const dot = box.querySelector<HTMLElement>('.core-dot')!;
    expect(dot.style.background).not.toBe('');
    panel.destroy();
  });
});
