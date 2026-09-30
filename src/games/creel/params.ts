/** クリール立ての調整値。数値を変えたいときはここだけ編集する */

/** 星3 の条件: 「確認する」を押した回数がこの回数以下 */
export const STARS3_CHECKS_MAX = 1;

/** 星2 の条件: 「確認する」を押した回数がこの回数以下 (ヒント 0 回) */
export const STARS2_CHECKS_MAX = 3;

/** ヒントを使えるようになる最小の「確認する」回数 */
export const HINT_MIN_CHECKS = 2;

/** この段階以上で、紛らわしい箱 (answer の糸と同じ色で answer に無い糸) を操作欄に足す */
export const CONFUSING_BOXES_FROM_STAGE = 4;

/** 経糸の見本の太さ (px)。スタンドアロンの盤面で使う想定の既定値 */
export const THREAD_PX = 3;

/** 依頼書の各行に「何本目」を書き添える段階の上限 (段階4・5 では出さず、手応えを残す)。遊んでから調整する */
export const ORDER_RANGE_MAX_STAGE = 3;
