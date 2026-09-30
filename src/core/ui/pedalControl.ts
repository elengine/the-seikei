/**
 * ペダル (足踏みの横木) と張りのメーターの部品 (P2 T2-03)。
 * ドラム巻きとビーミングの操作欄で使う。
 */

/** 0〜100 に丸める */
function clamp100(v: number): number {
  return Math.min(100, Math.max(0, v));
}

export interface PedalControl {
  root: HTMLElement;
  /** 外から値を変える (0〜100)。onChange は呼ばない */
  setValue(v: number): void;
  /** 糸切れ中などは押せない見た目にし、操作を受け付けない */
  setEnabled(on: boolean): void;
  destroy(): void;
}

export function createPedalControl(
  parent: HTMLElement,
  opts: { label: string; onChange: (v: number) => void },
): PedalControl {
  let value = 0;
  let enabled = true;
  let captured = false;

  const root = document.createElement('div');
  root.className = 'pedal-control';

  const label = document.createElement('span');
  label.className = 'pedal__label';
  label.textContent = opts.label;

  // 縦長の溝。一番上が 0 (止まる)、一番下が 100 (速い)
  const groove = document.createElement('div');
  groove.className = 'pedal__groove';
  // 横長の木の棒 (横木)。押し下げるほど速い
  const bar = document.createElement('div');
  bar.className = 'pedal__bar';
  groove.appendChild(bar);

  // 値の文字 (色だけに頼らない)
  const valueLabel = document.createElement('span');
  valueLabel.className = 'pedal__value';
  valueLabel.textContent = '速さ 0';

  // 「踏み込む」(+10)「戻す」(-10) のボタン
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'pedal__btn';
  plus.textContent = '踏み込む';
  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'pedal__btn';
  minus.textContent = '戻す';

  const row = document.createElement('div');
  row.className = 'pedal__row';
  row.appendChild(minus);
  row.appendChild(groove);
  row.appendChild(plus);

  root.appendChild(label);
  root.appendChild(row);
  root.appendChild(valueLabel);
  parent.appendChild(root);

  /** 溝の中の位置 (0〜100) を、横木の見た目に映す */
  function render(): void {
    // 一番上が 0、一番下が 100。溝の高さから横木の位置を決める
    bar.style.top = `${value}%`;
    valueLabel.textContent = `速さ ${Math.round(value)}`;
  }

  /** 溝の中の1点 (clientY) を値に直す */
  function valueFromEvent(e: PointerEvent): number {
    const rect = groove.getBoundingClientRect();
    if (rect.height <= 0) return value;
    const ratio = (e.clientY - rect.top) / rect.height;
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

  plus.addEventListener('click', () => {
    if (enabled) apply(value + 10);
  });
  minus.addEventListener('click', () => {
    if (enabled) apply(value - 10);
  });

  render();

  return {
    root,
    setValue(v: number): void {
      value = clamp100(v);
      render(); // onChange は呼ばない
    },
    setEnabled(on: boolean): void {
      enabled = on;
      root.classList.toggle('disabled', !on);
      plus.disabled = !on;
      minus.disabled = !on;
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

  root.appendChild(label);
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
