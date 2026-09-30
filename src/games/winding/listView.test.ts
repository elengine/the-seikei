import { describe, it, expect, vi, afterEach } from 'vitest';
import { createListView } from './listView';
import type { Records } from '../../core/game/records';

function recordsWith(best: Record<string, number>): Records {
  return {
    get: () => ({ bestStars: 0, plays: 0, best }),
  } as unknown as Records;
}

function mountList(best: Record<string, number>): { parent: HTMLElement; onSelect: ReturnType<typeof vi.fn> } {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const onSelect = vi.fn();
  createListView(parent, { records: recordsWith(best), onSelect, onExit: () => undefined });
  return { parent, onSelect };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

describe('ドラム巻きの一覧 (PU-04)', () => {
  it('節は「難易度」の1つで、初級・中級・上級の3行。補足は「帯 N本」', () => {
    const { parent } = mountList({});
    expect(Array.from(parent.querySelectorAll('.section-heading')).map((h) => h.textContent)).toEqual(['難易度']);
    const rows = Array.from(parent.querySelectorAll('.list-row'));
    expect(rows.map((r) => r.querySelector('.list-row__name')!.textContent)).toEqual(['初級', '中級', '上級']);
    expect(rows[0]!.querySelector('.list-row__meta')!.textContent).toBe('帯 3本');
    expect(rows[0]!.querySelector('.list-row__swatch')).not.toBeNull();
  });

  it('「次はこれ」が1つだけ。すべてクリア済みなら付かない', () => {
    const a = mountList({});
    expect(a.parent.querySelectorAll('.list-row--next')).toHaveLength(1);
    expect(a.parent.querySelector('.list-row--next')!.getAttribute('data-testid')).toBe('winding-level-1');
    document.body.textContent = '';
    const b = mountList({ 'level:1': 3, 'level:2': 2, 'level:3': 1 });
    expect(b.parent.querySelectorAll('.list-row--next')).toHaveLength(0);
    expect(b.parent.querySelectorAll('.list-row--locked')).toHaveLength(0);
  });

  it('未解放の行を押すと理由が出て、ゲームは始まらない', () => {
    vi.useFakeTimers();
    const { parent, onSelect } = mountList({});
    const mid = parent.querySelector<HTMLButtonElement>('[data-testid="winding-level-2"]')!;
    expect(mid.classList.contains('list-row--locked')).toBe(true);
    expect(mid.disabled).toBe(false);
    mid.click();
    expect(onSelect).not.toHaveBeenCalled();
    expect(parent.querySelector('.list-notice')!.textContent).toBe('前のお題をクリアすると遊べます');
    parent.querySelector<HTMLButtonElement>('[data-testid="winding-level-1"]')!.click();
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
