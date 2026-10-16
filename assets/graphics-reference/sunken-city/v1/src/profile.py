"""Creatures and props drawn as pixel art, then grown into 3D.

A side profile is an ASCII sprite (top row first). Body cells become a rounded solid: in every column the
vertical run of body cells is swollen into an ellipse in depth (z), so the side view is exactly the drawn
sprite and the model is round in 3D. Fin cells stay one voxel thin on the middle plane, paint cells colour
the two outer surfaces (eyes, stripes, photophores), so features show from both sides.
"""
import math

import numpy as np


def grow(part, rows, legend, zc=None, depth=3.0, depth_fn=None, at=(0, 0)):
    """rows: list of strings, top row first; legend: char → dict(
         mat:    material name for the solid,
         kind:   'body' (rounded) | 'fin' (thin: `thick` voxels, default 1) | 'paint' (body cell, outer
                 surfaces get `paint` material) | 'flat' (a slab of `thick` voxels centred on zc),
         thick:  thickness for fins/flats, paint: material on the surfaces, tone: ramp step override)
       depth: half-thickness (voxels) of the body at its tallest column; depth_fn(x, y) → multiplier.
       at: (x, y) offset of the sprite's bottom-left inside the grid."""
    H = len(rows)
    Wd = max(len(r) for r in rows)
    zc = part.shape[2] / 2 if zc is None else zc
    grid = [r.ljust(Wd, ".") for r in rows]
    body_chars = {c for c, d in legend.items() if d.get("kind", "body") in ("body", "paint")}
    paints = []
    for x in range(Wd):
        col = [grid[H - 1 - y][x] for y in range(H)]          # y up
        runs, y = [], 0
        while y < H:
            if col[y] in body_chars:
                y0 = y
                while y < H and col[y] in body_chars:
                    y += 1
                runs.append((y0, y))
            else:
                y += 1
        for (y0, y1) in runs:
            cy, half = (y0 + y1) / 2, max((y1 - y0) / 2, 0.5)
            for yy in range(y0, y1):
                d = legend[col[yy]]
                k = (yy + 0.5 - cy) / half
                h = depth * math.sqrt(max(0.0, 1 - k * k * 0.92))
                if depth_fn:
                    h *= depth_fn(x, yy)
                h = max(h, 0.5)
                z0, z1 = int(math.floor(zc - h + 0.5)), int(math.ceil(zc + h - 0.5))
                X, Y = x + at[0], yy + at[1]
                if not (0 <= X < part.shape[0] and 0 <= Y < part.shape[1]):
                    continue
                z0, z1 = max(0, z0), min(part.shape[2], max(z1, z0 + 1))
                part.m[X, Y, z0:z1] = _mid(d["mat"])
                part.t[X, Y, z0:z1] = d.get("tone", 255)
                if d.get("kind") == "paint":
                    paints.append((X, Y, z0, z1 - 1, d))
        for y in range(H):
            ch = col[y]
            if ch == "." or ch == " " or ch in body_chars:
                continue
            d = legend[ch]
            X, Y = x + at[0], y + at[1]
            if not (0 <= X < part.shape[0] and 0 <= Y < part.shape[1]):
                continue
            th = d.get("thick", 1)
            z0 = int(round(zc - th / 2))
            z0, z1 = max(0, z0), min(part.shape[2], z0 + th)
            part.m[X, Y, z0:z1] = _mid(d["mat"])
            part.t[X, Y, z0:z1] = d.get("tone", 255)
    for (X, Y, z0, z1, d) in paints:
        pm = _mid(d["paint"])
        tone = d.get("ptone", 255)
        for z in {z0, z1} | (set(range(z0, z1 + 1)) if d.get("through") else set()):
            part.m[X, Y, z] = pm
            part.t[X, Y, z] = tone
    return part


def _mid(name):
    import mats
    return mats.get(name) if isinstance(name, str) else name


def lathe(part, radius_fn, mat, axis=1, c=None, tone=None):
    """Solid of revolution around an axis through c: radius_fn(a) gives the radius at height a (grid units)."""
    G = part.g
    c = c or [s / 2 for s in part.shape]
    a = G[axis]
    o = [G[i] - c[i] for i in range(3) if i != axis]
    r = np.sqrt(o[0] ** 2 + o[1] ** 2)
    R = np.vectorize(radius_fn, otypes=[float])(np.floor(a))
    m = r <= R
    part.fill(m, mat, tone)
    return m


def arch_mask(w, h, spring, t=None, pointed=True):
    """2D mask (rows top→bottom) of a gothic arch opening: w wide, h tall, the arch starts at height `spring`.
    Pointed: two arcs centred on the opposite jambs (a lancet arch). t: if given, only the ring of thickness t."""
    ys, xs = np.mgrid[0:h, 0:w]
    Y = (h - 1 - ys) + 0.5
    X = xs + 0.5
    if pointed:
        r = w * 0.92
        inside_l = (X - (w - r * 0.0)) ** 2 + (Y - spring) ** 2 <= r * r
        inside_r = (X - (r * 0.0)) ** 2 + (Y - spring) ** 2 <= r * r
        top = inside_l & inside_r
    else:
        top = (X - w / 2) ** 2 + (Y - spring) ** 2 <= (w / 2) ** 2
    m = (Y < spring) | top
    if t:
        inner = arch_mask(max(1, w - 2 * t), max(1, h - t), max(0, spring), None, pointed)
        pad = np.zeros_like(m)
        ih, iw = inner.shape
        pad[h - ih:, t:t + iw] = inner
        m = m & ~pad
    return m
