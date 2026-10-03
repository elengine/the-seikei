/** ドラム設定のパラメータの初期値 (T2c-01。遊んで調整する) */

export type Grade = '2/48' | '2/60' | '1/20';

/** 糸の厚みの係数 c(1cm に1本並べたとき、1回転で増える厚み mm) */
export const YARN_COEF: Record<Grade, number> = { '2/48': 0.0085, '2/60': 0.0072, '1/20': 0.011 };

/** 番手の呼び方(画面の文字) */
export const GRADE_LABEL: Record<Grade, string> = { '2/48': '2/48(よんぱち)', '2/60': '2/60(ろくまる)', '1/20': '1/20(紡毛)' };

/** 選べる羽の角度(度)と、番手ごとに使ってよい角度 */
export const ANGLES = [5, 7, 9, 11] as const;
export const ALLOWED_ANGLES: Record<Grade, readonly number[]> = { '2/48': [7, 9, 11], '2/60': [5, 7, 9], '1/20': [9, 11] };

/** 段階ごとの帯の本数と幅(cm) */
export const STAGE_SECTION: Record<1 | 2 | 3 | 4 | 5, { ends: number; widthCm: number }> = {
  1: { ends: 400, widthCm: 20 },
  2: { ends: 480, widthCm: 16 },
  3: { ends: 540, widthCm: 15 },
  4: { ends: 600, widthCm: 15 },
  5: { ends: 720, widthCm: 18 },
};

/** 送り量の誤差の割合の星の基準 */
export const STAR3_ERR = 0.05;
export const STAR2_ERR = 0.15;

/** 試し巻きで積み上げる回転の数 */
export const TRIAL_TURNS = 30;

/** 送り量のボタンの刻み(mm) */
export const FEED_STEP_SMALL = 0.01;
export const FEED_STEP_LARGE = 0.1;

/** 送り量の上限(mm) */
export const FEED_MAX = 9.99;
