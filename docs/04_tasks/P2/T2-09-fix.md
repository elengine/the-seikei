# T2-09 追加修正:引っかかりのメッセージが出ない、糸量による +4 が残っている

- 目的:確認役が T2-09a(`0e5390f`、報告 `42850b9`)を確かめて見つけた点を直す。
- 前提:T2-09b(T2-09b の後、T2-08 追加修正2 の前に行う)
- 出どころ:確認役の確認(2026-09-30、コードとテストを読んだ)。
- 進め方:1つのコミット。テストを先に書いて RED を確認してから直す。

## 変更してよいファイル

`src/games/winding/messages.ts`、`src/games/winding/controller.ts`、`src/games/winding/controller.test.ts`、`src/games/winding/logic.test.ts`、`src/games/winding/params.ts`、`PROGRESS.json`、`docs/progress_log.md`

## 1. 引っかかりのメッセージが、画面に出ない(不具合)

- 原因:
  - `snagRaised` は、引っかかった瞬間の1回の tick のあいだだけ true になる。
  - controller の `updateMessage` は、phase が 'winding' のときの文を**すべて** `MESSAGE_HOLD_MS`(500ms)待ってから切り替える。引っかかりの文も待たされる。
  - 次の tick で文が張りの文に戻るので、500ms 続くことがなく、引っかかりの文は一度も表示されない。
  - T2-09 の仕様にあった controller.test.ts の「引っかかりのメッセージが出る」のテストが無い。
- 直し方:
  - 引っかかりの文は、**引っかかりが戻りきるまで(`s.pedal.snag > 0` のあいだ、最大2秒)** 出し続ける。`messageFor` は `s.snagRaised` ではなく `s.pedal.snag > 0` を見る。
  - 引っかかりの文は、**待たずにすぐ表示する**(糸が切れたときと同じ扱い)。待つのは張りの3文(適正・強すぎ・弱め)だけ。
  - 引っかかりが戻ったあとの張りの文は、今までどおり 500ms 待ってから切り替える。
- テスト(`controller.test.ts`。偽の rAF と、引っかかりを起こす種か、State を直接作る方法で):
  - 引っかかった tick の直後に、メッセージ欄が「糸が引っかかりました。張りに注意してください」になる。
  - 1秒後もその文のまま。
  - 引っかかりが戻りきって 500ms 以上たつと、張りの文に戻る。

## 2. 糸量による「+4」が残っている

- T2-09 の仕様「これまでの『progress による +4』はやめて、この流れに置き換える」のとおりにする。`params.ts` の `TENSION.yarnDrift` を 0 にする(`pedal.ts` の計算式は、ビーミングでも使うので残してよい)。
- テスト(`logic.test.ts`):ペダル・ぶれ・流れ・引っかかりが同じなら、progress 0 と progress 0.9 で張りが同じ。

## ブラウザ確認(本番と同じビルド、ポートは固定)

- 上級で巻き、引っかかりが起きたときに、メッセージが2秒ほど「糸が引っかかりました。張りに注意してください」になる。スクリーンショットを添える。

## 完了条件

- `npm run check`・`npm test`・`npm run build` が成功する(報告の直前に実行する)。CI が success。`git status` に余計なファイルが無い。
- 結果を Discord と `docs/progress_log.md` に報告した(コミットの番号を書く)。
