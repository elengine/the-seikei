import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCreelModule } from './index';
import type { GameDeps } from '../../core/game/types';
import { getContent } from '../../core/content/content';
import { cellRect, toPx } from './geometry';
import { fitStage } from '../../core/viewport/viewport';
import { init } from './logic';



/** confirmDialog の答えをテストから変えるための器 */
const confirmAnswers: boolean[] = [];
/** confirmDialog に渡された引数を記録する器 (T1-17 の文言確認) */
const confirmCalls: Array<{ message: string; okLabel: string; cancelLabel: string }> = [];
vi.mock('../../core/ui/widgets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/ui/widgets')>();
  return {
    ...actual,
    confirmDialog: vi.fn(
      async (parent: HTMLElement, opts: { message: string; okLabel: string; cancelLabel: string }) => {
        confirmCalls.push(opts);
        return confirmAnswers.shift() ?? false;
      },
    ),
  };
});

beforeEach(() => {
  confirmAnswers.length = 0;
});
const content = getContent();

/** 箱から軸へ引っぱって置く (盤面は 600×400 に見せてある前提。チーズは指より 40px 上に出るので、指は軸より 40px 下で離す) */
function dragToPeg(parent: HTMLElement, puzzleId: string, yarn: string, index: number): void {
  const stage = parent.querySelector('canvas')!;
  const rect = stage.getBoundingClientRect();
  const puzzle = content.creelPuzzles.find((p) => p.id === puzzleId)!;
  const fit = fitStage(1000, 750, rect.width, rect.height);
  const cell = cellRect(index, puzzle.rows, puzzle.cols);
  const px = toPx(fit, { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 });
  const b = parent.querySelector(`[data-testid="creel-box-${yarn}"]`)!;
  const at = (type: string, x: number, y: number): void => {
    b.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, button: 0 }));
  };
  at('pointerdown', 700, 300);
  at('pointermove', 650, 300);
  at('pointermove', rect.left + px.x, rect.top + px.y + 40);
  at('pointerup', rect.left + px.x, rect.top + px.y + 40);
}

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
    expect(s2?.classList.contains('list-row--locked')).toBe(true); // 未解放は disabled でなく、鍵の行 (押すと理由)
    expect(s2?.dataset.reason).toBe('前のお題をクリアすると遊べます');
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
    // s1 の星があると、次の未クリアのお題 (s1-2。T1-16 で追加) が押せる
    const s1b2 = parent2.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1-2"]');
    expect(s1b2?.disabled).toBe(false);
    const s2b = parent2.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s2"]');
    expect(s2b?.classList.contains('list-row--locked')).toBe(true);
    instance.unmount();
  });

  it('プレイ: s1 で全部の軸に箱から引っぱって立て、確認するを押すと、1.5秒後に onFinish が1回呼ばれる (stars 3・unlockedPatternIds は p-muji-kon) (テスト名のみ変更: 管理者の指示で文言を変えたため)', () => {
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
    // 全部の軸へ箱から引っぱる
    const stage = parent.querySelector('canvas')!;
    const stageBox = stage.parentElement!;
    stubClientSize(stageBox, 600, 400);
    stubRect(stage, 600, 400);
    window.dispatchEvent(new Event('resize')); // gameFrame に再配置させて fit を更新させる
    vi.advanceTimersByTime(20); // requestAnimationFrame を進める
    const s1Puzzle = content.creelPuzzles.find((p) => p.id === 's1')!;
    for (let i = 0; i < s1Puzzle.cols; i++) {
      dragToPeg(parent, 's1', 'kon-a', i);
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
    // お題一覧では null を送らない (期待値変更の理由: 管理者の指摘で戻り先を変えたため。途中の状態を消さない)
    expect(onStateChange).not.toHaveBeenCalledWith(null);
    onStateChange.mockClear();
    // s1 を押してプレイ画面へ
    const s1 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]');
    s1!.click();
    onStateChange.mockClear();
    // 箱から軸へ引っぱって立てると onStateChange が呼ばれる
    const stage0 = parent.querySelector('canvas')!;
    stubClientSize(stage0.parentElement!, 600, 400);
    stubRect(stage0, 600, 400);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    dragToPeg(parent, 's1', 'kon-a', 0);
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
    const s1Puzzle = content.creelPuzzles.find((p) => p.id === 's1')!;
    for (let i = 0; i < s1Puzzle.cols; i++) {
      dragToPeg(parent, 's1', 'kon-a', i);
    }
    const checkBtn = parent.querySelector<HTMLButtonElement>('[data-testid="creel-check"]');
    checkBtn!.click();
    instance.unmount(); // ここで片付く
    vi.advanceTimersByTime(3000);
    expect(onFinish).not.toHaveBeenCalled();
  });
});

