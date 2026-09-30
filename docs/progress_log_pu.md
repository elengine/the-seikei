# PU(見た目の統一)の進捗記録

実装担当(Claude)の報告。ルビーの記録(`docs/progress_log.md`)とぶつからないよう、PU の報告はこのファイルに書く。

## PU-01 基盤(色・余白・角、書体、ボタン)

- コミット:PU-01a `d823627`、PU-01b `7fc4749`、PU-01c `fa5200b`。
- テスト:全体 501 件成功(11 件は従来のスキップ)。`npm run check`・`npm run build` 成功。

### PU-01a:色・余白・角

- `COLORS` を 07 の 2 節どおりに(新しい色を追加、`ai`・`sumiSub`・`wood`・`shu` の値を変更)。`SPACE`・`RADIUS` を追加。`:root` に `--c-*`(ケバブ形)、`--sp-1`〜`--sp-8`、`--r-*`、`--page-pad`、`--stripe-top` を追加。
- 古い色を直書きしていたテスト 3 件(`fabricPreview.test.ts`・`creel/renderer.test.ts`・`winding/renderer.test.ts`)は、該当行だけ `COLORS.*` の参照に書き換えた(確認役の許可。仕様書に追記済み)。
- `tokens.test.ts` の変数の読み取り(`cssVars`)が数字を含む変数名(`--sp-1`)を読めなかったため、正規表現を `[a-z0-9-]` に直した。
- `--page-pad` を狭い画面で上書きする `@media` は、`base.css` の**末尾**に置いた。既存の T1-18 のテスト(最初の `@media (max-width: 599px)` を探す)が、`:root` の近くに置くとそちらを拾って落ちるため。

### PU-01b:書体

- 元の TTF は `github.com/google/fonts` の `ofl/shipporimincho`・`ofl/bizudpgothic` から取得。`scripts/subset-fonts.py`(fontTools の subset。`--flavor=woff2` 相当)で絞った。作り方と含めた文字は `public/fonts/README.md`。
- woff2 の大きさ:ShipporiMincho-Bold 1,536,152 B、BIZUDPGothic-Regular 1,529,832 B、BIZUDPGothic-Bold 1,547,632 B。**合計 約 4.4MB(8MB 未満)**。
- `@font-face` は `base.css` の先頭。`url('/fonts/…')` と書くと、Vite がビルド時に基準パスを付けて `/the-seikei/fonts/…` にする(ビルド後の CSS で確認)。
- `vite.config.ts` の `globPatterns` に `woff2` を追加。ビルド後の `dist/sw.js` の事前保存の一覧に 3 つとも入っている。
- 確認:本番と同じビルドを開き、`document.fonts` で 3 つの書体が `loaded` になること、`body` の書体が `"BIZ UDPGothic", …` であることを確認した。
- **確認できなかったこと:** 機内モード相当(オフライン)での再読み込み。内蔵ブラウザでは Service Worker が登録できなかった(`An unknown error occurred when fetching the script`)ため。事前保存の一覧に入っていることだけ確認した。実機(Fold 8)か Chrome で確かめてほしい。
- 文字を絞った影響:含めていない字は端末の標準のゴシック体で出る。

### PU-01c:ボタン

- `createButton` を仕様書の型に(`variant`・`size`・`icon`・`lockedReason`・`onLocked`・`sound`)。`setLockedReason`・`createChoice`・`setButtonSound` を追加。押せない形は `disabled` を付けず `aria-disabled` を付ける。押せない形のときは音を鳴らさず `onLocked` だけ呼ぶ。
- CSS:`.btn`(藍の 2px の枠・下に 4px の厚み・`:active` で 4px 沈む・0.1 秒)、`.btn--primary`・`--secondary`・`--danger`・`--large`・`--locked`、`.choice`。`.btn:disabled` は文字入力ダイアログの「決定」が使っているため残した。
- `boot.ts`:空の `touchstart`(passive)を1回だけ付ける。`setButtonSound` は boot では設定していない(仕様どおり。PU-03 で設定する)。
- 既存テスト 1 件を変更:`widgets.test.ts` の「variant の既定」は、以前は既定が primary だった。仕様で既定が secondary になったため、そのテストの primary 側に `variant: 'primary'` を明示した(期待値の言い換えではなく、仕様の変更に追従)。
- **見た目の影響(要注意):** `variant` を書かずに `createButton` を呼んでいた画面は、これまでの主ボタンから副ボタン(白地・藍の枠)に変わる。ホームのゲーム選択のボタンは `primary` を指定してあるので変わらない。ほかの画面の色は PU-03 以降で直す。

