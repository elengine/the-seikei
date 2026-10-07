import { describe, it, expect, vi, afterEach } from 'vitest';
import { createListView } from './listView';
import { getContent } from '../../core/content/content';
import type { Records } from '../../core/game/records';

/** beaming と creel の成績を別々に返す Records */
function recordsWith(beamingBest: Record<string, number>): Records {
  return {
    get: (gameId: string) =>
      gameId === 'creel'
        ? { bestStars: 0, plays: 0, best: {} }
        : { bestStars: 0, plays: 0, best: beamingBest },
  } as unknown as Records;
}

function mountList(
  beamingBest: Record<string, number>,
): { parent: HTMLElement; onSelect: ReturnType<typeof vi.fn> } {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const onSelect = vi.fn();
  createListView(parent, { records: recordsWith(beamingBest), onSelect, onExit: () => undefined });
  return { parent, onSelect };
}

afterEach(() => {
  document.body.textContent = '';
});

describe('ビーム巻きの一覧 T3-03b (お題15題・レベルごとの節)', () => {
  it('節は「レベル1」〜「レベル3」の3つで、行はお題15行。補足は「巻き幅 60cm・帯 3本」', () => {
    const { parent } = mountList({});
    const headings = Array.from(parent.querySelectorAll('.section-heading')).map((h) => h.textContent);
    expect(headings).toEqual(['レベル1', 'レベル2', 'レベル3']);
    const rows = Array.from(parent.querySelectorAll('.list-row'));
    expect(rows).toHaveLength(getContent().creelPuzzles.length);
    const s1 = parent.querySelector('[data-testid="beaming-puzzle-s1"]')!;
    expect(s1.querySelector('.list-row__meta')!.textContent).toContain('巻き幅 60cm');
    expect(s1.querySelector('.list-row__meta')!.textContent).toContain('帯 3本');
  });

  it('記録が無いと最初のお題だけ押せる (次はこれ)。星があるとその先も押せる。鍵の行は押すと理由', () => {
    const { parent, onSelect } = mountList({});
    const ids = getContent().creelPuzzles.map((c) => c.id);
    const rows = (): HTMLButtonElement[] =>
      Array.from(parent.querySelectorAll<HTMLButtonElement>('button[data-testid^="beaming-puzzle-"]'));
    expect(rows()[0]!.disabled).toBe(false);
    expect(rows()[1]!.classList.contains('list-row--locked')).toBe(true);
    rows()[1]!.click();
    expect(onSelect).not.toHaveBeenCalled(); // 鍵の行は選べない
    parent.textContent = '';
    const { parent: p2, onSelect: select2 } = mountList({ [`puzzle:${ids[0]}`]: 3, [`puzzle:${ids[1]}`]: 3 });
    const rows2 = (): HTMLButtonElement[] =>
      Array.from(p2.querySelectorAll<HTMLButtonElement>('button[data-testid^="beaming-puzzle-"]'));
    expect(rows2()[0]!.textContent).toContain('★');
    expect(rows2()[1]!.disabled).toBe(false);
    rows2()[2]!.click();
    expect(select2).toHaveBeenCalledWith(ids[2]);
  });

  it('遊び方のボタンがある (onTutorial を渡したとき)', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onTutorial = vi.fn();
    createListView(parent, {
      records: recordsWith({}),
      onSelect: () => undefined,
      onExit: () => undefined,
      onTutorial,
    });
    const btn = parent.querySelector<HTMLButtonElement>('[data-testid="beaming-list-tutorial"]');
    expect(btn).toBeDefined();
    btn!.click();
    expect(onTutorial).toHaveBeenCalled();
  });
});

describe('PU-18 すべてのお題を開ける (unlockAll)', () => {
  function mountU(unlockAll: boolean | undefined, best: Record<string, number> = {}): { host: HTMLElement; onSelect: ReturnType<typeof vi.fn> } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onSelect = vi.fn();
    createListView(host, {
      records: { get: () => ({ bestStars: 0, plays: 0, best }) } as unknown as Records,
      onSelect,
      onExit: () => undefined,
      unlockAll,
    });
    return { host, onSelect };
  }

  it('false (または指定なし) なら今のまま: 最初の未クリアが「次はこれ」、その先は鍵', () => {
    for (const u of [false, undefined]) {
      const { host } = mountU(u);
      const rows = Array.from(host.querySelectorAll('.list-row'));
      expect(rows[0]!.classList.contains('list-row--next'), 'u=' + String(u)).toBe(true);
      expect(rows.slice(1).every((r) => r.classList.contains('list-row--locked'))).toBe(true);
    }
  });

  it('true なら鍵の行が無く、どの行を押しても onSelect が呼ばれる。星を取ったお題の星はそのまま', () => {
    const first = Array.from(mountU(false).host.querySelectorAll('.list-row'))[0]!;
    expect(first).toBeDefined();
    const { host, onSelect } = mountU(true);
    const rows = Array.from(host.querySelectorAll<HTMLElement>('.list-row'));
    expect(rows.length).toBeGreaterThan(3);
    expect(host.querySelector('.list-row--locked')).toBeNull();
    expect(host.querySelector('.list-row__status svg[class*="lock"], .lock-icon')).toBeNull();
    for (const r of rows) r.click();
    expect(onSelect).toHaveBeenCalledTimes(rows.length);
  });
});
