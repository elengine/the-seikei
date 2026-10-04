import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBeamingPanel } from './panel';
import { init, reduce } from './logic';
import type { BeamingState, BeamingAction } from './logic';

/**
 * ビーム巻きの操作欄のテスト (P3 T3-03a)。
 * 幅合わせの段階: 円盤を動かす4つのボタンが1行 (4列の格子)・今と目標の幅。
 * 巻き返しの段階: 張りのメーター・ペダル・寄せる2つ (1行)・巻いた割合と時間。
 */

const terms = { t: (k: string) => k, render: (x: string) => x };

function make(): BeamingState {
  return init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' });
}

/** 目標どおりに合わせた巻き返しの状態 */
function beaming(): BeamingState {
  let s = make();
  s = reduce(s, { type: 'moveFlange', side: 'left', deltaCm: -30 - s.leftCm });
  s = reduce(s, { type: 'moveFlange', side: 'right', deltaCm: 30 - s.rightCm });
  return reduce(s, { type: 'finishSetup' });
}

describe('beaming panel T3-03a (操作欄)', () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.textContent = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('1. 幅合わせの段階: 円盤を動かすボタン (◀▶) は無い (絵の上で引っぱる。PU-15b)。今の幅と目標の幅の数字が出る', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(make());
    expect(host.querySelector('.beaming-panel__flange-row')).toBeNull();
    expect(host.querySelector('.beaming-panel__flanges')).toBeNull();
    const labels = Array.from(host.querySelectorAll('button')).map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(labels.some((l) => /円盤を(左|右)へ/.test(String(l)))).toBe(false);
    expect(host.textContent).not.toContain('◀ 左');
    expect(host.textContent).toMatch(/今 \d+cm\/目標 60cm/);
    p.destroy();
  });

  it('3. 巻き返しの段階: メーターとペダルと寄せる2つ (1行に2つ)。幅合わせのボタンは隠れる', () => {
    // 2列の格子は base.css のビーム巻きの節で決める
    const css = readFileSync('src/styles/base.css', 'utf8');
    const grid2 = /\.beaming-panel__shift\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/;
    expect(grid2.test(css), 'shift').toBe(true);
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(beaming());
    const shift = host.querySelector('.beaming-panel__shift');
    expect(shift).toBeDefined();
    expect(shift!.querySelectorAll('button').length).toBe(2);
    expect(host.querySelector('.beaming-panel__pedal')).toBeDefined();
    // 幅合わせの入れ物 (block) ごと隠れる
    const setupBlock = host.querySelector('.beaming-panel__info')!.closest('.beaming-panel__block') as HTMLElement;
    expect(setupBlock.style.display).toBe('none');
    p.destroy();
  });

  it('4. 寄せるボタンで nudge が送られる (◀ 寄せる は -1 方向)', () => {
    const actions: BeamingAction[] = [];
    const p = createBeamingPanel(host, { terms, onAction: (a) => actions.push(a) });
    p.update(beaming());
    const btn = (text: string): HTMLButtonElement | undefined =>
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent === text);
    btn('◀ 寄せる')!.click();
    btn('寄せる ▶')!.click();
    expect(actions).toEqual([
      { type: 'nudge', dir: -1 },
      { type: 'nudge', dir: 1 },
    ]);
    p.destroy();
  });

  it('5. 「巻き始める」は幅合わせの段階だけ出る (押すと finishSetup)。巻き返しの段階では主な操作は無し', () => {
    const actions: BeamingAction[] = [];
    const p = createBeamingPanel(host, { terms, onAction: (a) => actions.push(a) });
    p.update(make());
    const start = (): HTMLButtonElement | undefined =>
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent === '巻き始める');
    expect(start()).toBeDefined();
    start()!.click();
    expect(actions).toEqual([{ type: 'finishSetup' }]);
    p.update(beaming());
    expect(start()!.style.display).toBe('none'); // 巻き返しの段階では主な操作は無し (隠れる)
    p.destroy();
  });

  it('6. 依頼書は詰めた形で1行 (柄の名前・巻き幅・帯の数)。「巻き量」は操作欄の一番上に 1 か所だけ', () => {
    const p = createBeamingPanel(host, {
      terms,
      onAction: () => undefined,
      puzzle: { bands: 3, patternName: '無地紺' },
    });
    p.update(make());
    expect(host.querySelector('.beaming-panel__order')!.textContent).toBe('無地紺・巻き幅 60cm・帯 3本');
    p.update(beaming());
    const amounts = host.querySelectorAll('.beaming-panel__amount');
    expect(amounts).toHaveLength(1);
    expect(host.querySelector('.beaming-panel')!.firstElementChild).toBe(amounts[0]);
    expect(amounts[0]!.textContent).toBe('巻き量 0%');
    expect((host.textContent ?? '').match(/巻き量/g)).toHaveLength(1);
    expect(host.textContent).not.toContain('巻いた');
    p.destroy();
  });

  it('7. destroy で要素が消える', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(make());
    p.destroy();
    expect(host.querySelector('.beaming-panel')).toBeNull();
  });
});

