import { createButton, setLockedReason } from './widgets';

/**
 * ペダル (足踏みの横木) と張りのメーターの部品 (P2 T2-03)。
 * ドラム巻きとビーミングの操作欄で使う。
 */

/** 0〜100 に丸める */
/** 横木 (つまみ) の幅の目安。CSS の .pedal__bar の width と合わせる */
const BAR_W = 64;

function clamp100(v: number): number {
  return Math.min(100, Math.max(0, v));
}

export interface PedalControl {
  root: HTMLElement;
  /** 外から値を変える (0〜100)。onChange は呼ばない */
  setValue(v: number): void;
  /** 糸切れ中などは押せない見た目にし、操作を受け付けない。reason は「踏み込む」「戻す」を押したときに出す理由 */
  setEnabled(on: boolean, reason?: string): void;
  destroy(): void;
}

export function createPedalControl(
  parent: HTMLElement,
  opts: { label: string; onChange: (v: number) => void; onLocked?: (reason: string) => void },
): PedalControl {
  let value = 0;
  let enabled = true;
  let captured = false;

  const root = document.createElement('div');
  root.className = 'pedal-control';

  // 見出し (label が空なら出さない。操作欄の節の見出しが代わりになる)
  const label = document.createElement('span');
  label.className = 'pedal__label';
  label.textContent = opts.label;

  // 横長の溝 (高さ 64px、幅は操作欄いっぱい)。一番左が 0 (止まる)、一番右が 100 (速い)
  const groove = document.createElement('div');
  groove.className = 'pedal__groove';
  // 木のつまみ (横木)。右へ動かすほど速い
  const bar = document.createElement('div');
  bar.className = 'pedal__bar';
  groove.appendChild(bar);

  // 値の文字 (色だけに頼らない)
  const valueLabel = document.createElement('span');
  valueLabel.className = 'pedal__value';
  valueLabel.textContent = '速さ 0';

  // 「戻す」(-10) は溝の左、「踏み込む」(+10) は溝の右 (右が速い)
  const plus = createButton({
    label: '踏み込む',
    variant: 'secondary',
    onClick: () => apply(value + 10),
    onLocked: (r) => opts.onLocked?.(r),
  });
  plus.classList.add('pedal__btn');
  const minus = createButton({
    label: '戻す',
    variant: 'secondary',
    onClick: () => apply(value - 10),
    onLocked: (r) => opts.onLocked?.(r),
  });
  minus.classList.add('pedal__btn');

  const row = document.createElement('div');
  row.className = 'pedal__row';
  row.appendChild(minus);
  row.appendChild(groove);
  row.appendChild(plus);

  if (opts.label !== '') {
    root.appendChild(label);
  }
  root.appendChild(valueLabel); // 速さの表示は溝の右上 (溝の上の行の右寄せ)
  root.appendChild(row);
  parent.appendChild(root);

  /** 横木の幅 (測れない環境では 64px) */
  const barWidth = (): number => bar.clientWidth || BAR_W;

  /** 値 (0〜100) を、横木の見た目に映す */
  function render(): void {
    // 横木の左端 = (溝の幅 − 横木の幅) × 値 / 100 (はみ出さない)。left を溝の value%、横木自身の幅の value% だけ戻す
    bar.style.left = `${value}%`;
    bar.style.transform = `translateX(-${value}%)`;
    valueLabel.textContent = `速さ ${Math.round(value)}`;
  }

  /** 溝の中の1点 (clientX) を値に直す。横木の中心が指の位置に来る */
  function valueFromEvent(e: PointerEvent): number {
    const rect = groove.getBoundingClientRect();
    const w = barWidth();
    const usable = rect.width - w; // 横木の幅ぶんを除く
    if (usable <= 0) return value;
    const half = w / 2;
    const ratio = (e.clientX - rect.left - half) / usable;
    return clamp100(ratio * 100);
  }

  function apply(v: number): void {
    value = clamp100(v);
    render();
    opts.onChange(value);
  }

  function onDown(e: PointerEvent): void {
    if (!enabled) return;
    captured = true;
    groove.setPointerCapture(e.pointerId);
    apply(valueFromEvent(e));
  }

  function onMove(e: PointerEvent): void {
    if (!enabled || !captured) return;
    apply(valueFromEvent(e));
  }

  function onUp(): void {
    captured = false; // 指を離しても位置は保つ
  }

  groove.addEventListener('pointerdown', onDown);
  groove.addEventListener('pointermove', onMove);
  groove.addEventListener('pointerup', onUp);
  groove.addEventListener('pointercancel', onUp);

  render();

  return {
    root,
    setValue(v: number): void {
      value = clamp100(v);
      render(); // onChange は呼ばない
    },
    setEnabled(on: boolean, reason = '今は使えません'): void {
      enabled = on;
      root.classList.toggle('disabled', !on);
      // 押せないときは disabled にせず、点線の枠にして、押すと理由を出す
      setLockedReason(plus, on ? null : reason);
      setLockedReason(minus, on ? null : reason);
      if (!on) captured = false;
    },
    destroy(): void {
      groove.removeEventListener('pointerdown', onDown);
      groove.removeEventListener('pointermove', onMove);
      groove.removeEventListener('pointerup', onUp);
      groove.removeEventListener('pointercancel', onUp);
      captured = false;
      root.remove();
    },
  };
}

export interface TensionMeter {
  root: HTMLElement;
  update(tension: number, range: { min: number; max: number }): void;
  destroy(): void;
}

/** 張りのメーター。0〜100 の目盛りの帯に適正範囲と針を出す */
export function createTensionMeter(parent: HTMLElement, opts: { label: string }): TensionMeter {
  const root = document.createElement('div');
  root.className = 'tension-meter';

  const label = document.createElement('span');
  label.className = 'meter__label';
  label.textContent = opts.label;

  const band = document.createElement('div');
  band.className = 'meter__band';
  const zone = document.createElement('div');
  zone.className = 'meter__zone';
  band.appendChild(zone);
  const needle = document.createElement('div');
  needle.className = 'meter__needle';
  band.appendChild(needle);

  const state = document.createElement('span');
  state.className = 'meter__state';

  if (opts.label !== '') {
    root.appendChild(label); // 空なら出さない (操作欄の節の見出しが代わりになる)
  }
  root.appendChild(band);
  root.appendChild(state);
  parent.appendChild(root);

  return {
    root,
    update(tension: number, range: { min: number; max: number }): void {
      // 適正範囲を帯の上に塗る (0〜100 の位置)
      const left = clamp100(range.min);
      const right = clamp100(range.max);
      zone.style.left = `${left}%`;
      zone.style.width = `${Math.max(0, right - left)}%`;
      // 針は今の張りの位置
      needle.style.left = `${clamp100(tension)}%`;
      // 文字で状態を出す (色だけに頼らない。記号も付ける)
      if (tension > range.max) {
        state.textContent = '▲ 強すぎ';
      } else if (tension < range.min) {
        state.textContent = '▼ 弱い';
      } else {
        state.textContent = '○ 適正';
      }
    },
    destroy(): void {
      root.remove();
    },
  };
}
