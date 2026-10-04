import { createGameFrame } from '../../core/ui/gameFrame';
import type { GameFrame } from '../../core/ui/gameFrame';
import { openSheet } from '../../core/ui/sheet';
import type { Sheet } from '../../core/ui/sheet';
import type { StageFit } from '../../core/viewport/viewport';
import type { GameDeps, GameInstance, GameProps } from '../../core/game/types';
import { MACHINE, laneArea } from './geometry';
import { init, reduce, isValidResume } from './logic';
import type { ItowariAction, ItowariState } from './logic';
import { createItowariPanel } from './panel';
import { failLines, resultOfGame } from './messages';
import { drawBoard } from './renderer';
import { getContent } from '../../core/content/content';
import { itowariPuzzles } from './puzzles';
import { openCalculatorBody } from '../drumsetup/calculator';

/**
 * 糸割りの画面の動き (P2b T2b-03a)。盤面 (renderer) と操作欄 (panel) を置き、
 * 巻きの進みを requestAnimationFrame で回す。失敗は重ね表示、成功は結果の画面。
 */

/** 結果の画面を出すまでの待ち時間 (ミリ秒) */
const DONE_WAIT_MS = 1500;

interface ControllerOpts {
  puzzleId: string;
  resume?: unknown;
  onBack: () => void;
}

export function createItowariController(
  parent: HTMLElement,
  deps: GameDeps,
  props: GameProps,
  opts: ControllerOpts,
): GameInstance {
  const puzzle = itowariPuzzles(getContent()).find((p) => p.id === opts.puzzleId) ?? itowariPuzzles(getContent())[0]!;
  const s0 = isValidResume(opts.resume) ? (opts.resume as ItowariState) : init(puzzle);
  let s = s0;
  let disposed = false;
  let finished = false;
  let windT = 0;
  let lastTs: number | null = null;
  let rafId = 0;

  let lastFit: StageFit = { scale: 1, offsetX: 0, offsetY: 0 };
  const frame: GameFrame = createGameFrame(parent, {
    title: deps.terms.t('game.itowari'),
    subtitle: `レベル${puzzle.level} ${puzzle.name}`,
    onBack: () => opts.onBack(),
    onHelp: () => frame.notify('遊び方は準備中です'),
    logicalW: MACHINE.w,
    logicalH: MACHINE.h,
    message: false,
    onStageResize: (f) => {
      lastFit = f;
    },
  });

  let failSheet: Sheet | null = null;
  const panel = createItowariPanel(frame.panel, {
    onAction: (a) => dispatch(a),
    onNotice: (t) => frame.notify(t),
    onCalculator: openCalculator,
    puzzle,
  });

  function render(): void {
    const ctx = frame.stage.getContext('2d');
    if (ctx === null) {
      return;
    }
    drawBoard(ctx, lastFit, s, getContent(), puzzle, windT);
  }

  function refresh(): void {
    panel.update(s);
    render();
  }

  function openCalculator(): void {
    const sheet = openSheet({ parent: frame.root, title: '電卓' });
    openCalculatorBody(sheet.body, {
      tables: false,
      onUse: (v: number) => {
        panel.setLength(v);
        sheet.close();
      },
    });
  }

  function showFailSheet(): void {
    if (failSheet !== null && failSheet.isOpen()) return;
    failSheet = openSheet({ parent: frame.root, title: '足りないものがあります' });
    const body = failSheet.body;
    body.classList.add('itowari-fail');
    for (const line of failLines(s, puzzle)) {
      const p = document.createElement('p');
      p.className = 'itowari-fail__line';
      p.textContent = line;
      body.appendChild(p);
    }
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn--primary itowari-fail__retry';
    retry.textContent = '長さを設定し直す';
    retry.addEventListener('click', () => {
      failSheet?.close();
      failSheet = null;
      dispatch({ type: 'retry' });
    });
    body.appendChild(retry);
  }

  function handleDone(): void {
    if (finished) return;
    finished = true;
    refresh();
    window.setTimeout(() => {
      if (disposed) return;
      props.onFinish(resultOfGame(s, puzzle, props.mode, deps.clock.now()));
    }, DONE_WAIT_MS);
  }

  function dispatch(a: ItowariAction): void {
    if (disposed || finished) return;
    const next = reduce(s, a, puzzle);
    if (next === s) return;
    s = next;
    if (a.type !== 'tick') props.onStateChange?.(s);
    if (s.phase === 'failed') {
      refresh();
      showFailSheet();
      return;
    }
    if (s.phase === 'done') {
      handleDone();
      return;
    }
    refresh();
  }

  function loop(ts: number): void {
    if (disposed) return;
    const dt = lastTs === null ? 16 : Math.max(0, ts - lastTs);
    lastTs = ts;
    if (s.phase === 'winding') {
      windT += dt / 1000;
      const next = reduce(s, { type: 'tick', dtMs: dt }, puzzle);
      if (next !== s) {
        s = next;
        panel.update(s);
        if (s.phase === 'failed') {
          render();
          showFailSheet();
        } else if (s.phase === 'done') {
          render();
          handleDone();
        } else {
          render();
        }
      } else {
        render();
      }
    }
    rafId = window.requestAnimationFrame(loop);
  }

  // 口を押して選ぶ (setup のあいだだけ)
  function onStageClick(ev: MouseEvent): void {
    if (disposed || s.phase !== 'setup') return;
    const rect = frame.stage.getBoundingClientRect();
    if (rect.width === 0) return;
    const fit = lastFit;
    const narrow = (MACHINE.w / 12) * fit.scale < 64;
    const pxPerCss = frame.stage.width / rect.width;
    const x = ((ev.clientX - rect.left) * pxPerCss - fit.offsetX) / fit.scale;
    const y = ((ev.clientY - rect.top) * pxPerCss - fit.offsetY) / fit.scale;
    for (let i = 0; i < puzzle.sources.length; i++) {
      const area = laneArea(i, narrow);
      if (x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h) {
        panel.select(i);
        return;
      }
    }
  }
  frame.stage.addEventListener('click', onStageClick);

  refresh();
  rafId = window.requestAnimationFrame(loop);
  const autosave = window.setInterval(() => {
    if (!disposed && !finished && s.phase === 'winding') props.onStateChange?.(s);
  }, 1000);

  return {
    suspend(): unknown {
      return finished ? undefined : s;
    },
    unmount(): void {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      window.clearInterval(autosave);
      failSheet?.close();
      failSheet = null;
      frame.stage.removeEventListener('click', onStageClick);
      panel.destroy();
      frame.destroy();
    },
  };
}
