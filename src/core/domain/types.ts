export type ColorId = string;
export interface YarnColor { id: ColorId; name: string; hex: string; symbol: string; }

export type YarnTypeId = string;
export interface YarnType { id: YarnTypeId; color: ColorId; hinban: string; spec: string; }

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
