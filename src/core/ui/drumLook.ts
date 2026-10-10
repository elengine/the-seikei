/**
 * ドラムの絵の共通の比率 (ドラム巻きとビーミングのドラムを同じ見た目にする。PU-32 追加修正 11)。
 * ドラム巻きは縦の円筒、ビーミングは横に寝た円筒だが、木の板・丸い印・帯留めの竿の大きさの比は同じ。
 * 色は tokens の COLORS (板は wood、印と竿は machineDark、金具は steel)。長さの単位は論理座標。
 */

/** 木の板の幅 (正面を向いたとき) */
export const DRUM_SLAT_W = 12;
/** 板の丸い印の間隔と半径 */
export const DRUM_HOLE_STEP = 60;
export const DRUM_HOLE_R = 4;
/** 丸い印は、正面に近い板 (向きの余弦がこの値より大きい板) だけに付く */
export const DRUM_HOLE_FACING = 0.6;
/** 帯留めの竿の幅 (正面を向いたとき) と、ドラムの端より外へ出す長さ */
export const DRUM_POLE_W = 10;
export const DRUM_POLE_OVER = 24;
/** 竿の白い小さな金具 (steel): 竿に沿った長さと、竿を横切る幅 */
export const DRUM_BRACKET_ALONG = 6;
export const DRUM_BRACKET_ACROSS = 12;
