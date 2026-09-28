import type { AppContext } from '../context';
import type { Screen } from '../screenManager';
import { createButton, textInputDialog } from '../../core/ui/widgets';

/** 呼び名の変更画面 (#/settings/terms)。用語の一覧を1行ずつ表示する */
export function createTermsScreen(ctx: AppContext): Screen {
  return {
    mount(container: HTMLElement): void {
      const root = document.createElement('div');
      root.classList.add('terms');

      const title = document.createElement('h1');
      title.classList.add('settings__title');
      title.textContent = '呼び名をかえる';
      root.appendChild(title);

      // 上部に「もどる」(設定へ)
      const backBtn = createButton({
        label: 'もどる',
        variant: 'secondary',
        onClick: () => {
          ctx.audio.play('tap');
          ctx.navigate('/settings');
        },
      });
      root.appendChild(backBtn);

      const list = document.createElement('div');
      list.classList.add('terms__list');
      root.appendChild(list);

      function render(): void {
        list.textContent = '';
        for (const entry of ctx.terms.entries()) {
          const line = document.createElement('div');
          line.classList.add('terms__row');

          const main = document.createElement('div');
          main.classList.add('terms__main');
          const value = document.createElement('p');
          value.classList.add('terms__value'); // 現在の呼び名 (大きく)
          value.textContent = entry.value;
          const desc = document.createElement('p');
          desc.classList.add('terms__desc'); // 説明 (補足の色)
          desc.textContent = entry.description;
          main.appendChild(value);
          main.appendChild(desc);

          const actions = document.createElement('div');
          actions.classList.add('settings__actions');
          const changeBtn = createButton({
            label: 'かえる',
            variant: 'secondary',
            onClick: async () => {
              const v = await textInputDialog(root, { title: entry.key, initial: entry.value, maxLength: 10 });
              if (v !== null) {
                await ctx.terms.set(entry.key, v); // 空文字なら set が reset と同じにする
                ctx.audio.play('ok');
                render();
              }
            },
          });
          actions.appendChild(changeBtn);
          if (entry.overridden) {
            // 上書き中なら「元にもどす」
            const resetBtn = createButton({
              label: '元にもどす',
              variant: 'secondary',
              onClick: async () => {
                await ctx.terms.reset(entry.key);
                ctx.audio.play('tap');
                render();
              },
            });
            actions.appendChild(resetBtn);
          }

          line.appendChild(main);
          line.appendChild(actions);
          list.appendChild(line);
        }
      }

      render();
      container.textContent = '';
      container.appendChild(root);
    },

    unmount(): void {
      // root は container ごと取り除かれる
    },
  };
}
