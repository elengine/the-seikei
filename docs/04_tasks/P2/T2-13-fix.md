# T2-13 追加修正:ドラムの左右の端で羽の側面が太すぎる

- 目的:確認役が T2-13a(`a87ce27`、報告 `8824c42`)を画面で確かめて見つけた点を直す。
- 前提:T2-13
- 出どころ:確認役の確認(2026-10-03、本番と同じビルド、1180×820)。
- 進め方:1つのコミット。テストを先に書いて RED を確認してから直す。**push の前に `npm run check` を実行し、エラー 0 を確かめる。**

## 変更してよいファイル

`src/games/winding/renderer.parts.ts`、`src/games/winding/renderer.test.ts`、`src/games/winding/params.ts`、`PROGRESS.json`、`docs/progress_log.md`

## 直すこと

- 確かめたこと:ドラムの左右の端に近い板で、羽の側面(厚み)が板の幅いっぱいほどに太く描かれ、ドラムの両端が茶色の太い帯に見える。写真では、端に近い板の厚みが少し見える程度。
- 直し方:側面の幅の上限を、**板の幅の 40%** にする(`WING_SIDE_MAX_RATIO = 0.4` を `params.ts` に置く)。側面の幅 = 板の幅 × `WING_SIDE_MAX_RATIO` × `|sin θ|`。側面の色は、板より少し暗い木の色(今のまま)。
- テスト(`renderer.test.ts`):どの角度でも、側面の `fillRect` の幅が、板の幅の 40% 以下。正面の中央に近い板より、端に近い板のほうが側面が太い(今のテストを保つ)。

## 完了条件

- `npm run check`・`npm test`・`npm run build` が成功する(**push の前に**実行する)。CI が success。`git status` に余計なファイルが無い。
- 結果を Discord と `docs/progress_log.md` に報告した(コミットの番号を書く)。
