import { createPedalControl, createTensionMeter } from '../../core/ui/pedalControl';
import { createButton } from '../../core/ui/widgets';
import { createSectionHeading } from '../../core/ui/layout';
import type { BeamingState, BeamingAction } from './logic';

/**
 * ビーム巻きの操作欄 (P3 T3-03a)。
 * 上から: 依頼書 (巻き幅・帯の数・柄の名前)、幅合わせの段階 (円盤を動かす4つのボタン+今と目標の幅)、
 * 巻き返しの段階 (張りのメーター・ペダル・寄せる2つ+巻いた割合と経過時間)、主な操作。
 * メッセージは GameFrame の message 欄を使う (controller が書く)。この部品はメッセージ欄を作らない。
 * メーターの範囲は State のもの (range {center, width} を min/max に直して渡す)。
 */

export interface BeamingPanel {
  update(s: BeamingState): void;
  destroy(): void;
}

export function createBeamingPanel(
  parent: HTMLElement,
  opts: {
    terms: { t(k: string): string };
    onAction: (a: BeamingAction) => void;
    /** 押せないボタンを押したときの理由を出す (message 欄に書くなど) */
    onNotice?: (text: string) => void;
    /** 依頼書の情報 (帯の数と柄の名前。巻き幅は State にある) */
    puzzle?: { bands: number; patternName: string };
  },
): BeamingPanel {
  const root = document.createElement('div');
  root.className = 'beaming-panel';

  // 1. 依頼書 (巻き幅・帯の数・柄の名前)
  const order = document.createElement('div');
  order.className = 'beaming-panel__order';
  root.appendChild(order);

  // 2. 幅合わせの段階: 円盤を動かす4つのボタン (1行に4つ) + 今と目標の幅
  const setupBlock = document.createElement('section');
  setupBlock.className = 'beaming-panel__block';
  setupBlock.setAttribute('aria-label', '幅合わせ');
  setupBlock.appendChild(createSectionHeading('幅合わせ'));
  const flanges = document.createElement('div');
  flanges.className = 'beaming-panel__flanges';
  setupBlock.appendChild(flanges);
  const mkFlangeBtn = (label: string, side: 'left' | 'right', deltaCm: number): HTMLButtonElement =>
    createButton({
      label,
      onClick: () => opts.onAction({ type: 'moveFlange', side, deltaCm }),
    });
  flanges.appendChild(mkFlangeBtn('◀ 左', 'left', -1));
  flanges.appendChild(mkFlangeBtn('左 ▶', 'left', 1));
  flanges.appendChild(mkFlangeBtn('◀ 右', 'right', -1));
  flanges.appendChild(mkFlangeBtn('右 ▶', 'right', 1));
  const widthText = document.createElement('div');
  widthText.className = 'beaming-panel__info';
  setupBlock.appendChild(widthText);
  root.appendChild(setupBlock);

  // 3. 巻き返しの段階: 張りのメーター・ペダル・寄せる2つ (1行に2つ) + 巻いた割合と時間
  const beamBlock = document.createElement('section');
  beamBlock.className = 'beaming-panel__block';
  beamBlock.setAttribute('aria-label', opts.terms.t('tension'));
  beamBlock.appendChild(createSectionHeading(opts.terms.t('tension')));
  const meterHost = document.createElement('div');
  meterHost.className = 'beaming-panel__meter';
  beamBlock.appendChild(meterHost);
  const meter = createTensionMeter(meterHost, { label: '' });
  const pedalHost = document.createElement('div');
  pedalHost.className = 'beaming-panel__pedal';
  beamBlock.appendChild(pedalHost);
  const pedal = createPedalControl(pedalHost, {
    label: '',
    onChange: (v) => opts.onAction({ type: 'setPedal', value: v }),
    onLocked: (reason) => opts.onNotice?.(reason),
  });
  const shift = document.createElement('div');
  shift.className = 'beaming-panel__shift';
  const mkNudgeBtn = (label: string, dir: -1 | 1): HTMLButtonElement =>
    createButton({ label, onClick: () => opts.onAction({ type: 'nudge', dir }) });
  shift.appendChild(mkNudgeBtn('◀ 寄せる', -1));
  shift.appendChild(mkNudgeBtn('寄せる ▶', 1));
  beamBlock.appendChild(shift);
  const progress = document.createElement('div');
  progress.className = 'beaming-panel__progress';
  beamBlock.appendChild(progress);
  root.appendChild(beamBlock);

  // 4. 一番下の主な操作 (幅合わせの段階は「巻き始める」。巻き返しの段階は無し)
  const buttonRow = document.createElement('div');
  buttonRow.className = 'beaming-panel__actions';
  const startBtn = createButton({
    label: '巻き始める',
    variant: 'primary',
    onClick: () => opts.onAction({ type: 'finishSetup' }),
  });
  startBtn.classList.add('beaming-panel__main');
  buttonRow.appendChild(startBtn);
  root.appendChild(buttonRow);

  parent.appendChild(root);

  /** 経過時間を「0:42」の形にする */
  function clockText(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  return {
    update(s: BeamingState): void {
      // 依頼書
      order.textContent = '';
      const bands = opts.puzzle?.bands;
      const patternName = opts.puzzle?.patternName;
      order.textContent =
        `巻き幅 ${s.widthCm}cm` +
        (bands !== undefined ? `・帯 ${bands}本` : '') +
        (patternName !== undefined ? `・${patternName}` : '');
      // 段階の切り替え (場所は空けたまま)
      const isSetup = s.phase === 'setup';
      setupBlock.style.display = isSetup ? '' : 'none';
      beamBlock.style.display = s.phase === 'beaming' ? '' : 'none';
      startBtn.style.display = isSetup ? '' : 'none';
      // 幅合わせ: 今の幅と目標の幅
      widthText.textContent = `今 ${Math.round(s.rightCm - s.leftCm)}cm/目標 ${s.widthCm}cm`;
      // 巻き返し: メーター・ペダル・割合と時間
      meter.update(s.tension, {
        min: s.range.center - s.range.width / 2,
        max: s.range.center + s.range.width / 2,
      });
      pedal.setEnabled(s.phase === 'beaming', '「巻き始める」を押すと使えます');
      pedal.setValue(s.pedal.pedal);
      progress.textContent = '';
      const pct = document.createElement('span');
      pct.textContent = `巻いた ${Math.round(s.progress * 100)}%`;
      const time = document.createElement('span');
      time.textContent = clockText(s.windMs);
      time.className = 'beaming-panel__clock';
      progress.appendChild(pct);
      progress.appendChild(time);
    },
    destroy(): void {
      pedal.destroy();
      meter.destroy();
      root.remove();
    },
  };
}
