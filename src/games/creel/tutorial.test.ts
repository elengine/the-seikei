import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { creelTutorial } from './tutorial';

/** クリール立ての遊び方 (T1-20) */
describe('creel tutorial (T1-20)', () => {
  it('4ページで、4ページ目の文に「ヒント」と「確認する」が含まれる', () => {
    expect(creelTutorial.pages).toHaveLength(4);
    const last = creelTutorial.pages[3]!;
    expect(last.text).toContain('ヒント');
    expect(last.text).toContain('確認する');
    // 星の決まり (starsOf: ヒントを1回でも使うと星1) と食い違わない
    expect(last.text).toContain('星は1つ');
  });

  it('2ページ目の文は {{spindle}} と {{cone}} を含む (表示側で呼び名に置き換える)', () => {
    const second = creelTutorial.pages[1]!;
    expect(second.text).toContain('{{spindle}}');
    expect(second.text).toContain('{{cone}}');
  });

  it("tutorial.ts に '#' で始まる色の値が無い (tokens の COLORS を使う)", () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), 'tutorial.ts');
    const src = readFileSync(path, 'utf-8');
    const matches = src.match(/['"]#[0-9A-Fa-f]{3,8}['"]/g) ?? [];
    expect(matches, `直書きの色: ${matches.join(', ')}`).toHaveLength(0);
    // sans-serif の直書きも無い (FONT_FAMILY を使う)
    expect(src).not.toContain('sans-serif');
  });
});
