# T1-10 追加修正:見た目の4点

- 目的:T1-10 のブラウザ確認で見つかった、見た目の4点(品番の重なり・吹き出しのあふれ・依頼書の行数・帯の番号)を直す。
- 関連要件:FR-G1-01、FR-G1-03、FR-G1-04、NFR-U-01〜06、03_basic_design 6.1(「盤面の下:いまの帯の並び」)、P1/README
- 前提:T1-10
- 出どころ:ルビーの報告(Discord のルビーのスレッド、2026-09-29 13:45)の (a)〜(d)。決めたのは確認役(この仕様書)。
- 進め方:**3つの追加修正に分け、別々のコミットにする。** 各コミットの前に、失敗を再現するテストを先に書いて RED を確認する。

| コミット | 内容 | 直す点 |
|---|---|---|
| 追加修正1 | 盤面(Canvas)の文字を、実際の幅を測って描く | (a)(b)(d) |
| 追加修正2 | 依頼書を「1リピート分 + くりかえし N 回」で表示 | (c) の前半 |
| 追加修正3 | 横長では「いまの帯の並び」を盤面の下に置く | (c) の後半 |

## 変更してよいファイル

- 追加修正1:`src/games/creel/renderer.ts`、`src/games/creel/renderer.test.ts`
- 追加修正2:`src/core/domain/stripe.ts`、`src/core/domain/stripe.test.ts`、`src/games/creel/panel.ts`、`src/games/creel/panel.test.ts`、`src/styles/base.css`(creel の節のみ)
- 追加修正3:`src/core/ui/gameFrame.ts`、`src/core/ui/gameParts.test.ts`、`src/games/creel/panel.ts`、`src/games/creel/panel.test.ts`、`src/games/creel/controller.ts`、`src/styles/base.css`(creel の節と game-frame の節のみ)
- 共通:`PROGRESS.json`、`docs/progress_log.md`
- 上のほかに手が入る場合は、理由を報告に書く。

## 測って決めた数字(確認役が 1180×820、段階5、本番と同じビルドで測った)

- 操作欄の見えている高さ 748px に対し、中身の高さは 1392px。依頼書 541(8行)、帯の並び 343、箱 212、道具 136、メッセージ 52、区画のあいだ 12px×4。
- したがって、依頼書を4行にしただけでは収まらない。「帯の並び」を盤面の下に移す(追加修正3)ことで収める。
- 盤面は幅で決まる大きさ(1180×820 では高さ約 555px)で、盤面の下に約 190px の余白がある。ここを使う。

## 追加修正1:盤面の文字を、実際の幅を測って描く(`renderer.ts`)

文字の大きさは、これまでどおり画面 px で 20px(下げない)。座標の変換は `geometry.ts` の `toPx` を使う。次の3つを、`ctx.measureText` で測った実際の幅で決める。

1. **品番(コーンの下)**:`showHinbanOnCone(stage)` が true のときだけ描く、は変えない。そのうえで、`measureText(品番).width` が「そのマスの画面上の幅 − 4px」以下のときだけ描く。収まらないときは描かない(「しらべる」で見られる)。位置は、マスの中央で文字を中央揃え。
2. **吹き出し(しらべる)**:枠の大きさを、画面 px で決める。
   - 幅 = 品番と規格(spec)の2行のうち広い方の `measureText` の幅 + 余白 10px×2。
   - 高さ = 20px×2行分の行送り + 余白 10px×2。
   - 位置は、コーンの真上(上に十分な余白がなければ真下)。枠は Canvas の内側(左右 4px 以上の余白)に収める。枠の中の文字は、枠の左右の余白 10px の内側に収まる。
   - しっぽ(三角)は、枠の外側に出る形で、コーンの方を向く。
3. **帯の番号(盤面)**:段階1〜3は全マス、段階4〜5は各段の最初のマスだけ、は変えない。
   - 番号は、マスの上端で左右中央に揃えて描く(`textAlign: 'center'`)。
   - `measureText(番号).width` が「そのマスの画面上の幅 − 4px」を超えるときは描かない。
   - コーンの上端は、番号を描くマスでは「番号の下端 + 2px」より下にする(番号とコーンが重ならない)。マスの高さが足りず、コーンの高さが 24px 未満になる場合は、その番号を描かない。

