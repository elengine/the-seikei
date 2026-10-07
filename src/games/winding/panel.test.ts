import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWindingPanel, clockFontSize } from './panel';
import type { WindingAction } from './logic';
import { init, reduce } from './logic';
import { SECTION_LENGTH } from './params';

/** jsdom に無い setPointerCapture を足す */
if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture(): void {};
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {};
}

const terms = { t: (k: string) => (k === 'pedal' ? 'ペダル' : k === 'tension' ? '張り' : k) };

describe('winding panel (T2-06)', () => {
  let onAction: ReturnType<typeof vi.fn<(a: WindingAction) => void>>;
  let panel: ReturnType<typeof createWindingPanel>;

  beforeEach(() => {
    document.body.innerHTML = '';
    onAction = vi.fn();
    panel = createWindingPanel(document.body, { terms, onAction });
  });

  afterEach(() => {
    panel.destroy();
  });

  it("1. 'ready' で「巻き始める」のボタンは無く、ペダルは押せる (ペダルを動かすと巻き始まる。T2-18a)", () => {
    const s = init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 });
    panel.update(s);
    const btn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === '巻き始める');
    expect(btn, '巻き始めるのボタンは廃止').toBeUndefined();
    const root = document.body.querySelector('.pedal-control')!;
    expect(root.className).not.toContain('disabled');
  });

  it("2. 'cutting' では「帯の端を結ぶ」のボタンは無い (ハサミは盤面に出る。T2-16c)", () => {
    const s = { ...init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 }), phase: 'cutting' as const };
    panel.update(s);
    const btn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === '帯の端を結ぶ');
    expect(btn, '帯の端を結ぶのボタンは廃止').toBeUndefined();
  });

  it("3. 'broken'・'cutting' では、ペダルが押せない ('ready' と 'winding' は押せる。T2-18a)", () => {
    const s = init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 });
    panel.update({ ...s, phase: 'broken' });
    const root = document.body.querySelector('.pedal-control')!;
    expect(root.className).toContain('disabled');
    panel.update({ ...s, phase: 'cutting' });
    expect(root.className).toContain('disabled');
    // 'ready' は押せる (ペダルを動かすと巻き始まる。T2-18a)
    panel.update(s);
    expect(root.className).not.toContain('disabled');
    // 'winding' なら押せる
    panel.update(reduce(s, { type: 'setPedal', value: 30 }));
    expect(root.className).not.toContain('disabled');
  });

  it('4. 「帯 2/5」の文字が current と sections に従う', () => {
    const s = init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 });
    // current 1 (2本目) の 'cutting' 状態を作る
    let cur = reduce(s, { type: 'setPedal', value: 50 });
    for (let i = 0; i < 300 && cur.phase === 'winding'; i++) {
      cur = reduce(cur, { type: 'tick', dtMs: 100 });
    }
    cur = reduce(cur, { type: 'cut' });
    panel.update(cur);
    const label = document.body.querySelector('.winding-panel__section')!;
    expect(label.textContent).toContain('帯 2/5');
  });

  it('5. ペダルの溝を動かすと setPedal が渡る (「踏み込む」ボタンは PU-14a で無くなった)', () => {
    const s = init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 });
    const w = reduce(s, { type: 'setPedal', value: 50 });
    panel.update(w);
    onAction.mockClear();
    const groove = document.body.querySelector<HTMLElement>('.pedal__groove')!;
    Object.defineProperty(groove, 'getBoundingClientRect', { configurable: true, value: () => ({ left: 0, top: 0, width: 364, height: 64, right: 364, bottom: 64, x: 0, y: 0 }) });
    groove.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 32 + 150, clientY: 30 }));
    expect(onAction).toHaveBeenLastCalledWith({ type: 'setPedal', value: 50 });
  });

  it('6. destroy で DOM から消える', () => {
    panel.destroy();
    expect(document.body.querySelector('.winding-panel')).toBeNull();
  });
});

