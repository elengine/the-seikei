import { describe, it, expect, afterEach } from 'vitest';
import {
  pxPerCm, cmToX, xToCm, BEAM_W_PX, BOARD_W, BEAM_CENTER_X, woundRadius, setBoardHeight, BOARD, drawnExtent, FLANGE_RX, CORE_R,
  flangeHit, dragCm, FLANGE_HIT_MIN_PX,
} from './geometry';
import { logicalHeightFor } from '../winding/geometry';

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
