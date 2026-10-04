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

  it('PU-11a: 箱は段ボール箱。中に品番 (大きく) とチーズの絵 (糸の色の丸+芯の色の輪+穴) だけがあり、色名・芯の文字・✓ は無い。読み上げ用の aria-label に品番・色名・芯', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.update(s2State());
    const boxes = Array.from(parent.querySelectorAll<HTMLElement>('[data-testid^="creel-box-"]'));
    expect(boxes.length).toBe(2); // kon-a と shiro-a
    const kon = content.yarns.get('kon-a')!;
    const konColor = content.colors.get(kon.color)!;
    const konCore = content.cores.get(kon.core)!;
    const b = boxes[0]!;
    expect(b.classList.contains('creel-box')).toBe(true);
    expect(b.dataset.yarn).toBe('kon-a');
    // 文字は品番だけ。色名・芯の文字・✓ を出さない
    expect(b.textContent).toBe(kon.hinban);
    expect(b.textContent).not.toContain(konColor.name);
    expect(b.textContent).not.toContain('芯');
    expect(b.textContent).not.toContain('✓');
    expect(b.querySelector('.creel-box__hinban')!.textContent).toBe(kon.hinban);
    // チーズの絵: 糸の色の丸 + 芯の色の輪 + 穴 (盤面のチーズと同じ描き方)
    const cheese = b.querySelector<HTMLElement>('.creel-box__cheese')!;
    expect(cheese).not.toBeNull();
    expect(cheese.style.getPropertyValue('--creel-drag-body')).toBe(konColor.hex);
    expect(cheese.style.getPropertyValue('--creel-drag-core')).toBe(konCore.hex);
    expect(cheese.querySelector('.creel-drag__core')).not.toBeNull();
    expect(cheese.querySelector('.creel-drag__hole')).not.toBeNull();
    // 読み上げ用
    expect(b.getAttribute('aria-label')).toBe(`${kon.hinban} ${konColor.name} 芯:${konCore.name}`);
    panel.destroy();
  });

  it('PU-11a: 箱を押しても選ばない (onAction を呼ばない・aria-pressed を付けない・藍の塗りも無い)。どの箱も同じ見た目', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onAction = vi.fn();
    const panel = createCreelPanel(parent, { content, onAction });
    panel.update(s2State());
    const boxes = Array.from(parent.querySelectorAll<HTMLElement>('[data-testid^="creel-box-"]'));
    boxes[1]!.click();
    boxes[0]!.click();
    expect(onAction).not.toHaveBeenCalled();
    for (const b of boxes) {
      expect(b.hasAttribute('aria-pressed')).toBe(false);
      expect(b.className).not.toContain('selected');
    }
    // 状態が変わって update しても、選んだ印は付かない
    panel.update(reduce(s2State(), { type: 'selectBox', yarn: 'shiro-a' }));
    for (const b of Array.from(parent.querySelectorAll<HTMLElement>('.creel-box'))) {
      expect(b.hasAttribute('aria-pressed')).toBe(false);
      expect(b.className).not.toContain('selected');
    }
    panel.destroy();
  });

  it('PU-11a: 依頼書の行にも選んだ印 (藍の枠) は付かない', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    let s = s2State();
    panel.update(s);
    expect(parent.querySelector('.creel-order-row--selected')).toBeNull();
    s = reduce(s, { type: 'selectBox', yarn: 'shiro-a' });
    panel.update(s);
    expect(parent.querySelector('.creel-order-row--selected')).toBeNull();
    panel.destroy();
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    expect(css).not.toContain('.creel-order-row--selected');
    expect(css).not.toContain('.creel-box--selected');
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
    const m = css.match(/\n\.creel-box\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('touch-action: none');
    const stage = css.match(/\.game-frame__stage canvas\s*\{([^}]*)\}/);
    expect(stage![1]).toContain('touch-action: none');
  });

  it('PU-11a: base.css: 箱は段ボール色の地・角 6px・ふたの線 (cardboardDark)・横のテープ (cardboardTape)。チーズの絵は 48px 以上', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const box = css.match(/\n\.creel-box\s*\{([^}]*)\}/)![1]!;
    expect(box).toContain('background: var(--c-cardboard)');
    expect(box).toContain('border-radius: 6px');
    expect(css.match(/\.creel-box::before\s*\{([^}]*)\}/)![1]).toContain('var(--c-cardboard-dark)');
    expect(css.match(/\.creel-box::after\s*\{([^}]*)\}/)![1]).toContain('var(--c-cardboard-tape)');
    expect(css.match(/\n\.creel-box__hinban\s*\{([^}]*)\}/)![1]).toContain('white-space: nowrap'); // 品番は折り返さない
    const cheese = css.match(/\n\.creel-box__cheese\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(cheese.match(/width: (\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(48);
    const compact = css.match(/\.game-frame--compact \.creel-box__cheese\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(compact.match(/width: (\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(48);
  });

  it('PU-05b: 「完了」は primary で、操作欄の一番下の右。「ヒント」はその左 (secondary)', () => {
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
    expect(parent.querySelector('.creel-box')!.tagName).not.toBe('BUTTON'); // 押して選ぶ部品ではない (PU-11a)
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

describe('PU-11b: ボタンは「ヒント」と「完了」(どちらも 1 行)。ヒントの残りはメッセージで伝える', () => {
  function withMessage(): { parent: HTMLElement; msg: HTMLElement; panel: CreelPanel; onAction: ReturnType<typeof vi.fn> } {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const msg = document.createElement('div');
    document.body.appendChild(msg);
    const onAction = vi.fn();
    const panel = createCreelPanel(parent, { content, onAction, message: msg });
    return { parent, msg, panel, onAction };
  }

  it('ボタンの文字は常に「ヒント」と「完了」。ヒントの文字に回数は入らない (確認の前でも後でも)', () => {
    const { parent, panel } = withMessage();
    let s = s2State();
    panel.update(s);
    const hint = parent.querySelector<HTMLButtonElement>('[data-testid="creel-hint"]')!;
    const check = parent.querySelector<HTMLButtonElement>('[data-testid="creel-check"]')!;
    expect(hint.textContent).toBe('ヒント');
    expect(check.textContent).toBe('完了');
    const wrong: CreelState = { ...s, placed: ['shiro-a', 'kon-a', null, null, null, null, null, null] };
    s = reduce(wrong, { type: 'check' });
    panel.update(s);
    expect(hint.textContent).toBe('ヒント');
    s = reduce(s, { type: 'check' });
    panel.update(s);
    expect(hint.textContent).toBe('ヒント');
    expect(check.textContent).toBe('完了');
    panel.destroy();
  });

  it('使えないあいだの見た目は点線の枠 (btn--locked)。押すと今までの理由がメッセージに出る。2回確認して ✕ があると押せる', () => {
    const { parent, msg, panel, onAction } = withMessage();
    let s = s2State();
    panel.update(s);
    const hint = parent.querySelector<HTMLButtonElement>('[data-testid="creel-hint"]')!;
    expect(hint.classList.contains('btn--locked')).toBe(true);
    hint.click();
    expect(msg.textContent).toBe('2回確認すると使えます');
    const wrong: CreelState = { ...s, placed: ['shiro-a', 'kon-a', null, null, null, null, null, null] };
    s = reduce(wrong, { type: 'check' });
    panel.update(s);
    hint.click();
    expect(msg.textContent).toBe('あと 1 回確認すると使えます');
    expect(onAction).not.toHaveBeenCalled();
    s = reduce(s, { type: 'check' });
    panel.update(s);
    expect(hint.classList.contains('btn--locked')).toBe(false);
    panel.destroy();
  });

  it('使えるときに押すと onAction(hint) を呼び、メッセージに「ヒントを使いました。あと N 回使えます」(N = 残りの ✕ の数)', () => {
    const { parent, msg, panel, onAction } = withMessage();
    let s = s2State();
    const wrong: CreelState = { ...s, placed: ['shiro-a', 'kon-a', null, null, null, null, null, null] };
    s = reduce(wrong, { type: 'check' });
    s = reduce(s, { type: 'check' });
    const marks = s.marks!;
    const total = marks.wrong.length + marks.empty.length;
    expect(total).toBeGreaterThan(1);
    panel.update(s);
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-hint"]')!.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'hint' });
    expect(msg.textContent).toBe(`ヒントを使いました。あと ${total - 1} 回使えます`);
    panel.destroy();
  });

  it('最後の 1 つを直したときは「あと 0 回」とは言わず、「ヒントを使いました」だけ', () => {
    const { parent, msg, panel } = withMessage();
    let s = s2State();
    const almost: CreelState = { ...s, placed: [...s.answer] };
    almost.placed[0] = 'shiro-a'; // 1 か所だけ違う
    s = reduce(almost, { type: 'check' });
    s = reduce(s, { type: 'check' });
    expect(s.marks!.wrong.length + s.marks!.empty.length).toBe(1);
    panel.update(s);
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-hint"]')!.click();
    expect(msg.textContent).toBe('ヒントを使いました');
    panel.destroy();
  });
});

describe('PU-12c: 依頼書の行は「コーンの絵・型番・個数」。色名と芯の文字は出さない', () => {
  function rowsOfS2(): { parent: HTMLElement; panel: CreelPanel } {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.update(stateOf('s2'));
    return { parent, panel };
  }

  it('行の子の並びが 絵 → 型番 → 個数。絵は糸の色の丸と芯の色の輪 (箱の絵と同じ構造・同じクラス cone-icon)、aria-label は「色名 芯:色名」', () => {
    const { parent, panel } = rowsOfS2();
    const row = parent.querySelector('[data-testid="creel-order-row"]')!;
    const kids = Array.from(row.children);
    expect(kids[0]!.classList.contains('cone-icon')).toBe(true);
    expect(kids[1]!.classList.contains('creel-order-row__hinban')).toBe(true);
    expect(kids[2]!.classList.contains('creel-order-row__count')).toBe(true);
    const kon = content.yarns.get('kon-a')!;
    const color = content.colors.get(kon.color)!;
    const core = content.cores.get(kon.core)!;
    const cone = kids[0] as HTMLElement;
    expect(cone.getAttribute('aria-label')).toBe(`${color.name} 芯:${core.name}`);
    expect(cone.style.getPropertyValue('--creel-drag-body')).toBe(color.hex);
    expect(cone.style.getPropertyValue('--creel-drag-core')).toBe(core.hex);
    expect(cone.querySelector('.creel-drag__core .creel-drag__hole')).not.toBeNull();
    // 箱の絵と依頼書の絵は同じ構造 (同じ部品 coneIcon から作る)
    const boxCone = parent.querySelector('.creel-box .cone-icon')!;
    expect(boxCone.innerHTML).toBe(cone.innerHTML);
    expect(boxCone.className.split(' ')).toContain('cone-icon');
    panel.destroy();
  });

  it('行の文字に色名と「芯:」が無い。色の丸 (core-dot) も、色名の要素 (creel-order-row__color) も無い。箱の文字も品番だけ', () => {
    const { parent, panel } = rowsOfS2();
    const kon = content.yarns.get('kon-a')!;
    const row = parent.querySelector('[data-testid="creel-order-row"]')!;
    expect(row.textContent).not.toContain(content.colors.get(kon.color)!.name);
    expect(row.textContent).not.toContain('芯');
    expect(row.querySelector('.core-dot')).toBeNull();
    expect(row.querySelector('.creel-order-row__color')).toBeNull();
    expect(parent.querySelector('.creel-box')!.textContent).toBe(kon.hinban);
    panel.destroy();
  });

  it('レベル1〜3 の「(1〜7本目)」は残る (行の下の段)', () => {
    const { parent, panel } = rowsOfS2();
    expect(parent.querySelector('[data-testid="creel-order-row"]')!.textContent).toContain('(1〜7本目)');
    panel.destroy();
  });
});

describe('PU-09b: 詰めた形の操作欄 (依頼書を見る・箱の横送り)', () => {
  /** game-frame--compact の中に操作欄を作る (gameFrame が付けるクラスと data-layout を真似る) */
  function compactPanel(layout: 'portrait' | 'landscape' = 'portrait', compact = true): {
    frameEl: HTMLElement;
    parent: HTMLElement;
    panel: CreelPanel;
  } {
    const frameEl = document.createElement('div');
    frameEl.className = compact ? 'game-frame game-frame--compact' : 'game-frame';
    frameEl.dataset.layout = layout;
    document.body.appendChild(frameEl);
    const parent = document.createElement('div');
    frameEl.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.update(s2State());
    return { frameEl, parent, panel };
  }

  const tick = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  };

  it('詰めた形では「依頼書を見る」(secondary) が出て、依頼書の表は操作欄に出ない。詰めた形でなければ「依頼書を見る」は無く、表が操作欄にある', () => {
    const c = compactPanel();
    const btn = Array.from(c.parent.querySelectorAll('button')).find((b) => b.textContent === '依頼書を見る')!;
    expect(btn).toBeDefined();
    expect(btn.classList.contains('btn--secondary')).toBe(true);
    expect(c.parent.querySelector('[data-testid="creel-order-row"]')).toBeNull();
    c.panel.destroy();
    const n = compactPanel('landscape', false);
    expect(Array.from(n.parent.querySelectorAll('button')).some((b) => b.textContent === '依頼書を見る')).toBe(false);
    expect(n.parent.querySelectorAll('[data-testid="creel-order-row"]').length).toBeGreaterThan(0);
    n.panel.destroy();
  });

  it('「依頼書を見る」を押すと下から出る重ね表示が開き、依頼書の行がその中にある。× で閉じる。もう一度押しても閉じる', () => {
    const c = compactPanel();
    const btn = Array.from(c.parent.querySelectorAll('button')).find((b) => b.textContent === '依頼書を見る')!;
    btn.click();
    const sheet = c.frameEl.querySelector('.sheet')!;
    expect(sheet).not.toBeNull();
    expect(sheet.classList.contains('sheet--tall')).toBe(true); // 見出しの行の下から画面の下まで (PU-11b)
    expect(sheet.querySelector('.sheet__title')!.textContent).toBe('依頼書');
    const rows = sheet.querySelectorAll('[data-testid="creel-order-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('W-4812');
    sheet.querySelector<HTMLButtonElement>('.sheet__close')!.click();
    expect(c.frameEl.querySelector('.sheet')).toBeNull();
    // もう一度開いて、「依頼書を見る」でも閉じる
    btn.click();
    expect(c.frameEl.querySelector('.sheet')).not.toBeNull();
    btn.click();
    expect(c.frameEl.querySelector('.sheet')).toBeNull();
    c.panel.destroy();
  });

  it('重ね表示を開いたまま状態が変わっても、依頼書の行はそのまま重ね表示の中にある。destroy で重ね表示も消える', () => {
    const c = compactPanel();
    Array.from(c.parent.querySelectorAll('button')).find((b) => b.textContent === '依頼書を見る')!.click();
    c.panel.update(s2State());
    expect(c.frameEl.querySelectorAll('.sheet [data-testid="creel-order-row"]')).toHaveLength(2);
    c.panel.destroy();
    expect(c.frameEl.querySelector('.sheet')).toBeNull();
  });

  it('詰めた形から今の形に戻ると (frame のクラスが外れると)、重ね表示は閉じ、依頼書の表は操作欄に戻り、「依頼書を見る」は消える', async () => {
    const c = compactPanel();
    Array.from(c.parent.querySelectorAll('button')).find((b) => b.textContent === '依頼書を見る')!.click();
    c.frameEl.classList.remove('game-frame--compact');
    await tick();
    expect(c.frameEl.querySelector('.sheet')).toBeNull();
    expect(Array.from(c.parent.querySelectorAll('button')).some((b) => b.textContent === '依頼書を見る')).toBe(false);
    expect(c.parent.querySelectorAll('[data-testid="creel-order-row"]')).toHaveLength(2);
    // 戻ったら、また「依頼書を見る」になる
    c.frameEl.classList.add('game-frame--compact');
    await tick();
    expect(Array.from(c.parent.querySelectorAll('button')).some((b) => b.textContent === '依頼書を見る')).toBe(true);
    c.panel.destroy();
  });

  it('箱の並びの向き (data-scroll): 詰めた縦は横に送る (x)、詰めた横は縦に送る (y)、今の形は送らない (空)。回転で変わる', async () => {
    const c = compactPanel('portrait');
    const boxes = c.parent.querySelector<HTMLElement>('.creel-boxes')!;
    expect(boxes.dataset.scroll).toBe('x');
    c.frameEl.dataset.layout = 'landscape';
    await tick();
    expect(boxes.dataset.scroll).toBe('y');
    c.frameEl.classList.remove('game-frame--compact');
    await tick();
    expect(boxes.dataset.scroll).toBe('');
    c.panel.destroy();
  });

  it('base.css: 詰めた縦の箱は横一列で横に送れて (overflow-x: auto・touch-action: pan-x)、詰めた横は縦に送れる (pan-y)', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const row = css.match(/\.game-frame--compact\[data-layout='portrait'\] \.creel-boxes\s*\{([^}]*)\}/);
    expect(row![1]).toContain('flex-wrap: nowrap');
    expect(row![1]).toContain('overflow-x: auto');
    const box = css.match(/\.game-frame--compact\[data-layout='portrait'\] \.creel-box\s*\{([^}]*)\}/);
    expect(box![1]).toContain('touch-action: pan-x');
    expect(box![1]).toContain('min-width: 0'); // 絵と型番に合わせて狭く (PU-12d)
    const col = css.match(/\.game-frame--compact\[data-layout='landscape'\] \.creel-box\s*\{([^}]*)\}/);
    expect(col![1]).toContain('touch-action: pan-y');
    // 詰めた横 (高さ 560px 未満): 箱は品番とチーズを横並びにして、高さを 72px 程度に (PU-10 追記)
    expect(col![1]!).toContain('flex-direction: row');
    expect(col![1]!).toContain('justify-content: center');
    const pad = col![1]!.match(/padding: (\d+)px var\(--sp-2\) (\d+)px/)!;
    const cheese = parseInt(css.match(/\.game-frame--compact \.creel-box__cheese\s*\{[^}]*width: (\d+)px/)![1]!, 10);
    expect(cheese).toBeGreaterThanOrEqual(48);
    expect(parseInt(pad[1]!, 10) + cheese + parseInt(pad[2]!, 10) + 4).toBeLessThanOrEqual(84); // 縁 2px×2 を含めた高さ
  });
});

describe('PU-11b: 依頼書の行の文字の大きさ (PU-12c で型番を控えめに)', () => {
  it('base.css: 絵は 40px 以上・型番は 20px のふつうの太さで薄め (sumi-sub)・個数「× N」は 32px 以上 (fs-number) の太字', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const hinban = css.match(/\n\.creel-order-row__hinban\s*\{([^}]*)\}/)![1]!;
    expect(hinban).toContain('font-size: 20px');
    expect(hinban).toContain('font-weight: normal');
    expect(hinban).toContain('color: var(--c-sumi-sub)');
    const cone = css.match(/\n\.creel-order-row \.cone-icon\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(cone.match(/width: (\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(40);
    const count = css.match(/\n\.creel-order-row__count\s*\{([^}]*)\}/)![1]!;
    expect(count).toContain('font-size: var(--fs-number)');
    expect(count).toContain('font-weight: bold');
    // fs-number の既定 (段階1) は 32px
    expect(css).toMatch(/--fs-number: 32px/);
  });

  it('base.css: 依頼書の行は狭い操作欄 (文字の段階5・幅 280px) でも右にはみ出さない。折り返す行 (flex-wrap)、個数は右端 (margin-left: auto)、下の段は行いっぱい', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const row = css.match(/\n\.creel-order-row\s*\{([^}]*)\}/)![1]!;
    expect(row).toContain('display: flex');
    expect(row).toContain('flex-wrap: wrap');
    expect(css.match(/\n\.creel-order-row__hinban\s*\{([^}]*)\}/)![1]).toContain('white-space: nowrap');
    expect(css.match(/\n\.creel-order-row__count\s*\{([^}]*)\}/)![1]).toContain('margin-left: auto');
    expect(css.match(/\n\.creel-order-row__sub\s*\{([^}]*)\}/)![1]).toContain('flex: 1 0 100%');
  });

  it('base.css: 「ヒント」「完了」は狭い操作欄 (幅 約 260px・文字の段階5) でも並ぶ: ヒント最小 120px + 隙間 12px + 完了最小 100px が 260px に収まる', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    expect(css.match(/\n\.creel-actions__check\s*\{([^}]*)\}/)![1]).toContain('min-width: 100px');
    expect(css.match(/\n\.creel-actions\s*\{([^}]*)\}/)![1]).toContain('gap: var(--sp-3)');
    expect(120 + 12 + 100).toBeLessThanOrEqual(260);
  });

  it('個数の要素は「× N」で、クラス creel-order-row__count を持つ (繰り返しの行ではない)', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.update(s2State());
    const counts = Array.from(parent.querySelectorAll('.creel-order-row__count')).map((c) => c.textContent);
    expect(counts).toEqual(['× 7', '× 1']);
    panel.destroy();
  });
});

