#!/usr/bin/env python3
"""
Runs every pack's art modules (packs/<pack>/art/*.py) and packs the results:

  tiles    → one atlas, 8 columns of 16×16          ASSETS.atlas, atlasNames, atlasGrid
  weapons  → 32×32 cells, 8 per row                 ASSETS.weapons + wmeta.weapons[name]
  projectiles / icons → 16×16 cells after them      wmeta.proj[name], wmeta.icons[name]
  heroes   → one 6-frame strip per character        ASSETS.heroes[name]
  strips   → coin / hearts / water / anything else  ASSETS[name]

Writes build/assets.json (data URIs) and PNG previews in build/.
usage: python3 -m art.build   (from the project root)   or   python3 art/build.py
"""
import base64, glob, importlib, io, json, math, os, sys  # noqa: E401  (one line: the repo caps import lines per file)

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from art import registry as R  # noqa: E402
from art.pixel import T, CELL, upscale  # noqa: E402

BUILD = os.path.join(ROOT, "build")


def packs():
    out = []
    for pj in glob.glob(os.path.join(ROOT, "packs", "*", "pack.json")):
        meta = json.load(open(pj, encoding="utf-8"))
        meta["dir"] = os.path.dirname(pj)
        out.append(meta)
    out.sort(key=lambda m: (m.get("order", 50), m["id"]))
    return out


def load_art():
    for p in packs():
        art_dir = os.path.join(p["dir"], "art")
        if not os.path.isdir(art_dir):
            continue
        R.set_pack(p["id"])
        sys.path.insert(0, art_dir)
        before = set(sys.modules)
        try:
            for f in sorted(glob.glob(os.path.join(art_dir, "*.py"))):
                stem = os.path.splitext(os.path.basename(f))[0]
                if stem.startswith("_"):
                    continue
                importlib.import_module(stem)
        finally:
            sys.path.remove(art_dir)
            for name in set(sys.modules) - before:       # pack modules are private to their pack
                mod = sys.modules[name]
                if getattr(mod, "__file__", "") and os.path.dirname(os.path.abspath(mod.__file__)) == art_dir:
                    del sys.modules[name]


def uri(a):
    buf = io.BytesIO()
    Image.fromarray(a).save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def check(a, shape, what):
    if not isinstance(a, np.ndarray) or a.dtype != np.uint8 or a.ndim != 3 or a.shape[2] != 4:
        raise ValueError(f"art: {what} must be an RGBA uint8 array, got {getattr(a, 'shape', type(a))}")
    if shape and a.shape[:2] != shape:
        raise ValueError(f"art: {what} must be {shape[1]}×{shape[0]}, got {a.shape[1]}×{a.shape[0]}")


def build_tiles():
    names = list(R.TILES)
    cols = 8
    rows = max(1, math.ceil(len(names) / cols))
    atlas = np.zeros((rows * T, cols * T, 4), np.uint8)
    for i, n in enumerate(names):
        a = R.TILES[n]()
        check(a, (T, T), f"tile '{n}'")
        x, y = (i % cols) * T, (i // cols) * T
        atlas[y:y + T, x:x + T] = a
    return atlas, names, [cols, rows]


def build_sprites():
    wnames, pnames, inames = list(R.WEAPONS), list(R.PROJECTILES), list(R.ICONS)
    wrows = max(1, math.ceil(len(wnames) / 8))
    small = [("proj", n, R.PROJECTILES[n]) for n in pnames] + [("icons", n, R.ICONS[n]) for n in inames]
    srows = max(1, math.ceil(len(small) / 16))
    W_, H_ = 8 * CELL, wrows * CELL + srows * 16
    atlas = np.zeros((H_, W_, 4), np.uint8)
    meta = {"size": [W_, H_], "weapons": {}, "proj": {}, "icons": {}}
    for i, n in enumerate(wnames):
        res = R.WEAPONS[n]()
        img, info = res if isinstance(res, tuple) else (res, {})
        check(img, (CELL, CELL), f"weapon '{n}'")
        x, y = (i % 8) * CELL, (i // 8) * CELL
        atlas[y:y + CELL, x:x + CELL] = img
        d = {"cell": [x, y, CELL, CELL]}
        d.update({k: list(v) if isinstance(v, tuple) else v for k, v in info.items()})
        for req in ("grip", "tip"):
            if req not in d:
                raise ValueError(f"art: weapon '{n}' meta needs '{req}'")
        d.setdefault("base", 45)
        meta["weapons"][n] = d
    y0 = wrows * CELL
    for j, (table, n, fn) in enumerate(small):
        img = fn()
        check(img, (16, 16), f"{table[:-1] if table == 'icons' else 'projectile'} '{n}'")
        x, y = (j % 16) * 16, y0 + (j // 16) * 16
        atlas[y:y + 16, x:x + 16] = img
        meta[table][n] = [x, y, 16, 16]
    return atlas, meta


def build_heroes():
    out = {}
    for n, fn in R.HEROES.items():
        a = fn()
        check(a, (24, 96), f"hero '{n}'")
        out[n] = a
    return out


def main(write_previews=True):
    load_art()
    tiles, names, grid = build_tiles()
    sprites, wmeta = build_sprites()
    heroes = build_heroes()
    strips = {n: fn() for n, fn in R.STRIPS.items()}
    for n, a in strips.items():
        check(a, None, f"strip '{n}'")
    assets = {
        "atlas": uri(tiles), "atlasNames": names, "atlasGrid": grid,
        "weapons": uri(sprites), "wmeta": wmeta,
        "heroes": {n: uri(a) for n, a in heroes.items()},
    }
    assets["hero"] = assets["heroes"].get("wanderer") or next(iter(assets["heroes"].values()))
    for n, a in strips.items():
        assets[n] = uri(a)
    os.makedirs(BUILD, exist_ok=True)
    with open(os.path.join(BUILD, "assets.json"), "w") as fh:
        json.dump(assets, fh, separators=(",", ":"))
    if write_previews:
        Image.fromarray(tiles).save(os.path.join(BUILD, "tiles.png"))
        upscale(tiles, 4).save(os.path.join(BUILD, "tiles_x4.png"))
        Image.fromarray(sprites).save(os.path.join(BUILD, "sprites.png"))
        upscale(sprites, 3).save(os.path.join(BUILD, "sprites_x3.png"))
        os.makedirs(os.path.join(BUILD, "heroes"), exist_ok=True)
        for n, a in heroes.items():
            upscale(a, 6).save(os.path.join(BUILD, "heroes", f"{n}_x6.png"))
        for n, a in strips.items():
            upscale(a, 4).save(os.path.join(BUILD, f"strip_{n}_x4.png"))
    counts = dict(tiles=len(names), weapons=len(wmeta["weapons"]), projectiles=len(wmeta["proj"]),
                  icons=len(wmeta["icons"]), heroes=len(heroes), strips=len(strips))
    return assets, counts


if __name__ == "__main__":
    _, counts = main()
    print("art ok:", counts)
