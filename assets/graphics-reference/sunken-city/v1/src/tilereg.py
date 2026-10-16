"""Tile registry: @tile and @anim_tile collect tile painters; build() runs them, registers the images
with the material system (so voxel models can be built of them) and returns them for export."""
import numpy as np

import mats

TILE_FNS = {}       # name → dict(fn, ru, glow, group)
ANIM_FNS = {}       # name → dict(fn, ru, frames, fps, group)


def tile(name, ru, glow=False, group="city"):
    def deco(fn):
        TILE_FNS[name] = dict(fn=fn, ru=ru, glow=glow, group=group)
        return fn
    return deco


def anim_tile(name, ru, frames=8, fps=8, group="anim"):
    def deco(fn):
        ANIM_FNS[name] = dict(fn=fn, ru=ru, frames=frames, fps=fps, group=group)
        return fn
    return deco


def _pair(res):
    if isinstance(res, tuple):
        a, g = res
        return np.asarray(a, np.uint8), (None if g is None else np.asarray(g, np.uint8))
    return np.asarray(res, np.uint8), None


def build():
    out, anims = {}, {}
    for name, d in TILE_FNS.items():
        a, g = _pair(d["fn"]())
        assert a.shape == (16, 16, 4), (name, a.shape)
        if g is not None and not g[..., 3].any():
            g = None
        mats.add_tile(name, a, g)
        out[name] = dict(rgba=a, glow=g, ru=d["ru"], group=d["group"])
    for name, d in ANIM_FNS.items():
        frames = [_pair(d["fn"](f)) for f in range(d["frames"])]
        # the first frame doubles as a static tile, so blocks can be built of animated materials too
        mats.add_tile(name, frames[0][0], frames[0][1])
        anims[name] = dict(frames=frames, ru=d["ru"], fps=d["fps"], group=d["group"])
    return out, anims
