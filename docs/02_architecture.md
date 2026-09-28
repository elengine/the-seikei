# 整経ゲーム アーキテクチャ設計書

| 項目 | 内容 |
|---|---|
| 文書ID | 02_architecture |
| 版 | 0.3 |
| 作成日 | 2026-09-27 |
| 前工程 | 01_requirements.md |
| 次工程 | 03_basic_design.md(基本設計) |

改訂履歴

| 版 | 内容 |
|---|---|
| 0.1 | 初版(React + SVG 構成) |
| 0.3 | ゲーム構成を工程順(クリール立て → ドラム巻き → ビーミング)に変更。糸継ぎを共有の仕組み(core/mechanics)に。 |
| 0.2 | 管理者の既存プロジェクト(neon-othello, motion-tetris-v2)で実装体制の実績がある構成に変更。React を廃止し、素の TypeScript + Canvas 2D + DOM とする。Fold 8 展開時の画面形状を訂正。効果音を合成方式に。Supabase を既存プロジェクトと共用。 |

本書は「最終形(P0〜P6)を前提にした構成」を定める。各節の末尾に、対応する要件IDを示す。

---

## 1. 設計方針

1. **ローカルファースト**:データの正本は常に端末内に置く。サーバー(P6)は端末間でデータを受け渡す中継とし、サーバーが止まってもゲームは遊べる。(NFR-A-01, FR-S-04)
2. **ロジックと描画の分離**:ゲームのルールは描画を持たない純粋な TypeScript として書き、描画はその状態を表示するだけにする。ルールはブラウザなしで自動テストできる。(NFR-M-04)
3. **差し替え可能な境界**:保存先、音、用語は決められたインターフェースの裏側に置く。後から実装を足しても、呼び出し側は変更しない。(DR-01, FR-C-04)
4. **ゲームはモジュール**:各ゲームは共通の形(GameModule)で登録し、ゲーム同士は直接参照しない。経営シミュレーションは他のゲームを GameModule 経由で呼び出す。複数のゲームで使う遊びの部品(糸切れと糸継ぎ、ペダルと張り)は `core/mechanics` に置く。(NFR-M-05, FR-G4-03)
5. **中身はデータ**:お題、柄、注文、用語はコードから分離した JSON で持つ。(NFR-M-06)
6. **実績のある構成を使う**:管理者のローカルLLM環境で完成実績のある構成(Vite + TypeScript + vite-plugin-pwa + Canvas 2D + GSAP + Supabase + GitHub Pages)を踏襲し、新しい技術の持ち込みを最小にする。(C-06)
7. **見た目は独自**:技術は既存プロジェクトに揃えるが、見た目はネオン調ではなく、うぐいす色を基調にした落ち着いたデザインとし、高齢者向けの基準(NFR-U)を優先する。

---

## 2. 技術スタック

| 用途 | 採用 | 実績 | 備考 |
|---|---|---|---|
| 言語 | TypeScript(strict) | あり | 型をインターフェースの約束として使う |
| ビルド | Vite | あり | |
| 画面(メニュー・設定・ボタン) | 素の TypeScript + DOM | あり | フレームワークは使わない。画面切り替えは自作の ScreenManager(5.4) |
| ゲーム盤面の描画 | Canvas 2D | あり | 座標変換は1関数に集約(7章) |
| アニメーション | GSAP | あり | |
| 効果音 | Web Audio による合成 | あり | 音源ファイルを持たない(素材ライセンス不要) |
| 状態管理 | 純粋関数の reducer + 小さな購読の仕組み(自作) | あり(ルールエンジン) | |
| 端末内保存 | IndexedDB(Dexie でラップ) | **なし** | 新規導入。P0 の最初のタスクで動作確認する |
| PWA | vite-plugin-pwa | あり | |
| 画面遷移 | ハッシュ方式(`#/games/creel` など) | ― | GitHub Pages で再読み込みしても404にならない |
| 単体テスト | Vitest(IndexedDB は fake-indexeddb) | あり | |
| 動作確認 | 既存プロジェクトと同じブラウザ自動操作による検証(CDP) | あり | iPad の Safari は模擬できないため、実機確認を必須とする(10章) |
| 配信 | GitHub Actions → GitHub Pages | あり | |
| 同期(P6) | Supabase(既存プロジェクトを共用) | あり | Google OAuth、RLS、RPC の実績あり |

