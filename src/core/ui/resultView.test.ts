import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { showResult } from './resultView';

function mountResult(opts: Parameters<typeof showResult>[1]): { host: HTMLElement; done: ReturnType<typeof showResult> } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const done = showResult(host, opts);
  return { host, done };
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const b = Array.from(host.querySelectorAll('button')).find((x) => x.textContent === label);
  if (b === undefined) {
    throw new Error(`button not found: ${label}`);
  }
  return b;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

describe('showResult (PU-02b)', () => {
  it('見出し「完了しました」(明朝) と「お疲れ様でした」が出る。ほめる一言は出さない', async () => {
    const { host, done } = mountResult({ stars: 3, lines: [], newPatternNames: [] });
    expect(host.querySelector('.result__title')!.textContent).toBe('完了しました');
    expect(host.querySelector('.result__title')!.classList.contains('font-heading')).toBe(true);
    expect(host.textContent).toContain('お疲れ様でした');
    button(host, '一覧').click();
    await done;
  });

  it('成績の行は「項目」「値」の2つの要素。hint と preview も出る', async () => {
    const preview = document.createElement('div');
    preview.dataset.testid = 'pv';
    const { host, done } = mountResult({
      stars: 2,
      preview,
      lines: [{ label: '継いだ本数', value: '12本' }],
      hint: '1回目で合えば星3です',
      newPatternNames: [],
    });
    const li = host.querySelector('.result__lines li')!;
    expect(li.querySelector('.result__label')!.textContent).toBe('継いだ本数');
    expect(li.querySelector('.result__value')!.textContent).toBe('12本');
    expect(host.querySelector('.result__hint')!.textContent).toBe('1回目で合えば星3です');
    expect(host.querySelector('[data-testid="pv"]')).toBe(preview);
    button(host, '一覧').click();
    await done;
  });

  it('next があると右に primary。押すと next。左に「一覧へ」「もう一度」(secondary)', async () => {
    const { host, done } = mountResult({ stars: 1, lines: [], newPatternNames: [], next: { label: '次へ' } });
    const actions = host.querySelector('.dialog__actions')!;
    const last = actions.lastElementChild as HTMLButtonElement;
    expect(last.textContent).toBe('次へ');
    expect(last.classList.contains('btn--primary')).toBe(true);
    expect(button(host, '一覧').classList.contains('btn--secondary')).toBe(true);
    expect(button(host, 'もう一度').classList.contains('btn--secondary')).toBe(true);
    last.click();
    await expect(done).resolves.toBe('next');
    expect(host.querySelector('.dialog-backdrop')).toBeNull();
  });

  it('next が無いと「一覧へ」が primary で、押すと list。「もう一度」は again', async () => {
    const a = mountResult({ stars: 1, lines: [], newPatternNames: [] });
    expect(button(a.host, '一覧').classList.contains('btn--primary')).toBe(true);
    button(a.host, '一覧').click();
    await expect(a.done).resolves.toBe('list');
    const b = mountResult({ stars: 1, lines: [], newPatternNames: [] });
    button(b.host, 'もう一度').click();
    await expect(b.done).resolves.toBe('again');
  });

  it('星は1つずつ現れる (reduced-motion でなければ)。押すと片付き、タイマーが残らない', async () => {
    vi.useFakeTimers();
    const { host, done } = mountResult({ stars: 3, lines: [], newPatternNames: [] });
    const pending = (): number => host.querySelectorAll('.stars__on.stars__pending').length;
    expect(pending()).toBe(2); // 1つ目はすぐ、あとは 0.3 秒ごと
    vi.advanceTimersByTime(300);
    expect(pending()).toBe(1);
    vi.advanceTimersByTime(300);
    expect(pending()).toBe(0);
    button(host, '一覧').click();
    await done;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('prefers-reduced-motion: reduce ではすぐに全部出る', async () => {
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') })) as unknown as typeof window.matchMedia;
    try {
      const { host, done } = mountResult({ stars: 3, lines: [], newPatternNames: [] });
      expect(host.querySelectorAll('.stars__pending')).toHaveLength(0);
      button(host, '一覧').click();
      await done;
    } finally {
      window.matchMedia = orig;
    }
  });

  it('今の呼び出し (praise・againLabel・homeLabel・lines が文字列) も通る。home は list として返る', async () => {
    const { host, done } = mountResult({
      praise: '完璧です!',
      stars: 2,
      lines: ['継いだ本数 12本'],
      newPatternNames: ['無地'],
      againLabel: '続けて遊ぶ',
      homeLabel: 'ホームへ',
    });
    expect(host.textContent).not.toContain('完璧です');
    expect(host.querySelector('.result__lines li')!.textContent).toContain('継いだ本数 12本');
    expect(host.querySelector('.result-patterns__names')!.textContent).toBe('無地');
    button(host, '続けて遊ぶ').click();
    await expect(done).resolves.toBe('again');
    const b = mountResult({ stars: 1, lines: [], newPatternNames: [], againLabel: 'x', homeLabel: 'ホームへ' });
    button(b.host, 'ホームへ').click();
    await expect(b.done).resolves.toBe('list');
  });
});

describe('PU-14d: 結果のボタンの文字は短い (「一覧」「もう一度」「次へ」。3 つが 1 行に並ぶ)', () => {
  it('既定は「一覧」「もう一度」。next があれば「次へ」。「一覧へ」「次のお題へ」は無い', () => {
    const { host } = mountResult({ stars: 1, lines: [], newPatternNames: [], next: { label: '次へ' } });
    const labels = Array.from(host.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toEqual(['一覧', 'もう一度', '次へ']);
    expect(host.textContent).not.toContain('一覧へ');
    expect(host.textContent).not.toContain('次のお題へ');
  });

  it('base.css: 結果の 3 つのボタンは、狭い画面 (412px・文字の段階5) でも 1 行に収まる指定 (折り返さない・最小幅 64px・左右の余白 8px・間隔を詰める)', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const btn = css.match(/\n\.result__actions \.btn\s*\{([^}]*)\}/)![1]!;
    expect(btn).toContain('min-width: 64px');
    expect(btn).toContain('padding: 0 var(--sp-2)');
    const left = css.match(/\n\.result__actions-left\s*\{([^}]*)\}/)![1]!;
    expect(left).toContain('gap: var(--sp-2)');
    expect(left).not.toContain('flex-wrap: wrap');
    expect(css.match(/\n\.result__actions\s*\{([^}]*)\}/)![1]).toContain('flex-wrap: nowrap');
  });
});

