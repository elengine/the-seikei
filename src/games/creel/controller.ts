import type { GameDeps, GameInstance, GameProps, TutorialSpec } from '../../core/game/types';
import type { CreelPuzzle } from '../../core/domain/types';
import type { StageFit } from '../../core/viewport/viewport';
import { createGameFrame } from '../../core/ui/gameFrame';
import { drawFabric, fabricSpecFor } from '../../core/ui/fabricPreview';
import { getContent, type Content } from '../../core/content/content';
import { drawBoard } from './renderer';
import { createCreelPanel } from './panel';
import { fromPx, hitTest } from './geometry';
import { init, reduce, starsOf, isValidResume } from './logic';
import type { CreelState, CreelAction } from './logic';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import type { CreelPanel } from './panel';

const DONE_WAIT_MS = 1500;

/**
 * クリール立てのプレイ画面。盤面 (Canvas) と操作欄をつなぐ。
 * mount したら「戻る」以外の操作はすべて reduce を通して状態を1つに保つ。
 */
export function createController(parent: HTMLElement, deps: GameDeps, props: GameProps, opts: {
  puzzleId: string;
  resume?: unknown;
  content?: Content;
  tutorial: TutorialSpec; // 「遊び方」で見せるチュートリアル
  jobPuzzle?: CreelPuzzle; // mode:'job' のときにその場で作るお題 (creelPuzzles に無い)
}): GameInstance {
  const content = opts.content ?? getContent();
  const found = opts.jobPuzzle ?? content.creelPuzzles.find((p) => p.id === opts.puzzleId);
  if (found === undefined) {
    throw new Error(`puzzle not found: ${opts.puzzleId}`);
  }
  const puzzle: CreelPuzzle = found;
  const pattern = content.patterns.get(puzzle.patternId);

  // ---- 状態 ----
  const startState = props.resume !== undefined && isValidResume(props.resume, content) ? props.resume : null;
  let s: CreelState = startState ?? init(puzzle, content);
  let lastFit: StageFit = { scale: 1, offsetX: 0, offsetY: 0 };
  let doneTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let finished = false;
  let panelReady = false; // frame と panel ができあがったあとだけ再描画する

  // ---- 枠 ----
  const frame = createGameFrame(parent, {
    title: deps.terms.t('game.creel'),
    onBack: () => handleBack(),
    onHelp: () => {
      void showTutorial(frame.root, opts.tutorial, { renderText: (s) => deps.terms.render(s) }).then(() => undefined);
    },
    logicalW: 1000,
    logicalH: 750,
    onStageResize: (fit) => {
      lastFit = fit;
      // 配置が変わるたび、横長なら「現在の帯の並び」を盤面の下 (footer) に移す
      if (panelReady) {
        if (frame.layout() === 'landscape') {
          panel.placeBand(frame.footer);
        } else {
          panel.placeBand(null);
        }
        render();
      }
    },
  });

  // ---- 操作欄 ----
  const panel: CreelPanel = createCreelPanel(frame.panel, {
    content,
    message: frame.message,
    onAction: (a: CreelAction) => {
      dispatch(a);
    },
  });

  // ---- 描画 ----
  function render(): void {
    const ctx = frame.stage.getContext('2d');
    if (ctx === null) {
      return; // Canvas が使えない環境 (テスト等)
    }
    ctx.clearRect(0, 0, frame.stage.width, frame.stage.height);
    drawBoard(ctx, lastFit, s, content, deps.terms);
    if (s.done) {
      // 生地の見本を大きく重ねる
      if (pattern !== undefined) {
        const spec = fabricSpecFor(pattern, content);
        const w = 1000 * lastFit.scale;
        const h = 750 * lastFit.scale;
        const margin = 60 * lastFit.scale;
        drawFabric(ctx, spec, { x: lastFit.offsetX + margin, y: lastFit.offsetY + margin, w: w - margin * 2, h: h - margin * 2 }, { threadPx: 6 });
      }
      // 「完成しました」(盤面の上端・生地の見本の上に出す)
      const size = 44; // 画面px
      ctx.font = `${size}px sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cx = lastFit.offsetX + 500 * lastFit.scale;
      const cy = lastFit.offsetY + 44 * lastFit.scale;
      // 見やすいように帯を敷いてから文字
      ctx.fillStyle = 'rgba(43, 42, 36, 0.75)';
      ctx.fillRect(lastFit.offsetX, cy - size * 0.9, 1000 * lastFit.scale, size * 1.8);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('完成しました', cx, cy);
    }
  }

  // ---- メッセージ ----
  function updateMessage(): void {
    if (s.done) {
      panel.setMessage(deps.terms.render('完成しました'));
      return;
    }
    if (s.marks !== null && (s.marks.wrong.length > 0 || s.marks.empty.length > 0)) {
      panel.setMessage(s.checks >= 2 ? '✕ の箇所を直してください (ヒントも使えます)' : '✕ の箇所を直してください');
      return;
    }
    panel.setMessage(deps.terms.render('依頼書どおりに{{cone}}を立ててください'));
  }

  // ---- 画面の更新 (盤面 + 操作欄 + メッセージ) ----
  function refresh(): void {
    render();
    panel.update(s);
    updateMessage();
  }

  // ---- 完了処理 ----
  function handleDone(): void {
    finished = true;
    frame.panel.style.display = 'none'; // 操作欄を隠す
    refresh();
    const stars = starsOf(s);
    doneTimer = setTimeout(() => {
      doneTimer = null;
      if (disposed) {
        return;
      }
      props.onFinish({
        gameId: 'creel',
        mode: props.mode,
        stars,
        stats: { checks: s.checks, hints: s.hints, [`puzzle:${puzzle.id}`]: stars },
        unlockedPatternIds: [puzzle.patternId],
        summary: [`確認した回数 ${s.checks}回`, `ヒントを使った回数 ${s.hints}回`],
        finishedAt: deps.clock.now(),
      });
    }, DONE_WAIT_MS);
  }

  // ---- 操作の入口 ----
  function dispatch(a: CreelAction): void {
    if (s.done || finished) {
      return;
    }
    const before = s;
    const next = reduce(s, a);
    if (next !== before) {
      // 効果音
      if (a.type === 'tapCell' || a.type === 'selectBox' || a.type === 'selectRemove') {
        deps.audio.play('tap');
      } else if (a.type === 'hint') {
        deps.audio.play('ok');
      } else if (a.type === 'check') {
        deps.audio.play(next.marks !== null ? 'gentleNo' : 'fanfare');
      }
      s = next;
      props.onStateChange?.(s);
      if (s.done) {
        handleDone();
      } else {
        refresh();
      }
    }
  }

  // ---- 盤面のポインタイベント ----
  function onPointerDown(e: PointerEvent): void {
    if (s.done || finished) {
      return;
    }
    const rect = frame.stage.getBoundingClientRect();
    const logical = fromPx(lastFit, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    const index = hitTest(logical, s.rows, s.cols);
    if (index !== null) {
      dispatch({ type: 'tapCell', index });
    }
  }
  frame.stage.addEventListener('pointerdown', onPointerDown);

  // ---- 戻る (確認と保存は gameScreen 側の onExit が行う) ----
  function handleBack(): void {
    props.onExit();
  }

  // ---- 初期表示 ----
  panelReady = true;
  // 初回の配置も決める (横長なら帯の並びを footer へ)
  if (frame.layout() === 'landscape') {
    panel.placeBand(frame.footer);
  } else {
    panel.placeBand(null);
  }
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
      if (doneTimer !== null) {
        clearTimeout(doneTimer);
        doneTimer = null;
      }
      frame.stage.removeEventListener('pointerdown', onPointerDown);
      panel.destroy();
      frame.destroy();
    },
  };
}
