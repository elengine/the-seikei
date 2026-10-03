import { describe, it, expect } from 'vitest';
import { createDrumSetupPanel } from './panel';
import { init, reduce } from './logic';
import type { DrumSetupState } from './logic';
import type { DrumSetupPuzzle } from './puzzles';
import { GRADE_LABEL } from './params';
import type { DrumSetupAction } from './logic';

function p1(): DrumSetupPuzzle {
  return { id: 's1', stage: 1, patternId: 'p-muji-kon', name: '紺の無地', grade: '2/48', ends: 400, widthCm: 20 };
}

function p5(): DrumSetupPuzzle {
  return { id: 's5', stage: 5, patternId: 'p-alt-kon', name: '紺のオルタネートストライプ', grade: '2/48', ends: 720, widthCm: 18 };
}

interface Harness {
  root: HTMLElement;
  actions: DrumSetupAction[];
  notices: string[];
  calculatorOpens: number;
  /** state を渡して表示を更新する */
  update(s: DrumSetupState): void;
}

function mount(p: DrumSetupPuzzle, s: DrumSetupState): Harness {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const actions: DrumSetupAction[] = [];
  const notices: string[] = [];
  let calculatorOpens = 0;
  const panel = createDrumSetupPanel(root, {
    puzzle: p,
    onAction: (a) => actions.push(a),
    onOpenCalculator: () => {
      calculatorOpens++;
    },
    onNotice: (t) => notices.push(t),
  });
  panel.update(s);
  return {
    root,
    actions,
    notices,
    get calculatorOpens(): number {
      return calculatorOpens;
    },
    update(ns: DrumSetupState): void {
      panel.update(ns);
    },
  };
}

function buttonByText(h: Harness, text: string): HTMLButtonElement {
  const b = Array.from(h.root.querySelectorAll<HTMLButtonElement>('button')).find((x) => x.textContent?.trim() === text);
  if (b === undefined) {
    throw new Error(`button not found: ${text}`);
  }
  return b;
}

function headings(h: Harness): string[] {
  return Array.from(h.root.querySelectorAll('h3, .section-heading')).map((e) => e.textContent?.trim() ?? '');
}

describe('drumsetup panel T2c-03a (操作欄)', () => {
  it('1. 節は上から「依頼書」「計算のメモ」「羽の角度」「送り量」の並び', () => {
    const p = p1();
    const h = mount(p, init(p));
    const hs = headings(h);
    expect(hs).toEqual(['依頼書', '計算のメモ', '羽の角度', '送り量']);
  });

  it('2. 依頼書には番手・帯の本数・帯の幅・柄の名前を出す', () => {
    const p = p1();
    const h = mount(p, init(p));
    const order = h.root.querySelector('[data-testid="drumsetup-order"]')!.textContent!;
    expect(order).toContain(GRADE_LABEL['2/48']);
    expect(order).toContain('400本');
    expect(order).toContain('20cm');
    expect(order).toContain('紺の無地');
  });

  it('3. 計算のメモは段階で変える。段階1 は密度・厚み・tan の表、段階5 は空で「表は電卓から見られます」', () => {
    const h1 = mount(p1(), init(p1()));
    const memo1 = h1.root.querySelector('[data-testid="drumsetup-memo"]')!.textContent!;
    expect(memo1).toContain('20本/cm'); // 密度
    expect(memo1).toContain('0.170mm'); // 厚み (第3位)
    expect(memo1).toContain('tan'); // tan の表
    const h5 = mount(p5(), init(p5()));
    const memo5 = h5.root.querySelector('[data-testid="drumsetup-memo"]')!.textContent!;
    expect(memo5).not.toContain('本/cm');
    expect(memo5).toContain('表は電卓から見られます');
  });

  it('4. 羽の角度は 5°・7°・9°・11° から選ぶ。段階1 では使える角度に「○」を添える', () => {
    const p = p1();
    const h = mount(p, init(p));
    const labels = Array.from(h.root.querySelectorAll('.choice__item')).map((e) => e.textContent?.trim() ?? '');
    expect(labels).toEqual(['5°', '7°○', '9°○', '11°○']);
    buttonByText(h, '9°○').click();
    expect(h.actions).toEqual([{ type: 'selectAngle', angle: 9 }]);
  });

  it('5. 送り量: 大きな数字と4つのボタン。ボタンで値が変わり、数字を押すと電卓を開く', () => {
    const p = p1();
    const h = mount(p, init(p));
    const value = h.root.querySelector<HTMLButtonElement>('[data-testid="drumsetup-feed"]')!;
    expect(value.textContent).toContain('0.00 mm');
    // +0.1 を3回 (テスト側で reduce しながら update する)
    let s = init(p);
    for (let i = 0; i < 3; i++) {
      buttonByText(h, '+0.1').click();
      s = reduce(s, p, h.actions[h.actions.length - 1]!);
      h.update(s);
    }
    expect(value.textContent).toContain('0.30 mm');
    // −0.01
    buttonByText(h, '−0.01').click();
    s = reduce(s, p, h.actions[h.actions.length - 1]!);
    h.update(s);
    expect(value.textContent).toContain('0.29 mm');
    // 数字 (表示) を押すと電卓を開く
    const before = h.calculatorOpens;
    value.click();
    expect(h.calculatorOpens).toBe(before + 1);
  });

  it('6. 試し巻きのあいだは「電卓」「試し巻き」とも押せない形 (理由は「試し巻きの途中です」)', () => {
    const p = p1();
    const h = mount(p, init(p));
    let s = init(p);
    s = reduce(s, p, { type: 'selectAngle', angle: 9 });
    s = reduce(s, p, { type: 'setFeed', value: 1.07 });
    s = reduce(s, p, { type: 'trial' });
    h.update(s);
    for (const text of ['電卓', '試し巻き']) {
      const b = buttonByText(h, text);
      expect(b.getAttribute('aria-disabled')).toBe('true');
      b.click();
      const actionsAfter = h.actions.length;
      expect(actionsAfter, text).toBe(h.actions.length); // 操作は送られない
    }
    expect(h.notices).toContain('試し巻きの途中です');
  });

  it('7. 星3でない結果のあとに「ここで終える」が出る (押すと finish を送る)', () => {
    const p = p1();
    const h = mount(p, init(p));
    let s = init(p);
    s = reduce(s, p, { type: 'selectAngle', angle: 9 });
    s = reduce(s, p, { type: 'setFeed', value: 0.96 });
    s = reduce(s, p, { type: 'trial' });
    s = reduce(s, p, { type: 'trialEnd' });
    h.update(s);
    const b = buttonByText(h, 'ここで終える');
    b.click();
    expect(h.actions).toContainEqual({ type: 'finish' });
  });
});
