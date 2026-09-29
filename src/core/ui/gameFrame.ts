import { setupCanvas, fitStage, onViewportChange, layoutOf } from '../viewport/viewport';
import type { StageFit, Layout } from '../viewport/viewport';

/**
 * 全ゲームで使う画面の枠。上部の帯 (戻る・題名・遊び方) と
 * 盤面 (Canvas) と操作パネルを配置する。
 */
export interface GameFrame {
  root: HTMLElement;
  stage: HTMLCanvasElement; // 盤面
  panel: HTMLElement; // 操作と情報の欄
  message: HTMLElement; // panel 内のメッセージ欄
  footer: HTMLElement; // 盤面 (Canvas) の下の欄。横長のときだけ使う
  layout(): 'landscape' | 'portrait'; // いまの配置
  resize(): void; // 画面サイズに合わせて配置と Canvas を調整
  destroy(): void; // 監視の解除と DOM の削除
}

/**
 * body の中の幅を、盤面の列と操作欄に分ける。bodyInnerW は body の左右の余白を引いた幅、gap は列のあいだの隙間
 */
export function splitWidths(
  layout: 'landscape' | 'portrait',
  bodyInnerW: number,
  gap: number,
): { stageColW: number; panelW: number } {
  if (layout === 'portrait') {
    return { stageColW: bodyInnerW, panelW: bodyInnerW };
  }
  const stageColW = Math.floor((bodyInnerW - gap) * 0.65);
  return { stageColW, panelW: bodyInnerW - gap - stageColW };
}

const BAR_H = 72; // 上部の帯の高さ

export function createGameFrame(
  parent: HTMLElement,
  opts: {
    title: string; // 呼び出し側で terms.t() 済みの文字列
    onBack: () => void; // 「戻る」(確認は呼び出し側で行う)
    onHelp: () => void; // 「遊び方」
    logicalW: number;
    logicalH: number;
    onStageResize?: (fit: StageFit) => void;
  },
): GameFrame {
  const root = document.createElement('div');
  root.classList.add('game-frame');

  // 上部の帯: 左「戻る」・中央に題名・右「遊び方」
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

  const back = barButton('戻る', opts.onBack);
  back.classList.add('game-frame__bar-left');
  const title = document.createElement('span');
  title.classList.add('game-frame__title');
  title.textContent = opts.title;
  const help = barButton('遊び方', opts.onHelp);
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
  const footer = document.createElement('div');
  footer.classList.add('game-frame__footer');
  const panel = document.createElement('div');
  panel.classList.add('game-frame__panel');
  const message = document.createElement('div');
  message.classList.add('game-frame__message');
  panel.appendChild(message);
  // 盤面の列 (横長のとき): Canvas の上・footer の下
  const stageCol = document.createElement('div');
  stageCol.classList.add('game-frame__stage-col');
  stageCol.appendChild(stageBox);
  stageCol.appendChild(footer);
  body.appendChild(stageCol);
  body.appendChild(panel);
  root.appendChild(body);

  const stage = document.createElement('canvas');
  stageBox.appendChild(stage);

  let offViewport: (() => void) | null = null;

  function applyLayout(): void {
    // 画面全体ではなく parent の実際の内寸を基準にする (#app の safe-area padding を考慮)
    const rect = parent.getBoundingClientRect();
    const innerW = Math.max(0, rect.width);
    const innerH = Math.max(0, rect.height);
    const layout: Layout = layoutOf({ width: innerW, height: innerH }); // レイアウト判定も parent の内寸
    const bodyH = Math.max(0, innerH - BAR_H);
    body.style.height = `${bodyH}px`;
    // body の内寸 (padding を引いた高さ = content box)。style 変更を反映させるため一度読む。
    // 測れない環境 (jsdom 等、clientHeight が 0) では bodyH をそのまま使う
    void body.offsetHeight;
    const cs = getComputedStyle(body);
    const bodyInnerH = body.clientHeight > 0
      ? Math.max(0, body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom))
      : bodyH;
    // body の左右の余白 (padding) を引いた幅。測れない環境 (jsdom 等、clientWidth が 0) では innerW を使う
    const bodyInnerW = body.clientWidth > 0
      ? Math.max(0, body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))
      : innerW;
    const colGap = parseFloat(cs.columnGap) || 0;
    const { stageColW, panelW } = splitWidths(layout, bodyInnerW, colGap);
    if (layout === 'landscape') {
      // 左:盤面の列 (Canvas の上・footer の下)・右:panel
      // footer が空 (子が無い) のときは隠す。Canvas の高さは盤面の列の高さのまま
      const footerEmpty = footer.childElementCount === 0;
      footer.style.display = footerEmpty ? 'none' : '';
      stageCol.style.width = `${stageColW}px`;
      stageCol.style.height = `${bodyInnerH}px`;
      if (footerEmpty) {
        stageBox.style.width = '100%';
        stageBox.style.height = `${bodyInnerH}px`;
        panel.style.width = `${panelW}px`;
        panel.style.height = `${bodyInnerH}px`;
      } else {
        // footer の高さは中身 (実際に測れるなら) から取る。列の gap (rowGap) も引く
        const footerH = footer.getBoundingClientRect().height;
        const rowGap = parseFloat(getComputedStyle(stageCol).rowGap) || 0;
        const stageH = Math.max(0, bodyInnerH - footerH - rowGap);
        stageBox.style.width = '100%';
        stageBox.style.height = `${stageH}px`;
        panel.style.width = `${panelW}px`;
        panel.style.height = `${bodyInnerH}px`;
      }
    } else {
      // 上:盤面 (残り高さの 60%)・下:panel。footer は使わないので隠す
      footer.style.display = 'none';
      stageCol.style.width = `${stageColW}px`;
      const stageH = Math.floor(bodyInnerH * 0.6);
      stageCol.style.height = `${stageH}px`; // 縦長では盤面の列は盤面だけ (footer は隠す)
      stageBox.style.width = '100%';
      stageBox.style.height = `${stageH}px`;
      panel.style.width = `${panelW}px`;
      panel.style.height = `${bodyInnerH - stageH}px`;
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

  parent.appendChild(root);

  // footer の高さが変わったとき (中身が増えた/減ったとき) も、Canvas を作り直して onStageResize を呼ぶ
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      applyLayout();
    });
    ro.observe(footer);
    // parent の大きさも見張る。Safari では回転の直後の resize のときにまだ新しい大きさになっていないことがあり、
    // 古い大きさのまま配置されるのを防ぐ
    ro.observe(parent);
  }
  // footer の子の増減も見張る。footer が空のあいだは display: none で大きさが 0 のままのため、
  // 子を足しても ResizeObserver が呼ばれない (縦長→横長に回したときに帯の並びが消える原因)。
  // 子の増減は MutationObserver で受け取り、applyLayout で footer を表に戻す。
  let mo: MutationObserver | null = null;
  if (typeof MutationObserver !== 'undefined') {
    mo = new MutationObserver(() => {
      applyLayout();
    });
    mo.observe(footer, { childList: true });
  }

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
    footer,
    layout(): 'landscape' | 'portrait' {
      const rect = parent.getBoundingClientRect();
      return layoutOf({ width: Math.max(0, rect.width), height: Math.max(0, rect.height) });
    },
    resize,
    destroy(): void {
      offViewport?.();
      offViewport = null;
      ro?.disconnect();
      ro = null;
      mo?.disconnect();
      mo = null;
      root.remove(); // DOM から消える
    },
  };
}
