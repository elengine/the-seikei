import type { SoundName } from './sounds';
import { SOUNDS } from './sounds';

export interface AudioPlayer {
  unlock(): void; // 最初の操作のときに呼ぶ。AudioContext を作り resume する
  play(name: SoundName): void; // unlock 前、または無効時は何もしない
  setEnabled(on: boolean): void;
  setVolume(v: number): void; // 0〜1 に丸める
}

const FADE_MS = 10; // 音の頭と終わりのフェード。「プツッ」という音を防ぐ

export function createAudioPlayer(makeContext?: () => AudioContext): AudioPlayer {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null; // 全体の音量を掛ける共通の GainNode
  let enabled = true;
  let volume = 0.7; // 設定の初期値と同じ

  function makeMaster(): GainNode {
    const g = ctx!.createGain();
    g.gain.value = volume;
    g.connect(ctx!.destination);
    return g;
  }

  return {
    unlock(): void {
      if (ctx !== null) {
        void ctx.resume().catch(() => undefined); // 例外が起きても無視する
        return;
      }
      if (makeContext === undefined) {
        return;
      }
      try {
        ctx = makeContext();
        master = makeMaster();
        void ctx.resume().catch(() => undefined);
      } catch {
        // 音が鳴らなくても遊びは止めない。例外は投げずに無視する
        ctx = null;
        master = null;
      }
    },

    play(name: SoundName): void {
      if (ctx === null || master === null || !enabled) {
        return; // unlock 前、または無効時は何もしない
      }
      try {
        const notes = SOUNDS[name];
        if (notes === undefined) {
          return;
        }
        const t0 = ctx.currentTime;
        for (const note of notes) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = note.wave;
          osc.frequency.setValueAtTime(note.freq, t0 + note.startMs / 1000);
          // 頭と終わりに短いフェードを入れる
          const start = t0 + note.startMs / 1000;
          const end = start + note.durMs / 1000;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(note.gain, start + FADE_MS / 1000);
          gain.gain.setValueAtTime(note.gain, Math.max(start + FADE_MS / 1000, end - FADE_MS / 1000));
          gain.gain.linearRampToValueAtTime(0, end);
          osc.connect(gain);
          gain.connect(master);
          osc.start(start);
          osc.stop(end);
        }
      } catch {
        // 例外が起きても投げずに無視する
      }
    },

    setEnabled(on: boolean): void {
      enabled = on;
    },

    setVolume(v: number): void {
      volume = Math.min(1, Math.max(0, v)); // 0〜1 に丸める
      if (master !== null) {
        master.gain.value = volume;
      }
    },
  };
}
