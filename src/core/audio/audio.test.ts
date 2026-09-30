import { describe, it, expect, vi } from 'vitest';
import { SOUNDS } from './sounds';
import type { SoundName } from './sounds';
import { createAudioPlayer } from './audio';

describe('sounds', () => {
  it('1. すべての名前に1つ以上の Note があり、周波数・gain・長さが範囲内', () => {
    const names: SoundName[] = ['tap', 'ok', 'gentleNo', 'knot', 'page', 'fanfare', 'stop'];
    for (const name of names) {
      const notes = SOUNDS[name];
      expect(notes.length, name).toBeGreaterThan(0);
      for (const note of notes) {
        expect(note.freq, `${name} freq`).toBeGreaterThanOrEqual(250);
        expect(note.freq, `${name} freq`).toBeLessThanOrEqual(2000);
        expect(note.gain, `${name} gain`).toBeLessThanOrEqual(0.5);
        expect(note.gain, `${name} gain`).toBeGreaterThan(0);
        expect(note.durMs, `${name} durMs`).toBeGreaterThan(0);
        // 1つの音の全体の長さ (startMs + durMs) は 2000ms 以下
        expect(note.startMs + note.durMs, `${name} 長さ`).toBeLessThanOrEqual(2000);
        expect(['sine', 'triangle']).toContain(note.wave);
      }
    }
    // fanfare はド・ミ・ソ・ド の上昇 (4音)
    expect(SOUNDS.fanfare.length).toBe(4);
    const freqs = SOUNDS.fanfare.map((n) => n.freq);
    expect(freqs).toEqual([...freqs].sort((a, b) => a - b)); // 上昇
  });
});

