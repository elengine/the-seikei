export type ColorId = string;
export interface YarnColor { id: ColorId; name: string; hex: string; symbol: string; }

export type YarnTypeId = string;
export type CoreId = string;
/** 糸を巻いた紙の芯の色。品番の見分けの手がかり (同じ色の糸どうしは芯の色を変える) */
export interface CoreColor { id: CoreId; name: string; hex: string; }
export interface YarnType { id: YarnTypeId; color: ColorId; hinban: string; spec: string; tone?: number; core: CoreId; }

export interface StripeRun { yarn: YarnTypeId; count: number; }
export type StripePlan = StripeRun[];

export interface Pattern {
  id: string; name: string; plan: StripePlan; weft: ColorId;
  era: { from: number; to: number }; description: string; difficulty: 1 | 2 | 3;
}

export interface CreelPuzzle {
  id: string;          // 's1' など
  stage: 1 | 2 | 3 | 4 | 5;
  patternId: string;
  rows: number;        // 段
  cols: number;        // 軸(1〜8)
}
