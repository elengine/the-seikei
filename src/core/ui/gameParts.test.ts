import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGameFrame } from './gameFrame';
import { showTutorial } from './tutorialOverlay';
import { showResult } from './resultView';
import type { TutorialSpec } from '../game/types';

// jsdom には Canvas がないため、getContext を空の偽物に差し替える
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as HTMLCanvasElement['getContext'];
});

describe('gameFrame', () => {
  function setup() {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onBack = vi.fn();
    const onHelp = vi.fn();
    const frame = createGameFrame(parent, {
      title: 'クリール立て',
      onBack,
      onHelp,
      logicalW: 1000,
      logicalH: 750,
    });
    return { parent, frame, onBack, onHelp };
  }

  it('1. 「もどる」「あそびかた」で各コールバックが呼ばれる。destroy で DOM から消える', () => {
    const { parent, frame, onBack, onHelp } = setup();
    expect(frame.root.isConnected).toBe(true);

    const back = Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === 'もどる');
    const help = Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === 'あそびかた');
    expect(back).toBeDefined();
    expect(help).toBeDefined();
    back!.click();
    expect(onBack).toHaveBeenCalledTimes(1);
    help!.click();
    expect(onHelp).toHaveBeenCalledTimes(1);

    frame.destroy();
    expect(frame.root.isConnected).toBe(false); // DOM から消える
  });

  it('panel と message があり、resize が呼べる', () => {
    const { frame } = setup();
    expect(frame.panel.tagName).toBe('DIV');
    expect(frame.message.parentElement).toBe(frame.panel); // message は panel 内
    expect(() => frame.resize()).not.toThrow();
  });
});

describe('tutorialOverlay', () => {
  function makeSpec(pages: number): TutorialSpec {
    return {
      pages: Array.from({ length: pages }, (_, i) => ({
        draw: () => undefined,
        text: `ページ${i + 1}のせつめい`,
      })),
    };
  }

  function setup(spec: TutorialSpec, onPage?: () => void) {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const p = showTutorial(parent, spec, { onPage });
    return { parent, p };
  }

  it('2. 3ページで「つぎへ」2回、「はじめる」1回で解決する。onPage は2回。最初のページに戻るボタンはない', async () => {
    const onPage = vi.fn();
    const { parent, p } = setup(makeSpec(3), onPage);

    // 最初のページでは戻るボタンがない
    const prevButtons = Array.from(parent.querySelectorAll('button')).filter((b) => b.textContent === 'もどる');
    expect(prevButtons).toHaveLength(0);

    let resolved = false;
    void p.then(() => {
      resolved = true;
    });

    const next = () => Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === 'つぎへ')!;
    const start = () => Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === 'はじめる')!;

    next().click();
    await Promise.resolve(); // DOM 更新を待つ
    next().click();
    await Promise.resolve();

    expect(onPage).toHaveBeenCalledTimes(2); // ページ送りのたびに onPage

    // 最後のページでは「つぎへ」がなく「はじめる」がある
    expect(next()).toBeUndefined();
    start().click();
    await vi.waitFor(() => {
      expect(resolved).toBe(true);
    });
  });

  it('2ページ目以降には戻るボタンがあり、押すと前のページに戻る', async () => {
    const { parent, p } = setup(makeSpec(2));

    const byLabel = (label: string) => Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === label);
    byLabel('つぎへ')!.click(); // 1 → 2
    await Promise.resolve();

    const prev = byLabel('もどる');
    expect(prev).toBeDefined(); // 2ページ目には戻るボタンがある
    prev!.click();
    await Promise.resolve();

    // 1ページ目に戻ると「つぎへ」があり、戻るボタンは消える
    expect(byLabel('もどる')).toBeUndefined();
    // ページ数表示「1 / 2」
    expect(parent.textContent).toContain('1 / 2');

    byLabel('つぎへ')!.click(); // 1 → 2
    await Promise.resolve();
    byLabel('はじめる')!.click(); // 最後のページ → はじめる
    await vi.waitFor(async () => {
      await p;
    });
  });
});

describe('resultView', () => {
  function setup(opts: Parameters<typeof showResult>[1]) {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const p = showResult(parent, opts);
    return { parent, p };
  }

  it('3. 星3なら ★★★、星1なら ★☆☆。「もう一度」で again、「ホームへ」で home', async () => {
    const { parent, p } = setup({
      praise: 'よくできました',
      stars: 3,
      lines: ['継いだ本数 12本'],
      newPatternNames: [],
      againLabel: 'もう一度',
      homeLabel: 'ホームへ',
    });

    const stars = () => Array.from(parent.querySelectorAll('.result-stars')).map((el) => el.textContent).join('');
    expect(stars()).toContain('★★★'); // 星3

    let result: 'again' | 'home' | undefined;
    void p.then((r) => {
      result = r;
    });

    const again = Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === 'もう一度')!;
    again.click();
    await vi.waitFor(() => {
      expect(result).toBe('again');
    });
  });

  it('星1は ★☆☆。「ホームへ」で home。演出中もボタンは押せる', async () => {
    const { parent, p } = setup({
      praise: 'まずまず',
      stars: 1,
      lines: [],
      newPatternNames: [],
      againLabel: 'もう一度',
      homeLabel: 'ホームへ',
    });
    const stars = () => Array.from(parent.querySelectorAll('.result-stars')).map((el) => el.textContent).join('');
    expect(stars()).toContain('★☆☆');

    let result: 'again' | 'home' | undefined;
    void p.then((r) => {
      result = r;
    });
    // 表示直後 (演出中) でも押せる
    const home = Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === 'ホームへ')!;
    home.click();
    await vi.waitFor(() => {
      expect(result).toBe('home');
    });
  });

  it('newPatternNames が空なら柄の欄がない。ある場合は名前が表示される', async () => {
    const { parent } = setup({
      praise: 'よくできました',
      stars: 2,
      lines: [],
      newPatternNames: ['市松', '縞'],
      againLabel: 'もう一度',
      homeLabel: 'ホームへ',
    });
    expect(parent.textContent).toContain('市松');
    expect(parent.textContent).toContain('縞');
    const empty = setup({ praise: '', stars: 2, lines: [], newPatternNames: [], againLabel: 'もう一度', homeLabel: 'ホームへ' });
    const patternLabels = empty.parent.querySelectorAll('.result-patterns');
    expect(patternLabels.length).toBe(0); // 空なら欄を出さない
    // 後片付け
    const btn = Array.from(empty.parent.querySelectorAll('button')).find((b) => b.textContent === 'ホームへ')!;
    btn.click();
    await vi.waitFor(async () => {
      await empty.p;
    });
  });
});
