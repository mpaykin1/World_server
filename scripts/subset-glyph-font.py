#!/usr/bin/env python3
"""Subset an OFL font to glyphs actually used by one game."""
from __future__ import annotations
import argparse
from pathlib import Path

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--font", required=True)
    parser.add_argument("--text", default="")
    parser.add_argument("--text-file")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    try:
        from fontTools import subset
        from fontTools.ttLib import TTFont
    except ImportError as exc:
        raise SystemExit(
            "Install build dependency: python -m pip install 'fonttools[woff]'"
        ) from exc

    text = args.text
    if args.text_file:
        text += Path(args.text_file).read_text(encoding="utf-8")
    if not text:
        raise SystemExit("No glyph text supplied.")

    font = TTFont(args.font)
    options = subset.Options()
    options.layout_features = ["*"]
    options.notdef_glyph = True
    options.notdef_outline = True
    if str(args.out).lower().endswith(".woff2"):
        options.flavor = "woff2"

    worker = subset.Subsetter(options=options)
    worker.populate(text=text)
    worker.subset(font)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    font.save(out)
    print(
        f"{args.font} -> {out} "
        f"({out.stat().st_size} bytes, {len(set(text))} requested chars)"
    )
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
