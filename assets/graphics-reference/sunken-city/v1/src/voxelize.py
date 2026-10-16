"""Posed model → one voxel grid of colours (for sprite stacks, .vox and per-frame stacks).

Each voxel is sampled 2×2×2, carried through the pose and dropped into a grid; its colour is its base
colour (palette tone, or the tile texel of its most exposed face)."""
import numpy as np

import mats

SUB = (np.indices((2, 2, 2)).reshape(3, -1).T + 0.5) / 2.0


def voxel_colors(part):
    """Per-voxel RGB (base colour, no light) + glow flag for one part (rest grid)."""
    occ = part.m > 0
    rgb = np.zeros(part.shape + (3,), np.uint8)
    glow = np.zeros(part.shape, bool)
    up = np.zeros_like(occ)
    up[:, :-1] = occ[:, 1:]
    top = occ & ~up
    X, Y, Z = np.indices(part.shape)
    for mid in np.unique(part.m[occ]):
        M = mats.MATS[mid]
        sel = part.m == mid
        if M["kind"] == "tile":
            for face_top in (True, False):
                s = sel & (top if face_top else ~top)
                if not s.any():
                    continue
                tn = M["tiles"]["top" if face_top else "side"]
                T = mats.TILES[tn]
                if face_top:
                    rows, cols = Z[s] % 16, X[s] % 16
                else:
                    rows, cols = 15 - (Y[s] % 16), X[s] % 16
                rgb[s] = T["rgba"][rows, cols, :3]
                if T["gmask"] is not None:
                    glow[s] = T["gmask"][rows, cols]
        else:
            t = part.t[sel].astype(int)
            idx = np.where(t == 255, M["base"], np.minimum(t, len(M["rgb"]) - 1))
            rgb[sel] = M["rgb"][idx]
            glow[sel] = M["kind"] == "glow"
    return rgb, glow


def voxelize(model, clip=None, phase=0.0, box=None):
    """→ (occ, rgb, glow, origin). box: optional (lo, hi) integer bounds shared by several frames."""
    poses = model.pose(clip, phase)
    pts, cols, glows = [], [], []
    for p in model.parts:
        occ = p.m > 0
        if not occ.any():
            continue
        rgb, gl = voxel_colors(p)
        V = np.argwhere(occ).astype(np.float32)
        P = (V[:, None, :] + SUB[None, :, :]).reshape(-1, 3)
        M = poses[id(p)]
        W = P @ M[:3, :3].T + M[:3, 3]
        pts.append(W)
        cols.append(np.repeat(rgb[occ], len(SUB), 0))
        glows.append(np.repeat(gl[occ], len(SUB), 0))
    W = np.concatenate(pts)
    C = np.concatenate(cols)
    Gl = np.concatenate(glows)
    if any(model.tilt):
        from vox import rot_matrix
        lo, hi = model.bounds_rest()
        c = (lo + hi) / 2
        W = (W - c) @ rot_matrix(*model.tilt).T + c
    I = np.floor(W).astype(int)
    if box is None:
        lo, hi = I.min(0), I.max(0) + 1
    else:
        lo, hi = box
    I -= lo
    shape = tuple(int(v) for v in (hi - lo))
    ok = np.all((I >= 0) & (I < np.array(shape)), axis=1)
    I, C, Gl = I[ok], C[ok], Gl[ok]
    occ = np.zeros(shape, bool)
    rgb = np.zeros(shape + (3,), np.uint8)
    glow = np.zeros(shape, bool)
    occ[I[:, 0], I[:, 1], I[:, 2]] = True
    rgb[I[:, 0], I[:, 1], I[:, 2]] = C
    glow[I[:, 0], I[:, 1], I[:, 2]] = Gl
    return occ, rgb, glow, lo


def frame_box(model, clip, frames):
    los, his = [], []
    for f in range(frames):
        occ, _, _, lo = voxelize(model, clip, f / frames)
        los.append(lo)
        his.append(lo + np.array(occ.shape))
    return np.min(los, 0), np.max(his, 0)


def stack_slices(occ, rgb, glow):
    """Sprite stack: one top-down slice per layer (bottom first), x → right, z → down. Lower layers are
    a step darker so the stack reads as a solid when the layers are drawn 1 px apart."""
    X, Y, Z = occ.shape
    out = np.zeros((Z, X * Y, 4), np.uint8)
    gout = np.zeros_like(out)
    for y in range(Y):
        sl = np.zeros((Z, X, 4), np.uint8)
        o = occ[:, y, :].T
        c = rgb[:, y, :].transpose(1, 0, 2).astype(np.float32)
        k = 0.72 + 0.28 * (y + 1) / Y
        sl[..., :3] = np.clip(c * k, 0, 255).astype(np.uint8)
        sl[..., 3] = np.where(o, 255, 0)
        g = glow[:, y, :].T & o
        out[:, y * X:(y + 1) * X] = sl
        gs = np.zeros_like(sl)
        gs[g] = sl[g]
        gs[g, :3] = rgb[:, y, :].transpose(1, 0, 2)[g]
        gout[:, y * X:(y + 1) * X] = gs
    return out, gout
