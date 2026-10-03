import { describe, it, expect, vi, afterEach } from 'vitest';
import { isCompact, layoutOf, fitStage, currentSize, onViewportChange, setupCanvas } from './viewport';

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