ライブラリの追加は、本書の改訂を経てから行う。タスク仕様書で未承認のライブラリを使わせない。

---

## 3. 全体構成

```
┌──────────────────────────── 端末(PWA) ────────────────────────────┐
│                                                                  │
│  app(起動・ScreenManager・ホーム・設定・更新処理)                       │
│     │                                                            │
│     ▼                                                            │
│  games ── creel(G1)  winding(G2)  beaming(G3)  shop(G4)           │
│  zukan(G5)                     ▲ shop は他ゲームを GameModule 経由で呼ぶ  │
│     │                                                            │
│     ▼  (ゲーム・図鑑は core のインターフェースだけに依存)                  │
│  core ── domain  storage  terms  audio  ui  game  zukanRegistry    │
│          viewport  clock  mechanics(糸切れと糸継ぎ)                │
│             │                                                    │
│             ▼                                                    │
│        Repository ─┬─ LocalRepository(IndexedDB)      ← P0〜     │
│                    └─ SyncingRepository(Local + 同期)  ← P6       │
│                                   │                              │
│  content(JSON:柄・お題・注文・用語初期値)                            │
└───────────────────────────────────┼──────────────────────────────┘
                                    │ HTTPS(P6 のみ)
                          ┌─────────▼──────────────────┐
                          │ Supabase(既存プロジェクト共用)  │
                          │ Auth + Postgres(seikei_ 接頭辞) │
                          └────────────────────────────┘
```

依存の向きは「app → games/zukan → core → content」の一方向のみとする。逆向きの import はリンターで禁止する。(NFR-M-05)

---

## 4. ディレクトリ構成

```
/
├─ docs/                     設計書・タスク仕様書
├─ PROGRESS.json             進捗記録(11章)
├─ public/                   アイコン
├─ src/
│  ├─ main.ts                起動処理
│  ├─ app/                   ScreenManager、ルーティング、ホーム、設定、更新処理
│  ├─ core/
│  │  ├─ domain/             整経ドメインの型と純粋関数(糸、コーン、クリール、帯、ドラム、ビーム、柄、注文、整経機)
│  │  ├─ storage/            Repository、IndexedDB 実装、移行処理、競合解決ルール(merge.ts)
│  │  ├─ terms/              用語辞書
│  │  ├─ audio/              Web Audio による効果音の合成と再生
│  │  ├─ ui/                 DOM 部品(大きいボタン、確認ダイアログ、チュートリアル表示)とデザイン定数
│  │  ├─ game/               GameModule の型、ゲーム登録簿、結果の型
│  │  ├─ zukanRegistry/      柄を図鑑に登録する共通窓口
│  │  ├─ viewport/           画面サイズ・向きの検出(visualViewport 追従)、Canvas の解像度調整
│  │  ├─ mechanics/          複数のゲームで共有する遊びの部品(糸切れと糸継ぎ、ペダルと張り)
│  │  └─ clock/              現在時刻・乱数・ID生成(テストで差し替えるため)
│  ├─ games/
│  │  ├─ creel/              G1 クリール立て
│  │  ├─ winding/            G2 ドラム巻き
│  │  ├─ beaming/            G3 ビーミング
│  │  └─ shop/               G4 整経屋の一日
│  ├─ zukan/                 G5 図鑑画面
│  └─ content/               JSON データ
├─ tests/                    単体テスト・契約テスト・回帰テスト
└─ supabase/                 (P6)テーブル定義・RLS・RPC の SQL
```

