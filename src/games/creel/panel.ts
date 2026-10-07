import type { Content } from '../../core/content/content';
import type { CreelState, CreelAction } from './logic';
import { canHint } from './logic';
import { HINT_MIN_CHECKS } from './params';
import { toRuns, splitRepeat } from '../../core/domain/stripe';
import { createButton, setLockedReason } from '../../core/ui/widgets';
import { createConeIcon } from './coneIcon';
import { createSectionHeading } from '../../core/ui/layout';
import { openSheet } from '../../core/ui/sheet';
import { createScrollBar } from '../../core/ui/scrollBar';
import type { ScrollBar } from '../../core/ui/scrollBar';
import type { Sheet } from '../../core/ui/sheet';

export interface CreelPanel {
  update(s: CreelState): void;   // 状態に合わせて表示を更新
  setMessage(text: string): void;
  destroy(): void;
}

/** ヒントが使えないときの理由 (押したときに出す) */
function hintLockedReason(s: CreelState): string | null {
  if (canHint(s)) {
    return null;
  }
  const rest = HINT_MIN_CHECKS - s.checks;
  if (rest > 0) {
    return `あと ${rest} 回確認に失敗すると使えます`;
  }
  return '確認して ✕ が出ると使えます';
}

/** 操作欄 (依頼書・糸の箱・ヒントと確認する) を作る。箱は引っぱってチーズを置く元 (引っぱる動きは dragView が受ける。箱を押しても何も選ばない) */
export function createCreelPanel(parent: HTMLElement, opts: {
  content: Content;
  onAction: (a: CreelAction) => void;
  /** GameFrame の message 欄。渡されたときはそこに書き、独自のメッセージ欄は作らない */
  message?: HTMLElement;
  /** 盤面の上のお知らせ (GameFrame の notify)。渡されたときは、ヒントの案内をここに出し、メッセージ欄は作らない */
  notify?: (text: string) => void;
}): CreelPanel {
  const content = opts.content;
  const root = document.createElement('div');
  root.classList.add('creel-panel');

  // ---- メッセージ (一番上) ----
  // GameFrame の message 欄が渡されたらそれを使う (メッセージ欄を1つにする)
  // notify が渡されたときは、メッセージ欄を作らない (欄の代わりに、盤面の上のお知らせを使う)
  const message = opts.message ?? (() => {
    const m = document.createElement('p');
    m.classList.add('creel-panel__message');
    m.dataset.testid = 'creel-message';
    if (opts.notify === undefined) {
      root.appendChild(m);
    }
    return m;
  })();
  /** ヒントの案内などを伝える: お知らせがあればそこへ、無ければメッセージ欄へ */
  function say(text: string): void {
    if (opts.notify !== undefined) {
      opts.notify(text);
    } else {
      message.textContent = text;
    }
  }

  function section(heading: string): HTMLElement {
    const box = document.createElement('section');
    box.classList.add('creel-section');
    box.appendChild(createSectionHeading(heading));
    root.appendChild(box);
    return box;
  }

  // ---- 1. 依頼書 ----
  const orderBox = section('依頼書');
  const orderTable = document.createElement('div');
  orderTable.classList.add('creel-order');
  orderTable.dataset.testid = 'creel-order';
  orderBox.appendChild(orderTable);

  // ---- 2. 糸の箱 ----
  const boxesBox = section('糸の箱');
  // 箱の帯 (boxes) と、そのすぐ下 (縦長)・すぐ右 (横長) の専用スクロールバーを、1 つの行 (boxesRow) に置く (PU-20a)
  const boxesRow = document.createElement('div');
  boxesRow.classList.add('creel-boxes-row');
  boxesBox.appendChild(boxesRow);
  const boxes = document.createElement('div');
  boxes.classList.add('creel-boxes');
  boxes.dataset.testid = 'creel-boxes';
  boxesRow.appendChild(boxes);

  // ---- 3. 一番下: 依頼書 (左・詰めた形)・ヒント・確認 (右・主) ----
  const actions = document.createElement('div');
  actions.classList.add('creel-actions');
  // 最後に update で受けた状態 (ヒントを使ったあとのメッセージに、残りの ✕ の数を出すため)
  let current: CreelState | null = null;
  const hintBtn = createButton({
    label: 'ヒント',
    variant: 'secondary',
    testId: 'creel-hint',
    lockedReason: 'あと 2 回確認に失敗すると使えます',
    onLocked: (reason) => {
      say(reason);
    },
    onClick: () => {
      const before = current;
      opts.onAction({ type: 'hint' });
      if (before !== null && before.marks !== null) {
        // 使ったあとの残り (1 回で ✕ を 1 つ直す)。onAction の中でメッセージが書き換わるので、そのあとに書く
        const rest = before.marks.wrong.length + before.marks.empty.length - 1;
        say(rest > 0 ? `ヒントを使いました。あと ${rest} 回使えます` : 'ヒントを使いました');
      }
    },
  });
  const checkBtn = createButton({
    label: '確認',
    variant: 'primary',
    testId: 'creel-check',
    onClick: () => opts.onAction({ type: 'check' }),
  });
  checkBtn.classList.add('creel-actions__check');
  actions.appendChild(hintBtn);
  actions.appendChild(checkBtn);
  root.appendChild(actions);

  parent.appendChild(root);

  // ---- 詰めた形 (狭い・低い画面。gameFrame が game-frame--compact と data-layout を付ける) ----
  // 依頼書は「依頼書を見る」ボタンで下から出る重ね表示に、箱は一列にして送る向きを data-scroll に出す
  const frameEl = parent.closest<HTMLElement>('.game-frame');
  let orderBtn: HTMLButtonElement | null = null;
  let sheet: Sheet | null = null;

  function closeSheet(): void {
    sheet?.close(); // onClose で依頼書の表を戻す
  }

  function toggleSheet(): void {
    if (sheet !== null && sheet.isOpen()) {
      closeSheet();
      return;
    }
    const opened = openSheet({
      parent: frameEl ?? parent,
      title: '依頼書',
      size: 'tall',
      onClose: () => {
        sheet = null;
        orderTable.remove(); // 詰めた形では、閉じているあいだ表は操作欄に置かない
        if (!isCompactNow()) {
          orderBox.appendChild(orderTable);
        }
      },
    });
    sheet = opened;
    opened.body.appendChild(orderTable);
  }

  function isCompactNow(): boolean {
    return frameEl?.classList.contains('game-frame--compact') ?? false;
  }

  // ---- 箱の帯の専用スクロールバー (詰めた形だけ。縦長は横・横長は縦。全部見えているときは出さない) ----
  let bar: ScrollBar | null = null;
  let barAxis: 'x' | 'y' | null = null;

  /** バーに、箱の帯の見えている大きさ・全体の大きさ・位置を伝える */
  function syncBar(): void {
    if (bar === null || barAxis === null) {
      return;
    }
    const x = barAxis === 'x';
    bar.update({
      view: x ? boxes.clientWidth : boxes.clientHeight,
      total: x ? boxes.scrollWidth : boxes.scrollHeight,
      pos: x ? boxes.scrollLeft : boxes.scrollTop,
    });
  }

  /** 向き (縦長 x・横長 y・詰めた形でなければ無し) に合わせてバーを作り直す */
  function applyBar(axis: 'x' | 'y' | null): void {
    if (axis !== barAxis) {
      bar?.destroy();
      bar = null;
      barAxis = axis;
      if (axis !== null) {
        bar = createScrollBar({
          orientation: axis,
          ariaLabel: '糸の箱の列',
          onChange: (pos) => {
            if (axis === 'x') {
              boxes.scrollLeft = pos;
            } else {
              boxes.scrollTop = pos;
            }
            syncBar();
          },
        });
        boxesRow.appendChild(bar.root); // 箱の帯のすぐ下・すぐ右
      }
    }
    syncBar();
  }

  function applyMode(): void {
    const compact = isCompactNow();
    const axis = compact ? (frameEl?.dataset.layout === 'landscape' ? 'y' : 'x') : null;
    boxes.dataset.scroll = axis ?? '';
    applyBar(axis);
    if (compact) {
      if (orderBtn === null) {
        orderBtn = createButton({ label: '依頼書', variant: 'secondary', onClick: toggleSheet });
        orderBtn.classList.add('creel-order-open');
        if (sheet === null) {
          orderTable.remove();
        }
      }
      // 「依頼書」は、縦でも横でも「ヒント」「確認」と同じ行の左端に置く (操作欄が縦に収まる)
      if (orderBtn.parentElement !== actions) {
        actions.insertBefore(orderBtn, hintBtn);
      }
      orderBox.hidden = true; // 空になる節を隠す (操作欄の隙間が余らない)
    } else {
      closeSheet();
      orderBtn?.remove();
      orderBtn = null;
      orderBox.hidden = false;
      if (orderTable.parentElement !== orderBox) {
        orderBox.appendChild(orderTable);
      }
    }
  }
  applyMode();
  const modeObserver =
    frameEl !== null && typeof MutationObserver !== 'undefined' ? new MutationObserver(applyMode) : null;
  if (frameEl !== null) {
    modeObserver?.observe(frameEl, { attributes: true, attributeFilter: ['class', 'data-layout'] });
  }
  // 画面の大きさ・文字の大きさが変わって帯の大きさが変わったら、バーを出すか・つまみの長さを計算し直す
  const sizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => syncBar()) : null;
  sizeObserver?.observe(boxes);

  /** 状態に合わせて表示を更新する */
  function render(s: CreelState): void {
    // ヒント: 押せないときは点線の枠にして、押すと理由を出す
    current = s;
    const reason = hintLockedReason(s);
    setLockedReason(hintBtn, reason);

    // 1. 依頼書。くりかえし (times>=2 かつ unit.length>=2) なら「1リピート分」の表にして、
    //    その下に「↻ N回繰り返す」の1行を足す (何本目かの括弧書きは出さない)
    orderTable.textContent = '';
    const { unit, times } = splitRepeat(s.answer);
    const useRepeat = times >= 2 && unit.length >= 2;
    const runs = toRuns(useRepeat ? unit : s.answer);
    for (const run of runs) {
      const yarn = content.yarns.get(run.yarn);
      const color = yarn !== undefined ? content.colors.get(yarn.color) : undefined;
      const row = document.createElement('div');
      row.classList.add('creel-order-row');
      row.dataset.testid = 'creel-order-row';
      // 左から コーンの絵 → 型番 → 個数 (色名と芯の文字は出さない。色と芯は絵で分かる)
      const core = yarn !== undefined ? content.cores.get(yarn.core) : undefined;
      row.appendChild(
        createConeIcon({
          bodyHex: color?.hex,
          coreHex: core?.hex,
          label: [color?.name, core !== undefined ? `芯:${core.name}` : undefined].filter((x) => x !== undefined).join(' '),
        }),
      );
      const hinban = document.createElement('span');
      hinban.classList.add('creel-order-row__hinban');
      hinban.textContent = yarn?.hinban ?? run.yarn;
      const count = document.createElement('span');
      count.classList.add('creel-order-row__count');
      count.textContent = `× ${run.count}`;
      row.appendChild(hinban);
      row.appendChild(count);
      orderTable.appendChild(row);
    }
    if (useRepeat) {
      const rep = document.createElement('div');
      rep.classList.add('creel-order-repeat');
      rep.dataset.testid = 'creel-order-repeat';
      rep.textContent = `↻ ${times}回繰り返す`;
      orderTable.appendChild(rep);
    }

    // 2. 糸の箱 (段ボール箱。品番とチーズの絵だけ。どこを押さえてもチーズを引っぱれる。押しても選ばない)
    boxes.textContent = '';
    for (const yarnId of s.boxes) {
      const yarn = content.yarns.get(yarnId);
      const color = yarn !== undefined ? content.colors.get(yarn.color) : undefined;
      const core = yarn !== undefined ? content.cores.get(yarn.core) : undefined;
      const box = document.createElement('div');
      box.classList.add('creel-box');
      box.dataset.testid = `creel-box-${yarnId}`;
      box.dataset.yarn = yarnId; // 引っぱるチーズの糸 (dragView が読む)
      box.setAttribute('role', 'img');
      box.setAttribute(
        'aria-label',
        [yarn?.hinban ?? yarnId, color?.name, core !== undefined ? `芯:${core.name}` : undefined].filter((x) => x !== undefined).join(' '),
      );
      const hinban = document.createElement('span');
      hinban.classList.add('creel-box__hinban');
      hinban.textContent = yarn?.hinban ?? yarnId;
      // チーズの絵: 糸の色の丸・紙の芯の輪・中央の穴 (依頼書の行と同じ部品)
      const cheese = createConeIcon({ bodyHex: color?.hex, coreHex: core?.hex, className: 'creel-box__cheese' });
      box.appendChild(cheese); // 絵 → 型番 (縦長は絵の下に型番、横長は絵の右に型番)
      box.appendChild(hinban);
      boxes.appendChild(box);
    }
    syncBar();
  }

  return {
    update(s: CreelState): void {
      render(s);
    },

    setMessage(text: string): void {
      message.textContent = text;
    },

    destroy(): void {
      modeObserver?.disconnect();
      sizeObserver?.disconnect();
      bar?.destroy();
      bar = null;
      closeSheet();
      root.remove();
    },
  };
}