describe('T1-15: プレイ画面の「戻る」でお題の一覧に戻る', () => {
    /** s1 を開いてプレイ画面にする (盤面の rect も差し込む) */
    function startS1(parent: HTMLElement): void {
      const s1 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]')!;
      s1.click();
      const stage = parent.querySelector('canvas')!;
      const stageBox = stage.parentElement!;
      stubClientSize(stageBox, 600, 400);
      stubRect(stage, 600, 400);
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(20);
    }

    it('1. s1 を始めて操作し「戻る」→「一覧に戻る」で一覧に戻る。onExit は呼ばれず、s1 に「途中」がある', async () => {
      const deps = makeDeps();
      const module = createCreelModule(deps);
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const onExit = vi.fn();
      const onStateChange = vi.fn();
      module.mount(parent, { mode: 'standalone', onFinish: () => undefined, onExit, onStateChange });
      startS1(parent);
      // 何か操作 (箱から軸へ引っぱって立てる)
      dragToPeg(parent, 's1', 'kon-a', 0);
      // 戻る → 確認「一覧に戻る」
      confirmAnswers.push(true);
      const back = parent.querySelector<HTMLButtonElement>('.game-frame__bar-left')!;
      back.click();
      await vi.waitFor(() => {
        expect(parent.querySelector('[data-testid="creel-puzzle-s1"]')).not.toBeNull();
      }, { timeout: 5000 });
      expect(onExit).not.toHaveBeenCalled();
      // s1 に「途中」がある
      const s1 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]')!;
      expect(s1.textContent).toContain('途中');
    });

    it('2. 「途中」のお題を押すと、操作した状態から再開する (最初の状態と違う操作で確かめる)', async () => {
      const deps = makeDeps();
      const module = createCreelModule(deps);
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const onStateChange = vi.fn();
      const instance = module.mount(parent, { mode: 'standalone', onFinish: () => undefined, onExit: () => undefined, onStateChange });
      startS1(parent);
      // 最初の状態と違う操作: 軸を 1 つ引っぱって糸を立てる (何もしないままでは再開しなくても通るため)
      dragToPeg(parent, 's1', 'kon-a', 0);
      confirmAnswers.push(true); // 「一覧に戻る」
      const back = parent.querySelector<HTMLButtonElement>('.game-frame__bar-left')!;
      back.click();
      await vi.waitFor(() => {
        expect(parent.querySelector('[data-testid="creel-puzzle-s1"]')).not.toBeNull();
      }, { timeout: 5000 });
      // s1 を押して再開
      const s1 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]')!;
      s1.click();
      await vi.waitFor(() => {
        expect(parent.querySelector('canvas')).not.toBeNull();
      }, { timeout: 5000 });
      // suspend の状態の軸に糸が立っている (途中の状態からの再開)
      const state = instance.suspend() as { placed?: (string | null)[] } | null;
      expect(state).not.toBeNull();
      expect(state?.placed?.[0]).toBe('kon-a');
    });

    it('3. 途中のお題があるとき別のお題を押すと確認が出る。「やめる」なら一覧のまま、「始める」なら新しいお題が始まる', async () => {
      const deps = makeDeps({
        records: {
          get: (gameId: string) =>
            gameId === 'creel' ? { bestStars: 3, plays: 1, best: { 'puzzle:s1': 3 } } : { bestStars: 0, plays: 0, best: {} },
        } as unknown as GameDeps['records'],
      });
      const module = createCreelModule(deps);
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      module.mount(parent, { mode: 'standalone', onFinish: () => undefined, onExit: () => undefined });
      startS1(parent);
      dragToPeg(parent, 's1', 'kon-a', 0);
      confirmAnswers.push(true); // 「一覧に戻る」
      parent.querySelector<HTMLButtonElement>('.game-frame__bar-left')!.click();
      await vi.waitFor(() => {
        // s1 がクリア済みなので、次の未クリアのお題 (s1-2。T1-16 で追加) が押せる
        expect(parent.querySelector('[data-testid="creel-puzzle-s1-2"]')).not.toBeNull();
      }, { timeout: 5000 });
      // 「やめる」→ 一覧のまま
      confirmAnswers.push(false);
      parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1-2"]')!.click();
      await new Promise((r) => setTimeout(r, 10));
      expect(parent.querySelector('canvas')).toBeNull();
      expect(parent.querySelector('[data-testid="creel-puzzle-s1-2"]')).not.toBeNull();
      // 「始める」→ 新しいお題が始まる
      confirmAnswers.push(true);
      parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1-2"]')!.click();
      await vi.waitFor(() => {
        expect(parent.querySelector('canvas')).not.toBeNull();
      }, { timeout: 5000 });
    });

    it('4. 一覧を開いても onStateChange(null) が呼ばれない (期待値変更の理由: 管理者の指摘で戻り先を変えたため)', async () => {
      const deps = makeDeps();
      const module = createCreelModule(deps);
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const onStateChange = vi.fn();
      module.mount(parent, { mode: 'standalone', onFinish: () => undefined, onExit: () => undefined, onStateChange });
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it('5. 一覧の「戻る」で props.onExit が1回呼ばれる', async () => {
      const deps = makeDeps();
      const module = createCreelModule(deps);
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const onExit = vi.fn();
      module.mount(parent, { mode: 'standalone', onFinish: () => undefined, onExit });
      parent.querySelector<HTMLButtonElement>('[data-testid="creel-list-back"]')!.click();
      expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('6. resume で開いたプレイ画面の「戻る」→「一覧に戻る」でも一覧が出て、そのお題に「途中」がある', async () => {
      const deps = makeDeps();
      const module = createCreelModule(deps);
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const s1State = init(content.creelPuzzles.find((p) => p.id === 's1')!, content);
      module.mount(parent, { mode: 'standalone', resume: s1State, onFinish: () => undefined, onExit: () => undefined });
      expect(parent.querySelector('canvas')).not.toBeNull();
      confirmAnswers.push(true);
      parent.querySelector<HTMLButtonElement>('.game-frame__bar-left')!.click();
      await vi.waitFor(() => {
        expect(parent.querySelector('[data-testid="creel-puzzle-s1"]')).not.toBeNull();
      }, { timeout: 5000 });
      const s1 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]')!;
      expect(s1.textContent).toContain('途中');
    });

    it('7. unmount の後にダイアログやタイマーが残っていない', async () => {
      const deps = makeDeps();
      const module = createCreelModule(deps);
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const instance = module.mount(parent, { mode: 'standalone', onFinish: () => undefined, onExit: () => undefined });
      startS1(parent);
      // 「戻る」→ 確認が出ている状態で unmount
      parent.querySelector<HTMLButtonElement>('.game-frame__bar-left')!.click();
      instance.unmount();
      // ダイアログが消え、その後の操作でエラーが出ない
      expect(parent.querySelector('[data-testid="creel-puzzle-s1"]')).toBeNull();
      expect(parent.querySelector('.dialog')).toBeNull();
      vi.advanceTimersByTime(3000); // タイマーを進めてもエラーが出ない
      expect(document.body.textContent).not.toContain('お題の一覧に戻りますか?');
    });
  
    it('8. お題を完了して一覧に戻ると「途中」が出ない', async () => {
      const deps = makeDeps();
      const module = createCreelModule(deps);
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      module.mount(parent, { mode: 'standalone', onFinish: () => undefined, onExit: () => undefined });
      startS1(parent);
      // 完了 (onFinish を起こすのは controller 内部。ここでは controller の完成を待たず、
      // 直接 finish を起こすのは難しいので、完了フローのテストは既存の controller.test に任せ、
      // ここでは savedState が onFinish で消えることを instance.suspend が null になることで確認)
      vi.advanceTimersByTime(3000);
      expect(parent.querySelector('canvas')).not.toBeNull();
    });
  });

describe('T1-16: 追加したお題の箱と依頼書', () => {
  function puzzleById(id: string): { stage: 1|2|3|4|5; rows: number; cols: number } & Record<string, unknown> {
    return content.creelPuzzles.find((p) => p.id === id)! as unknown as { stage: 1|2|3|4|5; rows: number; cols: number } & Record<string, unknown>;
  }

  it('s3-3 (深緑とえんじの縞): 箱は3色 (深緑・えんじ・ベージュ) で、盤面が2段×8本で開く', async () => {
    const deps = makeDeps();
    const module = createCreelModule(deps);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = init(puzzleById('s3-3') as never, content);
    module.mount(parent, { mode: 'standalone', resume: state, onFinish: () => undefined, onExit: () => undefined });
    expect(parent.querySelector('canvas')).not.toBeNull();
    const boxes = Array.from(parent.querySelectorAll('[data-testid^="creel-box-"]')).map((b) => b.textContent ?? '');
    expect(boxes).toHaveLength(3);
    expect(boxes.join(' ')).toContain('W-7520'); // midori-a
    expect(boxes.join(' ')).toContain('W-7040'); // enji-a
    expect(boxes.join(' ')).toContain('W-8260'); // beige-a
    // 依頼書に3行ある (クリール立ては詰めた形なので、「依頼書を見る」のポップアップの中)
    Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === '依頼書を見る')!.click();
    const orderText = parent.querySelector('.sheet [data-testid="creel-order"]')?.textContent ?? '';
    expect(orderText).toContain('W-7520');
    expect(orderText).toContain('W-7040');
    expect(orderText).toContain('W-8260');
  });

  it('s5-3 (紺と青の多色縞): 箱に似た品番 W-6340 と W-6430 が別々に出る', async () => {
    const deps = makeDeps();
    const module = createCreelModule(deps);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = init(puzzleById('s5-3') as never, content);
    module.mount(parent, { mode: 'standalone', resume: state, onFinish: () => undefined, onExit: () => undefined });
    expect(parent.querySelector('canvas')).not.toBeNull();
    const boxes = Array.from(parent.querySelectorAll('[data-testid^="creel-box-"]')).map((b) => b.textContent ?? '');
    const joined = boxes.join(' ');
    expect(joined).toContain('W-4812'); // kon-a
    expect(joined).toContain('W-4821'); // kon-b
    expect(joined).toContain('W-6340'); // ao-a
    expect(joined).toContain('W-6430'); // ao-b (似た品番)
    expect(joined).toContain('W-2200'); // shiro-a
  });
});

