import { metersPerGram, resultOf } from './logic';
import type { ItowariState } from './logic';
import { SPINDLES } from './params';
import type { ItowariPuzzle } from './puzzles';
import { fmtM } from './geometry';
import type { GameResult } from '../../core/game/types';

/**
 * 糸割りの文面 (P2b T2b-03a)。依頼書・レベルごとの計算の手伝い・失敗の中身・結果の行。
 * 数式は出さず、たし算とわり算にして説明する。
 */

/** 依頼書 (品番と番手・芯の有無と、依頼の内容)。2行で出す (改行は panel で pre-line) */
export function orderText(puzzle: ItowariPuzzle): string {
  const core = puzzle.coreG > 0 ? `・紙の芯 ${puzzle.coreG}g` : '';
  const line1 = `${puzzle.name}・糸 ${puzzle.count}${core}`;
  const line2 =
    puzzle.kind === 'split'
      ? `チーズ ${puzzle.sources.length} 個 → クリールに ${puzzle.needCount} 本。1本 ${fmtM(puzzle.needM)}m 以上`
      : `あと ${fmtM(puzzle.needM)}m 巻く。クリールに ${puzzle.needCount} 本要る(残り ${puzzle.sources.length} 本)`;
  return `${line1}\n${line2}`;
}

/** 計算の手伝い。レベル1 は量った糸の長さと半分・レベル2 は長さだけ・レベル3〜4 は式の形・レベル5 は出さない */
export function helpText(puzzle: ItowariPuzzle, weightG: number | undefined): string {
  if (puzzle.level >= 5) {
    return '';
  }
  if (puzzle.level >= 3) {
    return `(重さ)× ${fmtM(metersPerGram(puzzle.count))} = 長さ`;
  }
  if (weightG === undefined) {
    return '';
  }
  const len = Math.floor(weightG * metersPerGram(puzzle.count));
  return puzzle.level === 1 ? `約 ${fmtM(len)} m\n半分 ${fmtM(Math.floor(len / 2))} m` : `約 ${fmtM(len)} m`;
}

/** 失敗の中身 (1行ずつ)。足りないものを口の番号で言う */
export function failLines(s: ItowariState, puzzle: ItowariPuzzle): string[] {
  const kind = puzzle.kind === 'split' ? '元のチーズ' : '元のコーン';
  return s.lastFailures.map((f) => {
    const n =
      f.spindle !== undefined
        ? f.spindle + 1
        : s.spindles.findIndex((sp) => sp.segments.some((seg) => seg.sourceId === f.sourceId)) + 1;
    if (f.kind === 'sourceEmpty') {
      return `${n}番:${kind}が途中で空になります`;
    }
    if (f.kind === 'sourceShort') {
      return `${n}番:${kind}の残りが ${fmtM(f.leftM ?? 0)} m で、${fmtM(puzzle.needM)} m に足りません`;
    }
    return `${n}番:作ったコーンが ${fmtM(f.woundM ?? 0)} m で、${fmtM(puzzle.needM)} m に足りません`;
  });
}

/** 星3の条件の言い方 (結果の画面の下に出す) */
export const STAR_HINT = '失敗せず、余分 5% 以内、巻いた回数が最少で星3です';

/** 結果の行 (T2b-01 の成績)。星の数は logic.resultOf と同じ決まりで出す */
export function resultOfGame(s: ItowariState, puzzle: ItowariPuzzle, mode: GameResult['mode'], finishedAt: string): GameResult {
  const judged = resultOf(s, puzzle);
  const minRuns = Math.max(1, Math.ceil(puzzle.sources.length / SPINDLES));
  const extra = `${s.extraPct.toFixed(1)}%`;
  const lines = [
    { label: '失敗した回数', value: `${s.failures}回` },
    { label: '余分', value: extra },
    { label: '巻いた回数', value: `${s.runs}回(最少 ${minRuns}回)` },
    { label: '糸を継いだ口', value: `${s.spliced}` },
  ];
  return {
    gameId: 'itowari',
    mode,
    stars: judged.stars,
    stats: {
      [`puzzle:${puzzle.id}`]: judged.stars,
      [`level:${puzzle.level}`]: judged.stars,
    },
    unlockedPatternIds: [],
    resultLines: lines,
    starHint: STAR_HINT,
    summary: lines.map((l) => `${l.label} ${l.value}`),
    finishedAt,
  };
}
