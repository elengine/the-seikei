import { createButton, setLockedReason } from '../../core/ui/widgets';
import { createScrollBar } from '../../core/ui/scrollBar';
import type { ScrollBar } from '../../core/ui/scrollBar';
import { openSheet } from '../../core/ui/sheet';
import type { Sheet } from '../../core/ui/sheet';
import { getContent } from '../../core/content/content';
import { COLORS } from '../../core/ui/tokens';
import { createConeIcon } from '../creel/coneIcon';
import type { ItowariAction, ItowariState } from './logic';
import { helpText, orderText } from './messages';
import type { ItowariPuzzle } from './puzzles';
import { fmtM } from './geometry';
import { yarnHex } from './renderer';

/**
 * 糸割りの操作欄 (PU-16)。上から 依頼書・計算の手伝い・元の糸の箱の帯 (クリール立てと同じ段ボールの箱。
 * 収まらないときだけ専用のスクロールバー)・「電卓」「巻き始める」の行。
 * 低い横長 (詰めた形の横) では、依頼書と手伝いは操作欄に出さず「依頼書」ボタンから重ね表示で見る (箱の帯に高さを回す)。
 * 長さは、盤面の口の長さの数字を押すとテンキーの重ね表示 (openLength) で入れる (増減ボタンは無い)。
 * メッセージ欄は使わない (createGameFrame で message: false)。短いお知らせは notify で出す。
 */

export interface ItowariPanel {
  /** 操作欄の根 (箱の帯を含む。controller が箱の引っぱりをつなぐ) */
  root: HTMLElement;
  update(s: ItowariState): void;
  select(spindle: number): void; // 口を押した (盤面から) ときに選ぶ
  setLength(v: number): void; // 電卓で計算した値を、選んでいる口の長さにする
  /** 長さを入れるテンキーを開く (盤面の長さの数字を押したとき)。糸がかかっていない口・巻いている間は開かず、理由を出す */
  openLength(spindle: number, slot: 0 | 1): void;
  destroy(): void;
}

interface PanelOpts {
  onAction: (a: ItowariAction) => void;
  onNotice: (text: string) => void;
  onCalculator: () => void;
  puzzle: ItowariPuzzle;
}

/** テンキーに入れられる桁数 (10,000 m まで。論理側が 10,000 に収める) */
const MAX_DIGITS = 5;

