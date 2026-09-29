import type { AppContext } from '../context';
import type { Screen } from '../screenManager';
import { createButton, textInputDialog } from '../../core/ui/widgets';

/** 設定画面。現在の値と「変更」ボタンを1行ずつ並べる */
export function createSettingsScreen(ctx: AppContext): Screen {
  return {
    mount(container: HTMLElement): void {
      const root = document.createElement('div');
      root.classList.add('settings');

      const title = document.createElement('h1');
      title.classList.add('settings__title');
      title.textContent = '設定';
      root.appendChild(title);

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

      const rerender: { fns: Array<() => void> } = { fns: [] };

      function refresh(): void {
        for (const f of rerender.fns) {
          f();
        }
      }

      // お名前
      const nameRow = row('お名前');
      const nameInput = async (): Promise<void> => {
        const v = await textInputDialog(root, { title: 'お名前', initial: ctx.settings.get().playerName, maxLength: 10 });
        if (v !== null) {
          await ctx.settings.update({ playerName: v });
          refresh();
        }
      };
      const nameBtn = createButton({ label: '変更', variant: 'secondary', onClick: () => void nameInput() });
      nameRow.actions.appendChild(nameBtn);
      rerender.fns.push(() => {
        nameRow.value.textContent = ctx.settings.get().playerName === '' ? '（未設定）' : ctx.settings.get().playerName;
      });
      root.appendChild(nameRow.row);

      // 屋号
      const shopRow = row('屋号');
      const shopInput = async (): Promise<void> => {
        const v = await textInputDialog(root, { title: '屋号', initial: ctx.settings.get().shopName, maxLength: 12 });
        if (v !== null) {
          await ctx.settings.update({ shopName: v });
          refresh();
        }
      };
      const shopBtn = createButton({ label: '変更', variant: 'secondary', onClick: () => void shopInput() });
      shopRow.actions.appendChild(shopBtn);
      rerender.fns.push(() => {
        shopRow.value.textContent = ctx.settings.get().shopName;
      });
      root.appendChild(shopRow.row);

      // 文字の大きさ: 大 / 特大
      const fontRow = row('文字の大きさ');
      function fontButtons(): void {
        fontRow.actions.textContent = '';
        for (const [label, value] of [['大', 'large'], ['特大', 'xlarge']] as const) {
          const b = createButton({
            label,
            variant: 'secondary',
            onClick: async () => {
              await ctx.settings.update({ fontScale: value }); // 文字の大きさは画面全体が切り替わる (context の onChange が反映)
              ctx.audio.play('tap');
              refresh();
            },
          });
          if (ctx.settings.get().fontScale === value) {
            b.classList.add('settings__current'); // 選ばれている方は藍の地・白文字 + ✓
            b.textContent = `✓ ${label}`;
          }
          fontRow.actions.appendChild(b);
        }
      }
      rerender.fns.push(fontButtons);
      root.appendChild(fontRow.row);

      // 音: 鳴らす / 鳴らさない
      const soundRow = row('音');
      function soundButtons(): void {
        soundRow.actions.textContent = '';
        for (const [label, value] of [['鳴らす', true], ['鳴らさない', false]] as const) {
          const b = createButton({
            label,
            variant: 'secondary',
            onClick: async () => {
              await ctx.settings.update({ soundOn: value });
              ctx.audio.setEnabled(value);
              if (value) {
                ctx.audio.play('ok');
              }
              refresh();
            },
          });
          if (ctx.settings.get().soundOn === value) {
            b.classList.add('settings__current');
            b.textContent = `✓ ${label}`;
          }
          soundRow.actions.appendChild(b);
        }
      }
      rerender.fns.push(soundButtons);
      root.appendChild(soundRow.row);

      // 音の大きさ: 小 / 中 / 大 (0.4 / 0.7 / 1.0)
      const volumeRow = row('音の大きさ');
      function volumeButtons(): void {
        volumeRow.actions.textContent = '';
        for (const [label, value] of [['小', 0.4], ['中', 0.7], ['大', 1.0]] as const) {
          const b = createButton({
            label,
            variant: 'secondary',
            onClick: async () => {
              await ctx.settings.update({ volume: value });
              ctx.audio.setVolume(value);
              ctx.audio.play('ok'); // 変更したら ok の音を鳴らして聞かせる
              refresh();
            },
          });
          if (Math.abs(ctx.settings.get().volume - value) < 0.01) {
            b.classList.add('settings__current');
            b.textContent = `✓ ${label}`;
          }
          volumeRow.actions.appendChild(b);
        }
      }
      rerender.fns.push(volumeButtons);
      root.appendChild(volumeRow.row);

      // 呼び名の変更 (画面は T0-16)
      const termsRow = row('呼び名の変更');
      const termsBtn = createButton({
        label: '変更',
        variant: 'secondary',
        onClick: () => {
          ctx.audio.play('tap');
          ctx.navigate('/settings/terms');
        },
      });
      termsRow.actions.appendChild(termsBtn);
      root.appendChild(termsRow.row);

      refresh(); // 初期値の表示

      // 最下部: 管理者 (小さめの副ボタン)
      const adminArea = document.createElement('div');
      adminArea.classList.add('settings__admin');
      const adminBtn = createButton({
        label: '管理者',
        variant: 'secondary',
        onClick: async () => {
          const v = await textInputDialog(root, { title: '管理者', initial: '', maxLength: 8 });
          if (v === '1967') {
            ctx.navigate('/admin');
          } // 違えば何もせず閉じる
        },
      });
      adminBtn.classList.add('settings__admin-btn');
      adminArea.appendChild(adminBtn);
      root.appendChild(adminArea);

      // 戻る (ホームへ)
      const backBtn = createButton({
        label: '戻る',
        variant: 'secondary',
        onClick: () => {
          ctx.audio.play('tap');
          ctx.navigate('/');
        },
      });
      root.appendChild(backBtn);

      container.textContent = '';
      container.appendChild(root);
    },

    unmount(): void {
      // root は container ごと取り除かれる
    },
  };
}
