import type { AppContext } from '../context';
import type { Screen } from '../screenManager';
import { createButton, textInputDialog } from '../../core/ui/widgets';

/** 呼び名の変更画面 (#/settings/terms)。整経の用語とゲームの名前の2つの区画に分けて表示する */
export function createTermsScreen(ctx: AppContext): Screen {
  return {
    mount(container: HTMLElement): void {
      const root = document.createElement('div');
      root.classList.add('terms');

      // 題名と同じ行の左に「戻る」(設定画面と同じ形)
      const bar = document.createElement('div');
      bar.classList.add('settings__bar');
      const backBtn = createButton({
        label: '戻る',
        variant: 'secondary',
        onClick: () => {
          ctx.audio.play('tap');
          ctx.navigate('/settings');
        },
      });
      bar.appendChild(backBtn);
      const title = document.createElement('h1');
      title.classList.add('settings__title');
      title.textContent = '呼び名の変更';
      bar.appendChild(title);
      root.appendChild(bar);

      const list = document.createElement('div');
      list.classList.add('terms__list');
      root.appendChild(list);

      /** 区画を作る (見出し + 行) */
      function sectionOf(headText: string): { section: HTMLDivElement; list: HTMLDivElement } {
        const section = document.createElement('div');
        section.classList.add('terms__section');
        const head = document.createElement('h2');
        head.classList.add('terms__head');
        head.textContent = headText;
        const rows = document.createElement('div');
        rows.classList.add('terms__rows');
        section.appendChild(head);
        section.appendChild(rows);
        list.appendChild(section);
        return { section, list: rows };
      }

      const terms = sectionOf('整経の用語'); // キーが game. で始まらないもの
      const games = sectionOf('ゲームの名前'); // キーが game. で始まるもの

      function appendRow(target: HTMLDivElement, entry: { key: string; value: string; description: string; overridden: boolean }): void {
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
          label: '変更',
          variant: 'secondary',
          // テストで行のキーを判別できるように testId にキーを入れる
          testId: entry.key,
          onClick: async () => {
            const v = await textInputDialog(root, {
              // 題名はプログラム用のキーでなく「『今の呼び名』の呼び名」
              title: `『${entry.value}』の呼び名`,
              initial: entry.value,
              maxLength: 10,
            });
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
            label: '元に戻す',
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
        target.appendChild(line);
      }

      function render(): void {
        terms.list.textContent = '';
        games.list.textContent = '';
        for (const entry of ctx.terms.entries()) {
          const target = entry.key.startsWith('game.') ? games.list : terms.list;
          appendRow(target, entry);
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
