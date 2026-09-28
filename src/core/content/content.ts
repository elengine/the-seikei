import type { ColorId, YarnColor, YarnTypeId, YarnType, Pattern, CreelPuzzle } from '../domain/types';
import colorsJson from '../../content/colors.json';
import yarnsJson from '../../content/yarns.json';
import patternsJson from '../../content/patterns.json';
import creelPuzzlesJson from '../../content/creelPuzzles.json';

export interface Content {
  colors: Map<ColorId, YarnColor>;
  yarns: Map<YarnTypeId, YarnType>;
  patterns: Map<string, Pattern>;
  creelPuzzles: CreelPuzzle[];    // stage の昇順
  problems: string[];             // 読み飛ばした項目の説明(管理者向け)
}

export function loadContent(raw: { colors: unknown; yarns: unknown; patterns: unknown; creelPuzzles: unknown }): Content {
  const problems: string[] = [];
  const colors = new Map<ColorId, YarnColor>();
  const yarns = new Map<YarnTypeId, YarnType>();
  const hinbanOwners = new Map<string, YarnTypeId>(); // 品番 → 先に登録した糸の id (品番は重複させない)

  // ---- colors ----
  if (Array.isArray(raw.colors)) {
    for (const item of raw.colors) {
      const c = readColor(item);
      if (c === null) {
        problems.push(`色を読み飛ばしました (形が正しくありません): ${jsonOf(item)}`);
        continue;
      }
      if (colors.has(c.id)) {
        problems.push(`色 ${c.id} を読み飛ばしました (id が重複)`);
        continue;
      }
      colors.set(c.id, c);
    }
  } else {
    problems.push('colors が配列ではないため、すべて読み飛ばしました');
  }

  // ---- yarns ----
  if (Array.isArray(raw.yarns)) {
    for (const item of raw.yarns) {
      const y = readYarn(item);
      if (y === null) {
        problems.push(`糸を読み飛ばしました (形が正しくありません): ${jsonOf(item)}`);
        continue;
      }
      if (!colors.has(y.color)) {
        problems.push(`糸 ${y.id} を読み飛ばしました (色 ${y.color} が存在しません)`);
        continue;
      }
      if (yarns.has(y.id)) {
        problems.push(`糸 ${y.id} を読み飛ばしました (id が重複)`);
        continue;
      }
      if (hinbanOwners.has(y.hinban)) {
        // 品番で見分けるゲームのため、品番は重複させない。後の方を読み飛ばす
        problems.push(`糸 ${y.id} を読み飛ばしました (品番 ${y.hinban} が糸 ${hinbanOwners.get(y.hinban)} と重複)`);
        continue;
      }
      yarns.set(y.id, y);
      hinbanOwners.set(y.hinban, y.id);
    }
  } else {
    problems.push('yarns が配列ではないため、すべて読み飛ばしました');
  }

  // ---- patterns ----
  const patterns = new Map<string, Pattern>();
  if (Array.isArray(raw.patterns)) {
    for (const item of raw.patterns) {
      const p = readPattern(item);
      if (p === null) {
        problems.push(`柄を読み飛ばしました (形が正しくありません): ${jsonOf(item)}`);
        continue;
      }
      if (patterns.has(p.id)) {
        problems.push(`柄 ${p.id} を読み飛ばしました (id が重複)`);
        continue;
      }
      const bad = p.plan.find((run) => !yarns.has(run.yarn));
      if (bad !== undefined) {
        problems.push(`柄 ${p.id} を読み飛ばしました (糸 ${bad.yarn} が存在しません)`);
        continue;
      }
      if (!colors.has(p.weft)) {
        problems.push(`柄 ${p.id} を読み飛ばしました (緯糸の色 ${p.weft} が存在しません)`);
        continue;
      }
      patterns.set(p.id, p);
    }
  } else {
    problems.push('patterns が配列ではないため、すべて読み飛ばしました');
  }

  // ---- creelPuzzles ----
  const creelPuzzles: CreelPuzzle[] = [];
  if (Array.isArray(raw.creelPuzzles)) {
    for (const item of raw.creelPuzzles) {
      const q = readPuzzle(item);
      if (q === null) {
        problems.push(`お題を読み飛ばしました (形が正しくありません): ${jsonOf(item)}`);
        continue;
      }
      if (creelPuzzles.some((x) => x.id === q.id)) {
        problems.push(`お題 ${q.id} を読み飛ばしました (id が重複)`);
        continue;
      }
      if (!patterns.has(q.patternId)) {
        problems.push(`お題 ${q.id} を読み飛ばしました (柄 ${q.patternId} が存在しません)`);
        continue;
      }
      creelPuzzles.push(q);
    }
  } else {
    problems.push('creelPuzzles が配列ではないため、すべて読み飛ばしました');
  }

  // stage の昇順に並べる (同じ stage は入力の順を保つ)
  creelPuzzles.sort((a, b) => a.stage - b.stage);

  return { colors, yarns, patterns, creelPuzzles, problems };
}

