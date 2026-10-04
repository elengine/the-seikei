import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLORS, FONT, FONT_FAMILY, FONT_FAMILY_HEADING, RADIUS, SIZE, SPACE } from './tokens';

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
  for (const dm of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
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
    const kebab = (name: string): string => `--c-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    const varName = Object.fromEntries(Object.keys(COLORS).map((k) => [k, kebab(k)])) as Record<
      keyof typeof COLORS,
      string
    >;
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

  it("FONT の値が :root[data-font='N'] の --fs-* と一致する (段階 2〜5)", () => {
    for (const n of [2, 3, 4, 5] as const) {
      const v = cssVars(`:root[data-font='${n}']`);
      expect(v.get('--fs-body'), `段階${n}`).toBe(`${FONT[n].body}px`);
      expect(v.get('--fs-button')).toBe(`${FONT[n].button}px`);
      expect(v.get('--fs-label')).toBe(`${FONT[n].label}px`);
      expect(v.get('--fs-heading')).toBe(`${FONT[n].heading}px`);
      expect(v.get('--fs-number')).toBe(`${FONT[n].number}px`);
    }
  });

  it('既定 (段階1) の --fs-* は FONT[1] と一致する', () => {
    const root = cssVars(':root');
    expect(root.get('--fs-body')).toBe(`${FONT[1].body}px`);
    expect(root.get('--fs-button')).toBe(`${FONT[1].button}px`);
    expect(root.get('--fs-heading')).toBe(`${FONT[1].heading}px`);
    expect(root.get('--fs-number')).toBe(`${FONT[1].number}px`);
  });

  it('PU-08c: 5段階のどれでも本文は 20px 以上。段階が上がると、どの大きさも大きくなる。段階1 と 3 は今の「大」「特大」', () => {
    for (const n of [1, 2, 3, 4, 5] as const) {
      expect(FONT[n].body).toBeGreaterThanOrEqual(20);
    }
    for (const key of ['body', 'button', 'label', 'heading', 'number'] as const) {
      for (const n of [1, 2, 3, 4] as const) {
        expect(FONT[(n + 1) as 2 | 3 | 4 | 5][key], `${key} 段階${n + 1}`).toBeGreaterThan(FONT[n][key]);
      }
    }
    expect(FONT[1]).toEqual({ body: 20, button: 22, label: 24, heading: 28, number: 32 });
    expect(FONT[3]).toEqual({ body: 24, button: 26, label: 28, heading: 34, number: 38 });
    expect(FONT[5]).toEqual({ body: 28, button: 30, label: 32, heading: 40, number: 44 });
  });

  it('PU-08c: 題名・星・結果の見出し・アプリ名の大きさも、段階 1〜5 の変数がある', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
    for (const n of [2, 3, 4, 5]) {
      expect(css, `:root[data-font='${n}']`).toContain(`:root[data-font='${n}']`);
      expect(css).toContain(`:root[data-font='${n}'] .home`);
    }
    expect(css).not.toContain("data-font='xlarge'");
    expect(css).toContain('--fs-title: 32px;');
    expect(css).toContain('--fs-title: 44px;');
    expect(cssVars(":root[data-font='5']").get('--fs-body')).toBe('28px');
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
  it('FONT[1].label = 24, FONT[3].label = 28', () => {
    expect(FONT[1].label).toBe(24);
    expect(FONT[3].label).toBe(28);
  });

  it("--fs-label が FONT[1].label と、:root[data-font='3'] の FONT[3].label と一致する", () => {
    const root = cssVars(':root');
    const v3 = cssVars(":root[data-font='3']");
    expect(root.get('--fs-label')).toBe(`${FONT[1].label}px`);
    expect(v3.get('--fs-label')).toBe(`${FONT[3].label}px`);
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

describe('T2-08 追加修正2 (メーターの帯の box-sizing)', () => {
  it('.meter__band は box-sizing: border-box (枠線を含めて幅 100%)', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf8');
    const m = css.match(/\.meter__band\s*\{[^}]*\}/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain('box-sizing: border-box');
  });
});

describe('PU-01a: 色・余白・角・上端の縞', () => {
  function cssText(): string {
    return readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
  }

  it('07 の 2 節の色 (ai・sumiSub・wood・shu と新しい色)', () => {
    expect(COLORS.ai).toBe('#1F3A5F');
    expect(COLORS.sumiSub).toBe('#4A473F');
    expect(COLORS.wood).toBe('#8A5A3B');
    expect(COLORS.shu).toBe('#A33A22');
    expect(COLORS.kinariDeep).toBe('#EFE9DA');
    expect(COLORS.muted).toBe('#6B675C');
    expect(COLORS.post).toBe('#6E8A5E');
  });

  it('kebab 名の変数が :root に全部ある (kinariDeep → --c-kinari-deep)', () => {
    const root = cssVars(':root');
    expect(root.get('--c-kinari-deep')).toBeDefined();
    expect(root.get('--c-ai-pressed')).toBeDefined();
    expect(root.get('--c-lock-border')).toBeDefined();
  });

  it('SPACE と --sp-1〜--sp-8 が一致する', () => {
    expect(SPACE).toEqual([4, 8, 12, 16, 20, 24, 32, 48]);
    const root = cssVars(':root');
    SPACE.forEach((v, i) => {
      expect(root.get(`--sp-${i + 1}`)).toBe(`${v}px`);
    });
  });

  it('RADIUS と --r-* が一致する', () => {
    expect(RADIUS).toEqual({ small: 8, button: 12, card: 14, dialog: 16 });
    const root = cssVars(':root');
    for (const [k, v] of Object.entries(RADIUS)) {
      expect(root.get(`--r-${k}`)).toBe(`${v}px`);
    }
  });

  it('--page-pad は 48px、899px 以下で 32px、599px 以下で 16px', () => {
    expect(cssVars(':root').get('--page-pad')).toBe('48px');
    const css = cssText();
    expect(css).toMatch(/@media \(max-width: 899px\)\s*\{\s*:root\s*\{[^}]*--page-pad:\s*32px/);
    expect(css).toMatch(/@media \(max-width: 599px\)\s*\{[\s\S]*?--page-pad:\s*16px/);
  });

  it('--stripe-top は repeating-linear-gradient (藍 14・地 4・藍 4・地 8)', () => {
    const v = cssVars(':root').get('--stripe-top');
    expect(v).toBeDefined();
    expect(v).toContain('repeating-linear-gradient');
    expect(v).toContain('var(--c-ai) 0 14px');
    expect(v).toContain('var(--c-kinari) 14px 18px');
    expect(v).toContain('var(--c-ai) 18px 22px');
    expect(v).toContain('var(--c-kinari) 22px 30px');
  });

  describe('文字と地の明るさの比 4.5 以上', () => {
    const lum = (hex: string): number => {
      const ch = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
    };
    const ratio = (a: string, b: string): number => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    it.each(['sumi', 'sumiSub', 'muted', 'ai'] as const)('%s は kinari と white の上で 4.5 以上', (name) => {
      expect(ratio(COLORS[name], COLORS.kinari)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(COLORS[name], COLORS.white)).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe('PU-01b: 書体の埋め込み', () => {
  function cssText(): string {
    return readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/base.css'), 'utf-8');
  }

  it('--font-family と --font-family-heading が tokens と一致する', () => {
    const root = cssVars(':root');
    expect(root.get('--font-family')).toBe(FONT_FAMILY);
    expect(root.get('--font-family-heading')).toBe(FONT_FAMILY_HEADING);
  });

  it('FONT_FAMILY は BIZ UDPGothic、FONT_FAMILY_HEADING は Shippori Mincho が先頭', () => {
    expect(FONT_FAMILY.startsWith('"BIZ UDPGothic"')).toBe(true);
    expect(FONT_FAMILY_HEADING.startsWith('"Shippori Mincho"')).toBe(true);
  });

  it('base.css に 3 つの @font-face があり、すべて font-display: swap', () => {
    const faces = cssText().match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(faces).toHaveLength(3);
    for (const f of faces) {
      expect(f).toContain('font-display: swap');
      expect(f).toMatch(/url\(['"]?[^)]*\.woff2['"]?\)/);
    }
    const text = faces.join(' ');
    expect(text).toContain('Shippori Mincho');
    expect(text).toContain('BIZ UDPGothic');
    expect(text).toContain('ShipporiMincho-Bold.woff2');
    expect(text).toContain('BIZUDPGothic-Regular.woff2');
    expect(text).toContain('BIZUDPGothic-Bold.woff2');
  });

  it('@font-face は base.css の先頭にある', () => {
    expect(cssText().trimStart().startsWith('@font-face')).toBe(true);
  });
});

describe('PU-06a: メッセージ欄の地の色', () => {
  it('COLORS.messageBg は 07 の値 (#F3F0E6)。base.css の --c-message-bg と一致する (全色の一致のテストが見る)', () => {
    expect(COLORS.messageBg).toBe('#F3F0E6');
    expect(cssVars(':root').get('--c-message-bg')).toBeDefined();
  });
});

describe('PU-11a: 段ボールの色', () => {
  it('cardboard #C9A272・cardboardDark #A9814F・cardboardTape #D9BE96', () => {
    expect(COLORS.cardboard).toBe('#C9A272');
    expect(COLORS.cardboardDark).toBe('#A9814F');
    expect(COLORS.cardboardTape).toBe('#D9BE96');
  });
});

describe('PU-14b: ランプの色', () => {
  it('lampOk (緑)・lampWarn (オレンジ)・lampBreak (赤)', () => {
    expect(COLORS.lampOk).toBe('#2F8F4E');
    expect(COLORS.lampWarn).toBe('#E8871E');
    expect(COLORS.lampBreak).toBe('#C62828');
  });
});

describe('PU-15a: ビームの円盤の色', () => {
  it('flange (暗い金属)・flangeHole (穴)', () => {
    expect(COLORS.flange).toBe('#3F444A');
    expect(COLORS.flangeHole).toBe('#1C1F23');
  });
});
