import { setupCanvas, fitStage, onViewportChange, currentSize, layoutOf } from '../viewport/viewport';
import type { StageFit, Layout } from '../viewport/viewport';

/**
 * 全ゲームで使う画面の枠。上部の帯 (もどる・題名・あそびかた) と
 * 盤面 (Canvas) と操作パネルを配置する。
 */
export interface GameFrame {
  root: HTMLElement;
  stage: HTMLCanvasElement; // 盤面
  panel: HTMLElement; // 操作と情報の欄
  message: HTMLElement; // panel 内のメッセージ欄
  resize(): void; // 画面サイズに合わせて配置と Canvas を調整
  destroy(): void; // 監視の解除と DOM の削除
}

const BAR_H = 72; // 上部の帯の高さ

export function createGameFrame(
  parent: HTMLElement,
  opts: {
    title: string; // 呼び出し側で terms.t() 済みの文字列
    onBack: () => void; // 「もどる」(確認は呼び出し側で行う)
    onHelp: () => void; // 「あそびかた」
    logicalW: number;
    logicalH: number;
    onStageResize?: (fit: StageFit) => void;
  },
): GameFrame {
  const root = document.createElement('div');
  root.classList.add('game-frame');

  // 上部の帯: 左「もどる」・中央に題名・右「あそびかた」
  const bar = document.createElement('div');
  bar.classList.add('game-frame__bar');
  bar.style.height = `${BAR_H}px`;

  function barButton(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.classList.add('btn', 'btn--secondary', 'game-frame__bar-btn');
    b.textContent = label;
    // 64px 以上の押しやすさ
    b.style.minWidth = '64px';
    b.style.minHeight = '64px';
    b.addEventListener('click', onClick);
    return b;
  }

  const back = barButton('もどる', opts.onBack);
  back.classList.add('game-frame__bar-left');
  const title = document.createElement('span');
  title.classList.add('game-frame__title');
  title.textContent = opts.title;
  const help = barButton('あそびかた', opts.onHelp);
  help.classList.add('game-frame__bar-right');
  bar.appendChild(back);
  bar.appendChild(title);
  bar.appendChild(help);
  root.appendChild(bar);

  // 盤面と panel の入れ物
  const body = document.createElement('div');
  body.classList.add('game-frame__body');
  const stageBox = document.createElement('div');
  stageBox.classList.add('game-frame__stage');
  const panel = document.createElement('div');
  panel.classList.add('game-frame__panel');
  const message = document.createElement('div');
  message.classList.add('game-frame__message');
  panel.appendChild(message);
  body.appendChild(stageBox);
  body.appendChild(panel);
  root.appendChild(body);

  const stage = document.createElement('canvas');
  stageBox.appendChild(stage);

  let offViewport: (() => void) | null = null;

  function applyLayout(): void {
    const size = currentSize();
    const layout: Layout = layoutOf(size);
    const bodyH = Math.max(0, size.height - BAR_H);
    body.style.height = `${bodyH}px`;
    if (layout === 'landscape') {
      // 左:盤面 (残り幅の 65%)・右:panel
      const stageW = Math.floor(size.width * 0.65);
      stageBox.style.width = `${stageW}px`;
      stageBox.style.height = `${bodyH}px`;
      panel.style.width = `${size.width - stageW}px`;
      panel.style.height = `${bodyH}px`;
    } else {
      // 上:盤面 (残り高さの 60%)・下:panel
      const stageH = Math.floor(bodyH * 0.6);
      stageBox.style.width = `${size.width}px`;
      stageBox.style.height = `${stageH}px`;
      panel.style.width = `${size.width}px`;
      panel.style.height = `${bodyH - stageH}px`;
    }
    // 盤面の Canvas を領域いっぱいに作り、fitStage の結果を渡す
    const w = stageBox.clientWidth;
    const h = stageBox.clientHeight;
    try {
      setupCanvas(stage, w, h);
    } catch {
      // Canvas が使えない環境 (テスト等) では CSS サイズだけ合わせる
      stage.style.width = `${w}px`;
      stage.style.height = `${h}px`;
    }
    opts.onStageResize?.(fitStage(opts.logicalW, opts.logicalH, w, h));
  }

  function resize(): void {
    applyLayout();
  }

  const root0 = { root };
  void root0;

  parent.appendChild(root);

  // 画面サイズに合わせて自動的に調整する
  offViewport = onViewportChange(() => {
    resize();
  });
  applyLayout();

  return {
    root,
    stage,
    panel,
    message,
    resize,
    destroy(): void {
      offViewport?.();
      offViewport = null;
      root.remove(); // DOM から消える
    },
  };
}