export function createItowariPanel(parent: HTMLElement, opts: PanelOpts): ItowariPanel {
  const content = getContent();
  const hex = yarnHex(content, opts.puzzle);
  const frameEl = parent.closest<HTMLElement>('.game-frame');
  const root = document.createElement('div');
  root.className = 'itowari-panel';

  const order = document.createElement('p');
  order.className = 'itowari-panel__order';
  const help = document.createElement('p');
  help.className = 'itowari-panel__help';

  // ---- 元の糸の箱の帯 (クリール立てと同じ段ボールの箱) と専用のスクロールバー ----
  const boxesSection = document.createElement('section');
  boxesSection.className = 'itowari-panel__boxes';
  boxesSection.setAttribute('aria-label', '元の糸の箱');
  const boxesRow = document.createElement('div');
  boxesRow.className = 'creel-boxes-row';
  const boxes = document.createElement('div');
  boxes.className = 'creel-boxes';
  boxes.dataset.testid = 'itowari-boxes';
  boxesRow.appendChild(boxes);
  boxesSection.appendChild(boxesRow);

  // ---- 一番下: 電卓 (左) と 巻き始める (右・主) ----
  const actions = document.createElement('div');
  actions.className = 'itowari-panel__actions';
  const calcBtn = createButton({ label: '電卓', variant: 'secondary', onLocked: (r) => opts.onNotice(r), onClick: opts.onCalculator });
  const startBtn = createButton({
    label: '巻き始める',
    variant: 'primary',
    onLocked: (r) => opts.onNotice(r),
    onClick: () => {
      if (s === null) return;
      if (missingLength()) {
        opts.onNotice('長さが設定されていない口があります');
        return;
      }
      opts.onAction({ type: 'start' });
    },
  });
  // 「依頼書」(低い横長だけ。左端)。押すと依頼書と手伝いを重ね表示で見る
  let orderBtn: HTMLButtonElement | null = null;
  let orderSheet: Sheet | null = null;
  actions.appendChild(calcBtn);
  actions.appendChild(startBtn);

  root.appendChild(order);
  root.appendChild(help);
  root.appendChild(boxesSection);
  root.appendChild(actions);
  parent.appendChild(root);

  let s: ItowariState | null = null;
  const sel = { spindle: 0, slot: 0 as 0 | 1 };
  let numpad: Sheet | null = null;

  /** かけている口の番号 (0始まり) */
  function mountedSpindles(): number[] {
    if (s === null) return [];
    return s.spindles.map((_, i) => i).filter((i) => s!.spindles[i]!.segments.length > 0);
  }

  function missingLength(): boolean {
    return mountedSpindles().some((i) => s!.spindles[i]!.segments.some((seg) => seg.lengthM === 0));
  }

  function sendSetLength(spindle: number, slot: 0 | 1, v: number): void {
    const rounded = Math.round(v / 10) * 10; // 10m 単位
    opts.onAction({ type: 'setLength', spindle, slot, lengthM: rounded });
  }

  // ---- 箱の帯の専用スクロールバー (詰めた形だけ。縦長は帯の下に横・横長は帯の右に縦。全部見えるときは出さない) ----
  let bar: ScrollBar | null = null;
  let barAxis: 'x' | 'y' | null = null;

  function syncBar(): void {
    if (bar === null || barAxis === null) return;
    const x = barAxis === 'x';
    bar.update({
      view: x ? boxes.clientWidth : boxes.clientHeight,
      total: x ? boxes.scrollWidth : boxes.scrollHeight,
      pos: x ? boxes.scrollLeft : boxes.scrollTop,
    });
  }

  function applyBar(axis: 'x' | 'y' | null): void {
    if (axis !== barAxis) {
      bar?.destroy();
      bar = null;
      barAxis = axis;
      if (axis !== null) {
        bar = createScrollBar({
          orientation: axis,
          ariaLabel: '元の糸の箱の列',
          onChange: (pos) => {
            if (axis === 'x') boxes.scrollLeft = pos;
            else boxes.scrollTop = pos;
            syncBar();
          },
        });
        boxesRow.appendChild(bar.root); // 箱の帯のすぐ下・すぐ右
      }
    }
    syncBar();
  }

  function isCompactNow(): boolean {
    return frameEl?.classList.contains('game-frame--compact') ?? false;
  }

  function closeOrderSheet(): void {
    orderSheet?.close();
    orderSheet = null;
  }

  function toggleOrderSheet(): void {
    if (orderSheet !== null && orderSheet.isOpen()) {
      closeOrderSheet();
      return;
    }
    const sheet = openSheet({ parent: frameEl ?? parent, title: '依頼書', size: 'tall', onClose: () => (orderSheet = null) });
    orderSheet = sheet;
    for (const t of [orderText(opts.puzzle), help.textContent ?? '']) {
      if (t === '') continue;
      const p = document.createElement('p');
      p.className = 'itowari-panel__order';
      p.textContent = t;
      sheet.body.appendChild(p);
    }
  }

  function applyMode(): void {
    const compact = isCompactNow();
    const axis = compact ? (frameEl?.dataset.layout === 'landscape' ? 'y' : 'x') : null;
    boxes.dataset.scroll = axis ?? '';
    applyBar(axis);
    // 低い横長: 依頼書と手伝いを操作欄から外し、「依頼書」ボタンを出す
    const lowLandscape = axis === 'y';
    order.hidden = lowLandscape;
    if (lowLandscape) {
      if (orderBtn === null) {
        orderBtn = createButton({ label: '依頼書', variant: 'secondary', onClick: toggleOrderSheet });
        actions.insertBefore(orderBtn, calcBtn);
      }
    } else {
      closeOrderSheet();
      orderBtn?.remove();
      orderBtn = null;
    }
    help.hidden = lowLandscape || (help.textContent ?? '') === '';
  }
  applyMode();
  const modeObserver = frameEl !== null && typeof MutationObserver !== 'undefined' ? new MutationObserver(applyMode) : null;
  if (frameEl !== null) {
    modeObserver?.observe(frameEl, { attributes: true, attributeFilter: ['class', 'data-layout'] });
  }
  const sizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => syncBar()) : null;
  sizeObserver?.observe(boxes);

  /** 箱の帯: まだ口にかけていない・使い切っていない元の糸を「糸 N」と糸の絵で並べる */
  function renderBoxes(state: ItowariState): void {
    const mounted = new Set(state.spindles.flatMap((sp) => sp.segments.map((seg) => seg.sourceId)));
    boxes.textContent = '';
    opts.puzzle.sources.forEach((src, k) => {
      if (mounted.has(src.id) || state.used.includes(src.id)) return;
      const box = document.createElement('div');
      box.className = 'creel-box';
      box.dataset.testid = `itowari-box-${src.id}`;
      box.dataset.source = src.id; // 押す・引っぱる元 (boxDrag が読む)
      box.setAttribute('role', 'img');
      box.setAttribute('aria-label', `糸 ${k + 1}`);
      const label = document.createElement('span');
      label.className = 'creel-box__hinban';
      label.textContent = `糸 ${k + 1}`;
      box.appendChild(createConeIcon({ bodyHex: hex, coreHex: COLORS.kinariDeep, className: 'creel-box__cheese' }));
      box.appendChild(label);
      boxes.appendChild(box);
    });
  }

  // ---- 長さのテンキー (重ね表示) ----
  function closeNumpad(): void {
    numpad?.close();
    numpad = null;
  }

  function openNumpad(spindle: number, slot: 0 | 1): void {
    closeNumpad();
    const current = s?.spindles[spindle]?.segments[slot]?.lengthM ?? 0;
    let typed = '';
    const sheet = openSheet({ parent: frameEl ?? parent, title: '長さ', size: 'tall', onClose: () => (numpad = null) });
    numpad = sheet;
    const value = sheet.root.querySelector<HTMLElement>('.sheet__title');
    const shown = (): number => (typed === '' ? current : Number(typed));
    const paint = (): void => {
      if (value !== null) {
        value.classList.add('itowari-numpad__value');
        value.textContent = `${fmtM(shown())} m`;
      }
    };
    paint();
    sheet.body.classList.add('itowari-numpad');
    const keys = document.createElement('div');
    keys.className = 'itowari-numpad__keys';
    const key = (label: string, cls: string, onClick: () => void): HTMLButtonElement => {
      const b = createButton({ label, variant: cls === 'ok' ? 'primary' : 'secondary', onClick });
      b.classList.add('itowari-numpad__key');
      return b;
    };
    for (const d of '1234567890') {
      keys.appendChild(
        key(d, 'digit', () => {
          if (typed.length >= MAX_DIGITS) return;
          typed = typed === '0' ? d : typed + d;
          paint();
        }),
      );
    }
    keys.appendChild(
      key('消す', 'back', () => {
        typed = typed.slice(0, -1);
        paint();
      }),
    );
    keys.appendChild(
      key('決定', 'ok', () => {
        if (typed !== '') sendSetLength(spindle, slot, Number(typed));
        closeNumpad();
      }),
    );
    const same = key('ほかの口にも同じ長さ', 'same', () => {
      const v = shown();
      if (v > 0 && s !== null) {
        for (const i of mountedSpindles()) {
          sendSetLength(i, i === spindle ? slot : 0, v);
        }
        opts.onNotice('ほかの口にも同じ長さを入れました');
      }
      closeNumpad();
    });
    same.classList.add('itowari-numpad__same');
    keys.appendChild(same);
    sheet.body.appendChild(keys);
  }

  function lock(b: HTMLButtonElement, locked: boolean, reason: string): void {
    setLockedReason(b, locked ? reason : null);
  }

  function refresh(): void {
    if (s === null) return;
    order.textContent = orderText(opts.puzzle);
    const weighedId = s.weighed[s.weighed.length - 1];
    const weighedG = weighedId !== undefined ? opts.puzzle.sources.find((src) => src.id === weighedId)?.grossG : undefined;
    const text = helpText(opts.puzzle, weighedG);
    help.textContent = text;
    help.hidden = order.hidden || text === '';
    const winding = s.phase === 'winding';
    const setup = s.phase === 'setup';
    lock(calcBtn, winding, '巻いています');
    const startable = setup && mountedSpindles().length > 0 && !missingLength();
    lock(startBtn, !startable, winding ? '巻いています' : missingLength() ? '長さが設定されていない口があります' : '口にかけていません');
    renderBoxes(s);
    syncBar();
  }

  return {
    root,
    update(next: ItowariState): void {
      s = next;
      refresh();
    },
    select(spindle: number): void {
      sel.spindle = spindle;
      sel.slot = 0;
    },
    setLength(v: number): void {
      sendSetLength(sel.spindle, sel.slot, v);
    },
    openLength(spindle: number, slot: 0 | 1): void {
      if (s === null) return;
      if (s.phase === 'winding') {
        opts.onNotice('巻いています');
        return;
      }
      if (s.phase !== 'setup') return;
      if (s.spindles[spindle]?.segments[slot] === undefined) {
        opts.onNotice('先に元の糸を口にかけてください');
        return;
      }
      sel.spindle = spindle;
      sel.slot = slot;
      openNumpad(spindle, slot);
    },
    destroy(): void {
      modeObserver?.disconnect();
      sizeObserver?.disconnect();
      closeNumpad();
      closeOrderSheet();
      bar?.destroy();
      bar = null;
      root.remove();
    },
  };
}