describe('winding panel T2-05-fix (横木が状態に合わせて戻る)', () => {
  it('ペダル 60 の状態で update したあと、ペダル 0 の状態で update すると、横木の位置が 0 に戻る', () => {
    document.body.innerHTML = '';
    const onAction2 = vi.fn();
    const panel2 = createWindingPanel(document.body, { terms, onAction: onAction2 });
    let s = init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 });
    s = reduce(s, { type: 'setPedal', value: 60 });
    panel2.update(s);
    const bar = document.body.querySelector<HTMLElement>('.pedal__bar')!;
    expect(parseFloat(bar.style.left)).toBe(60);
    // ペダルが 0 の状態 (糸切れ・巻き終え・裏に回ったあと) で update
    const zero = reduce(s, { type: 'pausePedal' });
    panel2.update(zero);
    expect(parseFloat(bar.style.left)).toBe(0);
    panel2.destroy();
  });
});

describe('PU-05c: ドラム巻きの操作欄の並び', () => {
  function mountPanel(onNotice?: (t: string) => void): { panel: ReturnType<typeof createWindingPanel>; host: HTMLElement } {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = createWindingPanel(host, { terms, onAction: () => undefined, onNotice });
    return { panel: p, host };
  }

  it('節の見出しは「張り」「ペダル」(用語の呼び名)。「巻き始める」の主な操作は無く (T2-18a)、ボタンは 1 つも無い', () => {
    const { panel: p, host } = mountPanel();
    p.update(init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 }));
    expect(Array.from(host.querySelectorAll('.section-heading')).map((h) => h.textContent)).toEqual(['張り', 'ペダル']);
    expect(host.querySelector('.winding-panel__actions'), '主な操作の行は廃止').toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(0); // ペダルの溝はボタンでない
    p.destroy();
  });

  it('帯の番号・巻いた長さ・経過時間が1行 (同じ要素) に入っている', () => {
    const { panel: p, host } = mountPanel();
    p.update(init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 }));
    const line = host.querySelector('.winding-panel__section')!;
    expect(line.textContent).toContain('帯 1/5');
    expect(line.textContent).toContain('巻き量');
    expect(line.textContent).not.toContain('巻いた長さ');
    expect(line.textContent).toMatch(/\d:\d\d\/\d:\d\d/); // 「0:49/0:33」と隙間なし (T2-16 その6)
    expect(host.querySelector('.winding-panel__time')).toBeNull();
    p.destroy();
  });

});

describe('PU-09d: ドラム巻きの操作欄 (横向きのペダルと詰めた形)', () => {
  function mount(): { host: HTMLElement; p: ReturnType<typeof createWindingPanel> } {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = createWindingPanel(host, { terms, onAction: () => undefined });
    p.update(init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 }));
    return { host, p };
  }

  it('操作欄の並び: 1行の情報 → 張りのメーター → 横向きのペダル (主な操作の行は T2-18a で無くなった)', () => {
    const { host, p } = mount();
    const kids = Array.from(host.querySelector('.winding-panel')!.children).map((c) => c.className.split(' ')[0]);
    expect(kids).toEqual(['winding-panel__section', 'winding-panel__block', 'winding-panel__block']);
    expect(host.querySelector('.winding-panel__block .tension-meter')).not.toBeNull();
    p.destroy();
  });

  it('ペダルは横向きの溝だけ (「戻す」「踏み込む」は PU-14a で無くなった)。溝は横木が左右に動く', () => {
    const { host, p } = mount();
    const row = host.querySelector('.winding-panel__pedal .pedal__row')!;
    const kids = Array.from(row.children) as HTMLElement[];
    expect(kids).toHaveLength(1);
    expect(kids[0]!.classList.contains('pedal__groove')).toBe(true);
    p.destroy();
  });

  it('節 (張り・ペダル) に aria-label (見出しを詰めた形で隠しても、読み上げで分かる)', () => {
    const { host, p } = mount();
    const blocks = Array.from(host.querySelectorAll('.winding-panel__block'));
    expect(blocks.map((b) => b.getAttribute('aria-label'))).toEqual(['張り', 'ペダル']);
    p.destroy();
  });

  it('base.css: メーターは横いっぱいの 1 行 (帯 + 状態の文字)。詰めた形では節の見出しを隠して高さを使わない', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const meter = css.match(/\.tension-meter\s*\{([^}]*)\}/)![1]!;
    expect(meter).toContain('flex-direction: row');
    const band = css.match(/\.meter__band\s*\{([^}]*)\}/)![1]!;
    expect(band).toContain('flex: 1');
    expect(band).not.toContain('width: 320px');
    const head = css.match(/\.game-frame--compact \.winding-panel__block \.section-heading\s*\{([^}]*)\}/);
    expect(head![1]).toContain('display: none');
  });
});

