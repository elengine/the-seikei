import { describe, it, expect, vi, afterEach } from 'vitest';
import { createListView } from './listView';
import { getContent } from '../../core/content/content';
import type { Records } from '../../core/game/records';

function recordsWith(best: Record<string, number>): Records {
  return {
    get: () => ({ bestStars: 0, plays: 0, best }),
  } as unknown as Records;
}

function mountList(best: Record<string, number>, extra: Partial<Parameters<typeof createListView>[1]> = {}): {
  parent: HTMLElement;
  onSelect: ReturnType<typeof vi.fn>;
  destroy: () => void;
} {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const onSelect = vi.fn();
  const { destroy } = createListView(parent, {
    records: recordsWith(best),
    onSelect,
    onExit: () => undefined,
    ...extra,
  });
  return { parent, onSelect, destroy };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

describe('クリール立ての一覧 (PU-04)', () => {
  it('節の数が段階の数と同じ。見出しは「段階N」', () => {
    const { parent } = mountList({});
    const stages = new Set(getContent().creelPuzzles.map((p) => p.stage));
    const heads = Array.from(parent.querySelectorAll('.section-heading')).map((h) => h.textContent);
    expect(heads).toHaveLength(stages.size);
    expect(heads[0]).toBe('段階1');
    expect(parent.querySelectorAll('.list-row')).toHaveLength(getContent().creelPuzzles.length);
  });

  it('「次はこれ」が1つだけ付く。すべてクリア済みなら付かない', () => {
    const a = mountList({});
    expect(a.parent.querySelectorAll('.list-row--next')).toHaveLength(1);
    expect(a.parent.querySelector('.list-row--next')!.getAttribute('data-testid')).toBe('creel-puzzle-s1');
    document.body.textContent = '';
    const all: Record<string, number> = {};
    for (const p of getContent().creelPuzzles) {
      all[`puzzle:${p.id}`] = 2;
    }
    const b = mountList(all);
    expect(b.parent.querySelectorAll('.list-row--next')).toHaveLength(0);
    expect(b.parent.querySelectorAll('.list-row--locked')).toHaveLength(0);
    expect(b.parent.querySelector('[data-testid="creel-puzzle-s1"] .stars')!.getAttribute('aria-label')).toBe('星2');
  });

  it('未解放の行を押すと理由が出て、ゲームは始まらない。押せない扱いでも disabled は付かない', () => {
    vi.useFakeTimers();
    const { parent, onSelect } = mountList({});
    const locked = parent.querySelector<HTMLButtonElement>('.list-row--locked')!;
    expect(locked.disabled).toBe(false);
    locked.click();
    expect(onSelect).not.toHaveBeenCalled();
    expect(parent.querySelector('.list-notice')!.textContent).toBe('前のお題をクリアすると遊べます');
    expect(parent.textContent).not.toContain('未解放');
    vi.advanceTimersByTime(3000);
    expect(parent.querySelector('.list-notice')!.textContent).toBe('');
  });

  it('次に遊ぶ行と、クリア済みの行は押すと onSelect。destroy でタイマーが残らない', () => {
    vi.useFakeTimers();
    const { parent, onSelect, destroy } = mountList({ 'puzzle:s1': 3 });
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1"]')!.click();
    expect(onSelect).toHaveBeenLastCalledWith('s1');
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-puzzle-s1-2"]')!.click();
    expect(onSelect).toHaveBeenLastCalledWith('s1-2');
    parent.querySelector<HTMLButtonElement>('.list-row--locked')!.click();
    destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('途中のお題に「途中」が出る。見本の要素と、補足「1段×6本」がある', () => {
    const { parent } = mountList({}, { savedPuzzleId: 's1' });
    const row = parent.querySelector('[data-testid="creel-puzzle-s1"]')!;
    expect(row.querySelector('.list-row__saved')!.textContent).toBe('途中');
    expect(row.querySelector('.list-row__swatch')).not.toBeNull();
    expect(row.querySelector('.list-row__meta')!.textContent).toBe('1段×6本');
  });

  it('見出しの行: 題名、左に「戻る」、onTutorial があれば右に「遊び方」', () => {
    const onExit = vi.fn();
    const onTutorial = vi.fn();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    createListView(parent, { records: recordsWith({}), onSelect: () => undefined, onExit, onTutorial, title: 'クリール立て' });
    expect(parent.querySelector('.screen-header__title')!.textContent).toBe('クリール立て');
    parent.querySelector<HTMLButtonElement>('[data-testid="creel-list-back"]')!.click();
    expect(onExit).toHaveBeenCalled();
    parent.querySelector<HTMLButtonElement>('.screen-header__right button')!.click();
    expect(onTutorial).toHaveBeenCalled();
    document.body.textContent = '';
    const { parent: p2 } = mountList({});
    expect(p2.querySelector('.screen-header__right button')).toBeNull();
  });
});
