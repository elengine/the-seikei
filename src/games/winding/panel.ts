import { createPedalControl, createTensionMeter } from '../../core/ui/pedalControl';
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

/** ペダルが押せないときの理由 (フェーズごと)。'ready' は押せる (ペダルを動かすと巻き始まる。T2-18a) */
function pedalReason(phase: WindingState['phase']): string {
  switch (phase) {
    case 'broken':
      return '糸をつなぐと使えます';
    case 'cutting':
      return 'ハサミで糸を切ると使えます';
    default:
      return '今は使えません';
  }
}

/** 時計の文字の大きさ (px)。40px での文字の幅 widthAt40 をもとに、「0:00/0:00 超過」が
 * 内側の幅 innerW の 85% 以下に収まる大きさを求める (40px を上限・20px 未満にしない)。
 * 測れないとき (widthAt40 が 0 など) は上限の 40px (T2-16 その7) */
export function clockFontSize(innerW: number, widthAt40: number): number {
  if (!(innerW > 0) || !(widthAt40 > 0)) return 40;
  const fit = Math.floor((innerW * 0.85) * (40 / widthAt40));
  return Math.max(20, Math.min(40, fit));
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

  // 4. 一番下の主な操作は無し (T2-18a: 「巻き始める」のボタンは廃止。ペダルを動かすと巻き始まり、
  //    'cutting' はハサミが盤面に出る。T2-16c)

  parent.appendChild(root);

  /** 経過時間を「0:42」の形にする (T2-09a) */
  function clockText(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  function part(text: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  }

  function div(className: string): HTMLDivElement {
    const div = document.createElement('div');
    div.className = className;
    return div;
  }

  return {
    update(s: WindingState): void {
      section.textContent = '';
      const len = s.lengths[s.current] ?? 0;
      const pct = Math.floor((len / SECTION_LENGTH) * 100);
      section.appendChild(part(`帯 ${s.current + 1}/${s.sections}`));
      // 巻き量は操作欄の中でいちばん目立つ表示 (大きく太字。100% は藍の地に白の文字 + 「巻き終えました」)。T2-16 その7
      const amount = div(pct >= 100 ? 'winding-panel__amount winding-panel__amount--done' : 'winding-panel__amount');
      amount.textContent = pct >= 100 ? '巻き量 100% 巻き終えました' : `巻き量 ${pct}%`;
      // 巻き量の横長の帯 (0〜100%)
      const bar = div('winding-panel__amount-bar');
      const fill = div('winding-panel__amount-fill');
      fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      bar.appendChild(fill);
      amount.appendChild(bar);
      section.appendChild(amount);
      const target = targetMsOf(s);
      const over = s.elapsedMs > target;
      // 制限時間は大きく見せる。目標を超えたら朱の文字にして「超過」を添える (色だけに頼らない)。
      // 表記は「0:49/0:33」とスラッシュの前後の隙間なし (T2-16 その6)
      const time = part(`${clockText(s.elapsedMs)}/${clockText(target)}${over ? ' 超過' : ''}`);
      time.className = over ? 'winding-panel__clock winding-panel__clock--over' : 'winding-panel__clock';
      section.appendChild(time);
      // 文字の大きさは、内側の幅の 85% 以下に「0:00/0:00 超過」が収まる大きさ (40px を上限・20px 未満にしない。T2-16 その7)。
      // 実際の文字の幅を 40px で毎回測る (フォントの読み込み後も正しくなる。jsdom では測れないので 0 → 上限)
      // 見た目の幅で測る (ゲーム枠は transform で拡大縮小されるため clientWidth だと実寸とずれる。T2-16 その7)
      const w = section.getBoundingClientRect().width;
      time.style.fontSize = '40px';
      const prevText = time.textContent;
      time.textContent = '0:00/0:00 超過'; // いちばん幅が広がる形で測る
      // 時計は flex で幅いっぱいに伸びるので、offsetWidth ではなく文字自体の幅を Range で測る (jsdom では測れないので 0 → 上限)
      const range = document.createRange();
      let textW = 0;
      if (typeof range.getBoundingClientRect === 'function') {
        range.selectNodeContents(time);
        textW = range.getBoundingClientRect().width;
      }
      let size = clockFontSize(w, textW);
      time.style.fontSize = `${size}px`;
      // 念のため、「0:00/0:00 超過」の形そのもので収まりを測り、内側の幅の 82% を超えていたら 1px ずつ縮める
      // (文字の大きさごとに描画の幅が比例しない + 枠の拡縮で幅が少し揺れるため、85% より狭い 82% を目標にして
      //  どんなときも 85% 以下・右に 15% 以上の余白を守る。T2-16 その7)
      if (typeof range.getBoundingClientRect === 'function') {
        time.textContent = '0:00/0:00 超過';
        range.selectNodeContents(time);
        let actual = range.getBoundingClientRect().width;
        let guard = 0;
        while (actual > w * 0.82 && size > 20 && guard < 21) {
          size -= 1;
          time.style.fontSize = `${size}px`;
          range.selectNodeContents(time);
          actual = range.getBoundingClientRect().width;
          guard += 1;
        }
      }
      time.textContent = prevText;
      meter.update(s.tension, s.range);
      // ペダルは 'ready' と 'winding' で押せる (ready で動かすと巻き始まる。T2-18a)
      pedal.setEnabled(s.phase === 'winding' || s.phase === 'ready', pedalReason(s.phase));
      // 横木の位置を状態に合わせる (setValue は onChange を呼ばないので、繰り返しにはならない)
      pedal.setValue(s.pedal.pedal);
    },
    destroy(): void {
      pedal.destroy();
      meter.destroy();
      root.remove();
    },
  };
}
