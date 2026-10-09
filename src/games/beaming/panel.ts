import { createButton } from '../../core/ui/widgets';
import { createSectionHeading } from '../../core/ui/layout';
import { createTensionMeter } from '../../core/ui/pedalControl';
import type { TensionMeter } from '../../core/ui/pedalControl';
import type { BeamingState, BeamingAction } from './logic';
import { okRangeOf } from './logic';
import { CONFIRM_MIN } from './params';

/**
 * ビーム巻きの操作欄 (P3 T3-03a)。
 * 上から: 「巻き量 N%」(1 か所だけ、大きく。PU-15c)、依頼書 (巻き幅・帯の数・柄の名前)、
 * 幅合わせの段階 (今と目標の幅。円盤は絵の上で引っぱる)、巻き返しの段階 (速さのメーター・ペダルの溝・寄せる2つ)、主な操作。
 * ペダルの「戻す」「踏み込む」・速さの数・経過時間は無い (速さは盤面の茶色の棒を左右に引っぱって変える。PU-24b。「速さ N」の表示は PU-27 で消した)。メッセージ欄は無い (理由は onNotice → お知らせ)。
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

  // 2a. 糸を付ける段階: 案内の1行 (T3-06)
  const attachBlock = document.createElement('section');
  attachBlock.className = 'beaming-panel__block';
  attachBlock.setAttribute('aria-label', '糸を付ける');
  const attachText = document.createElement('div');
  attachText.className = 'beaming-panel__info';
  attachText.textContent = 'ドラムの糸を、ビームまで引っぱってください';
  attachBlock.appendChild(attachText);
  root.appendChild(attachBlock);

  // 3. 巻く段階: 張りのメーター (ドラム巻きと同じ部品。範囲は巻き量で動く。T3-06)
  const beamBlock = document.createElement('section');
  beamBlock.className = 'beaming-panel__block';
  beamBlock.setAttribute('aria-label', opts.terms.t('tension'));
  beamBlock.appendChild(createSectionHeading(opts.terms.t('tension')));
  const meterHost = document.createElement('div');
  meterHost.className = 'beaming-panel__meter';
  const meter: TensionMeter = createTensionMeter(meterHost, { label: '', showState: false }); // 状態の文は出さない (盤面のランプで示す)
  beamBlock.appendChild(meter.root);
  root.appendChild(beamBlock);

  // 4. 一番下の主な操作 (巻き返しの段階は主な操作が無いので、行を詰める)
  const buttonRow = document.createElement('div');
  buttonRow.className = 'beaming-panel__actions';
  const startBtn = createButton({
    label: '円盤調整完了',
    variant: 'primary',
    onClick: () => opts.onAction({ type: 'finishSetup' }),
  });
  startBtn.classList.add('beaming-panel__main');
  buttonRow.appendChild(startBtn);
  // 確認 (巻き量 95% 以上で出す。止めていないときは押せない形で理由をお知らせする。T3-04c)
  const confirmBtn = createButton({
    label: '完了',
    variant: 'primary',
    onClick: () => {
      if (!confirmStopped) {
        opts.onNotice?.('棒を左端まで戻して止めてから、完了を押します');
        return;
      }
      opts.onAction({ type: 'confirm' });
    },
  });
  confirmBtn.classList.add('beaming-panel__main');
  buttonRow.appendChild(confirmBtn);
  /** 確認を押してよい (95% 以上で止まっている)。update のたびに変わる */
  let confirmStopped = false;
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
      attachBlock.style.display = s.phase === 'attach' ? '' : 'none';
      beamBlock.style.display = s.phase === 'beaming' ? '' : 'none';
      startBtn.style.display = isSetup ? '' : 'none';
      // 確認: 巻き量 95% 以上で出す (T3-04c)。止めていないときは押せない形
      const canConfirm = s.phase === 'beaming' && s.progress >= CONFIRM_MIN;
      confirmStopped = canConfirm && s.speed === 0;
      confirmBtn.style.display = canConfirm ? '' : 'none';
      confirmBtn.setAttribute('aria-disabled', String(!confirmStopped));
      confirmBtn.classList.toggle('beaming-panel__main--locked', !confirmStopped);
      amount.textContent = `巻き量 ${Math.floor(s.progress * 100)}%`; // 表示は切り捨て (T3-05)
      // 張りのメーター: 範囲は巻き量と揺らぎで動く (T3-06)
      meter.update(s.tension, okRangeOf(s.progress, s.level, s.dip));
      // 巻き返しの段階の下の行は空 (ボタンが無いので行を低くする)
      buttonRow.style.minHeight = isSetup ? '' : '0';
      // 幅合わせ: 今の幅と目標の幅
      widthText.textContent = `今 ${Math.round(s.rightCm - s.leftCm)}cm/目標 ${s.widthCm}cm`;
    },
    destroy(): void {
      root.remove();
    },
  };
}
