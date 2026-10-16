"""Gothic building kit: lancet arch masks, extrusions, crumbling, moss that grows on ledges and drips,
lanterns. Everything works on a vox.Part grid (16 voxels = 1 block, one tile texel per voxel)."""
import math

import numpy as np

from vox import noise3, exposed_top


def lancet(X, Y, x0, x1, spring, pointed=1.0):
    """Inside of a pointed (lancet) opening between x0..x1, springing at y=spring.
    pointed: 1 = equilateral arch (radius = span), 0.5 = flatter, 0 → round arch."""
    span = x1 - x0
    r = span * (0.5 + 0.5 * pointed)
    cl = x0 + r if pointed else (x0 + x1) / 2
    cr = x1 - r if pointed else (x0 + x1) / 2
    below = (X >= x0) & (X < x1) & (Y < spring)
    left = (X - cr) ** 2 + (Y - spring) ** 2 <= r * r
    right = (X - cl) ** 2 + (Y - spring) ** 2 <= r * r
    top = (Y >= spring) & left & right & (X >= x0) & (X < x1)
    return below | top


def apex(x0, x1, spring, pointed=1.0):
    span = x1 - x0
    r = span * (0.5 + 0.5 * pointed)
    h = math.sqrt(max(r * r - (span / 2) ** 2, 0))
    return spring + (h if pointed else span / 2)


def crumble(p, seed, depth=5, k=0.55, top_only=True):
    """Erode a structure: noise bites chunks out of its upper surfaces (a ruin, not a model kit)."""
    occ = p.m > 0
    n = noise3(p.shape, 6, seed, 2)
    cols = occ.any(axis=1)
    h = np.where(cols, p.shape[1] - 1 - np.argmax(occ[:, ::-1, :], axis=1), -1)     # top of every column
    Y = p.g[1]
    near_top = (h[:, None, :] - Y) < depth * n
    bite = occ & near_top & (n > k)
    if not top_only:
        bite |= occ & (n > k + 0.25)
    p.carve(bite)


def grow_moss(p, seed, colors, amount=0.5, drip=6, cushions=True):
    """Moss settles on every ledge: top surfaces turn into mossy tiles, glowing cushions sit on them and
    luminous threads drip down the walls. colors: list of moss colour names (patches pick one each)."""
    occ = p.m > 0
    top = exposed_top(occ)
    n = noise3(p.shape, 10, seed, 2)
    hue = noise3(p.shape, 22, seed + 1, 1)
    sel = top & (n > 1 - amount)
    import mats
    for i, c in enumerate(colors):
        lo, hi = i / len(colors), (i + 1) / len(colors)
        part_sel = sel & (hue >= lo) & (hue < hi) if len(colors) > 1 else sel
        tile_ids = [mats.get(f"t_mossy_{c}")]
        p.m[part_sel & ~glass_mask(p)] = tile_ids[0]
        p.t[part_sel] = 255
    rng = np.random.default_rng(seed)
    if cushions:
        xs, ys, zs = np.nonzero(sel)
        for k in rng.choice(len(xs), size=min(len(xs), max(1, len(xs) // 40)), replace=False) if len(xs) else []:
            x, y, z = xs[k], ys[k], zs[k]
            c = colors[min(len(colors) - 1, int(hue[x, y, z] * len(colors)))]
            r = rng.uniform(0.9, 1.9)
            ball = p.sphere((x + 0.5, y + 1.0, z + 0.5), r) & (p.m == 0)
            p.fill(ball, c + "_dim")
            p.fill(p.sphere((x + 0.2, y + 1.0 + r * 0.6, z + 0.3), 0.55) & (p.m == 0), c + "_hot")
    if drip:
        xs, ys, zs = np.nonzero(sel)
        for k in rng.choice(len(xs), size=min(len(xs), max(1, len(xs) // 30)), replace=False) if len(xs) else []:
            x, y, z = xs[k], ys[k], zs[k]
            c = colors[min(len(colors) - 1, int(hue[x, y, z] * len(colors)))]
            # find the open side and hang a thread down the face
            for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                X, Z = x + dx, z + dz
                if 0 <= X < p.shape[0] and 0 <= Z < p.shape[2] and p.m[X, y, Z] == 0:
                    L = int(rng.integers(2, drip + 1))
                    for d in range(L):
                        if y - d < 0 or p.m[X, y - d, Z] != 0:
                            break
                        p.m[X, y - d, Z] = mats.get(c + ("_dim" if d else ""))
                        p.t[X, y - d, Z] = 255
                    break


def glass_mask(p):
    import mats
    ids = [mats.get(n) for n in ("t_glass_rose", "t_glass_azure", "t_glass_amber")]
    return np.isin(p.m, ids)


def lantern(p, x, y, z, glow="amber", cage="iron"):
    """A small gothic lantern: iron cage, glowing core, a finial."""
    p.fill(p.box((x - 2, y, z - 2), (x + 2, y + 1, z + 2)), cage)
    p.fill(p.box((x - 1.5, y + 1, z - 1.5), (x + 1.5, y + 5, z + 1.5)), glow)
    p.fill(p.box((x - 2, y + 5, z - 2), (x + 2, y + 6, z + 2)), cage)
    p.fill(p.box((x - 0.5, y + 6, z - 0.5), (x + 0.5, y + 8, z + 0.5)), cage)
    for cx, cz in ((x - 2, z - 2), (x + 1, z - 2), (x - 2, z + 1), (x + 1, z + 1)):
        p.fill(p.box((cx, y + 1, cz), (cx + 1, y + 5, cz + 1)), cage)


def pinnacle(p, x, z, y0, y1, w, mat="t_brick", tip="amber_hot"):
    """A tapering square pinnacle with a glowing finial (crockets as notches along the edges)."""
    X, Y, Z = p.g
    k = np.clip((Y - y0) / max(y1 - y0, 1), 0, 1)
    half = w / 2 * (1 - k) + 0.6
    body = (np.abs(X - x) <= half) & (np.abs(Z - z) <= half) & (Y >= y0) & (Y < y1)
    crock = body & ((Y.astype(int) % 5) == 0) & ((np.abs(X - x) > half - 1.2) | (np.abs(Z - z) > half - 1.2))
    p.fill(body, mat)
    p.fill(crock, "stone", 5)
    p.fill(p.box((x - 0.5, y1, z - 0.5), (x + 0.5, y1 + 2, z + 0.5)), tip)
