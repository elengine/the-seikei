import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { createListView } from './listView';
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
  it('1. 15題が5つの節 (段階1〜5) に並ぶ。題名は「ドラム設定」', async () => {
    const ctx = await makeCtx();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    mount(parent, ctx);
    const headings = Array.from(parent.querySelectorAll('h2')).map((e) => e.textContent?.trim() ?? '');
    expect(headings).toEqual(['段階1', '段階2', '段階3', '段階4', '段階5']);
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
