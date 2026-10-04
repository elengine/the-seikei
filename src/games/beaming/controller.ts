import type { GameDeps, GameInstance, GameProps, TutorialSpec } from '../../core/game/types';
import type { StageFit } from '../../core/viewport/viewport';
import { createGameFrame } from '../../core/ui/gameFrame';
import { setBoardHeight, flangeHit, dragCm, hitLever, nearestNotch } from './geometry';
import { logicalHeightFor } from '../winding/geometry';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import { drawBoard } from './renderer';
import { createBeamingPanel } from './panel';
import { getContent } from '../../core/content/content';
import { init, reduce } from './logic';
import { seedFromText } from '../winding/logic';
import { resultOf } from './messages';
import type { BeamingState, BeamingAction, Level } from './logic';
import { DRUM_TURN_PER_SPEED } from '../winding/params';

const LEVEL_NAMES: Record<Level, string> = { 1: '初級', 2: '中級', 3: '上級' };
const DONE_WAIT_MS = 1500; // done のあと結果を出すまでの見せる時間
const SAVE_INTERVAL_MS = 1000; // 途中保存は1秒に1回まで

/**
 * ビーム巻きのプレイ画面 (P3 T3-03a)。盤面と操作欄をつなぐ。ドラム巻きと同じ形。
 * 時間は requestAnimationFrame。裏に回ったら止めてペダルを 0 にする。
 * 糸切れは起きない (管理者の指示)。回る角度を renderer に渡す。
 */
