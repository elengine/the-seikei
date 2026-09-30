# T2-10 追加修正:ドラムの桟が少ない、回る速さ、台が隠れる、controller のテスト

- 目的:確認役が T2-10(a `d1147a3`・`493d95d`、b `ed437eb`・`8df5028`、報告 `015c941`)を確かめて見つけた点を直す。
- 前提:T2-10
- 出どころ:確認役の確認(2026-09-30、本番と同じビルド、1180×820)。
- 進め方:1つのコミット。テストを先に書いて RED を確認してから直す。**push の前に `npm run check` を実行し、エラーが 0 であることを確かめる**(T2-08 追加修正2 から T2-10 まで、最初の push が毎回 lint の誤りで CI に落ちている)。

## 変更してよいファイル

`src/games/winding/renderer.parts.ts`、`src/games/winding/renderer.ts`、`src/games/winding/renderer.test.ts`、`src/games/winding/geometry.ts`、`src/games/winding/geometry.test.ts`、`src/games/winding/params.ts`、`src/games/winding/controller.ts`、`src/games/winding/controller.test.ts`、`PROGRESS.json`、`docs/progress_log.md`

## 1. 桟が少なく、ドラムがかごに見えない

- 確かめたこと:`SLAT_COUNT = 10` なので、正面に見える桟は 3〜4 本だけ。胴のほとんどが灰緑の面になり、「桟を組んだかご状の胴」(FR-G2-01)に見えない。T2-10 の前は 12 本ほど見えていた。
- 直し方:`SLAT_COUNT` を **24** にする(正面に 10〜12 本見える)。`params.ts` に置いてもよい。
- テスト:`drumAngle` 0 で、今の帯の区画に描かれる桟の `fillRect` が 10 本以上。

## 2. 回る速さが遅い

- 確かめたこと:`DRUM_TURN_PER_SPEED = 0.1` なので、ペダル 50(速さ 20)で 1 秒に 2 ラジアン(約 0.3 回転)。T2-10 の仕様の目安(約 0.8 回転)より遅く、回っているのが分かりにくい。
- 直し方:`DRUM_TURN_PER_SPEED` を **0.25** にする(ペダル 50 で 1 秒に 5 ラジアン ≒ 0.8 回転)。
- テスト(`controller.test.ts`、下の4と一緒に):ペダル 50 で 1 秒進めると、`drumAngle` が 4.5〜5.5 増える。

## 3. 台と筬が、ドラムの縦木に重なって隠れる

- 確かめたこと:T2-10a で筬と台を右へ動かした(`REED_X` 520、`TABLE_AREA.x` 430)ため、台の右半分と脚が、ドラムの左の縦木(ピンの横木)の下に隠れる。台がほとんど見えない。
- 直し方:台(脚を含む)の右の端と、ドラムの左の縦木の左の端のあいだを、論理座標で **20 以上** あける。筬は台の上の中央。切れ端(x 290・360)と、まっすぐ横に進む区間は変えない。必要なら、筬と台を少し左へ戻すか、台の幅を狭める。
- 縦木の左の端は、今は renderer の中で計算している。`geometry.ts` に定数(例:`PIN_RAIL_X`)として置き、renderer もそれを使う。
- テスト(`geometry.test.ts`):`TABLE_AREA.x + TABLE_AREA.w + 20 ≤ ドラムの縦木の左の端`。`REED_X` は台の左右の端のあいだ。台の左の端は、ドラム側の切れ端(x 360)より右。

## 4. controller のテストが無い

- T2-10 の仕様で求めた `controller.test.ts` のテストが足されていない。次を足す:
  - ペダルを踏んで巻いているあいだは、偽の rAF で進めると、renderer に渡す `drumAngle` が増える(`drawBoard` の呼び出しの引数で確かめる)。
  - 糸が切れたあと・ペダル 0 のあいだは増えない。

## ブラウザ確認(本番と同じビルド、ポートは固定)

- 1180×820 と 412×915:ドラムの桟が 10 本以上見え、ペダルを踏むと、はっきり回って見える。台と筬が、ドラムに隠れずに見える。スクリーンショットを添える。

## 完了条件

- `npm run check`・`npm test`・`npm run build` が成功する(**push の前に** 実行する)。CI が success。`git status` に余計なファイルが無い。
- 結果を Discord と `docs/progress_log.md` に報告した(コミットの番号を書く)。
