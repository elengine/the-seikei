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
