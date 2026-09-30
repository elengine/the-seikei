import type { AppContext } from '../context';
import type { Screen } from '../screenManager';
import { createButton, createChoice, textInputDialog } from '../../core/ui/widgets';
import { createCard, createPage, createScreenHeader, createSectionHeading } from '../../core/ui/layout';
import type { FontScale } from '../../core/ui/tokens';

/** 音の大きさの3段階 (小・中・大) */
const VOLUMES = [
  { value: '0.4', label: '小' },
  { value: '0.7', label: '中' },
  { value: '1', label: '大' },
] as const;

/** 設定画面。節の見出し+カードのまとまりに、項目を1行ずつ並べる */
export function createSettingsScreen(ctx: AppContext): Screen {
  return {
    mount(container: HTMLElement): void {
      const root = document.createElement('div');
      root.classList.add('settings');
      root.appendChild(createScreenHeader({ title: '設定', onBack: () => ctx.navigate('/') }));
      const page = createPage({ width: 'form' });
      root.appendChild(page);

      function row(label: string): { row: HTMLDivElement; value: HTMLSpanElement; actions: HTMLDivElement } {
        const line = document.createElement('div');
        line.classList.add('settings__row');
        const l = document.createElement('span');
        l.classList.add('settings__label');
        l.textContent = label;
        const v = document.createElement('span');
        v.classList.add('settings__value');
        const a = document.createElement('div');
        a.classList.add('settings__actions');
        line.appendChild(l);
        line.appendChild(v);
        line.appendChild(a);
        return { row: line, value: v, actions: a };
      }

      /** 節 (見出し + 白いカード)。カードの中の行を返す */
      function section(heading: string): HTMLElement {
        const wrap = document.createElement('section');
        wrap.classList.add('settings__section');
        wrap.appendChild(createSectionHeading(heading));
        const card = createCard();
        card.classList.add('settings__card');
        wrap.appendChild(card);
        page.appendChild(wrap);
        return card;
      }

      const refreshers: Array<() => void> = [];
      function refresh(): void {
        for (const f of refreshers) {
          f();
        }
      }

      // ---- お店とお名前 ----
      const shopCard = section('お店とお名前');

      const nameRow = row('お名前');
      nameRow.actions.appendChild(
        createButton({
          label: '変更',
          variant: 'secondary',
          onClick: () => {
            void (async () => {
              const v = await textInputDialog(root, { title: 'お名前', initial: ctx.settings.get().playerName, maxLength: 10 });
              if (v !== null) {
                await ctx.settings.update({ playerName: v });
                refresh();
              }
            })();
          },
        }),
      );
      refreshers.push(() => {
        const name = ctx.settings.get().playerName;
        nameRow.value.textContent = name === '' ? '（未設定）' : name;
        nameRow.value.classList.toggle('settings__value--empty', name === '');
      });
      shopCard.appendChild(nameRow.row);

      const shopRow = row('屋号');
      shopRow.actions.appendChild(
        createButton({
          label: '変更',
          variant: 'secondary',
          onClick: () => {
            void (async () => {
              const v = await textInputDialog(root, { title: '屋号', initial: ctx.settings.get().shopName, maxLength: 12 });
              if (v !== null) {
                await ctx.settings.update({ shopName: v });
                refresh();
              }
            })();
          },
        }),
      );
      refreshers.push(() => {
        const shop = ctx.settings.get().shopName;
        shopRow.value.textContent = shop === '' ? '（未設定）' : shop;
        shopRow.value.classList.toggle('settings__value--empty', shop === '');
      });
      shopCard.appendChild(shopRow.row);

      // ---- 見やすさと音 ----
      const viewCard = section('見やすさと音');

      // 文字の大きさ: 大 / 特大 (画面全体が切り替わる。context の onChange が反映)
      const fontRow = row('文字の大きさ');
      const fontChoice = createChoice<FontScale>({
        options: [
          { value: 'large', label: '大' },
          { value: 'xlarge', label: '特大' },
        ],
        value: ctx.settings.get().fontScale,
        ariaLabel: '文字の大きさ',
        onChange: (v) => {
          void (async () => {
            await ctx.settings.update({ fontScale: v });
            ctx.audio.play('tap'); // 選ぶ部品 (choice) は音を鳴らさないので、ここで鳴らす
            refresh();
          })();
        },
      });
      fontRow.actions.appendChild(fontChoice.root);
      refreshers.push(() => fontChoice.setValue(ctx.settings.get().fontScale));
      viewCard.appendChild(fontRow.row);

      // 音: 鳴らす / 鳴らさない
      const soundRow = row('音');
      const soundChoice = createChoice<'on' | 'off'>({
        options: [
          { value: 'on', label: '鳴らす' },
          { value: 'off', label: '鳴らさない' },
        ],
        value: ctx.settings.get().soundOn ? 'on' : 'off',
        ariaLabel: '音',
        onChange: (v) => {
          void (async () => {
            const on = v === 'on';
            await ctx.settings.update({ soundOn: on });
            ctx.audio.setEnabled(on);
            if (on) {
              ctx.audio.play('ok');
            }
            refresh();
          })();
        },
      });
      soundRow.actions.appendChild(soundChoice.root);
      refreshers.push(() => soundChoice.setValue(ctx.settings.get().soundOn ? 'on' : 'off'));
      viewCard.appendChild(soundRow.row);

      // 音の大きさ: 小 / 中 / 大 (0.4 / 0.7 / 1.0)
      const volumeRow = row('音の大きさ');
      const nearestVolume = (): string => {
        const cur = ctx.settings.get().volume;
        const hit = VOLUMES.find((x) => Math.abs(Number(x.value) - cur) < 0.01);
        return hit?.value ?? '0.7';
      };
      const volumeChoice = createChoice<string>({
        options: VOLUMES.map((x) => ({ value: x.value, label: x.label })),
        value: nearestVolume(),
        ariaLabel: '音の大きさ',
        onChange: (v) => {
          void (async () => {
            const volume = Number(v);
            await ctx.settings.update({ volume });
            ctx.audio.setVolume(volume);
            ctx.audio.play('ok'); // 変更したら ok の音を鳴らして聞かせる
            refresh();
          })();
        },
      });
      volumeRow.actions.appendChild(volumeChoice.root);
      refreshers.push(() => volumeChoice.setValue(nearestVolume()));
      viewCard.appendChild(volumeRow.row);

      // ---- ことば ----
      const wordsCard = section('ことば');
      const termsRow = row('呼び名の変更');
      termsRow.value.textContent = '整経の用語・ゲームの名前';
      termsRow.actions.appendChild(
        createButton({
          label: '開く',
          variant: 'secondary',
          icon: 'next',
          onClick: () => ctx.navigate('/settings/terms'),
        }),
      );
      wordsCard.appendChild(termsRow.row);

      refresh(); // 初期値の表示

      // ---- 一番下の左: 管理者 (小さな副ボタン。押せる部品の決まり 64px 以上) ----
      const adminArea = document.createElement('div');
      adminArea.classList.add('settings__admin');
      const adminBtn = createButton({
        label: '管理者',
        variant: 'secondary',
        onClick: () => {
          void (async () => {
            const v = await textInputDialog(root, { title: '管理者', initial: '', maxLength: 8 });
            if (v === '1967') {
              ctx.navigate('/admin');
            } // 違えば何もせず閉じる
          })();
        },
      });
      adminBtn.classList.add('settings__admin-btn');
      adminArea.appendChild(adminBtn);
      page.appendChild(adminArea);

      container.textContent = '';
      container.appendChild(root);
    },

    unmount(): void {
      // root は container ごと取り除かれる
    },
  };
}