各ゲームのフォルダは次の形にそろえる。タスク仕様書はこの単位でファイルを指定する。

```
games/creel/
├─ index.ts         GameModule の定義(外部に公開するのはこれだけ)
├─ logic.ts         ルール(純粋関数・reducer)。DOM・Canvas に触れない
├─ logic.test.ts    ルールの単体テスト
├─ geometry.ts      論理座標 ⇔ 画面座標の変換(7章)
├─ geometry.test.ts 変換の往復テスト
├─ renderer.ts      Canvas への描画。状態を受け取って描くだけ
├─ controller.ts    タップ等の入力を logic の action に変換し、描画を呼ぶ
└─ tutorial.ts      チュートリアルの内容
```

---

## 5. 主要インターフェース

型の詳細は基本設計で確定する。ここでは境界の形だけを定める。

### 5.1 GameModule(NFR-M-05, FR-G4-03)

```ts
type GameId = 'creel' | 'winding' | 'beaming' | 'shop';

interface GameModule {
  id: GameId;
  titleTermKey: string;          // 表示名は用語辞書から引く
  phase: 'P1' | 'P2' | 'P3' | 'P5';
  embeddable: boolean;           // 経営シミュレーションから呼べるか
  tutorial: TutorialSpec;
  mount(container: HTMLElement, props: GameProps): GameInstance;
}

interface GameProps {
  mode: 'standalone' | 'job';    // 単独プレイか、経営シミュレーションの仕事か
  job?: JobSpec;                 // mode='job' のときの注文内容(本数・長さ・柄など)
  resume?: unknown;              // 途中保存からの再開データ
  onFinish: (result: GameResult) => void;
  onExit: () => void;            // 途中でホームへ戻る
}

interface GameInstance {
  suspend(): unknown;            // 途中保存用に現在の状態を返す
  unmount(): void;               // イベント・タイマー・アニメーションをすべて解除
}
```

P1 の時点から `mode: 'job'` を受け取れる形で作る。経営シミュレーション(P5)の追加時に、既存ゲームを書き換えずに済ませるためである。

### 5.2 Repository(DR-01〜DR-05)

```ts
interface Repository {
  get<T>(collection: CollectionName, id: string): Promise<Rec<T> | undefined>;
  list<T>(collection: CollectionName): Promise<Rec<T>[]>;   // 削除済みは含めない
  put<T>(collection: CollectionName, data: T, id?: string): Promise<Rec<T>>;
  remove(collection: CollectionName, id: string): Promise<void>; // 論理削除
  subscribe(collection: CollectionName, cb: () => void): () => void;
  exportAll(): Promise<BackupFile>;                          // FR-C-09
  importAll(file: BackupFile): Promise<ImportReport>;        // 競合解決ルールで統合
}

interface Rec<T> {
  id: string;             // UUID v7(時刻順に並ぶ)
  collection: CollectionName;
  data: T;
  createdAt: string;      // ISO 8601, UTC
  updatedAt: string;
  updatedBy: string;      // 端末ID
  deletedAt?: string;     // 論理削除
  schemaVersion: number;
}
```

- `id`、日時、端末IDの付与は Repository が行い、ゲーム側は `data` だけを扱う。
- 競合解決ルール(DR-06)は `core/storage/merge.ts` に純粋関数として P0 で実装する。P0 ではバックアップの読み込み(FR-C-09)でこの関数を使うため、同期を作る前から実際に動き、テストされる。これが P6 追加時のデグレ防止の要になる。
- 契約テスト(DR-05)は `tests/contract/repository.contract.ts` に、実装を引数に取る形で書く。P0 は LocalRepository、P6 は SyncingRepository を渡して同じテストを流す。

### 5.3 その他の境界