### 画面の確認

- 本番と同じビルド(`vite preview`、ポート 4173)のホーム画面を 1180×820 で確認。ボタンの実測:主ボタン 高さ 72px・文字 24px・藍 `rgb(31,58,95)`・影 5px、副ボタン 高さ 64px・文字 22px・影 4px。
- **完了条件のうち、次はできなかった:** 412×915 と、設定・クリール立て・ドラム巻きのスクリーンショット。内蔵ブラウザのスクリーンショットが、画面の大きさを変えると 2×2 に並んだ縮小画像になり、時間切れも多発して、見た目を判断できなかったため(ホームの寸法だけ JavaScript で測った)。スクリーンショットのファイルも保存していない。確認役の手元の環境での確認をお願いしたい。
- 作業の終わりに、内蔵ブラウザの画面の大きさを desktop に戻し、プレビューのサーバーを止めた(`node.exe` を全部止めたため、同じ PC の別の node も止まった可能性がある)。

## PU-02 共通部品

- コミット:PU-02a(見出しの行・ページ・カード・節の見出し・一覧の行・星)、PU-02b(ダイアログ・結果の画面・遊び方)。テスト 534 件成功(11 件は従来のスキップ)、`npm run check`・`npm run build` 成功。
- 新しい部品:`src/core/ui/layout.ts`(`createScreenHeader`・`createPage`・`createCard`・`createSectionHeading`・`createListRow`・`createStars`)。`widgets.ts` に `createDialogShell`(背景・箱・上端の縞・見出し。確認・入力・結果・遊び方が共通で使う)を追加。
- ダイアログ:`title` を見出し(明朝)として出す。`confirmDialog` の `title` は、今の呼び出しが通るよう**省略可**にした(仕様書の「必須」は、呼び出し側を直す PU-03〜05 で必須にする)。`textInputDialog` の `title` は今まで本文の位置に出ていたが、見出しになる。
- 結果の画面:`praise` は使わない。`lines` が文字列なら値なしの行、`homeLabel` は「一覧へ」の文字、`againLabel` は「もう一度」の文字として使い、`'home'` は `'list'` として返す(`next` が無ければ「一覧へ」が primary)。旧項目は `@deprecated` の印を付けた。星は 1 つ目がすぐ、あとは 0.3 秒ごと。動きを減らす設定ではすぐ全部。押すとタイマーを止める。
- 星:取っていない星は「☆」(色と形の両方で見分ける)。既存テスト(`gameParts.test.ts`)の「★☆☆」に合わせた。
- **変更してよいファイルの外に手を入れたもの(確認をお願いしたい)**:`src/core/ui/gameParts.test.ts` の 3 行。`showResult` の戻り値が仕様で `'list'|'again'|'next'` になったため、(1)結果を受ける変数の型、(2)「ホームへ」を押したときの期待値を `'home'`→`'list'` にした(型エラーと、仕様で決まった戻り値への追従。ほかの行は変えていない)。
- 遊び方の絵は、幅 `min(560, 画面幅の90%)` のまま(既存テストがあるため)。ダイアログより広くなる細い画面では、CSS(`max-width: 100%`、`aspect-ratio: 3 / 2`)で縮める。
- `base.css`:新しい節 `/* ---- 共通部品 (PU-02) ---- */` は末尾。`:root` に `--fs-title`・`--fs-star-*`・`--fs-result-title`・`--stripe-h` を追加(文字の大きさ「大/特大」の値)。`.dialog`・`.result*`・`.tutorial*` は元の場所で書き換えた(`.result__praise`・`.result-stars` は、T1-12 の既存テストが残しているため、「お疲れ様でした」の行と星の枠に使い回した)。
- 確認(本番と同じビルド、ポート 4174。止めるときは自分のプロセスだけ止めた):クリール立ての「遊び方」を 1180×820 と 412×915 で JavaScript で計測。ダイアログの幅 620px / 380px、見出しは Shippori Mincho、上端の縞 10px、ボタンの高さ 72px、次へ・始めるが右端、20px 未満の文字なし、横のはみ出しなし、1 ページ目に「前へ」なし、最後は「前へ」「始める」。**確認できなかったこと**:スクリーンショット(内蔵ブラウザで取れない。ファイルなし)、結果の画面と「続きから」の確認ダイアログの実画面(この画面から出すには遊び切る・途中保存が要るため。部品のテストと、同じ外枠を使う遊び方の計測で代えた)。
