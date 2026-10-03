import type { GameDeps, GameInstance, GameProps, TutorialSpec } from '../../core/game/types';
import type { StageFit } from '../../core/viewport/viewport';
import { createGameFrame } from '../../core/ui/gameFrame';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import { drawBoard } from './renderer';
import { PIN_ANGLE0 } from './renderer.parts';
import { createWindingPanel } from './panel';
import { fromPx, hitBrokenThread } from './geometry';
import { getContent, type Content } from '../../core/content/content';
import { init, reduce, seedFromText } from './logic';
import { speedOf } from '../../core/mechanics/pedal';
import { messageFor, soundFor, resultOf } from './messages';
import type { WindingState, WindingAction, Level } from './logic';
import { MESSAGE_HOLD_MS, DRUM_TURN_PER_SPEED, DRUM_EASE_UP_MS, DRUM_EASE_DOWN_MS, DRUM_STOP_MS, TENSION } from './params';

const LEVEL_NAMES: Record<Level, string> = { 1: '初級', 2: '中級', 3: '上級' };
const TIE_ANIM_MS = 1000; // 帯の端を結ぶ演出の長さ
const PIN_TURN_MS = 800; // 結ぶ前にピンを正面へ回す時間 (0.6〜1 秒のまんなか)
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
  /** お題の情報 (T2-14a。あれば題名の下に「段階N 柄の名前」を出し、State の puzzleId に入れる) */
  puzzleStage?: number;
  puzzleName?: string;
  puzzleId?: string;
  tutorial: TutorialSpec;
  onBack: () => void; // 「戻る」(確認は呼び出し側で行う)
}): GameInstance {
  // ---- 状態 ----
  const startState = opts.resume as WindingState | undefined;
  let s: WindingState =
    startState !== undefined
      ? reduce(startState, { type: 'pausePedal' }) // 再開のときはペダル 0
      : init({
          level: opts.level,
          patternId: opts.patternId,
          sections: opts.sections,
          seed: seedFromText(deps.clock.now()),
          puzzleId: opts.puzzleId ?? '',
        });
  let lastFit: StageFit = { scale: 1, offsetX: 0, offsetY: 0 };
  let disposed = false;
  let finished = false;
  let rafId: number | null = null;
  let lastFrameMs: number | null = null; // 前のフレームの時刻 (visible に戻ったら測り直す)
  let saveTimer: ReturnType<typeof setInterval> | null = null;
  let doneTimer: ReturnType<typeof setTimeout> | null = null;
  let tieProgress = 0; // 帯の端を結ぶ演出 (0〜1、進行中は 0 超)
let drumAngle = 0; // ドラムが回って見える角度 (ラジアン。見た目だけの値。State には入らない。T2-10b)
let drumOmega = 0; // 角速度 (rad/s)。目標へなめらかに近づける (T2-10 追加修正 b)
let drumStopping = false; // 糸が切れて急停止する途中か
let pinTurnMs = -1; // 結ぶ前の、ピンを正面へ回す演出の経過時間 (-1 は回していない)
let pinTurnPrevEased = 0; // 前フレームの ease の値 (角速度を決めるのに使う)
  let tieElapsedMs = 0; // 結びの演出の経過時間 (rAF の時刻で進める)
  let tieRunning = false; // 結びの演出中か
  let nowMs = 0; // いまの rAF の時刻 (時刻が必要な処理に渡す)
  let ready = false; // 初期化が済んだか (frame より前のコールバックでは描かない)

  // ---- 枠 ----
  const frame = createGameFrame(parent, {
    title: deps.terms.t('game.winding'),
    // 今のお題。お題で開いたときは「段階N 柄の名前」、それ以外 (仕事モードなど) は難易度と帯の数 (T2-14a)
    subtitle:
      opts.puzzleStage !== undefined && opts.puzzleName !== undefined
        ? `段階${opts.puzzleStage} ${opts.puzzleName}`
        : `${LEVEL_NAMES[opts.level]} 帯 ${opts.sections}本`,
    onBack: opts.onBack,
    onHelp: () => {
      void showTutorial(frame.root, opts.tutorial, { renderText: (t) => deps.terms.render(t) }).then(() => undefined);
    },
    logicalW: 1000,
    logicalH: 750,
    portraitStageRatio: 0.4, // 縦長では盤面を小さくして、ペダルをスクロールなしで見えるようにする
    onStageResize: (fit) => {
      lastFit = fit;
      if (ready) {
        refresh();
      }
    },
  });

  // ---- 操作欄 ----
  // メーターの範囲は State のもの (お題ごとに決まる。T2-09a)。update のたびに panel へ渡す
  const panel = createWindingPanel(frame.panel, {
    terms: deps.terms,
    onAction: (a: WindingAction) => {
      dispatch(a);
    },
    onNotice: (text: string) => {
      frame.message.textContent = text; // 押せないボタンの理由 (次の更新までメッセージ欄に出る)
    },
  });

  // ---- メッセージ (大人向けの文言。terms.render。文は messages.ts) ----
  // 張りのメッセージ (適正・強すぎ・弱め) は、新しい状態が MESSAGE_HOLD_MS 続いてから切り替える
  // (境目の近くで細かく動くと 1 行と 2 行が高速に入れ替わるため。T2-07 追加修正2)。
  // 糸が切れた・帯を巻き終えたなど、張り以外のメッセージはすぐに切り替える。
  let pendingMsg: { text: string; sinceMs: number } | null = null;
  let shownMsg = '';
  function setMessage(text: string, holdMs: boolean): void {
    if (!holdMs) {
      pendingMsg = null;
      shownMsg = text;
      frame.message.textContent = text;
      return;
    }
    if (text === shownMsg) {
      pendingMsg = null; // 表示中と同じ文に戻ったら、待っていた切替を取り消す
      return;
    }
    if (pendingMsg !== null && pendingMsg.text !== text) {
      pendingMsg = { text, sinceMs: nowMs }; // 待っているあいだに別の文になったら、そこから測り直す
      return;
    }
    if (pendingMsg === null) {
      pendingMsg = { text, sinceMs: nowMs };
      return;
    }
    if (nowMs - pendingMsg.sinceMs >= MESSAGE_HOLD_MS) {
      pendingMsg = null;
      shownMsg = text;
      frame.message.textContent = text;
    }
  }
  function updateMessage(prev?: WindingState, next?: WindingState): void {
    const text = messageFor(s, prev, next, (x) => deps.terms.render(x));
    // 引っかかりの文は待たずにすぐ出す (糸が切れたときと同じ扱い)。待つのは張りの 3 文だけ
    const urgent = s.phase !== 'winding' || s.pedal.snag > 0;
    setMessage(text, !urgent);
  }

  // ---- 描画 ----
  function render(): void {
    const ctx = frame.stage.getContext('2d');
    if (ctx === null) {
      return; // Canvas が使えない環境 (テスト等)
    }
    drawBoard(ctx, lastFit, s, content, { threadCount: 8, show: showOf(s.level), timeMs: nowMs, tieProgress, drumAngle });
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
      if (pinTurnMs >= 0) {
        pinTurnMs += dtMs;
      }
      if (tieRunning) {
        stepTieAnimation(dtMs);
      }
      // ドラムが回って見える角度。角速度は目標へなめらかに近づける (重いドラムの手応え。T2-10 追加修正 b)。
      // 糸が切れたときだけ急に止める (DRUM_STOP_MS)
      {
        const speed = speedOf(s.pedal, TENSION);
        const winding = s.phase === 'winding';
        let target = winding && speed > 0 ? speed * DRUM_TURN_PER_SPEED : 0;
        if (pinTurnMs >= 0) {
          // ピンを正面の少し左 (sin θpin = -0.5) へなめらかに回す (T2-10 追加修正 b)
          const k = Math.min(1, pinTurnMs / PIN_TURN_MS);
          const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease-in-out
          const pinTarget = -Math.PI / 6; // sin = -0.5
          const goal = pinTarget - PIN_ANGLE0;
          target = goal * Math.max(0, (eased - pinTurnPrevEased) / Math.max(0.001, dtMs / PIN_TURN_MS)) * (PIN_TURN_MS / 1000) / Math.max(0.001, PIN_TURN_MS / 1000);
          pinTurnPrevEased = eased;
          if (k >= 1) {
            pinTurnMs = -1;
            pinTurnPrevEased = 0;
            target = 0;
          }
        }
        const easeMs = drumStopping ? DRUM_STOP_MS : target > drumOmega ? DRUM_EASE_UP_MS : DRUM_EASE_DOWN_MS;
        // DRUM_EASE_MS は「目標の 9 割に達するまでの時間」(管理者の指定値)。係数は指数で近づける
        const alpha = 1 - Math.exp(-dtMs / (easeMs / 2.3));
        drumOmega += (target - drumOmega) * alpha;
        if (target === 0 && drumOmega < 0.05) {
          drumOmega = 0; // ほぼ止まったら 0 に落とす
          drumStopping = false;
        }
        drumAngle += drumOmega * (dtMs / 1000);
      }
      const prev = s;
      const next = reduce(s, { type: 'tick', dtMs });
      if (next !== prev) {
        s = next;
        if (s.phase === 'broken' && prev.phase !== 'broken') {
          // 糸が切れた: 機械の止まる音 ('broken' に変わった瞬間の1回だけ)。ドラムは急停止
          drumStopping = true;
          deps.audio.play('stop');
        }
        if (s.phase === 'cutting' && prev.phase !== 'cutting') {
          // 帯を巻き終えた: ピンが正面に来るまでドラムを回してから結ぶ (T2-10 追加修正 b)
          pinTurnMs = 0;
          pinTurnPrevEased = 0;
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

  // ---- 盤面のタップ (切れた糸のあたりを押してつなぐ。T2-13c: 1回押し) ----
  function onPointerDown(e: PointerEvent): void {
    if (s.phase !== 'broken' || finished || disposed || tieRunning) {
      return; // 'broken' 以外のときは何もしない
    }
    const rect = frame.stage.getBoundingClientRect();
    const logical = fromPx(lastFit, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    // クリールの糸道の印から筬までの区間で、押した点にいちばん近い糸
    const broken = s.brk.kind === 'broken' ? s.brk.threads : [];
    const thread = hitBrokenThread(logical, broken, 8, lastFit.scale, s.current, s.sections);
    if (thread !== null) {
      // 切れた糸でも切れていない糸でも、押した糸をそのまま送る (wrongThread は reduce で数える)
      dispatch({ type: 'tapThread', thread });
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
