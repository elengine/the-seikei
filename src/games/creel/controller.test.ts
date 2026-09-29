import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCreelModule } from './index';
import type { GameDeps } from '../../core/game/types';
import { getContent } from '../../core/content/content';
import { cellRect, toPx } from './geometry';
import { fitStage } from '../../core/viewport/viewport';
import { init } from './logic';

const content = getContent();

/** jsdom の getBoundingClientRect は 0x0 なので、canvas の rect を差し込む */
function stubClientSize(el: Element, w: number, h: number): void {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: w });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: h });
}

/** jsdom の getBoundingClientRect は 0x0 なので、canvas の rect を差し込む */
function stubRect(el: Element, w: number, h: number): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ x: 0, y: 0, left: 0, top: 0, right: w, bottom: h, width: w, height: h }),
  });
}

/** 偽の GameDeps */
function makeDeps(over: Partial<GameDeps> = {}): GameDeps {
  return {
    terms: {
      t: (k: string) => (k === 'game.creel' ? 'クリール立て' : k),
      render: (text: string) => text.replace(/\{\{cone\}\}/g, 'コーン').replace(/\{\{spindle\}\}/g, '軸'),
    } as unknown as GameDeps['terms'],
    audio: { play: vi.fn(), unlock: () => undefined } as unknown as GameDeps['audio'],
    records: {
      get: () => ({ bestStars: 0, plays: 0, best: {} }),
    } as unknown as GameDeps['records'],
    clock: { now: () => '2026-09-28T12:00:00.000Z' } as unknown as GameDeps['clock'],
    log: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  document.body.textContent = '';
  // gameFrame は parent の内寸を見る。jsdom では 0 になるので 1180×820 を差し込む
  stubRect(document.body, 1180, 820);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createCreelModule', () => {
  it('お題一覧: 記録が無いと s1 だけ押せる。records に s1 の星があると s2 まで押せる', () => {
    const deps = makeDeps();
    const module = createCreelModule(deps);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const instance = module.mount(parent, {
      mode: 'standalone',
      onFinish: () => undefined,
      onExit: () => undefined,
    });
    // s1 のボタンは押せる。s2 は「未解放」で disabled (期待値変更の理由: 管理者の指示で文言を変えたため)
    const s1 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]');
    const s2 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s2"]');
    expect(s1).not.toBeNull();
    expect(s1?.disabled).toBe(false);
    expect(s2?.disabled).toBe(true);
    expect(s2?.textContent).toContain('未解放');
    // s1 の星の記録があると s2 が押せる
    const deps2 = makeDeps({
      records: {
        get: (gameId: string) =>
          gameId === 'creel' ? { bestStars: 3, plays: 1, best: { 'puzzle:s1': 3 } } : { bestStars: 0, plays: 0, best: {} },
      } as unknown as GameDeps['records'],
    });
    const module2 = createCreelModule(deps2);
    const parent2 = document.createElement('div');
    document.body.appendChild(parent2);
    module2.mount(parent2, { mode: 'standalone', onFinish: () => undefined, onExit: () => undefined });
    const s2b = parent2.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s2"]');
    expect(s2b?.disabled).toBe(false);
    instance.unmount();
  });

  it('プレイ: s1 で全部の軸をタップして立て、確認するを押すと、1.5秒後に onFinish が1回呼ばれる (stars 3・unlockedPatternIds は p-muji-kon) (テスト名のみ変更: 管理者の指示で文言を変えたため)', () => {
    const deps = makeDeps();
    const module = createCreelModule(deps);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onFinish = vi.fn();
    module.mount(parent, { mode: 'standalone', onFinish, onExit: () => undefined });
    // お題一覧から s1 を押す
    const s1 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]');
    s1!.click();
    // プレイ画面になる (盤面の canvas と操作欄)
    expect(parent.querySelector('canvas')).not.toBeNull();
    // 全部の軸をタップする (pointerdown を盤面に送る)
    const stage = parent.querySelector('canvas')!;
    const stageBox = stage.parentElement!;
    stubClientSize(stageBox, 600, 400);
    stubRect(stage, 600, 400);
    window.dispatchEvent(new Event('resize')); // gameFrame に再配置させて fit を更新させる
    vi.advanceTimersByTime(20); // requestAnimationFrame を進める
    const rect = stage.getBoundingClientRect();
    const s1Puzzle = content.creelPuzzles.find((p) => p.id === 's1')!;
    const fit = fitStage(1000, 750, rect.width, rect.height);
    for (let i = 0; i < s1Puzzle.cols; i++) {
      const cell = cellRect(i, s1Puzzle.rows, s1Puzzle.cols);
      const px = toPx(fit, { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 });
      stage.dispatchEvent(new PointerEvent('pointerdown', { clientX: rect.left + px.x, clientY: rect.top + px.y, bubbles: true }));
    }
    // 確認する
    const checkBtn = parent.querySelector<HTMLButtonElement>('[data-testid="creel-check"]');
    checkBtn!.click();
    expect(onFinish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1600);
    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0]![0] as { gameId: string; stars: number; unlockedPatternIds: string[] };
    expect(result.gameId).toBe('creel');
    expect(result.stars).toBe(3);
    expect(result.unlockedPatternIds).toEqual(['p-muji-kon']);
  });

  it('onStateChange が操作のたびに呼ばれる。suspend はプレイ中は状態、お題一覧では null', () => {
    const deps = makeDeps();
    const module = createCreelModule(deps);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onStateChange = vi.fn();
    const instance = module.mount(parent, {
      mode: 'standalone',
      onFinish: () => undefined,
      onExit: () => undefined,
      onStateChange,
    });
    // お題一覧では null
    expect(onStateChange).toHaveBeenCalledWith(null);
    onStateChange.mockClear();
    // s1 を押してプレイ画面へ
    const s1 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]');
    s1!.click();
    onStateChange.mockClear();
    // 箱の選択で onStateChange が呼ばれる
    const box = parent.querySelector<HTMLButtonElement>('[data-testid^="creel-box-"]');
    box!.click();
    expect(onStateChange).toHaveBeenCalledTimes(1);
    // suspend は状態 (CreelState) を返す
    const state = instance.suspend() as { puzzleId?: string } | null;
    expect(state).not.toBeNull();
    expect(state?.puzzleId).toBe('s1');
    instance.unmount();
  });

  it('resume が isValidResume を満たすとプレイ画面を開く (お題一覧を出さない)', () => {
    const deps = makeDeps();
    const module = createCreelModule(deps);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const s1State = init(content.creelPuzzles.find((p) => p.id === 's1')!, content);
    module.mount(parent, {
      mode: 'standalone',
      resume: s1State,
      onFinish: () => undefined,
      onExit: () => undefined,
    });
    // お題一覧のボタンはなく、盤面の canvas がすぐある
    expect(parent.querySelector('[data-testid="creel-puzzle-s1"]')).toBeNull();
    expect(parent.querySelector('canvas')).not.toBeNull();
  });

  it('unmount の後にタイマーが残っていない (1.5秒進めても onFinish が呼ばれない)', () => {
    const deps = makeDeps();
    const module = createCreelModule(deps);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onFinish = vi.fn();
    const instance = module.mount(parent, { mode: 'standalone', onFinish, onExit: () => undefined });
    const s1 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]');
    s1!.click();
    const stage = parent.querySelector('canvas')!;
    const stageBox = stage.parentElement!;
    stubClientSize(stageBox, 600, 400);
    stubRect(stage, 600, 400);
    window.dispatchEvent(new Event('resize')); // gameFrame に再配置させて fit を更新させる
    vi.advanceTimersByTime(20); // requestAnimationFrame を進める
    const rect = stage.getBoundingClientRect();
    const s1Puzzle = content.creelPuzzles.find((p) => p.id === 's1')!;
    const fit = fitStage(1000, 750, rect.width, rect.height);
    for (let i = 0; i < s1Puzzle.cols; i++) {
      const cell = cellRect(i, s1Puzzle.rows, s1Puzzle.cols);
      const px = toPx(fit, { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 });
      stage.dispatchEvent(new PointerEvent('pointerdown', { clientX: rect.left + px.x, clientY: rect.top + px.y, bubbles: true }));
    }
    const checkBtn = parent.querySelector<HTMLButtonElement>('[data-testid="creel-check"]');
    checkBtn!.click();
    instance.unmount(); // ここで片付く
    vi.advanceTimersByTime(3000);
    expect(onFinish).not.toHaveBeenCalled();
  });
});
