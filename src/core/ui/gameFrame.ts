import { setupCanvas, fitStage, onViewportChange, layoutOf, isCompact } from '../viewport/viewport';
import type { StageFit, Layout } from '../viewport/viewport';
import { createButton } from './widgets';
import { createScreenHeader } from './layout';

/**
 * 全ゲームで使う画面の枠。上の見出しの行 (戻る・題名・遊び方) と
 * 盤面 (Canvas のカード) と操作パネル (白いカード) を配置する。
 */
export interface GameFrame {
  root: HTMLElement;
  stage: HTMLCanvasElement; // 盤面
  panel: HTMLElement; // 操作と情報の欄
  message: HTMLElement; // panel 内のメッセージ欄
  footer: HTMLElement; // 盤面 (Canvas) の下の欄。横長のときだけ使う
  setSubtitle(text: string): void; // 題名の下の文字 (今のお題)
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
  stageRatio = 0.65, // 横長のとき、盤面の列が使う幅の割合
): { stageColW: number; panelW: number } {
  if (layout === 'portrait') {
    return { stageColW: bodyInnerW, panelW: bodyInnerW };
  }
  const stageColW = Math.floor((bodyInnerW - gap) * stageRatio);
  return { stageColW, panelW: bodyInnerW - gap - stageColW };
}

/** 上の見出しの行の高さ。測れない環境 (jsdom など) ではこの値を使う */
const BAR_H = 72;

export function createGameFrame(
  parent: HTMLElement,
  opts: {
    title: string; // 呼び出し側で terms.t() 済みの文字列
    subtitle?: string; // 題名の下の小さな文字 (今のお題)
    onBack: () => void; // 「戻る」(確認は呼び出し側で行う)
    onHelp: () => void; // 「遊び方」
    logicalW: number;
    logicalH: number;
    portraitStageRatio?: number; // 縦長のときに盤面が使う高さの割合 (無ければ 0.6。詰めた形では 0.45)
    compactStageWidthRatio?: number; // 詰めた形の横長で盤面が使う幅の割合 (無ければ 0.6)
    onStageResize?: (fit: StageFit) => void;
  },
): GameFrame {
  const root = document.createElement('div');
  root.classList.add('game-frame');

  // 上の見出しの行: 左「戻る」・中央に題名 (と今のお題)・右「遊び方」
  const header = createScreenHeader({
    title: opts.title,
    subtitle: opts.subtitle,
    onBack: opts.onBack,
    right: createButton({ label: '遊び方', variant: 'secondary', icon: 'help', shape: 'circle', onClick: opts.onHelp }),
  });
  header.classList.add('game-frame__bar');
  header.querySelector<HTMLElement>('.screen-header__left button')?.classList.add('game-frame__bar-left', 'game-frame__bar-btn');
  header.querySelector<HTMLElement>('.screen-header__right button')?.classList.add('game-frame__bar-right', 'game-frame__bar-btn');
  root.appendChild(header);

  /** 見出しの行の高さ (題名の下の文字の有無で変わるので、測れるなら測る) */
  function barHeight(): number {
    const h = header.getBoundingClientRect().height;
    return h > 0 ? h : BAR_H;
  }

  function setSubtitle(text: string): void {
    let sub = header.querySelector<HTMLElement>('.screen-header__subtitle');
    if (sub === null) {
      sub = document.createElement('p');
      sub.classList.add('screen-header__subtitle');
      header.querySelector('.screen-header__center')?.appendChild(sub);
    }
    sub.textContent = text;
  }

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

  /** メッセージ欄の置き場: 詰めた形は盤面のカードのすぐ上 (カードの外。盤面に重ならない)、今の形は操作欄の一番上 */
  function placeMessage(compact: boolean): void {
    if (compact) {
      if (message.parentElement !== stageCol || message.nextElementSibling !== stageBox) {
        stageCol.insertBefore(message, stageBox);
      }
    } else if (message.parentElement !== panel) {
      panel.insertBefore(message, panel.firstChild);
    }
  }

  function applyLayout(): void {
    // 画面全体ではなく parent の実際の内寸を基準にする (#app の safe-area padding を考慮)
    const rect = parent.getBoundingClientRect();
    const innerW = Math.max(0, rect.width);
    const innerH = Math.max(0, rect.height);
    const layout: Layout = layoutOf({ width: innerW, height: innerH }); // レイアウト判定も parent の内寸
    // 狭い・低い画面は「詰めた形」(測れない環境 (jsdom 等) の 0×0 は今の形のまま)。回転のたびに判定し直す
    const compact = innerW > 0 && innerH > 0 && isCompact(innerW, innerH);
    root.classList.toggle('game-frame--compact', compact);
    root.dataset.layout = layout;
    placeMessage(compact);
    const bodyH = Math.max(0, innerH - barHeight());
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
    // 詰めた形では、盤面のカードの上にメッセージ欄がある。その高さ (と隙間) を盤面のカードの高さから引く
    const msgH =
      compact && message.parentElement === stageCol
        ? message.getBoundingClientRect().height + (parseFloat(getComputedStyle(stageCol).rowGap) || 0)
        : 0;
    const { stageColW, panelW } = splitWidths(layout, bodyInnerW, colGap, compact ? (opts.compactStageWidthRatio ?? 0.6) : 0.65);
    if (layout === 'landscape') {
      // 左:盤面の列 (Canvas の上・footer の下)・右:panel
      // footer が空 (子が無い) のときは隠す。Canvas の高さは盤面の列の高さのまま
      const footerEmpty = footer.childElementCount === 0;
      footer.style.display = footerEmpty ? 'none' : '';
      stageCol.style.width = `${stageColW}px`;
      stageCol.style.height = `${bodyInnerH}px`;
      if (footerEmpty) {
        stageBox.style.width = '100%';
        stageBox.style.height = `${Math.max(0, bodyInnerH - msgH)}px`;
        panel.style.width = `${panelW}px`;
        panel.style.height = `${bodyInnerH}px`;
      } else {
        // footer の高さは中身 (実際に測れるなら) から取る。列の gap (rowGap) も引く
        const footerH = footer.getBoundingClientRect().height;
        const rowGap = parseFloat(getComputedStyle(stageCol).rowGap) || 0;
        const stageH = Math.max(0, bodyInnerH - footerH - rowGap - msgH);
        stageBox.style.width = '100%';
        stageBox.style.height = `${stageH}px`;
        panel.style.width = `${panelW}px`;
        panel.style.height = `${bodyInnerH}px`;
      }
    } else {
      // 上:盤面 (残り高さの portraitStageRatio、無ければ 60%)・下:panel。footer は使わないので隠す
      footer.style.display = 'none';
      stageCol.style.width = `${stageColW}px`;
      const stageH = Math.floor(bodyInnerH * (compact ? 0.45 : (opts.portraitStageRatio ?? 0.6)));
      stageCol.style.height = `${stageH}px`; // 縦長では盤面の列は盤面だけ (footer は隠す)
      stageBox.style.width = '100%';
      stageBox.style.height = `${Math.max(0, stageH - msgH)}px`;
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
    ro.observe(header); // 題名の下の文字が増減して高さが変わったときも配置し直す
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
    setSubtitle,
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