describe('PU-15c: 操作欄の整理 (戻す・踏み込む・速さ・経過時間を無くす)', () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.textContent = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('速さのボタンは無い (盤面のレバーで変える。T3-04b)。「戻す」「踏み込む」・経過時間は無い', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(beaming());
    const labels = Array.from(host.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).not.toContain('停止');
    expect(labels).not.toContain('50%');
    expect(labels).not.toContain('100%');
    expect(host.querySelector('.pedal__btn')).toBeNull();
    expect(host.querySelector('.pedal__groove')).toBeNull();
    expect(host.querySelector('.beaming-panel__clock')).toBeNull();
    expect(host.textContent).not.toContain('踏み込む');
    expect(host.textContent).not.toContain('戻す');
    expect(host.textContent).not.toMatch(/\d+:\d{2}/);
    p.destroy();
  });

  it('巻き返しの段階でも「◀ 寄せる」「寄せる ▶」はある (レバーで速さを変えるので速さのボタンは無い。T3-04b)', () => {
    const actions: unknown[] = [];
    const p = createBeamingPanel(host, { terms, onAction: (a) => actions.push(a) });
    p.update(beaming());
    const shift = host.querySelector('.beaming-panel__shift') as HTMLElement;
    expect(shift).not.toBeNull();
    const btns = Array.from(shift.querySelectorAll('button')) as HTMLButtonElement[];
    expect(btns.map((b) => b.textContent)).toEqual(['◀ 寄せる', '寄せる ▶']);
    btns[1]!.click();
    expect(actions[actions.length - 1]).toEqual({ type: 'nudge', dir: 1 });
    p.destroy();
  });
  it('巻き量は 32px 以上の太字 (base.css)', () => {
    const css = readFileSync('src/styles/base.css', 'utf8');
    const m = css.match(/\n\.beaming-panel__amount\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(m.match(/font-size: (\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(32);
    expect(m).toContain('font-weight: bold');
  });

});

describe('T3-04b (巻き量の帯)', () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.textContent = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('1. 巻き量の下に横長の帯がある。適正な速さの区間ごとに塗り分け、区間の文字 (50%・100%・50%。狭い停止の区間は文字なし)', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(beaming());
    const band = host.querySelector('.beaming-panel__band');
    expect(band, '巻き量の帯').not.toBeNull();
    const zones = Array.from(band!.querySelectorAll('.beaming-panel__band-zone')) as HTMLElement[];
    expect(zones.length).toBe(4);
    const labels = zones.map((z) => z.textContent ?? '');
    expect(labels[0]).toContain('50%');
    expect(labels[1]).toContain('100%');
    expect(labels[2]).toContain('50%');
    expect(labels[3] ?? '').toBe(''); // 95〜100% は 5% しか無いので文字は出さない
    // 区間の位置と幅 (0〜30・25〜75・70〜99・95〜100)
    expect(zones[0]!.style.left).toBe('0%');
    expect(zones[0]!.style.width).toBe('30%');
    expect(zones[1]!.style.left).toBe('25%');
    expect(zones[1]!.style.width).toBe('50%');
    expect(zones[2]!.style.left).toBe('70%');
    expect(zones[2]!.style.width).toBe('29%');
    expect(zones[3]!.style.left).toBe('95%');
    expect(zones[3]!.style.width).toBe('5%');
    p.destroy();
  });

  it('2. 今の巻き量の位置に縦の印。95% と 100% に目印の線があり、100% の線は朱', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update({ ...beaming(), progress: 0.73 });
    const mark = host.querySelector('.beaming-panel__band-mark') as HTMLElement;
    expect(mark).not.toBeNull();
    expect(mark.style.left).toBe('73%');
    const marks = Array.from(host.querySelectorAll('.beaming-panel__band-line')) as HTMLElement[];
    expect(marks.length).toBe(2);
    expect(marks[0]!.style.left).toBe('95%');
    expect(marks[1]!.style.left).toBe('100%');
    expect(marks[1]!.style.background).toBe('var(--c-shu)'); // 朱 = COLORS.shu (base.css の変数)
    p.destroy();
  });
});

describe('T3-04c (確認のボタン)', () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.textContent = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it("1. 巻き量 95% 未満では「確認」のボタンは無い。速さの3つのボタンも無い (レバーに置き換わった)", () => {
    const actions: unknown[] = [];
    const p = createBeamingPanel(host, { terms, onAction: (a) => actions.push(a) });
    p.update(beaming());
    // 見えているボタンだけ (確認は 95% 以上で出る。隠れているボタンは数えない)
    const labels = Array.from(host.querySelectorAll('button'))
      .filter((b) => (b as HTMLElement).style.display !== 'none')
      .map((b) => b.textContent?.trim());
    expect(labels).not.toContain('確認');
    expect(labels).not.toContain('停止');
    expect(labels).not.toContain('50%');
    expect(labels).not.toContain('100%');
    p.destroy();
  });

  it("2. 巻き量 95% 以上で止めていれば「確認」が押せる (confirm を送る)", () => {
    const actions: unknown[] = [];
    const p = createBeamingPanel(host, { terms, onAction: (a) => actions.push(a) });
    p.update({ ...beaming(), progress: 0.96, speed: 0 });
    const btn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === '確認');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('aria-disabled')).toBe('false');
    btn!.click();
    expect(actions).toContainEqual({ type: 'confirm' });
    p.destroy();
  });

  it("3. 95% 以上でも止めていないときは押せない形 (aria-disabled)。押すと理由のお知らせ", () => {
    const actions: unknown[] = [];
    const notices: string[] = [];
    const p = createBeamingPanel(host, { terms, onAction: (a) => actions.push(a), onNotice: (t) => notices.push(t) });
    p.update({ ...beaming(), progress: 0.96, speed: 50 });
    const btn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === '確認');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('aria-disabled')).toBe('true');
    btn!.click();
    expect(actions).not.toContainEqual({ type: 'confirm' });
    expect(notices).toContain('レバーを停止にしてから確認します');
    p.destroy();
  });
});
