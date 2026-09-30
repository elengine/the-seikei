import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLORS, FONT, FONT_FAMILY, SIZE } from './tokens';

/** base.css を読み、指定セレクタの宣言ブロックから CSS 変数を取り出す */
function cssVars(selector: string): Map<string, string> {
  const path = join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css');
  const css = readFileSync(path, 'utf-8');
  const vars = new Map<string, string>();
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  if (m === null) {
    throw new Error(`selector not found: ${selector}`);
  }
  const block = m[1];
  if (block === undefined) {
    throw new Error(`empty block for selector: ${selector}`);
  }
  for (const dm of block.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) {
    vars.set(dm[1]!, dm[2]!.trim());
  }
  return vars;
}

function norm(hex: string): string {
  return hex.trim().toLowerCase();
}

describe('tokens と base.css の CSS 変数の一致', () => {
  it('COLORS の全色が :root の --c-* 変数と一致する (16進の大小文字は無視)', () => {
    const root = cssVars(':root');
    const varName: Record<keyof typeof COLORS, string> = {
      kinari: '--c-kinari',
      sumi: '--c-sumi',
      sumiSub: '--c-sumi-sub',
      machineDark: '--c-machine-dark',
      machine: '--c-machine',
      machineLight: '--c-machine-light',
      wood: '--c-wood',
      steel: '--c-steel',
      shu: '--c-shu',
      ai: '--c-ai',
      white: '--c-white',
    };
    for (const [key, cssVar] of Object.entries(varName) as Array<[keyof typeof COLORS, string]>) {
      const cssValue = root.get(cssVar);
      expect(cssValue, `${cssVar} is missing in base.css :root`).toBeDefined();
      expect(norm(cssValue!)).toBe(norm(COLORS[key]));
    }
  });

  it('SIZE の値が :root の --gap/--radius/--btn-min-h/--btn-min-w と一致する', () => {
    const root = cssVars(':root');
    expect(root.get('--gap')).toBe(`${SIZE.gap}px`);
    expect(root.get('--radius')).toBe(`${SIZE.radius}px`);
    expect(root.get('--btn-min-h')).toBe(`${SIZE.buttonMinH}px`);
    expect(root.get('--btn-min-w')).toBe(`${SIZE.buttonMinW}px`);
  });

  it("FONT の値が :root[data-font='xlarge'] の --fs-* と一致する", () => {
    const xl = cssVars(":root[data-font='xlarge']");
    expect(xl.get('--fs-body')).toBe(`${FONT.xlarge.body}px`);
    expect(xl.get('--fs-button')).toBe(`${FONT.xlarge.button}px`);
    expect(xl.get('--fs-heading')).toBe(`${FONT.xlarge.heading}px`);
    expect(xl.get('--fs-number')).toBe(`${FONT.xlarge.number}px`);
  });

  it('既定 (大) の --fs-* は FONT.large と一致する', () => {
    const root = cssVars(':root');
    expect(root.get('--fs-body')).toBe(`${FONT.large.body}px`);
    expect(root.get('--fs-button')).toBe(`${FONT.large.button}px`);
    expect(root.get('--fs-heading')).toBe(`${FONT.large.heading}px`);
    expect(root.get('--fs-number')).toBe(`${FONT.large.number}px`);
  });
});

