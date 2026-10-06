import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCompact, layoutOf, fitStage, currentSize, onViewportChange, setupCanvas, installScrollReset, installScrollGuard } from './viewport';

describe('layoutOf', () => {
  it('1. 1180×820 は landscape、393×873 は portrait、800×800 は landscape', () => {
    expect(layoutOf({ width: 1180, height: 820 })).toBe('landscape');
    expect(layoutOf({ width: 393, height: 873 })).toBe('portrait');
    expect(layoutOf({ width: 800, height: 800 })).toBe('landscape'); // 幅 >= 高さ
  });
});

describe('fitStage', () => {
  it('2. fitStage(1000, 750, 2000, 750) → scale 1, offsetX 500, offsetY 0', () => {
    const f = fitStage(1000, 750, 2000, 750);
    expect(f.scale).toBe(1);
    expect(f.offsetX).toBe(500);
    expect(f.offsetY).toBe(0);
  });

  it('3. fitStage(1000, 750, 500, 1000) → scale 0.5, offsetX 0, offsetY 312.5', () => {
    const f = fitStage(1000, 750, 500, 1000);
    expect(f.scale).toBe(0.5);
    expect(f.offsetX).toBe(0);
    expect(f.offsetY).toBe(312.5);
  });

  it('余白は均等に配られ、縮小でも中央合わせになる', () => {
    const f = fitStage(1000, 750, 1500, 1500);
    expect(f.scale).toBe(1.5); // 幅基準で拡大
    expect(f.offsetX).toBe(0); // 幅はぴったり
    expect(f.offsetY).toBe(187.5); // 高さの余白 (1500-1125)/2 を均等配分
    const g = fitStage(1000, 1000, 500, 500);
    expect(g.scale).toBe(0.5);
    expect(g.offsetX).toBe(0); // 正方形は余白ゼロ
    expect(g.offsetY).toBe(0);
  });
});

describe('currentSize', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('visualViewport があればその幅高さを使う', () => {
    vi.stubGlobal('visualViewport', { width: 882, height: 344 });
    expect(currentSize()).toEqual({ width: 882, height: 344 });
  });

  it('visualViewport がなければ window.innerWidth/Height', () => {
    vi.stubGlobal('visualViewport', undefined);
    vi.stubGlobal('innerWidth', 393);
    vi.stubGlobal('innerHeight', 873);
    expect(currentSize()).toEqual({ width: 393, height: 873 });
  });
});

