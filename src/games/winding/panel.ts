import { createPedalControl, createTensionMeter } from '../../core/ui/pedalControl';
import { createButton } from '../../core/ui/widgets';
import { createSectionHeading } from '../../core/ui/layout';
import type { WindingState, WindingAction } from './logic';
import { targetMsOf } from './logic';
import { SECTION_LENGTH } from './params';

/**
 * ドラム巻きの操作欄 (P2 T2-06・T2-09a、PU-05c で組み直し)。
 * 区画は上から: 帯の番号・巻き量・制限時間、張りのメーター、ペダル、主な操作。
 * メッセージ欄は無い (PU-14a)。押せないペダルを押したときの理由は onNotice に出す。この部品はメッセージ欄を作らない。
 * メーターの範囲は State のもの (お題ごとに決まる)。
 */

export interface WindingPanel {
  update(s: WindingState): void;
  destroy(): void;
}

/** ペダルが押せないときの理由 (フェーズごと) */
function pedalReason(phase: WindingState['phase']): string {
  switch (phase) {
    case 'ready':
      return '「巻き始める」を押すと使えます';
    case 'broken':
      return '糸をつなぐと使えます';
    case 'cutting':
      return '「帯の端を結ぶ」を押すと使えます';
    default:
      return '今は使えません';
  }
}

export function createWindingPanel(
  parent: HTMLElement,
  opts: {
    terms: { t(k: string): string };
    onAction: (a: WindingAction) => void;
    /** 押せないボタンを押したときの理由を出す (message 欄に書くなど) */
    onNotice?: (text: string) => void;
  },
): WindingPanel {
  const root = document.createElement('div');
  root.className = 'winding-panel';

  // 1. 帯の番号・巻いた長さ・経過時間 (「0:42 / 1:30」の形。20px 以上は CSS 側。T2-09a)
  const section = document.createElement('div');
  section.className = 'winding-panel__section';
  root.appendChild(section);

  // 2. 張りのメーター (節の見出しは用語の呼び名)
  const meterBox = document.createElement('section');
  meterBox.className = 'winding-panel__block';
  meterBox.setAttribute('aria-label', opts.terms.t('tension')); // 詰めた形で見出しを隠しても、読み上げで分かる
  meterBox.appendChild(createSectionHeading(opts.terms.t('tension')));
  const meterHost = document.createElement('div');
  meterHost.className = 'winding-panel__meter';
  meterBox.appendChild(meterHost);
  root.appendChild(meterBox);
  const meter = createTensionMeter(meterHost, { label: '', showState: false }); // 状態の文は出さない (盤面のランプで示す)

  // 3. ペダル
  const pedalBox = document.createElement('section');
  pedalBox.className = 'winding-panel__block';
  pedalBox.setAttribute('aria-label', opts.terms.t('pedal'));
  pedalBox.appendChild(createSectionHeading(opts.terms.t('pedal')));
  const pedalHost = document.createElement('div');
  pedalHost.className = 'winding-panel__pedal';
  pedalBox.appendChild(pedalHost);
  root.appendChild(pedalBox);
  const pedal = createPedalControl(pedalHost, {
    label: '',
    onChange: (v) => opts.onAction({ type: 'setPedal', value: v }),
    onLocked: (reason) => opts.onNotice?.(reason),
    buttons: false, // 「戻す」「踏み込む」は無し (溝を指で動かす)
    showValue: false, // 速さの表示は無し
  });

  // 4. 一番下の主な操作 ('ready' は「巻き始める」、'cutting' は「帯の端を結ぶ」。それ以外は空けておく)
  const buttonRow = document.createElement('div');
  buttonRow.className = 'winding-panel__actions';
  const startBtn = createButton({
    label: '巻き始める',
    variant: 'primary',
    onClick: () => opts.onAction({ type: 'start' }),
  });
  startBtn.classList.add('winding-panel__main');
  const cutBtn = createButton({
    label: '帯の端を結ぶ',
    variant: 'primary',
    onClick: () => opts.onAction({ type: 'cut' }),
  });
  cutBtn.classList.add('winding-panel__main');
  buttonRow.appendChild(startBtn);
  buttonRow.appendChild(cutBtn);
  root.appendChild(buttonRow);

  parent.appendChild(root);

  /** 経過時間を「0:42」の形にする (T2-09a) */
  function clockText(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  /** ボタンの表示を phase で切り替える (場所は空けたまま) */
  function showButton(s: WindingState): void {
    startBtn.style.display = s.phase === 'ready' ? '' : 'none';
    cutBtn.style.display = s.phase === 'cutting' ? '' : 'none';
  }

  function part(text: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  }

  return {
    update(s: WindingState): void {
      section.textContent = '';
      const len = s.lengths[s.current] ?? 0;
      const pct = Math.floor((len / SECTION_LENGTH) * 100);
      section.appendChild(part(`帯 ${s.current + 1} / ${s.sections}`));
      section.appendChild(part(`巻き量 ${pct}%`));
      const target = targetMsOf(s);
      const over = s.elapsedMs > target;
      // 制限時間は大きく見せる。目標を超えたら朱の文字にして「超過」を添える (色だけに頼らない)
      const time = part(`${clockText(s.elapsedMs)} / ${clockText(target)}${over ? ' 超過' : ''}`);
      time.className = over ? 'winding-panel__clock winding-panel__clock--over' : 'winding-panel__clock';
      section.appendChild(time);
      meter.update(s.tension, s.range);
      pedal.setEnabled(s.phase === 'winding', pedalReason(s.phase));
      // 横木の位置を状態に合わせる (setValue は onChange を呼ばないので、繰り返しにはならない)
      pedal.setValue(s.pedal.pedal);
      showButton(s);
    },
    destroy(): void {
      pedal.destroy();
      meter.destroy();
      root.remove();
    },
  };
}