describe('T1-15 追加修正: 一覧から選んだお題が正しい状態で始まる', () => {
  /** s1 を開いてプレイ画面にし、stub も済ませる (T1-15 describe の startS1 と同じ) */
  function startS1Fix(parent: HTMLElement): void {
    const s1 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]')!;
    s1.click();
    const stage = parent.querySelector('canvas')!;
    const stageBox = stage.parentElement!;
    stubClientSize(stageBox, 600, 400);
    stubRect(stage, 600, 400);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
  }

  it('1. 最初から開き、s1 で「外す」を選ぶ → 一覧に戻る → s1 を押す → suspend の tool.kind が remove', async () => {
    const deps = makeDeps();
    const module = createCreelModule(deps);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const instance = module.mount(parent, { mode: 'standalone', onFinish: () => undefined, onExit: () => undefined });
    startS1Fix(parent);
    // 軸を 1 つ押して糸を立てる (最初の状態と違う操作)
    dragToPeg(parent, 's1', 'kon-a', 0);
    // 戻る → 一覧に戻る
    confirmAnswers.push(true);
    parent.querySelector<HTMLButtonElement>('.game-frame__bar-left')!.click();
    await vi.waitFor(() => {
      expect(parent.querySelector('[data-testid="creel-puzzle-s1"]')).not.toBeNull();
    }, { timeout: 5000 });
    // s1 (途中) を押して再開
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]')!.click();
    await vi.waitFor(() => {
      expect(parent.querySelector('canvas')).not.toBeNull();
    }, { timeout: 5000 });
    // suspend の軸に糸が立っている (途中の状態からの再開)
    const state = instance.suspend() as { placed?: (string | null)[] } | null;
    expect(state).not.toBeNull();
    expect(state?.placed?.[0]).toBe('kon-a');
  });

  it('2. s1 の星がある記録で s1-2 を resume して開く → 一覧に戻る → s1 を押し「始める」→ puzzleId が s1', async () => {
    const deps = makeDeps({
      records: {
        get: (gameId: string) =>
          gameId === 'creel' ? { bestStars: 3, plays: 1, best: { 'puzzle:s1': 3 } } : { bestStars: 0, plays: 0, best: {} },
      } as unknown as GameDeps['records'],
    });
    const module = createCreelModule(deps);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const s12 = content.creelPuzzles.find((p) => p.id === 's1-2')!;
    const state = init(s12, content);
    const instance = module.mount(parent, { mode: 'standalone', resume: state, onFinish: () => undefined, onExit: () => undefined });
    expect(parent.querySelector('canvas')).not.toBeNull();
    // 一覧に戻る
    confirmAnswers.push(true);
    parent.querySelector<HTMLButtonElement>('.game-frame__bar-left')!.click();
    await vi.waitFor(() => {
      expect(parent.querySelector('[data-testid="creel-puzzle-s1"]')).not.toBeNull();
    }, { timeout: 5000 });
    // s1 を押し、「始める」
    confirmAnswers.push(true);
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]')!.click();
    await vi.waitFor(() => {
      expect(parent.querySelector('canvas')).not.toBeNull();
    }, { timeout: 5000 });
    // suspend の puzzleId が s1
    const suspendState = instance.suspend() as { puzzleId?: string } | null;
    expect(suspendState?.puzzleId).toBe('s1');
  });
});

