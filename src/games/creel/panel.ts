import type { Content } from '../../core/content/content';
import type { CreelState, CreelAction } from './logic';
import { canHint } from './logic';
import { HINT_MIN_CHECKS, ORDER_RANGE_MAX_STAGE } from './params';
import { toRuns, splitRepeat } from '../../core/domain/stripe';
import { createButton, createChoice, setLockedReason } from '../../core/ui/widgets';
import { createSectionHeading } from '../../core/ui/layout';

export interface CreelPanel {
  update(s: CreelState): void;   // 状態に合わせて表示を更新
  setMessage(text: string): void;
  destroy(): void;
}

/** 選んでいる箱の品番 (箱以外の道具のときは null) */
function selectedHinban(s: CreelState, content: Content): string | null {
  if (s.tool.kind !== 'box') {
    return null;
  }
  return content.yarns.get(s.tool.yarn)?.hinban ?? null;
}

/** 道具の選択 (立てる = 箱を選んでいる状態) */
type ToolValue = 'place' | 'remove' | 'inspect';

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

/** 操作欄 (依頼書・糸の箱・道具・ヒントと確認する) を作る */
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

  // ---- 3. 道具の切り替え (立てる・外す・調べる。PU-07 で無くす) ----
  let lastState: CreelState | null = null;
  let lastBox: CreelState['boxes'][number] | null = null; // 最後に選んでいた箱 (「立てる」に戻すとき使う)
  const toolBox = document.createElement('section');
  toolBox.classList.add('creel-section', 'creel-section--tools');
  const tools = createChoice<ToolValue>({
    options: [
      { value: 'place', label: '立てる' },
      { value: 'remove', label: '外す' },
      { value: 'inspect', label: '調べる' },
    ],
    value: 'place',
    ariaLabel: '道具',
    onChange: (v) => {
      if (v === 'remove') {
        opts.onAction({ type: 'selectRemove' });
      } else if (v === 'inspect') {
        opts.onAction({ type: 'selectInspect' });
      } else {
        const yarn = lastBox ?? lastState?.boxes[0];
        if (yarn !== undefined) {
          opts.onAction({ type: 'selectBox', yarn });
        }
      }
    },
  });
  tools.root.querySelectorAll('button').forEach((b, i) => {
    b.dataset.testid = ['creel-tool-place', 'creel-tool-remove', 'creel-tool-inspect'][i] ?? '';
  });
  toolBox.appendChild(tools.root);
  root.appendChild(toolBox);

  // ---- 4. 一番下: ヒント (左) と 確認する (右・主) ----
  const actions = document.createElement('div');
  actions.classList.add('creel-actions');
  const hintBtn = createButton({
    label: 'ヒント',
    variant: 'secondary',
    testId: 'creel-hint',
    lockedReason: '2回確認すると使えます',
    onLocked: (reason) => {
      message.textContent = reason;
    },
    onClick: () => opts.onAction({ type: 'hint' }),
  });
  const checkBtn = createButton({
    label: '確認する',
    variant: 'primary',
    testId: 'creel-check',
    onClick: () => opts.onAction({ type: 'check' }),
  });
  checkBtn.classList.add('creel-actions__check');
  actions.appendChild(hintBtn);
  actions.appendChild(checkBtn);
  root.appendChild(actions);

  parent.appendChild(root);

  /** 何本目から何本目か (例「(1〜4本目)」「(5本目)」) */
  function rangeText(start: number, count: number): string {
    return count === 1 ? `(${start}本目)` : `(${start}〜${start + count - 1}本目)`;
  }

  /** 状態に合わせて表示を更新する */
  function render(s: CreelState): void {
    lastState = s;
    if (s.tool.kind === 'box') {
      lastBox = s.tool.yarn;
    }

    // ヒント: 押せないときは点線の枠にして、押すと理由を出す
    const reason = hintLockedReason(s);
    setLockedReason(hintBtn, reason);
    hintBtn.textContent = s.checks < HINT_MIN_CHECKS ? `ヒント(あと ${HINT_MIN_CHECKS - s.checks} 回)` : 'ヒント';

    // 1. 依頼書。くりかえし (times>=2 かつ unit.length>=2) なら「1リピート分」の表にして、
    //    その下に「↻ 繰り返し × N」の1行を足す。段階1〜3 だけ、何本目かを書き添える
    const selHinban = selectedHinban(s, content);
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
      if (yarn !== undefined && yarn.hinban === selHinban) {
        row.classList.add('creel-order-row--selected');
      }
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
      if (showRange) {
        const range = document.createElement('span');
        range.classList.add('creel-order-row__range');
        range.textContent = rangeText(start, run.count);
        row.appendChild(range);
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

    // 2. 糸の箱 (woodLight の枠の白いボタン。選んでいる箱は藍の地・白文字・✓)
    boxes.textContent = '';
    for (const yarnId of s.boxes) {
      const yarn = content.yarns.get(yarnId);
      const color = yarn !== undefined ? content.colors.get(yarn.color) : undefined;
      const selected = s.tool.kind === 'box' && s.tool.yarn === yarnId;
      const btn = createButton({
        label: '',
        variant: 'secondary',
        testId: `creel-box-${yarnId}`,
        onClick: () => opts.onAction({ type: 'selectBox', yarn: yarnId }),
      });
      btn.classList.add('creel-box');
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      if (selected) {
        btn.classList.add('creel-box--selected');
      }
      const hinban = document.createElement('span');
      hinban.classList.add('creel-box__hinban');
      hinban.textContent = yarn?.hinban ?? yarnId;
      const label = document.createElement('span');
      label.classList.add('creel-box__label');
      label.textContent = `${selected ? '✓ ' : ''}${color?.symbol ?? ''} ${color?.name ?? ''}`;
      btn.appendChild(hinban);
      btn.appendChild(label);
      boxes.appendChild(btn);
    }

    // 3. 道具の切り替え
    tools.setValue(s.tool.kind === 'box' ? 'place' : s.tool.kind);
  }

  return {
    update(s: CreelState): void {
      render(s);
    },

    setMessage(text: string): void {
      message.textContent = text;
    },

    destroy(): void {
      root.remove();
    },
  };
}