describe('T1-12a: 文字の大きさの指定が無い所 (結果の表示・チュートリアル)', () => {
  function cssText(): string {
    const path = join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css');
    return readFileSync(path, 'utf-8');
  }

  function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function hasDeclaration(selector: string, prop: string, valuePart: string): boolean {
    const css = cssText();
    const re = new RegExp(`${escapeRe(selector)}\\s*\\{([^}]*)\\}`);
    const m = css.match(re);
    if (m === null) {
      return false;
    }
    const block = m[1]!;
    return new RegExp(`${prop}\\s*:\\s*[^;]*${escapeRe(valuePart)}`).test(block);
  }

  it('body の宣言に font-size: var(--fs-body) がある', () => {
    expect(hasDeclaration('body', 'font-size', 'var(--fs-body)')).toBe(true);
  });

  it.each([
    '.result__praise',
    '.result-stars',
    '.result__lines',
    '.result-patterns',
    '.tutorial__text',
    '.tutorial__counter',
  ])('%s の宣言があり、font-size に var(--fs- を含む', (selector) => {
    const css = cssText();
    const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
    const m = css.match(re);
    expect(m, `selector not found: ${selector}`).not.toBeNull();
    expect(m![1]).toMatch(/font-size\s*:\s*(calc\()?\s*var\(--fs-/);
  });
});

describe('T1-11a: iPad (Safari) への備え (文字と見た目)', () => {
  function cssText(): string {
    const path = join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css');
    return readFileSync(path, 'utf-8');
  }

  it(':root の --font-family が FONT_FAMILY と同じ', () => {
    const root = cssVars(':root');
    expect(root.get('--font-family')).toBe(FONT_FAMILY);
  });

  it('html, body の宣言に font-family: var(--font-family) がある', () => {
    const css = cssText();
    const m = css.match(/html,\s*body\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/font-family\s*:\s*var\(--font-family\)/);
  });

  it.each([
    ['-webkit-text-size-adjust: 100%', 'text-size-adjust の指定'],
    ['text-size-adjust: 100%', 'text-size-adjust の指定'],
    ['line-height: 1.4', 'line-height の指定'],
    ['-webkit-tap-highlight-color: transparent', 'tap-highlight-color の指定'],
  ])('html, body に %s がある', (decl) => {
    const css = cssText();
    const m = css.match(/html,\s*body\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain(decl);
  });

  it('button に -webkit-appearance: none と appearance: none がある', () => {
    const css = cssText();
    const m = css.match(/^button\s*\{([^}]*)\}/m);
    expect(m, 'button rule not found').not.toBeNull();
    expect(m![1]).toContain('-webkit-appearance: none');
    expect(m![1]).toContain('appearance: none');
  });
});

describe('T1-17: 設定画面・ホーム画面の文字の大きさと配置', () => {
  it('FONT.large.label = 24, FONT.xlarge.label = 28', () => {
    expect(FONT.large.label).toBe(24);
    expect(FONT.xlarge.label).toBe(28);
  });

  it('--fs-label が FONT.large.label・FONT.xlarge.label と一致する', () => {
    const root = cssVars(':root');
    const xl = cssVars(":root[data-font='xlarge']");
    expect(root.get('--fs-label')).toBe(`${FONT.large.label}px`);
    expect(xl.get('--fs-label')).toBe(`${FONT.xlarge.label}px`);
  });

  it('.settings__label は font-size: var(--fs-label) で太字', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const m = css.match(/\.settings__label\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('font-size: var(--fs-label)');
    expect(m![1]).toContain('font-weight: 700');
  });

  it('.home__greeting の font-size が var(--fs-label)', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const m = css.match(/\.home__greeting\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('font-size: var(--fs-label)');
  });

  it('.settings__admin-btn の min-height が var(--btn-min-h)', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const m = css.match(/\.settings__admin-btn\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('min-height: var(--btn-min-h)');
  });
});

describe('T1-18: 細い画面での設定画面の2段表示', () => {
  it('@media (max-width: 599px) の中に .settings__row と .settings__label の規則がある', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const m = css.match(/@media \(max-width: 599px\)\s*\{([\s\S]*?)\n\}/);
    expect(m, 'media query not found').not.toBeNull();
    const block = m![1]!;
    expect(block).toContain('.settings__row');
    expect(block).toContain('.settings__label');
    expect(block).toContain('grid-column: 1 / -1');
  });

  it('.settings__value は overflow-wrap: break-word (anywhere ではない)', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const m = css.match(/\.settings__value\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('overflow-wrap: break-word');
    expect(m![1]).not.toContain('overflow-wrap: anywhere');
  });
});

describe('T1-19: 設定画面の今の値の大きさ', () => {
  it('.settings__value は var(--fs-label) の濃い色。空のときは薄い色のクラス', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    const m = css.match(/\.settings__value\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('font-size: var(--fs-label)');
    expect(m![1]).toContain('color: var(--c-sumi)');
    // 空のときのクラス
    const m2 = css.match(/\.settings__value--empty\s*\{([^}]*)\}/);
    expect(m2, 'empty class rule').not.toBeNull();
    expect(m2![1]).toContain('color: var(--c-sumi-sub)');
  });
});

describe('T2-08 追加修正b: 操作欄のあふれとメーターの幅', () => {
  function cssText(): string {
    return readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
  }

  /** セレクタの宣言ブロックを返す (無ければ null) */
  function blockOf(selector: string): string | null {
    const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
    return cssText().match(re)?.[1] ?? null;
  }

  it('1. メッセージ欄は横長で position: sticky; top: 0 (スクロールしても隠れない)', () => {
    const block = blockOf('.game-frame__message');
    expect(block).not.toBeNull();
    expect(block!).toMatch(/position:\s*sticky/);
    expect(block!).toMatch(/top:\s*0/);
  });

  it('2. 主ボタンの区画は position: sticky; bottom: 0 (操作欄の下に固定)', () => {
    const block = blockOf('.winding-panel__actions');
    expect(block).not.toBeNull();
    expect(block!).toMatch(/position:\s*sticky/);
    expect(block!).toMatch(/bottom:\s*0/);
  });

  it('3. ペダルの列 (溝+ボタン) は操作欄の幅に合わせて縮む (flex の縮みと最小幅)', () => {
    const row = blockOf('.pedal__row');
    expect(row, 'pedal__row').not.toBeNull();
    expect(row!).toMatch(/min-width:\s*0/);
    const groove = blockOf('.pedal__groove');
    expect(groove!, 'groove の最小幅 120px').toMatch(/min-width:\s*120px/);
    const bar = blockOf('.pedal__bar');
    expect(bar!, '横木は溝より広げない (max-width)').toMatch(/max-width/);
    const btn = blockOf('.pedal__btn');
    expect(btn!, 'ボタンの最小幅 96px').toMatch(/min-width:\s*96px/);
    expect(btn!, '「踏み込む」が折れない').toMatch(/white-space:\s*nowrap/);
  });

  it('4. 張りの状態の文字の欄は固定幅 (一番長い「▲ 強すぎ」に合わせる。width と flex: none)', () => {
    const state = blockOf('.meter__state');
    expect(state).not.toBeNull();
    expect(state!).toMatch(/width:\s*5\.5em/);
    expect(state!).toMatch(/flex:\s*none/);
  });
});