describe('PU-14a: ドラム巻きの操作欄 (戻す・踏み込む・速さ・状態の文を無くす。巻き量。制限時間を目立たせる)', () => {
  function mount(): { host: HTMLElement; p: ReturnType<typeof createWindingPanel> } {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = createWindingPanel(host, { terms, onAction: () => undefined });
    return { host, p };
  }

  it('「戻す」「踏み込む」のボタン・速さの表示・張りの状態の文が無い。ペダルは溝だけ', () => {
    const { host, p } = mount();
    p.update(init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 }));
    expect(host.querySelector('.pedal__btn')).toBeNull();
    expect(host.querySelector('.pedal__value')).toBeNull();
    expect(host.querySelector('.meter__state')).toBeNull();
    expect(host.textContent).not.toContain('踏み込む');
    expect(host.textContent).not.toContain('戻す');
    expect(host.textContent).not.toContain('速さ');
    expect(host.querySelector('.pedal__groove')).not.toBeNull();
    p.destroy();
  });

  it('「巻き量 N%」(巻いた長さ ではない)', () => {
    const { host, p } = mount();
    p.update(init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 }));
    expect(host.querySelector('.winding-panel__section')!.textContent).toMatch(/巻き量 \d+%/);
    p.destroy();
  });

  it('巻き量 100% は「巻き量 100%」のままで形とメッセージを変えず、文字の色だけ青 (藍) のクラスに変わり、音は鳴らない (T2-18b)。100% 未満では出ない', () => {
    const { host, p } = mount();
    const base = init({ level: 1, patternId: 'p-pin-kon', sections: 3, seed: 1 });
    p.update({ ...base, lengths: [SECTION_LENGTH * 0.5, 0, 0] });
    let amount = host.querySelector('.winding-panel__amount')!;
    expect(amount.className).not.toContain('winding-panel__amount--full');
    p.update({ ...base, lengths: [SECTION_LENGTH, 0, 0] });
    amount = host.querySelector('.winding-panel__amount')!;
    expect(amount.className).toContain('winding-panel__amount--full');
    expect(amount.textContent).toContain('巻き量 100%');
    expect(amount.textContent).not.toContain('巻き終えました');
    p.destroy();
  });

  it('base.css: 巻き量は 32px 以上の太字。0〜99% は黒の文字、100% (--full) は藍 (T2-18b)。「巻き終えました」の地の色の変更は無い', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const amount = css.match(/\n\.winding-panel__amount\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(amount.match(/font-size: (\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(32);
    expect(amount).toContain('font-weight: bold');
    expect(amount).toContain('color: var(--c-sumi)');
    const full = css.match(/\n\.winding-panel__amount--full\s*\{([^}]*)\}/)![1]!;
    expect(full).toContain('color: var(--c-ai)');
    expect(css).not.toContain('winding-panel__amount--done');
  });

  it('制限時間の表記は「0:49/0:33」とスラッシュの前後の隙間なし (見切れないように。T2-16 その6)。目標以内は超過の印なし。超えたら --over と「超過」', () => {
    const { host, p } = mount();
    const base = init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 });
    p.update({ ...base, elapsedMs: 1000 });
    let clock = host.querySelector('.winding-panel__clock')!;
    expect(clock.classList.contains('winding-panel__clock--over')).toBe(false);
    expect(clock.textContent).not.toContain('超過');
    expect(clock.textContent!.trim()).toMatch(/^\d+:\d\d\/\d+:\d\d$/);
    p.update({ ...base, elapsedMs: 99 * 60 * 1000 });
    clock = host.querySelector('.winding-panel__clock')!;
    expect(clock.classList.contains('winding-panel__clock--over')).toBe(true);
    expect(clock.textContent).toContain('超過');
    p.destroy();
  });

  it('時計の文字の大きさは、内側の幅の 85% 以下に「0:00/0:00 超過」が収まる大きさ (40px を上限・20px 未満にしない。T2-16 その7)。jsdom では測れないので上限の 40px', () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = createWindingPanel(host, { terms, onAction: () => undefined, onNotice: () => undefined });
    const base = init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 280 });
    p.update({ ...base, elapsedMs: 1000 });
    const clock = host.querySelector('.winding-panel__clock') as HTMLElement;
    expect(clock.style.fontSize).toBe('40px'); // 測れないときは上限
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 0 });
    p.destroy();
  });

  it('clockFontSize: 内側の幅の 85% に「0:00/0:00 超過」が収まる大きさ (40px を上限・20px 未満にしない)。測れないときは 40', () => {
    // 40px で 320px の文字のとき: 幅 280 → 280×0.85×40/320 = 29.75 → 29px (収まる)
    expect(clockFontSize(280, 320)).toBe(29);
    // 幅 140 → 14.9 → 20px (下限)
    expect(clockFontSize(140, 320)).toBe(20);
    // 幅が十分 → 40px (上限)
    expect(clockFontSize(1200, 320)).toBe(40);
    // 測れない (0) ときは上限の 40px
    expect(clockFontSize(280, 0)).toBe(40);
    expect(clockFontSize(0, 320)).toBe(40);
  });

  it('押せない状態 (broken) で溝を押すと、理由が onNotice に出る (戻す・踏み込むの代わり)', () => {
    document.body.innerHTML = '';
    const notice = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = createWindingPanel(host, { terms, onAction: () => undefined, onNotice: notice });
    const s = { ...init({ level: 1, patternId: 'p-pin-kon', sections: 5, seed: 1 }), phase: 'broken' as const };
    p.update(s);
    const groove = host.querySelector<HTMLElement>('.pedal__groove')!;
    groove.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
    expect(String(notice.mock.calls[0]![0])).toContain('糸をつなぐと使えます');
    p.destroy();
  });

  it('base.css: 制限時間は太字で nowrap。超過は朱 (shu)。大きさは JS が操作欄の幅に合わせて入れる (T2-16 その6)', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const clock = css.match(/\n\.winding-panel__clock\s*\{([^}]*)\}/)![1]!;
    expect(clock).not.toContain('font-size'); // 大きさは JS が幅に合わせて設定する
    expect(clock).toContain('font-weight: bold');
    expect(clock).toContain('white-space: nowrap');
    expect(css.match(/\n\.winding-panel__clock--over\s*\{([^}]*)\}/)![1]).toContain('color: var(--c-shu)');
  });

  it('base.css: 詰めた形では、操作欄の区画の間隔を 8px に詰める (段階5・915×412 でスクロールを 0 にするため)', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const m = css.match(/\n\.game-frame--compact \.winding-panel\s*\{([^}]*)\}/)![1]!;
    expect(m).toContain('gap: var(--sp-2)');
    const base = css.match(/\n\.winding-panel\s*\{([^}]*)\}/)![1]!;
    expect(base).toContain('gap: var(--sp-3)'); // 縦長のメイン画面 (700×880) の段階5 でも収まる
    const act0 = css.match(/\n\.winding-panel__actions\s*\{([^}]*)\}/)![1]!;
    expect(act0).toContain('padding-top: var(--sp-1)'); // 縦長のメイン画面 (700×880) の段階5 でスクロールを 0 に
    const act = css.match(/\n\.game-frame--compact \.winding-panel__actions\s*\{([^}]*)\}/)![1]!;
    expect(act).toContain('padding-top: var(--sp-1)');
    expect(act).toContain('padding-bottom: var(--sp-1)');
  });
});
