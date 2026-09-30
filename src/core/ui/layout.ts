import { createButton } from './widgets';

/** 画面の部品 (見出しの行・ページ・カード・節の見出し・一覧の行・星)。見た目は 07_ui_design.md の 5・7 節 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, ...classes: string[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.classList.add(...classes);
  return e;
}

/** 見出しの行: 左に「戻る」、中央に題名、右に補助の操作。上端の縞を含む */
export function createScreenHeader(opts: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: HTMLElement;
}): HTMLElement {
  const header = el('header', 'screen-header');
  header.appendChild(el('div', 'stripe-top'));

  const left = el('div', 'screen-header__left');
  if (opts.onBack !== undefined) {
    left.appendChild(createButton({ label: '戻る', icon: 'back', onClick: opts.onBack }));
  }
  header.appendChild(left);

  const center = el('div', 'screen-header__center');
  const title = el('h1', 'screen-header__title', 'font-heading');
  title.textContent = opts.title;
  center.appendChild(title);
  if (opts.subtitle !== undefined) {
    const sub = el('p', 'screen-header__subtitle');
    sub.textContent = opts.subtitle;
    center.appendChild(sub);
  }
  header.appendChild(center);

  const right = el('div', 'screen-header__right');
  if (opts.right !== undefined) {
    right.appendChild(opts.right);
  }
  header.appendChild(right);
  return header;
}

/** 中身を置く枠。form: 幅 820px で中央、list: 左右に画面の余白、full: 余白なし (ゲームの画面) */
export function createPage(opts: { width: 'form' | 'list' | 'full' }): HTMLElement {
  return el('div', 'page', `page--${opts.width}`);
}

export function createCard(): HTMLElement {
  return el('div', 'card');
}

export function createSectionHeading(text: string, opts?: { underline?: boolean }): HTMLElement {
  const h = el('h2', 'section-heading');
  if (opts?.underline === true) {
    h.classList.add('section-heading--underline');
  }
  h.textContent = text;
  return h;
}

/** ★ を3つ。取った星は .stars__on、取っていない星は .stars__off */
export function createStars(n: 0 | 1 | 2 | 3, size: 'list' | 'result'): HTMLElement {
  const stars = el('span', 'stars', `stars--${size}`);
  stars.setAttribute('role', 'img');
  stars.setAttribute('aria-label', `星${n}`);
  for (let i = 0; i < 3; i += 1) {
    const s = el('span', i < n ? 'stars__on' : 'stars__off');
    s.textContent = i < n ? '★' : '☆'; // 色だけに頼らず形も変える
    s.setAttribute('aria-hidden', 'true');
    stars.appendChild(s);
  }
  return stars;
}

function createLockIcon(): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('list-row__lock');
  for (const d of ['M6 11 H18 V20 H6 Z', 'M8.5 11 V8 A3.5 3.5 0 0 1 15.5 8 V11']) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

/** 一覧の行 (お題や柄の1行)。状態は「星」「次はこれ」「鍵」 */
export function createListRow(opts: {
  swatch?: HTMLElement;
  name: string;
  meta?: string;
  status: { kind: 'stars'; stars: 0 | 1 | 2 | 3 } | { kind: 'next' } | { kind: 'locked'; reason: string };
  onClick: () => void;
  onLocked?: (reason: string) => void;
}): HTMLButtonElement {
  const row = el('button', 'list-row');
  row.type = 'button';
  if (opts.swatch !== undefined) {
    const sw = el('span', 'list-row__swatch');
    sw.appendChild(opts.swatch);
    row.appendChild(sw);
  }
  const name = el('span', 'list-row__name');
  name.textContent = opts.name;
  row.appendChild(name);
  if (opts.meta !== undefined) {
    const meta = el('span', 'list-row__meta');
    meta.textContent = opts.meta;
    row.appendChild(meta);
  }
  const status = el('span', 'list-row__status');
  const st = opts.status;
  if (st.kind === 'stars') {
    status.appendChild(createStars(st.stars, 'list'));
  } else if (st.kind === 'next') {
    row.classList.add('list-row--next');
    status.textContent = '次はこれ';
  } else {
    row.classList.add('list-row--locked');
    row.dataset.reason = st.reason;
    status.appendChild(createLockIcon());
  }
  row.appendChild(status);
  row.addEventListener('click', () => {
    if (st.kind === 'locked') {
      opts.onLocked?.(st.reason);
      return;
    }
    opts.onClick();
  });
  return row;
}
