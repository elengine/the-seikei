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

  it('1. 幅合わせの段階: 円盤を動かすボタンが1行に4つ (4列の格子)。今の幅と目標の幅の数字が出る', () => {
    // 4列の格子は base.css のビーム巻きの節で決める (jsdom は格子を計算できない)
    const css = readFileSync('src/styles/base.css', 'utf8');
    const grid4 = /\.beaming-panel__flanges\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/;
    expect(grid4.test(css), 'flanges').toBe(true);
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(make());
    const row = host.querySelector('.beaming-panel__flanges');
    expect(row).toBeDefined();
    expect(row!.querySelectorAll('button').length).toBe(4);
    expect(host.textContent).toContain('今');
    expect(host.textContent).toContain('目標');
    p.destroy();
  });

  it('2. 幅合わせのボタンで moveFlange が送られる (◀ 左 は左の円盤を -1cm)', () => {
    const actions: BeamingAction[] = [];
    const p = createBeamingPanel(host, { terms, onAction: (a) => actions.push(a) });
    p.update(make());
    const btn = (text: string): HTMLButtonElement | undefined =>
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent === text);
    btn('◀ 左')!.click();
    btn('左 ▶')!.click();
    btn('◀ 右')!.click();
    btn('右 ▶')!.click();
    expect(actions).toEqual([
      { type: 'moveFlange', side: 'left', deltaCm: -1 },
      { type: 'moveFlange', side: 'left', deltaCm: 1 },
      { type: 'moveFlange', side: 'right', deltaCm: -1 },
      { type: 'moveFlange', side: 'right', deltaCm: 1 },
    ]);
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
    const setupBlock = host.querySelector('.beaming-panel__flanges')!.closest('.beaming-panel__block') as HTMLElement;
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

  it('6. 依頼書に巻き幅・帯の数・柄の名前。巻き返しの段階では巻いた割合と経過時間の1行', () => {
    const p = createBeamingPanel(host, {
      terms,
      onAction: () => undefined,
      puzzle: { bands: 3, patternName: '無地紺' },
    });
    p.update(make());
    expect(host.textContent).toContain('巻き幅 60cm');
    expect(host.textContent).toContain('帯 3本');
    expect(host.textContent).toContain('無地紺');
    p.update(beaming());
    // 巻いた割合と時間 (「巻いた 0%」と 0:00 の形の時計)
    expect(host.textContent).toContain('巻いた');
    expect(host.textContent).toMatch(/\d+:\d{2}/);
    p.destroy();
  });

  it('7. destroy で要素が消える', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(make());
    p.destroy();
    expect(host.querySelector('.beaming-panel')).toBeNull();
  });
});
