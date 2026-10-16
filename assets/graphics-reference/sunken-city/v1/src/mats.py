"""Materials: what a voxel is made of.

  ramp   lit material — the renderer picks a step of its ramp from the light (top-left) and the bevel;
         in 3D the voxel gets its baked tone from the palette texture
  glow   bioluminescent — bright steps, ignores the light, goes into emissive maps (3D) and glow masks (2D)
  tile   a 16×16 texture (top / side / bottom) mapped world-aligned: one texel per voxel face, so a model
         built of tile voxels shows exactly the same bricks, planks and moss as the tileset
"""
import numpy as np

from pixel import hx

MATS = [None]          # id 0 = empty
BY_NAME = {}
TILES = {}             # tile name → {'rgba': (16,16,4) uint8, 'glow': (16,16,4) uint8 | None, 'idx': (16,16,2) int16}

# every colour of the pack lives on a ramp: pixels are shaded by stepping along their ramp, never by
# multiplying RGB, so renders stay on-palette (the pixel-art way)
RAMP_LIST = []         # list of tuples of hex colours
RAMP_ID = {}
RAMP_RGB = []          # np arrays (n, 3)
COLOR_AT = {}          # '#hex' → (ramp id, step) — first ramp that holds the colour


def ramp_id(ramp):
    key = tuple(c.lower() for c in ramp)
    if key not in RAMP_ID:
        RAMP_ID[key] = len(RAMP_LIST)
        RAMP_LIST.append(key)
        RAMP_RGB.append(np.array([hx(c)[:3] for c in key], np.int16))
        for i, c in enumerate(key):
            COLOR_AT.setdefault(c, (RAMP_ID[key], i))
    return RAMP_ID[key]


def ramp_rgb_table():
    """(R, 8, 3) table of every ramp padded with its last colour — vectorised lookups in the renderer."""
    T = np.zeros((len(RAMP_RGB), 8, 3), np.uint8)
    for i, r in enumerate(RAMP_RGB):
        T[i, :len(r)] = r
        T[i, len(r):] = r[-1]
    return T, np.array([len(r) for r in RAMP_RGB], np.int16)


def define(name, kind, ramp=None, base=None, top=None, side=None, bottom=None, emit=2.5, rough=0.88, metal=0.0, alpha=1.0):
    if name in BY_NAME:
        return BY_NAME[name]
    m = dict(id=len(MATS), name=name, kind=kind, ramp=list(ramp) if ramp else None, emit=emit if kind == "glow" else 0.0,
             rough=rough, metal=metal, alpha=alpha)
    if kind in ("ramp", "glow"):
        n = len(ramp)
        m["base"] = base if base is not None else (n - 2 if kind == "glow" else n // 2)
        m["rgb"] = np.array([hx(c)[:3] for c in ramp], np.uint8)
        m["rid"] = ramp_id(ramp)
    else:
        m["tiles"] = dict(top=top or side, side=side or top, bottom=bottom or side or top)
        m["emit"] = emit if any(TILES.get(t, {}).get("glow") is not None for t in m["tiles"].values()) else 0.0
    MATS.append(m)
    BY_NAME[name] = m["id"]
    return m["id"]


def get(name):
    if name not in BY_NAME:
        raise KeyError(f"unknown material '{name}' — define it in materials.py")
    return BY_NAME[name]


def tile_rgba(name):
    return TILES[name]["rgba"]


def tile_glow(name):
    return TILES[name].get("glow")


def nearest_on_ramps(rgb):
    """(ramp id, step) of the closest ramp colour to an RGB triple (fallback for off-palette pixels)."""
    best, bd = (0, 0), 1e18
    for rid, r in enumerate(RAMP_RGB):
        d = ((r - np.array(rgb[:3], np.int16)) ** 2 * np.array([3, 4, 2])).sum(1)
        i = int(d.argmin())
        if d[i] < bd:
            bd, best = d[i], (rid, i)
    return best


def add_tile(name, rgba, glow=None):
    """Register a 16×16 tile. glow: optional RGBA of its emissive pixels (alpha > 0 = glows)."""
    rgba = np.asarray(rgba, np.uint8)
    idx = np.zeros((16, 16, 2), np.int16)
    cache = {}
    for y in range(16):
        for x in range(16):
            c = "#%02x%02x%02x" % tuple(int(v) for v in rgba[y, x, :3])
            if c not in cache:
                cache[c] = COLOR_AT.get(c) or nearest_on_ramps(rgba[y, x])
            idx[y, x] = cache[c]
    g = None if glow is None else np.asarray(glow, np.uint8)
    TILES[name] = dict(rgba=rgba, glow=g, idx=idx, gmask=None if g is None else g[..., 3] > 0)


def is_glow(mid):
    m = MATS[mid]
    return m is not None and (m["kind"] == "glow" or (m["kind"] == "tile" and m["emit"] > 0))


def voxel_rgb(mid, tone, x, y, z, face):
    """Base colour of one voxel face (no lighting) — used by .vox / palettes. face: 0..5 (+x -x +y -y +z -z)."""
    m = MATS[mid]
    if m["kind"] != "tile":
        t = m["base"] if tone == 255 else int(tone)
        return m["rgb"][min(t, len(m["rgb"]) - 1)]
    t = m["tiles"]["top" if face == 2 else "bottom" if face == 3 else "side"]
    img = TILES[t]["rgba"]
    if face in (2, 3):
        return img[z % 16, x % 16, :3]
    u = z if face in (0, 1) else x
    return img[15 - (y % 16), u % 16, :3]
