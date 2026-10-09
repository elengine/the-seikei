import { describe, it, expect, afterEach } from 'vitest';
import {
  pxPerCm, cmToX, xToCm, BEAM_W_PX, BOARD_W, BEAM_CENTER_X, woundRadius, setBoardHeight, BOARD, drawnExtent, FLANGE_RX, CORE_R,
  ROD_X0, ROD_X1, DRUM_TILT_RX, drumArcX, flangeHit, dragCm, FLANGE_HIT_MIN_PX, lampX, lampY, SPEED_BAR_SHIFT_MAX, speedBarCenterX, speedFromBarDrag, hitSpeedBar, SPEED_BAR_W, DRUM_X, hitSheetEdge, hitBeamWind, sheetTopY, sheetDropEndY, lampR, THREAD_BAR_MARGIN, threadBarRange, clampThreadBarY, threadAttachY } from './geometry';
import { logicalHeightFor } from '../winding/geometry';
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

  it('巻き太りは軸を中心に上下に同じだけ太る円筒の半径 (woundRadius)。progress 0 で芯の半径、1 で円盤の半径の 8 割。progress に比例して増える', () => {
    expect(woundRadius(0)).toBe(CORE_R);
    expect(woundRadius(1)).toBeCloseTo(BOARD.flangeR * 0.8, 6);
    const a = woundRadius(0.25);
    const b = woundRadius(0.5);
    expect(b - woundRadius(0)).toBeCloseTo(2 * (a - woundRadius(0)), 6);
    expect(woundRadius(2)).toBe(woundRadius(1)); // 1 を超えない
  });

  it('setBoardHeight: 高さに比例して、ドラム・ガイドの棒・軸・円盤の半径・目標の点線の位置が決まる (上から ドラム < ガイド < 軸 < 目標の点線)', () => {
    for (const H of [750, 1000, 1400]) {
      setBoardHeight(H);
      expect(BOARD.drumY).toBeGreaterThan(0);
      expect(BOARD.drumY + BOARD.drumH).toBeLessThan(BOARD.guideY);
      expect(BOARD.guideY).toBeLessThan(BOARD.axisY - BOARD.flangeR);
      expect(BOARD.axisY + BOARD.flangeR).toBeLessThan(BOARD.targetY);
      expect(BOARD.targetY).toBeLessThan(H);
    }
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

describe('PU-24b (茶色の棒の速さとランプの座標)', () => {
  it('1. 茶色の棒の真ん中の x: 速さ 0 で盤面の中心より SPEED_BAR_SHIFT_MAX だけ左、100 で同じだけ右、50 で中心。速さに比例して右へ動く', () => {
    expect(SPEED_BAR_SHIFT_MAX).toBeGreaterThan(40);
    expect(speedBarCenterX(0)).toBe(BOARD_W / 2 - SPEED_BAR_SHIFT_MAX);
    expect(speedBarCenterX(50)).toBe(BOARD_W / 2);
    expect(speedBarCenterX(100)).toBe(BOARD_W / 2 + SPEED_BAR_SHIFT_MAX);
    expect(speedBarCenterX(25) - speedBarCenterX(0)).toBeCloseTo(speedBarCenterX(50) - speedBarCenterX(25), 9);
    // 棒は盤面の中に収まる (いちばん右でも)
    expect(speedBarCenterX(100) + SPEED_BAR_W / 2).toBeLessThanOrEqual(BOARD_W);
    expect(speedBarCenterX(0) - SPEED_BAR_W / 2).toBeGreaterThanOrEqual(0);
  });

  it('2. speedFromBarDrag(始めの速さ, 動いた x): 動いた分に比例して 0〜100 に丸める。範囲の外は 0・100', () => {
    const per = (2 * SPEED_BAR_SHIFT_MAX) / 100; // 速さ 1 あたりの x
    expect(speedFromBarDrag(30, 0)).toBe(30);
    expect(speedFromBarDrag(30, 10 * per)).toBe(40);
    expect(speedFromBarDrag(30, -10 * per)).toBe(20);
    expect(speedFromBarDrag(30, 1000)).toBe(100);
    expect(speedFromBarDrag(30, -1000)).toBe(0);
    expect(Number.isInteger(speedFromBarDrag(30, 3.3 * per))).toBe(true);
  });

  it('3. 棒の当たり判定: 棒の上下 32px の中で、棒の幅の中なら true。離れると false (64px 以上の高さ)', () => {
    const y = BOARD.guideY;
    const cx = speedBarCenterX(40);
    expect(hitSpeedBar({ x: cx, y }, 40)).toBe(true);
    expect(hitSpeedBar({ x: cx - SPEED_BAR_W / 2 + 4, y: y + 30 }, 40)).toBe(true);
    expect(hitSpeedBar({ x: cx + SPEED_BAR_W / 2 - 4, y: y - 30 }, 40)).toBe(true);
    expect(hitSpeedBar({ x: cx, y: y + 33 }, 40)).toBe(false);
    expect(hitSpeedBar({ x: cx, y: y - 33 }, 40)).toBe(false);
    expect(hitSpeedBar({ x: cx + SPEED_BAR_W / 2 + 5, y }, 40)).toBe(false);
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
  it('軸の両端 (ROD_X0・ROD_X1) は固定で、いちばん広い巻き幅 (126cm) の円盤の外までとどく。盤面の中に収まる', () => {
    expect(ROD_X0).toBeGreaterThanOrEqual(0);
    expect(ROD_X1).toBeLessThanOrEqual(BOARD_W);
    expect(ROD_X0).toBeLessThan(cmToX(126, -63) - FLANGE_RX);
    expect(ROD_X1).toBeGreaterThan(cmToX(126, 63) + FLANGE_RX);
  });

  it('drumArcX: ドラムの筋の x。真ん中 (t=0) で軸の位置より DRUM_TILT_RX だけ左へふくらみ、上下の端 (t=±1) で軸の位置。上下対称', () => {
    expect(DRUM_TILT_RX).toBeGreaterThan(10);
    expect(drumArcX(300, 0)).toBeCloseTo(300 - DRUM_TILT_RX, 9);
    expect(drumArcX(300, 1)).toBeCloseTo(300, 9);
    expect(drumArcX(300, -1)).toBeCloseTo(300, 9);
    expect(drumArcX(300, 0.5)).toBeCloseTo(drumArcX(300, -0.5), 9);
    expect(drumArcX(300, 0.5)).toBeGreaterThan(drumArcX(300, 0));
  });
});

/** hitBeamWind に渡す状態 (目標どおりの円盤の位置) */
function wind(widthCm: number, progress: number, over?: { leftCm?: number; rightCm?: number }): { widthCm: number; leftCm: number; rightCm: number; progress: number } {
  return { widthCm, leftCm: over?.leftCm ?? -widthCm / 2, rightCm: over?.rightCm ?? widthCm / 2, progress };
}
const LAMP_R = 22;

describe('T3-06 (糸を付ける作業の当たり判定)', () => {
  it('押さえる所は糸の束の先の木の棒 (と束): 横は棒の長さ (束の幅 + 左右 THREAD_BAR_MARGIN)、縦は束の上端から棒の下 32px まで。外れると false (PU-27)', () => {
    const widthCm = 60;
    const y = sheetDropEndY(0); // 垂れた位置の棒
    const r = threadBarRange(widthCm);
    expect(r.x1 - r.x0).toBeCloseTo(widthCm * pxPerCm(widthCm) + 2 * THREAD_BAR_MARGIN, 9);
    expect(hitSheetEdge({ x: BEAM_CENTER_X, y }, widthCm, 0)).toBe(true);
    expect(hitSheetEdge({ x: r.x0 + 2, y: y + 30 }, widthCm, 0)).toBe(true); // 棒の下 32px まで
    expect(hitSheetEdge({ x: BEAM_CENTER_X, y: sheetTopY(0) + 5 }, widthCm, 0)).toBe(true); // 束の途中でもつかめる
    expect(hitSheetEdge({ x: r.x0 - 5, y }, widthCm, 0)).toBe(false); // 横に外れる
    expect(hitSheetEdge({ x: r.x1 + 5, y }, widthCm, 0)).toBe(false);
    expect(hitSheetEdge({ x: BEAM_CENTER_X, y: y + 33 }, widthCm, 0)).toBe(false); // 下に外れる
    expect(hitSheetEdge({ x: BEAM_CENTER_X, y: sheetTopY(0) - 5 }, widthCm, 0)).toBe(false); // 束の上 (ドラムの中) は外れる
    // 棒が下へ動いたら、押さえる所も棒について動く
    expect(hitSheetEdge({ x: BEAM_CENTER_X, y: y + 100 }, widthCm, 0, y + 100)).toBe(true);
  });

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

  it('縦の並び: ランプ < ドラム < 糸のシート(ガイドの棒) < ビームの円盤 < 目標の点線。描いた範囲が盤面の高さに収まる', () => {
    for (const h of [750, 1100]) {
      setBoardHeight(h);
      expect(lampY()).toBeLessThan(BOARD.drumY);
      expect(BOARD.drumY + BOARD.drumH).toBeLessThan(BOARD.guideY);
      expect(BOARD.guideY).toBeLessThan(BOARD.axisY - BOARD.flangeR);
      expect(BOARD.axisY + BOARD.flangeR).toBeLessThan(BOARD.targetY);
      expect(BOARD.targetY + 28).toBeLessThanOrEqual(BOARD.H);
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
  it('垂れた端 (sheetDropEndY) は、ドラムの下の端より下で、ドラムの下の端からガイドの棒までの半分以下。ビームの円筒には届かない', () => {
    for (const h of [750, 1100]) {
      setBoardHeight(h);
      for (const p of [0, 0.5, 1]) {
        const top = sheetTopY(p);
        const end = sheetDropEndY(p);
        expect(end, `H=${h} p=${p}`).toBeGreaterThan(top);
        expect(end - top).toBeLessThanOrEqual((BOARD.guideY - top) / 2 + 1e-9);
        expect(end).toBeLessThan(BOARD.axisY - woundRadius(p));
      }
    }
    setBoardHeight(750);
  });

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
