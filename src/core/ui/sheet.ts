import { createButton } from './widgets';

/**
 * 下から出る重ね表示 (PU-09b)。画面の下半分の高さ、白地・上の角 16・上端に縞・見出し・右上に丸い × で閉じる。
 * 背景の覆いは作らない (上の盤面を見たまま、押せる)。外を押しても閉じない: × か、開いたボタンをもう一度押して閉じる。
 */
export interface Sheet {
  root: HTMLElement;
  body: HTMLElement; // 中身を入れる所
  close(): void;
  isOpen(): boolean;
}

export function openSheet(opts: { parent: HTMLElement; title: string; onClose?: () => void }): Sheet {
  const root = document.createElement('div');
  root.classList.add('sheet');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', opts.title);

  const stripe = document.createElement('div');
  stripe.classList.add('stripe-top');
  root.appendChild(stripe);

  const header = document.createElement('div');
  header.classList.add('sheet__header');
  const title = document.createElement('h2');
  title.classList.add('sheet__title', 'font-heading');
  title.textContent = opts.title;
  header.appendChild(title);
  const close = createButton({ label: '閉じる', variant: 'secondary', shape: 'circle', onClick: () => api.close() });
  close.classList.add('sheet__close');
  // × の線 (アイコン一覧に無いので、ここで描く)
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '28');
  svg.setAttribute('height', '28');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M6 6 L18 18 M18 6 L6 18');
  svg.appendChild(path);
  close.appendChild(svg);
  header.appendChild(close);
  root.appendChild(header);

  const body = document.createElement('div');
  body.classList.add('sheet__body');
  root.appendChild(body);

  let open = true;
  const api: Sheet = {
    root,
    body,
    close(): void {
      if (!open) {
        return;
      }
      open = false;
      root.remove();
      opts.onClose?.();
    },
    isOpen: () => open,
  };
  opts.parent.appendChild(root);
  return api;
}