| 窓口 | 役割 | 対応要件 |
|---|---|---|
| `terms.t(key)` | 用語辞書から表示名を返す。利用者の上書きを優先 | FR-C-04 |
| `audio.play(name)` | 合成した効果音を鳴らす。設定のオン/オフと音量に従う | FR-C-05 |
| `zukanRegistry.unlock(patternId, source)` | 柄の入手を記録。重複は無視 | FR-G5-02 |
| `viewport.onChange(cb)` | 画面サイズ・向き・レイアウト種別の変化を通知 | NFR-U-07 |
| `clock.now() / clock.random() / clock.uuid()` | 時刻・乱数・ID。テストでは固定値に差し替える | NFR-M-04 |

### 5.4 ScreenManager

フレームワークを使わないため、画面の切り替えを1か所で管理する。

```ts
interface Screen {
  mount(container: HTMLElement, params: Record<string, string>): void;
  unmount(): void;
}
// ScreenManager はハッシュの変化を監視し、前の画面の unmount を必ず呼んでから次の画面を mount する。
```

イベントリスナー・タイマー・GSAP のアニメーションの解除漏れは、画面を行き来するうちに動作が重くなる原因になる。解除は各 Screen / GameInstance の unmount の責任とし、画面テストで「ホームとゲームを10往復しても動作が変わらない」ことを確認する。

---

## 6. データの保存と移行

| コレクション | 内容 | 競合ルール(DR-06) |
|---|---|---|
| settings | プレイヤー名、屋号、文字サイズ、音 | 項目ごとに新しい方 |
| terms | 用語の上書き | 項目ごとに新しい方 |
| zukan | 柄ごとの入手状況 | 和(入手済みを優先) |
| records | ゲームごとのベストスコアなど | 大きい方 |
| sessions | 途中保存(各ゲームの進行中データ) | 新しい方 |
| shop | 経営シミュレーションの進行 | 新しい方 |
| memories(P6) | 家族が追加した写真・メモ | 両方残す |

- 端末IDは初回起動時に生成して保存する。
- スキーマの版が上がる場合は `core/storage/migrations/` に「版N→N+1」の移行関数を1ファイルずつ追加し、移行前後のデータを使ったテストを必ず付ける。(DR-04)
- 起動時に `navigator.storage.persist()` を呼び、端末内データを消去されにくくする。(8.2 参照)

---

## 7. 描画の規則

既存プロジェクトで効果のあった「座標変換を1つの純関数に集約する」設計を、全ゲームの必須規則とする。

- 各ゲームの盤面は固定の論理座標系(例:幅1000×高さ750)で考える。ロジックと描画は論理座標だけを使う。
- 論理座標から画面座標への変換は `geometry.ts` の `toPx()` だけが行い、タップ位置の逆変換は同じファイルの `fromPx()` だけが行う。他のファイルで拡大率やオフセットを計算してはならない。
- `toPx()` と `fromPx()` は往復して元に戻ることを単体テストで確認する。
- Canvas は端末の画素密度(devicePixelRatio)に合わせて内部解像度を設定し、文字や線をにじませない。処理は `core/viewport` に共通化する。
- 文字の大きさ(NFR-U-01)は画面座標で保証する。盤面が縮小されても、盤面内の文字は最小サイズを下回らないよう、盤面外の DOM に出すか、描画時に下限を設ける。

---

## 8. PWA と配信

### 8.1 配信の流れ

1. main ブランチへの push で GitHub Actions が起動する。
2. 型検査、リンター、単体テストを実行する。
3. すべて合格した場合のみ、ビルドして GitHub Pages へデプロイする。

リポジトリ名のサブパス(`https://<user>.github.io/<repo>/`)で公開されるため、Vite の `base`、マニフェストの `start_url` と `scope` をサブパスに合わせる。

### 8.2 端末内データを守るための運用

