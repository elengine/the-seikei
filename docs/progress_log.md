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
