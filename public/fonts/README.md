# 埋め込みの書体

- `ShipporiMincho-Bold.woff2`:Shippori Mincho(太さ 700)。題名・見出し用。
- `BIZUDPGothic-Regular.woff2`、`BIZUDPGothic-Bold.woff2`:BIZ UDPGothic(400・700)。本文・ボタン用。
- ライセンスは SIL Open Font License 1.1(`OFL.txt`。両方の著作権表示を含む)。

## 作り方

1. 元の TTF を Google Fonts の公式のリポジトリ(`github.com/google/fonts`)から取る。
   - `ofl/shipporimincho/ShipporiMincho-Bold.ttf`
   - `ofl/bizudpgothic/BIZUDPGothic-Regular.ttf`、`ofl/bizudpgothic/BIZUDPGothic-Bold.ttf`
   - `OFL.txt` は両方の `OFL.txt` をつなげたもの。
2. `pip install fonttools brotli` のあと、TTF を置いたフォルダを指定して実行する。

```bash
python scripts/subset-fonts.py <TTF を置いたフォルダ>
```

## 含めた文字(絞り方)

`fontTools.subset`(`pyftsubset` と同じ処理。`--flavor=woff2`、`layout_features=*`)で、次の文字だけを残している。

- ASCII(U+0020〜U+007E)
- 全角の記号・ひらがな・カタカナ(U+3000〜U+30FF)
- 全角の英数字・記号(U+FF00〜U+FFEF)
- JIS X 0208 のすべて(第1・第2水準の漢字、かな、記号。EUC-JP の全コードから作る)
- `src/**/*.json` と `src/**/*.ts` に出てくる文字すべて(漏れを防ぐため)

含まれない字(利用者が入力した名前など)は、端末の標準のゴシック体で出る。
文字を足したときは、上のコマンドを再実行して woff2 を作り直す。