describe('PU-12d: 箱の並び (縦長は絵の下に型番、横長は 2 列で絵の右に型番)・お知らせ', () => {
  it('箱の子の並びは 絵 → 型番。型番は 20px のふつうの太さ (段階が上がっても 20px より小さくしない)', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.update(s2State());
    const kids = Array.from(parent.querySelector('.creel-box')!.children);
    expect(kids[0]!.classList.contains('cone-icon')).toBe(true);
    expect(kids[1]!.classList.contains('creel-box__hinban')).toBe(true);
    panel.destroy();
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const hin = css.match(/\n\.creel-box__hinban\s*\{([^}]*)\}/)![1]!;
    expect(hin).toContain('font-size: 20px');
    expect(hin).toContain('font-weight: normal');
    expect(hin).toContain('letter-spacing: -0.04em'); // 入らないときは字間を詰める
  });

  it('base.css: 縦長は箱が縦並び (flex-direction: column) で幅は絵と型番に合わせて狭く (最小幅 0)、横長は箱が横並び (row) で、帯が 2 列の格子', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const base = css.match(/\n\.creel-box\s*\{([^}]*)\}/)![1]!;
    expect(base).toContain('flex-direction: column');
    const pBox = css.match(/\.game-frame--compact\[data-layout='portrait'\] \.creel-box\s*\{([^}]*)\}/)![1]!;
    expect(pBox).toContain('min-width: 0');
    expect(pBox).not.toContain('min-width: 120px');
    const lBox = css.match(/\.game-frame--compact\[data-layout='landscape'\] \.creel-box\s*\{([^}]*)\}/)![1]!;
    expect(lBox).toContain('flex-direction: row');
    const lBoxes = css.match(/\.game-frame--compact\[data-layout='landscape'\] \.creel-boxes\s*\{([^}]*)\}/)![1]!;
    expect(lBoxes).toContain('display: grid');
    expect(lBoxes).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
  });

  it('notify を渡すと、ヒントが使えないときに押した理由と、ヒントを使ったあとの残りが notify に出る。メッセージ欄 (creel-panel__message) は作らない', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const notify = vi.fn();
    const panel = createCreelPanel(parent, { content, onAction: () => undefined, notify });
    expect(parent.querySelector('.creel-panel__message')).toBeNull();
    let s = s2State();
    panel.update(s);
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-hint"]')!.click();
    expect(notify).toHaveBeenLastCalledWith('2回確認すると使えます');
    const wrong: CreelState = { ...s, placed: ['shiro-a', 'kon-a', null, null, null, null, null, null] };
    s = reduce(reduce(wrong, { type: 'check' }), { type: 'check' });
    panel.update(s);
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-hint"]')!.click();
    const total = s.marks!.wrong.length + s.marks!.empty.length;
    expect(notify).toHaveBeenLastCalledWith(`ヒントを使いました。あと ${total - 1} 回使えます`);
    panel.destroy();
  });
});