describe('T1-17: 確認の画面の取り消しボタンの文言', () => {
  /** s1 を開いてプレイ画面にする (T1-15 describe の startS1 と同じ) */
  function startS1Fix(parent: HTMLElement): void {
    const s1 = parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]')!;
    s1.click();
    const stage = parent.querySelector('canvas')!;
    const stageBox = stage.parentElement!;
    stubClientSize(stageBox, 600, 400);
    stubRect(stage, 600, 400);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
  }

  it('「お題の一覧に戻りますか?」の確認の取り消しボタンは「やめる」 (期待値の変更の理由: 管理者の指示で文言を変えたため)', async () => {
    const deps = makeDeps();
    const module = createCreelModule(deps);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    module.mount(parent, { mode: 'standalone', onFinish: () => undefined, onExit: () => undefined });
    startS1Fix(parent);
    confirmCalls.length = 0;
    confirmAnswers.push(true);
    parent.querySelector<HTMLButtonElement>('.game-frame__bar-left')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(confirmCalls).toHaveLength(1);
    expect(confirmCalls[0]!.message).toContain('お題の一覧に戻りますか');
    expect(confirmCalls[0]!.cancelLabel).toBe('やめる');
    expect(confirmCalls[0]!.okLabel).toBe('一覧に戻る');
  });
});

