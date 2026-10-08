import type { AppContext } from '../context';
import type { Screen } from '../screenManager';
import { confirmDialog, createButton, createChoice, textInputDialog } from '../../core/ui/widgets';
import { clearProgress } from '../../core/storage/clearProgress';
import { createCard, createPage, createScreenHeader, createSectionHeading } from '../../core/ui/layout';
import { FONT } from '../../core/ui/tokens';
import type { FontScale } from '../../core/ui/tokens';
import { applyUpdate, checkForUpdate, isUpdateReady, onUpdateState } from '../updater';

/** 音の大きさの3段階 (小・中・大) */
const VOLUMES = [
  { value: '0.4', label: '小' },
  { value: '0.7', label: '中' },
  { value: '1', label: '大' },
] as const;

/** 文字の大きさのスライダー (1〜5)。両端に「小」「大」、5つの目盛り、見本の文。onCommit は指を離したとき */
function createFontSlider(
  initial: FontScale,
  onCommit: (v: FontScale) => void,
): { root: HTMLElement; setValue(v: FontScale): void } {
  const root = document.createElement('div');
  root.classList.add('font-slider');
  const track = document.createElement('div');
  track.classList.add('font-slider__track');
  const small = document.createElement('span');
  small.textContent = '小';
  small.classList.add('font-slider__end');
  const large = document.createElement('span');
  large.textContent = '大';
  large.classList.add('font-slider__end');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '1';
  input.max = '5';
  input.step = '1';
  input.classList.add('font-slider__input');
  input.setAttribute('aria-label', '文字の大きさ');
  const wrap = document.createElement('div');
  wrap.classList.add('font-slider__wrap');
  wrap.appendChild(input);
  const ticks = document.createElement('div');
  ticks.classList.add('font-slider__ticks');
  ticks.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 5; i++) {
    const t = document.createElement('span');
    t.classList.add('font-slider__tick');
    ticks.appendChild(t);
  }
  wrap.appendChild(ticks);
  track.appendChild(small);
  track.appendChild(wrap);
  track.appendChild(large);
  const sample = document.createElement('p');
  sample.classList.add('font-slider__sample');
  sample.textContent = 'この大きさで表示します';
  root.appendChild(track);
  root.appendChild(sample);

  const asScale = (n: number): FontScale => (n >= 1 && n <= 5 ? (Math.round(n) as FontScale) : 1);
  function show(v: FontScale): void {
    input.value = String(v);
    input.setAttribute('aria-valuetext', `段階${v}`);
    input.style.setProperty('--fill', `${((v - 1) / 4) * 100}%`);
    sample.style.fontSize = `${FONT[v].body}px`; // 選んでいる大きさで見せる (まだ画面全体は変えない)
  }
  show(initial);
  input.addEventListener('input', () => show(asScale(Number(input.value))));
  input.addEventListener('change', () => onCommit(asScale(Number(input.value))));
  return { root, setValue: show };
}

