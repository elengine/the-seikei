import { describe, it, expect, afterEach } from 'vitest';
import {
  pxPerCm, cmToX, xToCm, BEAM_W_PX, BOARD_W, BEAM_CENTER_X, woundRadius, setBoardHeight, BOARD, drawnExtent, FLANGE_RX, ROD_X0, ROD_X1, flangeHit, dragCm, FLANGE_HIT_MIN_PX, lampX, lampY, SPEED_BAR_SHIFT_MAX, speedBarCenterX, speedFromBarDrag, hitSpeedBar, SPEED_BAR_W, DRUM_X, DRUM_W, hitSheetEdge, hitBeamWind, sheetTopY, sheetDropEndY, lampR, THREAD_BAR_MARGIN, threadBarRange, clampThreadBarY, threadAttachY, DRUM_AXIS_X0, depthDx, dropHFor } from './geometry';
import { logicalHeightFor } from '../winding/geometry';
import { sidePath, project } from './side';
import { SIDE, SIDE_PROJECTION, SIDE_TOP_FRAC, SIDE_BOTTOM_FRAC, SIDE_WOUND_MIN, SIDE_WOUND_MAX } from './params';
import { DRUM_SURFACE_SIGN, BEAM_SURFACE_SIGN, DRUM_TURN_RATE, BEAM_TURN_RATE } from './params';

describe('beaming geometry T3-02 (座標)', () => {
  it('1. cm → 論理座標 → cm の往復が一致する', () => {
    for (const w of [60, 75, 90, 126]) {
      for (const cm of [-30, -7.5, 0, 12.5, 63]) {
        expect(xToCm(w, cmToX(w, cm)), `w ${w} cm ${cm}`).toBeCloseTo(cm, 10);
      }
    }
  });

  it('2. 巻き幅は盤面の幅の 60〜80% (700px = 70%)', () => {
    expect(BEAM_W_PX).toBeGreaterThanOrEqual(BOARD_W * 0.6);
    expect(BEAM_W_PX).toBeLessThanOrEqual(BOARD_W * 0.8);
    for (const w of [60, 75, 90, 126]) {
      const px = cmToX(w, w / 2) - cmToX(w, -w / 2);
      expect(px, `w ${w}`).toBeCloseTo(BEAM_W_PX, 10);
      expect(px).toBeGreaterThanOrEqual(BOARD_W * 0.6);
      expect(px).toBeLessThanOrEqual(BOARD_W * 0.8);
    }
    // 巻き幅が小さいほど倍率が大きい (cm の見た目の大きさが同じ)
    expect(pxPerCm(60)).toBeGreaterThan(pxPerCm(126));
  });

  it('3. ビームの中心は盤面の中央。左は負の cm で左へ', () => {
    const w = 60;
    expect(cmToX(w, 0)).toBe(BEAM_CENTER_X);
    expect(cmToX(w, -w / 2)).toBeLessThan(BEAM_CENTER_X);
    expect(cmToX(w, w / 2)).toBeGreaterThan(BEAM_CENTER_X);
    expect(cmToX(w, -w / 2)).toBe(BEAM_CENTER_X - BEAM_W_PX / 2);
  });
});

