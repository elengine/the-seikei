import type { Terms } from '../terms/terms';
import type { AudioPlayer } from '../audio/audio';
import type { Records } from '../game/records';
import type { Clock } from '../clock/clock';

export type GameId = 'creel' | 'winding' | 'drumsetup' | 'beaming' | 'shop' | 'itowari';

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
  summary?: string[]; // 結果画面にそのまま表示する文 (例「たしかめた回数 1回」)。resultLines が無いときの代わり
  resultLines?: { label: string; value: string }[]; // 結果画面の成績の行 (左に項目、右に値)
  starHint?: string; // 星3の条件 (例「1回目で合えば星3です」)
  next?: { label: string; start: () => void }; // 次のお題があれば。結果画面の右の主ボタン
  again?: () => void; // 「もう一度」で同じお題をやり直す (無ければゲームを作り直す)
  toList?: () => void; // 「一覧へ」でゲームのお題の一覧へ (無ければホームへ)
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
  /** 管理者メニューの「すべてのお題を開ける(確認用)」が入っているか。一覧の鍵を開けるときに読む (PU-18)。無ければ false 扱い */
  unlockAll?: () => boolean;
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
  summary?: string; // ホームのカードに出す一言の説明
  tutorial: TutorialSpec;
  mount(container: HTMLElement, props: GameProps): GameInstance;
}
