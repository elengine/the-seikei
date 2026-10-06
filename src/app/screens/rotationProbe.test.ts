import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { summarize, startRotationProbe, type ProbeSample } from './rotationProbe';

function sample(over: Partial<ProbeSample>): ProbeSample {
  return {
    t: 0,
    scrollX: 0,
    scrollY: 0,
    innerW: 915,
    innerH: 412,
    vvTop: 0,
    vvPageTop: 0,
    vvH: 412,
    vvScale: 1,
    safeTop: 59,
    docH: 412,
    appTop: 0,
    appLeft: 0,
    ...over,
  };
}

describe('T1-21a-2 診断: 回転の記録のまとめ方', () => {
  it('動かなかった値は「ずっと」、動いた値は最小〜最大と変わった時刻を出す', () => {
    const lines = summarize([
      sample({ t: 0 }),
      sample({ t: 200, scrollY: 30 }),
      sample({ t: 400, scrollY: 30, innerH: 426 }),
      sample({ t: 600, scrollY: 0, innerH: 426 }),
    ]);
    const scroll = lines.find((l) => l.startsWith('文書のスクロール 縦'))!;
    expect(scroll).toContain('0px〜30px');
    expect(scroll).toContain('200ミリ秒後');
    const inner = lines.find((l) => l.startsWith('画面の高さ'))!;
    expect(inner).toContain('412px〜426px');
    const width = lines.find((l) => l.startsWith('画面の幅'))!;
    expect(width).toContain('ずっと 915');
    // 見えている窓のずれも出す (iOS の再計算で動く可能性がある)
    expect(lines.some((l) => l.startsWith('見えている窓 上のずれ'))).toBe(true);
    // アプリの土台の表示位置も出す (position fixed の土台が動くかどうか)
    expect(lines.some((l) => l.startsWith('アプリの土台 表示上'))).toBe(true);
  });

  it('1回も値が無い (記録が空) ときは「記録なし」1行だけ', () => {
    expect(summarize([])).toEqual(['記録なし']);
  });
});

describe('T1-21a-2 診断: 回転の記録の動かし方', () => {
  let rafCbs: Array<(t: number) => void>;
  beforeEach(() => {
    // performance もフェイクにする (記録の時刻は performance.now で測るため)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    rafCbs = [];
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      rafCbs.push(cb);
      return rafCbs.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const app = document.createElement('div');
    app.id = 'app';
    document.body.appendChild(app);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.textContent = '';
  });

  function tickFrame(): void {
    const cbs = rafCbs;
    rafCbs = [];
    for (const cb of cbs) {
      cb(0);
    }
  }

  it('大きさが変わると記録を始め、2秒後に結果を1回出す。新しい変化で記録をやり直す', () => {
    const results: string[][] = [];
    const off = startRotationProbe((lines) => results.push(lines));
    window.dispatchEvent(new Event('resize'));
    // 2秒分 (1フレーム=16ミリ秒) 動かす
    for (let i = 0; i < 130; i++) {
      tickFrame();
      vi.advanceTimersByTime(16);
    }
    expect(results.length, '2秒後に結果が1回').toBe(1);
    expect(results[0]!.some((l) => l.startsWith('文書のスクロール 縦'))).toBe(true);
    // 新しい変化でやり直す
    window.dispatchEvent(new Event('resize'));
    for (let i = 0; i < 130; i++) {
      tickFrame();
      vi.advanceTimersByTime(16);
    }
    expect(results.length, '結果は2回目').toBe(2);
    off();
  });

  it('解除したら記録しない', () => {
    const results: string[][] = [];
    const off = startRotationProbe((lines) => results.push(lines));
    off();
    window.dispatchEvent(new Event('resize'));
    for (let i = 0; i < 130; i++) {
      tickFrame();
      vi.advanceTimersByTime(16);
    }
    expect(results.length).toBe(0);
  });
});