describe('PU-21: 結果の画面を低い横長 (スマホの横向き) でも画面の中に収める', () => {
  const css = (): string => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
  const LOW_LANDSCAPE = '(orientation: landscape) and (max-height: 559px)';

  /** 高さ 393 の横長か (低い横長の問い合わせに合うか) を決める偽の matchMedia。set(low) で回転を真似て、監視に知らせる */
  function withMedia<T>(low: boolean, fn: (m: { listeners: Set<() => void>; set: (low: boolean) => void }) => T): T {
    const orig = window.matchMedia;
    const listeners = new Set<() => void>();
    const state = { low };
    window.matchMedia = ((q: string) => ({
      get matches() {
        return q === LOW_LANDSCAPE ? state.low : false;
      },
      media: q,
      addEventListener: (_t: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_t: string, cb: () => void) => listeners.delete(cb),
    })) as unknown as typeof window.matchMedia;
    try {
      return fn({
        listeners,
        set: (v) => {
          state.low = v;
          for (const cb of [...listeners]) cb();
        },
      });
    } finally {
      window.matchMedia = orig;
    }
  }

  it('作りは 見出しの部分 (.result__head: 題名・お疲れ様・星・絵) → 成績の欄 (.result__body: 成績・目安・新しい柄) → ボタンの行 (.result__actions)。ボタンの行は結果の箱の直下の最後', () => {
    const { host } = mountResult({
      stars: 2,
      preview: document.createElement('canvas'),
      lines: [{ label: '誤差', value: '1cm' }],
      hint: '1回目で合えば星3です',
      newPatternNames: ['紺の無地'],
    });
    const box = host.querySelector<HTMLElement>('.result')!;
    const kids = Array.from(box.children).map((c) => c.className.split(' ')[0]);
    expect(kids).toEqual(['stripe-top', 'result__head', 'result__body', 'dialog__actions']);
    expect(box.lastElementChild!.classList.contains('result__actions')).toBe(true);
    const head = box.querySelector('.result__head')!;
    expect(head.querySelector('.result__title')).not.toBeNull();
    expect(head.querySelector('.result__praise')).not.toBeNull();
    expect(head.querySelector('.result-stars')).not.toBeNull();
    expect(head.querySelector('.result__preview')).not.toBeNull();
    const body = box.querySelector('.result__body')!;
    expect(body.querySelector('.result__lines')).not.toBeNull();
    expect(body.querySelector('.result__hint')).not.toBeNull();
    expect(body.querySelector('.result-patterns')).not.toBeNull();
    expect(body.querySelector('button')).toBeNull(); // ボタンは成績の欄の外
  });

  it('高さ 393 の横長 (低い横長) では .result--wide が付き、そうでなければ付かない。押して閉じたら監視を外す', async () => {
    await withMedia(true, async ({ listeners }) => {
      const { host, done } = mountResult({ stars: 3, lines: [], newPatternNames: [] });
      expect(host.querySelector('.result')!.classList.contains('result--wide')).toBe(true);
      expect(listeners.size).toBeGreaterThan(0);
      button(host, '一覧').click();
      await done;
      expect(listeners.size).toBe(0);
    });
    withMedia(false, () => {
      const { host } = mountResult({ stars: 3, lines: [], newPatternNames: [] });
      expect(host.querySelector('.result')!.classList.contains('result--wide')).toBe(false);
    });
  });

  it('回して低い横長になる/戻ると、.result--wide を付け外しする', () => {
    withMedia(false, ({ set }) => {
      const { host } = mountResult({ stars: 3, lines: [], newPatternNames: [] });
      const box = host.querySelector('.result')!;
      set(true);
      expect(box.classList.contains('result--wide')).toBe(true);
      set(false);
      expect(box.classList.contains('result--wide')).toBe(false);
    });
  });

  it('base.css: 結果の箱はボタンの行を下に固定する (overflow: hidden・高さは 100dvh から余白と safe area を引く)。成績の欄 (.result__body) だけが中でスクロール (overflow-y: auto・min-height: 0)', () => {
    const c = css();
    const box = c.match(/\n\.dialog\.result\s*\{([^}]*)\}/)![1]!;
    expect(box).toContain('overflow: hidden');
    expect(box).toMatch(/max-height:[^;]*100dvh/);
    expect(box).toContain('safe-area-inset');
    const body = c.match(/\n\.result__body\s*\{([^}]*)\}/)![1]!;
    expect(body).toContain('overflow-y: auto');
    expect(body).toContain('min-height: 0');
    expect(c.match(/\n\.result__actions\s*\{([^}]*)\}/)![1]).toContain('flex: none');
  });

  it('base.css: 低い横長 (.result--wide) は左右 2 列 (左に見出し・右に成績の欄とボタンの行)。題名は 32px 以上・星は 40px 以上', () => {
    const c = css();
    const wide = c.match(/\n\.dialog\.result--wide\s*\{([^}]*)\}/)![1]!;
    expect(wide).toContain('display: grid');
    expect(wide).toContain('grid-template-columns');
    expect(wide).toContain("'head body'");
    expect(wide).toContain("'head actions'");
    expect(c.match(/\n\.result--wide \.result__head\s*\{([^}]*)\}/)![1]).toContain('grid-area: head');
    expect(c.match(/\n\.result--wide \.result__body\s*\{([^}]*)\}/)![1]).toContain('grid-area: body');
    expect(c.match(/\n\.result--wide \.result__actions\s*\{([^}]*)\}/)![1]).toContain('grid-area: actions');
    const title = c.match(/\n\.result--wide \.result__title\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(title.match(/font-size:\s*(\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(32);
    const stars = c.match(/\n\.result--wide \.result-stars\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(stars.match(/font-size:\s*(\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(40);
  });
});
