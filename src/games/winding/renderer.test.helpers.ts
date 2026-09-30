/**
 * renderer のテスト用の偽の CanvasRenderingContext2D (呼ばれた命令を記録する)。
 * テストの補助なので、テストファイル以外からは使わない。
 */

export type FakeOp = { k: string; v?: unknown; args?: unknown[] };

export interface FakeRecorder {
  ops: FakeOp[];
  fillStyleLog: string[];
}

export function makeFakeCtx(): { ctx: CanvasRenderingContext2D; rec: FakeRecorder } {
  const rec: FakeRecorder = { ops: [], fillStyleLog: [] };
  const ctx = {
    canvas: { width: 1000, height: 750, clientWidth: 1000, clientHeight: 750 },
    save: () => rec.ops.push({ k: 'save' }),
    restore: () => rec.ops.push({ k: 'restore' }),
    translate: (x: number, y: number) => rec.ops.push({ k: 'translate', args: [x, y] }),
    scale: (x: number, y: number) => rec.ops.push({ k: 'scale', args: [x, y] }),
    beginPath: () => rec.ops.push({ k: 'beginPath' }),
    closePath: () => rec.ops.push({ k: 'closePath' }),
    moveTo: (x: number, y: number) => rec.ops.push({ k: 'moveTo', args: [x, y] }),
    lineTo: (x: number, y: number) => rec.ops.push({ k: 'lineTo', args: [x, y] }),
    arc: (x: number, y: number, r: number) => rec.ops.push({ k: 'arc', args: [x, y, r] }),
    ellipse: (x: number, y: number, rx: number, ry: number) => rec.ops.push({ k: 'ellipse', args: [x, y, rx, ry] }),
    roundRect: (x: number, y: number, w: number, h: number) => rec.ops.push({ k: 'roundRect', args: [x, y, w, h] }),
    createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => {
      rec.ops.push({ k: 'createLinearGradient', args: [x0, y0, x1, y1] });
      const stops: Array<{ offset: number; color: string }> = [];
      return {
        addColorStop: (offset: number, color: string) => {
          stops.push({ offset, color });
          rec.ops.push({ k: 'addColorStop', args: [offset, color] });
        },
      };
    },
    globalAlpha: 1,
    measureText: (str: string) => ({ width: 20 + str.length * 10 }) as TextMetrics,
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) =>
      rec.ops.push({ k: 'quadraticCurveTo', args: [cx, cy, x, y] }),
    fill: () => rec.ops.push({ k: 'fill' }),
    stroke: () => rec.ops.push({ k: 'stroke' }),
    fillRect: (x: number, y: number, w: number, h: number) => rec.ops.push({ k: 'fillRect', args: [x, y, w, h] }),
    strokeRect: (x: number, y: number, w: number, h: number) => rec.ops.push({ k: 'strokeRect', args: [x, y, w, h] }),
    fillText: (t: string, x: number, y: number) => rec.ops.push({ k: 'fillText', args: [t, x, y] }),
    setTransform: () => rec.ops.push({ k: 'setTransform' }),
  } as unknown as CanvasRenderingContext2D;

  // style の記録 (代入を拾う)
  let fillStyle = '#000';
  let strokeStyle = '#000';
  let font = '';
  Object.defineProperty(ctx, 'fillStyle', {
    get: () => fillStyle,
    set: (v: string) => {
      fillStyle = v;
      rec.ops.push({ k: 'style', v });
      rec.fillStyleLog.push(v);
    },
  });
  Object.defineProperty(ctx, 'strokeStyle', {
    get: () => strokeStyle,
    set: (v: string) => {
      strokeStyle = v;
      rec.ops.push({ k: 'style', v });
    },
  });
  Object.defineProperty(ctx, 'lineWidth', {
    get: () => 1,
    set: (v: number) => rec.ops.push({ k: 'lineWidth', v }),
  });
  Object.defineProperty(ctx, 'font', {
    get: () => font,
    set: (v: string) => {
      font = v;
      rec.ops.push({ k: 'font', v });
    },
  });
  let globalAlpha = 1;
  Object.defineProperty(ctx, 'globalAlpha', {
    get: () => globalAlpha,
    set: (v: number) => {
      globalAlpha = v;
      rec.ops.push({ k: 'globalAlpha', v });
    },
  });
  return { ctx, rec };
}
