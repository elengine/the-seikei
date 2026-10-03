import { describe, it, expect, vi, afterEach } from 'vitest';
import { createListView } from './listView';
import { getContent } from '../../core/content/content';
import type { Records } from '../../core/game/records';

/** winding と creel の成績を別々に返す Records */
function recordsWith(windingBest: Record<string, number>, creelBest: Record<string, number> = {}): Records {
  return {
    get: (gameId: string) =>
      gameId === 'creel'
        ? { bestStars: 0, plays: 0, best: creelBest }
        : { bestStars: 0, plays: 0, best: windingBest },
  } as unknown as Records;
}

function mountList(
  windingBest: Record<string, number>,
  creelBest: Record<string, number> = {},
): { parent: HTMLElement; onSelect: ReturnType<typeof vi.fn> } {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const onSelect = vi.fn();
  createListView(parent, { records: recordsWith(windingBest, creelBest), onSelect, onExit: () => undefined });
  return { parent, onSelect };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

describe('ドラム巻きの一覧 T2-14a (お題15題・クリール立てと同じ柄)', () => {
  it('節は「段階1」〜「段階5」の5つで、行はお題15行。名前は柄の名前、補足は「帯 N本」', () => {
    const { parent } = mountList({});
    const headings = Array.from(parent.querySelectorAll('.section-heading')).map((h) => h.textContent);
    expect(headings).toEqual(['段階1', '段階2', '段階3', '段階4', '段階5']);
    const rows = Array.from(parent.querySelectorAll('.list-row'));
    expect(rows).toHaveLength(getContent().creelPuzzles.length);
    const s1 = parent.querySelector('[data-testid="winding-puzzle-s1"]')!;
    expect(s1.querySelector('.list-row__name')!.textContent).toBe(getContent().patterns.get('p-muji-kon')!.name);
    expect(s1.querySelector('.list-row__meta')!.textContent).toBe('帯 3本');
    expect(s1.querySelector('.list-row__swatch')).not.toBeNull();
  });

  it('「次はこれ」が1つだけ (最初の未クリアのお題)。未解放の行を押すと理由が出て、始まらない', () => {
    vi.useFakeTimers();
    const { parent, onSelect } = mountList({ 'puzzle:s1': 3 });
    const nextRows = parent.querySelectorAll('.list-row--next');
    expect(nextRows).toHaveLength(1);
    expect(nextRows[0]!.getAttribute('data-testid')).toBe('winding-puzzle-s1-2');
    // s1 はクリア済みで押せる
    const s1 = parent.querySelector<HTMLButtonElement>('[data-testid="winding-puzzle-s1"]')!;
    expect(s1.classList.contains('list-row--locked')).toBe(false);
    // s3 は鍵
    const s3 = parent.querySelector<HTMLButtonElement>('[data-testid="winding-puzzle-s3"]')!;
    expect(s3.classList.contains('list-row--locked')).toBe(true);
    s3.click();
    expect(onSelect).not.toHaveBeenCalled();
    expect(parent.querySelector('.list-notice')!.textContent).toBe('前のお題をクリアすると遊べます');
    s1.click();
    expect(onSelect).toHaveBeenCalledWith('s1');
  });

  it('クリール立てで同じお題をクリアしていれば、補足に「クリール立て済み」が出る (遊べるかには関係しない)', () => {
    const { parent } = mountList({}, { 'puzzle:s1': 2, 'puzzle:s3': 1 });
    const s1meta = parent.querySelector('[data-testid="winding-puzzle-s1"] .list-row__meta')!.textContent!;
    expect(s1meta).toContain('帯 3本');
    expect(s1meta).toContain('クリール立て済み');
    const s2meta = parent.querySelector('[data-testid="winding-puzzle-s2"] .list-row__meta')!.textContent!;
    expect(s2meta).toBe('帯 4本'); // クリール立てで未クリアなら付かない
  });
});