### テスト(`renderer.test.ts`。`measureText` は「文字数 × 12」を返す偽の ctx にする)

1. 品番:マスの画面上の幅が 90px なら `fillText` に品番が渡される。40px なら渡されない。
2. 吹き出し:枠の幅が「2行のうち広い方の測った幅 + 20」と同じ。枠の左右が Canvas の内側に収まる(コーンが左端・右端にあっても)。
3. 番号:マスの画面上の幅が広ければ番号が描かれ、`textAlign` が 'center'。狭ければ描かれない。
4. これまでのテスト(文字は画面 px で 20 以上、など)は変えない。

## 追加修正2:依頼書を「1リピート分 + くりかえし N 回」で表示する

実際の整経の指図に近く、行数も減る。

### `stripe.ts` に追加する関数

```ts
/**
 * 糸の列を、「1リピート分」と「くりかえしの回数」に分ける。
 * unit.length は seq.length を割り切る最も短い長さで、seq が unit のくりかえしになっているもの。
 * くりかえしが無ければ unit は seq 全体、times は 1。seq が空なら { unit: [], times: 1 }。
 */
export function splitRepeat(seq: YarnTypeId[]): { unit: YarnTypeId[]; times: number };
```

テスト(`stripe.test.ts`):

1. `[a,a,a,b,a,a,a,b]` → unit `[a,a,a,b]`、times 2。
2. `[a,a,a,a,a,a]` → unit `[a]`、times 6。
3. `[a,a,b]` → unit `[a,a,b]`、times 1。
4. `[]` → unit `[]`、times 1。
5. p-alt-kon(`expandPlan(plan, 24)`)→ unit の長さ 12、times 2。

### 依頼書(`panel.ts`)

- `const { unit, times } = splitRepeat(s.answer)` とし、**`times >= 2` かつ `unit.length >= 2` のとき**は、`toRuns(unit)` を1行ずつ表にして、そのすぐ下に1行を足す。
  - 足す行の文字:「↻ ここまでを N 回くりかえす(ぜんぶで M 本)」(N は times、M は answer の長さ)。`data-testid="creel-order-repeat"`、クラス `creel-order-repeat`。文字の大きさは `--fs-body`。
- それ以外のとき(段階1・2 など)は、これまでどおり `toRuns(s.answer)` を1行ずつ。足す行は出さない。
- 選んでいる箱と同じ品番の行を藍の太枠にする、は変えない(unit の行のうち同じ品番の行すべて)。
- 行の高さを詰める:品番は `--fs-number`(32px)のまま、行の `line-height` を 1.2、縦の余白を 0 にする。選択中の太枠(4px)を含めて、1行の高さは 48px 以下。

### テスト(`panel.test.ts`。本物の内容データ)

1. s5:依頼書の行が4つ。`creel-order-repeat` があり、文字に「2回」と「24本」を含む。
2. s3:行が2つ。`creel-order-repeat` があり、「2回」と「16本」を含む。
3. s2:行が2つ(W-4812 × 7、W-2200 × 1)。`creel-order-repeat` が無い。
4. s1:行が1つ。`creel-order-repeat` が無い。
5. 選んでいる箱と同じ品番の行に、選択中を表すクラスが付く(s5 で kon-a の行が2つとも)。

## 追加修正3:横長では「いまの帯の並び」を盤面の下に置く

03_basic_design 6.1 の「盤面の下:いまの帯の並び」に合わせる。

### `gameFrame.ts`

- `GameFrame` に次を足す(既存のものは変えない。ほかのゲームの動きも変えない)。

```ts
footer: HTMLElement;                       // 盤面 (Canvas) の下の欄。横長のときだけ使う
layout(): 'landscape' | 'portrait';        // いまの配置
```

