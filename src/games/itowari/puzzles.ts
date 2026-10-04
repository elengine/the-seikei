import type { Content } from '../../core/content/content';
import { RECIPES, levelOf } from './params';
import type { Level } from './params';
import { metersPerGram } from './logic';

/**
 * 糸割りのお題 (P2b T2b-01)。クリール立てのお題 15 題から作る
 * (ドラム巻き・ビーム巻きと同じ考え。データを二重に持たない)。
 * 糸はその柄の最初の糸。番手 (m/g) は糸のデータ (spec) から読む。
 */

export interface ItowariSource {
  /** チーズ・コーンの id (お題の中だけで使う。例 's1-m0') */
  id: string;
  /** 重さ (g)。レベル5 は紙の芯つき */
  grossG: number;
}

export interface ItowariPuzzle {
  /** クリール立てのお題と同じ id (例 's2-3') */
  id: string;
  stage: 1 | 2 | 3 | 4 | 5;
  /** 難易度 (レベル = 段階) */
  level: Level;
  /** 場面の種類。チーズを分ける (レベル1〜2) / 足りないコーンを作る (レベル3〜5) */
  kind: 'split' | 'refill';
  /** 柄の名前 (例「紺の無地」) */
  patternId: string;
  name: string;
  /** 糸の id (柄の最初の糸) */
  yarnId: string;
  /** 番手 (糸のデータの spec に書かれたもの。例 '2/48') */
  count: string;
  /** 口にかけるチーズ・コーン */
  sources: ItowariSource[];
  /** クリールに要る本数 */
  needCount: number;
  /** 1本あたり要る長さ (m) */
  needM: number;
  /** 紙の芯の重さ (g)。0 は無し */
  coreG: number;
}

/** クリール立てのお題から、糸割りのお題15題を作る */
export function itowariPuzzles(content: Content): ItowariPuzzle[] {
  return content.creelPuzzles.map((cp) => {
    const stage = cp.stage as 1 | 2 | 3 | 4 | 5;
    const level = levelOf(stage);
    const recipe = RECIPES[level];
    const pattern = content.patterns.get(cp.patternId);
    const yarnId = pattern?.plan[0]?.yarn ?? '';
    const spec = content.yarns.get(yarnId)?.spec ?? '1/48';
    return {
      id: cp.id,
      stage,
      level,
      kind: (stage <= 2 ? 'split' : 'refill') as ItowariPuzzle['kind'],
      patternId: cp.patternId,
      name: pattern?.name ?? cp.patternId,
      yarnId,
      count: spec.split(/\s+/).pop() ?? spec,
      sources: ((): ItowariSource[] => {
        if (stage <= 2) {
          // split: チーズの数 = 要る本数の半分。重さは grossG を順に繰り返す
          const cheeses = recipe.needCount / 2;
          return Array.from({ length: cheeses }, (_, i) => ({
            id: `${cp.id}-m${i}`,
            grossG: recipe.grossG[i % recipe.grossG.length]!,
          }));
        }
        return recipe.grossG.map((g, i) => ({ id: `${cp.id}-m${i}`, grossG: g }));
      })(),
      needCount: recipe.needCount,
      needM: recipe.needM,
      coreG: recipe.coreG,
    };
  });
}

/** id でお題を探す (無ければ null) */
export function puzzleById(content: Content, id: string): ItowariPuzzle | null {
  return itowariPuzzles(content).find((p) => p.id === id) ?? null;
}

/** 正味の長さ (m) を出す (お題を作るときに使う)。テストからも参照する */
export function puzzleLength(p: ItowariPuzzle, s: ItowariSource): number {
  return Math.floor((s.grossG - p.coreG) * metersPerGram(p.count));
}