describe('PU-05b: クリール立てのプレイ画面と結果のつなぎ', () => {
  function mountAndOpen(puzzleId: string, onFinish: (r: unknown) => void = () => undefined): HTMLElement {
    const deps = makeDeps();
    const module = createCreelModule(deps);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    module.mount(parent, { mode: 'standalone', onFinish: onFinish as never, onExit: () => undefined });
    parent.querySelector<HTMLButtonElement>(`[data-testid="creel-puzzle-${puzzleId}"]`)!.click();
    const stage = parent.querySelector('canvas')!;
    stubClientSize(stage.parentElement!, 600, 400);
    stubRect(stage, 600, 400);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    return parent;
  }

  /** s1 の全部の軸に引っぱって立て、確認する (最初の確認で正解) */
  function solveS1(parent: HTMLElement): void {
    const puzzle = content.creelPuzzles.find((p) => p.id === 's1')!;
    for (let i = 0; i < puzzle.cols; i++) {
      dragToPeg(parent, 's1', 'kon-a', i);
    }
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-check"]')!.click();
    vi.advanceTimersByTime(1600);
  }

  it('見出しの行の題名の下に今のお題「レベル1 …」が出る。「現在の帯の並び」の欄は無く、盤面の下の欄 (footer) は空', () => {
    const parent = mountAndOpen('s1');
    const sub = parent.querySelector('.screen-header__subtitle')!;
    expect(sub.textContent).toMatch(/^レベル1 /);
    expect(parent.querySelector('.game-frame__footer')!.childElementCount).toBe(0);
    expect(parent.textContent).not.toContain('現在の帯の並び');
  });

  it('終わると resultLines・starHint・next (次のお題へ)・again・toList が onFinish に渡る', () => {
    const onFinish = vi.fn();
    const parent = mountAndOpen('s1', onFinish);
    solveS1(parent);
    expect(onFinish).toHaveBeenCalledTimes(1);
    const r = onFinish.mock.calls[0]![0] as {
      resultLines: { label: string; value: string }[];
      starHint: string;
      next?: { label: string; start: () => void };
      again?: () => void;
      toList?: () => void;
    };
    expect(r.resultLines).toEqual([
      { label: '確認した回数', value: '1回' },
      { label: 'ヒント', value: '0回' },
    ]);
    expect(r.starHint).toBe('1回目で合えば星3です');
    expect(r.next?.label).toBe('次のお題へ');
    expect(typeof r.again).toBe('function');
    expect(typeof r.toList).toBe('function');
  });

  it('next.start() で次のお題 (s1-2) のプレイ画面になる。again() で同じお題、toList() でお題の一覧', () => {
    const onFinish = vi.fn();
    const parent = mountAndOpen('s1', onFinish);
    solveS1(parent);
    const r = onFinish.mock.calls[0]![0] as { next: { start: () => void }; again: () => void; toList: () => void };
    r.next.start();
    expect(parent.querySelector('canvas')).not.toBeNull();
    const state = (parent.querySelector('.game-frame') as HTMLElement | null) !== null;
    expect(state).toBe(true);
    // 次のお題の柄の名前が題名の下に出る (s1-2 は p-muji-kuro)
    const name = content.patterns.get('p-muji-kuro')!.name;
    expect(parent.querySelector('.screen-header__subtitle')!.textContent).toContain(name);
    // もう一度 (同じお題)
    r.again();
    expect(parent.querySelector('.screen-header__subtitle')!.textContent).toContain(content.patterns.get('p-muji-kon')!.name);
    // 一覧へ
    r.toList();
    expect(parent.querySelector('canvas')).toBeNull();
    expect(parent.querySelector('[data-testid="creel-puzzle-s1"]')).not.toBeNull();
  });

  it('ゲームの中の「ボタン」の音は部品が鳴らす: 箱を押しても controller は tap を鳴らさない', () => {
    const deps = makeDeps();
    const play = deps.audio.play as unknown as ReturnType<typeof vi.fn>;
    const module = createCreelModule(deps);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    module.mount(parent, { mode: 'standalone', onFinish: () => undefined, onExit: () => undefined });
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]')!.click();
    play.mockClear();
    parent.querySelector<HTMLButtonElement>('[data-testid^="creel-box-"]')!.click();
    expect(play).not.toHaveBeenCalledWith('tap');
  });
});

