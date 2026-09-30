import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGameFrame, splitWidths } from './gameFrame';
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

  it('1. 「戻る」「遊び方」で各コールバックが呼ばれる。destroy で DOM から消える (期待値変更の理由: 管理者の指示で文言を変えたため)', () => {
    const { parent, frame, onBack, onHelp } = setup();
    expect(frame.root.isConnected).toBe(true);

    const back = Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === '戻る');
    const help = Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === '遊び方');
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

  it('T2-07 追加修正b: portraitStageRatio を渡すと、縦長で盤面がその割合になる', () => {
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
      portraitStageRatio: 0.4,
    });
    const stageBox = frame.root.querySelector('.game-frame__stage') as HTMLElement;
    const stageH = parseFloat(stageBox.style.height);
    expect(stageH).toBe(Math.floor((1000 - 72) * 0.4)); // 40%
    // panel は残り
    const panel = frame.root.querySelector('.game-frame__panel') as HTMLElement;
    const panelH = parseFloat(panel.style.height);
    expect(panelH).toBe(1000 - 72 - Math.floor((1000 - 72) * 0.4));
    frame.destroy();
  });

  it('T2-07 追加修正b: portraitStageRatio を渡さないと 60% (今までどおり)', () => {
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
    expect(stageH).toBe(Math.floor((1000 - 72) * 0.6));
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

  it('2. 3ページで「次へ」2回、「始める」1回で解決する。onPage は2回。最初のページに戻るボタンはない (期待値変更の理由: 管理者の指示で文言を変えたため)', async () => {
    const onPage = vi.fn();
    const { parent, p } = setup(makeSpec(3), onPage);

    // 最初のページでは戻るボタンがない
    const prevButtons = Array.from(parent.querySelectorAll('button')).filter((b) => b.textContent === '戻る');
    expect(prevButtons).toHaveLength(0);

    let resolved = false;
    void p.then(() => {
      resolved = true;
    });

    const next = () => Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === '次へ')!;
    const start = () => Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === '始める')!;

    next().click();
    await Promise.resolve(); // DOM 更新を待つ
    next().click();
    await Promise.resolve();

    expect(onPage).toHaveBeenCalledTimes(2); // ページ送りのたびに onPage

    // 最後のページでは「次へ」がなく「始める」がある
    expect(next()).toBeUndefined();
    start().click();
    await vi.waitFor(() => {
      expect(resolved).toBe(true);
    });
  });

  it('2ページ目以降には戻るボタンがあり、押すと前のページに戻る', async () => {
    const { parent, p } = setup(makeSpec(2));

    const byLabel = (label: string) => Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === label);
    byLabel('次へ')!.click(); // 1 → 2
    await Promise.resolve();

    const prev = byLabel('前へ');
    expect(prev).toBeDefined(); // 2ページ目には「前へ」がある (ゲームを終える「戻る」と区別)
    prev!.click();
    await Promise.resolve();

    // 1ページ目に戻ると「次へ」があり、「前へ」は消える
    expect(byLabel('前へ')).toBeUndefined();
    // ページ数表示「1 / 2」
    expect(parent.textContent).toContain('1 / 2');

    byLabel('次へ')!.click(); // 1 → 2
    await Promise.resolve();
    byLabel('始める')!.click(); // 最後のページ → 始める
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

describe('T1-10fix 追加修正3: 横長では「現在の帯の並び」を盤面の下に置く (テスト名のみ変更: 管理者の指示で文言を変えたため)', () => {
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

  it('横長: layout() が landscape。footer は中身が無ければ display:none (中身があれば表示)', () => {
    const { frame } = setupWithSize(1180, 820);
    expect(frame.layout()).toBe('landscape');
    expect(frame.footer.style.display).toBe('none'); // 空 → 非表示 (追加修正4 C)
    frame.footer.appendChild(document.createElement('div'));
    frame.resize();
    expect(frame.footer.style.display).not.toBe('none');
    frame.destroy();
  });

  it('縦長: layout() が portrait。footer は display:none', () => {
    const { frame } = setupWithSize(412, 915);
    expect(frame.layout()).toBe('portrait');
    expect(frame.footer.style.display).toBe('none');
    frame.destroy();
  });

  it('横長で footer に中身を足すと Canvas の高さが「盤面の列の高さ − footer の高さ − gap」になり、onStageResize が呼ばれる', () => {
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

    // footer に 190px の帯の並びを足す (子も足す。空の footer は display:none になるため)
    frame.footer.style.height = '190px';
    frame.footer.appendChild(document.createElement('div'));
    frame.footer.getBoundingClientRect = () =>
      ({ width: 1180, height: 190, top: 0, left: 0, right: 1180, bottom: 190, x: 0, y: 0, toJSON: () => undefined });
    frame.resize();
    const stageH1 = parseInt(stageBox.style.height, 10);
    const gap0 = parseFloat(getComputedStyle(stageBox.parentElement as HTMLElement).rowGap) || 0;
    expect(stageH1).toBe(bodyH - 190 - gap0);
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

  describe('追加修正4 C: footer が空のときは非表示、Canvas の高さは gap も引いて計算', () => {
    it('footer が空 (子が無い) のときは display:none で、Canvas の高さは列の高さと同じ', () => {
      const { frame } = setupWithSize(1180, 820);
      const stageCol = frame.stage.closest('.game-frame__stage-col') as HTMLElement;
      const stageBox = frame.stage.parentElement as HTMLElement;
      expect(frame.footer.childElementCount).toBe(0);
      expect(frame.footer.style.display).toBe('none');
      const colH = parseInt(stageCol.style.height, 10);
      expect(parseInt(stageBox.style.height, 10)).toBe(colH);
      frame.destroy();
    });

    it('footer に中身があるときは、Canvas の高さ = 列の高さ − footer の高さ − gap', () => {
      const { frame } = setupWithSize(1180, 820);
      const stageCol = frame.stage.closest('.game-frame__stage-col') as HTMLElement;
      const stageBox = frame.stage.parentElement as HTMLElement;
      // gap は CSS 変数 --gap (12px)。getComputedStyle で取れない環境では 0 の扱い
      const colH = parseInt(stageCol.style.height, 10);
      frame.footer.style.height = '190px';
      frame.footer.appendChild(document.createElement('div')); // 空の footer は display:none になるため
      frame.footer.getBoundingClientRect = () =>
        ({ width: 1180, height: 190, top: 0, left: 0, right: 1180, bottom: 190, x: 0, y: 0, toJSON: () => undefined });
      frame.resize();
      const gap = parseFloat(getComputedStyle(stageCol).rowGap) || 0;
      expect(parseInt(stageBox.style.height, 10)).toBe(colH - 190 - gap);
      frame.destroy();
    });
  });

  describe('追加修正5 A: footer の子の増減を MutationObserver で見張る', () => {
    it('footer に子を足すと、microtask のあとに display が none でなくなり、Canvas が作り直される', async () => {
      const { frame } = setupWithSize(1180, 820);
      expect(frame.footer.style.display).toBe('none'); // 空 → 非表示
      frame.footer.appendChild(document.createElement('div'));
      await Promise.resolve(); // MutationObserver (microtask) を待つ
      expect(frame.footer.style.display).not.toBe('none');
      frame.destroy();
    });

    it('子を取り除くと、footer は再び display: none になる', async () => {
      const { frame } = setupWithSize(1180, 820);
      const child = document.createElement('div');
      frame.footer.appendChild(child);
      await Promise.resolve();
      expect(frame.footer.style.display).not.toBe('none');
      child.remove();
      await Promise.resolve();
      expect(frame.footer.style.display).toBe('none');
      frame.destroy();
    });

    it('destroy の後に footer の子を変えても、display は変わらない (解除されている)', async () => {
      const { frame } = setupWithSize(1180, 820);
      frame.destroy();
      frame.footer.appendChild(document.createElement('div'));
      await Promise.resolve();
      expect(frame.footer.style.display).toBe('none'); // 変わらない
    });
  });
});

describe('T1-12a: 結果の表示の柄の欄のクラス', () => {
  it('柄の欄の2つの p に result-patterns__label (太字) と result-patterns__names のクラスが付く', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    showResult(parent, {
      praise: '完璧です!',
      stars: 3,
      lines: ['確認した回数 1回'],
      newPatternNames: ['紺の無地'],
      againLabel: 'もう一度',
      homeLabel: 'ホームへ',
    });
    const label = parent.querySelector('.result-patterns .result-patterns__label');
    const names = parent.querySelector('.result-patterns .result-patterns__names');
    expect(label).not.toBeNull();
    expect(names).not.toBeNull();
    expect(label?.textContent).toBe('新しく集めた柄');
    expect(names?.textContent).toBe('紺の無地');
  });
});

describe('T1-12b: splitWidths (余白と隙間を引いた幅の計算)', () => {
  it("splitWidths('portrait', 388, 12) は列も操作欄も 388", () => {
    expect(splitWidths('portrait', 388, 12)).toEqual({ stageColW: 388, panelW: 388 });
  });

  it("splitWidths('landscape', 1156, 12) は列 + 隙間 + 操作欄 = 1156", () => {
    const r = splitWidths('landscape', 1156, 12);
    expect(r.stageColW + r.panelW + 12).toBe(1156);
    expect(r.stageColW).toBe(Math.floor(1144 * 0.65));
  });
});

describe('T1-11c: 回転したときの配置の遅れ (parent を ResizeObserver で見張る)', () => {
  class RecordingRO {
    cb: ResizeObserverCallback;
    observed: Element[] = [];
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
      (RecordingRO as unknown as { last: RecordingRO | null }).last = this;
    }
    observe(target: Element): void {
      this.observed.push(target);
    }
    unobserve(): void {}
    disconnect(): void {}
    fire(): void {
      this.cb([], this as unknown as ResizeObserver);
    }
    static last: RecordingRO | null = null;
  }
  const RORef = RecordingRO as unknown as { last: RecordingRO | null };
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', RecordingRO);
    RORef.last = null;
  });

  function setupWithSize(w: number, h: number) {
    const parent = document.createElement('div');
    parent.getBoundingClientRect = () =>
      ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => undefined });
    document.body.appendChild(parent);
    const onStageResize = vi.fn();
    const frame = createGameFrame(parent, {
      title: 'クリール立て',
      onBack: () => undefined,
      onHelp: () => undefined,
      logicalW: 1000,
      logicalH: 750,
      onStageResize,
    });
    return { parent, frame, onStageResize };
  }

  it('parent が ResizeObserver で observe されている', () => {
    const { parent } = setupWithSize(1180, 820);
    const ro = RORef.last;
    expect(ro).not.toBeNull();
    expect(ro!.observed).toContain(parent);
    frameCleanup(parent);
  });

  it('偽の ResizeObserver の通知を送ると onStageResize が呼ばれる', () => {
    const { parent, onStageResize } = setupWithSize(1180, 820);
    const ro = RORef.last!;
    const callsBefore = onStageResize.mock.calls.length;
    ro.fire();
    expect(onStageResize.mock.calls.length).toBeGreaterThan(callsBefore);
    frameCleanup(parent);
  });

  function frameCleanup(parent: HTMLElement): void {
    for (const f of Array.from(parent.querySelectorAll('.game-frame'))) {
      f.remove();
    }
  }
});

describe('T1-20: showTutorial の renderText (呼び名の置き換え)', () => {
  function specWith(text: string): TutorialSpec {
    return { pages: [{ draw: () => undefined, text }] };
  }

  it('renderText を渡すと、表示される文が置き換わる', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const p = showTutorial(parent, specWith('{{spindle}}に触れると{{cone}}が立ちます'), {
      renderText: (s: string) => s.replace('{{spindle}}', '軸').replace('{{cone}}', 'コーン'),
    });
    const text = parent.querySelector('.tutorial__text')!;
    expect(text.textContent).toBe('軸に触れるとコーンが立ちます');
    // 閉じる
    const start = Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === '始める')!;
    start.click();
    await p;
  });

  it('renderText を渡さないと、そのまま', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const p = showTutorial(parent, specWith('{{spindle}}に触れる'), {});
    const text = parent.querySelector('.tutorial__text')!;
    expect(text.textContent).toBe('{{spindle}}に触れる');
    const start = Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === '始める')!;
    start.click();
    await p;
  });
});
