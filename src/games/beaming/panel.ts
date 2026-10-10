import { createButton } from '../../core/ui/widgets';
import { createSectionHeading } from '../../core/ui/layout';
import { createTensionMeter } from '../../core/ui/pedalControl';
import type { TensionMeter } from '../../core/ui/pedalControl';
import type { BeamingState, BeamingAction } from './logic';
import { okRangeOf, progressLabel } from './logic';
import { CONFIRM_MIN } from './params';

/**
 * ビーム巻きの操作欄 (P3 T3-03a)。
 * 上から: 「巻き量 N%」(1 か所だけ、大きく。PU-15c。円盤調整のあいだは出さず、代わりに目標・いまの幅・差を大きく。PU-27)、
 * 糸を付ける段階の案内、巻き返しの段階 (速さのメーター。T3-07)、依頼票 (柄の名前・巻き幅・帯の数。PU-27)、主な操作。
 * ペダルの「戻す」「踏み込む」・速さの数・経過時間は無い (速さは盤面の茶色の棒を左右に引っぱって変える。PU-24b。「速さ N」の表示は PU-27 で消した)。メッセージ欄は無い (理由は onNotice → お知らせ)。
 * メーターの範囲は State のもの (range {center, width} を min/max に直して渡す)。
 */

export interface BeamingPanel {
  update(s: BeamingState): void;
  /** 縦長のとき、見る情報 (巻き量・円盤調整の目標と今の幅・糸を付ける案内・速さのメーター) を盤面の上の帯へ移す。null で操作欄に戻す (PU-28) */
  placeTop(top: HTMLElement | null): void;
  destroy(): void;
}

