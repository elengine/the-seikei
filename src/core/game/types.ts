import type { Terms } from '../terms/terms';
import type { AudioPlayer } from '../audio/audio';
import type { Records } from '../game/records';
import type { Clock } from '../clock/clock';

export type GameId = 'creel' | 'winding' | 'beaming' | 'shop';

export interface TutorialPage {
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  text: string;
}

export interface TutorialSpec {
  pages: TutorialPage[];
}

export interface JobSpec {
  orderId: string;
  patternId: string;
  ends: number;
  lengthM: number;
  sections: number;
  difficulty: 1 | 2 | 3;
}

export interface GameResult {
  gameId: GameId;
  mode: 'standalone' | 'job';
  stars: 1 | 2 | 3;
  stats: Record<string, number>;
  unlockedPatternIds: string[];
  finishedAt: string;
}

export interface GameProps {
  mode: 'standalone' | 'job'; // 単独プレイか、経営シミュレーションの仕事か
  job?: JobSpec; // mode='job' のときの注文内容(本数・長さ・柄など)
  resume?: unknown; // 途中保存からの再開データ
  onStateChange?: (state: unknown) => void; // 途中保存してほしい状態が変わったとき(ゲームが呼ぶ)
  onFinish: (result: GameResult) => void;
  onExit: () => void; // 途中でホームへ戻る
}

/** ゲームが使ってよい共通の道具。ゲームは AppContext を直接受け取らず、これだけを使う */
export interface GameDeps {
  terms: Terms;
  audio: AudioPlayer;
  records: Records;
  clock: Clock;
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export interface GameInstance {
  suspend(): unknown; // 途中保存用に現在の状態を返す
  unmount(): void; // イベント・タイマー・アニメーションをすべて解除
}

export interface GameModule {
  id: GameId;
  titleTermKey: string; // 表示名は用語辞書から引く
  phase: 'P1' | 'P2' | 'P3' | 'P5';
  embeddable: boolean; // 経営シミュレーションから呼べるか
  tutorial: TutorialSpec;
  mount(container: HTMLElement, props: GameProps): GameInstance;
}
