import { createGameFrame } from '../../core/ui/gameFrame';
import type { GameFrame } from '../../core/ui/gameFrame';
import { openSheet } from '../../core/ui/sheet';
import type { Sheet } from '../../core/ui/sheet';
import type { GameDeps, GameInstance, GameProps } from '../../core/game/types';
import { BOARD_W, boardHeightFor, lanesFor, layoutFor, laneAt, textHitAt } from './geometry';
import { init, reduce, isValidResume } from './logic';
import type { ItowariAction, ItowariState } from './logic';
import { createItowariPanel } from './panel';
import { failLines, helpText, resultOfGame } from './messages';
import { beginDrag, moveDrag, dropResult } from './drag';
import type { DragState } from './drag';
import { attachBoxDrag } from './boxDrag';
import { drawBoard, yarnHex } from './renderer';
import { COLORS } from '../../core/ui/tokens';
import { getContent } from '../../core/content/content';
import { itowariPuzzles } from './puzzles';
import { openCalculatorBody } from '../drumsetup/calculator';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import { itowariTutorial } from './tutorial';

/**
 * 糸割りの画面の動き (P2b T2b-03a → PU-16)。盤面 (renderer。使う口だけを大きく) と操作欄 (panel。元の糸の箱の帯・
 * 電卓・巻き始める) を置き、巻きの進みを requestAnimationFrame で回す。失敗は重ね表示、成功は結果の画面。
 * 盤面の口の長さの数字を押すとテンキー、口を押すと選ぶ、口の糸を盤面の外へ引っぱると外れる。
 * 箱の糸は、押すとはかりに載り、口へ引っぱるとかかる (boxDrag。クリール立てと同じ決まり)。
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

  /** 盤面のカードの大きさ (画面 px)。枠が配置のたびに logicalHFor で教える。測れない環境 (jsdom) では既定 */
  let stageSize = { w: BOARD_W, h: 750 };
  let hoverLane: number | null = null;
  let selectedLane: number | null = 0;
  // 口の糸を盤面の外へ引っぱって外す (T2b-03b → PU-16)。押すだけなら口を選ぶ・長さのテンキーを開く。
  // つかんでいる指の id を覚えておき、ほかの指の動きは無視する (T2b-03 追加修正)
  // (createGameFrame の初期 resize で render が走るので、宣言は前でなければならない)
  let drag: DragState | null = null;
  let dragPointerId: number | null = null;
  /** 口を押した位置 (長さの数字の上なら、押しただけで離したときにテンキーを開く) */
  let press: { spindle: number; text: { spindle: number; slot: 0 | 1 } | null } | null = null;
  const frame: GameFrame = createGameFrame(parent, {
    title: deps.terms.t('game.itowari'),
    subtitle: `レベル${puzzle.level} ${puzzle.name}`,
    onBack: () => opts.onBack(),
    onHelp: () => {
      void openTutorial();
    },
    logicalW: BOARD_W,
    logicalH: 750,
    message: false,
    alwaysCompact: true, // どの大きさでも、箱は盤面の横か下の帯 (クリール立てと同じ)
    // 盤面のカードの縦横の割合に論理の高さを合わせる (拡大率 = カードの幅 ÷ 1000。盤面は画面 px で配置する)
    logicalHFor: (w, h) => {
      if (w > 0 && h > 0) {
        stageSize = { w, h };
      }
      return boardHeightFor(w, h);
    },
    onStageResize: (f) => {
      // createGameFrame の代入中に最初の resize が来るので、1フレーム後に描く
      window.requestAnimationFrame(() => {
        if (f.scale > 0 && !disposed) {
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
    drawBoard(ctx, stageSize, s, getContent(), puzzle, {
      windT,
      selected: selectedLane,
      hover: hoverLane,
      lifted: drag !== null && drag.moved && segCount((drag.source as { spindle: number }).spindle) > 0 ? canvasPoint(drag.current) : null,
    });
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

  /**
   * 遊び方を開いているあいだは一時停止し、閉じたら自動で再開する (T2-17)。
   * 再開の最初のフレームで止めていた時間を足さない (lastTs を測り直す。最初の dt は 16ms)。
   */
  let tutorialOpen = false;
  async function openTutorial(): Promise<void> {
    if (tutorialOpen || disposed || finished) {
      return;
    }
    tutorialOpen = true;
    window.cancelAnimationFrame(rafId);
    lastTs = null;
    try {
      await showTutorial(frame.root, itowariTutorial, { renderText: (s) => deps.terms.render(s) });
    } finally {
      tutorialOpen = false;
      if (!disposed && !finished) {
        rafId = window.requestAnimationFrame(loop);
      }
    }
  }

  /** 指の画面座標 → 盤面の画面 px (Canvas の左上が原点) */
  function canvasPoint(p: { x: number; y: number }): { x: number; y: number } {
    const rect = frame.stage.getBoundingClientRect();
    return { x: p.x - rect.left, y: p.y - rect.top };
  }

  const laneCount = lanesFor(puzzle);
  const boardLayout = (): ReturnType<typeof layoutFor> => layoutFor(laneCount, stageSize.w, stageSize.h);
  const segCount = (i: number): number => s.spindles[i]?.segments.length ?? 0;
  const sourceNo = (id: string): number => puzzle.sources.findIndex((x) => x.id === id) + 1;

  function onPointerDown(ev: PointerEvent): void {
    if (disposed || finished || s.phase !== 'setup') return;
    const p = canvasPoint({ x: ev.clientX, y: ev.clientY });
    const lane = laneAt(boardLayout(), p, laneCount);
    if (lane === null) return;
    press = { spindle: lane, text: textHitAt(boardLayout(), p, segCount, laneCount) };
    // 糸がかかっている口は引っぱって外せる。空の口・押しただけは tap (口を選ぶ・長さのテンキー)
    drag = beginDrag({ kind: 'lane', spindle: lane }, { x: ev.clientX, y: ev.clientY });
    dragPointerId = ev.pointerId;
  }

  function onPointerMove(ev: PointerEvent): void {
    if (drag === null || ev.pointerId !== dragPointerId) return;
    drag = moveDrag(drag, { x: ev.clientX, y: ev.clientY });
    render();
  }

  function onPointerUp(ev: PointerEvent): void {
    if (drag === null || ev.pointerId !== dragPointerId) return;
    const d = drag;
    const pr = press;
    drag = null;
    dragPointerId = null;
    press = null;
    const spindle = (d.source as { spindle: number }).spindle;
    const mounted = segCount(spindle) > 0;
    const p = canvasPoint({ x: ev.clientX, y: ev.clientY });
    const outside = p.x < 0 || p.y < 0 || p.x > stageSize.w || p.y > stageSize.h;
    // 空の口は引っぱれない (動かしても押しただけと同じ)
    const r = dropResult(mounted ? d : { ...d, moved: false }, outside ? { kind: 'outside' } : null);
    if (r.kind === 'unmount') {
      if (segCount(spindle) === 2) dispatch({ type: 'unmount', spindle, slot: 1 });
      dispatch({ type: 'unmount', spindle, slot: 0 });
    } else if (r.kind === 'tap') {
      selectedLane = spindle;
      panel.select(spindle);
      if (pr !== null && pr.text !== null) panel.openLength(pr.text.spindle, pr.text.slot);
    }
    render();
  }
  /** 取り消し (ブラウザが奪ったとき)。離した扱いにせず、引っぱっていた糸を元へ戻すだけ (T2b-03 追加修正) */
  function onPointerCancel(ev: PointerEvent): void {
    if (drag === null || ev.pointerId !== dragPointerId) return;
    drag = null;
    dragPointerId = null;
    press = null;
    render();
  }

  // 箱の糸: 押すとはかりに載り (重さと長さの手伝いをお知らせ)、口へ引っぱるとかかる
  const boxDrag = attachBoxDrag({
    panel: panel.root,
    laneAt: (cx, cy) => laneAt(boardLayout(), canvasPoint({ x: cx, y: cy }), laneCount),
    look: () => ({ body: yarnHex(getContent(), puzzle), core: COLORS.kinariDeep }),
    diameterPx: () => 48,
    onTap: (sourceId) => {
      dispatch({ type: 'weigh', sourceId });
      const src = puzzle.sources.find((x) => x.id === sourceId);
      if (src === undefined) return;
      const help = helpText(puzzle, src.grossG).replace(/\n/g, ' ');
      frame.notify(`糸 ${sourceNo(sourceId)}:${Math.round(src.grossG)} g${help !== '' ? `  ${help}` : ''}`);
    },
    onDrop: (spindle, sourceId) => {
      // その口に 1 つ目があれば、継ぐ糸 (2 本目) としてかける (T2b-03)
      const slot: 0 | 1 = segCount(spindle) === 0 ? 0 : 1;
      dispatch({ type: 'mount', spindle, sourceId, slot });
      selectedLane = spindle;
      panel.select(spindle);
      hoverLane = null;
      render();
    },
    onHover: (lane) => {
      if (lane !== hoverLane) {
        hoverLane = lane;
        render();
      }
    },
  });
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
      boxDrag.destroy();
      frame.stage.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      panel.destroy();
      frame.destroy();
    },
  };
}