- iPad の Safari は、サイトを一定期間使わないと保存データを消去する仕組みを持つ。ただしホーム画面に追加した Web アプリは Safari とは別に数えられ、使っている限り消去されない旨が WebKit から説明されている。**父には必ずホーム画面のアイコンから起動してもらう**(セットアップは管理者が行う)。
- iPadOS 17 以降では永続化の要求(`navigator.storage.persist()`)に対応しており、永続化された保存領域は容量逼迫時の消去対象から外れる。
- それでも消える可能性に備え、管理者がバックアップを書き出せるようにする(FR-C-09)。P6 以降は同期が保険を兼ねる。

### 8.3 更新の反映(NFR-A-02)

- Service Worker は新しい版を裏で取得し、**アプリの次回起動時**に切り替える。遊んでいる最中には再読み込みしない。
- 切り替え前に保存データの移行処理を実行する。移行に失敗した場合は旧データを残したまま、管理者向けのエラー表示を出す。

### 8.4 音の再生

- iPad の Safari では、利用者が画面に触れるまで音を鳴らせない。最初のタップ(ホーム画面のボタンなど)で音声の再生を有効化する処理を `core/audio` に置く。

---

## 9. 画面サイズへの対応(NFR-U-07)

レイアウトは縦横比で2種類に分け、`core/viewport` が visualViewport の変化に追従して判定する。

| レイアウト | 条件 | 該当する画面 | 配置 |
|---|---|---|---|
| 横長 | 幅 ≧ 高さ | iPad Air(横)、Galaxy Z Fold 8 展開時(約4:3の横長)、スマホの横向き | 2カラム(左に盤面、右に操作・情報) |
| 縦長 | 幅 < 高さ | POCO X7 Pro、Fold 8 折りたたみ時、iPad Air(縦) | 1カラム(上に盤面、下に操作・情報) |

- 盤面は論理座標を画面に合わせて拡大縮小する(7章)ため、レイアウトごとの座標計算は不要。
- Fold の開閉や回転で画面サイズが変わっても、進行中の状態は失わない(状態は描画ではなく reducer と Repository に持つ)。
- 最低対応バージョンは iPadOS 17 以降、Android は Chrome の最新版とその1つ前の版とする。

---

## 10. 品質保証

| 種類 | 対象 | 実行 |
|---|---|---|
| 型検査・リンター | 全体(依存方向の違反を含む) | `npm run check` |
| 単体テスト | domain、各ゲームの logic.ts と geometry.ts、merge.ts、移行処理 | `npm test` |
| 契約テスト | Repository の各実装 | `npm test` |
| 回帰テスト | 管理者から指摘された不具合(1件につき1本) | `npm test` |
| ブラウザ検証 | 起動、ホーム、各ゲームを1回クリア、設定変更、バックアップ、Fold 相当の画面サイズ変更 | 既存プロジェクトと同じ CDP による検証 |
| 実機確認 | 父の iPad Air、POCO X7 Pro、Galaxy Z Fold 8 | 各フェーズ完了時に管理者が実施。iPad は CDP で検証できないため必須 |

- タスクの完了条件は「関連するテストがすべて合格すること」とする。実装担当は `npm run check` と `npm test` の結果を報告する。
- 管理者が不具合を指摘した場合、修正タスクには「まず不具合を再現する回帰テストを書き、失敗を確認してから直す」手順を含める。

---

## 11. 実装体制に合わせた取り決め(C-06, NFR-M)

- タスク仕様書は `docs/04_tasks/` に置き、Discord では「00_rules.md と T0-xx.md を読んで実行」という定型文だけを送る。変更ファイルは原則1〜4個(テストを含む)。
- 各タスクに、必要なインターフェース定義(型)を仕様書内にそのまま貼る。実装担当に他ファイルを探させない。
- 先に型とテストを用意し、実装担当はテストを通すコードを書く、という順序を基本とする。
- 1ファイル 300 行を超えそうな場合は、仕様書の段階で分割する。
- リポジトリ直下の `PROGRESS.json` に、現在のフェーズ、完了したタスクID、未解決の注意点を記録する。実装担当はタスク開始時に読み、終了時に更新する。形式は基本設計で定める。

---

## 12. 同期(P6)

### 12.1 構成

