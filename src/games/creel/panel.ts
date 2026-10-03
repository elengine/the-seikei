import type { Content } from '../../core/content/content';
import type { CreelState, CreelAction } from './logic';
import { canHint } from './logic';
import { HINT_MIN_CHECKS, ORDER_RANGE_MAX_STAGE } from './params';
import { toRuns, splitRepeat } from '../../core/domain/stripe';
import { createButton, setLockedReason } from '../../core/ui/widgets';
import { createSectionHeading } from '../../core/ui/layout';
import { openSheet } from '../../core/ui/sheet';
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
    return rest === HINT_MIN_CHECKS ? `${rest}回確認すると使えます` : `あと ${rest} 回確認すると使えます`;
  }
  return '確認して ✕ が出ると使えます';
}

/** 操作欄 (依頼書・糸の箱・ヒントと確認する) を作る。箱は引っぱってチーズを置く元 (引っぱる動きは dragView が受ける。箱を押しても何も選ばない) */
export function createCreelPanel(parent: HTMLElement, opts: {
  content: Content;
  onAction: (a: CreelAction) => void;
  /** GameFrame の message 欄。渡されたときはそこに書き、独自のメッセージ欄は作らない */
  message?: HTMLElement;
}): CreelPanel {
  const content = opts.content;
  const root = document.createElement('div');
  root.classList.add('creel-panel');

  // ---- メッセージ (一番上) ----
  // GameFrame の message 欄が渡されたらそれを使う (メッセージ欄を1つにする)
  const message = opts.message ?? (() => {
    const m = document.createElement('p');
    m.classList.add('creel-panel__message');
    m.dataset.testid = 'creel-message';
    root.appendChild(m);
    return m;
  })();

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
  const boxes = document.createElement('div');
  boxes.classList.add('creel-boxes');
  boxes.dataset.testid = 'creel-boxes';
  boxesBox.appendChild(boxes);

  // ---- 3. 一番下: ヒント (左) と 完了 (右・主) ----
  const actions = document.createElement('div');
  actions.classList.add('creel-actions');
  // 最後に update で受けた状態 (ヒントを使ったあとのメッセージに、残りの ✕ の数を出すため)
  let current: CreelState | null = null;
  const hintBtn = createButton({
    label: 'ヒント',
    variant: 'secondary',
    testId: 'creel-hint',
    lockedReason: '2回確認すると使えます',
    onLocked: (reason) => {
      message.textContent = reason;
    },
    onClick: () => {
      const before = current;
      opts.onAction({ type: 'hint' });
      if (before !== null && before.marks !== null) {
        // 使ったあとの残り (1 回で ✕ を 1 つ直す)。onAction の中でメッセージが書き換わるので、そのあとに書く
        const rest = before.marks.wrong.length + before.marks.empty.length - 1;
        message.textContent = rest > 0 ? `ヒントを使いました。あと ${rest} 回使えます` : 'ヒントを使いました';
      }
    },
  });
  const checkBtn = createButton({
    label: '完了',
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

  function applyMode(): void {
    const compact = isCompactNow();
    boxes.dataset.scroll = compact ? (frameEl?.dataset.layout === 'landscape' ? 'y' : 'x') : '';
    if (compact) {
      if (orderBtn === null) {
        orderBtn = createButton({ label: '依頼書を見る', variant: 'secondary', onClick: toggleSheet });
        orderBtn.classList.add('creel-order-open');
        orderBox.appendChild(orderBtn);
        if (sheet === null) {
          orderTable.remove();
        }
      }
    } else {
      closeSheet();
      orderBtn?.remove();
      orderBtn = null;
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

  /** 紙の芯の色の表示 (16px の丸と「芯:赤」の文字。色だけに頼らない) */
  function coreTag(coreId: string | undefined): HTMLElement | null {
    const core = coreId !== undefined ? content.cores.get(coreId) : undefined;
    if (core === undefined) {
      return null;
    }
    const tag = document.createElement('span');
    tag.classList.add('core-tag');
    const dot = document.createElement('span');
    dot.classList.add('core-dot');
    dot.style.background = core.hex;
    dot.setAttribute('aria-hidden', 'true');
    tag.appendChild(dot);
    tag.appendChild(document.createTextNode(`芯:${core.name}`));
    return tag;
  }

  /** 何本目から何本目か (例「(1〜4本目)」「(5本目)」) */
  function rangeText(start: number, count: number): string {
    return count === 1 ? `(${start}本目)` : `(${start}〜${start + count - 1}本目)`;
  }

  /** 状態に合わせて表示を更新する */
  function render(s: CreelState): void {
    // ヒント: 押せないときは点線の枠にして、押すと理由を出す
    current = s;
    const reason = hintLockedReason(s);
    setLockedReason(hintBtn, reason);

    // 1. 依頼書。くりかえし (times>=2 かつ unit.length>=2) なら「1リピート分」の表にして、
    //    その下に「↻ 繰り返し × N」の1行を足す。段階1〜3 だけ、何本目かを書き添える
    const showRange = s.stage <= ORDER_RANGE_MAX_STAGE;
    orderTable.textContent = '';
    const { unit, times } = splitRepeat(s.answer);
    const useRepeat = times >= 2 && unit.length >= 2;
    const runs = toRuns(useRepeat ? unit : s.answer);
    let start = 1;
    for (const run of runs) {
      const yarn = content.yarns.get(run.yarn);
      const color = yarn !== undefined ? content.colors.get(yarn.color) : undefined;
      const row = document.createElement('div');
      row.classList.add('creel-order-row');
      row.dataset.testid = 'creel-order-row';
      const hinban = document.createElement('span');
      hinban.classList.add('creel-order-row__hinban');
      hinban.textContent = yarn?.hinban ?? run.yarn;
      const colorLabel = document.createElement('span');
      colorLabel.classList.add('creel-order-row__color');
      colorLabel.textContent = `${color?.symbol ?? ''} ${color?.name ?? ''}`;
      const count = document.createElement('span');
      count.classList.add('creel-order-row__count');
      count.textContent = `× ${run.count}`;
      row.appendChild(hinban);
      row.appendChild(colorLabel);
      row.appendChild(count);
      // 下の段: 芯の色と、何本目か (段階1〜3)
      const sub = document.createElement('div');
      sub.classList.add('creel-order-row__sub');
      const tag = coreTag(yarn?.core);
      if (tag !== null) {
        sub.appendChild(tag);
      }
      if (showRange) {
        const range = document.createElement('span');
        range.classList.add('creel-order-row__range');
        range.textContent = rangeText(start, run.count);
        sub.appendChild(range);
      }
      if (sub.childElementCount > 0) {
        row.appendChild(sub);
      }
      start += run.count;
      orderTable.appendChild(row);
    }
    if (useRepeat) {
      const rep = document.createElement('div');
      rep.classList.add('creel-order-repeat');
      rep.dataset.testid = 'creel-order-repeat';
      rep.textContent = `↻ 繰り返し × ${times}`;
      if (showRange) {
        const range = document.createElement('span');
        range.classList.add('creel-order-row__range');
        range.textContent = `(${unit.length + 1}本目から同じ並びを ${times - 1} 回)`;
        rep.appendChild(range);
      }
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
      // チーズの絵: 糸の色の丸・紙の芯の輪・中央の穴 (引っぱるチーズ creel-drag と同じ描き方)
      const cheese = document.createElement('span');
      cheese.classList.add('creel-box__cheese');
      cheese.setAttribute('aria-hidden', 'true');
      if (color !== undefined) {
        cheese.style.setProperty('--creel-drag-body', color.hex);
      }
      if (core !== undefined) {
        cheese.style.setProperty('--creel-drag-core', core.hex);
      }
      const coreRing = document.createElement('span');
      coreRing.classList.add('creel-drag__core');
      const hole = document.createElement('span');
      hole.classList.add('creel-drag__hole');
      coreRing.appendChild(hole);
      cheese.appendChild(coreRing);
      box.appendChild(hinban);
      box.appendChild(cheese);
      boxes.appendChild(box);
    }
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
      closeSheet();
      root.remove();
    },
  };
}
