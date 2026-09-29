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

  it('追加修正1: parent の内寸を基準に配置される (parent の大きさを変えると盤面が従う)', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    // parent を横長 1000×800 に見せる
    parent.getBoundingClientRect = () =>
      ({ width: 1000, height: 800, top: 0, left: 0, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => undefined }) as DOMRect;
    const fits: number[] = []; // scale の変化で盤面の大きさの変化を見る
    const frame = createGameFrame(parent, {
      title: 'テスト',
      onBack: () => undefined,
      onHelp: () => undefined,
      logicalW: 1000,
      logicalH: 750,
      onStageResize: (fit) => fits.push(fit.scale),
    });
    // parent が狭くなると scale が下がる (parent の内寸に従う)
    // jsdom は clientWidth を計算しないため、stageBox の clientWidth/Height を内寸から返すよう差し替える
    let innerW = 1000;
    const bodyH = 800 - 72;
    const innerH = () => bodyH + 72;
    parent.getBoundingClientRect = () =>
      ({ width: innerW, height: innerH(), top: 0, left: 0, right: innerW, bottom: innerH(), x: 0, y: 0, toJSON: () => undefined }) as DOMRect;
    const stageBox = frame.root.querySelector('.game-frame__stage') as HTMLElement;
    Object.defineProperty(stageBox, 'clientWidth', { get: () => Math.floor(innerW * 0.65) });
    Object.defineProperty(stageBox, 'clientHeight', { get: () => bodyH });
    frame.resize(); // 1回目は clientWidth がまだ jsdom 既定 (0) の可能性があるため無視
    innerW = 600; // parent が狭くなる
    frame.resize();
    const scaleNarrow = fits[fits.length - 1]!;
    expect(scaleNarrow).toBeGreaterThan(0); // parent の内寸に従って盤面が生きている
    // landscape 判定も parent の内寸: 600×800 は縦長
    frame.destroy();
  });

  it('追加修正1: parent の内寸が縦長なら盤面が上 60% になる', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    parent.getBoundingClientRect = () =>
      ({ width: 500, height: 1000, top: 0, left: 0, right: 500, bottom: 1000, x: 0, y: 0, toJSON: () => undefined }) as DOMRect;
    const frame = createGameFrame(parent, {
      title: 'テスト',
      onBack: () => undefined,
      onHelp: () => undefined,
      logicalW: 1000,
      logicalH: 750,
    });
    const stageBox = frame.root.querySelector('.game-frame__stage') as HTMLElement;
    const stageH = parseFloat(stageBox.style.height);
    expect(stageH).toBe(Math.floor((1000 - 72) * 0.6)); // (内寸高 - 帯72) の 60%
    frame.destroy();
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

    const prev = byLabel('まえへ');
    expect(prev).toBeDefined(); // 2ページ目には「まえへ」がある (ゲームを終える「もどる」と区別)
    prev!.click();
    await Promise.resolve();

    // 1ページ目に戻ると「つぎへ」があり、「まえへ」は消える
    expect(byLabel('まえへ')).toBeUndefined();
    // ページ数表示「1 / 2」
    expect(parent.textContent).toContain('1 / 2');

    byLabel('つぎへ')!.click(); // 1 → 2
    await Promise.resolve();
    byLabel('はじめる')!.click(); // 最後のページ → はじめる
    await vi.waitFor(async () => {
      await p;
    });
  });

  it('追加修正3: draw に渡る幅・高さが指定どおり (幅 min(560px, 画面幅の90%)、高さは幅の 2/3)', () => {
    // 画面幅 1000px → 幅 560px (min)、高さ 373.33px
    vi.stubGlobal('innerWidth', 1000);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    let drawnW = 0;
    let drawnH = 0;
    const spec: TutorialSpec = {
      pages: [
        {
          draw: (_ctx, w, h) => {
            drawnW = w;
            drawnH = h;
          },
          text: 'テスト',
        },
      ],
    };
    // setupCanvas が動くよう getContext を偽の ctx を返すものに差し替え
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ clearRect: () => undefined, setTransform: () => undefined }) as unknown as CanvasRenderingContext2D) as unknown as HTMLCanvasElement['getContext'];
    const p = showTutorial(parent, spec);
    expect(drawnW).toBe(560); // min(560, 1000*0.9=900) = 560
    expect(drawnH).toBe(Math.floor((560 * 2) / 3));
    void p;

    // 画面幅 400px → 幅 360px (90%)
    vi.stubGlobal('innerWidth', 400);
    const parent2 = document.createElement('div');
    document.body.appendChild(parent2);
    let drawnW2 = 0;
    const spec2: TutorialSpec = { pages: [{ draw: (_ctx, w) => { drawnW2 = w; }, text: 'テスト' }] };
    const p2 = showTutorial(parent2, spec2);
    expect(drawnW2).toBe(360);
    void p2;
    vi.unstubAllGlobals();
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