- 横長のとき:盤面の列(左)を「Canvas の上・footer の下」の縦並びにする。Canvas の高さは「盤面の列の高さ − footer の高さ」。footer の高さが変わったとき(中身が増えたとき)も、Canvas を作り直して `onStageResize` を呼ぶ。
- 縦長のとき:footer は非表示(`display: none`)にし、Canvas の高さは今までどおり。
- footer が空のときの動きは、今までと同じ(Canvas の高さが変わらない)。

### `panel.ts` と `controller.ts`

- `CreelPanel` に `placeBand(target: HTMLElement | null): void` を足す。「いまの帯の並び」の区画(見出しとマスをまとめたもの)を、target の中に移す。null なら操作欄の元の位置(依頼書の下)に戻す。
- `controller.ts`:枠の配置が変わるたび(`onStageResize` のとき)、`frame.layout() === 'landscape'` なら `panel.placeBand(frame.footer)`、そうでなければ `panel.placeBand(null)`。
- 縦長は、今までどおり操作欄の中(縦スクロールあり)。マスの大きさ(40px)は変えない。

### CSS(`base.css`)

- footer の中の帯の並びは、横に折り返して並べる(`flex-wrap: wrap`)。区画の見出しは `--fs-body` のまま。マスの大きさ(40px)・間隔(縦横 8px 以上)は変えない。

### テスト

- `gameParts.test.ts`:横長の配置(`layoutOf` が 'landscape' になる大きさ)で、`footer` に子を足すと Canvas の高さが「盤面の列の高さ − footer の高さ」になる。縦長では footer が非表示。footer が空なら Canvas の高さは今までと同じ。(jsdom では高さが測れないので、`getBoundingClientRect` を偽物にするか、高さの計算を関数に切り出して、その関数を試す。)
- `panel.test.ts`:`placeBand(el)` で「いまの帯の並び」の区画が `el` の中に移り、`placeBand(null)` で元に戻る。帯の番号の構造(各マスのまとまりに番号が1つ、`position: absolute` を使わない)は変わらない。destroy で `el` からも消える。

## ブラウザ確認(3つの大きさ。本番と同じビルド `npm run build` → `vite preview` で、ポートを固定して行う)

ルビーの作業道具のブラウザは、起動のたびに保存領域がまっさらになる。星や図鑑は、その中の確認用のデータで、実データではない。s5 を開くには、s1〜s4 をクリアするか、同じ道具の中で保存領域に記録を書く。道具を起動し直すと記録は消えるので、起動し直さずに続けて確認する。

数字は、ブラウザの開発者用の機能(`javascript` で `getBoundingClientRect`・`scrollHeight`)で測って報告する。

1. **1180×820、s5(最優先。必ず満たす)**
   - 操作欄(`.game-frame__panel`)の `scrollHeight` が `clientHeight` 以下(スクロールなし)。
   - 盤面(Canvas)の3段ぜんぶが見え、その下に「いまの帯の並び」が重ならずに見える。
   - 依頼書は4行 + くりかえしの行。番号・コーン・品番が重ならない。
2. **960×720**
   - s1〜s4:操作欄がスクロールなし。
   - s5:`scrollHeight` と `clientHeight` を報告する。あふれる場合は、あふれる量(px)と、どの区画かを書く(不合格にはしない。確認役が判断する)。
3. **412×915(縦長)**
   - 押せる大きさは変えない(軸のマスの幅・ボタン・箱の大きさを数値で報告)。
   - s2 で品番が重ならない(収まらないときは品番が出ず、「しらべる」で見られる)。
   - s5 で、盤面の番号がマスからはみ出さず、コーンと重ならない。
   - 「しらべる」の吹き出しの文字が、枠の中に収まる(s2 と s4 で確認)。
4. スクリーンショットは、3つの大きさそれぞれで、s5 と、吹き出しを出した状態を添える。

## 完了条件

- 各コミットで、失敗を再現するテストを先に書いて RED を確認してから実装した。
- `npm run check`・`npm test`・`npm run build` が成功する。
- 上のブラウザ確認の数字とスクリーンショットを、Discord と `docs/progress_log.md` に報告した(出どころとして、コミットの番号を書く)。
- 文字は画面上 20px 以上、押せる部品は 64px 以上のまま(下げて詰めていない)。