describe('PU-15a: ビームの巻き太りと盤面の高さ', () => {
  afterEach(() => {
    setBoardHeight(750);
  });

  it('描いた範囲 (ドラムの上から、目標の点線の目盛りの下まで) の高さが、論理の高さの 85% 以上 (750〜1400 のどれでも)', () => {
    for (const H of [750, 900, 1000, 1250, 1400]) {
      setBoardHeight(H);
      const e = drawnExtent();
      expect((e.bottom - e.top) / H, `H=${H}`).toBeGreaterThanOrEqual(0.85);
      expect(e.bottom).toBeLessThanOrEqual(H);
    }
  });

  it('5 つの大きさの盤面のカード (534×305・396×363・512×517・636×278・689×637) で、描いた範囲の高さがカードの高さの 85% 以上', () => {
    for (const [w, h] of [[534, 305], [396, 363], [512, 517], [636, 278], [689, 637]] as Array<[number, number]>) {
      const H = logicalHeightFor(w, h);
      setBoardHeight(H);
      const scale = Math.min(w / BOARD_W, h / H);
      const e = drawnExtent();
      expect(((e.bottom - e.top) * scale) / h, `${w}×${h}`).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('円盤の楕円の横の半径 (FLANGE_RX) は、画面上の当たりを 64px 幅にできる大きさ (縮尺 0.4 でも 64/0.4 = 160 以内で当たりを広げられる)', () => {
    expect(FLANGE_RX).toBeGreaterThan(10);
    expect(FLANGE_RX).toBeLessThan(80);
  });
});

describe('PU-15b: 円盤を引っぱる (当たり判定・1cm 単位の吸い付き)', () => {
  afterEach(() => {
    setBoardHeight(750);
  });

  it('flangeHit: 円盤の楕円の中の点でその円盤を返し、遠い点・円盤の上下の外は null。画面上の幅が 64px 以上になるよう、縮尺が小さいほど当たりを横に広げる', () => {
    const w = 60;
    const lx = cmToX(w, -30);
    const rx = cmToX(w, 30);
    const y = BOARD.axisY;
    expect(flangeHit({ x: lx, y }, -30, 30, w, 1)).toBe('left');
    expect(flangeHit({ x: rx, y }, -30, 30, w, 1)).toBe('right');
    expect(flangeHit({ x: BEAM_CENTER_X, y }, -30, 30, w, 1)).toBeNull();
    expect(flangeHit({ x: lx, y: y - BOARD.flangeR - 5 }, -30, 30, w, 1)).toBeNull(); // 上の外
    // 縮尺 0.4: 画面上 32px (論理 80) までの横ずれで当たる。1.0 では FLANGE_RX 付近まで
    expect(flangeHit({ x: lx + 70, y }, -30, 30, w, 0.4)).toBe('left');
    expect(flangeHit({ x: lx + 70, y }, -30, 30, w, 1)).toBeNull();
    expect(FLANGE_HIT_MIN_PX).toBeGreaterThanOrEqual(64);
    // 2 つの円盤の当たりが重なるときは近いほう
    expect(flangeHit({ x: lx + 3, y }, -30, -29, w, 0.4)).toBe('left');
  });

  it('dragCm: 指が動いた分だけ cm が変わり、1cm 単位に丸める (吸い付く)。つかんだ位置からのずれ分だけ飛ばない', () => {
    const w = 60;
    const perCm = pxPerCm(w);
    expect(dragCm(w, -30, cmToX(w, -30) + 3, cmToX(w, -30) + 3)).toBe(-30); // 動かさない
    expect(dragCm(w, -30, cmToX(w, -30), cmToX(w, -30) + perCm * 4.4)).toBe(-26);
    expect(dragCm(w, -30, cmToX(w, -30), cmToX(w, -30) + perCm * 4.6)).toBe(-25);
    expect(dragCm(w, 30, cmToX(w, 30), cmToX(w, 30) - perCm * 7)).toBe(23);
    // つかんだ位置が円盤の中心から 10px ずれていても、動かした量だけ変わる
    expect(dragCm(w, -30, cmToX(w, -30) + 10, cmToX(w, -30) + 10 + perCm * 2)).toBe(-28);
  });
});

describe('PU-24b・PU-28 (速さの木の棒とランプの座標)', () => {
  it('1. 木の棒の真ん中の x: 速さ 0 で盤面の中心より SPEED_BAR_SHIFT_MAX だけ左、100 で同じだけ右、50 で中心。棒全体が速さに比例して右へ動く。棒は盤面の中に収まる', () => {
    expect(SPEED_BAR_SHIFT_MAX).toBeGreaterThan(40);
    const sh = depthDx(SIDE.wood.z); // 木の棒の奥行きのずれ
    expect(speedBarCenterX(0)).toBeCloseTo(BOARD_W / 2 - SPEED_BAR_SHIFT_MAX + sh, 9);
    expect(speedBarCenterX(50)).toBeCloseTo(BOARD_W / 2 + sh, 9);
    expect(speedBarCenterX(100)).toBeCloseTo(BOARD_W / 2 + SPEED_BAR_SHIFT_MAX + sh, 9);
    expect(speedBarCenterX(25) - speedBarCenterX(0)).toBeCloseTo(speedBarCenterX(50) - speedBarCenterX(25), 9);
    expect(speedBarCenterX(100) + SPEED_BAR_W / 2).toBeLessThanOrEqual(BOARD_W);
    expect(speedBarCenterX(0) - SPEED_BAR_W / 2).toBeGreaterThanOrEqual(0);
  });

  it('2. speedFromBarDrag(始めの速さ, 動いた x): 動いた分に比例する。丸めない (T3-07 追加修正)。範囲の外は 0・100', () => {
    const per = (2 * SPEED_BAR_SHIFT_MAX) / 100; // 速さ 1 あたりの動いた x
    expect(speedFromBarDrag(30, 0)).toBeCloseTo(30, 6);
    expect(speedFromBarDrag(30, 10 * per)).toBeCloseTo(40, 6);
    expect(speedFromBarDrag(30, -10 * per)).toBeCloseTo(20, 6);
    expect(speedFromBarDrag(0, 1), '論理 1px で速さ 0.5 (丸めない。T3-07 追加修正)').toBe(0.5);
    expect(speedFromBarDrag(30, 3.3 * per)).toBeCloseTo(33.3, 9);
    expect(speedFromBarDrag(30, 2000)).toBeCloseTo(100, 6);
    expect(speedFromBarDrag(30, -2000)).toBeCloseTo(0, 6);
    expect(speedFromBarDrag(20, speedBarCenterX(70) - speedBarCenterX(20))).toBeCloseTo(70, 6);
  });

  it('3. 棒の当たり判定: 今の位置の棒の上下 32px (画面上 64px 以上。縮尺が小さいときは画面上 ±32px になるよう広げる)、横は棒の長さ。離れると false', () => {
    const y = BOARD.guideY;
    const cx = speedBarCenterX(40);
    expect(hitSpeedBar({ x: cx, y }, 40)).toBe(true);
    expect(hitSpeedBar({ x: cx - SPEED_BAR_W / 2 + 4, y: y + 30 }, 40)).toBe(true);
    expect(hitSpeedBar({ x: cx + SPEED_BAR_W / 2 - 4, y: y - 30 }, 40)).toBe(true);
    expect(hitSpeedBar({ x: cx, y: y + 33 }, 40)).toBe(false);
    expect(hitSpeedBar({ x: cx, y: y - 33 }, 40)).toBe(false);
    expect(hitSpeedBar({ x: cx + SPEED_BAR_W / 2 + 5, y }, 40)).toBe(false);
    expect(hitSpeedBar({ x: cx, y: y + 50 }, 40, 0.5)).toBe(true); // 縮尺 0.5: 画面上 ±25px = 論理 ±50... ではなく 32px ぶん = 64
    expect(hitSpeedBar({ x: cx, y: y + 66 }, 40, 0.5)).toBe(false);
    expect(64).toBeLessThanOrEqual(2 * 32);
  });

  it('4. ランプはビームの上の左寄り', () => {
    expect(lampX()).toBeLessThan(BOARD_W / 2);
    expect(lampX()).toBeGreaterThan(DRUM_X);
    // ドラムの胴に重ならない所 (ドラムの上の空き。PU-26 決まり5。T3-06 は胴の真ん中に置いていた)
    expect(lampY() + LAMP_R * 1.3).toBeLessThanOrEqual(BOARD.drumY);
    expect(lampY() - LAMP_R * 1.3).toBeGreaterThanOrEqual(0);
  });
});

describe('PU-24a: 立体に見える絵の座標 (軸の長さは固定・ドラムの丸み)', () => {
  it('軸の両端 (ROD_X0・ROD_X1) は固定で、いちばん広い巻き幅 (200cm。T3-09) の円盤の外までとどく。盤面の中に収まる', () => {
    expect(ROD_X0).toBeGreaterThanOrEqual(0);
    expect(ROD_X1).toBeLessThanOrEqual(BOARD_W);
    expect(ROD_X0).toBeLessThan(cmToX(200, -100) - FLANGE_RX);
    expect(ROD_X1).toBeGreaterThan(cmToX(200, 100) + FLANGE_RX);
  });

  it('T3-09: 200cm のお題で、円盤と軸が盤面の左右の端に触れない (縦は巻き幅によらないので iPad の確認で見る)', () => {
    const leftOuter = cmToX(200, -100) - FLANGE_RX;
    const rightOuter = cmToX(200, 100) + FLANGE_RX;
    expect(leftOuter, '左の円盤の外はし').toBeGreaterThan(0);
    expect(rightOuter, '右の円盤の外はし').toBeLessThan(BOARD_W);
    expect(ROD_X0, '軸の左端').toBeGreaterThan(0);
    expect(ROD_X1, '軸の右端').toBeLessThan(BOARD_W);
  });

});

/** hitBeamWind に渡す状態 (目標どおりの円盤の位置) */
function wind(widthCm: number, progress: number, over?: { leftCm?: number; rightCm?: number }): { widthCm: number; leftCm: number; rightCm: number; progress: number } {
  return { widthCm, leftCm: over?.leftCm ?? -widthCm / 2, rightCm: over?.rightCm ?? widthCm / 2, progress };
}
const LAMP_R = 22;

describe('T3-06 (糸を付ける作業の当たり判定)', () => {
  it('離してよい所はビームの軸と巻いた糸の円筒: 円盤の間で、上下 32px の余裕', () => {
    const widthCm = 60;
    const left = cmToX(widthCm, -widthCm / 2);
    const right = cmToX(widthCm, widthCm / 2);
    const y = BOARD.axisY;
    expect(hitBeamWind({ x: BEAM_CENTER_X, y }, wind(widthCm, 0))).toBe(true);
    expect(hitBeamWind({ x: left + 5, y: y - 30 }, wind(widthCm, 0))).toBe(true);
    expect(hitBeamWind({ x: left - 5, y }, wind(widthCm, 0))).toBe(false); // 左の円盤より外
    expect(hitBeamWind({ x: right + 5, y }, wind(widthCm, 0))).toBe(false); // 右の円盤より外
    expect(hitBeamWind({ x: BEAM_CENTER_X, y: y - woundRadius(0) - 33 }, wind(widthCm, 0))).toBe(false); // 上に外れる
  });
});

describe('PU-26: ドラムはビームの円盤より大きい・糸を離してよい所は実際の円盤の位置', () => {
  it('ドラムの直径 (BOARD.drumH) はビームの円盤の直径 (2 × flangeR) の 1.5 倍以上。盤面の高さがどれでも', () => {
    for (const h of [750, 900, 1100, 1500]) {
      setBoardHeight(h);
      expect(BOARD.drumH, `H=${h}`).toBeGreaterThanOrEqual(1.5 * 2 * BOARD.flangeR);
    }
    setBoardHeight(750);
  });

  it('hitBeamWind は目標の巻き幅ではなく、実際の円盤の位置 (leftCm・rightCm) の間で判定する', () => {
    const y = BOARD.axisY;
    const moved = wind(60, 0, { leftCm: -20, rightCm: 25 });
    expect(hitBeamWind({ x: cmToX(60, -25), y }, moved)).toBe(false); // 目標では内側でも、実際の左の円盤の外
    expect(hitBeamWind({ x: cmToX(60, -15), y }, moved)).toBe(true);
    expect(hitBeamWind({ x: cmToX(60, 27), y }, moved)).toBe(false); // 実際の右の円盤の外
    expect(hitBeamWind({ x: cmToX(60, 22), y }, moved)).toBe(true);
    expect(hitBeamWind({ x: cmToX(60, 27), y }, wind(60, 0, { leftCm: -20, rightCm: 30 }))).toBe(true);
  });

  it('回る向きの符号: ドラムの手前の面は下から上へ (負)、ビームの手前の面は上から下へ (正)。回る速さは速さ 0 のとき 0', () => {
    expect(DRUM_SURFACE_SIGN).toBe(-1);
    expect(BEAM_SURFACE_SIGN).toBe(1);
    expect(DRUM_TURN_RATE).toBeGreaterThan(0);
    expect(BEAM_TURN_RATE).toBeGreaterThan(0);
  });
});

describe('PU-26 追加修正: 糸のシートは短く垂れる・ランプの大きさ', () => {
  it('ランプの半径はドラム巻きの lampGeometry と同じ決め方: min(42, max(22, 16 ÷ 縮尺))。画面上の半径は 16px 以上 (縮尺が小さいほど論理の半径が大きい。上限 42)', () => {
    expect(lampR(1)).toBe(22);
    expect(lampR(0.5)).toBe(32);
    expect(lampR(0.39)).toBeCloseTo(16 / 0.39, 9);
    expect(lampR(0.2)).toBe(42);
  });

  it('ランプの外側の輪 (半径 × 1.3) が、ドラムの胴と盤面の外に出ない (縮尺と盤面の高さがどれでも)', () => {
    for (const h of [750, 900, 1100, 1500]) {
      setBoardHeight(h);
      for (const scale of [0.2, 0.3, 0.39, 0.6, 1, 1.5]) {
        const r = lampR(scale) * 1.3;
        expect(lampY() - r, `H=${h} scale=${scale} の上`).toBeGreaterThanOrEqual(0);
        expect(lampY() + r, `H=${h} scale=${scale} の下`).toBeLessThanOrEqual(BOARD.drumY);
        expect(lampX() - r).toBeGreaterThanOrEqual(0);
      }
    }
    setBoardHeight(750);
  });
});

describe('PU-27: 糸の束の先の木の棒の動く範囲と付く条件', () => {
  it('棒は垂れた位置 (sheetDropEndY) より上へ行かず、ビームの軸 (axisY) より下へ行かない', () => {
    for (const p of [0, 0.5]) {
      expect(clampThreadBarY(-1000, p)).toBe(sheetDropEndY(p));
      expect(clampThreadBarY(100000, p)).toBe(BOARD.axisY);
      const mid = (sheetDropEndY(p) + BOARD.axisY) / 2;
      expect(clampThreadBarY(mid, p)).toBe(mid);
    }
  });

  it('付く条件の y (threadAttachY) は、巻いた糸の円筒の上の端から上へ 32px。垂れた位置より下', () => {
    expect(threadAttachY(0)).toBeCloseTo(BOARD.axisY - woundRadius(0) - 32, 9);
    expect(threadAttachY(0)).toBeGreaterThan(sheetDropEndY(0));
  });
});

describe('PU-32: 横から見た形 (side.ts) を写した盤面の座標', () => {
  afterEach(() => {
    setBoardHeight(750);
  });

  it('setBoardHeight: ドラムの上の端 = SIDE_TOP_FRAC × H、円盤の下の端 = SIDE_BOTTOM_FRAC × H。ドラム・木の棒・軸の高さは横から見た図の並びのまま (ドラム < 木の棒 < 軸 < 目標の点線)。盤面の高さがどれでも', () => {
    for (const h of [750, 911, 1100, 1400]) {
      setBoardHeight(h);
      expect(BOARD.drumY, `H=${h}`).toBeCloseTo(SIDE_TOP_FRAC * h, 6);
      expect(BOARD.axisY + BOARD.flangeR).toBeCloseTo(SIDE_BOTTOM_FRAC * h, 6);
      expect(BOARD.drumY + BOARD.drumH / 2).toBeLessThan(BOARD.guideY); // ドラムの中心 < 木の棒 (横から見た図では木の棒のほうが手前)
      expect(BOARD.guideY).toBeLessThan(BOARD.axisY);
      expect(BOARD.axisY + BOARD.flangeR).toBeLessThan(BOARD.targetY);
      expect(BOARD.targetY + 28).toBeLessThanOrEqual(BOARD.H);
      expect(BOARD.drumH).toBeGreaterThanOrEqual(1.5 * 2 * BOARD.flangeR); // PU-26 のまま
    }
  });

  it('woundRadius: 巻き量に比例して太る。0 で芯 (円盤の半径の SIDE_WOUND_MIN 倍)、1 で円盤の半径の SIDE_WOUND_MAX 倍', () => {
    expect(woundRadius(0)).toBeCloseTo(BOARD.flangeR * SIDE_WOUND_MIN, 6);
    expect(woundRadius(1)).toBeCloseTo(BOARD.flangeR * SIDE_WOUND_MAX, 6);
    expect(woundRadius(0.5) - woundRadius(0)).toBeCloseTo(woundRadius(1) - woundRadius(0.5), 6);
  });

  it('ドラムは奥にあるので、ビームの幅の位置より右へずれて写る (DRUM_X = 左端 + depthDx)。ドラムの右の端の面まで盤面の中に収まる', () => {
    expect(DRUM_X).toBeCloseTo(DRUM_AXIS_X0 + depthDx(SIDE.drum.z), 9);
    expect(depthDx(SIDE.drum.z)).toBeGreaterThan(depthDx(SIDE.bar1.z));
    expect(depthDx(SIDE.bar2.z)).toBeGreaterThan(depthDx(SIDE.beam.z) - 1e-9);
    expect(depthDx(SIDE.beam.z)).toBeCloseTo(0, 9);
    expect(DRUM_X).toBeGreaterThan(0);
    expect(DRUM_X + DRUM_W + depthDx(SIDE.drum.z) * 0 + SIDE_PROJECTION.KX * SIDE.drum.r).toBeLessThanOrEqual(BOARD_W);
  });

  it('糸の束の先の木の棒: 垂れた位置 (sheetDropEndY) は鉄の棒 2 の手前の面の真下で、鉄の棒 2 より下、ビームの円筒の上の端より上。巻き量が増えても動かない', () => {
    for (const h of [750, 1100]) {
      setBoardHeight(h);
      const bar2Y = project(SIDE.bar2.z, SIDE.bar2.h, h).y;
      expect(sheetDropEndY(0)).toBeGreaterThan(bar2Y);
      expect(sheetDropEndY(0)).toBeLessThan(BOARD.axisY - woundRadius(0));
      expect(sheetDropEndY(0.5)).toBe(sheetDropEndY(0));
      // 棒を引っぱった y から、垂れの長さを求めて戻すと同じ y (投影の逆)
      const y = (sheetDropEndY(0) + BOARD.axisY) / 2;
      const drop = dropHFor(y);
      expect(project(SIDE.bar2.z + SIDE.bar2.r, SIDE.bar2.h - drop, h).y).toBeCloseTo(y, 6);
    }
  });

  it('押さえる所: 木の棒 (と束) は、横は棒の長さ (束の幅 + 左右 THREAD_BAR_MARGIN。鉄の棒 2 の手前の面の奥行きのずれぶん)、縦は鉄の棒 2 の上の端から棒の下 32px まで。描いた位置と合う', () => {
    const widthCm = 60;
    const r = threadBarRange(widthCm);
    expect(r.x1 - r.x0).toBeCloseTo(widthCm * pxPerCm(widthCm) + 2 * THREAD_BAR_MARGIN, 9);
    expect((r.x0 + r.x1) / 2).toBeCloseTo(BEAM_CENTER_X + depthDx(SIDE.bar2.z + SIDE.bar2.r), 9);
    const y = sheetDropEndY(0);
    const top = project(SIDE.bar2.z, SIDE.bar2.h + SIDE.bar2.r, BOARD.H).y;
    expect(hitSheetEdge({ x: (r.x0 + r.x1) / 2, y }, widthCm, 0)).toBe(true);
    expect(hitSheetEdge({ x: r.x0 + 2, y: y + 30 }, widthCm, 0)).toBe(true);
    expect(hitSheetEdge({ x: (r.x0 + r.x1) / 2, y: top + 2 }, widthCm, 0)).toBe(true); // 束の途中でもつかめる
    expect(hitSheetEdge({ x: r.x0 - 5, y }, widthCm, 0)).toBe(false);
    expect(hitSheetEdge({ x: r.x1 + 5, y }, widthCm, 0)).toBe(false);
    expect(hitSheetEdge({ x: (r.x0 + r.x1) / 2, y: y + 33 }, widthCm, 0)).toBe(false);
    expect(hitSheetEdge({ x: (r.x0 + r.x1) / 2, y: top - 5 }, widthCm, 0)).toBe(false);
    expect(hitSheetEdge({ x: (r.x0 + r.x1) / 2, y: y + 100 }, widthCm, 0, y + 100)).toBe(true); // 棒が下へ動いたら押さえる所もついていく
  });

  it('ランプは、ドラム一式なので奥行きぶん右へずれる。糸を離す y の目安 sheetTopY は、糸がドラムを離れる点 (ドラムの下側) の画面の y', () => {
    expect(lampX()).toBeCloseTo(BOARD_W * 0.2 + depthDx(SIDE.drum.z), 9);
    const p0 = sidePath(0)[0]!;
    expect(sheetTopY(0)).toBeCloseTo(project(p0.z, p0.h, BOARD.H).y, 9);
    expect(sheetTopY(0)).toBeGreaterThan(BOARD.drumY + BOARD.drumH / 2); // ドラムの中心より下
  });

  it('円盤の当たり (flangeHit) は、描いた円盤の位置 (軸の高さ・cmToX) と合う: 円盤の縦の範囲は BOARD.axisY ± BOARD.flangeR', () => {
    expect(flangeHit({ x: cmToX(60, -30), y: BOARD.axisY }, -30, 30, 60, 1)).toBe('left');
    expect(flangeHit({ x: cmToX(60, 30), y: BOARD.axisY + BOARD.flangeR - 1 }, -30, 30, 60, 1)).toBe('right');
    expect(flangeHit({ x: cmToX(60, -30), y: BOARD.axisY + BOARD.flangeR + 5 }, -30, 30, 60, 1)).toBeNull();
  });
});
