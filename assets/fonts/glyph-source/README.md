# Glyph / Calligraphic Font Library

Build-time source library for procedural glyph-based games.

## Included families
- Chinese brush: Ma Shan Zheng, Liu Jian Mao Cao, Zhi Mang Xing, Long Cang.
- Japanese brush: Yuji Boku.
- Arabic calligraphy: Aref Ruqaa and Katibeh.
- Devanagari brush-painted signage: Yatra One.
- Egyptian: NewGardiner and Noto Sans Egyptian Hieroglyphs.
- Ancient systems: Noto Sans Anatolian Hieroglyphs, Cuneiform and Phoenician.

Every vendored font has its OFL 1.1 license and SHA-256 in `manifest.json`.

## Tiny-build rule
Do not copy a complete source font into a Krieger-style autonomous HTML.
Treat source fonts as a build-time geometry vocabulary.

1. Pick only glyphs needed by the game.
2. Run `python scripts/subset-glyph-font.py --font SOURCE.ttf --text "GLYPHS" --out subset.woff2`.
3. Embed the small WOFF2, or convert selected outlines to procedural paths/meshes.
4. Reuse outlines with seeded scale, rotation, extrusion, deformation, instancing and animation.

OFL applies to the font files and font derivatives; it does not automatically relicense the game code.
