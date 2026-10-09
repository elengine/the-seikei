import { createButton } from '../../core/ui/widgets';
import { createSectionHeading } from '../../core/ui/layout';
import { goodSpeedOf } from './logic';
import type { BeamingState, BeamingAction } from './logic';
import { GOOD_SPEED_ZONES, CONFIRM_MIN } from './params';

/**
 * ビーム巻きの操作欄 (P3 T3-03a)。
 * 上から: 「巻き量 N%」(1 か所だけ、大きく。PU-15c)、依頼書 (巻き幅・帯の数・柄の名前)、
 * 幅合わせの段階 (今と目標の幅。円盤は絵の上で引っぱる)、巻き返しの段階 (速さのメーター・ペダルの溝・寄せる2つ)、主な操作。
 * ペダルの「戻す」「踏み込む」・速さの数・経過時間は無い (速さは盤面の茶色の棒を左右に引っぱって変える。PU-24b)。メッセージ欄は無い (理由は onNotice → お知らせ)。
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

  // 0a. 速さ (「巻き量」の下。0〜100 の整数。適正は藍、外れは朱に ▲ か ▼。PU-24b)
  const speedEl = document.createElement('div');
  speedEl.className = 'beaming-panel__speed';
  root.appendChild(speedEl);

  // 0b. 巻き量の帯 (0〜100% を適正な速さの区間で塗り分ける。T3-04b)
  const band = document.createElement('div');
  band.className = 'beaming-panel__band';
  band.setAttribute('aria-label', '巻き量ごとの適正な速さ');
  const zoneEls: HTMLElement[] = [];
  for (const z of GOOD_SPEED_ZONES) {
    const d = document.createElement('div');
    d.className = 'beaming-panel__band-zone';
    d.style.left = `${z.from}%`;
    d.style.width = `${z.to - z.from}%`;
    // 狭い区間 (8% 未満) は文字を出さない (はみ出るため。色だけで分かる)
    if (z.to - z.from >= 8) {
      d.textContent = z.speed === 0 ? '停止' : `${z.speed}%`;
    }
    band.appendChild(d);
    zoneEls.push(d);
  }
  // 95% と 100% の目印の線 (100% は朱: ここを超えると糸が切れる)
  for (const [pct, color] of [[95, 'var(--c-sumi-sub)'], [100, 'var(--c-shu)']] as const) {
    const line = document.createElement('div');
    line.className = 'beaming-panel__band-line';
    line.style.left = `${pct}%`;
    line.style.background = color;
    band.appendChild(line);
  }
  // 今の巻き量の縦の印
  const bandMark = document.createElement('div');
  bandMark.className = 'beaming-panel__band-mark';
  band.appendChild(bandMark);
  root.appendChild(band);

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

  // 3. 巻き返しの段階: 速さの見出しと巻いた割合と時間。速さは盤面で変え、寄せるボタンは無い (T3-05)
  const beamBlock = document.createElement('section');
  beamBlock.className = 'beaming-panel__block';
  beamBlock.setAttribute('aria-label', opts.terms.t('speed'));
  beamBlock.appendChild(createSectionHeading(opts.terms.t('speed')));
  const meterHost = document.createElement('div');
  meterHost.className = 'beaming-panel__meter';
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
  // 確認 (巻き量 95% 以上で出す。止めていないときは押せない形で理由をお知らせする。T3-04c)
  const confirmBtn = createButton({
    label: '確認',
    variant: 'primary',
    onClick: () => {
      if (!confirmStopped) {
        opts.onNotice?.('棒を左端まで戻して止めてから、確認を押します');
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
      beamBlock.style.display = s.phase === 'beaming' ? '' : 'none';
      startBtn.style.display = isSetup ? '' : 'none';
      // 確認: 巻き量 95% 以上で出す (T3-04c)。止めていないときは押せない形
      const canConfirm = s.phase === 'beaming' && s.progress >= CONFIRM_MIN;
      confirmStopped = canConfirm && s.speed === 0;
      confirmBtn.style.display = canConfirm ? '' : 'none';
      confirmBtn.setAttribute('aria-disabled', String(!confirmStopped));
      confirmBtn.classList.toggle('beaming-panel__main--locked', !confirmStopped);
      amount.textContent = `巻き量 ${Math.floor(s.progress * 100)}%`; // 表示は切り捨て (T3-05)
      // 速さ: 巻いているあいだだけ適正・外れを見せる (外れは ▲ 速すぎ・▼ 遅すぎ。色だけに頼らない)
      const speedNow = Math.round(s.speed);
      let mark = '';
      speedEl.classList.remove('beaming-panel__speed--good', 'beaming-panel__speed--bad');
      if (s.phase === 'beaming') {
        if (goodSpeedOf(s.speed, s.progress)) {
          speedEl.classList.add('beaming-panel__speed--good');
        } else {
          const targets = GOOD_SPEED_ZONES.filter((z) => s.progress * 100 >= z.from && s.progress * 100 <= z.to).map((z) => z.speed);
          const tooFast = targets.length > 0 ? s.speed > Math.max(...targets) : s.speed > 0;
          mark = tooFast ? ' ▲' : ' ▼';
          speedEl.classList.add('beaming-panel__speed--bad');
        }
      }
      speedEl.textContent = `速さ ${speedNow}${mark}`;
      bandMark.style.left = `${Math.min(100, Math.max(0, s.progress * 100))}%`;
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
