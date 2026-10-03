import type { GameDeps, GameInstance, GameProps, TutorialSpec } from '../../core/game/types';
import type { CreelPuzzle } from '../../core/domain/types';
import type { StageFit } from '../../core/viewport/viewport';
import { createGameFrame } from '../../core/ui/gameFrame';
import { drawFabric, fabricSpecFor } from '../../core/ui/fabricPreview';
import { getContent, type Content } from '../../core/content/content';
import { drawBoard } from './renderer';
import { createCreelPanel } from './panel';
import { pegRadius } from './geometry';
import { attachDrag } from './dragView';
import { init, reduce, starsOf, isValidResume } from './logic';
import type { CreelState, CreelAction } from './logic';
import { showTutorial } from '../../core/ui/tutorialOverlay';
import { STARS3_CHECKS_MAX } from './params';
import { COLORS } from '../../core/ui/tokens';
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
  let snapIndex: number | null = null; // 引っぱっているチーズの吸い付く先の軸
  let liftedIndex: number | null = null; // 持ち上げている軸 (空いた軸として描く)

  // ---- 枠 ----
  const frame = createGameFrame(parent, {
    title: deps.terms.t('game.creel'),
    subtitle: `レベル${puzzle.stage} ${pattern?.name ?? ''}`.trim(), // 今のお題
    onBack: () => handleBack(),
    onHelp: () => {
      void showTutorial(frame.root, opts.tutorial, { renderText: (s) => deps.terms.render(s) }).then(() => undefined);
    },
    logicalW: 1000,
    logicalH: 750,
    onStageResize: (fit) => {
      lastFit = fit;
      if (panelReady) {
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

  // ---- 引っぱって置く・外す (箱 ⇄ 軸)。盤面と箱の pointer をここで受ける ----
  const drag = attachDrag({
    stage: frame.stage,
    panel: frame.panel,
    rows: puzzle.rows,
    cols: puzzle.cols,
    fit: () => lastFit,
    placedAt: (index) => s.placed[index] ?? null,
    look: (yarn) => {
      const y = content.yarns.get(yarn);
      return {
        body: content.colors.get(y?.color ?? yarn)?.hex ?? COLORS.sumi,
        core: content.cores.get(y?.core ?? '')?.hex ?? COLORS.white,
      };
    },
    diameterPx: () => pegRadius(puzzle.rows, puzzle.cols) * lastFit.scale * 2,
    onPress: (index) => {
      if (s.done || finished) {
        return;
      }
      if (s.placed[index] === null) {
        // 置くのは引っぱる操作だけ。空いた軸を押したら、やり方を案内する
        panel.setMessage(deps.terms.render('箱から{{cone}}を引っぱって、{{spindle}}の丸に嵌めてください'));
        return;
      }
      dispatch({ type: 'pressPeg', index });
    },
    onDrop: (result, yarn) => {
      if (result.kind === 'place') {
        dispatch({ type: 'place', index: result.index, yarn });
      } else if (result.kind === 'remove') {
        dispatch({ type: 'removePeg', index: result.index });
      } else if (result.kind === 'move') {
        dispatch({ type: 'movePeg', from: result.from, to: result.to });
      }
    },
    onHover: (snap, lifted) => {
      if (snap !== snapIndex || lifted !== liftedIndex) {
        snapIndex = snap;
        liftedIndex = lifted;
        if (panelReady) {
          render();
        }
      }
    },
  });

  // ---- 描画 ----
  function render(): void {
    const ctx = frame.stage.getContext('2d');
    if (ctx === null) {
      return; // Canvas が使えない環境 (テスト等)
    }
    ctx.clearRect(0, 0, frame.stage.width, frame.stage.height);
    drawBoard(ctx, lastFit, s, content, deps.terms, { snapIndex, liftedIndex });
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
    drag.cancel(); // 引っぱっている途中なら取り消す
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
        resultLines: [
          { label: '確認した回数', value: `${s.checks}回` },
          { label: 'ヒント', value: `${s.hints}回` },
        ],
        starHint: `${STARS3_CHECKS_MAX}回目で合えば星3です`,
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
      // 効果音。ボタンの音は部品が鳴らす。盤面の操作 (引っぱる・押す) はここで鳴らす
      if (a.type === 'place') {
        deps.audio.play('knot'); // 軸に嵌まった
      } else if (a.type === 'pressPeg' || a.type === 'removePeg' || a.type === 'movePeg' || a.type === 'tapCell') {
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

  // ---- 戻る (確認と保存は gameScreen 側の onExit が行う) ----
  function handleBack(): void {
    props.onExit();
  }

  // ---- 初期表示 ----
  panelReady = true;
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
      drag.destroy(); // 監視と、引っぱっているチーズの重ねを消す
      panel.destroy();
      frame.destroy();
    },
  };
}