/** 偽の AudioContext を作る。発振器の作成と start/stop を記録する */
function makeFakeContext() {
  const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const masterGain = { gain: { value: 0, setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
  const ctx = {
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => undefined),
    createGain: vi.fn(() => ({
      gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createOscillator: vi.fn(() => {
      const osc = {
        type: '',
        frequency: { value: 440, setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
  };
  return { ctx, oscillators, masterGain };
}

describe('audio', () => {
  it('2. unlock 前の play では発振器が作られない', () => {
    const { ctx, oscillators } = makeFakeContext();
    const player = createAudioPlayer(() => ctx as unknown as AudioContext);
    player.play('ok');
    expect(oscillators).toHaveLength(0); // unlock 前は何もしない
  });

  it('3. unlock 後の play("ok") で、Note の数だけ発振器が作られる', async () => {
    const { ctx, oscillators } = makeFakeContext();
    const player = createAudioPlayer(() => ctx as unknown as AudioContext);
    player.unlock();
    await vi.waitFor(() => {
      expect(ctx.resume).toHaveBeenCalled(); // unlock で resume する
    });
    const count = SOUNDS.ok.length;
    player.play('ok');
    expect(oscillators).toHaveLength(count);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(count);
  });

  it('4. setEnabled(false) の後は発振器が作られない', async () => {
    const { ctx, oscillators } = makeFakeContext();
    const player = createAudioPlayer(() => ctx as unknown as AudioContext);
    player.unlock();
    await vi.waitFor(() => {
      expect(ctx.resume).toHaveBeenCalled();
    });
    player.setEnabled(false);
    player.play('tap');
    expect(oscillators).toHaveLength(0);
    player.setEnabled(true);
    player.play('tap');
    expect(oscillators.length).toBe(SOUNDS.tap.length);
  });

  it('5. setVolume(1.5) は 1 に丸められる', () => {
    const { ctx } = makeFakeContext();
    const player = createAudioPlayer(() => ctx as unknown as AudioContext);
    player.setVolume(1.5);
    // 内部で丸められた volume が使われる: unlock 後に play して masterGain を確かめる
    player.unlock();
    player.play('tap');
    const master = (ctx.createGain as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(master?.gain.value).toBe(1);
  });

  it('追加: setVolume(-0.5) は 0 に丸められる', () => {
    const { ctx } = makeFakeContext();
    const player = createAudioPlayer(() => ctx as unknown as AudioContext);
    player.setVolume(-0.5);
    player.unlock();
    player.play('tap');
    const master = (ctx.createGain as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(master?.gain.value).toBe(0);
  });

  it('追加: makeContext が例外を出しても play は投げない', () => {
    const player = createAudioPlayer(() => {
      throw new Error('no audio');
    });
    player.unlock();
    expect(() => player.play('tap')).not.toThrow();
  });

  it('追加修正2a: makeContext 省略時は既定の AudioContext を使い、unlock → play で発振器が作られる', async () => {
    // globalThis.AudioContext に偽物を置く
    const { ctx, oscillators } = makeFakeContext();
    // new 付き呼び出しでも ctx を返させる (実装は new AudioContext() する)
    const FakeAudioContext = vi.fn(function (this: unknown) {
      return ctx as unknown as object;
    } as unknown as () => void) as unknown as { new (): unknown; mock: { calls: unknown[] } };
    vi.stubGlobal('AudioContext', FakeAudioContext);
    try {
      const player = createAudioPlayer(); // 引数なし
      player.unlock();
      await vi.waitFor(() => {
        expect((FakeAudioContext as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1); // 既定で new AudioContext()
        expect(ctx.resume).toHaveBeenCalled();
      });
      player.play('ok');
      expect(oscillators).toHaveLength(SOUNDS.ok.length); // 発振器が作られる
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('追加修正2b: AudioContext が存在しない環境で unlock() しても例外が出ない', () => {
    vi.stubGlobal('AudioContext', undefined); // 存在しない環境を再現
    try {
      const player = createAudioPlayer(); // 引数なし
      expect(() => player.unlock()).not.toThrow();
      expect(() => player.play('tap')).not.toThrow(); // 何もしない
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('T1-11b: Safari で音が止まったあとの再開', () => {
  /** state を持つ偽の AudioContext */
  function makeStatefulContext(initialState: string) {
    const state = { value: initialState };
    const ctx = {
      get state() {
        return state.value;
      },
      setState(s: string) {
        state.value = s;
      },
      currentTime: 0,
      destination: {},
      resume: vi.fn(async () => undefined),
      createGain: vi.fn(() => ({
        gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createOscillator: vi.fn(() => ({
        type: '',
        frequency: { value: 440, setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
    };
    return ctx;
  }

  it.each(['suspended', 'interrupted'])('state が %s のとき、unlock() で resume が呼ばれる', async (state) => {
    const ctx = makeStatefulContext(state);
    const player = createAudioPlayer(() => ctx as unknown as AudioContext);
    player.unlock();
    await vi.waitFor(() => {
      expect(ctx.resume).toHaveBeenCalled();
    });
  });

  it.each(['suspended', 'interrupted'])('state が %s のとき、play() でも resume が呼ばれる', async (state) => {
    const ctx = makeStatefulContext(state);
    const player = createAudioPlayer(() => ctx as unknown as AudioContext);
    player.unlock();
    await vi.waitFor(() => {
      expect(ctx.resume).toHaveBeenCalled();
    });
    ctx.resume.mockClear();
    ctx.setState(state); // 裏に回って止まった状態を作る
    player.play('tap');
    await vi.waitFor(() => {
      expect(ctx.resume).toHaveBeenCalled();
    });
  });

  it("state が 'running' のとき、unlock() も play() も resume を呼ばない", async () => {
    const ctx = makeStatefulContext('running');
    const player = createAudioPlayer(() => ctx as unknown as AudioContext);
    player.unlock();
    await vi.waitFor(() => {
      // unlock 後も running なら resume は呼ばれない
      expect(ctx.resume).not.toHaveBeenCalled();
    });
    player.play('tap');
    expect(ctx.resume).not.toHaveBeenCalled();
  });
});

describe('sounds T2-09 追加修正a (止まる音の長さ)', () => {
  it('2. stop の音の終わり (startMs + durMs の最大) は 700〜800ms', () => {
    const end = Math.max(...SOUNDS.stop.map((n) => n.startMs + n.durMs));
    expect(end).toBeGreaterThanOrEqual(700);
    expect(end).toBeLessThanOrEqual(800);
  });
});
