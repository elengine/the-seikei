import type { GameDeps, GameInstance, GameProps, TutorialSpec } from '../../core/game/types';
import type { StageFit } from '../../core/viewport/viewport';
import { createGameFrame } from '../../core/ui/gameFrame';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import { drawBoard } from './renderer';
import { createWindingPanel } from './panel';
import { fromPx, hitEnd } from './geometry';
import { getContent, type Content } from '../../core/content/content';
import { init, reduce, starsOf, qualities, lastTapResult } from './logic';
import type { WindingState, WindingAction, Level } from './logic';
import { RANGE } from './params';

const TIE_ANIM_MS = 1000; // 帯の端を結ぶ演出の長さ
const DONE_WAIT_MS = 1500; // done のあと結果を出すまでの見せる時間
const SAVE_INTERVAL_MS = 1000; // 途中保存は1秒に1回まで

/**
 * ドラム巻きのプレイ画面 (P2 T2-07)。盤面 (Canvas) と操作欄をつなぐ。
 * 時間は requestAnimationFrame で進める。裏に回ったら止めてペダルを 0 にする。
 */
export function createWindingController(parent: HTMLElement, deps: GameDeps, props: GameProps, opts: {
  level: Level;
  patternId: string;
  sections: number;
  resume?: unknown;
  tutorial: TutorialSpec;
}): GameInstance {
  // ---- 状態 ----
  const startState = opts.resume as WindingState | undefined;
  let s: WindingState =
    startState !== undefined
      ? reduce(startState, { type: 'pausePedal' }) // 再開のときはペダル 0
      : init({ level: opts.level, patternId: opts.patternId, sections: opts.sections, seed: seedFromNow() });
  let lastFit: StageFit = { scale: 1, offsetX: 0, offsetY: 0 };
  let disposed = false;
  let finished = false;
  let rafId: number | null = null;
  let lastFrameMs: number | null = null; // 前のフレームの時刻 (visible に戻ったら測り直す)
  let saveTimer: ReturnType<typeof setInterval> | null = null;
  let tieTimer: ReturnType<typeof setInterval> | null = null;
  let doneTimer: ReturnType<typeof setTimeout> | null = null;
  let tieProgress = 0; // 帯の端を結ぶ演出 (0〜1)
  let ready = false; // 初期化が済んだか (frame より前のコールバックでは描かない)

  // ---- 枠 ----
  const frame = createGameFrame(parent, {
    title: deps.terms.t('game.winding'),
    onBack: () => props.onExit(),
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

  // ---- メッセージ (大人向けの文言。terms.render) ----
  function updateMessage(prev?: WindingState, next?: WindingState): void {
    const render = (t: string): string => deps.terms.render(t);
    if (s.phase === 'ready') {
      frame.message.textContent = render('{{pedal}}を踏むと巻き始めます。「巻き始める」を押してください');
      return;
    }
    if (s.phase === 'cutting') {
      frame.message.textContent = render('帯を巻き終えました。「帯の端を結ぶ」を押してください');
      return;
    }
    if (s.phase === 'broken') {
      // 効果音とメッセージは lastTapResult の結果で出し分ける
      const tap = prev !== undefined && next !== undefined ? lastTapResult(prev, next) : null;
      if (tap === 'wrongThread') {
        frame.message.textContent = render('その糸は切れていません');
      } else if (s.brk.kind === 'broken' && s.brk.firstTapped) {
        frame.message.textContent = render('もう一方の切れ端を押してください');
      } else {
        frame.message.textContent = render('糸が切れました。切れた糸を探して、つないでください');
      }
      return;
    }
    if (s.phase === 'winding') {
      const range = RANGE(s.level);
      if (s.tension > range.max) {
        frame.message.textContent = render('張りが強すぎます。{{pedal}}を戻してください');
      } else if (s.tension < range.min) {
        frame.message.textContent = render('張りが弱めです');
      } else {
        frame.message.textContent = render('適正な張りです');
      }
      return;
    }
    // done
    frame.message.textContent = render('完成しました');
  }

  // ---- 描画 ----
  function render(): void {
    const ctx = frame.stage.getContext('2d');
    if (ctx === null) {
      return; // Canvas が使えない環境 (テスト等)
    }
    drawBoard(ctx, lastFit, s, content, { threadCount: 8, show: showOf(s.level), timeMs: Date.now(), tieProgress });
  }

  function showOf(level: Level): 'red' | 'droop' | 'small' {
    return level === 1 ? 'red' : level === 2 ? 'droop' : 'small';
  }

  /** 現在時刻から種を作る */
  function seedFromNow(): number {
    let h = 0;
    for (const ch of deps.clock.now()) {
      h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    }
    return h;
  }

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
    const stars = starsOf(s);
    doneTimer = setTimeout(() => {
      doneTimer = null;
      if (disposed) {
        return;
      }
      const qs = qualities(s);
      const okRate = Math.round((qs.reduce((a: number, b: number) => a + b, 0) / qs.length) * 100);
      props.onFinish({
        gameId: 'winding',
        mode: props.mode,
        stars,
        stats: { breaks: s.breaks, wrongTaps: s.wrongTaps, okRate, [`level:${s.level}`]: stars },
        unlockedPatternIds: [],
        summary: [
          `適正な張りで巻いた割合 ${okRate}%`,
          `糸切れ ${s.breaks}回`,
          `違う糸を押した回数 ${s.wrongTaps}回`,
        ],
        finishedAt: deps.clock.now(),
      });
    }, DONE_WAIT_MS);
  }

  // ---- 操作の入口 ----
  function dispatch(a: WindingAction): void {
    if (s.phase === 'done' || finished || disposed) {
      return;
    }
    // 演出中は操作を受け付けない
    if (tieTimer !== null) {
      return;
    }
    const before = s;
    // 帯の端を結ぶ: 演出 (1秒) をしてから cut を送る
    if (a.type === 'cut' && s.phase === 'cutting') {
      startTieAnimation();
      return;
    }
    applyAction(a);
    void before;
  }

  function applyAction(a: WindingAction): void {
    const prev = s;
    const next = reduce(s, a);
    if (next === prev) {
      return;
    }
    s = next;
    // 効果音
    if (a.type === 'tapEnd') {
      const tap = lastTapResult(prev, s);
      if (tap === 'wrongThread') {
        deps.audio.play('gentleNo');
      } else if (tap === 'first') {
        deps.audio.play('tap');
      } else if (tap === 'tied') {
        deps.audio.play('knot');
      }
    } else if (a.type === 'start') {
      deps.audio.play('tap');
    } else if (a.type === 'setPedal') {
      // ペダルは音なし
    }
    saveState();
    if (s.phase === 'done') {
      updateMessage(prev, s);
      handleDone();
    } else {
      updateMessage(prev, s);
      refresh();
    }
  }

  /** 帯の端を結ぶ演出。1秒かけて tieProgress を 0→1 にし、終わってから cut を送る */
  function startTieAnimation(): void {
    tieProgress = 0;
    const startedAt = Date.now();
    tieTimer = setInterval(() => {
      if (disposed) {
        stopTieAnimation();
        return;
      }
      tieProgress = Math.min(1, (Date.now() - startedAt) / TIE_ANIM_MS);
      render();
      if (tieProgress >= 1) {
        stopTieAnimation();
        deps.audio.play('knot');
        const prev = s;
        const next = reduce(s, { type: 'cut' });
        if (next !== prev) {
          s = next;
          saveState();
          updateMessage(prev, s);
          if (s.phase === 'done') {
            handleDone();
          } else {
            refresh();
          }
        }
      }
    }, 50);
  }

  function stopTieAnimation(): void {
    if (tieTimer !== null) {
      clearInterval(tieTimer);
      tieTimer = null;
    }
  }

  // ---- 途中保存 (操作のたびと、1秒に1回) ----
  function saveState(): void {
    props.onStateChange?.(s);
  }
  saveTimer = setInterval(() => {
    if (!disposed && s.phase === 'winding') {
      saveState();
    }
  }, SAVE_INTERVAL_MS);

  // ---- 時間 (requestAnimationFrame) ----
  function loop(ms: number): void {
    if (disposed || finished) {
      rafId = null;
      return;
    }
    const dtMs = lastFrameMs === null ? 0 : Math.max(0, ms - lastFrameMs);
    lastFrameMs = ms;
    if (dtMs > 0) {
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
    } else {
      startLoop();
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  // ---- 盤面のタップ (切れ端を当てる) ----
  function onPointerDown(e: PointerEvent): void {
    if (s.phase !== 'broken' || finished || disposed || tieTimer !== null) {
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
  if (s.phase === 'ready' || s.phase === 'winding') {
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
