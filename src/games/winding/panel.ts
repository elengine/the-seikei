import { createPedalControl, createTensionMeter } from '../../core/ui/pedalControl';
import type { WindingState, WindingAction } from './logic';
import { SECTION_LENGTH } from './params';

/**
 * ドラム巻きの操作欄 (P2 T2-06)。
 * 区画は上から: 帯の番号と長さ、張りのメーター、ペダル、ボタン。
 * メッセージは GameFrame の message 欄を使う (controller が書く)。この部品はメッセージ欄を作らない。
 */

export interface WindingPanel {
  update(s: WindingState): void;
  destroy(): void;
}

export function createWindingPanel(
  parent: HTMLElement,
  opts: {
    terms: { t(k: string): string };
    range: { min: number; max: number };
    onAction: (a: WindingAction) => void;
  },
): WindingPanel {
  const root = document.createElement('div');
  root.className = 'winding-panel';

  // 1. 帯の番号と長さ
  const section = document.createElement('div');
  section.className = 'winding-panel__section';
  root.appendChild(section);

  // 2. 張りのメーター
  const meterHost = document.createElement('div');
  meterHost.className = 'winding-panel__meter';
  root.appendChild(meterHost);
  const meter = createTensionMeter(meterHost, { label: opts.terms.t('tension') });

  // 3. ペダル
  const pedalHost = document.createElement('div');
  pedalHost.className = 'winding-panel__pedal';
  root.appendChild(pedalHost);
  const pedal = createPedalControl(pedalHost, {
    label: opts.terms.t('pedal'),
    onChange: (v) => opts.onAction({ type: 'setPedal', value: v }),
  });

  // 4. ボタン ('ready' は「巻き始める」、'cutting' は「帯の端を結ぶ」。それ以外は空けておく)
  const buttonRow = document.createElement('div');
  buttonRow.className = 'winding-panel__actions';
  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'btn btn--primary winding-panel__main';
  startBtn.textContent = '巻き始める';
  startBtn.addEventListener('click', () => opts.onAction({ type: 'start' }));
  const cutBtn = document.createElement('button');
  cutBtn.type = 'button';
  cutBtn.className = 'btn btn--primary winding-panel__main';
  cutBtn.textContent = '帯の端を結ぶ';
  cutBtn.addEventListener('click', () => opts.onAction({ type: 'cut' }));
  buttonRow.appendChild(startBtn);
  buttonRow.appendChild(cutBtn);
  root.appendChild(buttonRow);

  parent.appendChild(root);

  /** ボタンの表示を phase で切り替える (場所は空けたまま) */
  function showButton(s: WindingState): void {
    startBtn.style.display = s.phase === 'ready' ? '' : 'none';
    cutBtn.style.display = s.phase === 'cutting' ? '' : 'none';
  }

  return {
    update(s: WindingState): void {
      section.textContent = '';
      const label = document.createElement('span');
      label.textContent = `帯 ${s.current + 1} / ${s.sections}`;
      const len = s.lengths[s.current] ?? 0;
      const pct = Math.floor((len / SECTION_LENGTH) * 100);
      const pctLabel = document.createElement('span');
      pctLabel.textContent = `巻いた長さ ${pct}%`;
      section.appendChild(label);
      section.appendChild(pctLabel);
      meter.update(s.tension, opts.range);
      pedal.setEnabled(s.phase === 'winding');
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