describe('PU-12 追加修正: 詰めた横 (915×412) でスクロールを無くす', () => {
  function compactPanel(layout: 'portrait' | 'landscape'): { frameEl: HTMLElement; parent: HTMLElement; panel: CreelPanel } {
    const frameEl = document.createElement('div');
    frameEl.className = 'game-frame game-frame--compact';
    frameEl.dataset.layout = layout;
    document.body.appendChild(frameEl);
    const parent = document.createElement('div');
    frameEl.appendChild(parent);
    const panel = createCreelPanel(parent, { content, onAction: () => undefined });
    panel.update(s2State());
    return { frameEl, parent, panel };
  }
  const tick = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  };
  const orderBtn = (root: HTMLElement): HTMLButtonElement =>
    Array.from(root.querySelectorAll('button')).find((b) => b.textContent === '依頼書を見る')!;

  it('詰めた横では「依頼書を見る」が「ヒント」「完了」と同じ行 (.creel-actions) の左端に並ぶ。縦では今までどおり依頼書の節に置く。回すと移る', async () => {
    const c = compactPanel('landscape');
    const actions = c.parent.querySelector('.creel-actions')!;
    expect(orderBtn(c.parent).parentElement).toBe(actions);
    expect(Array.from(actions.children).map((b) => b.textContent)).toEqual(['依頼書を見る', 'ヒント', '完了']);
    c.frameEl.dataset.layout = 'portrait';
    await tick();
    expect(orderBtn(c.parent).parentElement).not.toBe(actions);
    expect(Array.from(actions.children).map((b) => b.textContent)).toEqual(['ヒント', '完了']);
    c.frameEl.dataset.layout = 'landscape';
    await tick();
    expect(orderBtn(c.parent).parentElement).toBe(actions);
    // 行に移ったあとも押せて、重ね表示が開く
    orderBtn(c.parent).click();
    expect(c.frameEl.querySelector('.sheet')).not.toBeNull();
    c.panel.destroy();
    const p = compactPanel('portrait');
    expect(orderBtn(p.parent).parentElement).not.toBe(p.parent.querySelector('.creel-actions'));
    p.panel.destroy();
  });

  it('base.css: 詰めた横の 3 つのボタンは 1 行に収まる (最小幅 64px・字は 20px・折り返さない)。依頼書の重ね表示は 2 列の格子 (繰り返しの行は全幅)', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const btn = css.match(/\.game-frame--compact\[data-layout='landscape'\] \.creel-actions \.btn\s*\{([^}]*)\}/)![1]!;
    expect(btn).toContain('min-width: 64px'); // 押せる部品は 64px 以上
    expect(btn).toContain('font-size: 20px');
    expect(btn).toContain('white-space: nowrap');
    const grid = css.match(/\.game-frame--compact\[data-layout='landscape'\] \.sheet \.creel-order\s*\{([^}]*)\}/)![1]!;
    expect(grid).toContain('display: grid');
    expect(grid).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    const rep = css.match(/\.game-frame--compact\[data-layout='landscape'\] \.sheet \.creel-order-repeat\s*\{([^}]*)\}/)![1]!;
    expect(rep).toContain('grid-column: 1 / -1');
  });
});
