/**
 * ドラム設定の電卓 (T2c-03a)。四則 (+ − × ÷)・小数点・C・=。
 * 計算の部分 (calc) は純粋な関数で、見た目 (openCalculatorBody) と分けている。
 */
import { createButton } from '../../core/ui/widgets';
import { ANGLES, YARN_COEF } from './params';
import type { Grade } from './params';

export interface CalcState {
  /** 表示中の数字 (入力中の文字列。エラーのときは「エラー」) */
  display: string;
  /** 記憶している数 (= を押す前の左辺) */
  acc: number | null;
  /** 記憶している演算子 */
  op: '+' | '-' | '*' | '/' | null;
  /** 演算子を押した直後か (次の数字は新しく打ち始める) */
  entered: boolean;
  /** エラー中か */
  error: boolean;
}

export type CalcKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '.' | '+' | '-' | '*' | '/' | '=' | 'C';

/** 電卓の初期状態 (表示は 0) */
export function initialCalc(): CalcState {
  return { display: '0', acc: null, op: null, entered: false, error: false };
}

/** 表示の文字列を数にする (エラーのときは 0) */
function toNumber(display: string): number {
  const n = Number(display);
  return Number.isFinite(n) ? n : 0;
}

/** 数を表示の文字列にする (小数第4位まで。余分な 0 は落とす) */
function format(n: number): string {
  const rounded = Math.round(n * 10000) / 10000;
  return String(rounded);
}

/** 計算する。0 で割ったときは null (エラー) */
function apply(acc: number, op: '+' | '-' | '*' | '/', v: number): number | null {
  switch (op) {
    case '+': return acc + v;
    case '-': return acc - v;
    case '*': return acc * v;
    case '/': return v === 0 ? null : acc / v;
  }
}

/** キーを1つ押したあとの状態。元の s は変更しない */
export function calc(s: CalcState, key: CalcKey): CalcState {
  if (key === 'C') {
    return initialCalc();
  }
  if (s.error) {
    // エラー中は C 以外は新しい数字入力から始める
    if (key >= '0' && key <= '9') {
      return { display: key, acc: null, op: null, entered: false, error: false };
    }
    return s;
  }
  if (key >= '0' && key <= '9') {
    if (s.entered) {
      return { ...s, display: key, entered: false };
    }
    // 0 の頭は1つだけ (「0」→「0.5」は打てる)
    if (s.display === '0') {
      return { ...s, display: key };
    }
    return { ...s, display: s.display + key };
  }
  if (key === '.') {
    if (s.entered) {
      return { ...s, display: '0.', entered: false };
    }
    if (s.display.includes('.')) {
      return s; // 小数点は1つ
    }
    return { ...s, display: s.display + '.' };
  }
  if (key === '+' || key === '-' || key === '*' || key === '/') {
    if (s.acc !== null && s.op !== null && !s.entered) {
      // 前の計算をしてから次の演算子を記憶する (1+2+3 の形)
      const r = apply(s.acc, s.op, toNumber(s.display));
      if (r === null) {
        return { display: 'エラー', acc: null, op: null, entered: true, error: true };
      }
      return { display: format(r), acc: r, op: key, entered: true, error: false };
    }
    return { display: s.display, acc: toNumber(s.display), op: key, entered: true, error: false };
  }
  // '='
  if (s.acc !== null && s.op !== null) {
    const r = apply(s.acc, s.op, toNumber(s.display));
    if (r === null) {
      return { display: 'エラー', acc: null, op: null, entered: true, error: true };
    }
    return { display: format(r), acc: null, op: null, entered: true, error: false };
  }
  return s;
}

/** 表示に出す文字列 (エラーのときは「エラー」) */
export function displayValue(s: CalcState): string {
  return s.display;
}

/** 電卓の本体 (openSheet の中身。T2c-03a)。tan の表と厚みの係数の表も見られる */
export function openCalculatorBody(
  parent: HTMLElement,
  opts: { onUse: (value: number) => void },
): { destroy(): void } {
  const root = document.createElement('div');
  root.className = 'drumsetup-calc';

  // 表の切り替えと表示場所 (電卓の上に出す)
  const tableArea = document.createElement('div');
  tableArea.className = 'drumsetup-calc__tables';
  const tanBtn = createButton({ label: 'tan の表', variant: 'secondary', onClick: () => showTable('tan') });
  const coefBtn = createButton({ label: '厚みの係数の表', variant: 'secondary', onClick: () => showTable('coef') });
  const tableRow = document.createElement('div');
  tableRow.className = 'drumsetup-calc__tablebtns';
  tableRow.appendChild(tanBtn);
  tableRow.appendChild(coefBtn);
  const table = document.createElement('div');
  table.className = 'drumsetup-calc__table';
  table.dataset.testid = 'drumsetup-calc-table';
  tableArea.appendChild(tableRow);
  tableArea.appendChild(table);

  function showTable(kind: 'tan' | 'coef'): void {
    table.textContent = '';
    if (kind === 'tan') {
      for (const a of ANGLES) {
        const span = document.createElement('span');
        span.textContent = `tan ${a}° = ${Math.round(Math.tan((a * Math.PI) / 180) * 100) / 100}`;
        table.appendChild(span);
      }
    } else {
      for (const g of Object.keys(YARN_COEF) as Grade[]) {
        const span = document.createElement('span');
        span.textContent = `${g}: ${YARN_COEF[g]}mm`;
        table.appendChild(span);
      }
    }
  }

  // 表示 (右揃え・大きな数字)
  const display = document.createElement('div');
  display.className = 'drumsetup-calc__display';
  display.dataset.testid = 'drumsetup-calc-display';
  display.textContent = '0';

  // キー
  const keys: { key: CalcKey; label: string }[] = [
    { key: '7', label: '7' }, { key: '8', label: '8' }, { key: '9', label: '9' }, { key: '/', label: '÷' },
    { key: '4', label: '4' }, { key: '5', label: '5' }, { key: '6', label: '6' }, { key: '*', label: '×' },
    { key: '1', label: '1' }, { key: '2', label: '2' }, { key: '3', label: '3' }, { key: '-', label: '−' },
    { key: '0', label: '0' }, { key: '.', label: '.' }, { key: '=', label: '=' }, { key: '+', label: '+' },
  ];
  const pad = document.createElement('div');
  pad.className = 'drumsetup-calc__keys';
  let state = initialCalc();
  for (const k of keys) {
    const b = createButton({ label: k.label, onClick: () => {
      state = calc(state, k.key);
      display.textContent = displayValue(state);
    } });
    b.classList.add('drumsetup-calc__key');
    pad.appendChild(b);
  }
  const clearBtn = createButton({ label: 'C', variant: 'secondary', onClick: () => {
    state = calc(state, 'C');
    display.textContent = displayValue(state);
  } });
  clearBtn.classList.add('drumsetup-calc__key', 'drumsetup-calc__clear');

  // この答えを送り量に入れる
  const useBtn = createButton({ label: 'この答えを送り量に入れる', variant: 'primary', size: 'large', onClick: () => {
    const v = Number(displayValue(state));
    if (Number.isFinite(v) && !state.error) {
      opts.onUse(v);
    }
  } });
  useBtn.classList.add('drumsetup-calc__use');

  root.appendChild(tableArea);
  root.appendChild(display);
  root.appendChild(clearBtn);
  root.appendChild(pad);
  root.appendChild(useBtn);
  parent.appendChild(root);
  return {
    destroy(): void {
      root.remove();
    },
  };
}
