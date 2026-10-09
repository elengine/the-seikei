import type { GameDeps, GameInstance, GameProps, TutorialSpec } from '../../core/game/types';
import type { StageFit } from '../../core/viewport/viewport';
import { createGameFrame } from '../../core/ui/gameFrame';
import { createButton, createDialogShell } from '../../core/ui/widgets';
import { setBoardHeight, flangeHit, dragCm, hitSpeedBar, speedFromBarDrag, hitSheetEdge, hitBeamWind } from './geometry';
import { logicalHeightFor } from '../winding/geometry';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import { drawBoard } from './renderer';
import { createBeamingPanel } from './panel';
import { getContent } from '../../core/content/content';
import { init, reduce, resultLines } from './logic';
import { seedFromText } from '../winding/logic';
import { resultOf } from './messages';
import type { BeamingState, BeamingAction, Level } from './logic';
import { DRUM_TURN_RATE, BEAM_TURN_RATE } from './params';

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
      ? reduce(startState, { type: 'setSpeed', value: 0 }) // 再開のときはレバーを停止に
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
  let beamAngle = 0; // ビームが回って見える角度 (同じ。PU-26)
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
      void openTutorial();
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
  /** 茶色の棒を引っぱっている (PU-24b)。startX は引っぱり始めの指の論理 x、startSpeed はそのときの速さ */
  let barDrag: { id: number; startX: number; startSpeed: number } | null = null;
  /** 糸を引っぱっている (attach の段階。T3-06)。x・y は指の論理位置 (糸の線を描くのに使う) */
  let threadDrag: { id: number; x: number; y: number } | null = null;
  /** 画面の点 → 論理座標の x と y (Canvas の上の位置から、変換を戻す) */
  function logicalOf(e: PointerEvent): { x: number; y: number } {
    const rect = frame.stage.getBoundingClientRect();
    return { x: (e.clientX - rect.left - lastFit.offsetX) / lastFit.scale, y: (e.clientY - rect.top - lastFit.offsetY) / lastFit.scale };
  }
  const currentCm = (side: 'left' | 'right'): number => (side === 'left' ? s.leftCm : s.rightCm);
  function onStageDown(e: PointerEvent): void {
    if (flangeDrag !== null || barDrag !== null || threadDrag !== null || finished || disposed || e.button !== 0 || !(lastFit.scale > 0)) {
      return;
    }
    // 糸を付ける段階: ドラムの下の端を押さえたら糸をつかむ (T3-06)
    if (s.phase === 'attach') {
      const p = logicalOf(e);
      if (hitSheetEdge(p, s.widthCm, s.progress)) {
        threadDrag = { id: e.pointerId, x: p.x, y: p.y };
        try {
          frame.stage.setPointerCapture(e.pointerId);
        } catch {
          // 対応していない環境 (テスト等) では、そのまま受け取る
        }
        render();
      }
      return;
    }
    // 茶色の棒 (巻き返しの段階だけ動かせる。幅合わせの段階では押せない。PU-24b)。棒のどこを押さえても引っぱれる
    if (s.phase === 'beaming') {
      const p = logicalOf(e);
      if (hitSpeedBar(p, s.speed)) {
        barDrag = { id: e.pointerId, startX: p.x, startSpeed: s.speed };
        try {
          frame.stage.setPointerCapture(e.pointerId);
        } catch {
          // 対応していない環境 (テスト等) では、そのまま受け取る
        }
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
    // 糸を引っぱる: 指について線を描くだけ (付けるのは離したとき)
    if (threadDrag !== null && e.pointerId === threadDrag.id) {
      const p = logicalOf(e);
      threadDrag = { ...threadDrag, x: p.x, y: p.y };
      render();
      return;
    }
    // 棒を引っぱる: 指が動いた分だけ速さが連続で変わる (棒も指について動く)
    if (barDrag !== null && e.pointerId === barDrag.id) {
      const v = speedFromBarDrag(barDrag.startSpeed, logicalOf(e).x - barDrag.startX);
      if (v !== s.speed) {
        dispatch({ type: 'setSpeed', value: v });
      }
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
    // 糸を離す: ビームの上なら糸が付く (attachThread)。それ以外は糸の端がドラムへ戻る (何も起きない)
    if (threadDrag !== null) {
      const wasDragging = e.pointerId === threadDrag.id;
      const p = logicalOf(e);
      threadDrag = null;
      if (wasDragging && s.phase === 'attach' && hitBeamWind(p, s)) {
        dispatch({ type: 'attachThread' });
      }
      render();
      return;
    }
    // 棒を離す: 引っぱりが終わり、速さはそのまま保たれる。pointerId は問わない (離すのを取りこぼしたまま固まらないようにする)
    if (barDrag !== null) {
      barDrag = null;
      render();
      return;
    }
    if (flangeDrag !== null && e.pointerId === flangeDrag.pointerId) {
      flangeDrag = null;
    }
  }
  function onStageCancel(e: PointerEvent): void {
    if (threadDrag !== null) {
      // 取り消し (ブラウザが奪ったとき): 糸の端はドラムへ戻る (何も起きない)
      threadDrag = null;
      render();
      return;
    }
    if (barDrag !== null) {
      // 取り消し (ブラウザが奪ったとき): 引っぱる前の速さに戻す。pointerId は問わない
      const back = barDrag.startSpeed;
      barDrag = null;
      if (back !== s.speed) {
        dispatch({ type: 'setSpeed', value: back });
      }
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
    drawBoard(ctx, lastFit, s, content, drumAngle, threadDrag, beamAngle);
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
      if (s.broken) {
        showBrokenDialog(); // 失敗は星を記録しない。専用の画面を出す (T3-04c)
        return;
      }
      props.onFinish(resultOf(s, props.mode, deps.clock.now()));
    }, DONE_WAIT_MS);
  }

  /** 糸切れの結果の画面 (題名「糸が切れました」・星の欄は無い・もう一度/一覧。T3-04c) */
  function showBrokenDialog(): void {
    const { backdrop, dialog: box } = createDialogShell(undefined, 'result');
    const title = document.createElement('h2');
    title.className = 'result__title font-heading';
    title.textContent = '糸が切れました';
    box.appendChild(title);
    const line = document.createElement('p');
    line.className = 'result__hint';
    line.textContent = resultLines(s)[0]?.value ?? '巻き量が 100% を超えました';
    box.appendChild(line);
    const actions = document.createElement('div');
    actions.className = 'dialog__actions result__actions';
    const again = createButton({
      label: 'もう一度',
      variant: 'secondary',
      onClick: () => {
        backdrop.remove();
        restart();
      },
    });
    const list = createButton({
      label: '一覧',
      variant: 'primary',
      onClick: () => {
        backdrop.remove();
        opts.onBack();
      },
    });
    actions.appendChild(again);
    actions.appendChild(list);
    box.appendChild(actions);
    frame.root.appendChild(backdrop);
  }

  /** 同じお題をやり直す (幅合わせから) */
  function restart(): void {
    s = init({
      level: opts.level,
      widthCm: opts.widthCm,
      seed: seedFromText(deps.clock.now()),
      puzzleId: opts.puzzleId ?? '',
      patternId: opts.patternId,
    });
    finished = false;
    drumAngle = 0;
    beamAngle = 0;
    startLoop();
    refresh();
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
      // ドラムとビームが回って見える角度 (巻いている速さに合わせる。速さ 0 では止まる。PU-26)
      if (s.phase === 'beaming' && s.speed > 0) {
        drumAngle += s.speed * DRUM_TURN_RATE * (dtMs / 1000);
        beamAngle += s.speed * BEAM_TURN_RATE * (dtMs / 1000);
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

  /**
   * 遊び方を開いているあいだは一時停止し、閉じたら自動で再開する (T2-17)。
   * レバーの位置は変えない (裏に回ったときのように停止にしない)。再開の最初のフレームでは
   * 止めていた時間を足さない (stopLoop が lastFrameMs を測り直す)。
   */
  let tutorialOpen = false;
  async function openTutorial(): Promise<void> {
    if (tutorialOpen || disposed || finished) {
      return;
    }
    tutorialOpen = true;
    stopLoop();
    try {
      await showTutorial(frame.root, opts.tutorial, { renderText: (t) => deps.terms.render(t) });
    } finally {
      tutorialOpen = false;
      if (!disposed && !finished && s.phase !== 'done') {
        startLoop();
      }
    }
  }

  // ---- 裏に回ったとき ----
  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      stopLoop();
      const next = reduce(s, { type: 'setSpeed', value: 0 });
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
      threadDrag = null;
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
