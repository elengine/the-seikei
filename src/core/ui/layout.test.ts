import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCard,
  createListRow,
  createPage,
  createScreenHeader,
  createSectionHeading,
  createStars,
} from './layout';

function baseCss(): string {
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
}

/** セレクタの宣言ブロック (無ければ空文字) */
function blockOf(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseCss().match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('createScreenHeader', () => {
  it('onBack があると左に「戻る」(icon 付き)。押すと onBack が呼ばれる', () => {
    const onBack = vi.fn();
    const h = createScreenHeader({ title: '設定', onBack });
    const left = h.querySelector<HTMLElement>('.screen-header__left')!;
    const btn = left.querySelector('button')!;
    expect(btn.textContent).toBe('戻る');
    expect(btn.querySelector('svg')).not.toBeNull();
    btn.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('onBack が無ければ左の枠は空。右の枠は right が無くても存在する', () => {
    const h = createScreenHeader({ title: '設定' });
    expect(h.querySelector('.screen-header__left')!.children).toHaveLength(0);
    const right = h.querySelector('.screen-header__right');
    expect(right).not.toBeNull();
    expect(right!.children).toHaveLength(0);
  });

  it('right を渡すと右の枠に入る', () => {
    const extra = document.createElement('button');
    const h = createScreenHeader({ title: '設定', right: extra });
    expect(h.querySelector('.screen-header__right')!.firstElementChild).toBe(extra);
  });

  it('題名は見出し用の書体のクラス。subtitle があれば題名の下に出る', () => {
    const h = createScreenHeader({ title: 'ドラム巻き', subtitle: '段階2 紺地のピンストライプ' });
    const title = h.querySelector<HTMLElement>('.screen-header__title')!;
    expect(title.textContent).toBe('ドラム巻き');
    expect(title.classList.contains('font-heading')).toBe(true);
    const sub = h.querySelector<HTMLElement>('.screen-header__subtitle')!;
    expect(sub.textContent).toBe('段階2 紺地のピンストライプ');
    expect(createScreenHeader({ title: 'a' }).querySelector('.screen-header__subtitle')).toBeNull();
  });

  it('上端の縞の要素がある', () => {
    const h = createScreenHeader({ title: 'a' });
    expect(h.querySelector('.stripe-top')).not.toBeNull();
  });
});

describe('createPage / createCard / createSectionHeading', () => {
  it('createPage は幅の種類のクラスが付く', () => {
    expect(createPage({ width: 'form' }).classList.contains('page--form')).toBe(true);
    expect(createPage({ width: 'list' }).classList.contains('page--list')).toBe(true);
    expect(createPage({ width: 'full' }).classList.contains('page--full')).toBe(true);
  });

  it('createCard は .card', () => {
    expect(createCard().classList.contains('card')).toBe(true);
  });

  it('createSectionHeading は文字と、underline のときだけ下線のクラス', () => {
    const h = createSectionHeading('段階1');
    expect(h.textContent).toBe('段階1');
    expect(h.classList.contains('section-heading')).toBe(true);
    expect(h.classList.contains('section-heading--underline')).toBe(false);
    expect(createSectionHeading('段階1', { underline: true }).classList.contains('section-heading--underline')).toBe(true);
  });
});

describe('createStars', () => {
  it('aria-label が「星n」で、取った数だけ .stars__on', () => {
    for (const n of [0, 1, 2, 3] as const) {
      const s = createStars(n, 'list');
      expect(s.getAttribute('aria-label')).toBe(`星${n}`);
      expect(s.querySelectorAll('.stars__on')).toHaveLength(n);
      expect(s.querySelectorAll('.stars__off')).toHaveLength(3 - n);
    }
  });

  it('大きさのクラス (list / result)', () => {
    expect(createStars(1, 'list').classList.contains('stars--list')).toBe(true);
    expect(createStars(1, 'result').classList.contains('stars--result')).toBe(true);
  });
});

describe('createListRow', () => {
  it('stars: 名前・補足・星が出て、押すと onClick', () => {
    const onClick = vi.fn();
    const row = createListRow({ name: '無地', meta: '1段×6本', status: { kind: 'stars', stars: 2 }, onClick });
    expect(row.tagName).toBe('BUTTON');
    expect(row.classList.contains('list-row')).toBe(true);
    expect(row.querySelector('.list-row__name')!.textContent).toBe('無地');
    expect(row.querySelector('.list-row__meta')!.textContent).toBe('1段×6本');
    expect(row.querySelector('.stars')!.getAttribute('aria-label')).toBe('星2');
    row.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('swatch は左の枠に入る。meta が無ければ補足の要素は出ない', () => {
    const swatch = document.createElement('span');
    const row = createListRow({ name: 'a', swatch, status: { kind: 'stars', stars: 0 }, onClick: () => {} });
    expect(row.querySelector('.list-row__swatch')!.firstElementChild).toBe(swatch);
    expect(row.querySelector('.list-row__meta')).toBeNull();
  });

  it('next: .list-row--next と「次はこれ」', () => {
    const row = createListRow({ name: 'a', status: { kind: 'next' }, onClick: () => {} });
    expect(row.classList.contains('list-row--next')).toBe(true);
    expect(row.querySelector('.list-row__status')!.textContent).toContain('次はこれ');
  });

  it('locked: .list-row--locked と鍵のアイコン。押すと onLocked(reason) で onClick は呼ばれない', () => {
    const onClick = vi.fn();
    const onLocked = vi.fn();
    const row = createListRow({
      name: 'a',
      status: { kind: 'locked', reason: '前のお題をクリアすると遊べます' },
      onClick,
      onLocked,
    });
    expect(row.classList.contains('list-row--locked')).toBe(true);
    expect(row.querySelector('.list-row__lock')).not.toBeNull();
    expect(row.hasAttribute('disabled')).toBe(false);
    expect(row.dataset.reason).toBe('前のお題をクリアすると遊べます');
    row.click();
    expect(onLocked).toHaveBeenCalledWith('前のお題をクリアすると遊べます');
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('base.css (PU-02a)', () => {
  it('.screen-header は 180px / 中央 / 180px の格子、600px 未満は 120px', () => {
    expect(blockOf('.screen-header')).toContain('grid-template-columns: 180px minmax(0, 1fr) 180px');
    const m = baseCss().match(/@media \(max-width: 599px\)\s*\{\s*\.screen-header\s*\{([^}]*)\}/);
    expect(m, '600px 未満の .screen-header').not.toBeNull();
    expect(m![1]).toContain('grid-template-columns: 120px minmax(0, 1fr) 120px');
  });

  it('新しい節の CSS は数値を直書きせず変数を使う (色の16進が無い)', () => {
    const css = baseCss();
    const start = css.indexOf('/* ---- 共通部品 (PU-02) ---- */');
    expect(start).toBeGreaterThan(-1);
    expect(css.slice(start)).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  it('.list-row は高さ 72px、.page--form は幅 820px', () => {
    expect(blockOf('.list-row')).toContain('min-height: 72px');
    expect(blockOf('.page--form')).toContain('820px');
  });
});