- 既存の Supabase プロジェクト(オセロ・テトリスと共用)に同居させる。テーブル・関数には `seikei_` 接頭辞を付け、既存のものと衝突させない。無料プランの稼働プロジェクト数の制限に影響しない。
- テーブル `seikei_records` に端末の Rec をそのまま保存する(user_id, collection, id, data(jsonb), updated_at, updated_by, deleted_at, schema_version)。
- 行レベルセキュリティ(RLS)で `user_id = auth.uid()` の行だけ読めるようにする。書き込みは RPC(`seikei_push_records`)経由に限定し、クライアントから直接の更新はさせない(既存オセロと同じ方式)。家族の閲覧・追加(FR-S-05, FR-G5-05)は、共有用テーブルと RLS を後から追加する。
- Supabase では2026年5月末以降、Data API で使うテーブルに明示的な権限付与(GRANT)が求められるため、SQL には GRANT を必ず含める。
- 同期は「前回以降に更新された Rec を送る → 相手側の更新を受け取る → merge.ts で統合する」の繰り返しとし、統合は端末側で行う。

### 12.2 ログイン方式(FR-S-02, TBD-05)

- ローカルファーストのため、**アカウントがなくても最初から全機能で遊べる**。Supabase の匿名ログインは使わない(匿名ユーザーは別の端末から同じアカウントに入れず、端末間共有の目的に合わないため)。
- 同期を始めるときに、各端末で一度だけ Google ログインする(既存プロジェクトの Google OAuth 設定を流用)。セットアップは管理者が行う。
- iPad のホーム画面から起動した状態でログインの画面遷移が戻らない場合に備え、メールで届く6桁のコードを入力する方式を代替手段として用意する。
- ログイン後、端末内の既存データを merge.ts で統合してから送信する。

### 12.3 無料枠への対応(NFR-C-01, NFR-C-02)

- Supabase の無料プロジェクトは、1週間アクセスがないと休止される。休止を防ぐ設定は Supabase 側にはなく(有料プランのみ)、外部から定期的にアクセスする必要がある。
- 2026-09-27 時点で、既存の neon-othello と motion-tetris-v2 には休止対策の仕組みはない(ワークフローはデプロイ用のみ)。
- 対策として、1日1回、軽い読み取り専用の RPC(`seikei_ping()`)を呼ぶ。呼び出し元は次のいずれかとし、P6 着手時に決める。
  - GitHub Actions の定期実行。ただし公開リポジトリの定期実行は、リポジトリに60日間更新がないと自動で無効化されるため、無効化されない工夫(定期的な自動コミット等)が必要。
  - 無料の外部監視サービス(UptimeRobot 等)。
- 共用プロジェクトのため、この対策はオセロ・テトリスの休止防止も兼ねる。
- 万一休止しても、ローカルファーストのためゲームは遊べ、同期だけが止まる。
- 無料枠の条件は変わることがあるため、P6 着手時に最新の条件を再確認する。

---

## 13. 未決事項の扱い

| ID | 状態 |
|---|---|
| TBD-01 | 本書 12.3 で方針決定。P6 着手時に最新条件を再確認 |
| TBD-03 | 解決(本書 9 章) |
| TBD-05 | 本書 12.2 で方針決定。P6 着手時に iPad 実機で検証 |
| TBD-06 | 効果音は合成方式で解決。盤面の絵も Canvas で描画するため画像素材は原則不要。アプリのアイコンのみ基本設計で扱う |
| TBD-02, 04 | 基本設計で扱う |

## 参考

- 管理者の既存プロジェクト:neon-othello、motion-tetris-v2(構成・Fold 対応・座標変換の集約・回帰テスト運用・PROGRESS.json)
- Supabase: Project Pausing / Pricing / Anonymous Sign-Ins(公式ドキュメント)
- WebKit のストレージ方針(ホーム画面の Web アプリの扱い、iPadOS 17 以降の Storage API 対応)
