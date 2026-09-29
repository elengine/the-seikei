import type { Content } from '../../core/content/content';
import type { CreelState, CreelAction } from './logic';
import { canHint } from './logic';
import { toRuns } from '../../core/domain/stripe';

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

/** 操作欄 (依頼書・いまの帯の並び・箱・道具とボタン) を作る */
export function createCreelPanel(parent: HTMLElement, opts: {
  content: Content;
  onAction: (a: CreelAction) => void;
}): CreelPanel {
  const content = opts.content;
  const root = document.createElement('div');
  root.classList.add('creel-panel');

  // ---- メッセージ (一番上) ----
  const message = document.createElement('p');
  message.classList.add('creel-panel__message');
  message.dataset.testid = 'creel-message';
  root.appendChild(message);

  // ---- 1. 依頼書 ----
  const orderBox = document.createElement('section');
  orderBox.classList.add('creel-section');
  const orderTitle = document.createElement('h2');
  orderTitle.classList.add('creel-section__title');
  orderTitle.textContent = '依頼書';
  orderBox.appendChild(orderTitle);
  const orderTable = document.createElement('div');
  orderTable.classList.add('creel-order');
  orderTable.dataset.testid = 'creel-order';
  orderBox.appendChild(orderTable);
  root.appendChild(orderBox);

  // ---- 2. いまの帯の並び ----
  const bandBox = document.createElement('section');
  bandBox.classList.add('creel-section');
  const bandTitle = document.createElement('h2');
  bandTitle.classList.add('creel-section__title');
  bandTitle.textContent = 'いまの帯の並び';
  bandBox.appendChild(bandTitle);
  const band = document.createElement('div');
  band.classList.add('creel-band');
  band.dataset.testid = 'creel-band';
  bandBox.appendChild(band);
  root.appendChild(bandBox);

  // ---- 3. 箱 ----
  const boxesBox = document.createElement('section');
  boxesBox.classList.add('creel-section');
  const boxesTitle = document.createElement('h2');
  boxesTitle.classList.add('creel-section__title');
  boxesTitle.textContent = '箱';
  boxesBox.appendChild(boxesTitle);
  const boxes = document.createElement('div');
  boxes.classList.add('creel-boxes');
  boxes.dataset.testid = 'creel-boxes';
  boxesBox.appendChild(boxes);
  root.appendChild(boxesBox);

  // ---- 4. 道具とボタン ----
  const toolsBox = document.createElement('section');
  toolsBox.classList.add('creel-section');
  const toolsRow = document.createElement('div');
  toolsRow.classList.add('creel-tools');
  const removeBtn = makeToolButton('はずす', 'creel-tool-remove', () => opts.onAction({ type: 'selectRemove' }));
  const inspectBtn = makeToolButton('しらべる', 'creel-tool-inspect', () => opts.onAction({ type: 'selectInspect' }));
  toolsRow.appendChild(removeBtn);
  toolsRow.appendChild(inspectBtn);
  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.textContent = 'たしかめる';
  checkBtn.classList.add('btn', 'btn--primary', 'creel-tools__check');
  checkBtn.dataset.testid = 'creel-check';
  checkBtn.addEventListener('click', () => opts.onAction({ type: 'check' }));
  const hintBtn = document.createElement('button');
  hintBtn.type = 'button';
  hintBtn.textContent = 'ヒント';
  hintBtn.classList.add('btn', 'btn--secondary');
  hintBtn.dataset.testid = 'creel-hint';
  hintBtn.addEventListener('click', () => opts.onAction({ type: 'hint' }));
  toolsRow.appendChild(checkBtn);
  toolsRow.appendChild(hintBtn);
  toolsBox.appendChild(toolsRow);
  root.appendChild(toolsBox);

  function makeToolButton(label: string, testId: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.classList.add('btn', 'btn--secondary');
    btn.dataset.testid = testId;
    btn.addEventListener('click', onClick);
    return btn;
  }

  parent.appendChild(root);

  /** 状態に合わせて表示を更新する */
  function render(s: CreelState): void {
    // ヒントの押せる見た目
    hintBtn.disabled = !canHint(s);

    // 1. 依頼書 (toRuns を1行ずつ。選んでいる箱と同じ品番の行を藍の太枠に)
    const selHinban = selectedHinban(s, content);
    orderTable.textContent = '';
    for (const run of toRuns(s.answer)) {
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
      orderTable.appendChild(row);
    }

    // 2. いまの帯の並び (番号順に四角。立っている糸は色+記号、空きは点線枠、marks は ✕)
    band.textContent = '';
    for (let i = 0; i < s.placed.length; i++) {
      const cell = document.createElement('div');
      cell.classList.add('creel-cell');
      cell.dataset.testid = `creel-cell-${i}`;
      const placed = s.placed[i] ?? null;
      if (placed !== null) {
        const yarn = content.yarns.get(placed);
        const color = yarn !== undefined ? content.colors.get(yarn.color) : undefined;
        if (color !== undefined) {
          cell.classList.add('creel-cell--filled');
          cell.style.background = color.hex;
          cell.textContent = color.symbol;
          cell.style.color = isLightHex(color.hex) ? '#2B2A24' : '#FFFFFF';
        }
      } else {
        cell.classList.add('creel-cell--empty');
      }
      const num = document.createElement('span');
      num.classList.add('creel-cell__num');
      num.textContent = String(i + 1);
      cell.appendChild(num);
      if (s.marks !== null && (s.marks.wrong.includes(i) || s.marks.empty.includes(i))) {
        const cross = document.createElement('span');
        cross.classList.add('creel-cell__cross');
        cross.dataset.testid = `creel-cross-${i}`;
        cross.textContent = '✕';
        cell.appendChild(cross);
      }
      band.appendChild(cell);
    }

    // 3. 箱 (段ボール色。選んでいる箱は藍の地・白文字・✓)
    boxes.textContent = '';
    for (const yarnId of s.boxes) {
      const yarn = content.yarns.get(yarnId);
      const color = yarn !== undefined ? content.colors.get(yarn.color) : undefined;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('creel-box');
      btn.dataset.testid = `creel-box-${yarnId}`;
      const selected = s.tool.kind === 'box' && s.tool.yarn === yarnId;
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
      btn.addEventListener('click', () => opts.onAction({ type: 'selectBox', yarn: yarnId }));
      boxes.appendChild(btn);
    }

    // 4. 道具の ✓ (選んでいる方だけ)
    removeBtn.textContent = `${s.tool.kind === 'remove' ? '✓ ' : ''}はずす`;
    inspectBtn.textContent = `${s.tool.kind === 'inspect' ? '✓ ' : ''}しらべる`;
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

/** 糸の色が明るいか (記号の文字色の判定) */
function isLightHex(hex: string): boolean {
  const m = hex.match(/^#([0-9A-Fa-f]{6})$/);
  if (m === null) {
    return false;
  }
  const r = parseInt(m[1]!.slice(0, 2), 16);
  const g = parseInt(m[1]!.slice(2, 4), 16);
  const b = parseInt(m[1]!.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 140;
}
