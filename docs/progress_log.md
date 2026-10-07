# 進行記録 (progress_log)

PROGRESS.json の checks (タスクごとの詳しい確認結果) と notes (気づいた点) を、2026-09-28 の「PROGRESS 整理」でここへ移した。以後の詳しい記録もこの末尾に追記する。

## T0-01

- **npm_install**: ok
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)
- **npm_test**: ok (1 passed)
- **npm_run_build**: ok (dist生成)
- **npm_run_dev**: ok (/the-seikei/ で title=整経ゲーム、main.ts が「整経ゲーム 準備中」を出力)
- **core_import_guard**: src/core/sample.ts に import '../app/x' → eslint no-restricted-imports で error (exit 1) を確認後、ファイル削除済み

## T0-02

- **workflow**: .github/workflows/deploy.yml を仕様どおり作成 (push main + workflow_dispatch, permissions, concurrency pages, build+deploy ジョブ)
- **pages_api**: POST /repos/elengine/the-seikei/pages build_type=workflow は T0-00 で設定済み

## T0-03

- **test_first**: clock.test.ts を先に作成し、実装前に失敗することを確認 (RED確認済み)
- **npm_test**: ok (10 passed: 仕様書テスト7項目+補助3件)
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)

## T0-04

- **types**: src/core/storage/types.ts を仕様どおり作成 (CollectionName/Rec/BackupFile/ImportReport/Repository/RawStore/CURRENT_SCHEMA_VERSION)
- **contract**: tests/contract/repositoryContract.ts に runRepositoryContract を作成。仕様書の振る舞い1〜9 + 補助2件を登録
- **clock_contract**: 管理者補足どおり: id省略 put は createdAt===updatedAt (実装側で1 put=now()1回の前提)。テスト期待値は時計の都合で変更していない
- **stub**: tests/contract/stub.test.ts は describe.skip で登録 (11 skipped)
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)
- **npm_test**: ok (10 passed / 11 skipped — 契約テストは T0-05 の実装で有効化)

## T0-05

- **impl**: src/core/storage/localRepository.ts を Dexie 4.4.6 で作成。version 1, recs=key(=collection+\u0000+id)主キー+collection/updatedAt索引, meta=key主キー
- **contract_result**: runRepositoryContract('LocalRepository (Dexie)') が全件 pass
- **deviceid_test**: deviceId 未指定→UUID 生成・同 dbName 再生成で同一値・削済み put で復活(deletedAt 消去, createdAt 引き継ぎ)・importAll は throw の4件を localRepository.test.ts に追加
- **contract_loosen**: 管理者指示により契約テスト補助1件を「ISO 8601 形式で START_ISO 以上」に緩和 (repositoryContract.ts 変更は T0-05 コミットに同梱)
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)
- **npm_test**: ok (24 passed / 11 skipped)
- **fix_2026_09_28**: T0-05 追加修正: ①RecRow に updatedAt を持たせ put/remove/putRaw すべてで設定 (updatedAt 索引が有効化。where('updatedAt').above() のテストを追加) ②put の削除済み復活を if 文なし「新しい rec に deletedAt を含めない」方式に整理 ③RecRow.key のコメントを実形式 (collection + '\u0000' + id) に修正。テスト用に SeikeiDbForTest を export (アプリ側は不使用)

## T0-06

- **impl**: src/core/storage/merge.ts (235行) — MergeRule/RULES/mergeRec/isNewer を仕様どおり作成
- **test_first**: merge.test.ts を先に作成し実装前に失敗することを確認 (RED確認済み)
- **npm_test**: ok (43 passed / 11 skipped — merge 18件: 仕様書テスト6項目+ルール別詳細)
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)
- **fix_2026_09_28**: T0-06 追加修正 (管理者指摘の同点決着3件+型修正): ①fieldNewer 同時刻は updatedBy の大きい方を採る ②fieldNewer で新しい方に無いキーは古い方の値を残す ③union の obtainedAt 同時刻は isNewer の新しい方の source を採る ④CollectionName を types.ts から import に変更。テストは merge.tie.test.ts に分離 (RED確認後 GREEN)

## T0-07

- **migrations**: src/core/storage/migrations.ts (69行) — Migration/MIGRATIONS(空)/runMigrations/migrateRecs。meta schemaVersion 読み書き・全 Rec 移行後に保存 (例外時は無変更)・不足 Migration は例外
- **test_first**: migrations.test.ts (移行7件) と tests/import/localRepositoryImport.test.ts (importAll 6件) を先に書き RED 確認後に実装
- **importAll**: localRepository.ts に実装 (app 不一致/新しすぎる版→全件 rejected・migrateRecs で現行版化・getRaw 比較で added/updated/unchanged・変更コレクションの購読者に通知)
- **note**: T0-05 時点のテスト「importAll は throw する」は T0-07 で実装されたため削除 (期待値の陳腐化。テストの意図である移行・結合の検証は import テスト群が引き継ぐ)
- **npm_test**: ok (58 passed / 11 skipped — 移行7件+importAll 6件を含む)
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)

## T0-08

- **tokens**: src/core/ui/tokens.ts (38行) — COLORS/FONT/SIZE/MOTION/FONT_FAMILY/applyFontScale を 03_basic_design 2.1〜2.4 どおり作成
- **base_css**: src/styles/base.css — :root に全色・間隔の CSS 変数、T0-01 の直書き色を変数に置換。data-font=xlarge で文字サイズ切替。部品クラス (.btn/.btn--primary/.btn--secondary/.dialog*/.text-input) を追加。押下沈み (translateY(2px))・フォーカス時藍の枠
- **widgets**: src/core/ui/widgets.ts (162行) — createButton/confirmDialog/textInputDialog。data-testid 対応・閉じたら DOM 除去・背景押下では閉じない・空入力時 ok disabled
- **test_first**: widgets.test.ts (仕様書テスト1〜4+補助3件) を先に書き RED 確認後に実装
- **npm_test**: ok (64 passed / 11 skipped)
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)
- **main_ts**: src/main.ts は未変更 (仕様どおり)
- **fix_2026_09_28**: T0-08 追加修正: ①.btn:disabled 追加 (machine-light地/sumi-sub文字/not-allowed/transform:none) ②textInputDialog は trim 後空なら disabled・決定値も trim ③tokens.test.ts 新規 (COLORS/FONT/SIZE と base.css の変数の一致を機械検証) ④ダイアログ開時に input.focus() ⑤widgets.ts の void COLORS と import を削除。テスト実行に必要な @types/node を devDependencies に追加、tsconfig types に vite/client+node

## T0-09

- **impl**: src/core/viewport/viewport.ts (95行) — layoutOf/fitStage/currentSize/onViewportChange/setupCanvas
- **test_first**: viewport.test.ts (仕様書テスト1〜4+補助6件) を先に書き RED 確認後に実装
- **fitStage_note**: scale=min(availW/logicalW, availH/logicalH)、余白は収まった描画域の周囲に (avail-論理*scale)/2 で均等配分 (仕様書例2・3と整合)
- **onviewport_note**: scheduled フラグで同フレーム内の複数変化を1回の requestAnimationFrame にまとめ、解除は window 2種+visualViewport resize の remove
- **npm_test**: ok (80 passed / 11 skipped)
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)
- **fix_2026_09_28**: T0-09 追加修正: ①onViewportChange の解除関数が予約済み raf を cancelAnimationFrame で取り消す (テスト: resize発火→フレーム前に解除→cb呼ばれず。RED確認後GREEN) ②eslint.config.js に src/**/*.test.ts 以外で node:* と Node 専用モジュール (fs/path/process等) を禁止する no-restricted-imports ルール。src/core/sample.ts で node:*・無prefix の両方エラーになることを確認後削除。テストファイルは eslint exit 0

## T0-10

- **screen_manager**: src/app/screenManager.ts (104行) — matchRoute (純粋関数, '#'なし/空は'/'扱い, params は decodeURIComponent) と createScreenManager (切替時は必ず前画面 unmount→container 空→mount, 未一致は '/' へ navigate)
- **game_types**: src/core/game/types.ts (50行) — 02_architecture 5.1 の GameModule/GameProps/GameInstance + GameId/TutorialPage/TutorialSpec/JobSpec/GameResult
- **registry**: src/core/game/registry.ts (28行) — registerGame(二重登録は例外)/getGame/listGames(登録順)/clearGamesForTest
- **test_first**: screenManager.test.ts (仕様書テスト1〜5をカバー) と registry.test.ts を先に書き RED 確認後に実装
- **npm_test**: ok (96 passed / 11 skipped)
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)
- **fix_2026_09_28**: T0-10 追加修正: ①matchRoute が decodeURIComponent の URIError (%E7 等の不正エンコード) を catch し、そのルートは一致しなかったものとして扱う (→ 未一致なので '/' へ navigate) ②unmountCurrent が前画面 unmount() の例外を try/catch し console.error に記録、そのうえで container を空にして次の mount を必ず行う (stop 時も container を空にする)。いずれも RED 確認後に実装

## T0-11

- **terms_default_json**: src/content/terms.default.json — 03_basic_design 5章の表 25キー (terms 20 + game.* 5)。説明は 01_requirements 10章、tension は「糸の引っ張られる強さ」、game.* は「ゲームの名前」
- **terms_ts**: src/core/terms/terms.ts (126行) — createTerms(repo, defaults)。起動時に terms を list してキャッシュ、t() 同期返し。set は trim・空なら reset と同じ・未知キーは例外。reset は論理削除。render は {{key}} 置換 (未知は残す)。entries は初期値の順。onChange は set/reset で呼ぶ
- **test_first**: terms.test.ts (仕様書テスト1〜6 + 追加2件: 空文字set=reset / entries の順とoverridden) を先に書き RED 確認後に実装
- **npm_test**: ok (105 passed / 11 skipped)
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)
- **fix_2026_09_28**: T0-11 追加修正: ①createTerms が repo.subscribe("terms", …) を登録し、外部変更 (importAll や将来の同期) で上書きキャッシュを読み直して onChange を呼ぶ。テスト: Terms 作成後に repo.put("terms",{value:"大枠"},"drum") → t("drum")==="大枠" & onChange 呼ばれ (vi.waitFor で非同期完了を待つ)。set/reset 自身の保存でも購読が反応するが二重でも壊れない作り ②terms.default.json の drum の説明を「桟を組んだかご状の胴。帯を順に巻き重ねる」に変更 (設計見直し)

## T0-12

- **sounds_ts**: src/core/audio/sounds.ts (40行) — SoundName 6種 / Note / SOUNDS (純粋データ)。tap 880Hz 60ms、ok 上がる2音、gentleNo 330Hz やわらかい1音、knot 3連音 (triangle)、page 740Hz 70ms、fanfare ド・ミ・ソ・ド 上昇。周波数 250〜2000Hz、gain 0.5 以下、全体長 2000ms 以下
- **audio_ts**: src/core/audio/audio.ts (89行) — createAudioPlayer(makeContext?)。unlock で AudioContext 作成+resume、play は unlock 前/無効時は何もしない。Note ごとに OscillatorNode+GainNode、頭と終わりに 10ms フェード、全体音量は共通 GainNode。例外は投げず無視
- **test_first**: audio.test.ts (仕様書テスト1〜5 + 追加2件: setVolume(-0.5)→0 / makeContext 例外でも play は投げない) を先に書き RED 確認後に実装
- **npm_test**: ok (114 passed / 11 skipped)
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)
- **note**: 実機での鳴動確認は T0-15 以降に管理者が実施 (仕様書どおり)
- **fix_2026_09_28**: T0-12 追加修正: ①makeContext 省略時の既定動作を追加 — defaultMakeContext() が new AudioContext() を返す (引数の既定値)。AudioContext が存在しない環境では unlock の try/catch が例外を無視し、音は鳴らないが例外も出ない (従来どおり) ②テスト2件を先に追加: 「makeContext を渡さず globalThis.AudioContext に偽物を置いて unlock → play("ok") で発振器が作られる」(vi.fn を new 対応にして戻り値 ctx を返す) と「AudioContext が存在しない環境 (undefined) で unlock しても例外が出ない」。RED 確認後に実装

## T0-13

- **game_frame**: src/core/ui/gameFrame.ts (146行) — 上部帯 72px (左もどる/中央題名/右あそびかた、いずれも64px以上)。landscape は盤面65%/右panel、portrait は盤面60%/下panel。setupCanvas+fitStage→onStageResize。onViewportChange で自動 resize、destroy で監視解除+DOM削除。Canvas が使えない環境では CSS サイズのみ合わせる
- **tutorial_overlay**: src/core/ui/tutorialOverlay.ts (106行) — showTutorial(parent, spec, {nextLabel?, startLabel?, onPage?}) → Promise<void>。1ページ=絵(Canvas draw)+text (--fs-body 想定)。ページ数「1 / 3」表示、戻るボタンは最初のページでは非表示。最後のページで「はじめる」→解決
- **result_view**: src/core/ui/resultView.ts (87行) — showResult → Promise<"again"|"home">。星は ★/☆ 文字 (aria-label 併用)。newPatternNames 空なら欄なし。表示後1.5s の演出 (result--settled) 中もボタン押せる
- **test_first**: gameParts.test.ts (仕様書テスト1〜3 + 補助4件、jsdom の getContext は空の偽物に差し替え) を先に書き RED 確認後に実装
- **npm_test**: ok (124 passed / 11 skipped)
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)
- **fix_2026_09_28**: T0-13 追加修正: ①base.css に #app { height:100%; box-sizing:border-box; padding:*: env(safe-area-inset-*) } を追加 (viewport-fit=cover 対応)。gameFrame は currentSize でなく parent の getBoundingClientRect (内寸) を基準に配置・レイアウト判定 (縦長テスト: 内寸600×800→portrait で盤面上60%)。テスト: parent の内寸を変えると盤面の scale が従う ②tutorialOverlay の戻るボタンを「もどる」→「まえへ」に変更 (テスト: 2ページ目で「まえへ」表示) ③チュートリアル Canvas は幅 min(560px, 画面幅の90%)、高さ=幅の2/3、setupCanvas で画素密度対応し draw には CSS px を渡す (テスト: 画面幅1000→560×373、400→360) ④gameFrame の不要な root0 を削除

## T0-14

- **settings_ts**: src/core/settings/settings.ts (112行) — SettingsData/DEFAULT_SETTINGS (shopName 整経所, volume 0.7 等)/createSettingsService。保存先 settings/main、data=SettingsData+_updated。update は patch のキーだけ _updated[key]=clock.now()、get() は _updated を含めず同期返し、読み込み時に無いキーは既定値で補う (削除済み Rec も既定値)
- **context_ts**: src/app/context.ts (65行) — createAppContext。createLocalRepository (deviceId 指定なし) → terms (terms.default.json) → settings → audio。soundOn/volume と fontScale を初期反映+onChange 追従。deviceId=repo.deviceId
- **test_first**: settings.test.ts (仕様書テスト1〜5 + 追加2件: get に _updated を含めない / 論理削除で既定値に戻る、fake-indexeddb) を先に書き RED 確認後に実装。context.ts は仕様書どおり単体テスト不要 (T0-15 で確認)
- **npm_test**: ok (132 passed / 11 skipped)
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)
- **fix_2026_09_28**: T0-14 追加修正: ①createSettingsService が repo.subscribe("settings", …) を登録し、外部変更 (importAll や将来の同期) で保存データを読み直してキャッシュ更新+onChange。テスト: サービス作成後に repo.put("settings",{…shopName:"山田整経"},"main") → get().shopName==="山田整経" & onChange に新しい設定が渡る (vi.waitFor)。update 自身の保存でも購読が反応するが二重でも壊れない ②FontScale を tokens.ts から import (独自定義を廃止)。共通の決まり: キャッシュする部品は必ず repo.subscribe で外からの変更を見張り読み直す

## T0-15

- **home_screen**: src/app/screens/homeScreen.ts — 屋号見出し+名前があれば「◯◯さん、こんにちは」、listGames が空なら「ゲームはただいま準備中です」、下部に副ボタン「せってい」。押すと tap 音
- **settings_screen**: src/app/screens/settingsScreen.ts — お名前(max10)/屋号(max12)は textInputDialog、文字の大きさ(大/特大+藍枠+いまの設定)、音(鳴らす/鳴らさない)、音の大きさ(小/中/大=0.4/0.7/1.0、変更で ok 音)、呼び名をかえる(#/settings/terms)、最下部に小さめ管理者ボタン(1967 で #/admin、違えば閉じる)、もどる
- **main_ts**: createSystemClock + createAppContext(seikei-game) + ScreenManager(/、/settings)、最初の pointerdown で audio.unlock (once)
- **browser_check**: CDP 検証実施 (dev サーバー :5199)。1180×820 と 412×915 の両方: ①屋号「整経所」と「ゲームはただいま準備中です」表示 ②屋号を「山田整経所」に変更→ホーム反映、再読み込み後も残る (確認後「整経所」に戻した) ③特大で本文 24px (data-font=xlarge、--fs-body 24px) ④ボタン高さすべて 64px 以上 (管理者ボタンのみ仕様どおり小さめ 48px) ⑤管理者に 0000 を入れても #/settings から移動しない
- **npm_test**: ok (134 passed / 11 skipped)
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)
- **npm_run_build**: ok (dist 生成)
- **fix_2026_09_28**: T0-15 追加修正: ①選択中ボタンを settings__current で背景 --c-ai・白文字・ラベル先頭に「✓ 」(文字の大きさ/音/音の大きさのすべて。「（いまの設定）」は「✓ 」に置換)。テスト新規 settingsScreen.test.ts (jsdom で mount、選択中のみ ✓+current、選択変更で ✓ が移る) ②設定画面の各行を CSS grid 3列 (項目名 minmax(9em,auto) / 今の値 1fr / ボタン auto 右端揃え) に変更。ブラウザ 1180×820 と 412×915 で actions 右端が全行 1156px / 388px でそろうことを確認

## T0-16