/** 設定画面。節の見出し+カードのまとまりに、項目を1行ずつ並べる */
export function createSettingsScreen(ctx: AppContext): Screen {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let offUpdate: (() => void) | null = null;
  let disposed = false;

  /** タイマーを予約する (unmount で全部止める) */
  function later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  return {
    mount(container: HTMLElement): void {
      disposed = false;
      const root = document.createElement('div');
      root.classList.add('settings');

      // 見出しの行の右上: アップデートの確認 (押すとアイコンが回り、新しい版を確かめる)
      const refreshBtn = createButton({
        label: 'アップデートを確認',
        variant: 'secondary',
        icon: 'refresh',
        shape: 'circle',
        onClick: () => {
          void runCheck();
        },
      });
      root.appendChild(createScreenHeader({ title: '設定', onBack: () => ctx.navigate('/'), right: refreshBtn }));
      const page = createPage({ width: 'form' });
      root.appendChild(page);

      // 見出しの行のすぐ下: 「アップデートがあります。」+「アップデートする」、または短い案内
      const notice = document.createElement('div');
      notice.classList.add('update-notice');
      notice.setAttribute('role', 'status');
      page.appendChild(notice);
      let noticeTimer: ReturnType<typeof setTimeout> | null = null;

      function clearNotice(): void {
        if (noticeTimer !== null) {
          clearTimeout(noticeTimer);
          timers.delete(noticeTimer);
          noticeTimer = null;
        }
        notice.textContent = '';
      }

      function showText(text: string, hideAfterMs?: number): void {
        clearNotice();
        const p = document.createElement('p');
        p.classList.add('update-notice__text');
        p.textContent = text;
        notice.appendChild(p);
        if (hideAfterMs !== undefined) {
          const t = setTimeout(() => {
            timers.delete(t);
            noticeTimer = null;
            notice.textContent = '';
          }, hideAfterMs);
          timers.add(t);
          noticeTimer = t;
        }
      }

      function showAvailable(): void {
        clearNotice();
        const p = document.createElement('p');
        p.classList.add('update-notice__text', 'update-notice__text--alert'); // 朱の文字
        p.textContent = 'アップデートがあります。';
        notice.appendChild(p);
        notice.appendChild(createButton({ label: 'アップデートする', variant: 'primary', onClick: () => void runApply() }));
      }

      // 「アップデートする」: 切り替われば画面が読み込み直される。切り替わらなかったときは、そのことを伝える (押し直せる)
      let applying = false;
      async function runApply(): Promise<void> {
        if (applying) {
          return;
        }
        applying = true;
        const ok = await applyUpdate();
        applying = false;
        if (!ok && !disposed) {
          showAvailable();
          const p = document.createElement('p');
          p.classList.add('update-notice__text');
          p.textContent = '切り替えられませんでした。アプリを閉じて、もう一度開いてください';
          notice.appendChild(p);
        }
      }

      let checking = false;
      async function runCheck(): Promise<void> {
        if (checking) {
          return;
        }
        checking = true;
        refreshBtn.classList.add('btn--spinning');
        clearNotice();
        // 確認が早く終わっても、最低 0.8 秒は回して「確かめた」ことを見せる
        const minWait = new Promise<void>((resolve) => later(800, resolve));
        const [result] = await Promise.all([checkForUpdate(), minWait]);
        if (disposed) {
          return;
        }
        checking = false;
        refreshBtn.classList.remove('btn--spinning');
        if (result === 'available') {
          showAvailable();
        } else if (result === 'latest') {
          showText('最新のバージョンです', 3000);
        } else {
          showText('確認できませんでした。通信を確かめてください');
        }
      }

      // 開いたときすでに届いていれば最初から出す。あとから届いたことも受け取る
      if (isUpdateReady()) {
        showAvailable();
      }
      offUpdate?.();
      offUpdate = onUpdateState((ready) => {
        if (ready) {
          showAvailable();
        }
      });

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

      // 文字の大きさ: 1〜5 の5段階のスライダー。動かしているあいだは見本の文だけがすぐ変わり、
      // 設定の保存 (画面全体の切り替え) は指を離したとき (change)
      const fontRow = row('文字の大きさ');
      fontRow.row.classList.add('settings__row--slider');
      const slider = createFontSlider(ctx.settings.get().fontScale, (v) => {
        void (async () => {
          await ctx.settings.update({ fontScale: v });
          ctx.audio.play('tap'); // スライダーは音を鳴らさないので、ここで鳴らす
          refresh();
        })();
      });
      fontRow.row.appendChild(slider.root);
      fontRow.value.remove();
      fontRow.actions.remove();
      refreshers.push(() => slider.setValue(ctx.settings.get().fontScale));
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

      // ---- 記録: ゲームの記録を消す (2 回の確認つき。PU-22) ----
      const recordCard = section('記録');
      const dangerBtn = createButton({
        label: 'ゲームの記録を消す',
        variant: 'danger',
        onClick: () => void runClear(),
      });
      dangerBtn.classList.add('settings__danger-btn');
      recordCard.appendChild(dangerBtn);
      const dangerNote = document.createElement('p');
      dangerNote.classList.add('settings__danger-note');
      dangerNote.textContent = '星・途中の状態・図鑑を消します。お名前や設定は残ります';
      recordCard.appendChild(dangerNote);

      async function runClear(): Promise<void> {
        // 1 回目: 「はい」「いいえ」。2 回目は、押し間違いを防ぐため、何が起きるか分かる言葉 (「消す」「やめる」)
        const first = await confirmDialog(root, {
          title: 'ゲームの記録を消しますか',
          message: 'すべてのゲームの星と途中の状態、図鑑が消えます。お名前・屋号・設定は残ります',
          okLabel: 'はい',
          cancelLabel: 'いいえ',
        });
        if (!first || disposed) {
          return;
        }
        const secondPromise = confirmDialog(root, {
          title: '本当に消しますか',
          message: '消した記録は元に戻せません。残しておきたいときは、先にバックアップを書き出してください',
          okLabel: '消す',
          cancelLabel: 'やめる',
        });
        const okBtn = root.querySelector<HTMLButtonElement>('[data-testid="dialog-ok"]');
        okBtn?.classList.remove('btn--primary');
        okBtn?.classList.add('btn--danger'); // 危険の見た目
        if (!(await secondPromise) || disposed) {
          return;
        }
        try {
          const r = await clearProgress(ctx.repo);
          ctx.logger.log('info', `ゲームの記録を消しました (${r.removed}件)`);
          showText('記録を消しました', 4000);
        } catch (e) {
          ctx.logger.log('warn', `ゲームの記録を消せませんでした: ${e instanceof Error ? e.message : String(e)}`);
          showText('消せませんでした。もう一度お試しください', 6000);
        }
      }

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
      disposed = true;
      offUpdate?.();
      offUpdate = null;
      for (const t of timers) {
        clearTimeout(t);
      }
      timers.clear();
      // root は container ごと取り除かれる
    },
  };
}
