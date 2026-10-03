import type { GameDeps, GameProps, GameInstance, TutorialSpec } from '../../core/game/types';
import type { StageFit } from '../../core/viewport/viewport';
import { createGameFrame } from '../../core/ui/gameFrame';
import { openSheet } from '../../core/ui/sheet';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import { createDrumSetupPanel } from './panel';
import { openCalculatorBody } from './calculator';
import { messageFor, soundFor, resultOf } from './messages';
import { drawBoard } from './renderer';
import { init, reduce } from './logic';
import type { DrumSetupState, DrumSetupAction } from './logic';
import type { DrumSetupPuzzle } from './puzzles';
import { TRIAL_MS } from './params';
import { getContent, type Content } from '../../core/content/content';

/**
 * ドラム設定の進行 (T2c-03a)。ドラム巻きと同じ形:
 * GameFrame (盤面と操作欄) + 操作で logic の状態を進め、結果の画面は gameScreen に出す。
 * 試し巻きは約5秒かけて層を積み上げる (裏に回ったら絵を止めて結果だけ決める)。
 */

export interface DrumSetupControllerOpts {
  puzzle: DrumSetupPuzzle;
  tutorial: TutorialSpec;
  onBack: () => void;
}

export function createDrumSetupController(
  parent: HTMLElement,
  deps: GameDeps,
  props: GameProps,
  opts: DrumSetupControllerOpts,
): GameInstance {
  const content: Content = getContent();
  const p = opts.puzzle;
  /** 盤面の変換 (resize のあとに更新される) */
  let lastFit: StageFit | null = null;
  /** 今出している絵の状態 (試し巻きの進行と結果の文字) */
  let viewProgress = 0;
  let viewShowResult = false;
  /** 最後に描いたときの fit (リサイズされたら描き直す) */
  let lastPaintedFit: StageFit | null = null;
  let s: DrumSetupState = props.resume !== undefined ? (props.resume as DrumSetupState) : init(p);

  const frame = createGameFrame(parent, {
    title: deps.terms.t('game.drumsetup'),
    subtitle: `レベル${p.stage} ${p.name}`,
    logicalW: 1000,
    logicalH: 750,
    onBack: opts.onBack,
    onHelp: () => {
      void showTutorial(frame.root, opts.tutorial, { renderText: (t) => deps.terms.render(t) }).then(() => undefined);
    },
    onStageResize: (fit) => {
      lastFit = fit;
    },
  });

  /** 試し巻きの積み上げの経過 (ミリ秒) */
  let trialElapsedMs = 0;
  let done = false;
  let disposed = false;
  let finishedResult = false;
  let doneTimer: ReturnType<typeof setTimeout> | null = null;

  /** 電卓のシート (開いていれば閉じる) */
  let closeCalc: (() => void) | null = null;

  function openCalculator(): void {
    if (closeCalc !== null || s.phase === 'trial') {
      return;
    }
    const sheet = openSheet({ parent: frame.root, title: deps.terms.t('drumsetup.calculator'), onClose: () => { closeCalc = null; } });
    openCalculatorBody(sheet.body, {
      onUse: (v) => {
        applyAction({ type: 'setFeed', value: v });
        // 入れたら電卓を閉じる (盤面と「試し巻き」を見られるように)
        closeCalc?.();
        closeCalc = null;
      },
    });
    closeCalc = sheet.close;
  }

  const panel = createDrumSetupPanel(frame.panel, {
    puzzle: p,
    onAction: (a) => applyAction(a),
    onOpenCalculator: () => openCalculator(),
    onNotice: (text) => {
      frame.message.textContent = text;
    },
  });

  /** 1回分の描画 (盤面 + メッセージ)。progress と結果の文字の状態を覚えておく */
  function render(progress: number, showResult: boolean): void {
    viewProgress = progress;
    viewShowResult = showResult;
    paint();
  }

  /** 今の状態で盤面とメッセージを描く */
  function paint(): void {
    panel.update(s);
    frame.message.textContent = messageFor(s, (t) => deps.terms.t(t));
    const fit = lastFit;
    if (fit === null) {
      return;
    }
    lastPaintedFit = fit;
    const ctx = frame.stage.getContext('2d');
    if (ctx === null) {
      return;
    }
    drawBoard(ctx, fit, p, {
      angle: s.angle,
      feed: s.feed,
      outcome: s.lastResult !== null ? s.lastResult.outcome : null,
      progress: viewProgress,
      showResult: viewShowResult,
    }, content);
  }

  /** 操作を状態に反映する (音・保存・終わりの処理もここで) */
  function applyAction(a: DrumSetupAction): void {
    if (disposed || done) {
      return;
    }
    // 試し巻きのあいだは操作できない (試し巻きが終わる操作だけは通す)
    if (s.phase === 'trial' && a.type !== 'trialEnd') {
      return;
    }
    const prev = s;
    const next = reduce(s, p, a);
    if (next === s) {
      return;
    }
    s = next;
    const sound = soundFor(a, prev, s);
    if (sound !== null) {
      deps.audio.play(sound);
    }
    props.onStateChange?.(s);
    if (s.phase === 'done' && !done) {
      done = true;
      finish();
    }
    // 試し巻きのあいだは 0 から積み上げる。それ以外は、結果があれば絵と文字を残す
    if (a.type === 'trial' && s.phase === 'trial') {
      render(0, false);
    } else {
      render(s.lastResult !== null ? 1 : 0, s.lastResult !== null);
    }
  }

  /** 結果の画面 (gameScreen) へ渡す */
  function finish(): void {
    if (finishedResult) {
      return;
    }
    finishedResult = true;
    doneTimer = setTimeout(() => {
      doneTimer = null;
      props.onFinish(resultOf(s, p, props.mode, deps.clock.now()));
    }, 1500);
  }

  /** 試し巻きを1フレーム進める */
  function stepTrial(dtMs: number): void {
    trialElapsedMs = Math.min(TRIAL_MS, trialElapsedMs + dtMs);
    if (trialElapsedMs >= TRIAL_MS) {
      render(1, true);
      applyAction({ type: 'trialEnd' });
      trialElapsedMs = 0;
      return;
    }
    render(trialElapsedMs / TRIAL_MS, false);
  }

  const loop = createGameLoop(frame, (dtMs) => {
    if (s.phase === 'trial') {
      stepTrial(dtMs);
    } else if (lastFit !== null && lastFit !== lastPaintedFit) {
      paint(); // リサイズで Canvas が作り直されたら描き直す
    }
  });

  /** 裏に回ったら試し巻きの絵を止めて、結果だけ決める */
  function onVisibility(): void {
    if (document.visibilityState === 'hidden' && s.phase === 'trial') {
      trialElapsedMs = TRIAL_MS;
      stepTrial(TRIAL_MS);
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  // 初回表示 (層はまだ積んでいない。試し巻きで積み上がる)
  render(0, false);
  loop.start();

  return {
    suspend(): unknown {
      return s;
    },
    unmount(): void {
      disposed = true;
      loop.stop();
      document.removeEventListener('visibilitychange', onVisibility);
      if (doneTimer !== null) {
        clearTimeout(doneTimer);
        doneTimer = null;
      }
      if (closeCalc !== null) {
        closeCalc();
        closeCalc = null;
      }
      panel.destroy();
      frame.destroy();
    },
  };
}

/** requestAnimationFrame のループ (ドラム巻きと同じ形) */
function createGameLoop(frame: ReturnType<typeof createGameFrame>, onFrame: (dtMs: number) => void): { start(): void; stop(): void } {
  let rafId = 0;
  let running = false;
  let last = 0;
  function tick(now: number): void {
    if (!running) {
      return;
    }
    const dtMs = last === 0 ? 16 : Math.min(100, now - last);
    last = now;
    onFrame(dtMs);
    rafId = requestAnimationFrame(tick);
  }
  return {
    start(): void {
      if (running) {
        return;
      }
      running = true;
      last = 0;
      rafId = requestAnimationFrame(tick);
    },
    stop(): void {
      running = false;
      cancelAnimationFrame(rafId);
    },
  };
}
