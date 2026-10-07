import { createButton, createDialogShell } from './widgets';
import { createStars } from './layout';

type ResultLine = string | { label: string; value: string };

/** 低い横長の画面 (スマホの横向きなど。詰めた形の判定と同じ考え) */
const LOW_LANDSCAPE = '(orientation: landscape) and (max-height: 559px)';

/** 星が1つずつ現れる間隔 (ミリ秒) */
const STAR_STEP_MS = 300;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 結果表示 (全ゲーム共通。07_ui_design.md の 7 節)。
 * 見出し「完了しました」、星、仕上がりの絵、成績、新しく集めた柄、ボタン。
 * 押したボタンの値で解決する。表示後 1.5 秒の演出中もボタンは押せる。
 *
 * 今の呼び出し (praise・againLabel・homeLabel・lines が文字列) も型の上で通る (PU-05 まで)。
 * praise は使わない。lines が文字列なら値なしの行として出す。homeLabel は「一覧」の文字、
 * againLabel は「もう一度」の文字として使い、'home' は 'list' として返る。
 */
export function showResult(
  parent: HTMLElement,
  opts: {
    stars: 1 | 2 | 3;
    preview?: HTMLElement; // 仕上がりの絵 (柄やドラム)。呼び出し側が作る
    lines: ResultLine[]; // 成績 (左に項目、右に値)
    hint?: string; // 星3の条件 (例「1回目で合えば星3です」)
    newPatternNames: string[]; // 新しく集めた柄 (空なら欄を出さない)
    next?: { label: string }; // あれば右に primary。無ければ「一覧」が primary
    /** @deprecated 使わない (大人向けの決まり。PU-05 で呼び出しから消す) */
    praise?: string;
    /** @deprecated 「もう一度」の文字。PU-05 で呼び出しから消す */
    againLabel?: string;
    /** @deprecated 「一覧」の文字。PU-05 で呼び出しから消す */
    homeLabel?: string;
  },
): Promise<'list' | 'again' | 'next'> {
  return new Promise((resolve) => {
    const { backdrop, dialog: box } = createDialogShell(undefined, 'result');
    const timers: ReturnType<typeof setTimeout>[] = [];

    // 見出しの部分 (題名・お疲れ様・星・絵)。低い横長では左の列になる (PU-21)
    const head = document.createElement('div');
    head.classList.add('result__head');
    box.appendChild(head);
    // 成績の欄 (成績・星の目安・新しい柄)。ボタンの行が見えるよう、この欄だけが中でスクロールする (PU-21)
    const body = document.createElement('div');
    body.classList.add('result__body');
    box.appendChild(body);

    // 見出し (固定の言葉)
    const title = document.createElement('h2');
    title.classList.add('result__title', 'font-heading');
    title.textContent = '完了しました';
    head.appendChild(title);
    box.setAttribute('aria-label', '完了しました');
    const sub = document.createElement('p');
    sub.classList.add('result__praise');
    sub.textContent = 'お疲れ様でした';
    head.appendChild(sub);

    // 星: 1つずつ現れる (動きを減らす設定ならすぐ全部)
    const starsWrap = document.createElement('div');
    starsWrap.classList.add('result-stars');
    const stars = createStars(opts.stars, 'result');
    starsWrap.appendChild(stars);
    head.appendChild(starsWrap);
    const reduced = prefersReducedMotion();
    stars.querySelectorAll('.stars__on').forEach((s, i) => {
      if (reduced) {
        return;
      }
      if (i === 0) {
        return; // 1つ目はすぐ出る
      }
      s.classList.add('stars__pending');
      timers.push(
        setTimeout(() => {
          s.classList.remove('stars__pending');
        }, i * STAR_STEP_MS),
      );
    });

    if (opts.preview !== undefined) {
      const pv = document.createElement('div');
      pv.classList.add('result__preview');
      pv.appendChild(opts.preview);
      head.appendChild(pv);
    }

    // 成績
    if (opts.lines.length > 0) {
      const lines = document.createElement('ul');
      lines.classList.add('result__lines');
      for (const line of opts.lines) {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.classList.add('result__label');
        label.textContent = typeof line === 'string' ? line : line.label;
        li.appendChild(label);
        if (typeof line !== 'string') {
          const value = document.createElement('span');
          value.classList.add('result__value');
          value.textContent = line.value;
          li.appendChild(value);
        }
        lines.appendChild(li);
      }
      body.appendChild(lines);
    }

    if (opts.hint !== undefined) {
      const hint = document.createElement('p');
      hint.classList.add('result__hint');
      hint.textContent = opts.hint;
      body.appendChild(hint);
    }

    // 新しく集めた柄 (空なら欄を出さない)
    if (opts.newPatternNames.length > 0) {
      const patterns = document.createElement('div');
      patterns.classList.add('result-patterns');
      const label = document.createElement('p');
      label.classList.add('result-patterns__label');
      label.textContent = '新しく集めた柄';
      patterns.appendChild(label);
      const names = document.createElement('p');
      names.classList.add('result-patterns__names');
      names.textContent = opts.newPatternNames.join('・');
      patterns.appendChild(names);
      body.appendChild(patterns);
    }

    // 低い横長 (スマホの横向きなど。高さ 560px 未満) では左右 2 列にする (CSS の .result--wide)。回したら付け外しする
    const lowQuery = typeof window.matchMedia === 'function' ? window.matchMedia(LOW_LANDSCAPE) : null;
    const applyWide = (): void => {
      box.classList.toggle('result--wide', lowQuery?.matches === true);
    };
    applyWide();
    lowQuery?.addEventListener?.('change', applyWide);

    // ボタン: 左から「一覧」「もう一度」(secondary)、右に next (primary)。next が無ければ「一覧」が primary
    function finish(value: 'list' | 'again' | 'next'): void {
      for (const t of timers) {
        clearTimeout(t);
      }
      lowQuery?.removeEventListener?.('change', applyWide);
      backdrop.remove();
      resolve(value);
    }
    const listLabel = opts.homeLabel ?? '一覧';
    const againLabel = opts.againLabel ?? 'もう一度';
    const actions = document.createElement('div');
    actions.classList.add('dialog__actions', 'result__actions');
    const left = document.createElement('div');
    left.classList.add('result__actions-left');
    const again = createButton({ label: againLabel, variant: 'secondary', onClick: () => finish('again') });
    if (opts.next !== undefined) {
      left.appendChild(createButton({ label: listLabel, variant: 'secondary', onClick: () => finish('list') }));
      left.appendChild(again);
      actions.appendChild(left);
      actions.appendChild(createButton({ label: opts.next.label, variant: 'primary', onClick: () => finish('next') }));
    } else {
      left.appendChild(again);
      actions.appendChild(left);
      actions.appendChild(createButton({ label: listLabel, variant: 'primary', onClick: () => finish('list') }));
    }
    box.appendChild(actions);
    parent.appendChild(backdrop);

    // 表示後 1.5 秒の演出 (演出中もボタンは押せる)。演出自体は結果の確定に影響しない
    timers.push(
      setTimeout(() => {
        box.classList.add('result--settled');
      }, 1500),
    );
  });
}
