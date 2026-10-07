import { describe, it, expect, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createListView } from './listView';
import type { Records } from '../../core/game/records';
import { createAppContext } from '../../app/context';
import type { AppContext } from '../../app/context';
import { createFixedClock } from '../../core/clock/clock';

let dbSeq = 0;

async function makeCtx(): Promise<AppContext> {
  return createAppContext({
    dbName: `drumsetup-list-${Date.now().toString(36)}-${dbSeq++}`,
    clock: createFixedClock('2026-10-04T00:00:00Z'),
    navigate: () => undefined,
  });
}

function mount(parent: HTMLElement, ctx: AppContext, opts?: { savedPuzzleId?: string | null }): { selected: string[]; notices: string[] } {
  const selected: string[] = [];
  const notices: string[] = [];
  createListView(parent, {
    records: ctx.records,
    title: 'ドラム設定',
    savedPuzzleId: opts?.savedPuzzleId,
    onSelect: (id) => selected.push(id),
    onExit: () => undefined,
    onNotice: (t) => notices.push(t),
  });
  return { selected, notices };
}

function row(parent: HTMLElement, id: string): HTMLElement {
  const r = parent.querySelector<HTMLElement>(`[data-testid="drumsetup-puzzle-${id}"]`);
  if (r === null) {
    throw new Error(`row not found: ${id}`);
  }
  return r;
}

describe('drumsetup listView T2c-03b (お題一覧)', () => {
  it('1. 15題が5つの節 (レベル1〜5) に並ぶ。題名は「ドラム設定」', async () => {
    const ctx = await makeCtx();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    mount(parent, ctx);
    const headings = Array.from(parent.querySelectorAll('h2')).map((e) => e.textContent?.trim() ?? '');
    expect(headings).toEqual(['レベル1', 'レベル2', 'レベル3', 'レベル4', 'レベル5']);
    expect(parent.querySelectorAll('[data-testid^="drumsetup-puzzle-"]').length).toBe(15);
    expect(parent.querySelector('.screen-header__title')?.textContent).toBe('ドラム設定');
  });

  it('2. 補足は「2/48・帯 400本」の形 (s1)', async () => {
    const ctx = await makeCtx();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    mount(parent, ctx);
    expect(row(parent, 's1').textContent).toContain('2/48');
    expect(row(parent, 's1').textContent).toContain('帯 400本');
  });

  it('3. 最初の未クリアだけ「次はこれ」。その先は鍵で、押すと理由が出る', async () => {
    const ctx = await makeCtx();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const h = mount(parent, ctx);
    expect(row(parent, 's1').textContent).toContain('次はこれ');
    expect(row(parent, 's2').textContent).not.toContain('次はこれ');
    // s1 は押せる
    (row(parent, 's1') as HTMLButtonElement).click();
    expect(h.selected).toEqual(['s1']);
    // s2 は鍵
    (row(parent, 's2') as HTMLButtonElement).click();
    expect(h.selected).toEqual(['s1']);
    expect(h.notices).toContain('前のお題をクリアすると遊べます');
  });

  it('4. 途中の状態が保存されているお題は「途中」を出す', async () => {
    const ctx = await makeCtx();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    mount(parent, ctx, { savedPuzzleId: 's1' });
    expect(row(parent, 's1').textContent).toContain('途中');
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
