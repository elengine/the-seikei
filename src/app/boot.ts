import { createAppContext } from './context';
import type { AppContext } from './context';
import { setButtonSound } from '../core/ui/widgets';
import type { Clock } from '../core/clock/clock';
import { runMigrations } from '../core/storage/migrations';
import { MIGRATIONS } from '../core/storage/migrations';
import { CURRENT_SCHEMA_VERSION } from '../core/storage/types';

let touchstartInstalled = false;

export type BootResult = { ok: true; ctx: AppContext } | { ok: false; reason: string };

export async function boot(opts: { dbName: string; clock: Clock; navigate: (p: string) => void }): Promise<BootResult> {
  // 0. iPad Safari で :active を効かせる空の touchstart リスナーを1回だけ付ける
  if (!touchstartInstalled) {
    touchstartInstalled = true;
    document.addEventListener('touchstart', () => {}, { passive: true });
  }

  // 1. AppContext を作る
  const ctx = await createAppContext({ dbName: opts.dbName, clock: opts.clock, navigate: opts.navigate });

  // 1b. ボタンを押したときの音 (createButton が鳴らす。各画面では鳴らさない)
  setButtonSound(() => {
    ctx.audio.play('tap');
  });

  // 2. データ移行を実行する。例外なら ok:false を返し、ログに error を残す
  try {
    const result = await runMigrations(ctx.repo, MIGRATIONS, CURRENT_SCHEMA_VERSION);
    if (result.migrated > 0) {
      ctx.logger.log('info', `データ移行: 版 ${result.from} から ${result.to} へ (${result.migrated}件)`);
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    try {
      ctx.logger.log('error', `データ移行に失敗: ${reason}`);
    } catch {
      // ログに書けなくても移行失敗の報告を優先する
    }
    return { ok: false, reason };
  }

  // 3. 永続化を要求する (結果は info ログに残すだけ。失敗しても続行)
  try {
    const persisted = await navigator.storage?.persist?.();
    ctx.logger.log('info', `永続化の要求: ${persisted === undefined ? '対応なし' : persisted ? '許可された' : '許可されなかった'}`);
  } catch {
    try {
      ctx.logger.log('info', '永続化の要求: 対応なし');
    } catch {
      // 無視する
    }
  }

  // 4. 成功
  return { ok: true, ctx };
}
