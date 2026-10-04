import { COLORS } from '../../core/ui/tokens';
import { getContent } from '../../core/content/content';

const NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

function shape(parent: SVGElement, tag: 'rect' | 'circle' | 'line' | 'polygon', attrs: Attrs): void {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    e.setAttribute(k, String(v));
  }
  parent.appendChild(e);
}

/** カードの小さな絵 (200x100 の四角と丸だけの簡単な絵) */
export function createCardArt(kind: 'creel' | 'drumsetup' | 'winding' | 'beaming' | 'itowari' | 'soon'): SVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 100');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('game-card__art');
  shape(svg, 'rect', { x: 0, y: 0, width: 200, height: 100, rx: 8, fill: COLORS.kinariDeep });
  if (kind === 'creel') {
    // 正面から見たクリール: 縦の柱 2 本と、糸の色のコーン
    shape(svg, 'rect', { x: 14, y: 10, width: 10, height: 80, fill: COLORS.post });
    shape(svg, 'rect', { x: 176, y: 10, width: 10, height: 80, fill: COLORS.post });
    const cones = [COLORS.ai, COLORS.shu, COLORS.gold, COLORS.wood];
    cones.forEach((c, i) => {
      const cx = 48 + i * 34;
      shape(svg, 'circle', { cx, cy: 32, r: 15, fill: c });
      shape(svg, 'circle', { cx, cy: 32, r: 6, fill: COLORS.white });
      shape(svg, 'circle', { cx, cy: 32, r: 2.5, fill: COLORS.sumi });
      shape(svg, 'circle', { cx, cy: 72, r: 12, fill: COLORS.woodLight });
    });
  } else if (kind === 'drumsetup') {
    // ドラムの断面: 表面の板と、左上へ登る羽 (遊ぶ画面と同じ向き)と、右に寄って積み上がる層
    shape(svg, 'rect', { x: 24, y: 78, width: 152, height: 12, fill: COLORS.wood });
    shape(svg, 'line', { x1: 114, y1: 78, x2: 42, y2: 22, stroke: COLORS.wood, 'stroke-width': 7 });
    const layers = [COLORS.ai, COLORS.ai, COLORS.ai, COLORS.ai];
    layers.forEach((c, i) => {
      shape(svg, 'rect', { x: 120 - i * 14, y: 68 - i * 10, width: 46 + i * 14, height: 8, fill: c });
    });
  } else if (kind === 'winding') {
    // ドラム: 上下の円盤と、糸の縞
    shape(svg, 'rect', { x: 60, y: 12, width: 80, height: 8, fill: COLORS.machineDark });
    shape(svg, 'rect', { x: 60, y: 80, width: 80, height: 8, fill: COLORS.machineDark });
    const stripes = [COLORS.ai, COLORS.kinari, COLORS.ai, COLORS.shu, COLORS.ai];
    stripes.forEach((c, i) => {
      shape(svg, 'rect', { x: 66 + i * 14, y: 20, width: 14, height: 60, fill: c });
    });
    shape(svg, 'line', { x1: 30, y1: 50, x2: 60, y2: 50, stroke: COLORS.steel, 'stroke-width': 4 });
    shape(svg, 'line', { x1: 140, y1: 50, x2: 170, y2: 50, stroke: COLORS.steel, 'stroke-width': 4 });
  } else if (kind === 'beaming') {
    // ビーム巻き: 奥のドラムと、斜めに降りる糸のシート、手前のビームと緑の円盤
    shape(svg, 'rect', { x: 24, y: 10, width: 152, height: 18, fill: COLORS.wood });
    shape(svg, 'polygon', { points: '60,28 140,28 128,64 72,64', fill: COLORS.ai });
    shape(svg, 'rect', { x: 44, y: 64, width: 112, height: 10, fill: COLORS.machineLight });
    shape(svg, 'rect', { x: 44, y: 74, width: 112, height: 8, fill: COLORS.steel });
    shape(svg, 'rect', { x: 36, y: 58, width: 8, height: 28, fill: COLORS.machine });
    shape(svg, 'rect', { x: 156, y: 58, width: 8, height: 28, fill: COLORS.machine });
  } else if (kind === 'itowari') {
    // 糸割り: 緑の枠の台 (上の段の糸と下の段の銀色の胴) と、左の段ボール箱
    shape(svg, 'rect', { x: 56, y: 18, width: 120, height: 68, fill: COLORS.machine });
    for (let i = 0; i < 3; i++) {
      shape(svg, 'polygon', { points: `${68 + i * 36},40 ${84 + i * 36},40 ${80 + i * 36},28 ${72 + i * 36},28`, fill: COLORS.threadYellow });
      shape(svg, 'rect', { x: 64 + i * 36, y: 44, width: 24, height: 14, fill: COLORS.winderSteel });
      shape(svg, 'polygon', { points: `${70 + i * 36},58 ${82 + i * 36},58 ${79 + i * 36},50 ${73 + i * 36},50`, fill: COLORS.kinari });
    }
    shape(svg, 'rect', { x: 16, y: 34, width: 32, height: 26, fill: COLORS.cardboard });
    shape(svg, 'rect', { x: 20, y: 66, width: 24, height: 4, fill: COLORS.sumiSub });
  } else {
    // 準備中: 点線の四角と丸
    shape(svg, 'rect', {
      x: 40,
      y: 20,
      width: 120,
      height: 60,
      rx: 8,
      fill: 'none',
      stroke: COLORS.lockBorder,
      'stroke-width': 3,
      'stroke-dasharray': '8 6',
    });
    shape(svg, 'circle', {
      cx: 100,
      cy: 50,
      r: 14,
      fill: 'none',
      stroke: COLORS.lockBorder,
      'stroke-width': 3,
      'stroke-dasharray': '6 5',
    });
  }
  return svg;
}

/** 登録済みのゲームの状態の文字 (内容のデータから数える) */
export function gameStatusText(id: string): string {
  if (id === 'creel') {
    return `お題 ${getContent().creelPuzzles.length}`;
  }
  if (id === 'drumsetup') {
    return `お題 ${getContent().creelPuzzles.length}`;
  }
  if (id === 'winding') {
    return '初級・中級・上級';
  }
  if (id === 'beaming') {
    return `お題 ${getContent().creelPuzzles.length}`;
  }
  if (id === 'itowari') {
    return `お題 ${getContent().creelPuzzles.length}`;
  }
  return '';
}
