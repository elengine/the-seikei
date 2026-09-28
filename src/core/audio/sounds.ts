export type SoundName = 'tap' | 'ok' | 'gentleNo' | 'knot' | 'page' | 'fanfare';

export interface Note {
  freq: number; // Hz (250〜2000)
  startMs: number; // 音の開始時刻 (鳴らし始めからの経過)
  durMs: number; // 長さ
  wave: 'sine' | 'triangle';
  gain: number; // 0.5 以下
}

/**
 * 音の設計図。純粋なデータで、再生方法 (audio.ts) から独立している。
 * 高齢者にも聞き取りやすいよう周波数は 250〜2000Hz。
 */
export const SOUNDS: Record<SoundName, Note[]> = {
  // ボタン: 高めの短い音 1つ (約60ms)
  tap: [{ freq: 880, startMs: 0, durMs: 60, wave: 'sine', gain: 0.3 }],
  // 正解・成功: 上がる2音
  ok: [
    { freq: 660, startMs: 0, durMs: 120, wave: 'sine', gain: 0.35 },
    { freq: 880, startMs: 120, durMs: 160, wave: 'sine', gain: 0.35 },
  ],
  // 違う操作: 低めでやわらかい短い音 1つ。責める感じにしない
  gentleNo: [{ freq: 330, startMs: 0, durMs: 150, wave: 'sine', gain: 0.25 }],
  // 糸を結んだ: 小さな3連音
  knot: [
    { freq: 523, startMs: 0, durMs: 80, wave: 'triangle', gain: 0.3 },
    { freq: 659, startMs: 90, durMs: 80, wave: 'triangle', gain: 0.3 },
    { freq: 784, startMs: 180, durMs: 120, wave: 'triangle', gain: 0.3 },
  ],
  // チュートリアルのページ送り: 短い1音
  page: [{ freq: 740, startMs: 0, durMs: 70, wave: 'sine', gain: 0.25 }],
  // クリア: ド・ミ・ソ・ド の上昇
  fanfare: [
    { freq: 523, startMs: 0, durMs: 180, wave: 'triangle', gain: 0.4 }, // ド
    { freq: 659, startMs: 180, durMs: 180, wave: 'triangle', gain: 0.4 }, // ミ
    { freq: 784, startMs: 360, durMs: 180, wave: 'triangle', gain: 0.4 }, // ソ
    { freq: 1046, startMs: 540, durMs: 320, wave: 'triangle', gain: 0.4 }, // ド
  ],
};
