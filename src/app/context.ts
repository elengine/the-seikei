import { createLocalRepository } from '../core/storage/localRepository';
import type { Repository, RawStore } from '../core/storage/types';
import type { Clock } from '../core/clock/clock';
import { createTerms } from '../core/terms/terms';
import type { Terms } from '../core/terms/terms';
import termsDefault from '../content/terms.default.json';
import { createSettingsService } from '../core/settings/settings';
import type { SettingsService } from '../core/settings/settings';
import { createAudioPlayer } from '../core/audio/audio';
import type { AudioPlayer } from '../core/audio/audio';
import { createLogger } from '../core/log/log';
import type { Logger } from '../core/log/log';
import { createZukanRegistry } from '../core/zukanRegistry/zukan';
import type { ZukanRegistry } from '../core/zukanRegistry/zukan';
import { createRecords } from '../core/game/records';
import type { Records } from '../core/game/records';
import { applyFontScale } from '../core/ui/tokens';
import type { FontScale } from '../core/ui/tokens';
import type { GameDeps } from '../core/game/types';

/**
 * 画面から使う共通の道具 (保存、用語、音、設定、画面移動) を1つにまとめたもの。
 */
export interface AppContext {
  repo: Repository & RawStore;
  clock: Clock;
  deviceId: string;
  terms: Terms;
  settings: SettingsService;
  audio: AudioPlayer;
  logger: Logger;
  zukan: ZukanRegistry;
  records: Records;
  navigate(path: string): void;
}

export async function createAppContext(opts: {
  dbName: string;
  clock: Clock;
  navigate: (path: string) => void;
}): Promise<AppContext> {
  // deviceId は指定しない (repo が meta から読むか作る)
  const repo = await createLocalRepository({ dbName: opts.dbName, clock: opts.clock });
  const terms = await createTerms(repo, termsDefault);
  const settings = await createSettingsService(repo, opts.clock);
  const audio = createAudioPlayer();

  // settings の soundOn と volume を audio に反映し、変更時にも追従させる
  function applyAudio(s: { soundOn: boolean; volume: number }): void {
    audio.setEnabled(s.soundOn);
    audio.setVolume(s.volume);
  }
  applyAudio(settings.get());
  settings.onChange((s) => {
    applyAudio(s);
  });

  const logger = await createLogger(repo, opts.clock);
  const zukan = await createZukanRegistry(repo, opts.clock);
  const records = await createRecords(repo);

  // settings の fontScale を反映し、変更時にも追従させる
  function applyFont(s: { fontScale: FontScale }): void {
    applyFontScale(document.documentElement, s.fontScale);
  }
  applyFont(settings.get());
  settings.onChange((s) => {
    applyFont(s);
  });

  return {
    repo,
    clock: opts.clock,
    deviceId: repo.deviceId,
    terms,
    settings,
    audio,
    logger,
    zukan,
    records,
    navigate: opts.navigate,
  };
}

/** AppContext からゲーム用の GameDeps を作る。各ゲームは createXxxModule(deps) の形で使う */
export function gameDepsFrom(ctx: AppContext): GameDeps {
  return {
    terms: ctx.terms,
    audio: ctx.audio,
    records: ctx.records,
    clock: ctx.clock,
    log: (level, message) => ctx.logger.log(level, message),
    unlockAll: () => ctx.settings.get().unlockAll,
  };
}
