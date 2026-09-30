# T2-05 追加修正:盤面の描き方を、座標の変換と決まりに合わせる

- 目的:T2-05 の盤面の描画(`renderer.ts`)は、このままでは画面の大きさが変わると正しく描けない所と、プロジェクトの決まりに合わない所がある。画面の組み立て(T2-07)の前に直す。
- 前提:T2-06
- 出どころ:確認役が T2-05(`1d98ec4`、報告 `b7a6cb3`、追し `a7ca577`)のコードを読んで見つけた(2026-09-30)。
- 進め方:1つのコミット。テストを先に書いて RED を確認してから直す。

## 変更してよいファイル

`src/games/winding/renderer.ts`、`src/games/winding/renderer.test.ts`、`src/games/winding/renderer.test.helpers.ts`、`src/games/winding/geometry.ts`(必要なら)、`PROGRESS.json`、`docs/progress_log.md`

## 直す点

1. **座標の変換が無い(一番大事)。** いまの `drawBoard` は、`strokeRect(CREEL_AREA.x, …)` のように論理座標(1000×750)の値をそのまま Canvas に描いている。`toPx` も、Canvas の変換(`translate`・`scale`)も使っていないので、画面の大きさに合わせて縮まない。
   - 直し方:論理座標で描く部分は、`drawBoard` の中で `ctx.save()` → `ctx.translate(fit.offsetX, fit.offsetY)` → `ctx.scale(fit.scale, fit.scale)` をしてから描き、描き終えたら `ctx.restore()` する。線の太さなど「画面上で N px」にしたいものは、今までどおり `fontPx(fit, N)`(論理の大きさに直す)を使う。
   - 背景(kinari)は、変換の前(`save` の前)に、Canvas の画面上の大きさ(`clientWidth`・`clientHeight`。0 のときだけ `width`・`height`)で塗る。
2. **文字の位置が、画面の大きさで変わらない決め打ちになっている。** 「帯 3 / 5」は `(510, 62)`、「停止」は `(648, 62)` の画面 px に固定されている。412×915 のように盤面が狭いと画面の外に出て見えない。
   - 直し方:文字は、変換を戻したあと(`restore` の後)に、**論理座標の点を `toPx` で画面の点に直して**描く。文字の大きさは画面 px(20px 以上)。例:「帯 3 / 5」は目盛り盤の右、「停止」は赤ランプの右。
3. **色を直書きしている。** `renderer.ts` の先頭で、tokens と同じ色の表(`C`)を書き写している。
   - 直し方:`core/ui/tokens.ts` の `COLORS` を import して使う。`renderer.ts` に `#` で始まる色の値を書かない(糸の色は内容データの `hex` を使うので、それはよい)。
4. **書体を直書きしている。** `ctx.font` が `px sans-serif` になっている(T1-11 で決めた書体と違う)。
   - 直し方:`core/ui/tokens.ts` の `FONT_FAMILY` を使う。
5. **速さの計算が二重になっている。** 流れる印の速さを `(s.pedal.pedal / 100) * 40` と、ここでも計算している。
   - 直し方:`core/mechanics/pedal.ts` の `speedOf` と、`params.ts` の `TENSION` を使う(`40` を直書きしない)。
6. **`npm run check` が失敗している。** 確認役の環境で、使っていない変数(`toPx`、`i`、`s`)の3件のエラーが出た。GitHub の自動テスト(CI)も、`b7a6cb3` と `a7ca577` で失敗している。T2-05 の報告には「check エラー0」とあったが、実際には失敗していた。
   - 直し方:上の 1〜5 を直したうえで、`npm run check` を**報告の直前に**実行し、エラーが0であることを確かめる。push のあと、CI が success になったことも確かめてから報告する。

7. **(T2-06 の件)ペダルの横木が、状態に合わせて戻らない。** 操作欄の `update(s)` は、ペダルの押せる・押せないは切り替えるが、横木の位置(`pedal.setValue`)を状態に合わせていない。糸が切れた瞬間・帯を巻き終えたとき・裏に回ったときに、ルールではペダルが 0 になるのに、画面の横木は元の位置に残る。
   - 直し方:`src/games/winding/panel.ts` の `update(s)` で `pedal.setValue(s.pedal.pedal)` を呼ぶ(`setValue` は onChange を呼ばないので、繰り返しにはならない)。
   - テスト(`src/games/winding/panel.test.ts`):ペダル 60 の状態で update したあと、ペダル 0 の状態で update すると、表示の数字が「速さ 0」になる。
   - このため、`src/games/winding/panel.ts` と `panel.test.ts` も変更してよい。

## テスト(renderer.test.ts。偽の ctx に `save`・`restore`・`translate`・`scale` の記録を足す)

1. `drawBoard` の中で `save` → `translate(fit.offsetX, fit.offsetY)` → `scale(fit.scale, fit.scale)` が呼ばれ、最後に `restore` が呼ばれる。
2. 「帯 1 / 3」の `fillText` は `restore` のあとに呼ばれ、その x が Canvas の画面上の幅の中にある。`fit` を 412×915 相当(scale 約 0.39)にしても、1180×820 相当(scale 約 0.7)にしても、Canvas の中に収まる。
3. `ctx.font` に `FONT_FAMILY` が含まれる。
4. 背景の `fillRect` は `save` の前に呼ばれ、大きさが Canvas の `clientWidth`・`clientHeight`。

(3 の色の直書きは、確認役がコードを読んで確かめる)

## 完了条件

- `npm run check`・`npm test`・`npm run build` が成功する。**CI が success。**
- 結果を Discord と `docs/progress_log.md` に報告した(コミットの番号を書く)。
