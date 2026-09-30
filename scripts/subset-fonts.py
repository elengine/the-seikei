"""書体を絞った woff2 を作る (PU-01b)。使い方は public/fonts/README.md を参照。

python scripts/subset-fonts.py <TTF を置いたフォルダ>
"""
import pathlib
import sys

from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "fonts"
FONTS = [
    "ShipporiMincho-Bold",
    "BIZUDPGothic-Regular",
    "BIZUDPGothic-Bold",
]


def jis_kanji_and_kana() -> set[int]:
    """JIS X 0208 (第1・第2水準の漢字、かな、記号) のすべての文字"""
    chars: set[int] = set()
    for hi in range(0xA1, 0xFF):
        for lo in range(0xA1, 0xFF):
            try:
                ch = bytes([hi, lo]).decode("euc_jp")
            except UnicodeDecodeError:
                continue
            if len(ch) == 1:
                chars.add(ord(ch))
    return chars


def source_chars() -> set[int]:
    """src/ の中の .json と .ts に出てくる文字すべて"""
    chars: set[int] = set()
    for pattern in ("src/**/*.json", "src/**/*.ts"):
        for path in ROOT.glob(pattern):
            chars.update(ord(c) for c in path.read_text(encoding="utf-8"))
    return {c for c in chars if c >= 0x20}


def wanted() -> set[int]:
    chars = set(range(0x20, 0x7F))  # ASCII
    chars |= set(range(0x3000, 0x3100))  # 全角の記号・ひらがな・カタカナ
    chars |= set(range(0xFF00, 0xFFF0))  # 全角の英数字・記号
    chars |= jis_kanji_and_kana()
    chars |= source_chars()
    return chars


def main() -> None:
    src = pathlib.Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    text = "".join(chr(c) for c in sorted(wanted()))
    for name in FONTS:
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.notdef_outline = True
        font = subset.load_font(str(src / f"{name}.ttf"), opts)
        sub = subset.Subsetter(opts)
        sub.populate(text=text)
        sub.subset(font)
        subset.save_font(font, str(OUT / f"{name}.woff2"), opts)
        print(name, (OUT / f"{name}.woff2").stat().st_size)


if __name__ == "__main__":
    main()