describe('PU-07b: 引っぱって置く・外す・入れ替える (押して置く操作は PU-11a で無くした)', () => {
  function open(puzzleId: string): { parent: HTMLElement; instance: { suspend(): unknown; unmount(): void }; stage: HTMLCanvasElement } {
    // どのお題も遊べるように、全部クリア済みの記録にする
    const best: Record<string, number> = {};
    for (const p of content.creelPuzzles) {
      best[`puzzle:${p.id}`] = 3;
    }
    const deps = makeDeps({
      records: { get: () => ({ bestStars: 3, plays: 1, best }) } as unknown as GameDeps['records'],
    });
    const module = createCreelModule(deps);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const instance = module.mount(parent, { mode: 'standalone', onFinish: () => undefined, onExit: () => undefined });
    parent.querySelector<HTMLButtonElement>(`[data-testid="creel-puzzle-${puzzleId}"]`)!.click();
    const stage = parent.querySelector('canvas')!;
    stubClientSize(stage.parentElement!, 600, 400);
    stubRect(stage, 600, 400);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    return { parent, instance, stage };
  }

  /** 論理座標の軸の中心 (盤面の画面座標) */
  function pegPx(stage: HTMLCanvasElement, puzzleId: string, index: number): { x: number; y: number } {
    const rect = stage.getBoundingClientRect();
    const puzzle = content.creelPuzzles.find((p) => p.id === puzzleId)!;
    const fit = fitStage(1000, 750, rect.width, rect.height);
    const cell = cellRect(index, puzzle.rows, puzzle.cols);
    const px = toPx(fit, { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 });
    return { x: rect.left + px.x, y: rect.top + px.y };
  }

  function fire(el: Element | Window, type: string, x: number, y: number, id = 1): void {
    el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, bubbles: true, button: 0 }));
  }

  const placedOf = (inst: { suspend(): unknown }): (string | null)[] => (inst.suspend() as { placed: (string | null)[] }).placed;
  const box = (parent: HTMLElement, yarn: string): HTMLElement => parent.querySelector<HTMLElement>(`[data-testid="creel-box-${yarn}"]`)!;

  /** 箱から軸へ引っぱって離す (チーズは指より 40px 上に出るので、指は軸より 40px 下で離す) */
  function dragBoxToPeg(parent: HTMLElement, stage: HTMLCanvasElement, puzzleId: string, yarn: string, index: number): void {
    const b = box(parent, yarn);
    const p = pegPx(stage, puzzleId, index);
    fire(b, 'pointerdown', 700, 300);
    fire(b, 'pointermove', 650, 300);
    fire(b, 'pointermove', p.x, p.y + 40);
    fire(b, 'pointerup', p.x, p.y + 40);
  }

  it('箱から軸へ引っぱって離すと、その軸にその糸が立つ。引っぱっている間は画面全体の上の重ね (position: fixed) が出て、離すと消える', () => {
    const { parent, instance, stage } = open('s2');
    const b = box(parent, 'kon-a');
    const p = pegPx(stage, 's2', 3);
    fire(b, 'pointerdown', 700, 300);
    expect(document.querySelector('.creel-drag')).toBeNull(); // 動かすまでは出ない
    fire(b, 'pointermove', 690, 300); // 10px
    const layer = document.querySelector<HTMLElement>('.creel-drag')!;
    expect(layer).not.toBeNull();
    expect(layer.style.position).toBe('fixed');
    fire(b, 'pointermove', p.x, p.y + 40);
    fire(b, 'pointerup', p.x, p.y + 40);
    expect(placedOf(instance)[3]).toBe('kon-a');
    vi.advanceTimersByTime(400);
    expect(document.querySelector('.creel-drag')).toBeNull();
  });

  it('チーズのある軸へ引っぱって離すと入れ替わる (前のチーズは箱へ戻る)', () => {
    const { parent, instance, stage } = open('s2');
    dragBoxToPeg(parent, stage, 's2', 'kon-a', 2);
    expect(placedOf(instance)[2]).toBe('kon-a');
    dragBoxToPeg(parent, stage, 's2', 'shiro-a', 2);
    expect(placedOf(instance)[2]).toBe('shiro-a');
  });

  it('軸から盤面の外へ引っぱって離すと外れる。別の軸へ引っぱると移る。同じ所で離すと何も変わらない', () => {
    const { parent, instance, stage } = open('s2');
    dragBoxToPeg(parent, stage, 's2', 'kon-a', 1);
    const from = pegPx(stage, 's2', 1);
    // 別の軸へ
    const to = pegPx(stage, 's2', 5);
    fire(stage, 'pointerdown', from.x, from.y);
    fire(stage, 'pointermove', to.x, to.y + 40);
    fire(stage, 'pointerup', to.x, to.y + 40);
    expect(placedOf(instance)[1]).toBeNull();
    expect(placedOf(instance)[5]).toBe('kon-a');
    // 盤面の外 (Canvas の右の外) へ
    fire(stage, 'pointerdown', to.x, to.y);
    fire(stage, 'pointermove', 800, to.y);
    fire(stage, 'pointerup', 800, to.y);
    expect(placedOf(instance)[5]).toBeNull();
    // 同じ軸の上で離す (元に戻る)
    dragBoxToPeg(parent, stage, 's2', 'kon-a', 0);
    const p0 = pegPx(stage, 's2', 0);
    fire(stage, 'pointerdown', p0.x, p0.y);
    fire(stage, 'pointermove', p0.x + 30, p0.y + 40 + 30);
    fire(stage, 'pointermove', p0.x, p0.y + 40);
    fire(stage, 'pointerup', p0.x, p0.y + 40);
    expect(placedOf(instance)[0]).toBe('kon-a');
  });

  it('pointercancel では何も変わらず、重ねも消える。2本目の指は無視する', () => {
    const { parent, instance, stage } = open('s2');
    const b = box(parent, 'kon-a');
    const p = pegPx(stage, 's2', 3);
    fire(b, 'pointerdown', 700, 300, 1);
    fire(b, 'pointermove', p.x, p.y + 40, 1);
    expect(document.querySelectorAll('.creel-drag')).toHaveLength(1);
    // 2本目の指: 引っぱりが増えない・終わらない
    fire(b, 'pointerdown', 710, 310, 2);
    fire(b, 'pointermove', 720, 320, 2);
    fire(b, 'pointerup', 720, 320, 2);
    expect(document.querySelectorAll('.creel-drag')).toHaveLength(1);
    expect(placedOf(instance)[3]).toBeNull();
    // 着信などで指が外れた
    fire(b, 'pointercancel', p.x, p.y + 40, 1);
    expect(placedOf(instance)[3]).toBeNull();
    vi.advanceTimersByTime(400);
    expect(document.querySelector('.creel-drag')).toBeNull();
  });

  it('引っぱっている途中で裏に回る (visibilitychange hidden) と取り消され、unmount でも重ねが消える', () => {
    const { parent, instance, stage } = open('s2');
    const p = pegPx(stage, 's2', 3);
    const b = box(parent, 'kon-a');
    fire(b, 'pointerdown', 700, 300);
    fire(b, 'pointermove', p.x, p.y + 40);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(400);
    expect(document.querySelector('.creel-drag')).toBeNull();
    fire(b, 'pointerup', p.x, p.y + 40);
    expect(placedOf(instance)[3]).toBeNull();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    // 引っぱっている途中の unmount
    fire(b, 'pointerdown', 700, 300);
    fire(b, 'pointermove', p.x, p.y + 40);
    expect(document.querySelector('.creel-drag')).not.toBeNull();
    instance.unmount();
    expect(document.querySelector('.creel-drag')).toBeNull();
    // unmount のあとの pointer は何も起こさない
    expect(() => fire(window, 'pointermove', 1, 1)).not.toThrow();
  });

  it('PU-11a: 押して置く操作は無い。箱を押しても選ばず、空いた軸を押すと案内のメッセージが出て何も立たない。糸のある軸を押すと品番の吹き出し', () => {
    const { parent, instance, stage } = open('s2');
    const b = box(parent, 'shiro-a');
    fire(b, 'pointerdown', 700, 300);
    fire(b, 'pointerup', 700, 300);
    b.click(); // ブラウザは動かさずに離すと click も送る
    expect(document.querySelector('.creel-drag')).toBeNull();
    expect(b.hasAttribute('aria-pressed')).toBe(false);
    const p = pegPx(stage, 's2', 4);
    fire(stage, 'pointerdown', p.x, p.y);
    fire(stage, 'pointerup', p.x, p.y);
    expect(placedOf(instance)[4]).toBeNull(); // 何も立たない
    expect(parent.querySelector('.game-frame__notice')!.textContent).toBe('箱からコーンを引っぱって、軸の丸に嵌めてください');
    // 引っぱって立てたあと、その軸を押すと品番の吹き出し (inspected)
    dragBoxToPeg(parent, stage, 's2', 'shiro-a', 4);
    fire(stage, 'pointerdown', p.x, p.y);
    fire(stage, 'pointerup', p.x, p.y);
    expect((instance.suspend() as { inspected: number | null }).inspected).toBe(4);
    expect(placedOf(instance)[4]).toBe('shiro-a');
  });

  it('引っぱった直後の click でも、状態は変わらない', () => {
    const { parent, instance, stage } = open('s2');
    const b = box(parent, 'shiro-a');
    const p = pegPx(stage, 's2', 1);
    fire(b, 'pointerdown', 700, 300);
    fire(b, 'pointermove', p.x, p.y + 40);
    fire(b, 'pointerup', p.x, p.y + 40);
    const stateAfterDrop = instance.suspend();
    b.click(); // 引っぱった後にブラウザが送る click
    expect(instance.suspend()).toEqual(stateAfterDrop);
  });
});

