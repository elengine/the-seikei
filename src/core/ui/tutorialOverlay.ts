import type { TutorialSpec } from '../game/types';

/**
 * チュートリアルの表示。1ページに絵 (Canvas) と文を置き、
 * 最後のページで「はじめる」を押すと解決する。
 */
export function showTutorial(
  parent: HTMLElement,
  spec: TutorialSpec,
  opts: {
    nextLabel?: string; // 既定「つぎへ」
    startLabel?: string; // 既定「はじめる」
    onPage?: () => void; // ページ送りのたび (効果音用)
  } = {},
): Promise<void> {
  const nextLabel = opts.nextLabel ?? 'つぎへ';
  const startLabel = opts.startLabel ?? 'はじめる';
  const total = spec.pages.length;

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.classList.add('dialog-backdrop');
    const box = document.createElement('div');
    box.classList.add('dialog', 'tutorial');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    // 絵 (各ページの draw で描く)
    const canvas = document.createElement('canvas');
    canvas.classList.add('tutorial__canvas');
    const ctx = canvas.getContext('2d');
    box.appendChild(canvas);

    // 文 (3行以内を想定)
    const text = document.createElement('p');
    text.classList.add('tutorial__text');
    box.appendChild(text);

    // 左下のページ数
    const counter = document.createElement('span');
    counter.classList.add('tutorial__counter');
    box.appendChild(counter);

    const actions = document.createElement('div');
    actions.classList.add('dialog__actions');

    let page = 0;
    let done = false;

    function render(): void {
      const p = spec.pages[page];
      if (p === undefined) {
        return;
      }
      text.textContent = p.text;
      counter.textContent = `${page + 1} / ${total}`;
      if (ctx !== null) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        p.draw(ctx, canvas.width, canvas.height);
      }
      actions.textContent = ''; // ボタンを作り直す
      // 前のページへ戻るボタン (最初のページでは置かない)
      if (page > 0) {
        const prev = document.createElement('button');
        prev.type = 'button';
        prev.classList.add('btn', 'btn--secondary');
        prev.textContent = 'もどる';
        prev.addEventListener('click', () => {
          if (page > 0) {
            page -= 1;
            render();
            opts.onPage?.(); // ページ送り (戻る) のたび
          }
        });
        actions.appendChild(prev);
      }
      // 「つぎへ」または「はじめる」
      const next = document.createElement('button');
      next.type = 'button';
      next.classList.add('btn', 'btn--primary');
      if (page < total - 1) {
        next.textContent = nextLabel;
        next.addEventListener('click', () => {
          page += 1;
          render();
          opts.onPage?.(); // ページ送りのたび
        });
      } else {
        next.textContent = startLabel;
        next.addEventListener('click', () => {
          if (!done) {
            done = true;
            backdrop.remove();
            resolve();
          }
        });
      }
      actions.appendChild(next);
    }

    render();
    box.appendChild(actions);
    backdrop.appendChild(box);
    parent.appendChild(backdrop);
  });
}