export function createBeamingController(parent: HTMLElement, deps: GameDeps, props: GameProps, opts: {
  level: Level;
  widthCm: number;
  puzzleId?: string;
  patternId: string;
  /** 題名の下に「レベルN 柄の名前」を出すための情報 */
  puzzleName?: string;
  /** 依頼書の帯の数 */
  bands?: number;
  resume?: unknown;
  tutorial: TutorialSpec;
  onBack: () => void;
}): GameInstance {
  // ---- 状態 ----
  const startState = opts.resume as BeamingState | undefined;
  let s: BeamingState =
    startState !== undefined
      ? reduce(startState, { type: 'setSpeed', speed: 0 }) // 再開のときはレバーを停止に
      : init({
          level: opts.level,
          widthCm: opts.widthCm,
          seed: seedFromText(deps.clock.now()),
          puzzleId: opts.puzzleId ?? '',
          patternId: opts.patternId,
        });
  let lastFit: StageFit = { scale: 1, offsetX: 0, offsetY: 0 };
  let disposed = false;
  let finished = false;
  let rafId: number | null = null;
  let lastFrameMs: number | null = null;
  let saveTimer: ReturnType<typeof setInterval> | null = null;
  let doneTimer: ReturnType<typeof setTimeout> | null = null;
  let drumAngle = 0; // ドラムが回って見える角度 (見た目だけの値。State には入らない)
  let ready = false;

  const content = getContent();

  // ---- 枠 ----
  const frame = createGameFrame(parent, {
    title: deps.terms.t('game.beaming'),
    subtitle:
      opts.puzzleName !== undefined
        ? `レベル${opts.level} ${opts.puzzleName}`
        : `${LEVEL_NAMES[opts.level]} 巻き幅 ${opts.widthCm}cm`,
    onBack: opts.onBack,
    onHelp: () => {
      void showTutorial(frame.root, opts.tutorial, { renderText: (t) => deps.terms.render(t) }).then(() => undefined);
    },
    message: false, // メッセージ欄は無い。短い知らせは notify (PU-15c)
    logicalW: 1000,
    logicalH: 750,
    // 盤面のカードの縦横の割合に論理の高さを合わせ、機械をカードの高さいっぱいに描く (PU-15a。ドラム巻きと同じ考え)
    logicalHFor: (w, h) => {
      const H = logicalHeightFor(w, h);
      setBoardHeight(H);
      return H;
    },
    portraitStageRatio: 0.4,
    onStageResize: (fit) => {
      lastFit = fit;
      if (ready) {
        refresh();
      }
    },
  });

  // ---- 円盤を絵の上で引っぱって合わせる (PU-15b。幅合わせの段階だけ) ----
  let flangeDrag: { side: 'left' | 'right'; startCm: number; startX: number; pointerId: number } | null = null;
  /** 速さのレバーを引っぱっている (T3-04b)。x は指の論理座標 */
  let leverDragX: number | null = null;
  let leverDragId = -1;
  /** 画面の点 → 論理座標の x と y (Canvas の上の位置から、変換を戻す) */
  function logicalOf(e: PointerEvent): { x: number; y: number } {
    const rect = frame.stage.getBoundingClientRect();
    return { x: (e.clientX - rect.left - lastFit.offsetX) / lastFit.scale, y: (e.clientY - rect.top - lastFit.offsetY) / lastFit.scale };
  }
  const currentCm = (side: 'left' | 'right'): number => (side === 'left' ? s.leftCm : s.rightCm);
  function onStageDown(e: PointerEvent): void {
    if (flangeDrag !== null || leverDragX !== null || finished || disposed || e.button !== 0 || !(lastFit.scale > 0)) {
      return;
    }
    // 速さのレバー (巻き返しの段階だけ動かせる。幅合わせの段階では押せない形。T3-04b)
    if (s.phase === 'beaming') {
      const p = logicalOf(e);
      if (hitLever(p)) {
        leverDragX = p.x;
        leverDragId = e.pointerId;
        try {
          frame.stage.setPointerCapture(e.pointerId);
        } catch {
          // 対応していない環境 (テスト等) では、そのまま受け取る
        }
        render();
        return;
      }
    }
    if (s.phase !== 'setup') {
      return;
    }
    const p = logicalOf(e);
    const side = flangeHit(p, s.leftCm, s.rightCm, s.widthCm, lastFit.scale);
    if (side === null) {
      return;
    }
    flangeDrag = { side, startCm: currentCm(side), startX: p.x, pointerId: e.pointerId };
    try {
      frame.stage.setPointerCapture(e.pointerId);
    } catch {
      // 対応していない環境 (テスト等) では、そのまま受け取る
    }
  }
  function onStageMove(e: PointerEvent): void {
    // レバーを引っぱる (指に合わせて目印が動く。離すと一番近い止まりに吸い付く。T3-04b)
    if (leverDragX !== null && e.pointerId === leverDragId) {
      leverDragX = logicalOf(e).x;
      render();
      return;
    }
    const d = flangeDrag;
    if (d === null || e.pointerId !== d.pointerId || s.phase !== 'setup') {
      return;
    }
    const cm = dragCm(s.widthCm, d.startCm, d.startX, logicalOf(e).x);
    const delta = cm - currentCm(d.side);
    if (delta !== 0) {
      dispatch({ type: 'moveFlange', side: d.side, deltaCm: delta });
    }
  }
  function onStageUp(e: PointerEvent): void {
    // レバーを離す: 一番近い止まりに吸い付いて速さを変える (T3-04b)。
    // pointerId は問わない (離すのを取りこぼしたまま固まらないようにする)
    if (leverDragX !== null) {
      const next = nearestNotch(leverDragX);
      leverDragX = null;
      leverDragId = -1;
      if (next !== s.speed) {
        dispatch({ type: 'setSpeed', speed: next });
      }
      render();
      return;
    }
    if (flangeDrag !== null && e.pointerId === flangeDrag.pointerId) {
      flangeDrag = null;
    }
  }
  function onStageCancel(e: PointerEvent): void {
    if (leverDragX !== null) {
      // 引っぱっているのをやめる (速さは変えない)。pointerId は問わない
      leverDragX = null;
      leverDragId = -1;
      render();
      return;
    }
    const d = flangeDrag;
    if (d === null || e.pointerId !== d.pointerId) {
      return;
    }
    flangeDrag = null;
    const delta = d.startCm - currentCm(d.side); // 動かした分を戻す
    if (delta !== 0) {
      dispatch({ type: 'moveFlange', side: d.side, deltaCm: delta });
    }
  }
  frame.stage.addEventListener('pointerdown', onStageDown);
  frame.stage.addEventListener('pointermove', onStageMove);
  frame.stage.addEventListener('pointerup', onStageUp);
  frame.stage.addEventListener('pointercancel', onStageCancel);

  // ---- 操作欄 ----
  const panel = createBeamingPanel(frame.panel, {
    terms: deps.terms,
    onAction: (a: BeamingAction) => {
      dispatch(a);
    },
    onNotice: (text: string) => {
      frame.notify(text);
    },
    puzzle:
      opts.bands !== undefined && opts.puzzleName !== undefined
        ? { bands: opts.bands, patternName: opts.puzzleName }
        : undefined,
  });

  // ---- 描画 ----
  function render(): void {
    const ctx = frame.stage.getContext('2d');
    if (ctx === null) {
      return;
    }
    drawBoard(ctx, lastFit, s, content, drumAngle, leverDragX);
  }

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
  function dispatch(a: BeamingAction): void {
    if (s.phase === 'done' || finished || disposed) {
      return;
    }
    applyAction(a);
  }

  function applyAction(a: BeamingAction): void {
    const prev = s;
    const next = reduce(s, a);
    if (next === prev) {
      return;
    }
    s = next;
    saveState();
    if (s.phase === 'done') {
      handleDone();
    } else {
      refresh();
    }
  }

  // ---- 途中保存 (操作のたびと、1秒に1回) ----
  function saveState(): void {
    props.onStateChange?.(s);
  }
  saveTimer = setInterval(() => {
    if (!disposed && s.phase === 'beaming') saveState();
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
      // ドラムが回って見える角度 (巻いている速さに合わせる)
      // ドラムが回って見える角度 (レバーの速さに合わせる。T3-04a)
      if (s.phase === 'beaming' && s.speed > 0) {
        drumAngle += s.speed * DRUM_TURN_PER_SPEED * (dtMs / 1000);
      }
      const prev = s;
      const next = reduce(s, { type: 'tick', dtMs });
      if (next !== prev) {
        s = next;
        if (s.phase === 'done') {
          handleDone(); // 巻き終わりは tick で起こる (糸切れは無いので done に入るのはここだけ)
        } else {
          refresh();
        }
      } else if (s.phase === 'beaming') {
        render();
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  function startLoop(): void {
    if (disposed || finished || rafId !== null) {
      return;
    }
    lastFrameMs = null;
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
      const next = reduce(s, { type: 'setSpeed', speed: 0 });
      if (next !== s) {
        s = next;
        refresh();
      }
    } else startLoop();
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  // ---- 初期表示 ----
  if (s.phase !== 'done') {
    startLoop();
  }
  ready = true;
  refresh();
  if (s.phase === 'setup') {
    frame.notify('円盤を左右に引っぱって、巻き幅に合わせます'); // 最初の 1 回
  }

  return {
    suspend(): unknown {
      if (finished) {
        return null;
      }
      return s;
    },
    unmount(): void {
      disposed = true;
      stopLoop();
      if (saveTimer !== null) {
        clearInterval(saveTimer);
        saveTimer = null;
      }
      if (doneTimer !== null) {
        clearTimeout(doneTimer);
        doneTimer = null;
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      frame.stage.removeEventListener('pointerdown', onStageDown);
      frame.stage.removeEventListener('pointermove', onStageMove);
      frame.stage.removeEventListener('pointerup', onStageUp);
      frame.stage.removeEventListener('pointercancel', onStageCancel);
      panel.destroy();
      frame.destroy();
    },
  };
}