- **log_ts**: src/core/log/log.ts (75行) — createLogger(store, clock, max=100)。起動時に meta logs を読み込み、max 超過で古いものから捨てる。log() は同期 (新しい順 unshift) で1秒以内に自動 flush (連続 log は1回にまとめる)。flush 失敗は無視
- **terms_screen**: src/app/screens/termsScreen.ts — entries を1行ずつ (呼び名大きく/説明は補足色/かえる/上書き中は元にもどす)。かえる は textInputDialog max10 → terms.set。上部にもどる (設定へ)
- **admin_screen**: src/app/screens/adminScreen.ts — バックアップ書き出し (exportAll → canShare なら navigator.share、なければ a download。ファイル名 seikei-backup-YYYYMMDD-HHmm.json)、読み込み (隠し file input、JSON 失敗で「ファイルを読み込めませんでした」、成功で件数表示)、データの状態 (schemaVersion/persisted/estimate/端末ID)、ログ表示
- **context_logger**: AppContext へ logger を追加 (仕様書の許可範囲: logger の追加のみ)。createLogger(repo, clock)
- **main_ts**: ルート2つ追加 (#/settings/terms → termsScreen、#/admin → adminScreen) のみ
- **test**: log.test.ts 4件 (仕様書1〜2 + 追加2: 自動flushの1回まとめ/flush失敗を無視) を先に書き RED 確認後に実装
- **browser_check**: CDP 検証 (dev サーバー :5199, 1180×820): ①呼び名「クリール」→「クリールさん」変更、設定画面を経由して戻っても残る、リロード後も残る、元にもどすで戻る ②管理者 (1967) でバックアップ書き出し (a.download 方式、内容を取得して JSON 検証: app/schemaVersion1/deviceId/terms+settings) → 端末側の屋号を「山田整経所」に変更 → そのバックアップ (settings の updatedAt が古い) を読み込み → 結果「追加0・更新0・変化なし2・読み込めず0」でホームの屋号は新しい方「山田整経所」が残る ③データの状態表示 (スキーマの版/永続化/使用量/端末ID) 確認。検証後は屋号・呼び名を初期値に戻した
- **npm_test**: ok (138 passed / 11 skipped)
- **npm_run_check**: ok (tsc --noEmit + eslint, error 0)
- **npm_run_build**: ok (dist 生成)

## T0-17

- **boot_ts**: src/app/boot.ts (53行) — boot(opts): createAppContext → runMigrations(MIGRATIONS, CURRENT_SCHEMA_VERSION) (例外時 ok:false+reason+errorログ) → navigator.storage?.persist?.() (結果を info ログ、失敗でも続行) → ok:true。移行実行時は info ログも残す
- **main_ts**: boot 失敗時は「データの準備でうまくいきませんでした。管理者に連絡してください。」を大きく表示し、それ以外は何もしない。成功時は既存4ルートで ScreenManager 開始。registerSW (virtual:pwa-register) を追加
- **vite_pwa**: vite.config.ts — VitePWA registerType:prompt、globPatterns js/css/html/png/json、manifest (name 整経ゲーム / short_name 整経 / start_url ./ / scope ./ / standalone / any / #F7F3E8 / #4F5B47 / ja / icons 3種)、define で __APP_VERSION__ 埋め込み。skipWaiting/clientsClaim は無効 (生成 SW を確認: メッセージハンドラ内のみ、自動実行なし)
- **admin_screen**: データの状態に「アプリの版: __APP_VERSION__」の1行追加 (仕様書許可の1行) + src/vite-env.d.ts (型宣言)
- **build_check**: npm run check / test (138 passed) / build 成功。dist に manifest.webmanifest・sw.js・icons 出力、precache 12 entries (630KiB, html/css/js/png/manifest.json 含む)
- **browser_check**: CDP 検証 (dev サーバー, 1180×820): boot 経由でホーム表示 OK。管理者メニューの「スキーマの版」が「（まだ）」→「1」に変化 (boot の runMigrations が動いた証拠)、「アプリの版: 0.1.0」表示、「永続化: されていない」(persisted() が動いている=API 反映)、ログに「永続化の要求: 許可されなかった」(info, boot.ts の persist 要求が動いた証拠)。※ヘッドレス検証環境では persist() は false を返すため、実機での許可確認は管理者の完了条件5で行う
- **fix_2026_09_28**: T0-17 追加修正: ①マニフェストに id: the-seikei を追加 (実機で Chrome が「インストール済み」と判断しながら起動できない問題への対応。id 未指定だと start_url から自動決定されるため)。ビルド後 dist/manifest.webmanifest に id: the-seikei が入っていることを確認 ②00_rules.md の「名前について」に「マニフェストの id は the-seikei で確定。父の端末に入れた後に変えると別アプリ扱いになるため、今後は変更しない」を追記

## T0-18

- **diagnostics_ts**: src/app/diagnostics.ts — collectDiagnostics が7項目+ビルド識別を収集。manifestIdFromCache は workbox の ?__WB_REVISION__ 付きキーにも対応 (cache.keys() から manifest.webmanifest を探す。cache.match の完全一致では見つからないため)。manifestIdFromNetwork は manifest.webmanifest?diag=時刻 を no-store で取得。serviceWorkerState (登録/scriptURL/waiting)。setInstallPromptRecorded は main.ts から boot 前に呼び、beforeinstallprompt の発生だけ記録 (preventDefault しない)。displayMode は matchMedia standalone
- **main_ts**: boot より前に setInstallPromptRecorded() を追加
- **vite_config**: define に __BUILD_ID__ (ビルド時刻の ISO 文字列) を追加、vite-env.d.ts に型宣言
- **admin_screen**: 「診断」欄を追加 (7項目+ビルドの識別)
- **test**: diagnostics.test.ts 8件 (偽 CacheStorage/偽 fetch/偽 SW 登録。RED確認後に実装ではなく同時実装だが全件pass)
- **browser_check**: 本番ビルド (vite preview :4173) で確認: ①保存済み設定ファイル (キャッシュ内の id): the-seikei ②最新の設定ファイル (ネットワークの id): the-seikei ③SW 登録: はい、scriptURL …/sw.js、待機中: なし ④インストール判定: いいえ ⑤表示モード: ブラウザ内 ⑥ビルドの識別: 2026-09-28T12:43:45.758Z 表示。dev サーバー (SW 無し) では (キャッシュなし)・いいえ と表示され分岐も確認。検証後サーバー停止
- **npm_test**: ok (146 passed / 11 skipped)
- **npm_run_check**: ok
- **npm_run_build**: ok

## T0-19

- **diagnostics**: beforeinstallprompt を preventDefault して保存 (setInstallPromptRecorded)。hasInstallPromptEvent / promptInstall を追加。promptInstall は prompt() を1回だけ呼び userChoice の結果 (accepted/dismissed) を返し、呼んだ後はイベントを捨てる (2回目は null → ボタン無効に相当)
- **admin_screen**: 診断欄の下に「アプリとしてインストール」ボタン。保存イベントがあるときだけ押せる。押すと prompt() → userChoice をログに info 記録 (accepted=受け入れられた/dismissed=見送られた)、その後ボタンを無効化
- **main_ts**: appinstalled を監視し、発生したらログに info「appinstalled を受信」。boot 前に発生した分はフラグで持って boot 成功後に転記 (boot 前は logger が無いため)
- **test**: diagnostics.test.ts に T0-19 の4件追加 (preventDefault+保存 / prompt 1回だけ+accepted+2回目null / dismissed / イベント無しはnull)。合計 12件
- **npm_test**: ok (150 passed / 11 skipped)
- **npm_run_check**: ok
- **npm_run_build**: ok

## T1-01

- **diagnostics**: setUpdateAvailable / isUpdateAvailable / applyUpdateNow を追加。applyUpdateNow は保持した更新実行関数を reload=true で1回呼び、呼んだ後は捨てる (2回目は何もしない)。未記録なら例外を出さず何もしない。collectDiagnostics に「新しい版」行 (届いている/なし) を追加
- **main_ts**: registerSW に onNeedRefresh を渡し、呼ばれたら registerSW が返す更新実行関数を setUpdateAvailable で記録
- **admin_screen**: 診断欄に「新しい版」行。診断欄の下に「今すぐ新しい版に切り替える」ボタン (届いているときだけ押せる)。押すと confirmDialog (「切り替える」「やめる」) → 「切り替える」でログ info「新しい版へ切り替え」→ applyUpdateNow() (画面再読み込み)
- **test**: T1-01 の3件追加 (記録前false/後true / reload=true で1回 / 消費後は何もしない)。collectDiagnostics テストを8項目に更新
- **npm_test**: ok (153 passed / 11 skipped)
- **npm_run_check**: ok
- **npm_run_build**: ok
- **browser_check**: 本番ビルド (vite preview :4173) で完了条件を確認: ①1回目訪問で SW 登録 ②再ビルドして新しいタブで開く → 診断「新しい版: 届いている」+ ボタン enabled ③ボタン → confirmDialog (切り替える/やめる) ④「切り替える」→ ログ info「新しい版へ切り替え」(再読み込み後も meta logs に残るよう logger.flush() を呼んでから applyUpdateNow) ⑤画面が再読み込みされ「ビルドの識別」が 13:47:24 → 13:48:51 に更新。やめるの場合は何も起きない (ダイアログが閉じるだけ)

## T1-02

- **types**: src/core/domain/types.ts — 仕様どおり ColorId/YarnColor/YarnTypeId/YarnType/StripeRun/StripePlan/Pattern/CreelPuzzle
- **content**: loadContent は各項目の形を検査し、正しくない項目・存在しない color/yarn/pattern 参照・count<1・cols<1 or >8・rows<1 を読み飛ばして problems に1行ずつ記録 (例外は出さない)。品番の重複は後の方を読み飛ばす。creelPuzzles は stage 昇順。getContent は4つの JSON を import して1回だけ計算してキャッシュ
- **json**: colors.json (8色, 03_basic_design 4.1 どおり) / yarns.json (12糸, 品番は架空) / patterns.json (5柄, era 1967-2004, 説明は「(P4で追記)」) / creelPuzzles.json (s1〜s5)
- **test**: 4件 (本物JSON: problems 空・お題5・柄5・stage昇順 / 存在しないyarn: 柄+連鎖したお題を読み飛ばし / cols=9 読み飛ばし / 品番重複: 後を読み飛ばし)
- **npm_test**: ok (157 passed / 11 skipped)
- **npm_run_check**: ok
- **npm_run_build**: ok

## T1-03

- **stripe**: expandPlan (plan 繰り返し→length で打ち切り、空 plan/length<=0 は空配列) / toRuns (連続する同じ糸をまとめる) / indexToCell・cellToIndex (段*列数+列、往復一致) / answerFor (rows*cols 本) / compare (長さ違いは例外、wrong と empty を帯番号で返す)
- **test**: 13件 (expandPlan 3 / toRuns 3 / indexToCell・cellToIndex 3 / compare 2 / answerFor 2: 本物データの5お題で長さ一致+s1 の中身)
- **npm_test**: ok (170 passed / 11 skipped)
- **npm_run_check**: ok

## T1-04

- **fabric_preview**: `src/core/ui/fabricPreview.ts (63行)` — drawFabric (threadPx 既定3px、warp を左から繰り返し、市松で経糸/緯糸を交互、外周 1px sumiSub 枠線、save→clip→restore で rect 外にはみ出さない) / fabricSpecFor (plan の糸 → colors をたどって hex に展開)。
- **test**: fabricPreview.test.ts 5件 (偽 ctx で fillRect/fillStyle を記録。経糸マスが市松の列ごとに赤・白・赤・白 / save→clip→restore / 緯糸のマスが混ざる / 外周枠線 sumiSub / fabricSpecFor kon×7+shiro×1 → 紺7白1+weft 紺)。
- **browser_check**: dev サーバーでコンソールから本物データの5柄を Canvas に一時描画 (コードはコミットせず)。5柄すべての縞が見える (無地・ピンストライプ・チョークストライプ・シャドーストライプ・オルタネートストライプ) をスクリーンショットで確認。problems=0。検証後サーバー停止。
- **npm_test**: ok (175 passed / 11 skipped)
- **npm_run_check**: ok

## T1-04 追加修正

- **tone**: `YarnType` に省略できる `tone?: number` (-30〜30、正は明るく負は暗く) を追加。loadContent は tone が数値でない・範囲外の糸を読み飛ばして problems に記録。yarns.json は kon-c tone:18 / kon-b tone:-10 / hai-b tone:12 / charcoal-b tone:-12。
- **fabric_preview_tone**: fabricSpecFor は糸の tone に応じて hex の明るさを変えた色を経糸に使う (toneHex: 正は白方向へ 255-c 比率、負は黒方向へ c 比率で補間。tone 無しは元の色)。盤面のコーンは同じ色のまま (ゲームの難しさのため)。
- **test**: content.test.ts 2件 (範囲外・非数値は読み飛ばし+連鎖4行 / 境界値 -30 と省略は通る)。fabricPreview.test.ts 2件 (正の tone で各チャンネル明るい+tone 無しは元の hex / 負の tone で暗い)。
- **browser_check**: シャドーストライプ (kon-a #1F2A44 + kon-c #475066) を threadPx 8 で一時描画し、濃淡の縞が見えることをスクリーンショットで確認。5柄の比較でもシャドーストライプの縞が分かる。盤面コーンは未変更。検証後サーバー停止。
- **npm_test**: ok (179 passed / 11 skipped)
- **npm_run_check**: ok

## T1-05

- **zukan**: `src/core/zukanRegistry/zukan.ts (63行)` — createZukanRegistry(repo, clock)。zukan コレクション id=patternId。未入手は {obtainedAt: now, source, count: 1} で isNew=true、入手済みは count+1 で isNew=false。キャッシュ+repo.subscribe('zukan') で外部変更を読み直し onChange。has/all は同期。
- **records**: `src/core/game/records.ts (64行)` — createRecords(repo)。records コレクション id=gameId。add は plays+1、bestStars は大きい方、best はキーごとに大きい方。get は無ければ {bestStars:0, plays:0, best:{}}。repo.subscribe('records') で外部変更を読み直し onChange。
- **test**: zukan.test.ts 3件 (isNew true→false+count2 / 作り直しても has / 直接 put が has+onChange 反映)。records.test.ts 4件 (add 2回で plays2 bestStars3 best max / 低い星で下がらない / 無いゲームは 0 / 直接 put 反映)。
- **test_note**: fake-indexeddb はテストごとに deleteDatabase して独立させた。zukan は zukan コレクション (union ルール)、records は max ルールで merge に登録済み。
- **npm_test**: ok (186 passed / 11 skipped)
- **npm_run_check**: ok

## T1-06

- **game_screen**: `src/app/screens/gameScreen.ts (約230行)` — createGameScreen(ctx)。mount(container, params) で params['id'] を受け取る (screenManager の /games/:id ルートが解決)。無効 id・未登録ゲームは '/' へ。流れ: チュートリアル (settings.tutorialSeen が true でなければ showTutorial → update で true を保存) → sessions に途中保存があれば confirmDialog (つづきから/はじめから、はじめからなら削除) → module.mount(box, { mode:'standalone', resume, onStateChange, onFinish, onExit })。
- **on_state_change**: 1秒に1回までまとめて sessions (id=ゲームid) に {state, savedAt} を保存。null なら削除。onExit・visibilitychange(hidden) では instance.suspend() の結果を即保存 (null ならホームへ直接)。onFinish は 途中保存削除 → records.add (stats の 'puzzle:' キーのみ) → zukan.unlock (新規入手の柄名を収集) → showResult (praise/星/成績行/あたらしく集めた柄、つづけて遊ぶ/ホームへ) → again は mount し直し、home は '/' へ。
- **unmount**: MutationObserver で box が DOM から外れたら instance.unmount + visibilitychange 解除 + 保留中の状態を flush。
- **context**: AppContext に zukan / records を追加し createAppContext で生成。gameDepsFrom(ctx) を追加 (terms/audio/records/clock/log)。
- **types**: GameProps に onStateChange? を追加、GameDeps を追加。
- **home_screen**: ゲームボタンが #/games/<id> へ navigate (押した音は従来どおり)。
- **main**: ルート '/games/:id' を追加。
- **test**: gameScreen.test.ts 6件 (チュートリアル表示+tutorialSeen 保存 / seen なら非表示 / つづきからで resume を渡す / onFinish で消す+records+zukan+/ へ移動 / onExit で suspend 保存 / onStateChange 3回→1秒後に最後の1回だけ保存)。偽 GameModule を registry に登録して確認。
- **test_note**: confirmDialog は hoisted vi.mock で confirmAnswers 配列から返す。fake timers は shouldAdvanceTime: true (fake-indexeddb と併用時のデッドロック回避)。
- **npm_test**: ok (192 passed / 11 skipped)
- **npm_run_check**: ok
- **browser_check**: ゲームはまだ無いため T1-10 で実施 (仕様どおり)。

## T1-06 追加修正

- **cleanup**: MutationObserver を廃止。mountGame は cleanup (instance.unmount + visibilitychange 解除 + 保留中の onStateChange の flush) を registerCleanup で返し、createGameScreen が保持して Screen.unmount() から呼ぶ。「つづけて遊ぶ」の mount し直しでも前の cleanup を先に呼ぶ (mountGame 内 lastCleanup、二重呼び出し防止)。
- **disposed**: createGameScreen に disposed フラグ。Screen.unmount 後はチュートリアルの後の続き・確認ダイアログの後の続き・結果表示後の遷移を行わない (isDisposed() を mountGame に渡す)。
- **summary**: GameResult に省略できる summary?: string[] を追加。結果の成績欄は summary だけ (無ければ空)。「星 Nつ」の行は削除 (星表示と重複)。records には従来どおり stats の 'puzzle:' キーを記録。
- **test**: 4件追加 (Screen.unmount で instance.unmount 1回+保留保存+2度目は何もしない / チュートリアル中 unmount で以後 mount されない / つづけて遊ぶで前 unmount / summary だけが成績欄に出る)。
- **npm_test**: ok (196 passed / 11 skipped)
- **npm_run_check**: ok

## T1-07

- **logic**: `src/games/creel/logic.ts (約190行)` — Tool/CreelState/CreelAction 型。init (answer=answerFor、placed は null 埋め、tool は answer の最初の糸の箱、boxes=boxesFor)、reduce (純粋 reducer、done の後は不変)。tapCell は箱=立てる(または立て替え)/はずす=null/しらべる=inspected に index (null の軸は null)。marks があれば操作した index を取り除く。check は checks+1 と compare、両方ゼロなら done=true+marks=null。hint は canHint が true のとき最小 index を正解にし hints+1 (done にはしない)。canHint は done でなく checks>=HINT_MIN_CHECKS(2) で marks に wrong/empty あり。selectBox/selectRemove で inspected を null に戻す。
- **boxes**: answer の糸を初出順に。段階4以上 (CONFUSING_BOXES_FROM_STAGE) は「answer の糸と同じ色で answer に無い糸」を品番の昇順で後ろに足す (s4 は kon-a, kon-c, kon-b)。
- **stars**: checks<=STARS3_CHECKS_MAX(1) かつ hints 0 なら 3、checks<=STARS2_CHECKS_MAX(3) かつ hints 0 なら 2、他は 1。params.ts に定数を置く。
- **isValidResume**: 形検査 (puzzleId 文字列、placed/answer が rows*cols と同長、placed 要素は null か文字列、done でない) + puzzleId が内容データに存在。
- **test**: logic.test.ts 12件 (本物の内容データ。仕様書テスト1〜8 をすべてカバー。RED確認後実装)。
- **test_note**: s1 は箱が kon-a しか無いため wrong を作る状態は手で作った (仕様の意図=wrong/empty の消え方の確認)。check の compare は logic 内に局所実装 (core/domain/stripe の compare と同じ判定。placed と answer を別々に持つ state のため)。
- **npm_test**: ok (208 passed / 11 skipped)
- **npm_run_check**: ok

## T1-07 整理

- logic.ts の局所実装 comparePlaced を削除し、core/domain/stripe の compare を使う形にそろえた (check アクションで使用)。テスト12件はそのまま通る。
- npm_test: ok (208 passed / 11 skipped)
- npm_run_check: ok

## T1-08

- **geometry**: `src/games/creel/geometry.ts (約60行)` — LOGICAL_W 1000 / LOGICAL_H 750 / CREEL_AREA {60,90,880,600}。toPx (scale 倍+offset) / fromPx (逆変換) / cellRect (CREEL_AREA を rows×cols 等分、indexToCell 対応) / hitTest (マス全体を当たり、CREEL_AREA 外は null) / fontPx (screenPx/scale)。座標変換はこのファイルだけが行う (02_architecture 7章)。
- **renderer**: `src/games/creel/renderer.ts (約250行)` — drawBoard。描く順番は仕様どおり: ①kinari 背景 ②machine 色の左右の柱+各段の下の横棒 (machineLight で明るい面) ③steel 色の軸 ④立っているコーン=下が広い台形を糸の色で塗り+sumi 輪郭、中央に symbol (明るい色なら sumi、暗い色なら white の文字) ⑤段階1〜3 はコーンの下に品番 ⑥空き軸は点線の台形輪郭 (sumiSub) ⑦帯の番号は段階1〜3 全マス・段階4〜5 は各段の最初だけ (1 始まり、sumiSub) ⑧marks の wrong/empty に shu の太い ✕ ⑨inspected は白地・sumi 枠の吹き出しに品番と spec (上に出せないときは下、しっぽ付き)。
- **見た目**: 灰みの緑 (machine #8C9A7E / machineLight #A9B39C) の枠。文字はすべて fontPx(fit, 20) 以上 (画面上 20px 以上、NFR-U-01)。色は COLORS と内容データの hex のみ (数値の直書きなし。台形の比率など形状の数値のみ)。
- **test**: geometry.test.ts 7件 (往復一致 / 24マス中心の hitTest / CREEL_AREA 外 null / fontPx 戻し 20 / 等分と indexToCell 対応)。renderer.test.ts 7件 (偽 ctx。点線 6マスぶん / wrong 2つで shu の stroke 4本 / font はすべて 20px 相当以上 / kinari 背景 / コーン fill+品番+symbol / 段階4 は品番なし / 吹き出しに品番と spec)。RED確認後実装。
- **npm_test**: ok (222 passed / 11 skipped)
- **npm_run_check**: ok
- **browser_check**: 見た目の確認は T1-10 で行う (仕様どおり)

## T1-09

- **panel**: `src/games/creel/panel.ts (約220行)` — createCreelPanel(parent, { content, onAction }): { update(s), setMessage(text), destroy() }。DOM は4つの section (依頼書 / いまの帯の並び / 箱 / 道具とボタン) + 一番上のメッセージ欄。update(s) は全セクションを作り直さず、各セクションの中身を作り直す (textContent='' → 作り直しは状態から計算した表示のみ、DOM 構造は不変)。
- 依頼書: toRuns(answer) を1行ずつ「品番 × N」。選んでいる箱と同じ品番の行は藍の太枠 (--c-ai)。色の記号と名前も出す。
- いまの帯の並び: placed を番号順に四角 (32px)。立っている糸は色の hex 塗り+symbol、明るい色なら sumi・暗い色なら white の文字。空きは点線枠。marks の wrong/empty は右上に shu の ✕ (creel-cross-<index>)。
- 箱: boxesFor の順に段ボール色 (--c-box、:root に追加。薄い茶 #d8c3a5) のボタン「品番 / 記号+名前」。選んでいる箱 (tool.kind==='box' && tool.yarn) は藍の地・白文字・✓。押すと onAction({type:'selectBox', yarn})。
- 道具: 「はずす」「しらべる」ボタン (選んでいる方に ✓)、「たしかめる」(btn--primary)、「ヒント」(btn--secondary、canHint(s) が false のとき disabled)。
- **css**: base.css に「/* creel */」節を追加のみ (既存の行は変えない)。--c-box (段ボールの薄い茶) を :root に追加のみ。縦長 (orientation: portrait) では .creel-panel を overflow-y: auto にして操作欄の中だけ縦にスクロール。
- **test**: panel.test.ts 8件 (RED確認後実装)。s2 で: 依頼書2行 (W-4812 × 7 / W-2200 × 1) / 箱2つで ✓ が tool に従って移る / 依頼書の selected クラスが tool に従う / 帯のマス数と ✕ (wrong 1 + empty 7、index0 は ✕ なし) / ヒントボタンの disabled と canHint / destroy で消える / setMessage / はずす・しらべる・たしかめる の onAction と ✓。
- **npm_test**: ok (230 passed / 11 skipped)
- **npm_run_check**: ok

## T1-09 追加修正

- 管理者指摘: 「帯の番号がマスの上に position: absolute(top: -14px) ではみ出していて、番号は 20px なのに段の間は 6px のため、折り返すと上の段のマスに重なる (最大24本なので iPad 横でも折り返す)」。
- **panel.ts**: 帯を「番号(上)+マス(下)」の縦並びのまとまり (div.creel-item、data-testid="creel-item-<i>") にし、普通の流れ (flex wrap) で並べる。番号 (span.creel-num、data-testid="creel-num-<i>") はマスの外・まとまりの中の1つ目。マスの中の position: absolute の番号は削除。
- **base.css**: .creel-band に gap: 10px (縦横とも 8px 以上) + align-items: flex-end。.creel-item を追加 (縦並び)。.creel-num を追加 (--fs-body、absolute なし)。.creel-cell を 40px 四方に、中の記号を --fs-body に。.creel-cell__cross を --fs-body に (マスに収まる)。.creel-cell__num (absolute) は削除。
- **test**: 追加1件 — まとまり (creel-item) が placed と同じ数、各まとまりの中に番号が1つ (1 始まり) とマスが1つ、番号のクラスが creel-num (absolute の creel-cell__num でない)。
- **npm_test**: ok (231 passed / 11 skipped)
- **npm_run_check**: ok
- **見た目**: T1-10 のブラウザ確認で、1180×820 と 412×915 の段階5で番号と上の段が重ならないことを確かめる。

## T1-10

- **index.ts**: `createCreelModule(deps): GameModule` — id 'creel'、titleTermKey 'game.creel'、phase 'P1'、embeddable true、tutorial は tutorial.ts の creelTutorial。mount: resume が isValidResume を満たせばプレイ画面、mode:'job' は difficulty 1→1段/2→2段/3→3段・8軸のお題 (jobPuzzle) をその場で作ってプレイ画面、それ以外はお題一覧。お題一覧の onSelect でプレイ画面に切り替え、モジュールの suspend はプレイ中は controller の状態・一覧のあいだは null、unmount はプレイ中なら controller を片付けて list も消す。
- **listView.ts**: 「お題をえらぶ」見出し+「もどる」(props.onExit)。creelPuzzles を段階順に大きなボタン (段階 N / 柄の名前 / N段 × N本 / クリア済みなら★☆)。星は records.get('creel').best['puzzle:<id>']。クリア済み+最初の未クリアまで押せ、その先は「まだ」で disabled。
- **controller.ts**: createGameFrame (題名 terms.t('game.creel')、論理 1000×750)。盤面は drawBoard、操作欄は createCreelPanel。stage の pointerdown で fromPx → hitTest → tapCell (当たりが無ければ何もしない)。操作のたび reduce → refresh (盤面描き直し+panel.update+メッセージ) → props.onStateChange(s)。効果音: tapCell/selectBox/selectRemove で tap、check は marks があれば gentleNo・無ければ fanfare、hint で ok。メッセージ: 最初「依頼書のとおりに、{{cone}}を立ててください」(terms.render)、失敗後「✕ のところを直してください」、checks>=2 で「 (ヒントも使えます)」を添える。done: 操作欄を隠し (panel.style.display='none')、drawFabric を大きく重ねて「できあがりました」、1.5秒後に onFinish (gameId 'creel'、stars=starsOf、stats { checks, hints, 'puzzle:<id>': stars }、unlockedPatternIds [patternId]、summary はたしかめた回数・ヒントを使った回数、finishedAt=clock.now())。もどる=props.onExit (確認と保存は gameScreen 側)、あそびかた=showTutorial。suspend: 完了後は null・プレイ中は状態。unmount: タイマー解除+stage のリスナー解除+panel.destroy+frame.destroy。
- **tutorial.ts**: 3ページ。Canvas の略図 (1: 依頼書の表、2: クリールの軸とコーンと箱、3: ✕ のマス)。文は仕様どおり ({{spindle}}/{{cone}} は terms.render で置換)。
- **main.ts**: boot 後に registerGame(createCreelModule(gameDepsFrom(ctx)))。getContent().problems が空でなければ1件ずつ logger.log('warn', …)。
- **ブラウザ確認中の修正**: お題一覧でお題を押すと、一覧が消えずにプレイ画面が下に追記される不具合 → index.ts の onSelect で list.destroy() を呼んでから createController する形に修正 (テスト5件はそのまま通る)。お題一覧の CSS (creel-list) を base.css の creel 節に追加 (大きなボタン・段階/柄名/段×軸/星)。
- **ブラウザ確認中の修正2**: gameFrame (createGameFrame) の CSS がどこにも無く、盤面の Canvas が既定の 150px 高さで描かれ、drawBoard が小さな fit で盤面全体が崩れる → base.css に .game-screen / .game-frame 系の CSS を追加 (縦積み+横割り、盤面は flex:1、panel は幅 34%)。テストはそのまま通る。
- **ブラウザ確認中の修正3**: 412×915 (縦長) で盤面の幅が 0 になる (横割り CSS のまま panel が幅を取る) → base.css に portrait の media query を追加 (縦積み・盤面は幅 100%・panel は残り高さでスクロール)。テストはそのまま通る。
- **ブラウザ確認中の修正4**: drawBoard の背景 (kinari) が論理座標のまま Canvas に塗られていた (fit 変換なし) → Canvas の実サイズで塗る形に修正。controller の「できあがりました」も盤面の上端に半透明の帯を敷いて白文字で描く形に修正。
- **ブラウザ確認中の修正5 (文字が巨大になる問題)**: fontPx(fit, screenPx) は「論理サイズ」を返すが、fillText は toPx で変換した画面座標に描くため、文字だけが 1/scale 倍に描かれていた (縦長 scale 0.41 では約 2.4 倍) → renderer と controller の文字は「画面 px」を直接設定する形に統一 (品番・番号・記号・吹き出し・「できあがりました」は 20/44 画面px、コーンの記号はマスの高さに比例)。drawFabric の threadPx も画面px 固定 (6)。renderer.test の文字サイズの期待値も「設定値 >= 20 (画面px)」に変更 (NFR-U-01 の「画面上 20px 以上」と同じ意図)。
- **browser_check 結果**: ①1180×820: ホームにボタン、初回チュートリアル、s1 完走で生地の見本+結果+お題一覧に ★ と s2 解禁、盤面と操作欄が一画面、品番は隣と重ならない ✓ ②960×720: s3 完走、s4 で紛らわしい箱 (W-4821)・コーンに品番なし・「しらべる」で品番と規格 ✓ ③412×915: 盤面上・操作欄下の縦積み、s1・s2 完走、軸マス 45px・ボタン 64px・箱 133×83px で押せる ✓、途中でもどると確認→「つづきから」で再開 ✓。発見した見た目の問題 (修正は次回指示を待つ): (a) 盤面の帯番号がマスからはみ出す (3桁) (b) 「しらべる」の吹き出しの文字が枠からあふれる (c) s5 の依頼書が8行になり panel のスクロールが必要 (仕様の「4区画がスクロールなし」を満たさない)。
- **test**: controller.test.ts 5件 (テストファースト・RED確認後実装)。jsdom+偽 GameDeps。お題一覧の s1 のみ押せる/記録で s2 まで/s1 完走で 1.5秒後に onFinish 1回 (stars 3・p-muji-kon)/onStateChange (一覧で null、操作のたび) と suspend/suspend は puzzleId を返す/resume で即プレイ画面/unmount 後はタイマー無し。fake timers + rAF 進め (gameFrame の fit 更新は viewport の rAF 経由のため resize dispatch 後に advanceTimersByTime(20))。
- **npm_test**: ok (236 passed / 11 skipped)
- **npm_run_check**: ok
- **browser_check**: 3つの画面の大きさでスクリーンショットを添付して報告する。

## notes (気づいた点・今後も守る注意点)

- T0-01: npm registry の最新 typescript は 7.0.2 (dist-tags latest) だが typescript-eslint 8.70.1 の peer 依存 (>=4.8.4 <6.1.0) と衝突し ERESOLVE。typescript を ^5.9.3 (5.x 最新) にして解消。他パッケージは現時点の最新安定版 (^付き) のまま。
- T0-02: 管理者指示により docs/04_tasks/00_rules.md のライブラリ表の下に「TypeScript は 5.x に固定する(typescript-eslint が 7 に未対応のため)。上げる場合は管理者の承認を得る。」を追記(本コミットに同梱)。
- T0-03: mulberry32 は純粋関数型 (状態を返す) で実装。Date/crypto は createSystemClock 内のみで使用。noUncheckedIndexedAccess 対応で Uint8Array 要素に non-null assertion を使用(any は不使用)。
- T0-04: 契約テストは実装を受け取る関数型 (make: (clock, deviceId) => Promise<Repository & RawStore>) で export。テスト6 (購読) は put/remove で「そのコレクションの購読者が1回」呼ばれることを検出する設計。stub.test.ts は skip なので契約テストの実行は T0-05 から。
- T0-05: Dexie は compound primary key [collection+id] をそのまま key にはできないため、key='collection\u0000id' の文字列主キー+collection/updatedAt 索引の構成にした(等価)。put の now() 呼び出しは1回 (createdAt===updatedAt の契約を満たす)。uuid() は id 省略時のみ呼ぶので fixed clock でも時刻が1ステップしか進まない。
- T0-06: 「どちらかと完全に同じならその Rec をそのまま返す」は完全一致判定に JSON.stringify 比較を使用 (Rec は JSON で表現可能な構造のみ保持)。union ルールは deletedAt を付けない・max/fieldNewer は削除を newer 扱いで統一。対称性テスト (mergeRec(a,b)===mergeRec(b,a)) を全ルールで実施。
## 調査:ブラウザ確認中に「星と図鑑の記録が消えた」件(2026-09-29、コード変更なし)

- **指示**:AGENTS.md と docs/04_tasks/00_rules.md を読んだあと、git pull(Already up to date)。
- **1. 消えたときの状況**
  - 場所:本番サイト(elengine.github.io/the-seikei)。サーバーは自分では立てていない(GitHub Pages)。
  - ブラウザ:作業道具の内蔵ブラウザ(Chromium)。開き直しは何度も行った(確認のたびに新しいタブ・必要なら location.reload)。道具自体の再起動も行った(412×915 の再確認の前後)。
  - 消える前にやった操作:s1〜s4 をクリアして記録を作り、確認用のスクリーンショットを撮った。
  - 消えた後にやった操作:報告用に 1180×820 でスクリーンショットを撮り直そうとして、タブを開き直した。その際 localStorage の消去とキャッシュの削除、Service Worker の登録解除を一度行い、そのあと数回ページを開き直した。次に開いたときにお題一覧の星が消えていた。
  - 消えた直後のデータベースの中身:settings の1件のみ。records と zukan は無し。
- **2. 道具の性質(実際に確かめた)**
  - 道具のブラウザは、起動するたびに別の保存領域(別プロファイル)になる。
  - 確かめ方:同じアドレス(localhost:4173)で 1つのお題をクリアして星を作り、道具を起動し直して同じアドレスを開いた。するとデータベース自体は新しく作られ、記録は空だった。端末を表す ID も新しく生成されていた(元: 01a0ecd9…、新: 01a0ecdc…)。
  - **結論:道具を起動し直すと保存データは残らない。これが記録が消えた原因の最有力。**(本番サイトで localStorage の消去・キャッシュ削除・SW 登録解除を併せて行ったことも、削除系の操作として影響した可能性があるが、道具の別プロファイル化が主因と考える。)
- **3. 本番と同じビルドでの確認(npm run build → vite preview、ポート固定 4173)**
  - a. お題をクリア → お題一覧に ★★★ が付いた。OK。
  - b. ページ再読み込み → ★★★ は残った。OK。
  - c. タブを閉じて開き直し → ★★★ と図鑑(records/creel・zukan/p-muji-kon)は残った。OK。
  - d. 新しい版:管理者メニューの診断で「新しい版: なし」だったため、切り替えは未実施(届いていないので)。
  - e. 道具を起動し直して同じポートで開く → 記録は空だった(2の結果どおり。道具の起動のたびに別の保存領域になる)。
  - f. 別のポート(4174)で開く → 記録は空だった(同じブラウザでも、アドレスが違うと保存領域も別)。そのあと元の 4173 に戻ると ★★★ はそのまま残っていた(4174 を開いたことで消えたわけではない)。
  - 4にあたる「同じ道具・同じポートで記録が残らない」ケースは発生しなかった(a〜c・f はすべて残った。e だけは道具の仕様として別領域になる)。
- **補足**:データベースに sessions の「削除済みのしるし」だけの行が残っていたが、これは途中保存を消したときの正しい状態であり、消失ではない。
- **管理者への報告**:父の端末の実データは、ブラウザ(アプリ)を起動し直しても消えることはない(iPad の Safari/アプリは保存領域を保持するため)。消えたのはあくまで作業道具の中の確認用データで、道具の仕様(起動のたびに別の保存領域)によるもの。現在、この道具では「起動し直すと確認用の記録は毎回作り直す」運用になる。


---

## T1-10 追加修正(2026-09-29、仕様書 docs/04_tasks/P1/T1-10-fix.md)

- **コミット**:追加修正1 `a701521` / 追加修正2 `43bd018` / 追加修正3 `049e3b4`。それぞれ RED 確認→実装の順。テストは 258 passed / 11 skipped、`npm run check`・`npm run build` 成功。
- **追加修正1(盤面の文字を実際の幅で測る)**:
  - 品番: `measureText` が「そのマスの画面幅 − 4px」を超えたら描かない。
  - 吹き出し: 枠の幅・高さを測った文字幅から決め、Canvas の内側(左右 4px 以上)に収め、文字は枠の余白 10px の内側。
  - 帯の番号: マスの上端で左右中央。`measureText` が「マスの画面幅 − 4px」を超えたら描かない。
  - テスト期待値の変更理由: 吹き出しのテストで `fillText` を数えるとき、コーンの下の品番と吹き出しの中の品番が同じ文字 (W-4812) のため 3回になる。吹き出し内の文字は「枠の左端 + 10 の位置」で識別する形に変えた。
- **追加修正2(依頼書を「1リピート分 + くりかえし N 回」で表示)**:
  - `stripe.ts` に `splitRepeat` を追加(unit は最短のくりかえし、times は回数)。
  - `times >= 2` かつ `unit.length >= 2` のときは `toRuns(unit)` の表に「↻ ここまでを N 回くりかえす(ぜんぶで M 本)」の行を足す。s5 は 4行 + くりかえし行(依頼書は 8行から減った)。
  - 行の高さを詰めた(line-height 1.2、縦の余白 0)。
- **追加修正3(横長では「いまの帯の並び」を盤面の下に置く)**:
  - `gameFrame.ts` に `footer`(盤面の下の欄)と `layout()` を追加。横長では盤面の列を「Canvas の上・footer の下」にする。縦長では footer を隠す。
  - `panel.ts` に `placeBand(target | null)` を追加。「いまの帯の並び」の区画を footer に移す/元の位置に戻す。`controller.ts` は配置が変わるたび(`onStageResize`)と初期化時に呼ぶ。
  - `base.css`: footer 用の CSS(帯は折り返して並べる)。マス 40px・ボタン 64px 以上は変えない。
- **ブラウザ確認での追加対応(7件、それぞれ別コミット)**:
  - `21f1501` footer の高さが変わったとき Canvas を作り直す(ResizeObserver)。
  - `7feebd0`/`fe555c1` 盤面の列の高さを body の内寸基準にする(内寸が測れない環境では従来計算)。
  - `f615d7e` body の content box の高さを使う(padding 分のはみ出しを解消)。
  - `9dc973a` 操作欄の間隔を詰めて 1180×820 s5 をスクロール無しに(区画のあいだ 12→8px、メッセージの最低の高さ 2.4em→1.2em、くりかえし行の余白 0)。
  - `0b1a32c` 縦長で盤面の列が操作欄を押し潰さないようにする(flex: none)。
  - `7c1ae1e` 縦長で盤面の列の高さを盤面ぶんにする(操作欄が画面の外に出る不具合の解消)。
  - `061ad2e` 番号を描くマスではコーンの上端を「番号の下端 + 2px」より下に下げる(縦長で番号とコーンが重なる問題。下げた結果コーンが 24px 未満になるなら番号は描かない)。

### ブラウザ確認の結果(本番と同じビルド、ポート 4173 固定)

1. **1180×820、s5(最優先)→ すべて満たした**:
   - 操作欄 `scrollHeight` 724 = `clientHeight` 724(**スクロールなし**)。
   - 盤面(Canvas) は 高さ 531px、3段ぜんぶ見える。その下に「いまの帯の並び」(footer 高さ 181、帯の並び 150、下端 808 < 820)が重ならず見える。
   - 依頼書は 4行 + くりかえし行(「↻ ここまでを 2回くりかえす(ぜんぶで 24本)」)。
   - 番号 1・9・17 はマスの中に収まり、コーンと重ならない。
   - スクショ: `fix1_1180_s5_solved.png`
2. **960×720**:
   - s1〜s4: 操作欄 `scrollHeight` 624 = `clientHeight` 624(スクロールなし)。
   - s5: `scrollHeight` 712 / `clientHeight` 624 → **あふれ 88px**。区画の内訳は メッセージ 24 + 依頼書 257(くりかえし行が狭い幅で 2行に折り返す) + 箱 206 + 道具とボタン 136 + 区画のあいだ 8px×3。「はずす・しらべる・たしかめる」が下に切れて見えない。スクショ: `fix3_960_s5.png`
3. **412×915(縦長)**:
   - 押せる大きさ(変わらず): 軸のマス 44×44px、箱 133×83px、「たしかめる」 254×64px、「はずす」 120×64px。
   - s2 では品番は表示されない(収まらないため、「しらべる」で見られる方式)。
   - s5 で、盤面の番号(1・9・17)はマスからはみ出さず、コーンとも重ならない。
   - 「しらべる」の吹き出しの文字は枠の中に収まっている(s2・s4 で確認)。スクショ: `fix3_412_s2_speech.png` / `fix3_412_s4_speech.png` / `fix3_412_s5_number.png`
   - 確認の途中で、縦長で操作欄が押し潰されて見えなくなる不具合を見つけたため、上の `0b1a32c`・`7c1ae1e` で直した。
- **確認上の注意**: 作業道具のブラウザはタブが消えると記録が消えるため(前回調査のとおり道具の仕様)、s1〜s4 のクリアを確認の中で数回やり直した。実データには影響しない。

---

## T1-10 追加修正4(2026-09-29、仕様書 docs/04_tasks/P1/T1-10-fix.md の「追加修正4」)

- **コミット**: `8d47f52`(A・B・C を1つに)。それぞれ RED 確認→実装の順。テストは 264 passed / 11 skipped、`npm run check`・`npm run build` 成功。
- **A(高精細な画面で吹き出しがはみ出す)**: `drawSpeech` が枠を収めるときに使う右の端を、Canvas の実寸 (`ctx.canvas.width`) から画面上の幅 (`ctx.canvas.clientWidth`) に変えた。`clientWidth` が 0 のとき(テスト環境など)だけ実寸を使う。テストは「実寸 824 × 画面 412 (devicePixelRatio 2)」の偽の canvas で、右端のコーンの吹き出しの `strokeRect` の x + 幅 が 408 以下になることを確かめた。
- **B(960×720 の段階5で「たしかめる」が画面の外に出る)**:
  1. メッセージ欄を1つにした。`createCreelPanel` の opts に `message?: HTMLElement` を足し、渡されたときはそこに書き、`creel-panel__message` は作らない。`controller.ts` は `frame.message` を渡す。
  2. くりかえしの行の文字を「↻ くりかえし × N(ぜんぶで M本)」に変えた(期待値を変えた理由: 確認役が文字を変えたため)。960×720 で1行に収まったので「(ぜんぶで M本)」は残した。
  3. 道具とボタンの区画(`.creel-section--tools`)を横長では `position: sticky; bottom: 0` にし、背景を `--c-kinari` で塗った。縦長は今までどおり(static)。
- **C(盤面の列の高さの計算で gap が引かれていない)**: footer に中身があるときは「列の高さ − footer の高さ − 列の gap(`getComputedStyle` の `rowGap`、測れないときは 0)」にした。footer が空(子が無い)のときは `display: none` にして、Canvas の高さは列の高さのまま(ほかのゲームと同じ)。

### B のブラウザ確認(本番と同じビルド、ポート 4173 固定)

- **960×720、段階5(「たしかめる」を2回押してメッセージを2行にした状態)**:
  - 操作欄 `scrollHeight` 656 / `clientHeight` 624(あふれ 32px は残る)。
  - ただし「はずす・しらべる・たしかめる・ヒント」は、道具とボタンの区画が sticky で下に固定され、**すべて見える**(区画の下端 708 < 画面の高さ 720)。合格条件(道具が見えていれば合格)を満たす。
  - くりかえしの行は「↻ くりかえし × 2(ぜんぶで 24本)」で1行に収まっている。
  - スクショ: `fix4_960_s5_2line.png`
- **1180×820、段階5(メッセージ2行)**:
  - 操作欄 `scrollHeight` 724 = `clientHeight` 724(**スクロールなし。今までどおり**)。
  - 「いまの帯の並び」は盤面の下(footer 高さ 181)に重ならず見える。
  - スクショ: `fix4_1180_s5.png`
- メッセージ欄が1つになったため、メッセージは画面の一番上(操作欄の外)に出るようになった。枠のメッセージ欄(空)がなくなったぶん、操作欄は前より狭い。

---

## T1-10 追加修正5(2026-09-29、仕様書 docs/04_tasks/P1/T1-10-fix.md の「追加修正5」)

- **コミット**: `082a80c`(A・B を1つに)。それぞれ RED 確認→実装の順。テストは 267 passed / 11 skipped、`npm run check`・`npm run build` 成功。
- **A(縦長→横長に回すと「いまの帯の並び」が消える)**: `gameFrame.ts` で footer の子の増減を `MutationObserver`(`childList`)で見張り、変わったら `applyLayout` を呼ぶようにした。`destroy` で解除する。テストは3件(子を足すと display が戻る/取り除くと再び非表示/destroy 後は変わらない)。
- **B(くりかえしの行が 960×720 で2行に折り返す)**: 文字を常に「↻ くりかえし × N」にした(「(ぜんぶで M本)」を外した)。期待値を変えた理由: 確認役が文字を変えたため。

### ブラウザ確認(本番と同じビルド、ポート 4173 固定)

1. **画面の回転(820×1180 → 1180×820 → 820×1180 → 1180×820)**:
   - 820×1180(縦)で段階5を開く: footer `display: none`、帯の並びは操作欄の中(上端 y=1048)で見える。
   - 1180×820(横)に変える: footer `display: ''`、帯の並びは footer の中(上端 y=658)で見える。**不具合は出なかった**(直る前は display: none のまま消えていた)。
   - 820×1180 に戻す: footer `display: none`、操作欄の中で見える。
   - もう一度 1180×820 にする: footer `display: ''`、footer の中で見える。
   - スクショ: `fix5_rotated_landscape.png` / `fix5_back_portrait.png` / `fix5_landscape_2nd.png`
2. **960×720、段階5(「たしかめる」を2回押してメッセージ2行)**:
   - くりかえしの行は「↻ くりかえし × 2」で高さ 24px(**1行。30px 以下**)。
   - 操作欄 `scrollHeight` 656 / `clientHeight` 624(あふれ 32px は残るが、道具とボタンの区画は下に固定され、下端 708 < 720 で見える)。
   - スクショ: `fix5_960_s5.png`
3. **1180×820、段階5(メッセージ2行)**:
   - 操作欄 `scrollHeight` 724 = `clientHeight` 724(**スクロールなし。今までどおり**)。
   - スクショ: `fix5_1180_s5.png`

---

## T1-12(2026-09-30、仕様書 docs/04_tasks/P1/T1-12.md)

- **T1-12a コミット**: `ea26a84`(結果の表示とチュートリアルの文字の大きさ)。RED 確認(tokens.test.ts 7件 + 柄の欄のクラス1件)→ 実装。
  - `base.css`:`body` に `font-size: var(--fs-body)`、`.result__praise`(heading・太字・中央)・`.result-stars`(number ×1.5・wood 色・letter-spacing)・`.result__lines`(body・行間 1.5)・`.result-patterns`(body)・`.result-patterns__label`(太字)・`.result-patterns__names`・`.tutorial__text`・`.tutorial__counter`(いずれも body)を追加。
  - `resultView.ts`:柄の欄の2つの p に `result-patterns__label` / `result-patterns__names` を付けた。
- **T1-12b コミット**: `5a3b748`(幅の計算)。
  - `gameFrame.ts`:`splitWidths` を export(landscape: `Math.floor((bodyInnerW - gap) * 0.65)` と残り、portrait: 両方 bodyInnerW)。`applyLayout` の幅は `body.clientWidth` から左右の padding を引いた `bodyInnerW` と `columnGap` から計算(clientWidth が 0 のときは innerW)。
  - テスト:`splitWidths('portrait', 388, 12)` → `{388, 388}`、`splitWidths('landscape', 1156, 12)` → `stageColW + panelW + 12 === 1156`。
- **T1-12b の追し**:`914b2f2`(`.game-frame__title` への `white-space: nowrap` が T1-12b のコミットから抜けていたため追加)、`9c5dddb` + `0f678cd`(縦長の題名を `--fs-body` にする指定が、後ろに書いた本体の宣言に負けて効かなかったため、`.game-frame__bar .game-frame__title` と詳細度を上げた)。
- テスト最終値: **277 passed / 11 skipped(288)**、`npm run check`・`npm run build` 成功。

### ブラウザ確認(本番と同じビルド、ポート 4173 固定)

**A(文字の大きさ、仕様書の JavaScript で測定)**: ホーム・設定・お題一覧・プレイ画面・チュートリアル・結果の表示、すべて「**20px 未満の文字なし**」(空配列)。チュートリアルの文とページ数は 20px、結果の表示の各欄も 20px 以上。

**B(横のはみ出し、段階1と段階5で測定)**: どのサイズも `documentElement.scrollWidth` = `clientWidth`、`.game-screen` の `scrollWidth` = `clientWidth`(はみ出しなし)。

| サイズ | 段階1 | 段階5 |
|---|---|---|
| 412×915 | 412/412 | 412/412 |
| 360×800 | 360/360 | 360/360 |
| 1180×820 | 1180/1180 | 1180/1180 |
| 960×720 | 960/960 | 960/960 |
| 820×1180 | 820/820 | 820/820 |

- 1180×820 の段階5:操作欄 `scrollHeight` 724 = `clientHeight` 724(**スクロールなし、今までどおり**)。
- 縦長 412×915 の段階5:題名「クリール立て」は 1 行(20px・nowrap)。**補足**:「あそびかた」ボタンの文字が 3 行に折り返す(ボタンの幅が狭いため)。T1-12 の仕様の範囲外なので、このままにしています(直すなら別途指示をください)。

---

## T1-13(2026-09-30、仕様書 docs/04_tasks/P1/T1-13.md、コミット `184e3a7`・1つ)

- **テスト**:文言を見ているテストの期待値を先に新しい文言に変えて RED を確認(9件失敗)→ 実装して GREEN。期待値を変えた理由は、テスト名・コメントにも「管理者の指示で文言を変えたため」と書いた。
- **表どおりの変更**:`もどる`→`戻る`(adminScreen・settingsScreen・termsScreen・listView・gameFrame)、`あそびかた`→`遊び方`、`せってい`→`設定`、`かえる`→`変更`、`呼び名をかえる`→`呼び名の変更`、`元にもどす`→`元に戻す`、`お題をえらぶ`→`お題を選ぶ`、`まだ`→`未解放`、`はずす`→`外す`、`しらべる`→`調べる`、`たしかめる`→`確認する`、`いまの帯の並び`→`現在の帯の並び`、`↻ くりかえし × N`→`↻ 繰り返し × N`、`依頼書のとおりに、{{cone}}を立ててください`→`依頼書どおりに{{cone}}を立ててください`、`✕ のところを直してください`→`✕ の箇所を直してください`、`できあがりました`→`完成しました`(盤面・メッセージの2か所)、ほめ言葉(`完璧です!`/`よくできました!`/`できました!`→`完璧です!`/`お見事です!`/`完成です!`)、`つづけて遊ぶ`→`続けて遊ぶ`、`ホームにもどりますか? (つづきは保存されます)`→`ホームに戻りますか?(途中の状態は保存されます)`、`ホームにもどる`/`つづける`→`ホームに戻る`/`続ける`、`前に遊んでいたつづきから始めますか?`→`前回の続きから始めますか?`、`つづきから`/`はじめから`→`続きから`/`最初から`、`あたらしく集めた柄`→`新しく集めた柄`、チュートリアルの既定ボタン(`まえへ`/`つぎへ`/`はじめる`→`前へ`/`次へ`/`始める`)、チュートリアル本文2・3ページ、terms.default.json の cone の説明(円すい→円錐)。
- **表に無かったが直したもの**:
  - `settingsScreen.ts`:`（まだ）`(未入力の呼び名の表示)→`（未設定）`
  - `controller.ts`:結果の内訳の`たしかめた回数`→`確認した回数`
  - コメント内の旧文言(`gameFrame.ts`・`tutorialOverlay.ts`・`panel.ts`・`controller.ts`・`listView.ts`・`logic.ts`・`params.ts`・`renderer.ts`・`tutorial.ts`・`settingsScreen.ts`・`gameScreen.ts`)も画面と揃えた。
- **迷って直さなかったもの**:
  - `homeScreen.ts` の「さん、こんにちは」(あいさつ。子ども向けではないと判断)
  - `adminScreen.ts` の管理者メニュー内(「やめる」「ファイルを読み込めませんでした」「されている/されていない」など。仕様書が「そのままでよい」と明記)
  - `widgets.ts` の confirmDialog 既定の `やめる`(管理者メニューからしか使われていないため。変えるなら `中止` 等)
  - `settingsScreen.ts` の「鳴らす/鳴らさない」(そのままが自然と判断)
- テスト最終値: **278 passed / 11 skipped(289)**、`npm run check`・`npm run build` 成功。

### ブラウザ確認(本番と同じビルド、ポート 4173 固定、1180×820)

- **ホーム**: 「設定」に変わっていることを確認。
- **設定**: 「設定」の見出し・各行の「変更」・「呼び名の変更」・「戻る」を確認。
- **呼び名の変更**: 見出し「呼び名の変更」・上部の「戻る」・cone の説明「糸を巻いた円錐形の巻き物」を確認。
- **お題一覧**: 「お題を選ぶ」の見出し・「戻る」・未解放の「未解放」を確認。
- **プレイ画面**: 上の帯が「戻る / クリール立て / 遊び方」、メッセージ「依頼書どおりにコーンを立ててください」、区画「現在の帯の並び」、道具「外す / 調べる」、ボタン「確認する」を確認。
- **チュートリアル**: 3ページの文(「〜箱を選び、{{spindle}}に触れると{{cone}}が立ちます」「全部立てたら「確認する」を押します。間違いは ✕ で示されます」)とボタン「次へ」「前へ」「始める」を確認。
- **結果の表示**: 「完璧です!」「確認した回数 1回」「新しく集めた柄」「続けて遊ぶ」を確認(スクショ `t13_result.png`)。
- **確認ダイアログ**: 「ホームに戻りますか?(途中の状態は保存されます)」と「続ける / ホームに戻る」を確認。
- **1180×820 の段階5**: 操作欄 `scrollHeight` 724 = `clientHeight` 724(**スクロールなし**)。
- **412×915**: 上の帯の題名(1行・20px)と「戻る」「遊び方」(どちらも1行)を確認(スクショ `t13_s5_412.png`)。
- **プレイ画面のスクショ**: `t13_play.png`、**結果の表示のスクショ**: `t13_result.png`

---

## T1-11(2026-09-30、仕様書 docs/04_tasks/P1/T1-11.md)

- **T1-11a コミット `0afdf9e`(文字と見た目)**:
  - `tokens.ts` の `FONT_FAMILY` と同じ値を `:root` の `--font-family` に追加し、`html, body` に `font-family: var(--font-family)` を指定。
  - `html, body` に `-webkit-text-size-adjust: 100%; text-size-adjust: 100%;`、`line-height: 1.4;`、`-webkit-tap-highlight-color: transparent;` を追加。
  - `button` に `-webkit-appearance: none; appearance: none;` を追加。
  - テスト(tokens.test.ts):RED 7件 → GREEN 18件。
- **T1-11b コミット `e491a46`(音と保存)**:
  - `audio.ts`:`resumeIfStopped()` を追加(`ctx.state !== 'running'` のときだけ `resume()`)。`unlock()` と `play()` の最初で呼ぶ。
  - `main.ts`:`pointerup`・`touchend`・`click` のたびに `ctx.audio.unlock()`(`once` を外し `{ passive: true }`)。
  - `gameScreen.ts`:`pagehide` でも `saveSuspended()` を呼ぶ(unmount で解除)。
  - テスト:audio.test.ts RED 3件 → GREEN、gameScreen.test.ts に pagehide のテスト(RED → GREEN)。
  - **デバッグ**:pagehide テストが単体では通るが全体実行で失敗 → 前のテスト(onExit)の screen が unmount されず pagehide の listener が残り、{stage:5} を上書き保存していた。onExit テストの最後に `screen.unmount()` を足して解消。
- **T1-11c コミット `1c13e8b`(回転と書き出し) + `3f25629`(追し)**:
  - `gameFrame.ts`:footer と同じ ResizeObserver で `parent` も observe(Safari で回転直後の resize のときに古い大きさで配置されるのを防ぐ)。
  - `adminScreen.ts`:`navigator.share()` が `NotAllowedError` のときは `a` 要素の `download` に切り替え、`AbortError`(利用者が共有を閉じた)のときは何もしない。
  - 追し:check の TS エラー(NodeList の for...of)を `Array.from` で解消(`3f25629`)。
- テスト最終値: **293 passed / 11 skipped(304)**、`npm run check`・`npm run build` 成功。

### ブラウザ確認(本番と同じビルド、ポート 4173 固定)

- **書体**:`body` とボタンの `font-family` が `"Hiragino Sans", "Noto Sans JP", sans-serif`、`line-height` 28px(20px × 1.4)。**画面の文字は盤面と同じゴシック体**(Chrome では前と見た目はほぼ変わらず)。
- **1180×820 の段階5(「確認する」を2回押してメッセージ2行)**:操作欄 `scrollHeight` 724 = `clientHeight` 724(**スクロールなし。line-height 1.4 にしても出なかったので詰め変更は不要**)。
- **960×720 の段階5(同じ状態)**:操作欄 `scrollHeight` 664 / `clientHeight` 624。道具とボタンの区画は下に固定され、**「外す」「調べる」「確認する」「ヒント」の4つすべて見える**(区画の下端 708 < 720)。
- **音**:段階1で箱を選んで軸をタップ → 操作はエラーなく完了。タブを裏に回して(`visibilitychange` を hidden → visible に)戻したあとも、タップで操作できる(audio.ts の `play()` が止まっていたら `resume()` を呼ぶ実装。実際の音の鳴り分けは人の耳での確認項目)。

### iPad で確かめること(iPad が手元に来たとき)

1. **書体**:盤面(Canvas)と操作欄・ボタンの文字の書体が同じゴシック体で、明朝体になっていないこと。
2. **音**:段階1で箱を選んで軸をタップすると音が鳴ること。アプリを裏に回して(ホーム画面や切り替え画面)戻したあと、電話・通知が来たあとも、もう一度鳴ること。
3. **回転**:縦長→横長→縦長と回転したとき、盤面・操作欄・「現在の帯の並び」が正しい位置にすぐ並び直すこと(古い大きさのまま残らないこと)。
4. **バックアップの書き出し**:管理者 →「バックアップを書き出す」で、共有の画面が出ること。共有が断られた場合もファイルが保存されること(iCloud Drive/ファイルに保存)。
5. **ホーム画面からの起動**(ホーム画面に追加したアイコンから起動)でも 1〜4 が同じであること。

---

## T1-14(2026-09-30、仕様書 docs/04_tasks/P1/T1-14.md、コミット `752eb12`・1つ)

- **A(閉じ括弧が宣言と同じ行)**:`base.css` の 18 行目(`-webkit-tap-highlight-color`)と 48 行目(`--font-family`)の閉じ括弧 `}` を次の行に分けた。
- **B(題名の指定が2か所)**:クリール立ての節にあった `.game-frame__title` の規則を削除し、コメントは `.creel-panel` の縦スクロールの説明として残した。規則は game-frame の節の1か所だけにし(`flex: 1; text-align: center; font-size: var(--fs-heading); color: var(--c-sumi); white-space: nowrap;` を1行ずつ)、縦長で `--fs-body` にする指定は同じ節の `@media (orientation: portrait)` の中に移した。
- **C(書き出しの失敗の記録)**:`adminScreen.ts` の「バックアップを書き出す」の `onClick` の中身全体を `try/catch` で囲み、外側の catch で `ctx.logger.log('error', 'バックアップの書き出しに失敗: …')` を残すようにした(`exportAll` などの失敗が、ログ無し・処理されない Promise の失敗にならない)。`share()` の `AbortError`・`NotAllowedError` の扱い(T1-11c)は変えていない。
- **テスト**:`adminScreen.test.ts` を新規に作り、`exportAll` が失敗する偽の repo で「バックアップを書き出す」を押すと、例外が外に出ず、ログに error が1件残ることを確かめた(RED 確認 → GREEN)。テストでは `__BUILD_ID__`(vite の define)を `vi.stubGlobal` で代用し、`logger` の偽物に `entries()` を足した。
- テスト最終値: **294 passed / 11 skipped(305)**、`npm run check`・`npm run build` 成功。

### ブラウザ確認(本番と同じビルド、ポート 4173 固定)

- **412×915(プレイ画面)**:題名「クリール立て」は **20px・1行**(高さ 28px)。横のはみ出しなし(`scrollWidth` 412 = `clientWidth`)。
- **1180×820(プレイ画面)**:題名は **28px のまま**。見た目は変更前と同じ。

- **T1-14 の追し(`97cc469`・`391a921`)**:CI のみテストが失敗した。原因は、テストで mount した管理者画面の診断欄が `ctx.repo.getMeta()` と `__APP_VERSION__` を読むのに、テストの偽の repo と global の代用が無かったため(処理の順序の都合でローカルでは表面化しなかった)。テストの偽 repo に `getMeta` を足し、`vi.stubGlobal` で `__APP_VERSION__` も代用して解消。あわせて保存の確認を `vi.waitFor` で確実にした(`97cc469`)。CI success(`391a921`)。


## 2026-09-30 T1-15: プレイ画面の「戻る」でお題の一覧に戻る

- やったこと:
  - プレイ画面の「戻る」を押すと「お題の一覧に戻りますか?(途中の状態は保存されます)」の確認が出る。「一覧に戻る」で一覧へ、「続ける」でプレイ続行。
  - 一覧のそのお題に「途中」(朱色) を出す。
  - 「途中」のお題を押すと、操作した状態から再開する。
  - 途中のお題があるとき別のお題を押すと「途中のお題があります。…始めますか?」の確認。「やめる」で一覧のまま、「始める」で新しいお題開始 (途中は消える)。
  - お題を完了したときは途中の状態を消す (一覧に「途中」が出ない)。
  - 一覧を開くたびに途中の状態を消す処理をやめた (onStateChange(null) を送らない)。
  - 一覧の「戻る」で今までどおりホームに戻る (props.onExit)。
  -仕事モード (job) は今までどおり gameScreen 側の戻り先を使う。
- テスト: RED 5件を先に書いて確認 → 実装 → 13 passed (controller.test.ts)。既存テストの期待値を1つ変えた:
  「suspend はプレイ中は状態、お題一覧では null」→「お題一覧では null を送らない」。
  理由: 管理者の指摘で戻り先を変えたため (一覧を開いても途中の状態を消さない)。
- ブラウザ確認 (npm run build → vite preview 4173、SW 掃除のうえ新規タブ):
  1. 段階1を始めて「戻る」→「一覧に戻る」で一覧に戻り、段階1に「途中」が出る (スクショ t15_5_list_with_saved.png)。
  2. 「途中」を押すと、選んでいた箱 (W-4812 紺 ✓) のまま再開する。
  3. 「戻る」→「続ける」でプレイ続行。
  4. 一覧の「戻る」でホームに戻る。
- テスト全体: 302 passed / 11 skipped。npm run check エラー0。npm run build 成功。


## 2026-09-30 T1-16: お題を15題に増やし、糸の色を11色にする

- やったこと (データだけ。コードは変えていない):
  - colors.json: 青・深緑・ベージュの3色を追加 (8色 → 11色)。
  - yarns.json: ao-a (W-6340)、ao-b (W-6430・tone -8)、midori-a (W-7520)、beige-a (W-8260) を追加 (12本 → 16本)。
  - patterns.json: 新しい柄10件を追加 (5件 → 15件)。era・description は既存と同じ。
  - creelPuzzles.json: お題を15件に (5件 → 15件)。既存 s1〜s5 の id は変えず、
    段階ごとに3題ずつ、仕様書の順に並べ替えた (配列の順 = 一覧の順)。
- テスト (先に RED を確認):
  - content.test.ts に T1-16 のテスト4件を追加 (色11・糸16・柄15・お題15 / 段階の並び順 /
    記号と品番の重なりチェック / 15題すべてで answerFor の長さが rows×cols・段階ごとの色数)。
    RED 3件 → データ投入後 GREEN。
  - 既存テストの期待値を2つ変えた:
    1. 「お題5件・柄5件」→「お題15件・柄15件」(データを増やしたため)。
    2. controller.test.ts の「s1 の星があると s2 が押せる」→「s1-2 が押せる」
       (お題を増やしたため、s1 の次の未クリアが s1-2 になった)。理由は「T1-16 でお題を3題ずつに増やしたため」。
  - controller.test.ts に T1-16 のテスト2件を追加:
    s3-3 (深緑とえんじの縞) の箱が3色 (W-7520・W-7040・W-8260)、
    s5-3 (紺と青の多色縞) の箱に似た品番 W-6340 と W-6430 が別々に出る。
- テスト全体: 308 passed / 11 skipped。npm run check エラー0。npm run build 成功。
- ブラウザ確認 (npm run build → vite preview 4173、SW 掃除のうえ新規タブ):
  1. 1180×820: お題の一覧に15題が段階の順に並ぶ。スクロールで最後 (段階5の紺と青の多色縞) まで見られた (スクショ t16_final_list_*.png)。
  2. 段階1の3題・段階2の3題は、実際に遊んで確認 (依頼書・箱・盤面・生地の見本・結果の「完璧です!」表示まで)。スクショ t16_3_s1_placed.png、t16_7_s2_placed.png、t16_s2_board.png ほか。
  3. s3-3 (3色の箱) と s5-3 (似た品番 W-6340 / W-6430) の箱と依頼書の内容は、単体テストで確認した
     (道具ブラウザの記録が起動のたびに消えるため、解放を15題ぶん UI で進めるのが難しかった。表示の作りは段階1〜2と同じ経路なので、箱と依頼書のデータが正しければ同じように出る)。
  4. 412×915: 依頼書・箱の区画はスクロールで読める (スクショ t16_412_*.png)。
  5. 20px 未満の文字は無し (T1-12 の調べる JS で一覧・プレイ画面の両方を確認)。


## 2026-09-30 T1-15 追加修正: 一覧から選んだお題が正しい状態で始まる

- やったこと (index.ts のみ。controller.ts は変えていない):
  - プレイ画面を開く処理を startPlay(puzzleId, resume) に1つにまとめた。
    controllerProps の resume を、...wrappedProps のあとで引数の resume で上書きする
    (mount で受け取った props.resume が残らないようにする)。
  - 一覧から選んだとき: 選んだお題が途中のお題なら、その状態を resume に渡して再開する。
    違うお題なら resume は undefined (新しく始める)。
  - mount の props.resume は、最初の1回だけ使う。
  - 途中のお題の id を取り出す処理を savedPuzzleId() に1つにまとめた (今まで2か所に同じ式)。
- テスト (先に RED を確認): controller.test.ts に2件追加。
  1. 最初から開き、s1 で「外す」を選ぶ → 一覧に戻る → s1 を押す → suspend の tool.kind が remove。
  2. s1 の星がある記録で s1-2 を resume して開く → 一覧に戻る → s1 を押し「始める」→ suspend の puzzleId が s1。
  T1-15 のテスト2は、管理者のご指摘のとおり「最初の状態と違う操作」(「外す」を選ぶ) をしてから
  確かめる形に直した (期待値の理由: 最初の箱を選ぶ形では再開しなくても通ってしまうため)。
- テスト全体: 310 passed / 11 skipped。npm run check エラー0。npm run build 成功。
- ブラウザ確認 (npm run build → vite preview 4173、SW 掃除のうえ新規タブ、1180×820):
  1. s1 を開いて「外す」を選ぶ → 「戻る」→「一覧に戻る」→ s1 に「途中」→ 押すと、道具が「✓ 外す」のまま再開した (スクショ t15fix_resume.png)。
  2. s1-2 を「外す」の状態で途中保存 → 一覧から s1 を押す →「途中のお題があります」の確認 →「始める」→
     依頼書が W-4812 紺 (s1) で始まり、前のお題 (黒 W-1200) の盤面は出なかった (スクショ t15fix_bug2_check.png)。


## 2026-09-30 T1-17: 確認の画面のボタン・設定画面・ホーム画面の見直し

- やったこと (テストは先に RED を確認。最終 322 passed / 11 skipped):
  - A. 確認の画面:
    - 「続ける」→「やめる」に変えた (gameScreen.ts の「ホームに戻りますか?」と creel/index.ts の
      「お題の一覧に戻りますか?」。期待値の変更の理由: 管理者の指示で文言を変えたため)。
    - base.css の .dialog__actions を justify-content: space-between (取り消しが左端・決める側が右端)、
      gap を calc(var(--gap) * 2) (24px) に。widgets.ts のボタンの並び (取り消しが先) は変えていない。
    - テスト: widgets.test.ts に confirmDialog・textInputDialog の並びと CSS のテスト3件、
      gameScreen.test.ts・controller.test.ts に文言テスト2件 (confirmDialog の mock に引数の記録を追加)。
  - B. 設定画面の項目名: tokens.ts の FONT に label (large 24 / xlarge 28) を追加、
    base.css に --fs-label (24px / 28px)、.settings__label を var(--fs-label) + font-weight: 700 に。
    テスト: tokens.test.ts に5件 (FONT.label、--fs-label の一致、settings__label、home__greeting、admin-btn)。
  - C. 設定画面の「戻る」と「管理者」:
    - 「戻る」を題名「設定」と同じ行の左 (settings__bar) に移した (画面の下には置かない)。
    - 「管理者」の前に区切りの線 (.settings__divider、1px --c-steel、上下余白 48px) を入れ、
      ボタンは一番下の左に。min-height を 48px → var(--btn-min-h) (64px) に。
    - テスト: settingsScreen.test.ts に2件 (戻るが見出しの中・管理者より前。管理者が最後の要素で
      区切りの線が直前にある)。
  - D. ホーム画面: .home__greeting を var(--fs-label) (24px) に。
- npm run check エラー0。npm run build 成功。
- ブラウザ確認 (npm run build → vite preview 4173、SW 掃除のうえ新規タブ。
  お題の解放は IndexedDB に確認用の記録 (records コレクションの creel) を直接書いて行った):
  1. 1180×820: プレイ画面の「戻る」の確認で「やめる」が左端、「一覧に戻る」が右端 (gap 24px、
     justify-content: space-between を確認)。412×915 でも左右は同じ (スクショ t17_dialog_1180.png、t17_dialog_412.png)。
  2. 設定画面: 「戻る」が上の左、項目名が 24px の太字、「管理者」が一番下の左で区切りの線と余白あり、
     高さ 64px (スクショ t17_settings_1180.png、t17_settings_412.png、t17_settings_412_bottom.png)。
  3. ホーム画面: お名前を入れて「テスト屋さん、こんにちは」が 24px (スクショ t17_home_1180.png、t17_home_412.png)。
  4. 「特大」に切り替えると、項目名・あいさつとも 28px (スクショ t17_home_xlarge_1180.png)。


## 2026-09-30 T1-18: 細い画面で設定の今の値が縦に折れるのを直す

- やったこと (base.css の設定画面の節のみ):
  - @media (max-width: 599px) を追加: .settings__row を grid-template-columns: 1fr auto の2段にし、
    .settings__label に grid-column: 1 / -1 (1段目に項目名、2段目に今の値とボタン)。
  - .settings__value の overflow-wrap を anywhere → break-word に (単語の途中で1文字ずつ折らない)。
  - 600px 以上は3列のまま変えていない。
- テスト (先に RED を確認): tokens.test.ts に2件追加
  (media query 内に .settings__row と .settings__label の規則・grid-column: 1 / -1 がある。
  .settings__value が break-word で anywhere でない)。RED 2件 → GREEN。
- テスト全体: 324 passed / 11 skipped。npm run check エラー0。npm run build 成功。
- ブラウザ確認 (npm run build → vite preview 4173、SW 掃除のうえ新規タブ):
  1. 412×915: 項目名が1段目、今の値とボタンが2段目。「（未設定）」「整経所」とも高さ 28px (1行) で読める (スクショ t18_settings_412.png)。
  2. 360×800: 同じく2段で1行。scrollWidth 360 = clientWidth 360 (横のはみ出し無し) (スクショ t18_settings_360.png)。
  3. 1180×820・820×1180: 項目名と今の値が同じ行 (3列のまま) (スクショ t18_settings_1180.png、t18_settings_820.png)。


## 2026-09-30 T2-01: ペダルと張りの計算 (core/mechanics/pedal.ts) と効果音 stop

- やったこと:
  - src/core/mechanics/pedal.ts (新規): TensionParams・PedalState の型と、
    initPedal・setPedal (0〜100 に丸める)・speedOf (pedal/100 × maxSpeed)・
    tensionOf (base + perPedal×pedal + yarnDrift×clamp(progress,0,1) + noise)・
    stepNoise (乱数で noise を動かす。1回の変化は noiseStepPerSec×dtMs/1000 以内、範囲の外に出ない)・
    zoneOf (low/ok/high)。すべて純粋関数。乱数は core/clock の nextFloat。
    app・games・zukan は import していない。
  - src/core/audio/sounds.ts: SoundName に 'stop' を追加。
    機械が止まる音 (糸切れの「ガシャン」に近い、短く重なった金属的な音):
    triangle 600Hz 40ms (0ms から)、300Hz 120ms (10ms から)、250Hz 200ms (30ms から)、
    gain は 0.3・0.3・0.25 (すべて 0.5 以下、周波数は 250〜2000Hz の決まりを守る)。
  - src/core/audio/audio.test.ts: テスト1の対象に 'stop' を追加 (1行のみの変更)。
- テスト (先に書いて RED を確認: pedal.ts が無く import 失敗):
  pedal.test.ts (新規) に仕様書のテスト 1〜6 を実装。
  - 5 (安全なペダルの保証) は、初級 30〜70・中級 38〜62・上級 44〜56 のそれぞれで、
    pedal 40・progress 0/0.5/1・noise -2/0/+2 の全 27 組み合わせで zoneOf が 'ok' であることを確かめた
    (P2/README の「ゆっくり踏めば必ず適正範囲に入る」の保証)。
- テスト全体: 330 passed / 11 skipped。npm run check エラー0。npm run build 成功。
- T2-01 は画面を持たない純粋関数なので、ブラウザ確認の対象は無し (確認のしかた: テスト)。


## 2026-09-30 T2-02: 糸切れと糸継ぎの計算 (core/mechanics/breakage.ts)

- やったこと:
  - src/core/mechanics/breakage.ts (新規):
    - initBreak: running・sinceCheckMs 0。
    - stepBreak: running のときだけ時間を数える (broken なら何もしない)。
      sinceCheckMs が checkMs たまるごとに1回判定し、checkMs を引く (1回の dtMs で複数回判定あり)。
      tension <= rangeMax なら切れない。tension > rangeMax なら
      chance = min(maxChance, rate × (tension − rangeMax)) の確率で切れる。
      切れたら broken (thread は 0〜threadCount-1 の乱数、firstTapped false)、broke true。
    - tapEnd: running なら ignored。違う糸なら wrongThread (firstTapped を false に戻す)。
      正しい糸の creel なら first (firstTapped true)。正しい糸の drum で firstTapped true なら
      tied (initBreak に戻る)。drum で firstTapped false なら retry (状態そのまま)。
    - すべて純粋関数。乱数は core/clock の nextFloat。
  - src/core/mechanics/breakage.test.ts (新規): 仕様書のテスト 1〜7 を実装。
- テスト (先に書いて RED を確認: breakage.ts が無く import 失敗): 7件。
  - テスト2は、tension 80・rangeMax 56 (chance が上限 0.5) で、同じ種 seedFrom(42) なら
    同じ回で切れ、thread が 0〜7、数回以内に切れることを確かめた。
  - テスト7は、retry のあと状態が変わらないこと・creel の2回目も first のまま (firstTapped true 維持)・
    running では ignored も確認。
- テスト全体: 337 passed / 11 skipped。npm run check エラー0。npm run build 成功。
- 画面を持たない純粋関数なので、ブラウザ確認の対象は無し (確認のしかた: テスト)。


## 2026-09-30 T2-03: ペダルの横木と張りのメーターの部品 (core/ui/pedalControl.ts)

- やったこと:
  - src/core/ui/pedalControl.ts (新規):
    - createPedalControl: 縦長の溝 (.pedal__groove、高さ 260px) の中を横長の木の棒
      (.pedal__bar、幅 180px・高さ 64px、木の色 --c-wood) が上下に動く。
      一番上が 0 (止まる)、一番下が 100 (速い)。押し下げるほど速い。
      溝の中を押すとその位置の値、押したまま動かすと追従、指を離しても位置を保つ。
      pointerdown で setPointerCapture、pointermove は捕まえている間だけ、
      pointerup・pointercancel で離す。溝と横木に touch-action: none (iPad 対策)。
      「踏み込む」(+10)「戻す」(-10) のボタン (min-height 64px)。
      値は横木の横に文字でも出す (「速さ 50」)。setEnabled(false) で薄く表示し操作を受け付けない。
      setValue は onChange を呼ばない。
    - createTensionMeter: 横長の帯 (.meter__band) の 0〜100 の上に、適正範囲を緑
      (--c-machine-light) で塗り (.meter__zone)、今の張りを縦の針 (.meter__needle) で示す。
      帯の下に文字で状態を出す (「○ 適正」「▲ 強すぎ」「▼ 弱い」。色だけに頼らない)。
      文字は --fs-body。
  - src/styles/base.css: 末尾に「/* pedal (T2-03) */」の節を追加 (既存の行は変えていない)。
  - src/core/ui/pedalControl.test.ts (新規): 仕様書のテスト 1〜7 (jsdom)。
    getBoundingClientRect を偽物にして溝の上端 0・下端 100・真ん中 50 を確かめた。
- テスト (先に書いて RED を確認: pedalControl.ts が無く import 失敗): 8件。
  テストの期待値は変えていない (テスト側の不備の修正のみ:
  jsdom に無い setPointerCapture の stub、disabled は root の class に付くので root を見るように修正)。
- テスト全体: 345 passed / 11 skipped。npm run check エラー0。npm run build 成功。
- ブラウザ確認は T2-07 でまとめて行う (仕様書どおり)。


## 2026-09-30 T2-04: ドラム巻きのルール (games/winding/logic.ts)

- やったこと:
  - src/games/winding/params.ts (新規): 難易度ごとの数値をここだけに置いた。
    MAX_SPEED 40、SECTION_LENGTH 400 (pedal 50 で 20 秒)、SECTIONS 3/5/7、
    RANGE 30〜70/38〜62/44〜56、BREAK_RATE 0.01/0.02/0.04、
    STANDALONE_PATTERN p-pin-kon/p-chalk-char/p-alt-kon、
    TENSION (T2-01 の初期値)、BREAK (T2-02 の初期値)、MAX_TICK_MS 100、STARS3 0.8、STARS2 0.6。
    (SECTIONS などは Record でなく関数にした。noUncheckedIndexedAccess で
    Record への [level] の参照が undefined になり得るため)
  - src/games/winding/logic.ts (新規): init・reduce (start/setPedal/tick/tapEnd/cut/pausePedal)・
    qualities・starsOf・isValidResume・lastTapResult。すべて純粋関数 (元の s は変更しない)。
    - tick: dtMs を MAX_TICK_MS (100) で丸める。noise を進め、progress から張りを計算して保存。
      speed > 0 なら lengths・windMs (範囲内なら okMs も) を進め、糸切れの判定 (stepBreak)。
      切れたら phase 'broken'・breaks+1・ペダル 0 (実物どおり)。
      SECTION_LENGTH 以上で 'cutting'・ペダル 0。
    - setPedal は 'winding' のときだけ。pausePedal は 'done' を除くどの phase でもペダル 0。
      cut は 'cutting' のときだけ (最後なら 'done')。'done' の後はどの操作でも変わらない。
    - isValidResume: phase・level・sections・current・配列3つの長さと値・数値の範囲を確かめる。
  - src/games/winding/logic.test.ts (新規): 仕様書のテスト 1〜10。
- テスト (先に書いて RED を確認: logic.ts が無く import 失敗): 10件。
  - テスト4で 'cutting' にならなかったのは、補助の windToCut が pedal 50 用の回数 (201回) で
    打ち切っていたため。pedal 40 は遅いので 500 回に増やした (テストの補助の修正。期待値の変更ではない)。
  - テスト5は同じ種 seed 99 で2回実行して同じ結果 (決まった回で切れる) も確認。
- テスト全体: 355 passed / 11 skipped。npm run check エラー0。npm run build 成功。
- 画面を持たない純粋関数なので、ブラウザ確認の対象は無し (確認のしかた: テスト)。


## 2026-09-30 T2-03 追加修正: ペダルの部品の幅・ボタンの見た目・色・横木の位置

- 直した4点 (pedalControl.ts・base.css の pedal の節のみ):
  1. ボタンを溝の右に縦に並べた (上に「戻す」、下に「踏み込む」。横木を下げるほど速いので
     下のボタンが速くする方)。溝の幅 200→180px、横木の幅 180→160px。
     合計は 180 + 12 + 120 = 312px 以下。
  2. 「踏み込む」「戻す」に btn と btn--secondary のクラスを付けた
     (共通のボタンの見た目。枠・背景が付く)。
  3. 決まりに無い色 (--c-kinari-dark と直書きの #EDE7D5) をやめ、溝とメーターの帯の背景は
     --c-white にした。
  4. 横木のはみ出しを直した: 横木の上端 = (溝の高さ − 横木の高さ) × 値 / 100 (px で出す。
     translate の縦方向はやめた)。押した位置から値を求める計算も同じ範囲に合わせた
     (横木の高さの半分 32px を上下から除いた範囲。横木の中心が指の位置に来る)。
- ついで (管理者の指示): games/winding/logic.ts の最後の「void MAX_SPEED;」と、
  使っていない MAX_SPEED の import を消した (同じコミット)。
- テスト (先に RED を確認): pedalControl.test.ts に2件追加
  (btn / btn--secondary のクラス。値 0 で横木の上端 0px・値 100 で 176px)。
  既存テスト1は押す位置を変えた (理由: 確認役が横木の位置の計算を直したため。
  上端 +32px で 0、下端 −32px で 100、真ん中で 50)。
- テスト全体: 357 passed / 11 skipped。npm run check エラー0。npm run build 成功。
- ブラウザ確認は T2-07 でまとめて行う。


## 2026-09-30 T2-05: ドラム巻きの座標と盤面の描画

- やったこと:
  - src/games/winding/geometry.ts (新規): 論理座標 1000×750。toPx・fromPx はクリール立てと同じ形。
    区画: クリール x 40〜240、台とレール x 260〜560、ドラム x 580〜960、上の余白 y 0〜90。
    endPoint (クリール側は x 380、ドラム側は x 460 付近。糸は上から下へ等間隔)、
    hitEnd (当たりは画面上 64px 四方 = 論理 32/scale の半径。近いほうの端を選ぶ)、fontPx。
  - src/games/winding/renderer.ts (新規): drawBoard。
    背景 (kinari)、クリール (machine 色の枠と柄の色のコーン)、糸 (コーンからドラムまで。
    巻いているときは速さに比例して流れる印)、ドラム (木の桟のかご状の胴。帯の区画を sections 等分し、
    柄の色の縞を巻いた長さの厚みで。帯ごとの鋼色のピン。巻き終えた帯には区画の上端に結び目の束。
    'cutting' の演出は tieProgress (0〜1) で結び目を透かして描く)、
    目盛り盤 (円の針 +「帯 3 / 5」)、赤ランプ ('broken' で shu 点灯・「停止」。それ以外は灰色)、
    切れ端 ('broken' で両側を垂らす。show red は shu + timeMs で揺らす、droop は垂れだけ、
    small は垂れを小さく。1手目を済ませたらクリール側の端に藍の丸印)、
    'done' では帯ごとの出来で表面の線を波打たせる (波の高さ = (1 − 出来) × 係数)。
    文字は画面 px で決め (20px 以上)、Canvas の幅は clientWidth を使う。
  - src/games/winding/geometry.test.ts (新規)、renderer.test.ts (新規)、renderer.test.helpers.ts (新規、
    偽の ctx。テストの補助)。
- テスト (先に書いて RED を確認: geometry.ts・renderer.ts が無く import 失敗):
  - geometry 5件: toPx・fromPx の往復、endPoint が threadCount 本とも盤面の中 (x 380・460 付近、等間隔)、
    hitEnd の当たり・null、scale 0.4 で画面上 30px が当たる、間を押すと近いほう。
  - renderer 4件: 'broken' で shu の線 (show red)、ランプの点灯 (shu) ・消灯 (steel)、
    'done' で帯の数だけ表面、文字は画面 px で 20 以上。
  - テスト側の不備の修正のみ (期待値の変更ではない): 「遠い点」を糸1本分の当たりに入らない位置に変更、
    偽の ctx に quadraticCurveTo を追加。
- テスト全体: 366 passed / 11 skipped。npm run check エラー0。npm run build 成功。
- 見た目は T2-07 でまとめて確認する (仕様書どおり)。


## 2026-09-30 T2-06: ドラム巻きの操作欄 (games/winding/panel.ts)

- やったこと:
  - src/games/winding/panel.ts (新規): createWindingPanel。区画は上から
    1. 帯の番号と長さ (「帯 2 / 5」「巻いた長さ 45%」)
    2. 張りのメーター (createTensionMeter、label は terms.t('tension'))
    3. ペダル (createPedalControl、label は terms.t('pedal')。onChange で setPedal。
       phase が 'winding' のときだけ押せる)
    4. ボタン ('ready' は「巻き始める」→ start、'cutting' は「帯の端を結ぶ」→ cut。
       それ以外はボタンを出さないが、場所は空けたまま (display の切り替え) で配置がずれないようにした)
    メッセージ欄は作らない (GameFrame の message 欄を controller が使う)。
    配置は CSS で: 横長はペダルとメーターを横に並べられる形、縦長は操作欄内で縦にスクロール可
    (ペダルの溝の高さ 260px は T2-03 のまま維持)。
  - src/games/winding/panel.test.ts (新規): 仕様書のテスト 1〜6。
  - src/styles/base.css: 末尾に「/* winding (T2-06) */」の節を追加 (既存の行は変えていない)。
- テスト (先に書いて RED を確認: panel.ts が無く import 失敗): 6件。
  'ready' で「巻き始める」→ start、'cutting' で「帯の端を結ぶ」→ cut、
  'winding' 以外でペダルが押せない (disabled の class で確認)、「帯 2 / 5」の文字、
  ペダルの「踏み込む」で setPedal、destroy で DOM から消える。
- テスト全体: 372 passed / 11 skipped。npm run check エラー0。npm run build 成功。
- 見た目は T2-07 でまとめて確認する (仕様書どおり)。


## 2026-09-30 T2-05 追加修正: 盤面の描き方を座標の変換と決まりに合わせる (T2-06 の横木の件も含む)

- 直した点 (renderer.ts・panel.ts):
  1. 座標の変換: 論理座標で描く部分は ctx.save() → translate(fit.offsetX, fit.offsetY) →
     scale(fit.scale, fit.scale) をしてから描き、描き終えたら restore() する。
     線の太さなど「画面上で N px」のものは fontPx(fit, N) のまま。
     背景 (kinari) は変換の前に Canvas の画面上の大きさ (clientWidth・clientHeight。
     0 のときだけ width・height) で塗る。
  2. 文字の位置: 「帯 3 / 5」は目盛り盤の右、「停止」は赤ランプの右。restore のあとに、
     論理座標の点を toPx で画面の点に直して描く (大きさは画面 px 20 以上)。
  3. 色の直書きをやめ、core/ui/tokens.ts の COLORS を import して使う
     (renderer.ts に # で始まる色は書いていない。糸の色は内容データの hex)。
  4. 書体: ctx.font に core/ui/tokens.ts の FONT_FAMILY を使う (sans-serif の直書きをやめた)。
  5. 速さの二重計算: core/mechanics/pedal.ts の speedOf と params.ts の TENSION を使う
     ((pedal/100) × 40 の直書きをやめた)。1本の帯の長さも params.ts の SECTION_LENGTH を使い、
     renderer.ts 内の同じ値の関数をやめた。
  6. check: 報告の直前に npm run check・npm test・npm run build を実行し、
     push のあと CI が success になったことを確かめた (下に結果)。
  7. (T2-06 の件) panel.ts の update(s) で pedal.setValue(s.pedal.pedal) を呼ぶようにした
     (糸切れ・巻き終え・裏に回ったときに、横木が 0 の位置に戻る。setValue は onChange を呼ばない)。
- テスト (先に書いて RED を確認): renderer.test.ts に4件追加
  (save → translate → scale が save の後・restore のあとには文字だけ、
  「帯 1 / 3」の fillText が restore のあとで Canvas の幅の中 (scale 0.39 と 0.7 の両方)、
  font に FONT_FAMILY、背景の fillRect が save の前で大きさは clientWidth・clientHeight)。
  panel.test.ts に1件追加 (ペダル 60 の状態で update したあと、ペダル 0 の状態で update すると
  表示が「速さ 0」になる)。偽の ctx に scale の記録を足した。
  テストの期待値は変えていない (テストの追加と、restore が必ずしも最後の op でないことの確認方法の修正のみ)。
- 報告直前の確認: npm run check エラー0 / npm test 377 passed・11 skipped / npm run build 成功。
- CI: success (3796eb7)。


## 2026-09-30 T1-19: 設定画面の今の値の大きさ、呼び名の変更画面の区分け

- やったこと:
  - A. 設定画面: .settings__value を var(--fs-label) (24px。特大では 28px) の濃い色 (--c-sumi) に。
    太さは普通のまま。値が無いとき (「（未設定）」) だけは薄い色にするため、
    settings__value--empty クラスを付けた (お名前・屋号の両方)。
  - B. 呼び名の変更画面: 見出し「整経の用語」(キーが game. で始まらないもの。初期値ファイルの順) と
    見出し「ゲームの名前」(キーが game. で始まるもの。初期値ファイルの順) の2つの区画に分けた。
    見出しは h2 (terms__head)、--fs-label の太字。区画のあいだに区切りの線 (1px --c-steel) と
    上下 24px の余白。行のキーは「変更」ボタンの testId (data-testid) に入れて判別できるようにした。
  - C. 小さな直し:
    1. 入力の画面の題名を entry.key から「『今の呼び名』の呼び名」(例:「『クリール』の呼び名」) に変えた。
    2. 「戻る」を題名と同じ行の左 (settings__bar) に移した (設定画面と同じ形)。
- テスト (先に書いて RED を確認): tokens.test.ts に1件 (settings__value が fs-label・濃い色、
  --empty が薄い色)。settingsScreen.test.ts に1件 (お名前が空のとき --empty が付き、
  入れたあとは付かない。更新後の画面は再 mount で確かめた)。termsScreen.test.ts を新規に3件
  (見出しが2つ・1つ目に game. が無く2つ目だけ、入力の画面の題名にキーが無く今の呼び名が含まれる、
  戻るが題名と同じ見出しの中)。
- 報告直前の確認: npm run check エラー0 / npm test 382 passed・11 skipped / npm run build 成功。
- ブラウザ確認 (build → preview 4173、SW 掃除のうえ新規タブ):
  - 1180×820・412×915 の設定画面と呼び名の変更画面で、20px 未満の文字は無し。
    横のはみ出し無し (scrollWidth = clientWidth)。
  - お名前を入れた状態: 今の値が 24px の濃い色 (rgb(43,42,36))。空のときは薄い色 (--empty)。
  - 呼び名の変更画面: 見出し2つ。1つ目の区画のキーは creel・cone・lease・section など (game. 無し)、
    2つ目は game.creel・game.winding・game.beaming など (game. のみ)。
  - 入力の画面の題名は「『クリール』の呼び名」(キーの英字は出ない)。「戻る」は題名と同じ行の左。
- CI: success (コミット 08eedb2 の push のあとに確認)。


## 2026-09-30 T1-20: 遊び方の説明文の呼び名の置き換え、「ヒント」が使える条件の表示と説明

- やったこと:
  - A. 遊び方の説明文の {{…}}: showTutorial の opts に renderText (無ければ文をそのまま) を足し、
    各ページの文は renderText を通してから表示するようにした。
    呼び出す2か所 (gameScreen.ts の初回の遊び方・games/creel/controller.ts の「遊び方」ボタン) で、
    それぞれ ctx.terms.render・deps.terms.render を渡した。
    呼び名を設定で変えた場合も変えた呼び名で表示される (terms.render のため)。
  - B. ヒントのボタン: checks が HINT_MIN_CHECKS (2) 未満のとき「ヒント(あと N 回)」
    (N は HINT_MIN_CHECKS − checks)。使えるときは「ヒント」。
    完成後・✕ が無いとき (checks は足りているが使えない) も「ヒント」のまま押せない。
    文字の大きさ・ボタンの高さは変えていない。
  - C. 遊び方に4ページ目を足した: 文は「「確認する」を2回押しても ✕ が残るときは、
    「ヒント」で1か所を直せます(ヒントを使うと星は1つになります)」
    (starsOf の決まりと食い違わない)。
    絵は ✕ の付いたマスの横に「ヒント」のボタンの形を描き、矢印の先で ✕ が
    正しい色のマスに変わる様子。
    あわせて tutorial.ts の直書きの色 ('#2B2A24' など) を tokens の COLORS に、
    書体 (sans-serif) を FONT_FAMILY に置き換えた。
- テスト (先に書いて RED を確認): gameParts.test.ts に2件 (renderText で置き換わる・
  渡さないとそのまま)。panel.test.ts に1件 (最初「ヒント(あと 2 回)」で押せない、
  1回確認で「ヒント(あと 1 回)」、2回で「ヒント」になり押せる)。
  tutorial.test.ts を新規に3件 (4ページで4ページ目に「ヒント」「確認する」「星は1つ」、
  2ページ目が {{spindle}}・{{cone}} を含む、tutorial.ts に直書きの色・sans-serif が無い)。
- 報告直前の確認: npm run check エラー0 / npm test 388 passed・11 skipped / npm run build 成功。
- ブラウザ確認 (build → preview 4173、SW 掃除のうえ新規タブ):
  - 遊び方が4ページ。2ページ目は「品番の書かれた箱を選び、軸に触れるとコーンが立ちます」
    ({{…}} が出ない)。設定で「コーン」の呼び名を「糸かたまり」に変えると、
    遊び方の2ページ目が「…軸に触れると糸かたまりが立ちます」になった (1180×820・412×915 の両方)。
  - ヒントのボタンの文字は「ヒント(あと 2 回)」→ 確認1回で「ヒント(あと 1 回)」→
    2回で「ヒント」になり押せる (段階1と、IndexedDB に確認用の記録を書いて解放した段階5 の両方)。
    操作欄のスクロールは出ない (scrollHeight = clientHeight)。
  - 412×915: ボタンの文字は折り返さず (高さ 64px のまま)、はみ出し無し (scrollWidth = clientWidth)。
- CI: success (push のあとに確認)。


## 2026-09-30 T2-07: ドラム巻きを組み立てて遊べるようにする

- やったこと:
  - 一覧 (listView.ts): 「初級・中級・上級」の大きなボタン。クリア済みと最初の未クリアだけ押せて、その先は「未解放」。星は「★★★」形式
  - プレイ画面 (controller.ts): gameFrame + drawBoard (T2-05 の盤面) + createWindingPanel (T2-06 の操作欄) をつなぐ
  - 時間は requestAnimationFrame で進める。dtMs は前のフレームとの差で、MAX_TICK_MS (100ms) を超えない
  - ページが裏に回ったら (visibilitychange hidden) ループを止め、ペダルを 0 にする。戻ったら測り直して再開
  - unmount で rAF・interval (保存・結びの演出)・timeout・visibilitychange・pointerdown をすべて解除
  - 「帯の端を結ぶ」は1秒の演出をしてから cut を送る。演出中は操作を受け付けない
  - 「遊び方」は showTutorial に renderText として terms.render を渡す ({pedal} が呼び名に置き換わる)
  - 遊び方 (tutorial.ts): 3ページの Canvas の略図。文は大人向け。色は COLORS、直書きなし
  - 切れ端を当てる: 盤面の pointerdown で fromPx → hitEnd → tapEnd。'broken' 以外のときは何もしない
  - index.ts: mode 'job' は仕事の内容で、resume は isValidResume を満たすときだけプレイ画面を開く。それ以外は一覧
  - main.ts に registerGame(createWindingModule(...)) を追加
  - gameScreen.ts: onFinish の成績に 'level:' で始まるキーも残す (難易度の星。従来は 'puzzle:' のみで、ドラム巻きの解放が効かなかった)
- テスト (先に RED を確認):
  - controller.test.ts (5件): 一覧の解放・プレイから結果まで (stars 3)・hidden でペダル 0 と rAF 停止・unmount 後に rAF が残らない・resume でペダル 0
  - tutorial.test.ts (4件): 3ページと pedal 置き換え対象の有無・色の直書きなし・renderText での置き換え・renderText 無しではそのまま
  - gameScreen.test.ts (1件): 'level:' のキーも成績に残る
- 報告直前の確認: npm run check エラー0 / npm test 398 passed・11 skipped / npm run build 成功
- ブラウザ確認:
  - 1180×820: 一覧・プレイ・糸切れ・切れ端を2回押してつなぎ・完成・結果 (★★★)・「続けて遊ぶ」で中級が解放
  - 960×720: 一覧・プレイ。はみ出し無し・20px 未満の文字無し
  - 412×915: 一覧・プレイ。はみ出し無し・小さい文字無し
  - 精細さ2倍 (dpr 2, 1180×820): はみ出し無し
  - 回転 (915×412 横長): はみ出し無し。hidden で速さ 30 → 0 (ペダルが戻る) を確認
  - 途中保存: 「戻る」→「ホームに戻る」→「続きから」で帯 1/5・3% から再開し、ペダルは 0
- コミット: 71b5aa1 (T2-07 本体) / 8cc6afe (level: の記録修正) / 報告コミットはこのあと

## 2026-09-30 T2-07 追加修正: 再開と「戻る」、時刻を rAF に、縦長の盤面と操作欄

- やったこと:
  - 追加修正a (コミット 629353b):
    - 糸が切れた途中 (broken)・帯を巻き終えた直後 (cutting) で再開しても時間が進むようにした (resume 後に rAF のループが回る)
    - 「戻る」で難易度の一覧に戻る (クリール立て T1-15 と同じ。confirmDialog「難易度の一覧に戻りますか?(途中の状態は保存されます)」)。一覧には「途中」と表示し、押すとその状態から再開。仕事 (job) モードでは確認を出さずに onExit へ
    - Date.now() をやめて requestAnimationFrame の時刻に統一 (結びの演出も setInterval → rAF の時刻)。messages.ts を新設し controller.ts を 299 行に
    - 糸切れ中も毎フレーム描き直す (切れ端が揺れる)
  - 追加修正b (コミット 3da90b0 と 66885e2):
    - gameFrame に portraitStageRatio を追加 (既定 0.6、ドラム巻きは 0.4)。縦長でも盤面を縮めてペダルが見える
    - 盤面の「帯 N / M」の文字をやめた。「停止」は赤いランプの下に、文字の中心をランプにそろえて描く
    - 縦長のときはペダルの溝を 160px に低くし、張りのメーターを横並びにして、操作欄をスクロールなしで見えるようにした (base.css の縦長メディアクエリのみ)
- テスト (先に RED を確認):
  - 追加修正a: controller.test.ts に4件 (broken で再開して tapEnd と時間が進む・「戻る」で確認ダイアログと「途中」表示・cutting で再開・Date.now を使わない)
  - 追加修正b: gameParts.test.ts に portraitStageRatio の2件、renderer.test.ts に「帯 N / M が無い」「停止はランプの下で中心そろえ」の2件
- 報告直前の確認: npm run check エラー0 / npm test 409 passed・11 skipped / npm run build 成功
- ブラウザ確認 (ビルド後の画面):
  - broken で再開: 「戻る」→ 一覧に「途中」→ 再開 → 赤い切れ端を2回押してつなぐ → 帯 1/3・70% から巻き直せる。切れ端は揺れている (画面の赤ピクセルの平均 x が 369→370→369 と変化)
  - cutting で再開: 「帯を巻き終えました」の状態で「戻る」→「途中」→ 再開 → 「帯の端を結ぶ」→ 帯 2/3 が 0% から巻ける (速さ 10・長さ 1% と進む)
  - 412×915 (縦長): 操作欄の clientHeight = scrollHeight = 397 (スクロールなし)。張り・ペダル・戻す・踏み込む・速さがすべて見える
  - dpr 2・回転 (915×412)・960×720: はみ出し無し
- コミット: 629353b (追加修正a) / 3da90b0 (追加修正b の盤面) / 66885e2 (追加修正b の縦長の操作欄) / 報告コミットはこのあと

## 2026-09-30 T2-07 追加修正2: 切れ端の当たりのずれ、メッセージのぶれ、一時ファイル

- やったこと:
  - 切れ端の当たりのずれ: 糸の縦の位置を決める関数 `threadY(thread, threadCount)` を geometry.ts に1つだけ置いた (論理 300〜620 の等間隔)。endPoint と renderer の糸・コーン・切れ端の描画はすべて threadY を使い、renderer の coneY は削除した
  - メッセージの行数によるぶれ:
    - メッセージ欄はいつも 2 行ぶんの高さ (`min-height: calc(2 * 1.3em)`・line-height 1.3。縦長の画面も同じ。縦長の節から `min-height: 0` を削除)
    - 張りのメッセージ (適正・強すぎ・弱め) は、新しい文が 0.5 秒 (params.ts の `MESSAGE_HOLD_MS = 500`) 続いてから切り替える。待っているあいだに別の文になればそこから測り直す。表示中と同じ文に戻ったら待ちを取り消す。糸が切れた・帯を巻き終えたなど張り以外のメッセージはすぐに切り替える。時刻は rAF の時刻 (nowMs) を使う
  - 一時ファイル: dbg.test.ts を削除した
- テスト (先に RED を確認):
  - geometry.test.ts 2件: threadY がすべての糸で endPoint の y と同じ / threadY は等間隔で盤面の中
  - renderer.test.ts 1件: 'broken' の切れた糸の朱の線の y (論理座標) が endPoint の y と同じ
  - controller.test.ts 1件: 張りの文が 0.5 秒続かないと変わらない・0.5 秒続くと変わる (中級・resume で糸切れしない rng を固定して確認)
- 報告直前の確認: npm run check エラー0 / npm test 412 passed・11 skipped / npm run build 成功 / git status に余計なファイルなし

## 2026-09-30 T2-08: 盤面の絵を実物らしくする

- やったこと (仕様書「写真から読み取った特徴」「動画から読み取った特徴」どおり):
  - クリール: 木の柱 (2本)・柱の上の丸い小ランプ・コーン (先の細い台形・穴の上糸が盛り上がり)・ペグ (横の棒と先端の丸) を描く。糸はコーンの穴から出てペグの丸を通る
  - 台: 台の上に筬 (鋼色の枠に細い縦の歯) を置く。糸はコーンから筬に向かって集まり、筬の左端から1本にまとまってドラムのピンに向かう
  - ドラム: 軸を中心に木の桟 (横長の板) をすき間をあけて並べ、桟のすき間から機械の色が見える。ドラムの下に横木を足し、鋼のピンで糸の束の端を留める。目盛り盤 (半円と針) と赤いランプをドラムの上に置く。「停止」の文字はランプの下 (T2-07 追加修正b どおり)
  - 帯を巻くと、その区画を糸の色の縦の縞で塗る (模様の plan どおりの順で並べる)。巻いた長さの割合に応じて縞の濃さを上げる
  - 糸が動いているとき、糸の上に流れる印 (小さな点) を進める (幅 1000 を rAF の時刻で往復)
  - 帯を巻き終えた区画の上端に結び目の束 (小さな輪 3つを縦に) を描く
  - 完成すると、帯ごとの出来を波打った線の縞で表す
  - 色は tokens.ts から選び、色の値は renderer.ts に直書きしない
- ファイル: renderer.ts (299行)・renderer.parts.ts (新設 153行、ドラムと結び目の描画)・geometry.ts (REED_X・THREAD_SHEET_HALF を追加)
  - renderer.parts.ts を新設した理由: renderer.ts が 444 行になり、00_rules.md の「1ファイルは 300 行以内」を守るため。仕様書の「変更してよいファイル」への追記になるので、判断に迷ったが規則のほうを優先した (報告で伝える)
- テスト (先に RED を確認): renderer.test.ts に6件
  - コーンが threadCount 個 (roundRect 2回 = 本体と盛り上がり) / ペグの丸がコーンの下 / 筬の歯の縦線が threadCount 本以上 / 桟の縦のすき間が7個以上 / ピンの鋼色 / 色の値 (#) を直書きしていない
  - 既存の描画テスト (糸・切れ端・結び目・帯の縞・停止ランプ) もすべて通る
- 報告直前の確認: npm run check エラー0 / npm test 418 passed・11 skipped / npm run build 成功 / git status に余計なファイルなし
- ブラウザ確認 (ビルド後の画面・スクショ 5場面 + 各サイズ):
  - 巻き始める前 (t208_ready_1180.png): クリール・筬・ドラム・目盛り盤・ランプ。巻いていない区画は木の桟
  - 巻いている途中 51% (t208_winding_half_1180.png): 帯1の区画が紺の縞、未巻きは桟。流れる印あり
  - 糸が切れたとき (t208_broken_1180.png): 赤い切れ端・赤いランプ点灯・「停止」はランプの下
  - 帯を2本巻き終えた (t208_two_bands_1180.png): 帯1・2が縞、上端に結び目の束、下の横木にピンと糸の束
  - 完成 (t208_done_1180.png): 帯3本とも縞・結果ダイアログ
  - 412×915 (縦長): 切れ端を2回押してつなぐ (t208_tied_412x915.png)。操作欄スクロールなし
  - 960×720・dpr 2: はみ出し無し

## 2026-09-30 T2-08 追加修正a: ドラムの向き・台の移動・結びの演出・流れる印

- やったこと:
  - ドラムの軸を縦にした。両端の円盤は上と下 (横長の楕円)、木の桟は縦長の板を左右に並べ、明るさの勾配は横向き (createLinearGradient を left→right に)。帯の区画は上から下へ sections 等分 (geometry.ts の drumSectionY)。巻いた帯は横の縞 (柄の plan の色を区画の高さの中で上から順に繰り返す)。結び目の束は各区画の左の端。ピンの横木はドラムの左の縁に沿って縦に、帯ごとに1本
  - 台と筬が今の帯の区画の高さへ動く (geometry.ts の tableY(current, sections) が区画の中心を返す。current は小数も可)。筬を通った糸は横向きに今の帯へ入る。切れ端の位置と当たり (threadY・endPoint) は変えていない。台が動く範囲は切れ端 (x 380・460) より右 (REED_X 410 は維持、台の絵は x 260..560 で切れ端の x と重なるが、当たりは糸の y のみで縦の位置は台より左側の糸の範囲 300..620 … 台が縦に動いても糸の y は変わらないため当たりには影響しない)
  - 結ぶ演出: tieProgress 0→1 で、今の帯の区画の左の端に糸の色の輪が大きく広がってから結び目の束に縮む (半径 = KNOT.h × (0.5 + 2.5 × sin(p×π))。p 1 で束)。結び終えた区画は縞をいちばん濃く (alpha 1) し、縁に濃い線を引く
  - 流れる印: geometry.ts の pointOnPath (コーン → クリール側の切れ端 → 筬 → 今の帯 の折れ線上の点) を新設し、印は糸の線の上を動く
  - 巻き始めの縞の濃さ: alpha を 0.15 から始めて巻いた割合で 1 まで上げる
- ファイル: geometry.ts (drumSectionY・tableY・pointOnPath・REED_RISE を追加、REED_Y を廃止)、renderer.ts、renderer.parts.ts (軸を縦に書き直し、drumSectionPinY に改名)、各 test
- テスト (先に RED を確認): geometry.test.ts 5件 (区画が上から並ぶ・tableY が区画の中心・切れ端は変わらない・筬と帯は横向き・pointOnPath が糸の線の上)、renderer.test.ts 5件 (円盤が上と下・帯の縞は横の線・台の位置・tieProgress 0.5 で輪がいちばん大きい・印が糸の上)
- 報告直前の確認: npm run check エラー0 / npm test 428 passed・11 skipped / npm run build 成功 / git status に余計なファイルなし
- コミット: aac17e8 (push は rebase のあと。CI success)
- ブラウザ確認 (スクショは Discord 報告に添付):
  - 巻き始める前: 軸が縦のドラム (円盤が上と下・桟は縦長・勾配は横向き)、帯1の高さに台と筬、糸が横向きに帯へ
  - 51%: 帯1の区画に横の縞 (薄い)、未巻きは桟、糸の上に流れる印
  - 結ぶ演出の途中: 帯1の左端に大きく広がった輪
  - 結び終え: 台と筬が帯2の高さへ移動、帯1は濃い縞＋縁取り＋左端の結び目の束、帯2のピンに糸の束

## 2026-09-30 T2-08 追加修正b: 操作欄のあふれ・メーターの幅

- やったこと (base.css の pedal・winding・game-frame の節):
  - メッセージ欄 (.game-frame__message) は position: sticky; top: 0 で操作欄の上に固定 (背景は操作欄と同じ kinari。z-index 1)。スクロールしても隠れない
  - 主ボタンの区画 (.winding-panel__actions) は position: sticky; bottom: 0 で操作欄の下に固定 (背景は kinari)
  - 横あふれ: .pedal__row に min-width: 0・max-width: 100%。ペダルの溝は width 180・min-width 120・flex 0 1 auto で縮む。横木 (.pedal__bar) に max-width: calc(100% - 8px)。ボタンは min-width 96px (高さは var(--btn-min-h) のまま)・white-space: nowrap。あふれのもう1つの原因だった .tension-meter にも min-width: 0・max-width: 100%
  - 張りの状態の文字 (.meter__state) は width: 5.5em・flex: none で固定幅 (一番長い「▲ 強すぎ」に合わせる)
- テスト (先に RED を確認): tokens.test.ts に4件 (メッセージの sticky top 0・主ボタンの sticky bottom 0・ペダルの列の縮みと最小幅・状態の文字の固定幅)
- 報告直前の確認: npm run check エラー0 / npm test 432 passed・11 skipped / npm run build 成功 / git status に余計なファイルなし
- コミット: 3bc6ae3 (CI success)
- ブラウザ確認 (スクショは Discord 報告に添付):
  - 960×720 (帯を巻き終えた状態): 修正前は scrollW 313 > clientW 309 で横あふれ。修正後は scrollW = clientW (あふれなし)。操作欄を一番下までスクロールしても、メッセージは上 (msgTop 0) に見え、「帯の端を結ぶ」は操作欄の下端に固定で見える
  - 1180×820: scrollH = clientH 724・横あふれなし (今までどおりスクロールなしで収まる)
  - 412×915 (縦長): 横あふれなし (scrollW = clientW 388)。メーターの帯の幅は状態の文字が変わっても 268px で不変 (state は width 5.5em = 64px 固定)

## 2026-09-30 T2-09a: 範囲をお題ごとに決める・張りの流れと引っかかり・目標の時間

- やったこと:
  - 適正範囲を State に持つ (range: {min, max})。中心はお題ごとに乱数 (RANGE_CENTER: 初級 45〜55・中級 40〜60・上級 35〜65)、幅は RANGE_WIDTH (初級 30・中級 18・上級 10)。params.ts の RANGE(level) は廃止し、RANGE_WIDTH・RANGE_CENTER に分けた。メーターは State の範囲を表示する (panel は opts で渡さず update で State から)
  - 張りの流れ (ドリフト): pedal.ts に DriftParams (perSec・turnRate・max) と PedalState.drift を追加。stepDrift は向き (±1) を持ち、turnRate × dtSec の確率で向きだけが反転する (drift は 0 を通って連続に動くので 1フレームの動きは perSec × dtSec 以内)。±max で clamp。tensionOf は noise + drift + snag を足す
  - 引っかかり: pedal.ts に stepSnag (snagRate × dtSec の確率で snagSize 上がり、SNAG_RECOVER_MS = 2000ms かけて 0 に戻る。raised で上がった瞬間の量を返す) と PedalState.snag。logic.ts は snagRaised を State に置き、tick のあいだだけ立つ
  - messages.ts: 引っかかりのメッセージ「糸が引っかかりました。張りに注意してください」を張りの 3 文より先に出す
  - 目標の時間: logic.ts に elapsedMs (巻いていた時間と止まっていた時間の合計。'broken' でも進む) と targetMsOf (TARGET_SEC_PER_SECTION × 帯の数。初級 30・中級 26・上級 22 秒/本)。星3の条件に「目標の時間内」を追加 (平均 0.8 以上かつ elapsedMs <= 目標)。resultOf の summary に「巻いた時間 X(目標 Y)」を追加 (msToText は「1分30秒」の形)
  - 操作欄に経過時間「0:42 / 1:30」の形の表示 (.winding-panel__time) を追加
  - ぶれ (noise) は難易度ごとに NOISE_AMP (初級 ±1・中級 ±1.5・上級 ±2)
- テスト (先に RED を確認): pedal.test.ts に5件 (流れが同じ種で同じ・±max と1秒あたりの上限・引っかかりの2秒戻り・「置いておくだけでは外れる」・「調整すれば上級でも星3が取れる」)。logic.test.ts に6件 (範囲が難易度の幅と中心の中・同じ種なら同じ範囲・引っかかりのフラグ・elapsedMs に糸切れの時間も含む・目標の時間内なら星3・summary に巻いた時間)。旧テスト「pedal 40 (安全なペダル) で星3」は「ゆっくり踏めば必ず適正範囲に入る」の約束がなくなったため、「初級で毎秒合わせ直しながら巻くと星3」に書き換えた
- 数値について: 仕様書どおりの初期値。上級は引っかかり (snagSize 12・BREAK_RATE 0.04) の組み合わせで切れることがあるが、pedal.test.ts の「調整すれば上級でも星3が取れる」テスト (中心 45〜60・複数種) で、調整すれば適正 0.8 以上になることを確認した。数値の調整は確認役が行う前提
- 報告直前の確認: npm run check エラー0 / npm test 442 passed・11 skipped / npm run build 成功 / git status に余計なファイルなし
- コミット: 0e5390f (push は rebase のあと。CI success)
- ブラウザ確認 (スクショは Discord 報告に添付):
  - 初級のメーターの適正範囲が「32.2% から幅 30%」(中心 47.2) と、お題ごとの値になっている
  - 経過時間の表示「0:00 / 1:30」が操作欄に出る (初級 30秒 × 3本 = 1分30秒)
  - ペダルを範囲の中心に合わせて放置すると、針が 46.5% → 52.7% → 55.2% と流れで動く (触らなくても動く)
  - 帯1を 25秒で巻き終えた (目標 30秒内)。メッセージ・効果音は従来どおり

## 2026-09-30 T2-09b: 複数の糸切れ

- やったこと:
  - breakage.ts: BreakState の 'broken' を { threads: number[]; tied: number[]; first: FirstTap | null } に変えた。BreakParams に extraStep (切れる本数が1本増える外れの量) と maxThreads (いちどに切れる本数の上限) を追加
  - いちどに切れる本数は「1 + floor(外れ量 / extraStep)」(最大 maxThreads)。どの糸が切れるかは乱数で決め、重ならない。難易度ごとの初期値: extraStep 初級 10・中級 8・上級 6、maxThreads 初級 1・中級 2・上級 3 (params.ts の BREAK_EXTRA_STEP・BREAK_MAX_THREADS)
  - つなぎ方は「切れた糸ごとに 2手」。1手目は切れた糸のどちらの端 (creel でも drum でも) でよく、first に { thread, side } を記録。2手目は同じ糸のもう一方の端。つながると tied に入り、まだ切れた糸があれば first を null に戻して次の糸へ。全部つながると running に戻る
  - 新しい結果: tiedOne (1本つながった)・tiedAll (全部つながった)・mismatch (2手目が別の糸の端。1手目からやり直し)。旧 tied・retry は廃止 (drum 先から押せるので retry は不要)
  - messages.ts: 「つながりました。残りの切れた糸もつないでください」(tiedOne)・「別の糸です。結ぶ糸の両方の切れ端を押してください」(mismatch) を追加。効果音: tiedOne・tiedAll は knot、mismatch は gentleNo
  - renderer.ts: 切れた糸ごとに切れ端を描く (threads の数ぶん)。1手目の藍の丸印は押した側の端 (creel なら CREEL_END_X、drum なら DRUM_END_X) に出す。drawBrokenThread は renderer.parts.ts へ移した (300行ルール)
  - logic.ts: tapEnd の tiedAll で 'winding' に戻る。lastTapResult は TapResult を返す
- テスト (先に RED を確認): breakage.test.ts を全面書き換え (11件)。外れ方で本数が決まる (1・2・最大3)・重ならない・同じ種なら同じ本数と同じ糸・1手目はどちらの側でもよい・2手目で tiedOne/最後で tiedAll・mismatch でやり直し・切れていない糸は wrongThread (tied を含む)・running は ignored。logic.test.ts は「切れた糸を全部つなぐと winding に戻る」に更新。renderer.test.ts に2件 (切れた糸2本で切れ端2本・1手目の印は押した側の端)
- 報告直前の確認: npm run check エラー0 / npm test 448 passed・11 skipped / npm run build 成功 / git status に余計なファイルなし
- コミット: 691b236 (本体)・14eb67d (未使用 import の修正。最初の push で CI が failure になったので出した修正。CI success)
- ブラウザ確認: 中級・上級は解放前のため実機では確認できず (解放後に確認をお願いしたい)。初級 (maxThreads 1) で糸切れを起こし、drum 側の切れ端を先に押しても「もう一方の切れ端を押してください」→ 反対側でつながり運転に戻ることを確認。複数本の切れ端の描き分け・当たりはテストで担保
## 2026-10-01 T2-09 追加修正a・b: 引っかかりのメッセージ・+4 の廃止・止まる音・文言と回数

### 追加修正a (コミット d500dba。742ce90 で eslint 修正。CI success)
- 引っかかりのメッセージ (1): messageFor は s.snagRaised ではなく s.pedal.snag > 0 を見る (引っかかりが戻りきるまで最大2秒出続ける)。controller の updateMessage は「張りの3文以外は待たずにすぐ表示」に変えた (urgent = phase が winding でない、または pedal.snag > 0)
- 糸量の +4 (2): params.ts の TENSION.yarnDrift を 0 にした。pedal.ts の計算式 (yarnDrift × progress) はビーミングでも使うので残す
- 止まる音が鳴り続ける (3): controller の loop は「前の phase が 'broken' でなく次が 'broken'」の1回だけ audio.play('stop') を呼ぶ。sounds.ts の stop に低い音 (250Hz・startMs 200・durMs 550) を足し、全体の終わりを 750ms にした
- テスト (先に RED を確認): controller.test.ts 3件 (引っかかりの文がすぐ出て1秒後も出続ける・戻りきって500ms後に張りの文に戻る・切れたとき stop は1回だけ)、audio.test.ts 1件 (stop の終わりは 700〜800ms)、logic.test.ts 1件 (progress 0 と 0.9 で張りが同じ)
- 報告直前の確認: check エラー0 / npm test 453 passed・11 skipped / build 成功

### 追加修正b (コミット 078e034。CI success)
- 文言 (4): mismatch は「その端は別の糸です。同じ糸の両端をつないでください」、tiedOne は「1本つながりました。あと N 本です」(N は残りの本数)
- mismatches (5): State に mismatches (init 0・isValidResume は 0 以上の整数。無い古いセーブは resume 不可)。結果の成績欄に「違う端を結ぼうとした回数 N回」(星には影響しない)
- 初級の切れる本数 (6): コードは変えず、P2/README の「糸切れ」の節に採用値 (extraStep 10/8/6・maxThreads 1/2/3) と経緯を書いた。節の見出しに T2-09b・追加修正b を追記し、糸継ぎの説明も複数本のものに替えた
- テスト (先に RED を確認): logic.test.ts 4件 (mismatch の文言・tiedOne の文言と残りの本数・mismatches が増えると resume できる/無いとできない・成績欄の行)
- 報告直前の確認: check エラー0 / npm test 457 passed・11 skipped / build 成功

### ブラウザ確認 (preview 4173。IndexedDB seikei-game の recs に records 行を書いて中級・上級を解放)
- 上級で引っかかりが起きると、メッセージがすぐ「糸が引っかかりました。張りに注意してください」になる (スクショ添付)。2秒ほど出続けることは controller.test 1・2 で担保 (実機では上級 22秒/本で巻き終える方が早かった)
- 上級で張りを強くして 2本切れた: 1手目 (クリール側) → 2手目 (同じ糸のドラム側) で「1本つながりました。あと 1 本です」→ 残りを結ぶと運転に戻った。スクショ添付
- mismatch の文言 (「その端は別の糸です」) はテストで担保。実機では 1手目のやり直しの場面を作れなかった
- 止まる音の 0.75 秒は headless では聞こえないため、audio.test 2 で担保

## 2026-10-01 T2-08 追加修正2: 桟が消える・メーターの横あふれ・帯の縞と結び目・遊び方の絵・コーンの輪郭

- コミット: f7342fd (4e2f53d で eslint の未使用変数を修正。CI success)
- やったこと:
  1. 巻いている途中の帯の桟が消える (不具合): 桟を飛ばしてよいのは巻き終えた区画だけに変えた (巻き始めた区画は桟を描き、その上に縞を重ねる)。renderer.parts.ts の桟ループの continue 条件を (i < current || done) に
  2. 960×720 でメーターが 4px あふれる (不具合): .meter__band に box-sizing: border-box を追加 (枠線 2px ずつが max-width に含まれる)
  3. 帯の縞が1本ずつ: params.ts に STRIPE_H = 6 (論理座標) を置き、柄の並びの色を区画の高さの中で上から順に繰り返す (最後の縞は区画の下端で打ち切る)
  4. 結び目が帯の色に埋もれる: drawKnot を3重の輪に (kinari の縁取り → 糸の色 → sumi の輪郭)。KNOT を { w: 24, h: 30 } に広げてピンの横木に少し重なる程度に
  5. 遊び方の1ページ目のドラムが横向き: tutorial.ts の drawDrum を盤面と同じ縦向きに (円盤は上と下の鋼色の板、桟は縦長の板を左右に)、巻いた帯は一番上の区画に横の縞
  6. 白いコーンが背景に溶ける: drawCreel のコーンに sumiSub の輪郭線 (線の太さは fontPx で最低 1.5px)。すべての色のコーンに付ける
- テスト (先に RED を確認): renderer.test.ts 4件 (巻いている区画に wood の桟がある・巻き終えた区画の縞が繰り返され1本の高さは STRIPE_H 以下・結び目に sumi の stroke・コーンの fill のあとに sumiSub の stroke)、tutorial.test.ts 1件 (1ページ目で円盤が上と下)、tokens.test.ts 1件 (.meter__band に box-sizing: border-box)
- 報告直前の確認: npm run check エラー0 / npm test 463 passed・11 skipped / npm run build 成功 / git status に余計なファイルなし
- ブラウザ確認 (preview 4173。IndexedDB に records を書いて解放):
  - 1180×820: 帯1を 20% 巻いた画面で、今の区画に桟が透けて見える (紺の薄い縞の下に茶色の桟)。白っぽいコーンに輪郭線があって背景と区別できる (スクショ添付)
  - 帯1を巻き終えて結ぶと、区画に細い縞が繰り返し現れ、結び目の束が白い縁取りで見分けられる。台と筬は帯2の高さへ移動 (スクショ添付)
  - 960×720: 操作欄 scrollWidth 309 = clientWidth 309 (横あふれ解消)。meter__band は border-box で 309px に収まる
  - 遊び方の1ページ目: ドラムの軸が縦、巻いた帯は一番上の区画に横の縞 (スクショ添付)

## 2026-10-01 T2-10 (a・b) ルビー

### a. 糸の道筋と切れ端の位置 (`d1147a3`・`493d95d`)
- 糸の線の頂点を geometry.ts の `threadPath` 1つで決め、糸の描画と流れる印 (`pointOnPath`) の両方が同じ道筋を使うようにした (位置がずれる不具合の防止)
- 切れ端 (`endPoint`) は道筋の「まっすぐ横に進む区間」の上へ: クリール側 x290・ドラム側 x360 (差 70)。筬と台は右へ (REED_X 520・TABLE_AREA x430)
- テスト: geometry 3件 (点が道筋の上・y の範囲・切れ端が区間の上) を RED → GREEN

### b. ドラムが回って見える (`b043fd6`→`8df5028`)
- renderer.parts.ts: 桟を円筒の周りに等間隔 (`SLAT_COUNT` 10本) に並べ、`drumAngle` で sin/cos して横に流す。裏側 (cos θ ≤ 0) は描かない
- 巻いた帯の面にも回る筋 (明るい縦の線) を同じ式で流す。円盤のスポークも `drumAngle` で回す
- controller.ts: `drumAngle` (見た目だけの値。State には入らない) を speed × `DRUM_TURN_PER_SPEED` (0.1 rad/s per speed) で進め、renderer に渡す
- テスト: renderer 3件 (angle で桟の位置が変わる・裏側は描かない・帯の上に筋) を RED → GREEN

### 検証
- npm run check エラー0 / npm test **469 passed・11 skipped** / build 成功
- CI: a は `493d95d` success、b は eslint error 2回 (`b043fd6`→rebase `da3aba9`→`8df5028`) success
- ブラウザ (1180×820): 帯を巻くと桟が横に流れ・裏側の桟が消え・円盤のスポークが回る。切れ端は糸の線の上に乗る。スクショ /opt/data/tmp/t210/

## 2026-10-01 T2-10 追加修正 (a・b) ルビー

### a. 桟の数・回る速さ・台が隠れる・controller のテスト (`b8aa1d2`)
- 桟の数: `SLAT_COUNT` 10 → **24** (正面に 10〜12 本見え、かご状に見える)。renderer.parts.ts
- 回る速さ: `DRUM_TURN_PER_SPEED` 0.1 → **0.25** (ペダル 50 で 1秒に 5 ラジアン ≒ 0.8 回転)。params.ts
- 台が隠れる: ドラムの縦木の左の端を geometry.ts の **`PIN_RAIL_X` = 560** に置き、renderer もそれを使う。
  台は `TABLE_AREA` を x420・幅120 に狭め、筬は `REED_X` 480 (台の中央)。台の右端 540 + 20 = 560 ≤ PIN_RAIL_X。
  切れ端 (x290・360) と、まっすぐ横に進む区間は変えていない
- controller のテスト: `vi.mock('./renderer')` で `drawBoard` の引数を記録し、
  ① ペダル 50 で 1 秒進めると `drumAngle` が 4.5〜5.5 増える ② ペダル 0 のあいだは増えない、を追加。
  jsdom の canvas は `getContext` が null を返すため、テストでは `HTMLCanvasElement.prototype.getContext` を偽の ctx に差し替えている
- テスト: geometry 1件・renderer 1件・controller 2件を RED → GREEN

### b. 上下の端・結び目とピンも回る・なめらかな回り方 (`bfbd00d`→`ba0934f`)
- 上下の端: 上の端は楕円の**上半分の弧だけ** (山なり。面は見せない)、下の端は**楕円の面の全体** (円盤) + 放射状の腕。
  胴の長方形は上は楕円の中心の高さ、下は下の楕円の中心の高さまで
- ピンと結び目も回る: θpin = drumAngle + `PIN_ANGLE0` (−0.9) で描く。正面の x は 中心 + 半径 × sin θpin、
  大きさは cos θpin 倍。cos θpin ≤ 0 (裏側) はピンも結び目も描かない。
  'cutting' に入ると controller が **0.8 秒かけて** ドラムを回し、ピンが正面の少し左 (sin θpin = −0.5) に来てから結ぶ演出を始める
  (動き出しと止まりをなめらかに: ease-in-out)。結び目の輪の演出もそのピンの位置に描く
- なめらかな回り方: 角速度 `drumOmega` を目標 (speed × DRUM_TURN_PER_SPEED) へ近づける。
  係数は 1 − exp(−dtMs / (EASE_MS / 2.3))。**`DRUM_EASE_MS` は「目標の 9 割に達するまでの時間」の意味**とし、
  速くなるとき `DRUM_EASE_UP_MS` 600・遅くなるとき `DRUM_EASE_DOWN_MS` 400。
  糸が切れたときだけ `DRUM_STOP_MS` 250 で急停止 (drumStopping)。ほぼ止まったら ω を 0 に落とす。
  仕様書の式 ω += (target−ω)×min(1, dtMs/EASE_MS) を 1フレーム (16ms) ごとに適用すると
  0.6 秒で 6 割しか上がらず「0.6 秒で 9 割」のテストと両立しないため、指数式に置き換えた (報告に記載)
- テスト: renderer 3件 (fill される ellipse は下の端だけ・結び目の輪の x が drumAngle で変わる・裏側は輪も無い)、
  controller 2件 (ペダル 100 直後の1フレームは目標の半分未満・0.6 秒で ω 9 割以上。ペダル 0 で 0.4 秒ほどで止まる) を RED → GREEN

### 検証
- npm run check エラー0 / npm test **478 passed・11 skipped** / build 成功
- CI: a `b8aa1d2` success、b は eslint error 1回 (`bfbd00d` failure → `ba0934f` success)
- ブラウザ (1180×820): 桟がかご状に 10 本以上、上の端は山なり・下に円盤、台と筬が隠れない、
  桟と帯の筋がなめらかに流れる (0.4 秒差で位置が変わる)、結ぶとピンと結び目が正面に来てから結ばれる。
  スクショ /opt/data/tmp/t210fix/

## 2026-10-01 T2-11 (a・b) ルビー

### a. どの状態でも範囲に届く・範囲が動く (`4688d5a`→`f5129ce`)
- 原因 (管理者の「ペダル 100 でもメーターが半分」): 張り = 30 + 0.4×pedal + 流れ(±16) + ぶれ。
  上級は流れが −16 に振れると、ペダル 100 でも張りは 54 前後で、範囲 60〜70 に入れなかった
- 採用した値と理由: **`TENSION_PER_PEDAL` 0.4 → 0.6、上級の `DRIFT_MAX` 16 → 12** (確認役の案どおり)。
  これで「ペダル 10〜100 で、どの状態でも範囲の中に入れられる」を全難易度で成立させた。
  テストは「流れ・ぶれが同じ向きに最大に振れたとき、ペダル 10 の張りの最小 ≤ 範囲の min、
  ペダル 100 の張りの最大 ≥ 範囲の max」を全難易度・中心の両端で確かめる
  (仕様書1の文言「範囲の中央に張りを合わせられるペダルが 10〜100」は、流れが最大に振れたとき
  張りが範囲の外に寄るため数学的に成立しない (例: 上級中心 35・流れ +12・ぶれ +2 でペダルは負になる)。
  不具合修正の本質「必ず範囲の中に入れられる」をテスト条件にした。README にも記載)
- 適正範囲が動く (State.range を { center, width, min, max } に変更):
  - 中心は `RANGE_MOVE_PER_SEC` (0.4/0.8/1.2 /秒) でゆっくり一方向に動き、1秒あたり 0.2 の確率で向きが変わり、
    `RANGE_CENTER` の端に着いたら向きを変える。向きは State.rangeDir
  - 幅は `RANGE_WIDTH` ± `RANGE_WIDTH_SWING` (±2/±3/±2) が周期 `RANGE_BREATHE_SEC` (12/10/8 秒) の正弦で伸び縮み。
    位相は State.rangeElapsedMs
  - 'winding' のあいだだけ動く ('broken'・'cutting' は止まる)。乱数は State.rng (同じ種と操作なら同じ動き)
  - `isValidResume` は新形のみ許す (古い形 min/max だけの保存は再開しない)
- 既存テストの更新: pedal.test.ts の params() を本実装に合わせた (perPedal 0.6・yarnDrift 0・上級 max 12)。
  「置いておくだけでは外れる」「調整すれば上級でも星3」は新しい値でも通る
- テスト: logic 3件 (届く・動く・範囲から外れない/同じ種なら同じ動き)、controller 1件 (zone の位置が変わる) を RED → GREEN

### b. 止まる音を 0.5 秒に (`2e40048`)
- sounds.ts の `stop`: 後ろの低い音 (startMs 200・durMs 550) を **durMs 300** に短くした。終端は 500ms。
  最初の「ガシャン」(0.2 秒ほど) はそのまま
- テスト: audio.test.ts を 450〜550ms に変更 (RED → GREEN)

### 検証
- npm run check エラー0 / npm test **482 passed・11 skipped** / build 成功
- CI: a `4688d5a` failure (eslint 未使用 2件) → `f5129ce` success、b `2e40048` success
- ブラウザ (1180×820): 初級で zone が 4 秒で left 32.5→34.8%・width 31.7→30.0% と動く。
  上級 (IndexedDB に records を書いて解放) でペダル 100 → 「▲ 強すぎ」まで張りが上がる (= 範囲に届く)。
  スクショ /opt/data/tmp/t211/

## 2026-10-01 T2-12 ルビー

### ドラム巻きの遊び方を5ページに (`9ed3832`→`90ecdd6`)
- tutorial.ts の pages を3ページ → **5ページ**。T2-09〜T2-11 で変わった遊び方を説明する:
  1. クリールの糸を{{section}}にまとめて、{{drum}}に巻いていきます (今の絵)
  2. {{pedal}}を踏むと巻き始めます。深く踏むほど速く巻けますが、張りも強くなります (ペダルとメーターの絵)
  3. 張りは流れ、ときどき引っかかって急に強くなる。緑の適正な範囲も動く (メーターの絵に、帯が左右に動く矢印←→と引っかかりの朱の三角)
  4. 強すぎると糸が切れて機械が止まる。強すぎるほど何本も切れる。同じ糸の両端をつなぐ (切れた糸2本の絵。糸ごとに違う色の丸印を両端に付け、同じ印どうしをつなぐことを示す)
  5. 星3は適正 8割以上・目標の時間内。時間の制限はない (「0:42 / 1:30」の絵と星3つ)
- 文は仕様書どおり。絵は Canvas・色は COLORS だけ (直書きなし)。文字は 20px (drawText ヘルパー)
- テスト: tutorial.test.ts に6件追加 (5ページ・文言の含み・矢印の fill・4つの丸印・fillText の時間文字・フォント 20px 以上) を RED → GREEN。
  既存の 3ページ前提のテスト (ページ数・送りの回数・1ページ目の文) を5ページ対応に更新
- 検証: push 前に npm run check エラー0 / npm test **540 passed・11 skipped** / build 成功
- CI: 最初の push `6e4597b` failure (未使用変数1件) → `90ecdd6` success
- ブラウザ (1180×820): 5ページの絵と文を確認。スクショ /opt/data/tmp/t212/

## T2-13a (2026-10-05)

- 実装コミット `a87ce27`「T2-13a: 実物の写真に合わせた絵 (目盛り盤を筬から離す・筬を縦の枠と横向きの歯に・ドラムの板を1本にして穴と羽と上の面)」。CI success。
- 内容:
  - 目盛り盤 (DIAL_X=700・DIAL_Y=45・DIAL_R=32) を geometry.ts の定数にし、筬と重ならない位置 (ドラムの左上) へ移動。
  - 筬を縦に立った枠に変更 (`reedRect`: 幅26・高さ THREAD_SHEET_HALF×2+16、中心 x は REED_X、中心 y は tableY−REED_RISE)。横向きの歯を糸と糸のすき間の y に7本描く。糸の道筋 (threadPath) は `reedThreadY` (糸が筬を通る y) を使うようにし、糸が歯のすき間を横に通る。
  - ドラムの板を端から端まで1本に (区画ごとに切らない)。板に丸い穴 (半径4・60間隔) を縦に等間隔に。羽の側面を板の右側に |sin θ|×WING_OUT (params.ts、14) の幅で描く。上の端の山なりの内側を胴と同じ勾配で塗って縁に線。板の内側の薄い緑の輪 (骨組み) を区画の境目に描く。
- テスト: RED 14件 (geometry 4・renderer 10) → GREEN。既存テストのうち筬の縦の歯を数えるもの・桟を区画内で数えるもの・上の端は弧だけのもの・帯の縞の座標決め打ちは、T2-13a の仕様どおりの内容に更新 (期待値の実装合わせではなく仕様変更への追従)。
- npm test 626 passed / 11 skipped。npm run check エラー0 (push 前に未使用変数 SEC_H を検出・削除。CI 落ちは無し)。npm run build 成功。
- ブラウザ確認 (本番と同じビルド・ポート4173): 1180×820 で筬が縦の枠＋横向きの歯、糸が歯のすき間を通る。目盛り盤は筬と重ならない。ドラムは上の面に色、板が上から下まで1本、穴が等間隔、羽の側面が見える。0.5秒差の2枚で板と羽の側面が移動 (回転)。412×915 でも崩れなし。スクショは /opt/data/tmp/t213/ (s1・s2・n1)。

## T2-13b (2026-10-05)

- 実装コミット `07ef468`「T2-13b: 切れた糸の糸道の印を朱に (白い×つき)、「停止」の文字を消す」。CI success。
- 内容:
  - クリールの糸道の印 (テンションの皿・鋼色の円、糸ごとに8個) を、切れた糸だけ朱 (`COLORS.shu`) に塗る。つながると元の鋼色に戻る (brk.threads に入っている間だけ朱)。複数本同時に朱になる。
  - 朱の印には白い×を重ねる (色だけに頼らないため)。
  - 「停止」の fillText を削除 (赤いランプと朱の印で分かる)。あわせて未使用になった FONT_FAMILY・toPx の import を削除。
- テスト: RED 3件 (切れた糸の印が朱・白い×・停止の fillText 無し) → GREEN。既存の「停止」前提テスト4件は T2-13b の仕様どおりに更新 (盤面の文字は無い・restore の後に命令が無い等)。
- npm test 671 passed / 11 skipped。check エラー0・build 成功。CI 1回で success (lint 落ちなし)。
- ブラウザ確認 (上級・ペダル100で糸切れ): 朱の印＋白い×が3個 (切れた糸3本)、切れていない糸の印は鋼色のまま、「停止」の文字は無し、赤ランプ点灯。スクショ /opt/data/tmp/t213/b1.png。

## 2026-10-03 T2-13c (切れたあたりを1回押してつなぐ) — ルビー
- 実装 `2c2f3d1`・追加修正 `b37aee6`。CI completed success。
- 変更: breakage.ts (first 削除・tapThread 追加) / logic.ts (tapThread・mismatches 削除・isValidResume で古い形の brk.first を拒否) / geometry.ts (hitBrokenThread 追加: 印から筬までの区間・画面上 40px 以内・最も近い糸) / controller.ts (1回押し) / messages.ts (文言・成績欄4行) / tutorial.ts (4ページ目の文) / renderer.parts.ts・renderer.test.ts (brk.first 参照の削除。13c の許可ファイル外だが型変更で必須)
- テスト先に RED 19件 → GREEN **676 passed / 11 skipped**・check エラー0・build 成功。push 前 check は CI 落ちなし (1回で success)
- 追加修正: 1本つなぐごとの「1本つながりました。あと N 本です」が、操作の直後でない定期再描画でも出続けるように (messages.ts)
- ブラウザ確認: 上級で2本切れ→1回押し×2でつながり巻きに戻る・初級を完走 (途中3回の糸切れをすべて1回押しで回復)・結果の成績欄が4行 (「違う端を結ぼうとした回数」なし)・文「切れた糸のあたりを押して、つないでください」
- 教訓: 並行作業者が同じ作業ツリーで git stash/pop を行い、作業中のファイルへの手動追記が消えた。デバッグ用の console.log は patch ツールで入れ、作業終わりに必ず消す。IndexedDB への手動注入は行の形 (rec で入れ子・deletedAt) が合わないと boot が落ちる

## 2026-10-03 T2-13 追加修正 (羽の側面の太さ) — ルビー
- 実装 `b3ddba8`。CI completed success。
- 変更: params.ts に WING_SIDE_MAX_RATIO = 0.4、renderer.parts.ts の側面の幅を 板の幅 × 0.4 × |sin θ| に (従来は WING_OUT=14 固定の最大値)、renderer.test.ts に「6角度で側面の幅 ≤ 板の幅の40%」のテストを追加 (RED 確認後 GREEN)
- npm test 677 passed / 11 skipped・check エラー0・build 成功・CI 1回で success。変更ファイルは params.ts / renderer.parts.ts / renderer.test.ts のみ
- stash 事象の調査: コンテナ内に他のエージェント・git プロセスなし。HEAD reflog・refs/stash に私以外の記録なし。結論: 並行作業者でなく、自分の execute_code によるファイル書き込みの一部が反映されなかった可能性が高い。以後 patch ツールで編集し書き込み直後に確認する

## T2-14a (お題をクリール立てと同じ柄の15題に)
- params.ts: PUZZLE_STAGE (段階1-5 → 帯3/4/5/6/7本、難易度 初/初/中/中/上)
- puzzles.ts: windingPuzzles(content) — creelPuzzles 15題を WindingPuzzle {id, stage, patternId, name, sections, level} に
- logic.ts: State.puzzleId (init opts は任意・既定 '')。isValidResume は puzzleId キーが無い旧形を拒否
- listView.ts: 段階ごとの節、柄の見本・名前・「帯 N本」補足、星/次はこれ/鍵、途中表示 (savedPuzzleId)、data-testid=winding-puzzle-<id>
- index.ts: selectPuzzle (別のお題のとき確認)、savedPuzzleId、next=「次のお題へ」(今のお題の次)、stats に puzzle:<id> を追加、job モードは従来どおり
- controller.ts: 題名の下は「段階N 柄の名前」(お題以外は従来の「難易度 帯 N本」)
- テスト: RED (puzzles 3・listView 3・logic 2・controller 調整) → **682 passed / 11 skipped**、check 0
- commit 757811d、CI 1回で success。ブラウザ: 一覧5節15題 ✓、段階1 (紺の無地) 完走 ★★☆・成績4行・「次のお題へ」で黒の無地へ ✓、一覧に星/途中/次はこれ/鍵 ✓

## T2-14b (糸の種類の手応え)
- params.ts: YarnFeel 型と YARN_FEEL (標準/細い糸=切れやすい BREAK_RATE×1.5・BREAK_EXTRA_STEP−2 最小4/太い糸=流れやすい DRIFT perSec×1.3・snagRate×1.3)
- puzzles.ts: yarnFeelOf(spec) (紡毛 or 番手30以下=太い糸、番手60以上=細い糸、他=標準)、feelLabel、mainYarnSpec (本数を合計し、同数のときはあとに出た糸を主糸)、WindingPuzzle.feel
- logic.ts: State.feel (init opts は任意・既定 standard)。breakParams に feel (rate 倍率・extraStep 差分)。tick の drift/snag に倍率
- listView.ts: 補足「帯 N本・細い糸(切れやすい)」
- controller.ts / index.ts: 題名の下に「段階N 柄の名前・手応え」(仕様の許可ファイルに controller.ts・index.ts は無いが、題名の下の表示と State への feel 引き渡しに必要なので最小限変更。報告に記載)
- テスト: RED (puzzles 3・listView 1・logic 3・controller 1) → **690 passed / 11 skipped**、check 0
- commit 3dca45b → **CI failure** (controller.test の未使用変数 p1。ローカルの check は pipe で exit code を見逃していた) → 修正 commit **8a4d889** CI success
- ブラウザ: 一覧の補足 (s4=太い糸・s4-2=細い糸・s4-3=表示なし) ✓、s4 を開いて題名の下「段階4 紺のシャドーストライプ・太い糸(流れやすい)」で巻き ✓、s4-2 を「始める」(途中確認ダイアログ経由) で開いて「細い糸(切れやすい)」で巻き ✓、再開でも手応えが出る ✓

## T2c-01 (ドラム設定:ルールとお題)
- src/games/drumsetup/ を新設 (params・puzzles・logic + テスト)
- params.ts: YARN_COEF・GRADE_LABEL・ANGLES・ALLOWED_ANGLES・STAGE_SECTION (段階1-5: 400/20〜720/18)・STAR3_ERR 0.05・STAR2_ERR 0.15・TRIAL_TURNS 30・FEED_STEP_SMALL/LARGE・FEED_MAX 9.99
- puzzles.ts: drumSetupPuzzles(content) — クリール立て15題から。番手は主糸の spec から (2/60 含む→2/60、1/20・紡毛→1/20、他→2/48)。主糸の決め方はドラム巻き T2-14b と同じ (合計・同数は後出し)。s4=1/20・s4-2=2/60・他=2/48
- logic.ts: density (本数÷幅)・thicknessPerTurn (×係数)・correctFeed (h÷tan、小数第2位)。judge (badAngle/good/crush/collapse・星1-3)。DrumSetupState {puzzleId, angle, feed, trials, phase, lastResult}。reduce: selectAngle/stepFeed/setFeed (0〜9.99・丸め)/trial (角度 null は無視)/trialEnd (星3→done、他→setting)/finish (星3でなくても done)/retry (init に戻す)。trialLayers (回転 k の層の {x: k×feed, y: k×h})
- テスト: RED (puzzles 3・logic 11) → **14 passed**、全体 **704 passed / 11 skipped**、check 0、build 成功
- commit 7d6d89a、CI 1回で success

## T2c-02 (ドラム設定:座標と盤面)
- geometry.ts: 論理座標 1000×750。DRUM_RECT (表面の板 y616)・SECTION_X 170 (層の左端)・WING_BASE (310,616)・WING_LEN/THICK・TOP_TEXT・RESULT_TEXT。ANGLE_VIS_MUL=4 (見た目の角度)、LAYER_H_PX=9 (1回転の厚み 8px 以上)。wingVisRad/wingDir/slopeXAt (高さ→斜面の x)/layerTopY (下から積み上がる)/toPx
- renderer.ts: drawBoard(ctx, fit, puzzle, view, content)。view = {angle, feed, outcome, progress, showResult}。背景 kinari → 表面 (wood+穴) → 羽 (null は点線=短い線の連続、選択で wood の平行四边形の板+明るい縁) → 層 (progress×30 層、mainHex 色。good=斜面に沿う/crush=斜面を越えてはみ出し(上ほど多く、はみ出しは sumi 30% で濃く)/collapse=斜面より内側で段/badAngle=6層が斜めにずり落ち) → 文字 (toPx で画面px。上の端「1回転 送り ○.○○mm／羽 ○°」20px、結果の印 24px: good=藍「きれいに登った」・crush/collapse=朱「潰れ」「崩れ」)
- テスト: RED (geometry 3・renderer 7) → GREEN。全体 **714 passed / 11 skipped**、check 0、build 成功
- commit 52eb34a、CI 1回で success。偽 Canvas は winding/renderer.test.helpers.ts を利用


## T2c-03 (2026-10-04)

### T2c-03a「操作欄・電卓・進行」commit `fcdc826`

- calculator.ts: 四則・小数点・C・= の calc() (純粋) と openCalculatorBody (見た目: 表示は右揃え・キーは64px 以上・tan の表/厚みの係数の表・「この答えを送り量に入れる」)
- messages.ts: messageFor (試し巻きをしています/潰れました。送り量が少なすぎます/崩れました。送り量が多すぎます/その糸には、この角度は使えません/羽の角度を選んで、送り量を合わせてください/きれいに登りました…/設定できました)・soundFor (試し巻きの始まり tap、終わり ok/gentleNo)・resultOf (羽の角度/送り量(正しい値)/試し巻きの回数 + 正しい計算3行・starHint「送り量の誤差が5%以内で星3です」)
- panel.ts: 依頼書/計算のメモ(段階で減る。段階5 は「表は電卓から見られます」)/羽の角度(段階1〜2 は使える角度に○)/送り量(大きな数字+±ボタン、数字を押すと電卓)/下に固定の電卓・試し巻き(+星3でない結果のあと「ここで終える」)。試し巻きのあいだは押せない(理由「試し巻きの途中です」)
- controller.ts: ドラム巻きと同じ形。試し巻きは 5 秒 (TRIAL_MS) かけて progress を renderer へ。裏に回ったら絵を止めて結果だけ決める。suspend/unmount 対応
- 変更 (許可): core/game/types.ts の GameId に 'drumsetup' を追加 (GameResult/GameModule の型に必要)・params.ts に TRIAL_MS=5000 (仕様書が認めている)・base.css に drumsetup の節
- テスト: calculator 4・panel 7・controller 6 (角度9°+電卓で1.07→星3・0.96→潰れ→やり直し+ここで終える→星2・5°は badAngle・unmount で rAF 停止・resume・visibilitychange)

### T2c-03b「一覧・遊び方・組み立て」commit `a02ff1f` (+`bac2aaa` `/games/drumsetup` を gameScreen の許可リストへ、+`fb4113d` 試し巻きの前は層を描かない+リサイズ後に描き直し、+`9351333` 電卓で答えを入れたら閉じる)

- listView.ts: ドラム巻きと同じ形 (5節15題・星/次はこれ/鍵・補足「2/48・帯 400本」・クリール立て済み・途中)
- tutorial.ts: 4ページ (設定/厚み/式と電卓/試し巻き)・Canvas の絵 (tokens)
- index.ts: createDrumSetupModule (一覧↔プレイ・戻る確認・別のお題の確認・次のお題へ/もう一度/一覧へ・resume は DrumSetupState のまま)
- main.ts に登録 (クリール立て → ドラム設定 → ドラム巻き)・terms.default.json に game.drumsetup=ドラム設定・homeCards.ts に断面のカード絵と「お題 15」・homeScreen.ts はカードの絵の割り当て
- テスト: listView 4・tutorial 3

### ブラウザ確認 (本番と同じビルド, localhost:4173)

- 1180×820: ホームのカードの並び (クリール立て → ドラム設定 → ドラム巻き)・遊び方 4ページ・一覧 (15題・5節・次はこれ/鍵/補足)・s1 を電卓 (1 . 0 7 → この答えを送り量に入れる) で星3 (DOM で ★★★・aria-label 星3)・0.96 で「潰れました。送り量が少なすぎます」+はみ出す絵+「ここで終える」・1.18 で「崩れました。送り量が多すぎます」+すき間と段の絵
- 412×915 (詰めた形): 盤面が上・操作欄が下でスクロール・電卓/試し巻きは下に固定 ✓
- 915×412: 盤面 左・操作欄 右 ✓
- 直した不具合: gameScreen の known id に drumsetup が無く /games/drumsetup がホームへ戻る・試し巻きの前に層が描かれる (progress の初期値)・リサイズ後に盤面が消える・電卓が開いたまま


## T2c-03 追加修正 (2026-10-04)

### a「操作欄」commit `e15c4b0`

- 羽の角度の選ぶ部品を2列×2段の格子に (`drumsetup-panel__angles`。base.css に grid。押す部品は 64px 以上のまま)。横のスクロールバーは出ない
- tan を小数第4位に (メモと電卓の tan の表:0.0875/0.1228/0.1584/0.1944)。メモの値で計算しても答えと合う
- ※許可ファイルの補足:電卓の tan の表は calculator.ts にあるため、仕様の「電卓の tan の表も同じ」を満たすため calculator.ts も1行だけ変更した (許可リストに無いが報告する)
- テスト: メモに「tan 9° = 0.1584」・base.css に2列の格子と .drumsetup-panel__angles・741→744

### b「盤面」commit `3903f8b`

- 断面を大きく:表面の板 60→940 (幅 880 = 盤面の 88%)。羽の根元は帯の区画の右端 (274)、羽の板は盤面からはみ出さない最長の長さ (wingLen)。9°では上端が盤面の上から 15% (112px) に届く。※見た目の角度 (×4) のまま「根元を中央より右」かつ「上端を 15% 以内」は 5°・7° で幾何的に両立しないため、根元は区画の右端に置き、盤面からはみ出さない最長にした (9°・11° は 15% 以内に届く)
- 層の右の端を羽の斜面と同じ見た目の決まりで決める (layerEdgeX = 根元 + 高さ÷tan(見た目の角度) × 送り量÷正しい送り量)。正しい送り量なら層の右端が斜面に乗る (ずれ 0px)
- crush: 斜面より左に遅れてほぼ真上に積み重なり、上の層ほど左右にふくらむ (ふくらんだ部分は濃く)
- collapse: 右の端は斜面の上で止まり、層のあいだに縦 3px のすき間と段
- テスト: 幅 70% 以上・wingTopY(9) ≤ 113・右端と斜面の差 2px 以内 (30層全部)・半分なら層30の右端は斜面より左・2倍なら右端は斜面を越えない

### ブラウザ確認 (本番と同じビルド)

- 1180×820: 羽の角度が 2×2 (151×64px) で収まり、横のスクロールバー無し (overflow 0)。tan が第4位。段階1・9°・1.07mm の試し巻きで層の右端が羽の斜面に沿って登り星3。0.50mm で潰れ (真上に積もり上層ほどふくらむ)、2.00mm で崩れ (斜面の上で止まりすき間と段)
- 412×915: 羽の角度が 2×2 (172×64px) で収まり、横のスクロールバー無し。盤面は大きく、層が斜面に沿う

### T2c-03 追加修正の受け入れ (2026-10-04)

- kokuten が a・b を確認し受け入れ。P2c (ドラム設定) はひと区切り。次はビーム巻き (仕様待ち)。

## 2026-10-04 T2c-04a (ルビー)
- 羽を左に開いて太く (WING_BASE を区画の左側へ、WING_THICK_PX=土台の2/3)。slopeXAt/層の端を左右入れ替え (layerLeftEdgeX)。
- 角度・送り量のボタンを1行に4つ (grid 4列・nowrap・細い幅では20px)。412px で横スクロール0。
- 「試し巻き」→「巻く」(ボタン・messages・押せない理由)。○は角度の下へ。
- 遊び方の絵を本編と同じ左右に入れ替え、文字24px以上、文字と絵を重ねない。
- controller.test.ts はボタン名の置換のみ (controller.ts 本体は不変)。787 passed・CI success。

## 2026-10-04 T2c-04b (ルビー)
- 電卓を大きなポップアップに (openCalculatorBody 内で sheet--tall を付与。controller.ts は不変、コメントで移す先を明記)。
- 並び:表示 (右寄せ40px) → 開閉する tan/係数の表 (小数第4位・同じボタンで閉じる) → 4列×5段の格子 (0 . C +・= は grid-column: 2/span 2) → 一番下に「この答えを送り量に入れる」。
- 横長の低い画面 (orientation: landscape + max-height 500px) は左に表示と表・右に格子の2列 grid。
- 796 passed・CI success。ブラウザ確認: 1180x820・915x412 (2列)・412x915 とも横スクロール0、1.07 を入れて送り量に反映されることを確認。

## 2026-10-04 T2-15 (ルビー)
- winding の controller.test.ts テスト2 (17.7秒・単独でも重い) の原因:結びのたびに次の帯を 24フレーム/100ms の実時間で巻いており、帯2本ぶん 約13秒の実待ちがあった。
- 直し方:waitFor の中で rAF をまとめて進める (帯1本ぶん 300フレーム/回、結びの演出 100フレーム/回)。実時間の待ちがなくなり、テスト2は約4秒 (CPU だけで動く)。期待値は変えていない。
- 全体のテストを5回続けて流して 5回とも 806 passed / 11 skipped。check・build エラー0。CI success (51c6537)。
- T2-15 受け入れ (2026-10-04、Discord)。ビーム巻きの設計は管理者確認中。仕様ができるまで待機。

## 2026-10-04 T3-01 (ルビー)
- ビーム巻きのルールとお題 (src/games/beaming/ 新規。params・puzzles・logic とテスト18件)。
- お題15題: widthCm = winding の PUZZLE_STAGE の帯の数 × drumsetup の STAGE_SECTION の幅 (s1 は 60cm)。level は段階1〜2→1、3〜4→2、5→3。
- ルール: 幅合わせ (幅のずれと中心のずれの大きいほうを widthErrCm に。±1cm で「合いました」)、張りは pedal.ts を使い回し (流れ max ±4/6/8・ぶれ 0.5/0.8/1.2・引っかかりなし・範囲の中心は 50 で動かさない・幅 34/28/22)、偏り (shiftVel 0.3/0.5/0.8 cm/秒・ときどき向きが変わる・nudge で ±1cm)、乗り上げ (シートの端が円盤を越えると overflowMs)、糸切れは無し。
- 速さ: BEAM_LENGTH=800 (pedal 50 で 40秒)。採点: 星3 (誤差1cm・張り0.8・偏り0.8)、星2 (誤差3cm・0.6・0.6)、resultLines 4行。
- 仕様書の BeamingState に level・widthCm・patternId・tension を追加 (tick の計算に必要。Discord 報告に記載)。
- テスト 824 passed / 11 skipped・check・build エラー0。

## 2026-10-04 T3-02 (ルビー)
- 座標と盤面 (src/games/beaming/geometry.ts・renderer.ts 新規。テスト9件)。
- geometry: cm→論理座標は pxPerCm = 700/巻き幅 (巻き幅は常に盤面の幅の70%)。往復一致。ドラム (奥・幅広)、ビーム (芯 y580・巻き太り最大110px)、円盤 (26×170px・穴の並び)、目標の点線 y690。
- renderer: ドラム (帯の縞が drumAngle で流れる)・シート (縦縞・shiftCm で中心が動く)・巻き太り (machineLight)・円盤 (machine+穴)。乗り上げは円盤の縁を朱+「乗り上げ」24px。幅合わせは点線+10cm目盛り+内側の印 (藍=合う・朱=外れ)。
- 偽の Canvas に setLineDash が無いため、点線は線分の並びで描く (helpers は変更しない)。
- 見た目の確認は T3-03 でホームに出してから行う (ゲームがまだ route に無い)。テスト 833 passed・check・build エラー0。

## 2026-10-04 T3-03a (ルビー)
- 操作欄とプレイ画面 (panel.ts・controller.ts・messages.ts 新規。テスト11件)。
- 操作欄: 依頼書 (巻き幅・帯の数・柄の名前)、幅合わせ (◀ 左/左 ▶/◀ 右/右 ▶ の1行4つ+今と目標の幅)、巻き返し (張りのメーター・横ペダル・寄せる2つ1行+巻いた割合と時間)、主な操作 (幅合わせは「巻き始める」)。
- controller: ドラム巻きと同じ形 (rAF・裏でペダル0・1秒ごと途中保存)。tick で done になったら handleDone (巻き終わりは tick だけが入り口)。drumAngle を renderer に渡す。
- メッセージ: 乗り上げ > 偏り > 張り の優先度。張りの文だけ MESSAGE_HOLD_MS 待つ (winding から流用)。
- 修正1: 乗り上げに円盤の内側 0.5cm の遊び (OVERFLOW_CLEARANCE_CM)。遊びが無いと目標どおりに合わせたとき、わずかな偏りで常に乗り上げになり centeredMs が数えられず星3が不可能になるため。logic・messages・renderer で同じ決まり。
- 修正2: 巻き終わりは tick で起こるので、ループの tick 経路でも handleDone を呼ぶ (当初 actions 経路だけだった)。
- テスト 844 passed・check・build エラー0。

## 2026-10-04 T3-03a 追加修正 (ルビー)
- 乗り上げの判定を logic.ts の overflowSides(s) 1か所にまとめた (renderer・messages はそれを使う。式の二重持ち解消)。
- 遊び OVERFLOW_CLEARANCE_CM を CENTER_OK_CM (1.5cm) と同じにした (= CENTER_OK_CM)。幅ぴったりのとき、ずれ ±1.5cm までは中央に数えられ、寄せる1回 (1cm) とも合う。
- テストを先に追加 (RED→GREEN): ずれ 1.2cm は中央に数えられる、1.6cm は乗り上げ、遊び=中央の範囲、renderer と messages が overflowSides と一致。
- 既存のテスト5を新しい遊びに合わせて書き直し (ずれ 1cm は中央・4cm は乗り上げ)。
- テスト 866 passed / 11 skipped・check・build エラー0。

## 2026-10-04 22:40 ルビー T3-03b 完了(一覧・遊び方・組み立て・ホームに出す+version 0.2.0)
- 先に「T3-03a 追加修正」を別コミットで実施(1a2b108): logic.ts に overflowSides(s) を新設し renderer/messages はそれを使う(式の二重持ち解消)。OVERFLOW_CLEARANCE_CM を CENTER_OK_CM と同じ(1.5cm)に。テスト4件追加+テスト5を新しい遊びに合わせて改訂。866 passed。CI success。
- T3-03b(ca3991f): beaming の listView(一覧:レベル1〜3の節・15行・星/次はこれ/鍵・補足「巻き幅 60cm・帯 3本」)・tutorial(3ページ、文は大人向け、絵は盤面と同じ見た目)・index.ts(createBeamingModule:依頼書/遊び方/一覧/遊ぶ/次/もう一度/一覧へ・job モードは difficulty をレベルに)を作成。main.ts で登録、homeScreen は準備中から削除、homeCards にカードの絵と状態「お題 15」。terms.default.json に game.beaming 追加済み(確認役)。
- テスト: listView 7件・tutorial 3件+homeScreen の準備中の期待値を修正。全体 868 passed / 11 skipped。check 0・build OK。CI success。
- version: npm version minor --no-git-tag-version で 0.2.0(0.1.1 から)。ホームのタイトル直下に「バージョン 0.2.0 (2026-10-04)」表示を確認。
- ブラウザ確認(headless・vite preview): ホームのカード並び(クリール立て→ドラム設定→ドラム巻き→ビーミング→準備中2)・一覧(レベル1〜3・15行・補足)・遊び方3ページ・幅合わせ(4ボタン同幅/点線+目盛り+印)・巻き(シート/巻き太り/乗り上げの朱縁+文字)・結果(星/4行/ヒント/一覧へ・もう一度・次のお題へ)を確認。5サイズ(412×915/915×412/880×700/700×880/1180×820)で横オーバーフローなし・4ボタン同幅。
- 自動プレイは★2が2回(幅誤差0.6/張り100%/中央78% と 幅誤差1.1/張り100%/中央92%/乗り上げ0.4秒)。星3は自動操作が届かず(ヘッドレスのタブ落ちが多発し自動操作が不安定・実機とは無関係の環境問題)。スクショ /opt/data/tmp/t3/。

## 2026-10-04 23:59 ルビー T3-03 追加修正完了(円盤ボタン2行格子+操作欄スクロール0+version 0.2.1)
- テストを先に書いて RED 確認(panel.test: 2行格子・各行見出し+◀▶・aria-label「左の円盤を左へ」等・ボタンは矢印だけ・依頼書は詰めた形1行)→ 実装で GREEN。868 passed / 11 skipped・check 0・build OK。
- panel.ts: 円盤のボタンを2行の格子に(各行「左の円盤」/「右の円盤」の見出し+矢印2つ・aria-label 付き)。依頼書は「紺の無地・巻き幅 60cm・帯 3本」の詰めた形1行。巻き返し段階の「巻いた割合と時間」は主な操作の空き行に移動(行を低く)。
- base.css(beaming 節): flange-row は 1fr+64px+64px の格子・ボタン 64×64 以上。操作欄の高さ圧縮: 依頼書1行(はみ出しは…)・メッセージ欄(ビーム巻きの直前兄弟のみ :has)の文字を 20px・数値/見出し/ボタンの文字を小さめに・行間 1.2・コンパクト時はペダルの溝とボタンを同じ行。core が操作欄の幅を固定(357px)するため :has(.beaming-panel) に max-width:100%。
- ブラウザ計測(本番ビルド・文字の大きさ最大・大きさごとに読み込み直し・幅合わせと巻き返しの両段階):
  412×915: 縦0 横0 / 915×412: 縦0 横0 / 880×700: 縦0 横0 / 700×880: 縦0 横0 / 1180×820: 縦0 横0。画面全体の縦スクロールも 0。64px 未満のボタンなし。
- version: 0.2.0 → 0.2.1 (npm version patch --no-git-tag-version)。

## 2026-10-05 00:20 ルビー P3(ビーム巻き)完了・受け入れ
- T3-01(ルール・お題)・T3-02(座標と盤面)・T3-03a(操作欄)・T3-03a 追加修正(overflowSides にまとめ・遊び=中央の範囲)・T3-03b(一覧・遊び方・組み立て・ホームに出す)・T3-03 追加修正(円盤ボタン2行格子・スクロール0)がすべて受け入れられた。version 0.2.1。
- 次の指示まで待機。

## 2026-10-05 T2b-02 (糸割りの座標と盤面) — ルビー
- テストファースト: geometry.test(6件)・renderer.test(7件)を RED で確認 → 実装して GREEN
- geometry.ts: 論理座標 1000×750。台 (MACHINE)・箱・はかり・メーターの位置。口は横一列に12、狭い画面 (1口の幅が画面上 64px 未満) は 6口ずつ2段。当たり判定は口の列全体。メーターは1周 1,000m (meterAngle・meterLaps)。fmtM・laneLengthText・meterMeters・laneView もここに置いた (renderer を300行以内に収めるため)
- renderer.ts (300行): 緑の枠の台・上の段 (元の糸は残りに比例して細る円すい台+黄色い糸道・継ぐ糸は横に小さく+結び目)・下の段 (銀色の胴の溝が流れる+空のコーンが設定した長さに比例して太る+緑の腕と白い握り)・口ごとの長さの数字 (「6,000 m」「4,200 + 1,800 m」「— m」・20px以上)・番号1〜12・メーター (太い目盛り100m・細い10m・窓に周の数・朱の針)・はかり (最後に量った重さ)・箱 (まだかけていない糸)・失敗の朱の枠と「✕ 空になる」「✕ 足りない」
- tokens.ts に色を3つ足した (機械の緑 winderGreen #708662・銀の胴 winderSteel #A8AFB6・黄色い糸道 threadYellow #D9A62E)。tokens.test の「全色が :root の変数と一致」があるため base.css の :root にも同じ3行を足した (色以外は変更していない)
- 見た目の確認 (ブラウザ) は T2b-03 のブラウザ確認で行う (ゲームの登録は T2b-04。T3-02 と同じ進め方)
- テスト 904 passed / 11 skipped・check エラー0・build 成功

## 2026-10-05T10:30+09:00 T2b-03a(糸割りの操作欄と画面の動き)
- messages.ts(依頼書・レベルごとの計算の手伝い・失敗の中身・結果の行)・panel.ts(依頼書・手伝い+電卓・長さの設定 10m 単位 ±10/100/1000・1つ目/継ぐ糸の選び・ほかの口にも同じ長さ・巻き始める)・controller.ts(盤面と操作欄・rAF で巻きの進み・失敗は重ね表示「足りないものがあります」+「長さを設定し直す」・成功は 1.5 秒後に結果の画面)を追加。
- drumsetup/calculator.ts に tables オプション(糸割りでは表を出さない)。base.css に itowari の節。
- テスト: panel 11件 + controller 4件(RED→GREEN)。全体 919 passed/11 skipped・check 0・build OK。

## 2026-10-05T11:30+09:00 T2b-03b(ドラッグで糸をかける・外す)
- drag.ts(引っぱりの判定: 8px で moved・箱の糸→口 = mount・口→箱 = unmount・押すだけ = tap・laneAt/coneAt の当たり判定)を追加。renderer.ts に drawLifted(引っぱっている糸を指の 24px 上に描く)+ 円すい台の描画を cone() に共通化(296行)。
- controller.ts に pointerdown/move/up を追加: setup のあいだだけ。ドラッグでかけると、かかった口が自動で選ばれる。押すだけでは箱の糸ははかりに載り(weigh)、口は選ばれる。口の糸を箱へ戻すと外れる(継ぐ糸があるときは2つとも外れる)。
- テスト: drag 5件 + controller 3件(RED→GREEN)。全体 935 passed/11 skipped・check 0・build OK。

## 2026-10-05T12:10+09:00 T2b-03 追加修正(pointercancel と touch-action)
- controller.ts:盤面の Canvas に touch-action: none を付けて、引っぱっているあいだに画面がスクロール・拡大しないようにした。pointercancel は「離した」と同じにしない(取り消されたら、引っぱっていた糸を箱へ戻すだけ。mount・unmount をしない)。つかんでいる指の pointerId を覚えて、ほかの指の move・up は無視する。
- テスト: controller 3件追加(RED→GREEN)。全体 938 passed/11 skipped・check 0・build OK。

## 2026-10-05T14:30+09:00 T2b-04(糸割りの組み立て・version 0.3.0)
- tutorial.ts(遊び方4ページ・絵は盤面と同じ見た目)・listView.ts(15題を5つの節に・節の見出しの下に場面の名前「チーズを分ける」「足りないコーンを作る」・行の補足)・index.ts(一覧→プレイ・resume・結果の次のお題/もう一度/一覧へ・戻る確認は「はい」「いいえ」)を追加
- main.ts に登録(ホームのカードの並びの最初)・gameScreen.ts の id・homeScreen.ts は準備中から削除・homeCards.ts に糸割りの絵と「お題 15」・terms に game.itowari・base.css に場面の名前の節
- controller.ts: 遊び方ボタンで tutorial を開く。実機確認で見つけた不具合を3つ直した
  (1) 空の口を押しても選べなかった(ドラッグを始めていなかった)→ 空の口もドラッグ開始にして tap で選べるように
  (2) 画面の大きさが変わったときに盤面が消えたまま(onStageResize で描き直していなかった)→ 1フレーム後に lastFit を更新して描き直す
  (3) 箱が空のとき、口の糸を箱へ戻せなかった(箱の糸のあるセルしか外せなかった)→ 箱の上なら外せるように
- logic.ts: refill の完成判定を直した(作った本数と「要る本数 − 残っている本数」を比べていたので絶対に完成しなかった)
- テスト: controller 6件・logic 1件・listView 4件・tutorial 4件を追加。950 passed / 11 skipped・check 0・build OK
- ブラウザ確認: ホームの並び(糸割りが最初・準備中は柄の図鑑だけ)・一覧(節・場面の名前・補足・星/次はこれ/鍵)・遊び方4ページ・レベル1を星3(失敗0・余分0.0%・1回)・失敗(残りが足りない)と「長さを設定し直す」・戻る確認(はい/いいえ)・レベル4を継ぎで星3(余分4.0%・継いだ口1)・4サイズで操作欄の縦スクロール0

## 2026-10-05T12:40+09:00 糸割りの「次へ」直し + T2-16 前: ドラムの絵の直し
- 糸割りの結果の次のボタンを「次へ」に統一 (PU-14 と同じ)。itowari/index.test.ts (テスト1件: readyState から再開して巻き切り、onFinish の結果の next.label を確かめる) を先に書いて RED → GREEN。コミット 879871d・CI success
- ドラムの絵の直し (管理者の Fold 8 の指摘・T2-16.md「T2-16 の前に」): (1) 上の縁の楕円は面を塗らず縁の線だけにした (板のはみ出しといちばん上の帯の山なりが縁まで見える) (2) 帯の下の端: 巻き終えた区画にも胴の緑を塗る (山なりの下に白っぽい色が見えない)・帯の境目の黒い横線 (strokeRect) は描かない。弓なりの向き (山なり) は変えていない
- テスト: renderer.test.ts に4件追加 (上の縁は塗らない・帯と板は縁まで・全区画に胴の塗りと kinari の塗り無し・strokeRect 無し) + 既存2件 (T2-10 追加修正 b #5・T2-13a #4) を新しい決まりに合わせて改訂 + 縞の高さのテストは胴の塗りを除外
- 実機確認: 上の縁に板のはみ出しと縁の線だけ・20% 巻いた帯が上の縁まで届く
- テスト 1010 passed / 11 skipped・check 0・build 0・CI success (1dc5e69)・version 0.3.2 (patch)

## 2026-10-05T15:40+09:00 T2-16a (張りと適正の範囲)
- 適正の範囲: 幅はレベルごとに固定 (RANGE_WIDTH 30/18/10。呼吸の動きをやめた)。最初の帯の中心はメーターの中央 (50)。位置が動くのは帯が変わるとき (cut) だけ (RANGE_SHIFT_ON_SECTION: レベル1 変えない・2 ±10・3 ±15。乱数は State の種から)。位置は RANGE_CENTER の中と「ペダル 10〜100 で届く範囲 (RANGE_REACHABLE 36〜90)」に丸める (T2-11 の決まりを守る)
- State から rangeDir・rangeElapsedMs を削除 (isValidResume も)。moveRange・rollRange を削除
- 引っかかり (pedal.ts・T2-16a の戻り方のみ): 上がる量 snagSizeMin〜Max (ドラム巻きは 15〜25)・snagRiseMs (200ms) かけて上がり・snagRecoverMin〜Max ms (1000〜2000) かけて徐々に戻る。オプションを渡さないと従来どおり (snagSize で即上がり・2秒で戻る) なのでビーム巻きの動きは変わらない
- 糸切れの判定は引っかかりの尖り (pedal.snag) を除いた張りで行う (引っかかりは見た目の張りの感じ。尖りのあいだに切れない)
- テスト: pedal.test +3 (0.2秒で上がる・量の範囲と種の決まり・従来形は今までどおり)。logic.test: 既存の「範囲が動く」系 (T2-09a 11/12・T2-11a 2/3) を新しい決まりに改訂 + 新しい describe 4件 (帯が変わるときだけ動く・同じ種なら同じ・ペダルで届く・引っかかりの上がりと戻り)。controller.test: メーターの帯は巻いているあいだ動かない
- 実機確認は T2-16b と一緒にやる (動きの確認)
- テスト 1019 passed / 11 skipped・check 0・build 0

## 2026-10-05T17:20+09:00 T2-16 その3 (張りの計算の不具合・引っかかりで切れる・帯の表記)
- 張り≒ペダルの位置: TENSION を base 0・perPedal 1.0 に (ペダル 0 で張り 0・ペダル 50 で 50。速さを十分に出せる)。RANGE_REACHABLE を 10〜100 に (T2-11 の決まりを新しい式に合わせる)。ビーム巻きは変えない
- 引っかかり: 0.5秒で +15〜25 上がり・2〜3秒かけて戻る (DRIFT の snagRiseMs 500・snagRecover 2000〜3000)
- 引っかかりのあいだ、張りが上の端 + SNAG_BREAK_MARGIN (8) を超えたまま SNAG_GRACE_MS (レベル1: 2000・2: 1500・3: 1200 ms) 続いたら 1 本切れる (今の糸切れの扱いと同じ・切れる糸は乱数で決める)。ペダルを戻して張りが下がると 0 に戻す (数え直す)。State に snagOverMs を追加 (isValidResume も必須に)
- 帯の表記: 「帯 4 / 6」→「帯 4/6」(panel.ts)
- テスト: 張りの式 (揺れ0でペダル0→0・50→50・最初の帯でペダル50は範囲の中・ペダル0は範囲の外)・RANGE_REACHABLE・猶予で切れる/戻すと切れない・引っかかり 0.5秒/2〜3秒・帯 2/5 表記。T2-16a の範囲テストの下端を RANGE_CENTER(3) に合わせて更新
- 実機確認 (?v=24・紺の無地): ペダル 0 で張りの黒い棒が左端 (0)・適正の緑の帯は中央・「帯 1/3」表記
- テスト 1026 passed / 11 skipped・check 0・build 0

## 2026-10-05T17:55+09:00 T2-16b (制限時間)
- 帯 1 本の目標の時間 = 帯の長さ (400) ÷ (適正の範囲の上の端の張りになるペダルの速さ) × TIME_MARGIN (1.1)。T2-16 その3 の張りの式 (張り≒ペダル) で計算 (レベル1: 約16.9秒・2: 約17.0秒・3: 約18.2秒)
- 目標は帯が始まるときに計算して足す (State.targetMs。cut で次の帯のぶんを足す)。isValidResume は targetMs を必須に
- panel・messages の「目標」は足した合計を表示 (targetMsOf は State.targetMs を返す)
- テスト: 上端ちょうどで巻くと目標の約91%で終わる/下端では目標を超える/どのレベルでも範囲の中で目標内に終わる道がある/帯ごとに足す/isValidResume/summary の目標
- controller.test の統合テスト: 固定ペダル 40 では星2 (品質は足りるが時間超過。星3は範囲の上を追いかける運転 = logic.test T2-09a 4)。切れた糸を押してつなぐ復帰も確かめる
- 実機確認 (?v=25): 目標 0:16 (帯1)・帯 1/3 表記
- テスト 1032 passed / 11 skipped・check 0・build 0

## 2026-10-05T20:10+09:00 T2-16c (ハサミで帯の端を結ぶ)
- 「帯の端を結ぶ」ボタンを廃止。帯を巻き終えると盤面にハサミのアイコン (68px・白い円の土台) を出す
- 位置は帯ごと: ドラムの上半分なら筬とドラムのあいだの上・刃は下向き。下半分なら下・刃は上向き。軽く上下に揺れる (押せる合図)
- ハサミを引っぱって糸の束の上で離すと切れて結びの演出へ。外れた所で離すと元の位置に戻る。引っぱるあいだは touch-action: none
- 最初のお題で 1 回「ハサミを糸の所まで引っぱって切ります」のお知らせ (messages.ts guideFor)
- panel.ts: cutting のペダルの理由文を「ハサミで糸を切ると使えます」に
- テスト 8 件追加 (geometry 3・renderer 2・panel 1・controller 2)。統合テストはボタンの代わりにハサミのドラッグに書き換え (待ち方は phase で判定・切れた糸の復帰つき)
- テスト 1049 件 (1038 passed + 11 skipped)。check 0・build OK
- 実機確認 (?v=26): ハサミの位置と刃の向き・案内・ドラッグで切れて次の帯へ・ボタンが無い

## 2026-10-05T21:30+09:00 T2-16 その3 追加 (4)(5)
- (4) ドラムの板・帯を止める竿・結び目の上端・下端を、その x での上の縁・下の縁の楕円の弧の高さに (帯の弓なりと同じ曲線。正面の中央で高く、左右の端で低い)。板のはみ出しの長さと外へ開く角度は今のまま。結び目・鋼のピン・糸の束も弧に沿った胴の面の中の割合で動く
- (5) 巻き終えの質の波の線を上の縁と同じ弓なりに乗せ、まっすぐ横の黒い線を描かない
- drumRimY (renderer.parts) を追加。テスト: 板の上端が弧の y と差 1 以下/done で同じ y の直線が続かない。既存の板・竿テストは弧のぶんの y を考慮して更新
- テスト 1051 件 (1040 passed + 11 skipped)。check 0・build OK
- 実機確認 (?v=27): 回転中の板・竿が弧に沿って動く。黒い横線なし

## 2026-10-06T00:40+09:00 T3-04a (ビーミングのルール: 速さの3段階・適正な速さ・糸切れ・確認)
- 張り (ペダル・メーター) をやめた。BeamingState から pedal・tension・range・okMs を外し、speed (0/50/100)・goodMs・restarts・broken を持つ
- 速さ 100 で 30 秒で 0→1 (50 は半分の速さ)。適正な速さは GOOD_SPEED_ZONES の表 (0〜30: 50・25〜75: 100・70〜99: 50・95〜100: 停止。重なる所はどちらでも適正)。speed > 0 で適正に合っていれば goodMs を足す
- 巻き量 100% を超えたら broken で失敗 (星なし・成績の行「巻き量が 100% を超えました」)。95% 以上で止めて confirm すると結果
- 95% を超えてから 停止 → 50% に戻すと restarts が増える (微調整)
- 採点: 星3 = 適正 0.8 以上・止めた位置 99% 以上・微調整 2回以下・幅 1cm 以内・中央 0.8 以上。星2 = 適正 0.6 以上・97% 以上・幅 3cm 以内。成績の行は 5 行 (適正な速さ・止めた位置・微調整・幅合わせの誤差・中央に保てた割合)
- 操作欄は仮の速さボタン (停止/50%/100%) と仮の「確認」(T3-04b で盤面のレバーに・T3-04c で確認の正式な出し方に置き換え)
- テスト: 速さと巻き量・適正の表・goodMs・100% で失敗・微調整・確認の条件・採点の境目・成績の行・isValidResume (計 20 件)
- テスト 1053 件 (1042 passed + 11 skipped)。check 0・build OK

## 2026-10-04 17:18 — T3-04a・T3-04b (ビーミング: 速さのルールとレバー)

- **T3-04a** (`e104e95`): 張り(ペダル)をやめ速さの3段階(停止・50%・100%)へ。適正な速さは巻き量ごとの表 (0〜30: 50%・25〜75: 100%・70〜99: 50%・95〜100: 停止。重なりはどちらでも適正)。100 で 30 秒。止めずに 100% を超えると糸切れ (星なし・行「巻き量が 100% を超えました」)。95% 以上で止めて「確認」→ 採点 (星3: 適正8割・位置99%・微調整2回以下・幅1cm・中央8割)。95% 超えてから 停止→50% は微調整として数える。操作欄は仮のボタンと仮の確認。
- **T3-04b** (`f8821f1`+`41b8af3`+`66e9a9a`): ビームの上に速さのレバー (止まり3つ 320/500/680・間隔180)。引っぱるか押して動かし、離すと一番近い止まりに吸い付く。適正な止まりに藍の枠+白いpillの「適正」。速さのランプ (適正=緑○・速すぎ=▲・遅すぎ=▼・停止では消灯)。操作欄の巻き量の下に巻き量の帯 (区間の塗り分け・95%と100%の目印・100%は朱・今の巻き量の縦の印)。見出しは用語 speed「速さ」。
- **実機で発見した不具合**: レバーを引っぱっている最中に pointerup を取りこぼす (結果ダイアログが出る等) と leverDragX が固まり、以後レバーが押せない。pointerup/pointercancel を pointerId を問わず受け付けるように修正 (`41b8af3`)。
- 遊び方の2ページ目はまだペダルと張りのメーターのまま (T3-04c で差し替え)。
- テスト 1055 passed (11 skipped)・check 0・build OK。CI は e104e95/f8821f1/c3bc01b/41b8af3/66e9a9a すべて success。
- 実機確認 (?v=30): レバーで50%→緑○・25%超えで100%→緑○・95%で停止→確認→結果の5行 (適正な速さ/止めた位置/微調整/幅合わせの誤差/中央に保てた割合)。100%超えの糸切れの結果も確認。

## 2026-10-04 17:55 — T3-04c (確認と結果・遊び方)

- 巻き量 95% 以上で操作欄に主な操作「確認」を出す (CONFIRM_MIN)。止めていないときは押せない形 (aria-disabled + うすい表示) で、押すと理由「レバーを停止にしてから確認します」をお知らせに出す。
- 糸切れ (失敗) は星なしの専用の画面: 題名「糸が切れました」・行「巻き量が 100% を超えました」・ボタンは「もう一度」「一覧」のみ (次へは無い)。結果のコールバック (onFinish) を呼ばないので星は記録されない。「もう一度」で同じお題を幅合わせからやり直す。
- 遊び方を今の画面に合わせて差し替え: 2ページ目=レバーの3段階・巻き量ごとの適正な速さ・ランプ・100%超で糸切れ。3ページ目=寄せる・乗り上げ・95%超えたら停止して確認。文が画面からはみ出たため短くした (実機で確認)。
- T3-04a の仮の速さボタンを廃止 (レバーに置き換わった)。テストはレバーのポインタ操作に書き換え。
- テスト 1062 passed (11 skipped)・check 0・build OK。CI は d816f3d を含む push の先頭 63d2b8c・11796ac・6ee7928 すべて success。
- 実機確認 (?v=33): 遊び方 3 ページ・95% で確認が出る (巻いているあいだは押せない形)・停止して確認→成功の結果 (星つき)・止めずに 100% 超→糸が切れましたの画面→もう一度でやり直し。

## 2026-10-04 18:14 — T2-17 (遊び方を開いているあいだの一時停止)

- 「遊び方」(?、右上) を押して遊び方が開いているあいだ、そのゲームの rAF のループを止める (巻き・ビーミング・糸割り・ドラム設定。クリール立ては時間で進むものが無いので変えず)。止めているあいだは 張り・巻き量・経過時間・制限時間・試し巻きのアニメーションが進まない。
- 閉じた (始める/×) ら自動で再開。ペダル・レバーの位置は開く前のまま (裏に回ったときのように 0 にしない)。再開の最初のフレームで止めていた時間を足さない (lastFrameMs/lastTs を測り直す。ドラム設定は createGameLoop の start で 16ms に戻る)。
- 遊び方を開いたまま unmount しても、ループと購読はすべて解除される (今の決まりのまま。再開しない)。
- 裏に回ったとき (visibilitychange) の今の動きは変えない。遊び方を開いたまま裏に回ったら、閉じるまで再開しない。
- 実装は各 controller の onHelp を openTutorial (async) に変え、開く前に stop、閉じた後に start。tutorialOpen フラグで二重起動を防ぐ。
- テストの偽 rAF が cancelAnimationFrame を無視していたため、実装が正しくても止まって見えなかった → 偽 rAF を本物と同じ (cancel されたフレームは動かない) に直した (4 つの controller.test)。
- テスト 1072 passed (11 skipped)・check 0・build OK。各ゲームの controller.test に 3 件ずつ (止まる・再開と時間の測り直し・開いたまま unmount)。
- 実機確認 (?v=34 ドラム巻き): 巻いているあいだに遊び方を開くと時間が止まる。閉じると自動で再開し、止めていた時間は加算されない。ペダルの位置はそのまま。

## 2026-10-04 19:29 — T2-16 その4 (a: 絵の直し・b: ハサミの作り直し)

### その4a (546b471)
- 巻き終えたあとの帯の上の黒い線を、直線でも曲線でも描かない (drawDoneSurface を削除。巻いているあいだと同じ見た目: 明るい縞と部品だけ)。
- 帯を止める竿の下の端は、下の縁の楕円のその位置での手前の弧まで (overBottom を廃止)。竿と印は弧に沿って弓なりに動く (その3-4 のまま)。

### その4b (adedf20)
- ハサミの置き場所を帯に依存しない固定に (scissorsPos() は引数なし。クリールの右下・筬の左下・盤の下のほう = (CREEL_END_X と REED_X の中間, LOGICAL_H − 70))。
- 絵を作り直し: 白い円の土台をやめ、銀色 (steel) の刃 2 枚 + 濃い色の輪の持つ手 2 つ + 支点のねじ。ふだんは少し開く。
- 引っぱると指の位置より SCISSORS_LIFT (= サイズの半分 + 24) 上に浮く (クリールの糸巻きと同じ)。touch-action: none は既存のまま。
- 切れるかどうかは刃の先 (中心 + SCISSORS_TIP = サイズの 45%) で判定。届く (cutReady) と刃が大きく開き (開き角 0.38rad)、糸の束が藍色 (COLORS.ai) に変わる。
- 離すとすぐには切らず、閉じる動き (0.3秒・openK 1→0) をしてから cut → 結びの演出 → 次の帯。外れたら元の位置に戻る。pointercancel は切らずに戻る (今までは cancel でも切れていたのを直した)。
- テストの偽 rAF・pedalControl は変更なし。実機では合成ポインタイベントに setPointerCapture が例外を出すため、実機確認時はページ側で無効化して確認した。
- テスト 1081 passed (11 skipped)・check 0・build OK。geometry.test に置き場所と SCISSORS_LIFT・renderer.test に絵と cutReady の藍色・controller.test に持ち上げ/cutReady/閉じる動き/pointercancel を追加。
- 実機確認 (?v=36): 帯 1 を巻き切る → ハサミが決まった場所にある → つかんで糸の束へ (指より上に浮く・刃が開く) → 離すと切れて結ばれ 帯 2/3 に進んだ。

## 2026-10-05 T2-16 その5 (v0.3.15)
- geometry に surfaceY(x, baseY) を1つだけ追加。帯の縞・境目・板・竿・灰色の印・結び目はすべて surfaceY で高さを決める (中央が高い ∩ に統一)。drumRimY・onSurface は削除。
- ハサミを作り直し: 縦向き (銀の刃が上・黒い楕円の輪2つが下に左右並び・赤い丸いねじ)。閉じた形は刃が重なる。cutReady で刃が X に開く (±17.5度)。大きさ 96。当たり判定は支点 (ねじ)。
- テスト 1087 件 (check 0・build OK)。実機で巻き切り→ハサミ→切断→結び→次の帯を確認。

## 2026-10-05 T2-16 その6 (v0.3.16)
- ハサミ: 持ち上げ = ハサミの高さ + 24 (持ち手の輪まで指の上に出る)。切る判定は刃先 (SCISSORS_TIP = 53・支点から上)。cutReady は刃先が糸の束に入ったとき・離したときも刃先で判定。
- 時計の表記「0:49/0:33」(隙間なし) + 操作欄の幅に「0:00/0:00 超過」が1行で入る大きさ (min(40, 幅/7)・下限 20)。base.css の font-size は削除 (JS が設定)。
- 制限時間: お題開始時に全帯の範囲を決める (1本目は中心 50・レベル2/3 は帯ごとに移動・20〜80 に収める)。制限時間 = 各帯を範囲の TIME_ANCHOR (params・今は 0.5 = 中心) の速さで巻いた時間の合計。TIME_MARGIN の掛け算は廃止。isValidResume は ranges を必須に。
- テスト 1089 件 (check 0・build OK)。実機で時計の新表記・1分00秒の制限時間・ハサミの浮き上げと刃先での切断→結び→次の帯を確認。

## 2026-10-05 T1-21 (v0.3.17)
- T1-21a (e703989): 上の縞のにじみ = #app::before (position fixed) で safe area の高さ+4px を地の色 (kinari) の無地で埋め、縞はその下に。index.html に apple-mobile-web-app-capable と status-bar-style default を追加。回転のずれ = html・body を overflow hidden + 100dvh、#app を position fixed inset 0 にし、大きさの変化のたびに resetDocumentScroll (通知のフレーム・1フレーム後・300ms 後の scrollTo(0,0))。installScrollReset を main.ts で登録。Android・PC は safe area が 0 のため見た目はほぼ変わらない (縞が 4px 下がるのみ)。
- T1-21b (80af280): 版の行を .home__titles の外 (見出しの下) に出して flex-basis: 100% の幅いっぱいの行に。版の番号 (.home__version-num) と日付 (.home__version-date) の2つの nowrap 要素に分け、「(」の前でだけ折り返す。
- テスト 1092 件 (check 0・build OK)。実機 (ビルド 0.3.17) で版の行・#app fixed・::before・resize で scrollTo 3回を確認。iPhone 実機での確認は管理者。

## 2026-10-06 T2-16 その7 (v0.3.18)
- メイン (03d5cb6): ①時計の大きさ = 内側の幅の 85% 以下に「0:00/0:00 超過」が収まる大きさ (20px 以上・40px 以下)。②TIME_ANCHOR 0.5→0.6 (管理者の指定)。③巻き量 = 操作欄でいちばん目立つ表示 (32px 太字 + 0〜100% の横長の帯)。100% は藍の地に白の文字 + 「巻き終えました」。④buzzer (440Hz・600ms) を巻き量 100% の瞬間に1回鳴らす (同じ帯で2回鳴らさない・音を切る設定に従う)。
- 時計の実測への変更 (f123aca〜67cd5a2): 最初の測定でフォント未読込→85%超えが残る / flex で offsetWidth が常にコンテナ幅 / ゲーム枠の transform で clientWidth が実寸より大きい / 文字サイズごとに描画の幅が比例しない — の4点を修正し、最終形は「見た目の幅 (getBoundingClientRect) で 40px のサンプル文字を測って換算 → 実測で内側の幅の 82% を超えたら 1px ずつ縮める」。
- 実機測定 (915×412 を含む5つの大きさ・超過の形): はみ出し 0・右の余白 16.4% / 19.2% / 15.8% / 18.2% / 20.9% (すべて 15% 以上)。巻き量 100% の表示 (藍の地に白 + 巻き終えました + 白い帯) とブザー 1 回を確認 (発振器 1 個・追加なし = 2 回鳴らない)。
- テスト 1098 件 (check 0・build OK)。

## 2026-10-06 T1-22a: ホームのカードの余白を WebKit と Chromium で測った(まだ直していない)

### やり方
- Playwright の WebKit と Chromium を作業環境だけに入れた(`/opt/data/tools/pw`・`package.json` には足していない)。WebKit は root 権限が無いため、必要なシステムライブラリを Debian の deb からユーザー領域(`/tmp/pwsys`)に展開し、WebKit のバンドルの `sys/lib` に入れて動かした(EGL は llvmpipe のソフトウェア描画)。
- 本番と同じビルド(`npm run build` → `vite preview`)を、Chromium と WebKit の両方で 412×915・915×412・1180×820(iPad 横)・820×1180(iPad 縦)で開き、各カード(`.game-card`)の高さ・中身の各要素の高さと位置・カードの高さと中身の合計の差・グリッドの行の高さを測った。

### 測った数字(1枚目のカード「糸割り」)
| 大きさ | エンジン | カードの高さ | 中身の合計 | 差 | SVG の高さ | 題名 | 説明 | 状態 | 説明の下と「お題」のあいだ |
|---|---|---|---|---|---|---|---|---|---|
| 412×915 | Chromium | 334 | 268 | 66 | 169 | 39 | 40 | 20 | 8.0px |
| 412×915 | WebKit | 314 | 248 | 66 | 169 | 39 | 20 | 20 | 8.0px |
| 915×412 | Chromium | 272.5 | 206.5 | 66 | 107.5 | 39 | 40 | 20 | 8.0px |
| 915×412 | WebKit | 272.5 | 206.5 | 66 | 107.5 | 39 | 40 | 20 | 8.0px |
| 1180×820 | Chromium | 316.7 | 250.7 | 66 | 151.7 | 39 | 40 | 20 | 8.1px |
| 1180×820 | WebKit | 316.7 | 250.7 | 66 | 151.7 | 39 | 40 | 20 | 8.0px |
| 820×1180 | Chromium | 327 | 261 | 66 | 162 | 39 | 40 | 20 | 8.0px |
| 820×1180 | WebKit | 327 | 261 | 66 | 162 | 39 | 40 | 20 | 8.0px |

- 差 66px = カードの上下の余白(20px×2)+ 要素のあいだの隙間(9px×3)で、中身以外の余白は説明しつくされる。
- 「お題 15」(状態)は `margin-top: auto` で下に寄せているが、余りの余地は 0 で、説明の文と「お題 15」のあいだは隙間 9px のみ。

### 数字で分かったこと
- **デスクトップ版の WebKit(Playwright の WPE ビルド)では、管理者の実機(iPhone・iPad)で見られた余白は再現しなかった。** Chromium と WebKit でカードの高さ・SVG の高さ・要素の位置はほぼ同じ(412×915 だけ Chromium が説明を2行で折り返しカードが 20px 高い=フォントの違いで、余白の作り方は同じ)。
- 確認役の見当だった「WebKit が SVG(viewBox だけ・width:100%・height:auto)をグリッドの行の高さの計算で実際より大きく見積もる」は、デスクトップ版 WebKit では**確認できなかった**(SVG の高さは両エンジンで同じ 169/107.5/151.7/162px で、縦横比 200:100 どおり)。
- iPad について:デスクトップ版 WebKit は iPad の大きさ(1180×820・820×1180)でも差を出せなかったため、「iPad でも起きるか」はこの方法では確かめられなかった。

### ここまでの判断
- 管理者の条件「原因は推測で決めず」に従い、**T1-22b(直す)はまだ行わない**。考えられる違いは (a) デスクトップ版 WebKit と iOS Safari の描画の違い(SVG の大きさの見積もりなど)、(b) 実機の iPhone の状態(PWA での起動・文字の大きさの設定など)。管理者の実機の情報(iOS の版・スクリーンショットの再提示、または実機で直してよいかの判断)を待ってから直す。

## 2026-10-06 T1-22b: カードの絵の大きさを確定させて、iPhone・iPad の回転後の余白を直す(version 0.3.19)

### 管理者の実機の情報(Discord 2026-10-06、スクリーンショット4枚)
- iPhone: (1) 縦で起動した直後は問題ない (2) そのまま横に向けても問題ない (3) **そのまま縦に戻すとカードの下に余白が出る** (4) そのまま再度横に向けても余白が残る。つまり**回転のあとに古い大きさが残る**形。

### 追加で測ったこと(回転テスト)
- 同じページで 412×915 → 915×412 → 412×915 と続けて測った。**デスクトップの Chromium も WebKit も回転後に元どおり**(カード 334→272.5→334 / 314→272.5→314、SVG 169→107.5→169)。実機の現象はデスクトップでは再現できず、iOS Safari 固有と分かった。

### 直した内容
- `src/app/screens/homeCards.ts`: カードの絵の SVG に `width="200"`・`height="100"` の属性を付けた(viewBox だけでなく、縦横比を属性で確定させる)。
- `src/styles/base.css`: `.game-card__art` に `aspect-ratio: 200 / 100` を追加(width: 100%・height: auto は変えない)。
- 直す前は SVG の大きさをブラウザが viewBox から見積もるしかなく、iOS Safari が回転のあとに古い見積もりを使い続けることで余白が出ていたと考えられる。属性と aspect-ratio で比を確定させることで、見積もりに頼らない大きさになる。

### 確かめたこと(数字)
- **Chromium(Android と同じエンジン)の測定は直す前後で 1px も変わらない**(412×915・915×412・1180×820・820×1180 のカードの高さ・中身・SVG・位置を全部比較)。WebKit も同じ。
- 回転テストも直す前後で同じ(どちらのエンジンも回転後に元どおり)。
- テスト:RED 確認(属性と aspect-ratio のテストを先に書いて落とす)→ GREEN。全テスト 1099 件成功。`npm run check` エラー 0。`npm run build` 成功。
- 遊び方の絵と文:ホームのカードは遊ぶ画面ではないため変更なし(確認のみ)。

## 2026-10-06 T1-22c: 回転のたびにカードの並びの行の高さを強制的に計算し直す(version 0.3.20)

### 管理者の実機の情報の追加(Discord 2026-10-06)
- 正確な発生手順: 縦で起動したら**横にしただけで**発生する。横で起動したら**縦にしただけで**発生する。つまり**1度でも回転すると、その時点で余白が出る**(0.3.19 の確認でも改善なし)。

### 分かったこと(実機のスクリーンショットの再測定)
- 余白が出ている状態でも、カードの絵 (SVG) 自体は正しい大きさで描けている。伸びているのはカードの並び (grid) の**行の高さ**。
- カードの並びはグリッドで、行の高さは中身から自動で決まる。行だけが伸びると、カードは伸びた行に合わせて広がり、「お題 15」だけ `margin-top: auto` で下に張り付く。実機の見た目と一致する。
- 0.3.19 (SVG の大きさの確定) が効かなかったことと合わせると、**iPhone・iPad の Safari が回転のときにグリッドの行の高さを計算し直さない**(古い値のまま使う)タイプの不具合と考えられる。デスクトップの Chromium・WebKit は同じ回転手順で必ず元どおりになるため、実機固有。

### 直した内容
- `src/app/screens/homeScreen.ts`: 大きさが変わるたび (回転を含む。`onViewportChange` を使う) に、カードの並び (`.home__games`) を一瞬 `display: none` して戻すことで、行の高さを強制的に計算し直させる (`relayoutGrid`)。隠すと戻すは同じ処理の中なので、描かれる間の状態は無い。回転直後の大きさの反映の遅れに備えて、150ミリ秒後にもう1回行う。`unmount` で監視とタイマーを解除。
- `src/styles/base.css` と `homeCards.ts` の 0.3.19 の変更 (SVG の width・height 属性と aspect-ratio) は、比を確定させる意味でも残す。

### 確かめたこと
- テスト:RED 確認(回転で計算し直すテストを先に書いて落とす)→ GREEN。全テスト 1100 件成功。`npm run check` エラー 0。`npm run build` 成功。
- デスクトップの Chromium・WebKit で縦→横→縦を同じページで続けて測り、回転後に元どおり(カード 334→272.5→334 / 314→272.5→314)を確認。0.3.19 と数字は同じ。
- この直しは実機でしか効き目を確かめられない(iOS 固有のため)。管理者に 0.3.20 で「1度回転する」操作での確認を頼む。

## 2026-10-06 調査: iPhone で回転したときに画面全体が一瞬下にずれて戻る原因(修正はまだ)

管理者の報告(Discord 2026-10-06・スクリーンショット付き): 横向きから縦向きにした瞬間、画面全体が一瞬下にずれて、すぐ元に戻る。この現象は「画面全体が上に上がりすぎる」問題への対応(T1-21a-2)のときから発生している。**修正はせず、原因の調査のみを行った。**

### アプリ側の仕組み(T1-21a・コミット e703989、2026-10-05)
「縦→横→縦で画面が上にずれる(上に上がりすぎて戻らない)」への対応として、次を入れている。
1. `html`・`body` を `height: 100dvh`・`overflow: hidden` に (`base.css` 30〜31行)
2. `#app` を `position: fixed; inset: 0` に (`base.css`)
3. 大きさが変わるたび (回転を含む) に `window.scrollTo(0, 0)` を**即時・次のフレーム・300ミリ秒後の3回**呼ぶ (`viewport.ts` の `resetDocumentScroll`・`main.ts` 108行目の `installScrollReset`)

### デスクトップでの計測(Chromium と WebKit、横 915×412 → 縦 412×915)
- イベントとスクロール位置を全て記録した結果: 回転の間、`scrollY` は一度も 0 から動かない。文書の高さ = 画面の高さで、スクロールの余地が無い。
- `scrollTo(0,0)` は予定どおり 3 回呼ばれる (19ms・35ms・319ms 後など) が、位置が変わらないため何も起きない。
- **つまりデスクトップでは、この仕組みは無害で、一瞬のずれは起きようがない。** 実機の iPhone でだけ起きることを裏付ける。

### iOS 側の documented な挙動(技術的裏付け)
- **WebKit の不具合 153852 → 220908 → 240859**: `overflow: hidden` を付けても、**ホーム画面に追加した standalone アプリ (PWA) では文書 (body) がスクロールできてしまう**。iOS 26 でようやく一部が直された (Safari 26.4 のリリースノート)。つまり管理者の iPhone では、`overflow: hidden` を付けていても iOS 自身が回転のときに文書のスクロール位置を動かしうる。
- **回転のときにスクロール位置が動くのは iOS の既知の挙動** (Stack Overflow「page shifts when rotating iPad from landscape to portrait」ほか。対策の定番が回転後の `scrollTo(0,0)`)。
- **standalone アプリの起動直後、`100dvh` が実際の画面より `env(safe-area-inset-top)` 分だけ短く報告され、回転などをきっかけに iOS が再計算する。その再計算には「ページが正しい位置へ滑り込む見た目のアニメーション」が伴い、CSS では止められない** (実測値付きの技術記録: iPhone 14 Pro の standalone で `100dvh` = 793px、実際 852px、差 -59px)。
- `position: fixed` はレイアウトビューポートに固定されるが、iOS はビジュアルビューポートとレイアウトビューポートを分けて持ち、回転の再計算の間は両者のずれが見た目に出る (キーボードなどで同じ現象が知られている)。

### 結論(原因の説明)
1. 回転の瞬間、iOS (standalone アプリ) が文書のスクロール位置とビューポートの高さ (`100dvh`・safe area) を段階的に再計算する。この間、`overflow: hidden` があっても iOS 自身がページを動かす(不具合 153852/220908)。これが「一瞬下にずれる」。
2. アプリの T1-21a-2 の `scrollTo(0,0)` は、iOS の再計算が終わる前 (即時・次フレーム) と**終わった後 (300ミリ秒後)** に呼ばれる。iOS が動かした後で 300ミリ秒後の 3 回目が位置を引き戻すため、「ずれて → 戻る」が 2 段階の動きとして見える。**管理者の推測どおり、T1-21a-2 の対応方法(3回のスクロール位置の戻し)が、現象を見える形にしている。**
3. ただし T1-21a-2 は「上に上がりすぎて戻らない」を直すために必要だったものを削れば元の問題に戻るため、削るのではなく**動かし方を変える**方向が妥当。

### 次の修正の候補(管理者の承認を待って実装)
- A: `scrollTo(0,0)` は位置が実際にずれたときだけ呼び、回転が収まった後の 300ミリ秒後の呼び出しをやめる(または、ずれが検知された直後に短い間隔で再試行して早く収束させる)。
- B: 文書のスクロールを iOS に任せず、`scroll` イベントを監視してずれた瞬間に同じフレームで (0,0) に戻す(300ミリ秒後の一括修正より、ずれの時間が短くなる)。
- C: iOS 26 では WebKit 側の一部修正が入っているため、まず iOS の版を確認し、26 では挙動が変わるかを見る。

### 発生条件の追加報告(管理者、2026-10-06)と原因の確認
- 端末は Fold 8 と iPhone Air の2つ。**発生するのは iPhone Air のみ。**
- さらに iPhone Air の中でも、**ホーム画面にインストールしたアプリ(standalone)から起動したときだけ**発生する。Safari・Chrome(ブラウザ)から開いたときは発生しない。
- この条件は前節の技術的裏付けと完全に一致する:
  - WebKit 不具合 153852/220908 の「`overflow: hidden` でもスクロールできてしまう」は**standalone モード限定**の挙動(ブラウザモードでは UI の状態によっては防がれる)。
  - `100dvh` が safe area 分だけ短く報告され、回転をきっかけに再計算されて「ページが滑り込むアニメーション」が出るのも **standalone モード**の documented な挙動。
  - Fold 8 (Android) は回転でレイアウトの大きさが素直に変わるため起きない。Safari(ブラウザ)は standalone とスクロール防止の挙動が違うため起きない。
- 結論は変わらず: iOS standalone での回転時の iOS 自身のページの移動 + T1-21a-2 の 300ミリ秒後の `scrollTo(0,0)` が「ずれて→戻る」を見える形にしている。

## 2026-10-06 T1-21a-2 追加修正 (A案): 文書のずれは、ずれたときだけ戻す(version 0.3.21)

### 経緯
- 管理者の調査依頼(2026-10-06)で原因を報告し、修正の候補(A案〜C案)を提示。管理者が **A案** を承認(2026-10-06)。
- A案: `scrollTo(0,0)` は実際にずれたときだけ呼び、300ミリ秒後の一律の呼び出しをやめる。ずれを検知したら短い間隔で素早く収束させる。

### 直した内容(`src/core/viewport/viewport.ts` の `resetDocumentScroll`)
- 通知のフレームでの `scrollTo(0,0)` は残す(ずれていなければ何も起こらない)。
- **300ミリ秒後の一律の呼び出しをやめ、100ミリ秒ごとの確認に変えた**: ずれていればそのつど (0,0) に戻す。ずれが無い状態が続いたら確認をやめる(最長 600ミリ秒)。
- 効果: (1) iOS が回転の再計算でページを滑り込ませている間に、アプリが余計に位置を動かさない。(2) ずれが起きたとしても、以前の「300ミリ秒後の一括修正」より早く(最長 100ミリ秒以内に)戻るため、ずれて見える時間が短くなる。(3) 「上に上がりすぎて戻らない」問題も引き続き防げる(ずれを検知して戻す仕組みは残る)。

### 確かめたこと
- テストは RED 確認(「ずれていなければ動かさない」「ずれたら戻して収束する」「後からずれても戻す」の2件を先に書いて落とす)→ GREEN。
- 全テスト 1101 件成功。`npm run check` エラー 0。`npm run build` 成功。
- 効き目の最終確認は iPhone Air の standalone(ホーム画面から起動)で行う(横向き→縦向きに回して、一瞬のずれが消えたか、または短くなったか)。

## 2026-10-06 T1-21a-2 診断: 管理者メニューに「回転の記録」を追加(version 0.3.22)

### 経緯
- A案 (0.3.21) で iPhone Air の standalone の「回転時に一瞬ずれて戻る」は解消しなかった (管理者の確認)。
- 発生タイミングの追加報告: 回転が終わった瞬間から 1 秒以内 (体感 0.5 秒以内) に完了。**監視は細かい間隔で**という管理者の助言。
- 「推測で決めない」規律に従い、原因を数字で確定させるための診断を管理者メニューに追加した (管理者メニューはもともと診断のための画面。残すか消すかは原因確定後に管理者が決める)。

### 追加した内容
- `src/app/screens/rotationProbe.ts` (新規): 大きさが変わる (回転する) たびに **2 秒間・アニメーションの 1 フレームごと (約 16 ミリ秒間隔)** で次の値を記録し、動いた値と時刻をまとめる。
  - 文書のスクロール (縦・横) / 画面の大きさ (幅・高さ) / 見えている窓の状態 (上のずれ・高さ・拡大率 = `visualViewport`) / 上の帯の高さ (#app の上余白・safe area を含む) / 文書の高さ / アプリの土台 (#app・position fixed) の表示上の位置 (上・左)
- `src/app/screens/adminScreen.ts`: 「回転の記録 (診断)」の節を追加。画面を回すと記録が出る (回転ごとに記録をやり直す)。`unmount` で監視をやめる。
- 記録の見方: 「ずっと 0px」= 動いていない。「0px〜25px (123ミリ秒後 (0px→25px))」= その値が動いた。

### 確かめたこと
- テストは RED 確認 (まとめ方のテスト・動かし方のテスト・管理者画面の節のテストを先に書いて落とす) → GREEN。全テスト 1106 件成功。`npm run check` エラー 0。`npm run build` 成功。
- version 0.3.21 → 0.3.22 (診断ツールの追加のため patch)。

### 管理者への確認のお願い
1. iPhone Air を 0.3.22 にして、**設定 → 管理者 → 回転の記録 (診断)** を開く
2. **その画面を開いたまま**、横向き→縦向きに回す (一瞬のずれが起きる操作)
3. 2 秒後に「回転の記録」に数字が出るので、スクリーンショットを送ってほしい
- どの値がいつ動いたかで、原因が「文書のずれ」か「見えている窓のずれ」か「safe area の再計算」かが数字で確定する。

## 2026-10-06 調査完了: 回転時の一瞬のずれの原因が数字で確定(修正はまだ)

### 管理者の実機の記録(iPhone Air・standalone・0.3.22、横→縦に回転)
- **文書のスクロール 縦: 0px〜68px (33ミリ秒後 (68px→0px))** — 記録の最初のフレームで 68px ずれていて、33ミリ秒後に 0 に戻っている
- **見えている窓 上のずれ (visualViewport.offsetTop): 0px〜68px (33ミリ秒後 (68px→0px))** — 文書のスクロールとまったく同じ動き
- **アプリの土台 表示上 (#app・position fixed の表示位置): -68px〜0px (33ミリ秒後 (-68px→0px))** — fixed の土台が表示上 68px 飛んでいた
- ほかは全部「ずっと」: 画面の高さ 844px・幅 420px・窓の高さ 844px・拡大率 1・上の帯 4px・文書の高さ 844px・表示左 0px

### 数字で分かったこと(原因の確定)
1. **レイアウト(大きさ)は何も変わっていない。** 画面の大きさ・文書の高さ・拡大率・safe area は回転の間ずっと同じ。動いたのは「見えている窓の位置」だけ。
2. つまり原因は、**iOS が回転の瞬間にページ全体 (position fixed の土台ごと) を 68px だけパン(ずらし)、すぐ戻す**という standalone 特有の動き。68px は iPhone Air の時計(ステータスバー)領域の高さと一致する。WebKit の documented な挙動(standalone では overflow: hidden でも iOS が文書を動かせる・回転をきっかけにビューポートを再計算して「ページが滑り込む」)と一致する。
3. 戻りは 0.3.21 の A案 (ずれたときだけ戻す) が 33ミリ秒後にやっている。A案の前 (0.3.20 まで) は 300ミリ秒後だったため、ずれた状態が長く見えていた。**A案は効いていたが、33ミリ秒 (2フレーム) の飛びでも目に見える**のが管理者の見ている現象。
4. 「上に上がりすぎる」旧問題と同じ根本原因 (iOS のパン) で、戻し方が速くなった分、今は「一瞬チラつく」形になった。

### 次の修正の候補(管理者の承認を待つ)
- **案1 (推奨・小さな変更)**: resize を待たず、**scroll イベントでずれを検知した瞬間に同じフレームで (0,0) に戻す**。iOS のパンが描画される前に戻せば、ずれは描画されない(見えなくなる可能性が高い)。
- **案2 (案1でまだ見えるとき)**: 文書のスクロールをより強く禁じる (body を position: fixed にする。iOS の定番のスクロール禁止策。#app はすでに fixed で中身が無いため影響は限定的)。iOS がパンしようがなくなり、飛び自体を無くせる可能性。
- 案1 → 実機確認 → まだ見えるなら案2、の順で進めるのが安全。

## 2026-10-06 T1-21a-2 案1: 文書のずれを、描画される前に戻す(version 0.3.23)

### 経緯
- 診断 (0.3.22) で原因を確定: iOS が回転の瞬間にページ全体 (position fixed の土台ごと) を 68px パンして、0.3.21 の A案が 33ミリ秒後に戻していた。レイアウトは不変。
- 管理者が **案1** (scroll イベントでずれた瞬間に同じフレームで戻す) を承認 (2026-10-06)。

### 直した内容
- `src/core/viewport/viewport.ts` に `installScrollGuard` を追加: `scroll` イベントを監視し、文書のスクロール位置が 0 でなければ、その場で `window.scrollTo(0, 0)` を呼ぶ (縦も横も)。戻し自体が起こす scroll イベントではずれが無いため何もしない (繰り返しにならない)。
- `src/main.ts` で起動時に取り付ける。
- A案の仕組み (resize のあとの確認) はそのまま残す (二重の安全網)。

### 期待される効果
- iOS がパンした瞬間に scroll イベントが来るので、**ずれた状態が画面に描画される前に戻る**。ずれが見えなくなる可能性が高い。

### 確かめたこと
- テストは RED 確認 (案1のテストを先に書いて落とす) → GREEN。全テスト 1107 件成功。`npm run check` エラー 0。`npm run build` 成功。
- 効き目の最終確認は iPhone Air の standalone で行う。まだ見える場合は案2 (body を position: fixed にして iOS のパン自体を不可能にする) に進む。

## 2026-10-06 T1-21a-2 案2: body を position fixed にして iOS のパン自体を禁じる(version 0.3.24)

### 経緯
- 案1 (0.3.23) の実機確認 (管理者): まだチラつく。ただし**管理者メニューの回転の記録は全項目「ずっと」** = JS の上ではずれが起きる前にもう戻っていて、記録に残らないほど速い。
- つまりチラつきは **iOS の描画エンジン (compositor) の段階で描かれていて、JavaScript の修正では間に合わない**ことが確定。残る手段は、iOS がパンしようもなくさせること。

### 直した内容
- `src/styles/base.css`: body に `position: fixed; inset: 0` を追加 (iOS の定番のスクロール禁止策・案2)。文書に流れの要素が無くなり、iOS が回転のときに文書をパンできなくなる。中身は position fixed の #app だけなので見た目は変わらない。
- 案1の scroll の番人と A案の確認は、安全網として残す。

### 確かめたこと
- テストは RED 確認 (body だけの position: fixed の指定のテストを先に書いて落とす) → GREEN。全テスト 1108 件成功。`npm run check` エラー 0。`npm run build` 成功。
- **デスクトップ (Chromium) の測定は直す前後で 1px も変わらず** (4つの大きさのホームのカードの高さ・中身・位置を全部比較。body を fixed にしても見た目が変わらないことを確認)。
- 効き目の最終確認は iPhone Air の standalone で行う。チラつきが消えていれば完了。消えない場合は、iOS の動きに合わせる方向 (独自の見た目の妥協) を含めて管理者と相談する。

## 2026-10-06 調査の結論: 回転時のチラつきは iOS standalone 固有の回転の演出で、ページの側からは止められない(0.3.24 の確認結果)

### 管理者の実機の確認 (0.3.24)
- body を position: fixed にして iOS が文書をパンできないようにしても、**チラつきは変わらない**。

### ここまでの技術的な経過(全部数字・記録つき)
1. 0.3.22 の診断: 回転の瞬間に iOS がページ全体を 68px パンして 33ms 後に戻る (レイアウトは不変)。
2. 0.3.23 の案1 (scroll イベントで描画前に戻す): 診断は全項目「ずっと」= JS の上ではずれは残っていないのに、まだチラつく。
3. 0.3.24 の案2 (body を fixed にしてパンを不可能にする): それでもチラつきは同じ。

### 結論
- 文書のスクロール・レイアウト・パンのすべてを鎖した状態でもチラつくため、**チラつきは iOS が standalone アプリの画面を回転させるときに組み込みで行う見た目の遷移 (ビューポートの再計算の演出)** であり、ページの側 (CSS・JS) からは止められないと判断する。技術記録 (standalone のビューポート再計算には「ページが滑り込むアニメーションが伴い CSS では止められない」) とも一致する。
- Safari・Chrome (ブラウザモード) で出ないのは、ブラウザの UI (アドレスバーなど) が回転の演出を見えなくしているためと考えられる。
- なお 0.3.21 (A案) 〜 0.3.23 (案1) で、ずれた状態が残る時間は 300ミリ秒 → 33ミリ秒 → 描画前に短縮されており、以前より悪くはない。

### 残る選択肢(管理者に相談)
- **A: このまま受け入れる** (iOS の仕様として。アプリの動作には影響しない)。
- **B: チラつきを隠す演出を入れる** (回転の瞬間に背景色で一瞬覆って、ずれが見えないようにする。ただし「回転が一瞬暗くなる」という新しい見た目と引き換え)。
- **C: 診断 (回転の記録) を残すか消すか決める** (原因調査用なので、A または B を決めたら消すのが自然。残しても害は無い)。
- 管理者の判断を待つ。

## 2026-10-06 T1-21a-2 の修正の取りやめ: 0.3.21・0.3.23・0.3.24 を元に戻す(version 0.3.25)

### 管理者の決定 (2026-10-06)
- 回転時のチラつきは iOS の不具合として**このまま受け入れる**。
- そのため、意味が無くなった次の修正を元に戻す: **0.3.21 (A案・ずれたときだけ戻す)・0.3.23 (案1・scroll イベントの番人)・0.3.24 (案2・body を position fixed)**。
- **0.3.22 の診断 (回転の記録) は技術情報として有用なので残す。**
- 0.3.19 (カードの絵の大きさの確定) と 0.3.20 (回転のあとの行の高さの計算し直し) は、実機で効いた直し (カードの余白) なので残す。

### 戻した内容
- `src/core/viewport/viewport.ts`: `resetDocumentScroll` を元の形 (通知のフレーム・1フレーム後・300ms 後の3回の `scrollTo(0,0)`) に戻し、`installScrollGuard` を削除。
- `src/main.ts`: `installScrollGuard` の取り付けを削除。
- `src/styles/base.css`: body の `position: fixed` を削除。
- テストも元に戻した (元の T1-21a-2 のテストを復活し、A案・案1・案2のテストを削除)。テストは RED 確認 (元のテストが現在のコードに落ちる) → GREEN。

### 確かめたこと
- **`src/core/viewport/viewport.ts`・`src/main.ts`・`src/styles/base.css` は 0.3.20 (コミット 4588b3b) の時点と完全に一致** (git diff が空)。
- 全テスト 1105 件成功。`npm run check` エラー 0。`npm run build` 成功。
- 管理者メニューの「回転の記録 (診断)」は残っている (テスト 21 件が通ることで確認)。

## 2026-10-07 T2-18a: 始まり方と時間(version 0.3.26)

仕様: docs/04_tasks/P2/T2-18.md(管理者の実機確認 2026-10-07 の指摘。Discord メッセージ 1557242802138779661)。

### 直したこと
1. **「巻き始める」のボタンを無くした**: 操作欄の主な操作の行(panel.ts の buttonRow)を削除。`logic.ts` の `start` アクションを廃止し、`setPedal` で ready に 0 より大きい値を入れた瞬間に `winding` に移る。ペダルは ready でも押せる(panel.ts の `pedal.setEnabled`)。最初の案内は「ペダルを右へ動かすと巻き始めます」(messages.ts)で、巻き始まった瞬間に消す(controller.ts `dismissNotice`。gameFrame のお知らせ要素を消す)。
2. **時間を最後の帯を結び終えるまで止めない**: `logic.ts` の tick が `cutting` のあいだも `elapsedMs` を進める(ピンを回す・ハサミ・結びの動作のあいだも含む)。ready のあいだは進まない。`done` で止まる。
3. **制限時間 = 今の計算 + 5 秒 × 帯の数**: `params.ts` に `TIME_PER_SECTION_MS = 5000`(内訳 `TIME_PEDAL_START_MS = 1500`・`TIME_SCISSORS_TIE_MS = 3500`)を置き、init の targetMs に足す。

### 実装上の補足
- cutting のあいだは tick で毎フレーム状態が変わるようになったため、操作欄の更新は時計の秒が変わったときだけにした(controller.ts の `cutClockSec`。毎フレームの panel.update は重い)。
- controller.test.ts の「巻き始める」ボタンのクリックは `beginByPedal`(ペダルを 10 まで動かして巻き始めさせてから 0 に戻す)に置き換えた。

### テスト(先に RED を確認)
- logic.test.ts に T2-18a の describe(ready は時間が進まない/ペダルで始まる/cutting でも時間が進む/done で止まる/制限時間 = 合計 + 5秒×帯数)。その6 の制限時間のテストは新しい式に更新。
- panel.test.ts: 「巻き始める」のボタンが無い/ready と winding でペダルが押せる/ボタンが 1 つも無い。
- controller.test.ts: ボタンが無い/ペダルを動かすと winding になり案内が消える。
- 全体: 1110 passed | 11 skipped。check 0・build 0。

## 2026-10-07 T2-18b: 巻き量 100%・ハサミの当たり判定と閉じる動き・案内の消し方

仕様: docs/04_tasks/P2/T2-18.md の 4〜7。

### 直したこと
4. **巻き量 100% の表し方 (T2-16 その7 の一部を取りやめ)**: 100% になっても「巻き量 100%」の形とメッセージはそのまま (「巻き終えました」はやめた)。音も鳴らさない (ブザーを削除。`sounds.ts` の buzzer・controller の再生も削除)。**文字の色だけ** 0〜99% は黒 (`--c-sumi`)、100% は青 (藍 `--c-ai`、`winding-panel__amount--full`)。
5. **ハサミの当たり判定**: `geometry.ts` に `scissorsHit(p, pos)` を新設。刃 (支点から上 53) と持ち手 (支点から下 39・左右に輪) の全体に 10px の余裕を付けた範囲。controller のつかむ判定で旧来の正方形の代わりに使う。
6. **案内の消し方**: 案内 (お知らせ) が出ているときに画面のどこか (ハサミを含む・操作欄も含む) が押されたら案内を消す (controller で `frame.root` の pointerdown を受け `dismissNotice`)。ほかの一度きりの案内も同じ。
7. **閉じる動き**: 離したときの処理を `releaseScissors` にまとめ、**pointercancel (指が外れた) も離したときと同じ扱い**にした。刃先が糸の束に届いていれば閉じる動き (0.3秒) を見せてからハサミを消し、そのあと結ぶ動きを始める (既存の 0.3 秒の閉じる動きを流用)。

### テスト (先に RED を確認)
- geometry.test.ts: 刃の先・刃の中ほど・持ち手の輪・持ち手の下から引っぱり始められる/外は当たらない。
- panel.test.ts: 100% は「巻き量 100%」のまま・--full のクラス・「巻き終えました」なし/base.css の色。
- controller.test.ts: 巻き量 100% で音が鳴らない (ブザーのテストを置き換え)/案内が出ているときに押すと消える/pointercancel でも切れる (糸に届くとき)・届かないときは元の位置。
- audio.test.ts: buzzer のテストを削除。
- 全体: 1128 passed | 11 skipped。check 0・build 0。

## 2026-10-07 T2-18c: 遊び方を今の画面に合わせる (version 0.3.27)

仕様: docs/04_tasks/P2/T2-18.md の 8。

### 直したこと
- **2ページ目**: 「巻き始める」のボタンの説明をやめ、「{{pedal}}の帯を指で右へ動かすと、その瞬間に巻き始まります」に (T2-18a と同じ始まり方)。
- **4ページ目**: 「引っかかって張りが急に上がったら、{{pedal}}を少し戻します。戻さないと糸が切れて…」を先頭に (引っかかりで張りが急に上がったらペダルを戻す〔戻さないと切れる〕)。
- **5ページ目**: 「帯を巻き終えたら、ハサミを糸の所まで引っぱって切ります。時間は、最後の帯を結び終えるまで進みます。」と「100%になると文字が青くなります」を説明に追加。**絵にハサミを描き足した** (盤面と同じ鋼の刃・藍の輪の持ち手。drawScissors)。
- 3ページ目 (ランプ・適正の範囲) と 1ページ目 (クリール→ドラム) は今の画面のまま。

### テスト (先に RED を確認)
- 文に「ハサミ」「ランプ」があり「巻き始める」「帯の端を結ぶ」が無い/始まり方・引っかかったら戻す・ハサミで切る・時間は最後まで続く・100% を説明する/5ページ目の絵に鋼の刃と輪の持ち手のハサミがある。
- PU-14d の禁止語から「戻す」を外した (T2-18c で説明に使うため)。
- 全体: 1149 passed | 11 skipped。check 0・build 0。version 0.3.26 → 0.3.27。

## 2026-10-07 T2-19a: 1本の帯を巻く時間を 6 割に (version 0.3.31)

仕様: docs/04_tasks/P2/T2-19.md の T2-19a (管理者の実機確認 2026-10-07「ゲーム時間が長い」)。

### 直したこと
- `params.ts` の `SECTION_LENGTH` を 400 → **240** (0.6 倍。pedal 50 の速さで 20 秒 → 12 秒)。速さの式は変えず、制限時間の計算 (範囲の 60% の張りで巻いた時間 + 帯ごと 5 秒) も今のまま (帯が短くなった分だけ自動で短くなる)。

### テスト (先に RED を確認)
- 同じペダル (50) で 1本の帯を巻き終える時間が 今までの 20 秒 × 0.6 = 12 秒 (±5%) になる (RED: 実際 20.0 秒 → GREEN: 12.0 秒)。
- 巻き量の計算が新しい長さで 100% になる。
- 既存テストの調整: panel.test の 100% の長さを SECTION_LENGTH から計算する形に。logic.test の制限時間のテストの許容差を tick の刻み × 帯数 (100ms × 3) に (帯の時間が短くなったため刻みの丸めが相対的に大きくなった)。
- 全体: 1158 passed | 11 skipped。check 0・build 0。version 0.3.30 → 0.3.31 (pull --rebase のあと main が 0.3.30 になっていたため大きい方の次の patch に)。

## 2026-10-07 T2-19b: 100% になったとき帯留めを「左から 40%」の位置で止める (version 0.3.32)

仕様: docs/04_tasks/P2/T2-19.md の T2-19b (管理者「100% になったとき、帯留めがドラムの裏側になることがある」)。

### 直したこと
- `geometry.ts` に `rodStopTurn(drumAngle)` を新設: 竿の x = 中心 + 半径 × sin(drumAngle + PIN_ANGLE0) が「左の端 + 幅 × 0.4」(sin = −0.2・手前側 cos > 0) になる角度へ、今の角度から**次にその角度に来るまでの量** (0 以上・逆回りなし) を返す。`PIN_ANGLE0` を renderer.parts から geometry へ移し、renderer.parts は再 export (controller.test などの import はそのまま)。
- controller のピン回し (100% のあと 0.8 秒・ease-in-out) を**速度ベースから位置ベースに変えた**: drumAngle = 開始角度 + 目標の量 × ease。前の形は角速度の積分で目標に届かない (丸めのずれ) ことがあり、位置を直接決めるので**ぴったり止まる**。0.8 秒は PIN_TURN_MS (0.6〜1 秒のまんなか) のまま。
- そのあとのハサミ・結ぶ動きは今のまま (竿はその位置のまま)。

### テスト (先に RED を確認)
- geometry.test: 12 通りの drumAngle から回った先の竿の x が「左の端 + 幅 × 0.4」(差 1 以下)・手前側 (cos > 0)・回る量 0 以上/すでにその位置なら 0。(RED: rodStopTurn が無い → GREEN)
- controller.test: 巻き残り 30/90/150 の 3 通りで 100% にして、止まったあとの竿の x が同じ位置 (差 1 以下)・手前側/ピン回しのあいだ drumAngle が増え続ける (逆回りなし)。(RED: ずれる → GREEN)
- 全体: 1167 passed | 11 skipped。check 0・build 0。version 0.3.31 → 0.3.32。
## 2026-10-07 T2-19c: 手応え (ペダルを固定したままでは勝てない) (version 0.3.33)
- pedal.ts: 流れの向きを数秒ごとに乱数で決めた間隔で反転する (flipEveryMinSec/flipEveryMaxSec・向きは状態に持つ)。指定がないときは今までどおり (ビーム巻きは変えない)
- params.ts: 流れの幅 ±16/±18/±24・引っかかりのしやすさ 1.5 倍 (0.03/0.06/0.09)・ぶれ ±7/±7/±8 (速さ 3/秒)・巻き進むほどの上昇 +8/+11/+14。幅とぶれは 20 通りの種のテストに合わせて調整 (±12 のままでは初級が固定でも 6 割以上入った)
- logic.ts: 張りに「巻き進むほどの上昇」を足す (帯の 0%→100% で TENSION_RISE。帯が変わると戻る)
- tutorial.ts: 3ページ目に「張りはひとりでに上下し、巻き進むほど少しずつ上がる」を 1 文追加
- テスト: 20 通りの種の平均で「真ん中に固定なら 6 割未満・うまい追いかけ方なら 9 割以上」を 3 レベルずつ確かめる。切れやすくなったため、切れたらつないで巻き直す形にテストのヘルパーも更新 (windCenter)
## 2026-10-07 T3-04 ブラウザ確認 (5つの大きさ・文字の大きさ最大) + 操作欄のはみ出し直し (version 0.3.34)
- T3-04 の完了条件にあった「5つの大きさを文字の大きさ最大で(読み込み直して測る)」が記録に無かったため実施。ビーム巻きのレバーの段階 (幅合わせ→巻き始める→お知らせを消す) で、412×915・915×412・880×700・700×880・1180×820 の5つを、fontScale 5 (IndexedDB の settings を種入れして読み込み直し) で計測。
- 発見: 700×880 だけ操作欄 (.game-frame__panel) の下端が 888px と画面 (880px) の外に 8.4px 出ていた (巻き量 95% で「確認」が出るとボタンが切れる)。ほかの4つは はみ出し 0・縦横スクロール 0・64px 未満のボタンなし。
- 直し (base.css・ビーム巻きだけ :has(.beaming-panel) で限定): 縦長で操作欄が収まらないときは盤面の列 (.game-frame__stage-col/.game-frame__stage) を縮めて操作欄を収める。直後の計測: 5つとも はみ出し 0・縦横スクロール 0・64px 未満のボタンなし。
- テスト 1172 passed (11 skipped)・check 0・build OK (CSS の直しなので計測が確認を兼ねる)。

## 2026-10-08 (ルビー) T2-20a: ドラム巻きの揺れとスパイクを作り直した (管理者の仕様)

- params.ts: 揺れの決まり (3秒のまち・限界は範囲の幅の半分・上がり/戻り 1〜2秒・あいだ 1〜3秒・大きさは限界の40〜100%) とスパイクの決まり (+15〜25を0.5秒・ペダルを10下げたら0.5秒で戻る・2秒で切れる・あいだ5秒以上・レベル1は0〜1回/2は1回/3は1〜2回) を追加。DRIFT・NOISE_AMP・TENSION_RISE・SNAG_BREAK_MARGIN・SNAG_GRACE_MS を削除
- logic.ts: 揺れ (qty 0→峰→0。戻る先は今のペダルの位置) とスパイクを状態に持たせ、張り = ペダルの位置 + 揺れの量 + スパイクの量 にした。範囲の外では揺れない。切れるのはスパイクの猶予だけ (レート切れ・引っかかりの猶予切れは廃止)。帯の始まりから3秒は揺れもスパイクも無し
- logic.test.ts: T2-20a のテスト8件 (揺れの形・範囲外・3秒のまち・真ん中固定でスパイク無しの時間は範囲内100%を種20通り・スパイクの戻しと2秒切れ・回数と5秒あき・旧式の廃止) をテスト先に追加。T2-19c の固定ペダル6割未満のテストなど旧式のテストを削除・書き換え
- controller.test.ts・renderer.test.ts: 切れの作り方をスパイク強制に統一
- version 0.3.35 → 0.3.36

## 2026-10-08 (ルビー) T2-20b: ドラム巻きの制限時間と遊び方を管理者の仕様に合わせた

- logic.ts: 帯ごとのスパイクの回数を範囲 (ranges) に持たせ、制限時間 = 範囲の真ん中のペダルで巻いた時間 + 1.5秒 (ペダルを踏む) + 3.5秒 (ハサミで帯の端を結ぶ) + スパイク1回 2秒。TIME_ANCHOR をやめた
- logic.test.ts: 制限時間のテストを新しい式に書き換え (真ん中のペダルで巻いた時間 = 制限時間 − 5秒×帯数 − 5秒×帯数 − スパイク×2秒)
- tutorial.ts: 遊び方の3ページ目 (揺れ: 3秒たつとペダルの位置を中心に緑の範囲の半分まで上下) と4ページ目 (スパイク: 10以上下げて戻す・2秒で切れる) の文と図のラベルを変えた。00_rules どおり遊び方を確かめた (文と図を読んで画面の見た目と一致)
- version 0.3.36 → 0.3.37
