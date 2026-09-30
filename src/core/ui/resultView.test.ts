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
    button(host, '一覧へ').click();
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
    button(host, '一覧へ').click();
    await done;
  });

  it('next があると右に primary。押すと next。左に「一覧へ」「もう一度」(secondary)', async () => {
    const { host, done } = mountResult({ stars: 1, lines: [], newPatternNames: [], next: { label: '次のお題へ' } });
    const actions = host.querySelector('.dialog__actions')!;
    const last = actions.lastElementChild as HTMLButtonElement;
    expect(last.textContent).toBe('次のお題へ');
    expect(last.classList.contains('btn--primary')).toBe(true);
    expect(button(host, '一覧へ').classList.contains('btn--secondary')).toBe(true);
    expect(button(host, 'もう一度').classList.contains('btn--secondary')).toBe(true);
    last.click();
    await expect(done).resolves.toBe('next');
    expect(host.querySelector('.dialog-backdrop')).toBeNull();
  });

  it('next が無いと「一覧へ」が primary で、押すと list。「もう一度」は again', async () => {
    const a = mountResult({ stars: 1, lines: [], newPatternNames: [] });
    expect(button(a.host, '一覧へ').classList.contains('btn--primary')).toBe(true);
    button(a.host, '一覧へ').click();
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
    button(host, '一覧へ').click();
    await done;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('prefers-reduced-motion: reduce ではすぐに全部出る', async () => {
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') })) as unknown as typeof window.matchMedia;
    try {
      const { host, done } = mountResult({ stars: 3, lines: [], newPatternNames: [] });
      expect(host.querySelectorAll('.stars__pending')).toHaveLength(0);
      button(host, '一覧へ').click();
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