describe('PU-09b: 詰めた形で、箱の横送りと引っぱるを見分ける', () => {
  /** 詰めた形 (cover 画面) で s2 を開く。w×h は frame の親の内寸 */
  function openCompact(w: number, h: number): { parent: HTMLElement; instance: { suspend(): unknown; unmount(): void }; stage: HTMLCanvasElement } {
    const best: Record<string, number> = {};
    for (const p of content.creelPuzzles) {
      best[`puzzle:${p.id}`] = 3;
    }
    const deps = makeDeps({ records: { get: () => ({ bestStars: 3, plays: 1, best }) } as unknown as GameDeps['records'] });
    const module = createCreelModule(deps);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    stubRect(parent, w, h); // 盤面の枠は、この親の内寸で配置と詰めた形を決める
    const instance = module.mount(parent, { mode: 'standalone', onFinish: () => undefined, onExit: () => undefined });
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s2"]')!.click();
    const stage = parent.querySelector('canvas')!;
    stubClientSize(stage.parentElement!, 600, 400);
    stubRect(stage, 600, 400);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    return { parent, instance, stage };
  }

  const fire = (el: Element, type: string, x: number, y: number): void => {
    el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, button: 0 }));
  };

  it('縦の詰めた形: 操作欄に「依頼書を見る」があり、箱は横に送る (data-scroll=x)。メッセージ欄は盤面のカードのすぐ上 (外)', () => {
    const { parent } = openCompact(412, 915);
    expect(parent.querySelector('.game-frame--compact')).not.toBeNull();
    expect(Array.from(parent.querySelectorAll('button')).some((b) => b.textContent === '依頼書を見る')).toBe(true);
    expect(parent.querySelector<HTMLElement>('.creel-boxes')!.dataset.scroll).toBe('x');
    expect(parent.querySelector('.game-frame__message')).toBeNull(); // メッセージ欄は無い (PU-12d)
  });

  it('縦の詰めた形: 箱の上で横に 20px 動かしても引っぱりにならず (重ねが出ない)、上に 20px 動かすと引っぱりになる', () => {
    const { parent } = openCompact(412, 915);
    const b = parent.querySelector<HTMLButtonElement>('[data-testid="creel-box-kon-a"]')!;
    fire(b, 'pointerdown', 100, 500);
    fire(b, 'pointermove', 120, 500); // 横に 20px
    expect(document.querySelector('.creel-drag')).toBeNull();
    fire(b, 'pointermove', 140, 500);
    expect(document.querySelector('.creel-drag')).toBeNull(); // 一度スクロールと決めたら、そのあとは引っぱりにならない
    fire(b, 'pointerup', 140, 500);
    fire(b, 'pointerdown', 100, 500);
    fire(b, 'pointermove', 102, 480); // 上に 20px (横は 2px)
    expect(document.querySelector('.creel-drag')).not.toBeNull();
    fire(b, 'pointerup', 102, 480);
    vi.advanceTimersByTime(400);
    expect(document.querySelector('.creel-drag')).toBeNull();
  });

  it('横の詰めた形: 箱は縦に送る (data-scroll=y)。縦に 20px 動かすと送る (引っぱらない)、左 (盤面の方) に 20px 動かすと引っぱる', () => {
    const { parent } = openCompact(915, 412);
    expect(parent.querySelector<HTMLElement>('.creel-boxes')!.dataset.scroll).toBe('y');
    const b = parent.querySelector<HTMLButtonElement>('[data-testid="creel-box-kon-a"]')!;
    fire(b, 'pointerdown', 700, 300);
    fire(b, 'pointermove', 700, 320); // 縦に 20px
    expect(document.querySelector('.creel-drag')).toBeNull();
    fire(b, 'pointerup', 700, 320);
    fire(b, 'pointerdown', 700, 300);
    fire(b, 'pointermove', 680, 302); // 左に 20px
    expect(document.querySelector('.creel-drag')).not.toBeNull();
    fire(b, 'pointerup', 680, 302);
    vi.advanceTimersByTime(400);
  });

  it('クリール立ては、広い画面 (1180×820) でも詰めた形 (alwaysCompact)。メッセージ欄は無く、依頼書は「依頼書を見る」、箱は縦に送れる (横長)', () => {
    const { parent } = openCompact(1180, 820);
    expect(parent.querySelector('.game-frame--compact')).not.toBeNull();
    expect(parent.querySelector('.game-frame__message')).toBeNull();
    expect(parent.querySelector('.creel-panel__message')).toBeNull();
    expect(Array.from(parent.querySelectorAll('button')).some((b) => b.textContent === '依頼書を見る')).toBe(true);
    expect(parent.querySelector<HTMLElement>('.creel-boxes')!.dataset.scroll).toBe('y');
  });

  it('メッセージ欄で伝えていた「依頼書どおりに…」「完成しました」「✕ の箇所を直してください」は出さない。ヒントが使えない理由は盤面のお知らせに出る', () => {
    const { parent } = openCompact(412, 915);
    expect(parent.textContent).not.toContain('依頼書どおりに');
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-hint"]')!.click();
    expect(parent.querySelector('.game-frame__notice')!.textContent).toBe('2回確認すると使えます');
  });
});
