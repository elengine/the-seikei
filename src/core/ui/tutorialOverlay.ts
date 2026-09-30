import type { TutorialSpec } from '../game/types';
import { setupCanvas } from '../viewport/viewport';

/**
 * チュートリアルの表示。1ページに絵 (Canvas) と文を置き、
 * 最後のページで「始める」を押すと解決する。
 */
export function showTutorial(
  parent: HTMLElement,
  spec: TutorialSpec,
  opts: {
    nextLabel?: string; // 既定「次へ」
    startLabel?: string; // 既定「始める」
    onPage?: () => void; // ページ送りのたび (効果音用)
    renderText?: (text: string) => string; // 文の置き換え ({{…}} を呼び名に)。無ければそのまま
  } = {},
): Promise<void> {
  const nextLabel = opts.nextLabel ?? '次へ';
  const startLabel = opts.startLabel ?? '始める';
  const renderText = opts.renderText ?? ((text: string) => text);
  const total = spec.pages.length;

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.classList.add('dialog-backdrop');
    const box = document.createElement('div');
    box.classList.add('dialog', 'tutorial');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    // 絵 (各ページの draw で描く)。幅は min(560px, 画面幅の90%)、高さは幅の 2/3
    const canvas = document.createElement('canvas');
    canvas.classList.add('tutorial__canvas');
    const canvasW = Math.floor(Math.min(560, window.innerWidth * 0.9));
    const canvasH = Math.floor((canvasW * 2) / 3);
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = setupCanvas(canvas, canvasW, canvasH); // 画素密度に合わせる
    } catch {
      // Canvas が使えない環境 (テスト等) では CSS サイズだけ合わせる
      canvas.style.width = `${canvasW}px`;
      canvas.style.height = `${canvasH}px`;
    }
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
      text.textContent = renderText(p.text);
      counter.textContent = `${page + 1} / ${total}`;
      if (ctx !== null) {
        ctx.clearRect(0, 0, canvasW, canvasH);
        p.draw(ctx, canvasW, canvasH); // draw には CSS px の幅・高さを渡す
      }
      actions.textContent = ''; // ボタンを作り直す
      // 前のページへ戻るボタン (最初のページでは置かない)。ゲームを終える「戻る」と区別するため「前へ」
      if (page > 0) {
        const prev = document.createElement('button');
        prev.type = 'button';
        prev.classList.add('btn', 'btn--secondary');
        prev.textContent = '前へ';
        prev.addEventListener('click', () => {
          if (page > 0) {
            page -= 1;
            render();
            opts.onPage?.(); // ページ送り (戻る) のたび
          }
        });
        actions.appendChild(prev);
      }
      // 「次へ」または「始める」
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
