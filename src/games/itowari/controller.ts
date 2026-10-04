import { createGameFrame } from '../../core/ui/gameFrame';
import type { GameFrame } from '../../core/ui/gameFrame';
import { openSheet } from '../../core/ui/sheet';
import type { Sheet } from '../../core/ui/sheet';
import type { StageFit } from '../../core/viewport/viewport';
import type { GameDeps, GameInstance, GameProps } from '../../core/game/types';
import { MACHINE, BOX } from './geometry';
import { init, reduce, isValidResume } from './logic';
import type { ItowariAction, ItowariState } from './logic';
import { createItowariPanel } from './panel';
import { failLines, resultOfGame } from './messages';
import { beginDrag, moveDrag, dropResult, laneAt, coneAt } from './drag';
import type { DragState } from './drag';
import { drawBoard, drawLifted, yarnHex } from './renderer';
import { getContent } from '../../core/content/content';
import { itowariPuzzles } from './puzzles';
import { openCalculatorBody } from '../drumsetup/calculator';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import { itowariTutorial } from './tutorial';

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
  // ドラッグで糸をかける・外す (T2b-03b)。押すだけなら口を選ぶ・はかりに載せる。
  // つかんでいる指の id を覚えておき、ほかの指の動きは無視する (T2b-03 追加修正)
  // (createGameFrame の初期 resize で render が走るので、宣言は前でなければならない)
  let drag: DragState | null = null;
  let dragPointerId: number | null = null;
  const frame: GameFrame = createGameFrame(parent, {
    title: deps.terms.t('game.itowari'),
    subtitle: `レベル${puzzle.level} ${puzzle.name}`,
    onBack: () => opts.onBack(),
    onHelp: () => {
      void showTutorial(frame.root, itowariTutorial, { renderText: (s) => deps.terms.render(s) });
    },
    logicalW: MACHINE.w,
    logicalH: MACHINE.h,
    message: false,
    onStageResize: (f) => {
      // createGameFrame の代入中に最初の resize が来るので、1フレーム後に描く
      window.requestAnimationFrame(() => {
        if (f.scale > 0 && !disposed) {
          lastFit = f; // 測れない環境 (jsdom) では既定のまま
          render(); // setupCanvas で canvas が消されるので、大きさが変わったら描き直す
        }
      });
    },
  });

  // 引っぱっているあいだに画面がスクロール・拡大しないようにする (T2b-03 追加修正。実機の Safari・Chrome)
  frame.stage.style.touchAction = 'none';

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
    if (drag !== null && drag.moved) {
      drawLifted(ctx, yarnHex(getContent(), puzzle), canvasPoint(drag.current));
    }
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

  /** 指の画面座標 → 盤面の論理座標 */
  function stagePoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = frame.stage.getBoundingClientRect();
    const pxPerCss = rect.width > 0 ? frame.stage.width / rect.width : 1;
    return {
      x: ((clientX - rect.left) * pxPerCss - lastFit.offsetX) / lastFit.scale,
      y: ((clientY - rect.top) * pxPerCss - lastFit.offsetY) / lastFit.scale,
    };
  }

  /** 指の画面座標 → Canvas の px (引っぱっている糸を描く位置) */
  function canvasPoint(p: { x: number; y: number }): { x: number; y: number } {
    const rect = frame.stage.getBoundingClientRect();
    const pxPerCss = rect.width > 0 ? frame.stage.width / rect.width : 1;
    return { x: (p.x - rect.left) * pxPerCss, y: (p.y - rect.top) * pxPerCss };
  }

  function onPointerDown(ev: PointerEvent): void {
    if (disposed || finished || s.phase !== 'setup') return;
    const p = stagePoint(ev.clientX, ev.clientY);
    const lane = laneAt(p, (MACHINE.w / 12) * lastFit.scale < 64, s.spindles.length);
    if (lane !== null) {
      // 糸がかかっている口なら引っぱって外せる。空の口なら押しただけの tap で選ばれる
      drag = beginDrag({ kind: 'lane', spindle: lane }, { x: ev.clientX, y: ev.clientY });
      dragPointerId = ev.pointerId;
      return;
    }
    const cone = coneAt(p, puzzle, s);
    if (cone !== null) {
      drag = beginDrag({ kind: 'cone', sourceId: cone }, { x: ev.clientX, y: ev.clientY });
      dragPointerId = ev.pointerId;
    }
  }

  function onPointerMove(ev: PointerEvent): void {
    if (drag === null || ev.pointerId !== dragPointerId) return;
    drag = moveDrag(drag, { x: ev.clientX, y: ev.clientY });
    render();
  }

  function onPointerUp(ev: PointerEvent): void {
    if (drag === null || ev.pointerId !== dragPointerId) return;
    const d = drag;
    drag = null;
    dragPointerId = null;
    const p = stagePoint(ev.clientX, ev.clientY);
    const lane = laneAt(p, (MACHINE.w / 12) * lastFit.scale < 64, s.spindles.length);
    const cone = coneAt(p, puzzle, s);
    // 箱の糸が無い所でも箱の上なら外せる (空になった箱へ戻す)
    const inBox = p.x >= BOX.x && p.x <= BOX.x + BOX.w && p.y >= BOX.y && p.y <= BOX.y + BOX.h;
    const target = lane !== null ? { kind: 'lane' as const, spindle: lane } : cone !== null ? { kind: 'cone' as const, sourceId: cone } : inBox ? { kind: 'box' as const } : null;
    const r = dropResult(d, target);
    if (r.kind === 'mount') {
      // その口に1つ目があれば、継ぐ糸 (2本目) としてかける (T2b-03)
      const slot: 0 | 1 = s.spindles[r.spindle]!.segments.length === 0 ? 0 : 1;
      dispatch({ type: 'mount', spindle: r.spindle, sourceId: r.sourceId, slot });
      panel.select(r.spindle);
    } else if (r.kind === 'unmount') {
      if (s.spindles[r.spindle]!.segments.length === 2) dispatch({ type: 'unmount', spindle: r.spindle, slot: 1 });
      dispatch({ type: 'unmount', spindle: r.spindle, slot: 0 });
    } else if (r.kind === 'tap') {
      if (d.source.kind === 'cone') dispatch({ type: 'weigh', sourceId: d.source.sourceId });
      else panel.select(d.source.spindle);
    }
    render();
  }
  /** 取り消し (ブラウザがスクロールに奪ったとき)。離した扱いにせず、引っぱっていた糸を箱へ戻すだけ (T2b-03 追加修正) */
  function onPointerCancel(ev: PointerEvent): void {
    if (drag === null || ev.pointerId !== dragPointerId) return;
    drag = null;
    dragPointerId = null;
    render();
  }
  frame.stage.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);

  refresh();
  // パネルを置き終わった大きさで測り直す (作った直後はまだ大きさが出ないことがある)
  frame.resize();
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
      frame.stage.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      panel.destroy();
      frame.destroy();
    },
  };
}
