import type { GameDeps, GameInstance, GameProps, TutorialSpec } from '../../core/game/types';
import type { StageFit } from '../../core/viewport/viewport';
import { createGameFrame } from '../../core/ui/gameFrame';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import { drawBoard } from './renderer';
import { createWindingPanel } from './panel';
import { fromPx, hitEnd } from './geometry';
import { getContent, type Content } from '../../core/content/content';
import { init, reduce, seedFromText } from './logic';
import { messageFor, soundFor, resultOf } from './messages';
import type { WindingState, WindingAction, Level } from './logic';
import { RANGE } from './params';

const TIE_ANIM_MS = 1000; // 帯の端を結ぶ演出の長さ
const DONE_WAIT_MS = 1500; // done のあと結果を出すまでの見せる時間
const SAVE_INTERVAL_MS = 1000; // 途中保存は1秒に1回まで

/**
 * ドラム巻きのプレイ画面 (P2 T2-07)。盤面と操作欄をつなぐ。
 * 時間は requestAnimationFrame。裏に回ったら止めてペダルを 0 にする。
 */
export function createWindingController(parent: HTMLElement, deps: GameDeps, props: GameProps, opts: {
  level: Level;
  patternId: string;
  sections: number;
  resume?: unknown;
  tutorial: TutorialSpec;
  onBack: () => void; // 「戻る」(確認は呼び出し側で行う)
}): GameInstance {
  // ---- 状態 ----
  const startState = opts.resume as WindingState | undefined;
  let s: WindingState =
    startState !== undefined
      ? reduce(startState, { type: 'pausePedal' }) // 再開のときはペダル 0
      : init({ level: opts.level, patternId: opts.patternId, sections: opts.sections, seed: seedFromText(deps.clock.now()) });
  let lastFit: StageFit = { scale: 1, offsetX: 0, offsetY: 0 };
  let disposed = false;
  let finished = false;
  let rafId: number | null = null;
  let lastFrameMs: number | null = null; // 前のフレームの時刻 (visible に戻ったら測り直す)
  let saveTimer: ReturnType<typeof setInterval> | null = null;
  let doneTimer: ReturnType<typeof setTimeout> | null = null;
  let tieProgress = 0; // 帯の端を結ぶ演出 (0〜1、進行中は 0 超)
  let tieElapsedMs = 0; // 結びの演出の経過時間 (rAF の時刻で進める)
  let tieRunning = false; // 結びの演出中か
  let nowMs = 0; // いまの rAF の時刻 (時刻が必要な処理に渡す)
  let ready = false; // 初期化が済んだか (frame より前のコールバックでは描かない)

  // ---- 枠 ----
  const frame = createGameFrame(parent, {
    title: deps.terms.t('game.winding'),
    onBack: opts.onBack,
    onHelp: () => {
      void showTutorial(frame.root, opts.tutorial, { renderText: (t) => deps.terms.render(t) }).then(() => undefined);
    },
    logicalW: 1000,
    logicalH: 750,
    onStageResize: (fit) => {
      lastFit = fit;
      if (ready) {
        refresh();
      }
    },
  });

  // ---- 操作欄 ----
  const panel = createWindingPanel(frame.panel, {
    terms: deps.terms,
    range: RANGE(opts.level),
    onAction: (a: WindingAction) => {
      dispatch(a);
    },
  });

  // ---- メッセージ (大人向けの文言。terms.render。文は messages.ts) ----
  function updateMessage(prev?: WindingState, next?: WindingState): void {
    frame.message.textContent = messageFor(s, prev, next, (x) => deps.terms.render(x), s.level);
  }

  // ---- 描画 ----
  function render(): void {
    const ctx = frame.stage.getContext('2d');
    if (ctx === null) {
      return; // Canvas が使えない環境 (テスト等)
    }
    drawBoard(ctx, lastFit, s, content, { threadCount: 8, show: showOf(s.level), timeMs: nowMs, tieProgress });
  }

  /** 糸切れの見せ方 (難易度) */
  const showOf = (level: Level): 'red' | 'droop' | 'small' =>
    (level === 1 ? 'red' : level === 2 ? 'droop' : 'small') as 'red' | 'droop' | 'small';

  const content: Content = getContent();

  // ---- 画面の更新 ----
  function refresh(): void {
    render();
    panel.update(s);
  }

  // ---- 完了処理 ----
  function handleDone(): void {
    finished = true;
    stopLoop();
    refresh();
    doneTimer = setTimeout(() => {
      doneTimer = null;
      if (disposed) {
        return;
      }
      props.onFinish(resultOf(s, props.mode, deps.clock.now()));
    }, DONE_WAIT_MS);
  }

  // ---- 操作の入口 ----
  function dispatch(a: WindingAction): void {
    if (s.phase === 'done' || finished || disposed) {
      return;
    }
    // 演出中は操作を受け付けない
    if (tieRunning) {
      return;
    }
    // 帯の端を結ぶ: 演出 (1秒) をしてから cut を送る
    if (a.type === 'cut' && s.phase === 'cutting') {
      startTieAnimation();
      return;
    }
    applyAction(a);
  }

  function applyAction(a: WindingAction): void {
    const prev = s;
    const next = reduce(s, a);
    if (next === prev) {
      return;
    }
    s = next;
    // 効果音
    const sound = soundFor(a, prev, s);
    if (sound !== null) {
      deps.audio.play(sound);
    }
    saveState();
    updateMessage(prev, s);
    if (s.phase === 'done') {
      handleDone();
    } else {
      refresh();
    }
  }

  /** 帯の端を結ぶ演出。loop の中で tieElapsedMs を進め、TIE_ANIM_MS で cut を送る */
  function startTieAnimation(): void {
    tieProgress = 0;
    tieElapsedMs = 0;
    tieRunning = true;
    startLoop();
  }

  function stopTieAnimation(): void {
    tieRunning = false;
    tieProgress = 0;
    tieElapsedMs = 0;
  }

  /** 結びの演出を 1フレーム進める (dtMs は rAF の差分)。終わったら cut を送る */
  function stepTieAnimation(dtMs: number): void {
    tieElapsedMs += dtMs;
    tieProgress = Math.min(1, tieElapsedMs / TIE_ANIM_MS);
    render();
    if (tieProgress >= 1) {
      const wasRunning = tieRunning;
      stopTieAnimation();
      if (wasRunning) {
        deps.audio.play('knot');
        applyAction({ type: 'cut' });
      }
    }
  }

  // ---- 途中保存 (操作のたびと、1秒に1回) ----
  function saveState(): void {
    props.onStateChange?.(s);
  }
  saveTimer = setInterval(() => {
    if (!disposed && s.phase === 'winding') saveState();
  }, SAVE_INTERVAL_MS);

  // ---- 時間 (requestAnimationFrame) ----
  function loop(ms: number): void {
    if (disposed || finished) {
      rafId = null;
      return;
    }
    nowMs = ms; // 揺らしの表示などに使う時刻 (clock ではなく rAF の時刻)
    const dtMs = lastFrameMs === null ? 0 : Math.max(0, ms - lastFrameMs);
    lastFrameMs = ms;
    if (dtMs > 0) {
      if (tieRunning) {
        stepTieAnimation(dtMs);
      }
      const prev = s;
      const next = reduce(s, { type: 'tick', dtMs });
      if (next !== prev) {
        s = next;
        if (s.phase === 'broken') {
          // 糸が切れた: 機械の止まる音
          deps.audio.play('stop');
        }
        updateMessage(prev, s);
        refresh();
      } else if (tieRunning || s.phase === 'winding' || s.phase === 'broken') {
        // 状態が変わらなくても、揺らしや演出のために毎フレーム盤面だけ描き直す
        render();
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  function startLoop(): void {
    if (disposed || finished || rafId !== null) {
      return;
    }
    lastFrameMs = null; // 経過時間は測り直す (大きな差を送らない)
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastFrameMs = null;
  }

  // ---- 裏に回ったとき ----
  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      stopLoop();
      // ペダルを 0 にする (戻ったときに機械が勝手に動かないように)
      const next = reduce(s, { type: 'pausePedal' });
      if (next !== s) {
        s = next;
        refresh();
      }
    } else startLoop();
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  // ---- 盤面のタップ (切れ端を当てる) ----
  function onPointerDown(e: PointerEvent): void {
    if (s.phase !== 'broken' || finished || disposed || tieRunning) {
      return; // 'broken' 以外のときは何もしない
    }
    const rect = frame.stage.getBoundingClientRect();
    const logical = fromPx(lastFit, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    const hit = hitEnd(logical, 8, lastFit.scale);
    if (hit !== null) {
      dispatch({ type: 'tapEnd', thread: hit.thread, side: hit.side });
    }
  }
  frame.stage.addEventListener('pointerdown', onPointerDown);

  // ---- 初期表示 ----
  if (s.phase !== 'done') {
    // 'done' 以外はどの phase でもループを回す (broken・cutting で再開しても動く)
    startLoop();
  }
  updateMessage();
  ready = true;
  refresh();

  return {
    suspend(): unknown {
      if (finished) {
        return null; // 結果が出たあとは途中保存しない
      }
      return s;
    },
    unmount(): void {
      disposed = true;
      stopLoop();
      stopTieAnimation();
      if (saveTimer !== null) {
        clearInterval(saveTimer);
        saveTimer = null;
      }
      if (doneTimer !== null) {
        clearTimeout(doneTimer);
        doneTimer = null;
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      frame.stage.removeEventListener('pointerdown', onPointerDown);
      panel.destroy();
      frame.destroy();
    },
  };
}
