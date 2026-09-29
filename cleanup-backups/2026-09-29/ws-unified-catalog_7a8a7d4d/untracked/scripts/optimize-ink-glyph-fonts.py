#!/usr/bin/env python3
from pathlib import Path
try:
    from fontTools.ttLib import TTFont
except Exception as e:
    print("FONTTOOLS_MISSING:", e)
    print("Install with: python -m pip install 'fonttools[woff]'")
    raise SystemExit(2)
root=Path(__file__).resolve().parents[1]
folder=root/'assets'/'fonts'/'ink-glyph'
ttfs=sorted(folder.glob('*.ttf'))
if not ttfs:
    print("INK_GLYPH_WOFF2 FAIL: no TTF fonts; run npm run fonts:ink:download")
    raise SystemExit(1)
ok=0
for src in ttfs:
    out=src.with_suffix('.woff2')
    font=TTFont(str(src),recalcTimestamp=False)
    font.flavor='woff2'
    font.save(str(out),reorderTables=False)
    if out.stat().st_size <= 10000:
        print("INK_GLYPH_WOFF2 FAIL:",out)
        raise SystemExit(1)
    print("PASS",out.name,out.stat().st_size,"bytes")
    ok+=1
print(f"INK_GLYPH_WOFF2 PASS {ok}/{len(ttfs)}")