describe('onViewportChange', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('追加修正1: resize 発火 → 次のフレームの前に解除 → cb は呼ばれない (raf 予約も取り消される)', () => {
    let rafId = 0;
    const rafCbs = new Map<number, FrameRequestCallback>();
    const raf = vi.fn((cb: FrameRequestCallback) => {
      rafId++;
      rafCbs.set(rafId, cb);
      return rafId;
    });
    const caf = vi.fn((id: number) => {
      rafCbs.delete(id);
    });
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', caf);
    vi.stubGlobal('visualViewport', { width: 882, height: 344, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('innerWidth', 882);
    vi.stubGlobal('innerHeight', 344);
    const addWin = vi.fn();
    const removeWin = vi.fn();
    vi.stubGlobal('window', {
      innerWidth: 882,
      innerHeight: 344,
      addEventListener: addWin,
      removeEventListener: removeWin,
    });

    const cb = vi.fn();
    const off = onViewportChange(cb);
    const resizeCall = addWin.mock.calls.find((c) => c[0] === 'resize');
    const handler = resizeCall![1] as () => void;

    // resize を発火 → raf が予約されるが cb はまだ呼ばれない
    handler();
    expect(raf).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(0);

    // 次のフレームの前に解除 → 予約済み raf も取り消される
    off();
    expect(caf).toHaveBeenCalledWith(1);

    // 次のフレームが来ても cb は呼ばれない
    for (const [, c] of rafCbs) {
      c(0);
    }
    expect(cb).toHaveBeenCalledTimes(0);
  });

  it('4. window の resize を2回続けて発火させても、次のフレームで cb は1回だけ呼ばれる。解除後は呼ばれない', () => {
    // raf を「コールバックを貯めて手動で発火」するモックにする (フレーム境界を制御するため)
    let rafCb: FrameRequestCallback | null = null;
    const raf = vi.fn((cb: FrameRequestCallback) => {
      rafCb = cb;
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('visualViewport', { width: 882, height: 344, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('innerWidth', 882);
    vi.stubGlobal('innerHeight', 344);
    const addWin = vi.fn();
    const removeWin = vi.fn();
    vi.stubGlobal('window', {
      innerWidth: 882,
      innerHeight: 344,
      addEventListener: addWin,
      removeEventListener: removeWin,
    });

    const cb = vi.fn();
    const off = onViewportChange(cb);
    expect(addWin).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(addWin).toHaveBeenCalledWith('orientationchange', expect.any(Function));

    // visualViewport resize 監視も登録されている
    const vv = (globalThis as unknown as { visualViewport?: { addEventListener: ReturnType<typeof vi.fn> } }).visualViewport;
    expect(vv?.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));

    // 登録済みハンドラを取り出して2回連続発火
    const resizeCall = addWin.mock.calls.find((c) => c[0] === 'resize');
    const handler = resizeCall![1] as () => void;
    handler();
    handler();
    // 同じフレーム内: raf は1回だけ要求され、cb はまだ呼ばれない
    expect(raf).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(0);

    // 次のフレーム: raf のコールバックが実行され cb は1回だけ呼ばれる
    rafCb!(0);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ width: 882, height: 344 }, 'landscape');

    // 別フレームの変化はまた通知される
    handler();
    rafCb!(0);
    expect(cb).toHaveBeenCalledTimes(2);

    // 解除: window の両イベントと visualViewport の resize の監視が外れる
    off();
    expect(removeWin).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeWin).toHaveBeenCalledWith('orientationchange', expect.any(Function));
    const vvRemove = (
      (globalThis as unknown as { visualViewport?: { removeEventListener: ReturnType<typeof vi.fn> } }).visualViewport!
    ).removeEventListener;
    expect(vvRemove).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

describe('setupCanvas', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    // jsdom には 2D コンテキストがないので差し替える
    const ctx = {
      setTransform: vi.fn(),
      scale: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(c, 'getContext').mockReturnValue(ctx);
    return c;
  }

  it('CSS サイズを設定し、内部解像度は devicePixelRatio 倍。ctx は CSS px 座標で描ける', () => {
    const canvas = makeCanvas();
    vi.stubGlobal('devicePixelRatio', 2);
    const ctx = setupCanvas(canvas, 400, 300);
    expect(canvas.style.width).toBe('400px');
    expect(canvas.style.height).toBe('300px');
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it('devicePixelRatio は 1〜3 に丸められる', () => {
    const c1 = makeCanvas();
    vi.stubGlobal('devicePixelRatio', 5);
    setupCanvas(c1, 100, 100);
    expect(c1.width).toBe(300); // 3 倍まで

    const c2 = makeCanvas();
    vi.stubGlobal('devicePixelRatio', 0.5);
    setupCanvas(c2, 100, 100);
    expect(c2.width).toBe(100); // 1 倍まで
  });
});

describe('isCompact (PU-09a)', () => {
  it('幅 600px 未満、または高さ 560px 未満が詰めた形。境目は 599/600 と 559/560', () => {
    expect(isCompact(599, 900)).toBe(true);
    expect(isCompact(600, 900)).toBe(false);
    expect(isCompact(900, 559)).toBe(true);
    expect(isCompact(900, 560)).toBe(false);
    expect(isCompact(412, 915)).toBe(true); // Fold のカバー画面 (縦)
    expect(isCompact(915, 412)).toBe(true); // 同 (横)
    expect(isCompact(1180, 820)).toBe(false);
    expect(isCompact(960, 720)).toBe(false);
  });
});

describe('T1-21a-2 案1: 文書のずれを、描画される前に戻す (scroll イベントの番人)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setScroll(x: number, y: number): void {
    Object.defineProperty(window, 'scrollX', { value: x, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  }

  it('scroll イベントでずれを検知したら、すぐに (0, 0) に戻す。ずれていなければ何もしない。解除できる', () => {
    const scrolls: Array<[number, number]> = [];
    vi.stubGlobal('scrollTo', (x: number, y: number) => scrolls.push([x, y]));
    setScroll(0, 0);
    const off = installScrollGuard();
    window.dispatchEvent(new Event('scroll'));
    expect(scrolls.length, 'ずれていなければ何もしない').toBe(0);
    setScroll(0, 68); // iOS が回転の瞬間にずらした
    window.dispatchEvent(new Event('scroll'));
    expect(scrolls.length, 'ずれた瞬間に戻す').toBe(1);
    expect(scrolls[0]).toEqual([0, 0]);
    setScroll(30, 0); // 横へのずれも戻す
    window.dispatchEvent(new Event('scroll'));
    expect(scrolls.length).toBe(2);
    off();
    setScroll(0, 68);
    window.dispatchEvent(new Event('scroll'));
    expect(scrolls.length, '解除後は呼ばれない').toBe(2);
  });
});

describe('T1-21a-2 追加修正 (A案): 文書のずれは、ずれたときだけ戻す', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** jsdom に無い scrollX・scrollY を置き換える */
  function setScroll(x: number, y: number): void {
    Object.defineProperty(window, 'scrollX', { value: x, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  }

  it('ずれていなければ scrollTo は通知のフレームの1回だけ。その後は確認はするが動かさない (iOS の回転の再計算と競合しない)', () => {
    vi.useFakeTimers();
    const scrolls: Array<[number, number]> = [];
    vi.stubGlobal('scrollTo', (x: number, y: number) => scrolls.push([x, y]));
    setScroll(0, 0);
    const off = installScrollReset();
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(scrolls.length, '通知のフレームで1回').toBe(1);
    vi.advanceTimersByTime(700); // 600ms の確認期間が終わるまで進める
    expect(scrolls.length, 'ずれていないので動かさない').toBe(1);
    off();
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(700);
    expect(scrolls.length, '解除後は呼ばれない').toBe(1);
  });

  it('ずれていたら戻し、100ms ごとに確認して、ずれが無い状態が続いたらやめる。後からずれても戻す', () => {
    vi.useFakeTimers();
    const scrolls: Array<[number, number]> = [];
    vi.stubGlobal('scrollTo', (x: number, y: number) => scrolls.push([x, y]));
    setScroll(0, 30); // 回転の通知の時点でずれている
    const off = installScrollReset();
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20); // 通知のフレームで戻す
    expect(scrolls.length, '通知のフレームですぐ戻す').toBe(1);
    vi.advanceTimersByTime(110); // 100ms 後の確認: まだずれている
    expect(scrolls.length, 'ずれが残っていたら戻す').toBe(2);
    vi.advanceTimersByTime(100); // 200ms 後の確認: まだずれている
    expect(scrolls.length).toBe(3);
    setScroll(0, 0); // iOS 自身が戻った
    vi.advanceTimersByTime(100); // 300ms 後の確認: ずれ無し (1回目)
    expect(scrolls.length, 'ずれていなければ動かさない').toBe(3);
    vi.advanceTimersByTime(100); // 400ms 後の確認: ずれ無し 2回続いたのでやめる
    vi.advanceTimersByTime(700); // それ以降も動かない
    expect(scrolls.length, '収束したら確認もやめる').toBe(3);
    // 別の回転: 後から iOS がずらした
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(scrolls.length, '通知のフレーム (この時点ではずれていない)').toBe(4);
    vi.advanceTimersByTime(100); // 100ms 後の確認: まだずれていない
    expect(scrolls.length).toBe(4);
    setScroll(0, 25); // 250ms ごろにずれた
    vi.advanceTimersByTime(110); // 200ms ごろの確認でずれを検知して戻す
    expect(scrolls.length, '後からずれた場合も戻す').toBe(5);
    setScroll(0, 0);
    vi.advanceTimersByTime(700);
    expect(scrolls.length, '収束したらやめる').toBe(5);
    off();
  });
});

describe('T1-21a: iPhone・iPad の上端のにじみと回転のずれへの備え (html・#app の形)', () => {
  it('index.html に apple-mobile-web-app-capable と status-bar-style default がある (時計の帯を不透明に)', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../index.html'), 'utf-8');
    expect(css).toContain('apple-mobile-web-app-capable');
    expect(css).toMatch(/apple-mobile-web-app-status-bar-style" content="default"/);
  });

  it('base.css: html・body は overflow hidden。#app は position fixed・inset 0。上端に地の色の無地の帯 (#app::before) と 4px の余白', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const htmlBody = css.match(/\nhtml,\s*\nbody\s*\{([^}]*)\}/)![1]!;
    expect(htmlBody).toContain('overflow: hidden');
    const app = css.match(/\n#app\s*\{([^}]*)\}/)![1]!;
    expect(app).toContain('position: fixed');
    expect(app).toContain('inset: 0');
    const before = css.match(/\n#app::before\s*\{([^}]*)\}/)![1]!;
    expect(before).toContain('position: fixed');
    expect(before).toContain('env(safe-area-inset-top)');
    expect(before).toContain('background: var(--c-kinari)');
    expect(before).toContain('pointer-events: none');
    expect(app).toContain('4px');
  });
});