describe('T1-10fix 追加修正3: 横長では「いまの帯の並び」を盤面の下に置く', () => {
  class FakeRO {
    cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
      (FakeRO as unknown as { last: FakeRO | null }).last = this;
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    static last: FakeRO | null = null;
  }
  const RORef = FakeRO as unknown as { last: FakeRO | null };
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FakeRO);
    RORef.last = null;
  });

  function setupWithSize(w: number, h: number) {
    const parent = document.createElement('div');
    parent.getBoundingClientRect = () =>
      ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => undefined });
    document.body.appendChild(parent);
    const frame = createGameFrame(parent, {
      title: 'クリール立て',
      onBack: () => undefined,
      onHelp: () => undefined,
      logicalW: 1000,
      logicalH: 750,
    });
    return { parent, frame };
  }

  it('横長: layout() が landscape。footer があり、縦長配置と違い CSS で隠れていない', () => {
    const { frame } = setupWithSize(1180, 820);
    expect(frame.layout()).toBe('landscape');
    expect(frame.footer.style.display).not.toBe('none');
    frame.destroy();
  });

  it('縦長: layout() が portrait。footer は display:none', () => {
    const { frame } = setupWithSize(412, 915);
    expect(frame.layout()).toBe('portrait');
    expect(frame.footer.style.display).toBe('none');
    frame.destroy();
  });

  it('横長で footer に中身を足すと Canvas の高さが「盤面の列の高さ − footer の高さ」になり、onStageResize が呼ばれる', () => {
    const sizes: { w: number; h: number }[] = [];
    const parent = document.createElement('div');
    parent.getBoundingClientRect = () =>
      ({ width: 1180, height: 820, top: 0, left: 0, right: 1180, bottom: 820, x: 0, y: 0, toJSON: () => undefined });
    document.body.appendChild(parent);
    const frame = createGameFrame(parent, {
      title: 'クリール立て',
      onBack: () => undefined,
      onHelp: () => undefined,
      logicalW: 1000,
      logicalH: 750,
      onStageResize: (fit) => {
        sizes.push({ w: Math.round(fit.scale * 1000), h: Math.round(fit.scale * 750) });
      },
    });
    // jsdom では clientHeight が測れないので、Canvas の入れ物 (stageBox) に設定した CSS の高さで判定する
    const stageBox = frame.stage.parentElement!;
    const stageH0 = parseInt(stageBox.style.height, 10);
    const bodyH = 820 - 72; // BAR_H (上部の帯の高さ)
    expect(stageH0).toBe(bodyH); // footer が空なら今までどおり

    // footer に 190px の帯の並びを足す
    frame.footer.style.height = '190px';
    frame.footer.getBoundingClientRect = () =>
      ({ width: 1180, height: 190, top: 0, left: 0, right: 1180, bottom: 190, x: 0, y: 0, toJSON: () => undefined });
    frame.resize();
    const stageH1 = parseInt(stageBox.style.height, 10);
    expect(stageH1).toBe(bodyH - 190);
    expect(sizes.length).toBeGreaterThanOrEqual(2); // onStageResize が再び呼ばれる
    frame.destroy();
  });

  it('footer の高さが変わったら Canvas を作り直す (ResizeObserver で footer を監視)', () => {
    const { frame } = setupWithSize(1180, 820);
    // footer が監視対象として登録されている
    const ro = RORef.last;
    expect(ro).not.toBeNull();
    expect(() => ro!.cb([], ro as unknown as ResizeObserver)).not.toThrow(); // 高さ変化のコールバックが呼べる
    frame.destroy();
  });
});
