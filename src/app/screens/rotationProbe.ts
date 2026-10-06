import { onViewportChange } from '../../core/viewport/viewport';

/**
 * 回転の記録 (診断用・T1-21a-2)。iPhone Air の standalone で回転したときに画面全体が
 * 一瞬ずれて戻る原因を数字で確定させるため、大きさが変わった直後 2 秒間、アニメーションの
 * 1 フレームごとに画面の状態を記録し、どの値がいつ動いたかを管理者メニューに表示する。
 * 原因が確定したあと、残すか消すかは管理者が決める。
 */

/** 1フレーム分の記録 */
export type ProbeSample = {
  t: number; // 大きさが変わってからのミリ秒
  scrollX: number; // 文書のスクロール 横
  scrollY: number; // 文書のスクロール 縦
  innerW: number; // 画面の幅
  innerH: number; // 画面の高さ
  vvTop: number; // 見えている窓の上のずれ (visualViewport.offsetTop)
  vvPageTop: number; // 見えている窓のページ上の位置 (visualViewport.pageTop)
  vvH: number; // 見えている窓の高さ
  vvScale: number; // 見えている窓の拡大率
  safeTop: number; // 上の帯の高さ (#app の上余白。safe area を含む)
  docH: number; // 文書の高さ
  appTop: number; // アプリの土台 (#app) の表示上の上端
  appLeft: number; // アプリの土台 (#app) の表示上の左端
};

const DURATION_MS = 2000;

type MetricDef = { label: string; pick: (s: ProbeSample) => number; unit: string };

const METRICS: MetricDef[] = [
  { label: '文書のスクロール 縦', pick: (s) => s.scrollY, unit: 'px' },
  { label: '文書のスクロール 横', pick: (s) => s.scrollX, unit: 'px' },
  { label: '画面の高さ', pick: (s) => s.innerH, unit: 'px' },
  { label: '画面の幅', pick: (s) => s.innerW, unit: 'px' },
  { label: '見えている窓 上のずれ', pick: (s) => s.vvTop, unit: 'px' },
  { label: '見えている窓 高さ', pick: (s) => s.vvH, unit: 'px' },
  { label: '見えている窓 拡大率', pick: (s) => s.vvScale, unit: '' },
  { label: '上の帯の高さ (#app の上余白)', pick: (s) => s.safeTop, unit: 'px' },
  { label: '文書の高さ', pick: (s) => s.docH, unit: 'px' },
  { label: 'アプリの土台 表示上', pick: (s) => s.appTop, unit: 'px' },
  { label: 'アプリの土台 表示左', pick: (s) => s.appLeft, unit: 'px' },
];

function fmt(v: number, unit: string): string {
  return `${Math.round(v * 10) / 10}${unit}`;
}

/** 記録を、管理者が読める行にまとめる。動かなかった値は「ずっと」、動いた値は最小〜最大と変わった時刻 */
export function summarize(samples: ProbeSample[]): string[] {
  if (samples.length === 0) {
    return ['記録なし'];
  }
  const lines: string[] = [];
  for (const m of METRICS) {
    const values = samples.map((s) => m.pick(s)).filter((v) => Number.isFinite(v));
    if (values.length === 0) {
      lines.push(`${m.label}: 不明`);
      continue;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      lines.push(`${m.label}: ずっと ${fmt(min, m.unit)}`);
      continue;
    }
    // 値が変わった時刻を出す (連続する変化はまとめない。細かい動きも見たい)
    const changes: string[] = [];
    for (let i = 1; i < samples.length; i++) {
      const prev = m.pick(samples[i - 1]!);
      const now = m.pick(samples[i]!);
      if (Number.isFinite(prev) && Number.isFinite(now) && prev !== now) {
        changes.push(`${samples[i]!.t}ミリ秒後 (${fmt(prev, m.unit)}→${fmt(now, m.unit)})`);
      }
    }
    lines.push(`${m.label}: ${fmt(min, m.unit)}〜${fmt(max, m.unit)} (${changes.slice(0, 6).join('、')})`);
  }
  return lines;
}

function read(t: number): ProbeSample {
  const vv = (globalThis as { visualViewport?: VisualViewport }).visualViewport;
  const app = document.querySelector('#app');
  const rect = app?.getBoundingClientRect();
  const padTop = app ? parseFloat(getComputedStyle(app).paddingTop) : NaN;
  return {
    t,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    vvTop: vv?.offsetTop ?? NaN,
    vvPageTop: vv?.pageTop ?? NaN,
    vvH: vv?.height ?? NaN,
    vvScale: vv?.scale ?? NaN,
    safeTop: padTop,
    docH: document.documentElement.scrollHeight,
    appTop: rect?.top ?? NaN,
    appLeft: rect?.left ?? NaN,
  };
}

/**
 * 回転の記録を始める。大きさが変わるたびに 2 秒間、1 フレームごとに記録し、
 * 終わったときに onResult に読める行を渡す。戻り値で記録をやめる。
 */
export function startRotationProbe(onResult: (lines: string[]) => void): () => void {
  let rafId: number | null = null;
  let stopped = false;

  function session(): void {
    const t0 = performance.now();
    const samples: ProbeSample[] = [];
    const step = (): void => {
      const t = Math.round(performance.now() - t0);
      samples.push(read(t));
      if (stopped) {
        rafId = null;
        return;
      }
      if (t < DURATION_MS) {
        rafId = requestAnimationFrame(step);
      } else {
        rafId = null;
        onResult(summarize(samples));
      }
    };
    rafId = requestAnimationFrame(step);
  }

  const offViewport = onViewportChange(() => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    session(); // 新しい変化で記録をやり直す
  });

  return () => {
    stopped = true;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    offViewport();
  };
}
