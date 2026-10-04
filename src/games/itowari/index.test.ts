import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createItowariModule } from './index';
import { init, reduce } from './logic';
import type { ItowariState } from './logic';
import { itowariPuzzles } from './puzzles';
import { getContent } from '../../core/content/content';
import type { GameDeps, GameProps } from '../../core/game/types';
import { createAppContext } from '../../app/context';
import type { AppContext } from '../../app/context';
import { createFixedClock } from '../../core/clock/clock';

const content = getContent();
const puzzles = itowariPuzzles(content);
const p1 = puzzles.find((p) => p.id === 's1')!;

let dbSeq = 0;

async function makeDeps(): Promise<GameDeps> {
  const ctx: AppContext = await createAppContext({
    dbName: `itowari-index-test-${Date.now().toString(36)}-${dbSeq++}`,
    clock: createFixedClock('2026-10-05T00:00:00Z'),
    navigate: () => undefined,
  });
  return { terms: ctx.terms, audio: ctx.audio, records: ctx.records, clock: ctx.clock, log: () => undefined };
}

/** 偽の requestAnimationFrame (手動で進める。1フレーム = 16ms) */
function installFakeRaf(): { advance(n: number): void } {
  const frames: Array<() => void> = [];
  let now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void): number => {
    const at = now + 16;
    frames.push(() => {
      now = at;
      cb(at);
    });
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  return {
    advance(n: number): void {
      for (let i = 0; i < n; i++) {
        const f = frames.shift();
        if (f) f();
      }
    },
  };
}

/** レベル1 のお題を、6口すべてに 6,000m を設定した状態 (巻き始めると成功) */
function readyState(): ItowariState {
  let s = init(p1);
  for (let i = 0; i < 6; i++) {
    s = reduce(s, { type: 'mount', spindle: i, sourceId: p1.sources[i]!.id, slot: 0 }, p1);
    s = reduce(s, { type: 'setLength', spindle: i, slot: 0, lengthM: 6000 }, p1);
  }
  return s;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('糸割り module T2b-04 (結果のつなぎ)', () => {
  it('結果の画面の次のボタンは「次へ」(ほかのゲームと同じ。「次のお題へ」ではない)', async () => {
    const raf = installFakeRaf();
    const deps = await makeDeps();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const finished: unknown[] = [];
    const props = {
      mode: 'standalone' as const,
      resume: readyState(), // 巻き始めると成功する状態から再開
      onStateChange: undefined,
      onFinish: (r: unknown) => finished.push(r),
      onExit: () => undefined,
    } as unknown as GameProps;
    const module = createItowariModule(deps);
    const inst = module.mount(container, props);
    // 巻き始める → 4秒巻いて判定 → 成功 → 結果の画面 (1.5秒後)
    await vi.waitFor(() => {
      const b = Array.from(container.querySelectorAll('button')).find((x) => x.textContent === '巻き始める');
      expect(b).toBeDefined();
    });
    Array.from(container.querySelectorAll('button')).find((x) => x.textContent === '巻き始める')!.click();
    raf.advance(260); // 4秒 + 1.5秒 + 余裕 (1フレーム 16ms)
    await vi.waitFor(() => {
      expect(finished.length).toBeGreaterThan(0);
    }, { timeout: 5000, interval: 50 });
    // 結果 (GameResult) の次のボタンのラベルを確かめる (ほかのゲームのテストと同じ形)
    const result = finished[0] as { next?: { label: string } };
    expect(result.next?.label).toBe('次へ');
    inst.unmount();
  }, 20000);
});
