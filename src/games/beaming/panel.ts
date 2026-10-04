import { createButton } from '../../core/ui/widgets';
import { createSectionHeading } from '../../core/ui/layout';
import type { BeamingState, BeamingAction, BeamingSpeed } from './logic';

/**
 * ビーム巻きの操作欄 (P3 T3-03a)。
 * 上から: 「巻き量 N%」(1 か所だけ、大きく。PU-15c)、依頼書 (巻き幅・帯の数・柄の名前)、
 * 幅合わせの段階 (今と目標の幅。円盤は絵の上で引っぱる)、巻き返しの段階 (張りのメーター・ペダルの溝・寄せる2つ)、主な操作。
 * ペダルの「戻す」「踏み込む」・速さの数・経過時間は無い (T3-04 で速さのレバーに置き換える)。メッセージ欄は無い (理由は onNotice → お知らせ)。
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
    /** 押せないペダルの溝を押したときの理由を出す (お知らせに出すなど) */
    onNotice?: (text: string) => void;
    /** 依頼書の情報 (帯の数と柄の名前。巻き幅は State にある) */
    puzzle?: { bands: number; patternName: string };
  },
): BeamingPanel {
  const root = document.createElement('div');
  root.className = 'beaming-panel';

  // 0. 巻き量 (操作欄の一番上に 1 か所だけ。大きな太字)
  const amount = document.createElement('div');
  amount.className = 'beaming-panel__amount';
  root.appendChild(amount);

  // 1. 依頼書 (巻き幅・帯の数・柄の名前)
  const order = document.createElement('div');
  order.className = 'beaming-panel__order';
  root.appendChild(order);

  // 2. 幅合わせの段階: 円盤は絵の上で引っぱって動かす (ボタンは無い。PU-15b)。ここには今の幅と目標の幅だけ
  const setupBlock = document.createElement('section');
  setupBlock.className = 'beaming-panel__block';
  setupBlock.setAttribute('aria-label', '幅合わせ');
  setupBlock.appendChild(createSectionHeading('幅合わせ'));
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
  // 速さの3段階 (停止・50%・100%)。T3-04b で盤面のレバーに置き換えるまでの仮のボタン (T3-04a)
  const speedHost = document.createElement('div');
  speedHost.className = 'beaming-panel__speed';
  beamBlock.appendChild(speedHost);
  const speedBtns: Record<BeamingSpeed, HTMLButtonElement> = {
    0: createButton({ label: '停止', onClick: () => opts.onAction({ type: 'setSpeed', speed: 0 }) }),
    50: createButton({ label: '50%', onClick: () => opts.onAction({ type: 'setSpeed', speed: 50 }) }),
    100: createButton({ label: '100%', onClick: () => opts.onAction({ type: 'setSpeed', speed: 100 }) }),
  };
  for (const k of [0, 50, 100] as const) {
    speedBtns[k].classList.add('beaming-panel__speed-btn');
    speedHost.appendChild(speedBtns[k]);
  }
  const shift = document.createElement('div');
  shift.className = 'beaming-panel__shift';
  const mkNudgeBtn = (label: string, dir: -1 | 1): HTMLButtonElement =>
    createButton({ label, onClick: () => opts.onAction({ type: 'nudge', dir }) });
  shift.appendChild(mkNudgeBtn('◀ 寄せる', -1));
  shift.appendChild(mkNudgeBtn('寄せる ▶', 1));
  beamBlock.appendChild(shift);
  root.appendChild(beamBlock);

  // 4. 一番下の主な操作 (巻き返しの段階は主な操作が無いので、行を詰める)
  const buttonRow = document.createElement('div');
  buttonRow.className = 'beaming-panel__actions';
  const startBtn = createButton({
    label: '巻き始める',
    variant: 'primary',
    onClick: () => opts.onAction({ type: 'finishSetup' }),
  });
  startBtn.classList.add('beaming-panel__main');
  buttonRow.appendChild(startBtn);
  // 確認 (仮。T3-04c で巻き量 95% 以上で出す形にする)
  const confirmBtn = createButton({
    label: '確認',
    variant: 'primary',
    onClick: () => opts.onAction({ type: 'confirm' }),
  });
  confirmBtn.classList.add('beaming-panel__main');
  buttonRow.appendChild(confirmBtn);
  root.appendChild(buttonRow);

  parent.appendChild(root);

  return {
    update(s: BeamingState): void {
      // 依頼書 (詰めた形で1行: 柄の名前・巻き幅・帯の数。T3-03 追加修正)
      order.textContent = '';
      const bands = opts.puzzle?.bands;
      const patternName = opts.puzzle?.patternName;
      order.textContent =
        (patternName !== undefined ? `${patternName}・` : '') +
        `巻き幅 ${s.widthCm}cm` +
        (bands !== undefined ? `・帯 ${bands}本` : '');
      // 段階の切り替え (場所は空けたまま)
      const isSetup = s.phase === 'setup';
      setupBlock.style.display = isSetup ? '' : 'none';
      beamBlock.style.display = s.phase === 'beaming' ? '' : 'none';
      startBtn.style.display = isSetup ? '' : 'none';
      confirmBtn.style.display = isSetup ? 'none' : '';
      amount.textContent = `巻き量 ${Math.round(s.progress * 100)}%`;
      // 巻き返しの段階の下の行は空 (ボタンが無いので行を低くする)
      buttonRow.style.minHeight = isSetup ? '' : '0';
      // 幅合わせ: 今の幅と目標の幅
      widthText.textContent = `今 ${Math.round(s.rightCm - s.leftCm)}cm/目標 ${s.widthCm}cm`;
      // 速さ: 今のレバーの位置を太字と aria-pressed で示す。巻き返しの段階では押せない
      const enabled = s.phase === 'beaming';
      for (const k of [0, 50, 100] as const) {
        speedBtns[k].disabled = !enabled;
        speedBtns[k].setAttribute('aria-pressed', String(s.speed === k));
      }
    },
    destroy(): void {
      root.remove();
    },
  };
}
