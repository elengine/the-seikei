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

  it('速さの3段階のボタン (停止・50%・100%) がある。「戻す」「踏み込む」・経過時間は無い (T3-04a。レバーは T3-04b)', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(beaming());
    const labels = Array.from(host.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toContain('停止');
    expect(labels).toContain('50%');
    expect(labels).toContain('100%');
    expect(host.querySelector('.pedal__btn')).toBeNull();
    expect(host.querySelector('.pedal__groove')).toBeNull();
    expect(host.querySelector('.beaming-panel__clock')).toBeNull();
    expect(host.textContent).not.toContain('踏み込む');
    expect(host.textContent).not.toContain('戻す');
    expect(host.textContent).not.toMatch(/\d+:\d{2}/);
    p.destroy();
  });

  it('巻き返しの段階では速さのボタンは押せない。押すと setSpeed が送られる', () => {
    const actions: unknown[] = [];
    const p = createBeamingPanel(host, { terms, onAction: (a) => actions.push(a) });
    p.update(make()); // setup
    for (const b of Array.from(host.querySelectorAll('.beaming-panel__speed button')) as HTMLButtonElement[]) {
      expect(b.disabled, `setup で押せない (${b.textContent})`).toBe(true);
    }
    p.update(beaming()); // beaming
    for (const b of Array.from(host.querySelectorAll('.beaming-panel__speed button')) as HTMLButtonElement[]) {
      expect(b.disabled, `beaming で押せる (${b.textContent})`).toBe(false);
    }
    const b50 = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === '50%') as HTMLButtonElement;
    b50.click();
    expect(actions[actions.length - 1]).toEqual({ type: 'setSpeed', speed: 50 });
    p.destroy();
  });

  it('巻き量は 32px 以上の太字 (base.css)', () => {
    const css = readFileSync('src/styles/base.css', 'utf8');
    const m = css.match(/\n\.beaming-panel__amount\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(m.match(/font-size: (\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(32);
    expect(m).toContain('font-weight: bold');
  });

});
