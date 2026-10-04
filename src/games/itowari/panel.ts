import { createButton, createChoice, setLockedReason } from '../../core/ui/widgets';
import type { ItowariAction, ItowariState } from './logic';
import { helpText, orderText } from './messages';
import type { ItowariPuzzle } from './puzzles';
import { fmtM } from './geometry';

/**
 * 糸割りの操作欄 (P2b T2b-03a)。依頼書・計算の手伝い (+電卓)・長さの設定 (10m 単位)・「巻き始める」。
 * メッセージ欄は使わない (createGameFrame で message: false)。短いお知らせは notify で出す。
 */

export interface ItowariPanel {
  update(s: ItowariState): void;
  select(spindle: number): void; // 口を押した (盤面から) ときに選ぶ
  setLength(v: number): void; // 電卓で計算した値を、選んでいる口の長さにする
  destroy(): void;
}

interface PanelOpts {
  onAction: (a: ItowariAction) => void;
  onNotice: (text: string) => void;
  onCalculator: () => void;
  puzzle: ItowariPuzzle;
}

/** 口の選択と、選んでいる区間 (1つ目か継ぐ糸か) */
interface Selection {
  spindle: number;
  slot: 0 | 1;
}

const KEYS: Array<{ label: string; delta: number }> = [
  { label: '−1000', delta: -1000 },
  { label: '−100', delta: -100 },
  { label: '−10', delta: -10 },
  { label: '+10', delta: 10 },
  { label: '+100', delta: 100 },
  { label: '+1000', delta: 1000 },
];

export function createItowariPanel(parent: HTMLElement, opts: PanelOpts): ItowariPanel {
  const root = document.createElement('div');
  root.className = 'itowari-panel';

  const order = document.createElement('p');
  order.className = 'itowari-panel__order';

  const help = document.createElement('p');
  help.className = 'itowari-panel__help';
  const calcBtn = createButton({ label: '電卓', variant: 'secondary', onLocked: (r) => opts.onNotice(r), onClick: opts.onCalculator });
  const helpRow = document.createElement('div');
  helpRow.className = 'itowari-panel__helprow';
  helpRow.appendChild(help);
  helpRow.appendChild(calcBtn);

  const section = document.createElement('div');
  section.className = 'itowari-panel__setting';
  section.setAttribute('aria-label', '長さの設定');
  const big = document.createElement('p');
  big.className = 'itowari-panel__length';
  const segChoice = createChoice<'first' | 'splice'>({
    ariaLabel: '巻く区間',
    options: [
      { value: 'first', label: '1つ目' },
      { value: 'splice', label: '継ぐ糸' },
    ],
    value: 'first',
    onChange: (v) => {
      sel.slot = v === 'splice' ? 1 : 0;
      refresh();
    },
  });
  segChoice.root.classList.add('itowari-panel__seg');
  const keys = document.createElement('div');
  keys.className = 'itowari-panel__keys';
  const keyBtns = KEYS.map((k) =>
    createButton({
      label: k.label,
      onLocked: (r) => opts.onNotice(r),
      onClick: () => {
        const cur = selectedLength();
        if (cur === null) return;
        sendSetLength(Math.max(0, cur + k.delta));
      },
    }),
  );
  for (const b of keyBtns) keys.appendChild(b);
  const sameBtn = createButton({
    label: 'ほかの口にも同じ長さ',
    variant: 'secondary',
    onLocked: (r) => opts.onNotice(r),
    onClick: () => {
      if (s === null) return;
      const cur = selectedLength();
      if (cur === null) return;
      for (let i = 0; i < opts.puzzle.sources.length; i++) {
        if (i !== sel.spindle && s.spindles[i]!.segments.length > 0) {
          opts.onAction({ type: 'setLength', spindle: i, slot: 0, lengthM: cur });
        }
      }
      opts.onNotice('ほかの口にも同じ長さを入れました');
    },
  });
  const startBtn = createButton({
    label: '巻き始める',
    variant: 'primary',
    onLocked: (r) => opts.onNotice(r),
    onClick: () => {
      if (s === null) return;
      const missing = mountedSpindles().some((i) => s!.spindles[i]!.segments.some((seg) => seg.lengthM === 0));
      if (missing) {
        opts.onNotice('長さが設定されていない口があります');
        return;
      }
      opts.onAction({ type: 'start' });
    },
  });
  section.appendChild(big);
  section.appendChild(segChoice.root);
  section.appendChild(keys);
  section.appendChild(sameBtn);
  root.appendChild(order);
  root.appendChild(helpRow);
  root.appendChild(section);
  const actions = document.createElement('div');
  actions.className = 'itowari-panel__actions';
  actions.appendChild(startBtn);
  root.appendChild(actions);
  parent.appendChild(root);

  let s: ItowariState | null = null;
  const sel: Selection = { spindle: 0, slot: 0 };

  /** かけている口の番号 (0始まり) */
  function mountedSpindles(): number[] {
    if (s === null) return [];
    return opts.puzzle.sources.map((_, i) => i).filter((i) => s!.spindles[i]!.segments.length > 0);
  }

  /** 選んでいる区間の設定した長さ (未設定や選んでいないときは null) */
  function selectedLength(): number | null {
    if (s === null) return null;
    const seg = s.spindles[sel.spindle]!.segments[sel.slot];
    return seg !== undefined ? seg.lengthM : null;
  }


  function sendSetLength(v: number): void {
    const rounded = Math.round(v / 10) * 10; // 10m 単位
    opts.onAction({ type: 'setLength', spindle: sel.spindle, slot: sel.slot, lengthM: rounded });
  }

  /** ボタンを押せない形にする (押したときは理由を notify)。押せる形に戻すときは null */
  function lock(b: HTMLButtonElement, locked: boolean, reason: string): void {
    setLockedReason(b, locked ? reason : null);
  }

  function refresh(): void {
    if (s === null) return;
    order.textContent = orderText(opts.puzzle);
    const weighedId = s.weighed[s.weighed.length - 1];
    const weighedG = weighedId !== undefined ? opts.puzzle.sources.find((src) => src.id === weighedId)?.grossG : undefined;
    help.textContent = helpText(opts.puzzle, weighedG);
    const winding = s.phase === 'winding';
    const setup = s.phase === 'setup';
    const has = s.spindles[sel.spindle]!.segments.length > 0;
    segChoice.root.style.display = has && s.spindles[sel.spindle]!.segments.length === 2 ? '' : 'none';
    const len = selectedLength();
    big.textContent = has ? `${sel.spindle + 1}番の口:${fmtM(len ?? 0)} m` : `${sel.spindle + 1}番の口:— m`;
    for (const b of keyBtns) {
      lock(b, !setup || !has || len === null, winding ? '巻いています' : '口を選んでください');
    }
    lock(sameBtn, !setup, winding ? '巻いています' : '口を選んでください');
    lock(calcBtn, winding, '巻いています');
    const missing = mountedSpindles().some((i) => s!.spindles[i]!.segments.some((seg) => seg.lengthM === 0));
    const startable = setup && mountedSpindles().length > 0 && !missing;
    lock(startBtn, !startable, winding ? '巻いています' : missing ? '長さが設定されていない口があります' : '口にかけていません');
  }

  return {
    update(next: ItowariState): void {
      s = next;
      refresh();
    },
    select(spindle: number): void {
      sel.spindle = spindle;
      sel.slot = 0;
      segChoice.setValue('first');
      refresh();
    },
    setLength(v: number): void {
      sendSetLength(v);
    },
    destroy(): void {
      root.remove();
    },
  };
}
