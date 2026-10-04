import { describe, it, expect } from 'vitest';
import { createListView } from './listView';
import type { Records } from '../../core/game/records';

/**
 * 糸割りのお題一覧のテスト (P2b T2b-04)。ほかのゲームと同じ形 (レベルごとの節・15題・星・次はこれ・鍵)。
 * 節の見出しの下に場面の名前 (レベル1〜2「チーズを分ける」・レベル3〜5「足りないコーンを作る」)。
 */

function fakeRecords(best: Record<string, number>): Records {
  return { get: () => ({ best }) } as unknown as Records;
}

function mount(best: Record<string, number> = {}): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  createListView(host, {
    records: fakeRecords(best),
    onSelect: () => undefined,
    onExit: () => undefined,
  });
  return host;
}

describe('糸割り listView T2b-04 (お題一覧)', () => {
  it('1. 15題が5つの節 (レベル1〜5) に並ぶ。題名は「糸割り」', () => {
    const host = mount();
    expect(host.querySelectorAll('.list-section')).toHaveLength(5);
    const heads = Array.from(host.querySelectorAll('.section-heading')).map((h) => h.textContent);
    expect(heads).toEqual(['レベル1', 'レベル2', 'レベル3', 'レベル4', 'レベル5']);
    expect(host.querySelectorAll('.list-row')).toHaveLength(15);
    expect(host.querySelector('.screen-header__title')?.textContent).toBe('糸割り');
  });

  it('2. 節の見出しの下に場面の名前 (レベル1〜2「チーズを分ける」・レベル3〜5「足りないコーンを作る」)', () => {
    const host = mount();
    const scenes = Array.from(host.querySelectorAll('.list-section')).map((s) => s.querySelector('.itowari-list__scene')?.textContent);
    expect(scenes).toEqual(['チーズを分ける', 'チーズを分ける', '足りないコーンを作る', '足りないコーンを作る', '足りないコーンを作る']);
  });

  it('3. 行の補足: split は「チーズ 6 個 → 12 本」、refill は「残り 6 本 → 8 本・あと 1,200m」', () => {
    const host = mount();
    const s1 = host.querySelector('[data-testid="itowari-puzzle-s1"]')!;
    expect(s1.querySelector('.list-row__meta')!.textContent).toBe('チーズ 6 個 → 12 本');
    const s3 = host.querySelector('[data-testid="itowari-puzzle-s3"]')!;
    expect(s3.querySelector('.list-row__meta')!.textContent).toBe('残り 6 本 → 8 本・あと 1,200m');
  });

  it('4. クリアしたお題は星・最初の未クリアは「次はこれ」・その先は鍵', () => {
    const host = mount({ 'puzzle:s1': 3, 'puzzle:s1-2': 2 });
    const s1 = host.querySelector('[data-testid="itowari-puzzle-s1"]')!;
    expect(s1.querySelector('.list-row__status .stars')).not.toBeNull();
    const s12 = host.querySelector('[data-testid="itowari-puzzle-s1-2"]')!;
    expect(s12.querySelector('.list-row__status .stars')).not.toBeNull();
    const s13 = host.querySelector('[data-testid="itowari-puzzle-s1-3"]')!;
    expect(s13.classList.contains('list-row--next')).toBe(true);
    const s2 = host.querySelector('[data-testid="itowari-puzzle-s2"]')!;
    expect(s2.classList.contains('list-row--locked')).toBe(true);
    // 15行のうち、押せるのは s1・s1-2・s1-3 (クリア2 + 次はこれ) だけで、あとは鍵
    const locked = Array.from(host.querySelectorAll('.list-row--locked'));
    expect(locked).toHaveLength(12);
  });
});
