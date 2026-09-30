import type { AppContext } from '../context';
import type { Screen } from '../screenManager';
import { createButton, textInputDialog } from '../../core/ui/widgets';
import { createCard, createPage, createScreenHeader, createSectionHeading } from '../../core/ui/layout';

/** 呼び名の変更画面 (#/settings/terms)。整経の用語とゲームの名前の2つの節に分けて表示する */
export function createTermsScreen(ctx: AppContext): Screen {
  return {
    mount(container: HTMLElement): void {
      const root = document.createElement('div');
      root.classList.add('terms');
      root.appendChild(createScreenHeader({ title: '呼び名の変更', onBack: () => ctx.navigate('/settings') }));
      const page = createPage({ width: 'form' });
      page.classList.add('terms__list');
      root.appendChild(page);

      /** 節を作る (見出し + 白いカードの中に行) */
      function sectionOf(headText: string): HTMLElement {
        const section = document.createElement('div');
        section.classList.add('terms__section');
        section.appendChild(createSectionHeading(headText));
        const card = createCard();
        card.classList.add('terms__rows');
        section.appendChild(card);
        page.appendChild(section);
        return card;
      }

      const terms = sectionOf('整経の用語'); // キーが game. で始まらないもの
      const games = sectionOf('ゲームの名前'); // キーが game. で始まるもの

      function appendRow(target: HTMLElement, entry: { key: string; value: string; description: string; overridden: boolean }): void {
        const line = document.createElement('div');
        line.classList.add('terms__row');

        const main = document.createElement('div');
        main.classList.add('terms__main');
        const value = document.createElement('p');
        value.classList.add('terms__value'); // 現在の呼び名 (24px 太字)
        value.textContent = entry.value;
        const desc = document.createElement('p');
        desc.classList.add('terms__desc'); // 説明 (20px・補足の色)
        desc.textContent = entry.description;
        main.appendChild(value);
        main.appendChild(desc);

        const actions = document.createElement('div');
        actions.classList.add('settings__actions');
        actions.appendChild(
          createButton({
            label: '変更',
            variant: 'secondary',
            // テストで行のキーを判別できるように testId にキーを入れる
            testId: entry.key,
            onClick: () => {
              void (async () => {
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
              })();
            },
          }),
        );
        if (entry.overridden) {
          // 上書き中なら「元に戻す」
          actions.appendChild(
            createButton({
              label: '元に戻す',
              variant: 'secondary',
              onClick: () => {
                void (async () => {
                  await ctx.terms.reset(entry.key);
                  render();
                })();
              },
            }),
          );
        }

        line.appendChild(main);
        line.appendChild(actions);
        target.appendChild(line);
      }

      function render(): void {
        terms.textContent = '';
        games.textContent = '';
        for (const entry of ctx.terms.entries()) {
          appendRow(entry.key.startsWith('game.') ? games : terms, entry);
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