let cached: Content | null = null;

/** 4つの JSON を import して loadContent した結果を返す (1回だけ計算して覚える) */
export function getContent(): Content {
  if (cached === null) {
    cached = loadContent({
      colors: colorsJson,
      yarns: yarnsJson,
      patterns: patternsJson,
      creelPuzzles: creelPuzzlesJson,
    });
  }
  return cached;
}

// ---- 形の検査 (1項目ずつ。正しくなければ null) ----

function jsonOf(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function readColor(item: unknown): YarnColor | null {
  if (typeof item !== 'object' || item === null) {
    return null;
  }
  const o = item as Record<string, unknown>;
  if (!isStr(o.id) || !isStr(o.name) || !isStr(o.hex) || !isStr(o.symbol)) {
    return null;
  }
  return { id: o.id, name: o.name, hex: o.hex, symbol: o.symbol };
}

function readYarn(item: unknown): YarnType | null {
  if (typeof item !== 'object' || item === null) {
    return null;
  }
  const o = item as Record<string, unknown>;
  if (!isStr(o.id) || !isStr(o.color) || !isStr(o.hinban) || !isStr(o.spec)) {
    return null;
  }
  return { id: o.id, color: o.color, hinban: o.hinban, spec: o.spec };
}

function readEra(v: unknown): { from: number; to: number } | null {
  if (typeof v !== 'object' || v === null) {
    return null;
  }
  const o = v as Record<string, unknown>;
  if (!isInt(o.from) || !isInt(o.to) || o.from > o.to) {
    return null;
  }
  return { from: o.from, to: o.to };
}

function readDifficulty(v: unknown): 1 | 2 | 3 | null {
  if (v === 1 || v === 2 || v === 3) {
    return v;
  }
  return null;
}

function readPattern(item: unknown): Pattern | null {
  if (typeof item !== 'object' || item === null) {
    return null;
  }
  const o = item as Record<string, unknown>;
  if (!isStr(o.id) || !isStr(o.name) || !Array.isArray(o.plan) || !isStr(o.weft)) {
    return null;
  }
  const era = readEra(o.era);
  const difficulty = readDifficulty(o.difficulty);
  if (era === null || difficulty === null || !isStr(o.description)) {
    return null;
  }
  const plan = [];
  for (const run of o.plan) {
    if (typeof run !== 'object' || run === null) {
      return null;
    }
    const r = run as Record<string, unknown>;
    if (!isStr(r.yarn) || !isInt(r.count) || r.count < 1) {
      return null; // count が 1 未満の plan は柄ごと読み飛ばす
    }
    plan.push({ yarn: r.yarn, count: r.count });
  }
  return { id: o.id, name: o.name, plan, weft: o.weft, era, description: o.description, difficulty };
}

function readStage(v: unknown): 1 | 2 | 3 | 4 | 5 | null {
  if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5) {
    return v;
  }
  return null;
}

function readPuzzle(item: unknown): CreelPuzzle | null {
  if (typeof item !== 'object' || item === null) {
    return null;
  }
  const o = item as Record<string, unknown>;
  if (!isStr(o.id) || !isStr(o.patternId)) {
    return null;
  }
  const stage = readStage(o.stage);
  if (stage === null || !isInt(o.rows) || o.rows < 1 || !isInt(o.cols) || o.cols < 1 || o.cols > 8) {
    return null; // rows が 1 未満、cols が 1〜8 の外は読み飛ばす
  }
  return { id: o.id, stage, patternId: o.patternId, rows: o.rows, cols: o.cols };
}
