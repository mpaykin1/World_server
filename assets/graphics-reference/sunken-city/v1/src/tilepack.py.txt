"""Tiles in every form: flat 16×16 tiles (+ glow masks), animated strips, a tile atlas, 16-piece edge sets
(autotiles) for side-view levels, isometric cubes (2.5D) and textured block models (3D)."""
import json
import math
import os

import numpy as np
from PIL import Image

import mats
import render
from export import save, save_pair
from gltf import export_glb
from materials import BLOCKS
from pixel import hx, OUTLINE
from vox import Model


def export_tiles(root, tiles, anims):
    entries = []
    for name, t in tiles.items():
        e = dict(id=name, name=t["ru"], group=t["group"], **save_pair(root, f"tiles/{name}", t["rgba"], t["glow"]))
        entries.append(e)
    # atlas: 8 columns of 16×16, in registration order
    names = list(tiles)
    cols = 8
    rows = (len(names) + cols - 1) // cols
    atlas = np.zeros((rows * 16, cols * 16, 4), np.uint8)
    gat = np.zeros_like(atlas)
    for i, n in enumerate(names):
        r, c = divmod(i, cols)
        atlas[r * 16:(r + 1) * 16, c * 16:(c + 1) * 16] = tiles[n]["rgba"]
        if tiles[n]["glow"] is not None:
            gat[r * 16:(r + 1) * 16, c * 16:(c + 1) * 16] = tiles[n]["glow"]
    save(os.path.join(root, "tiles/atlas.png"), atlas)
    save(os.path.join(root, "tiles/atlas_glow.png"), gat)
    with open(os.path.join(root, "tiles/atlas.json"), "w") as fh:
        json.dump(dict(tile=16, cols=cols, names=names), fh, ensure_ascii=False, indent=1)
    aentries = []
    for name, t in anims.items():
        strip = np.concatenate([a for a, _ in t["frames"]], 1)
        gl = [g if g is not None else np.zeros((16, 16, 4), np.uint8) for _, g in t["frames"]]
        gstrip = np.concatenate(gl, 1)
        e = dict(id=name, name=t["ru"], frames=len(t["frames"]), fps=t["fps"], **save_pair(root, f"tiles/anim/{name}", strip, gstrip))
        aentries.append(e)
    return entries, aentries


# ── autotiles: the 16 Wang pieces of a terrain (bit set = that side is open) ──
SIDES = dict(N=1, E=2, S=4, W=8)


def wang_piece(base, k, fringe=None, rim_hi="#ffffff", rim_lo="#000000"):
    a = base.copy()
    N, E, S, W = (k & 1), (k >> 1) & 1, (k >> 2) & 1, (k >> 3) & 1
    o = hx(OUTLINE)
    if N:
        a[0, :] = o
        a[1, :] = hx(rim_hi)
        if fringe is not None:                       # surface decoration hangs over the top edge
            for x in range(16):
                if fringe[x]:
                    a[1, x] = hx(fringe[x])
                    if x % 3 == 0:
                        a[2, x] = hx(fringe[x])
    if S:
        a[15, :] = o
        a[14, :] = hx(rim_lo)
    if W:
        a[:, 0] = o
        a[1 if N else 0:15 if S else 16, 1] = hx(rim_hi)
    if E:
        a[:, 15] = o
        a[1 if N else 0:15 if S else 16, 14] = hx(rim_lo)
    for (open_a, open_b, y, x) in ((N, W, 0, 0), (N, E, 0, 15), (S, W, 15, 0), (S, E, 15, 15)):
        if open_a and open_b:                        # rounded outer corners
            a[y, x] = (0, 0, 0, 0)
            a[1 if y == 0 else 14, x] = o
            a[y, 1 if x == 0 else 14] = o
    return a


def export_autotiles(root):
    from ramps import SAND, ROCK, STONE, TEAL, GRASS
    out = []
    terrains = (
        ("sand", "Песчаное дно", "sand", SAND[5], SAND[1], [GRASS[4] if (x * 7) % 5 == 0 else None for x in range(16)]),
        ("rock", "Скала", "rock", ROCK[5], ROCK[0], None),
        ("brick", "Кладка", "brick", STONE[5], STONE[1], None),
        ("mossy", "Кладка в мхе", "brick_moss_teal", TEAL[3], STONE[1], [TEAL[4] if x % 2 == 0 else TEAL[2] for x in range(16)]),
    )
    for tid, ru, tile, hi, lo, fringe in terrains:
        base = mats.TILES[tile]["rgba"]
        pieces = [wang_piece(base, k, fringe, hi, lo) for k in range(16)]
        sheet = np.zeros((64, 64, 4), np.uint8)
        for k, pc in enumerate(pieces):
            r, c = divmod(k, 4)
            sheet[r * 16:(r + 1) * 16, c * 16:(c + 1) * 16] = pc
        save(os.path.join(root, f"tiles/autotile/{tid}.png"), sheet)
        out.append(dict(id=tid, name=ru, png=f"tiles/autotile/{tid}.png", rule="индекс = N·1 + E·2 + S·4 + W·8 (1 — сторона открыта)"))
    return out


def block_model(bid, ru, mat):
    m = Model(f"block_{bid}", ru, "block", "Блок 1×1×1 из тайлов пака.", iso_dirs=1)
    p = m.part("block", (16, 16, 16))
    p.fill(p.box((0, 0, 0), (16, 16, 16)), mat)
    return m


def export_blocks(root, anims):
    out = []
    iso_imgs = []
    for bid, ru, mat in BLOCKS:
        m = block_model(bid, ru, mat)
        img, g, _ = render.render(m, "iso", pad=1)
        e = dict(id=bid, name=ru, **save_pair(root, f"2.5d/iso_tiles/{bid}", img, g))
        export_glb(m, os.path.join(root, f"3d/blocks/{bid}.glb"))
        e["glb"] = f"3d/blocks/{bid}.glb"
        e["w"], e["h"] = img.shape[1], img.shape[0]
        out.append(e)
        iso_imgs.append(img)
    # animated iso cubes: the block whose tile is animated, re-rendered for every frame of that tile
    from ramps import GLOWS
    amap = {"caustics": ("t_caustics", "caustics"), "glass_rose_shimmer": ("t_glass_rose", "glass_rose"), "vent": ("t_vent", "vent")}
    for c in GLOWS:
        amap[f"moss_{c}_pulse"] = (f"t_moss_{c}", f"moss_{c}")
    aout = []
    for name, t in anims.items():
        if name not in amap:
            continue
        mat, key = amap[name]
        saved = dict(mats.TILES[key])
        frames, gframes = [], []
        for (a, g) in t["frames"]:
            mats.add_tile(key, a, g)
            render._REST.clear()
            img, gl, _ = render.render(block_model(name, t["ru"], mat), "iso", pad=1)
            frames.append(img)
            gframes.append(gl)
        mats.TILES[key] = saved
        render._REST.clear()
        strip, gstrip = np.concatenate(frames, 1), np.concatenate(gframes, 1)
        aout.append(dict(id=name, name=t["ru"], frames=len(frames), fps=t["fps"], w=frames[0].shape[1], h=frames[0].shape[0],
                         **save_pair(root, f"2.5d/iso_tiles/anim/{name}", strip, gstrip)))
    return out, aout