/** 「目標値 60cm」「現在値 66cm」の 1 行 (生成りの地の小さな札に入る。数字だけ大きく。PU-29) */
function createSetupLine(label: string): { root: HTMLElement; num: HTMLElement } {
  const root = document.createElement('div');
  root.className = 'beaming-panel__setup-line beaming-panel__setup-plaque';
  const num = document.createElement('span');
  num.className = 'beaming-panel__setup-num';
  root.append(`${label} `, num, 'cm');
  return { root, num };
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
    /** 依頼票の柄の見本 (縦縞): 柄の 1 リピートの色と割合 (PU-28) */
    patternStripes?: Array<{ hex: string; frac: number }>;
  },
): BeamingPanel {
  const root = document.createElement('div');
  root.className = 'beaming-panel';

  // 0. 依頼票 (いちばん上。縦長では盤面の上の帯のいちばん上、横長では操作欄のいちばん上。PU-29)
  const ticket = document.createElement('div');
  ticket.className = 'order-ticket';
  const ticketTitle = document.createElement('div');
  ticketTitle.className = 'order-ticket__title';
  ticketTitle.textContent = '依頼票';
  const ticketMain = document.createElement('div');
  ticketMain.className = 'order-ticket__main';
  const swatch = document.createElement('span');
  swatch.className = 'order-ticket__swatch';
  for (const run of opts.patternStripes ?? []) {
    const stripe = document.createElement('span');
    stripe.style.backgroundColor = run.hex;
    stripe.style.flex = `${run.frac} 1 0`;
    swatch.appendChild(stripe);
  }
  const ticketName = document.createElement('span');
  ticketName.className = 'order-ticket__name';
  ticketName.textContent = opts.puzzle?.patternName ?? '';
  ticketMain.appendChild(swatch);
  ticketMain.appendChild(ticketName);
  const ticketDetail = document.createElement('div');
  ticketDetail.className = 'order-ticket__detail';
  const ticketWidth = document.createElement('span');
  ticketWidth.className = 'order-ticket__width';
  const ticketBands = document.createElement('span');
  ticketBands.className = 'order-ticket__bands';
  ticketBands.textContent = opts.puzzle !== undefined ? `帯 ${opts.puzzle.bands}本` : '';
  ticketDetail.appendChild(ticketWidth);
  ticketDetail.appendChild(ticketBands);
  ticket.appendChild(ticketTitle);
  if (opts.puzzle !== undefined) {
    ticket.appendChild(ticketMain);
  }
  ticket.appendChild(ticketDetail);
  root.appendChild(ticket);

  // 1. 巻き量 (操作欄の一番上に 1 か所だけ。大きな太字)
  const amount = document.createElement('div');
  amount.className = 'beaming-panel__amount';
  root.appendChild(amount);


  // 2. 円盤調整の段階 (setup): 「目標値」「現在値」を札に入れ、差の文をその下の行に (PU-29)。
  // 縦長 (盤面の上の帯) では横並び、横長 (操作欄) では縦並び (向きは base.css)。円盤は絵の上で引っぱって動かす (ボタンは無い。PU-15b)
  const setupBlock = document.createElement('section');
  setupBlock.className = 'beaming-panel__setup';
  setupBlock.setAttribute('aria-label', '円盤調整');
  const setupRow = document.createElement('div');
  setupRow.className = 'beaming-panel__setup-row';
  const targetLine = createSetupLine('目標値');
  const nowLine = createSetupLine('現在値');
  setupRow.appendChild(targetLine.root);
  setupRow.appendChild(nowLine.root);
  const diffLine = document.createElement('div');
  diffLine.className = 'beaming-panel__setup-line beaming-panel__setup-diff';
  setupBlock.appendChild(setupRow);
  setupBlock.appendChild(diffLine);
  root.appendChild(setupBlock);

  // 2a. 糸を付ける段階: 案内の1行 (T3-06)
  const attachBlock = document.createElement('section');
  attachBlock.className = 'beaming-panel__block';
  attachBlock.setAttribute('aria-label', '糸を付ける');
  const attachText = document.createElement('div');
  attachText.className = 'beaming-panel__info beaming-panel__attach-guide'; // 案内は大きく (28px 以上。PU-30 2)
  attachText.textContent = 'ドラムの糸を、ビームまで引っぱってください';
  attachBlock.appendChild(attachText);
  root.appendChild(attachBlock);

  // 3. 巻く段階: 速さのメーター (ドラム巻きと同じ部品。範囲は巻き量で動く。T3-07 で張りから速さに変えた)
  const beamBlock = document.createElement('section');
  beamBlock.className = 'beaming-panel__block';
  beamBlock.setAttribute('aria-label', opts.terms.t('speed'));
  beamBlock.appendChild(createSectionHeading(opts.terms.t('speed')));
  const meterHost = document.createElement('div');
  meterHost.className = 'beaming-panel__meter';
  const meter: TensionMeter = createTensionMeter(meterHost, { label: '', showState: false }); // 状態の文は出さない (盤面のランプで示す)
  beamBlock.appendChild(meter.root);
  root.appendChild(beamBlock);

  // 3a. 依頼票はいちばん上に移動した (PU-29)

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
        opts.onNotice?.('木の棒を左端まで戻して止めてから、完了を押します');
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
  /** 縦長で盤面の上の帯へ移す部品 (依頼票をいちばん上に。PU-29) */
  const topParts: HTMLElement[] = [ticket, amount, setupBlock, attachBlock, beamBlock];

  return {
    placeTop(top: HTMLElement | null): void {
      // 依頼票・巻き量・円盤調整・糸を付ける案内・速さのメーターの並びのまま、上の帯と操作欄のあいだを移す (PU-29)
      for (const el of topParts) {
        if (top !== null) {
          top.appendChild(el);
        } else if (el.parentElement !== root) {
          root.insertBefore(el, buttonRow);
        }
      }
    },
    update(s: BeamingState): void {
      // 依頼票: 巻き幅は State から (柄の名前と帯の数は作るときに決まっている)
      ticketWidth.textContent = `巻き幅 ${s.widthCm}cm`;
      // 段階の切り替え (場所は空けたまま)
      const isSetup = s.phase === 'setup';
      setupBlock.style.display = isSetup ? '' : 'none';
      amount.style.display = isSetup ? 'none' : ''; // 円盤調整のあいだ巻き量は 0 なので出さない
      attachBlock.style.display = s.phase === 'attach' ? '' : 'none';
      beamBlock.style.display = s.phase === 'beaming' ? '' : 'none';
      startBtn.style.display = isSetup ? '' : 'none';
      // 確認: 巻き量 95% 以上で出す (T3-04c)。止めていないときは押せない形
      const canConfirm = s.phase === 'beaming' && s.progress >= CONFIRM_MIN;
      confirmStopped = canConfirm && s.speed === 0;
      confirmBtn.style.display = canConfirm ? '' : 'none';
      confirmBtn.setAttribute('aria-disabled', String(!confirmStopped));
      confirmBtn.classList.toggle('beaming-panel__main--locked', !confirmStopped);
      amount.textContent = `巻き量 ${progressLabel(s.progress)}%`; // 表示は切り捨て (T3-05)。95% 以上は小数第 1 位まで
      // 速さのメーター: 針は速さそのもの。範囲は巻き量と揺らぎで動く (T3-07)
      meter.update(s.speed, okRangeOf(s.progress, s.level, s.dip));
      // 巻き返しの段階の下の行は空 (ボタンが無いので行を低くする)
      buttonRow.style.minHeight = isSetup ? '' : '0';
      // 円盤調整: 目標と今の幅、差を言葉と記号で (ぴったりだけ藍の印)
      const nowCm = Math.round(s.rightCm - s.leftCm);
      targetLine.num.textContent = String(s.widthCm);
      nowLine.num.textContent = String(nowCm);
      const gap = s.widthCm - nowCm;
      diffLine.textContent = gap === 0 ? 'ぴったり ○' : gap > 0 ? `あと ${gap}cm 広く ◀ ▶` : `あと ${-gap}cm 狭く ◀▶`;
      diffLine.classList.toggle('beaming-panel__setup-line--ok', gap === 0);
    },
    destroy(): void {
      root.remove();
    },
  };
}
