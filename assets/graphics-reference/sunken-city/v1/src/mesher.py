"""Greedy voxel mesher shared by the .glb and .obj exporters.

Faces are merged into big quads per material key: palette materials merge per colour (UVs point at one
palette texel), tile materials merge regardless of the texel (UVs are world-aligned, the 16×16 texture
repeats exactly like in the 2D renders). Units: 16 voxels = 1 metre.
"""
import numpy as np

import mats

DIRS = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
SCALE = 1.0 / 16.0


def _greedy(keys):
    """Rectangles over a 2D int array of keys (−1 = empty): [(i0, j0, i1, j1, key)] (exclusive ends)."""
    H, W = keys.shape
    used = np.zeros_like(keys, bool)
    out = []
    for i in range(H):
        j = 0
        while j < W:
            k = keys[i, j]
            if k < 0 or used[i, j]:
                j += 1
                continue
            j1 = j + 1
            while j1 < W and keys[i, j1] == k and not used[i, j1]:
                j1 += 1
            i1 = i + 1
            while i1 < H and np.all(keys[i1, j:j1] == k) and not used[i1, j:j1].any():
                i1 += 1
            used[i:i1, j:j1] = True
            out.append((i, j, i1, j1, int(k)))
            j = j1
    return out


class Palette:
    """Colours of palette materials → texel index in a 16×16 (or 32×32) texture."""
    def __init__(self):
        self.entries = []       # (rgb tuple, emissive rgb tuple, alpha)
        self.index = {}

    def get(self, rgb, erg, alpha):
        key = (tuple(int(v) for v in rgb), tuple(int(v) for v in erg), round(float(alpha), 2))
        if key not in self.index:
            self.index[key] = len(self.entries)
            self.entries.append(key)
        return self.index[key]

    def size(self):
        return 16 if len(self.entries) <= 256 else 32

    def uv(self, i):
        n = self.size()
        return ((i % n) + 0.5) / n, ((i // n) + 0.5) / n

    def images(self):
        n = self.size()
        base = np.zeros((n, n, 4), np.uint8)
        emi = np.zeros((n, n, 4), np.uint8)
        emi[..., 3] = 255
        base[..., 3] = 255
        for i, (rgb, erg, a) in enumerate(self.entries):
            base[i // n, i % n, :3] = rgb
            emi[i // n, i % n, :3] = erg
        return base, emi


def mesh_part(part, pal, center):
    """Quads of one part: dict material-key → lists (pos, nrm, uv, idx). center: the pivot (grid coords)."""
    occ = part.m > 0
    po = np.pad(occ, 1)
    X, Y, Z = occ.shape
    groups = {}
    for d, (dx, dy, dz) in enumerate(DIRS):
        nb = po[1 + dx:1 + dx + X, 1 + dy:1 + dy + Y, 1 + dz:1 + dz + Z]
        E = occ & ~nb
        if not E.any():
            continue
        ax = int(np.nonzero([dx, dy, dz])[0][0])
        sg = dx + dy + dz
        t1, t2 = [a for a in range(3) if a != ax]
        keymap = {}
        keys_all = np.full(occ.shape, -1, np.int64)
        code = part.m[E].astype(np.int64) * 256 + part.t[E]
        uq, inv_idx = np.unique(code, return_inverse=True)
        kv = np.zeros(len(uq), np.int64)
        for n_, c in enumerate(uq):
            mid, tone = int(c // 256), int(c % 256)
            M = mats.MATS[mid]
            if M["kind"] == "tile":
                fk = "top" if d == 2 else "bottom" if d == 3 else "side"
                gk = ("tile", M["tiles"][fk])
            else:
                rgb = M["rgb"][min(M["base"] if tone == 255 else tone, len(M["rgb"]) - 1)]
                erg = rgb if M["kind"] == "glow" else (0, 0, 0)
                pi = pal.get(rgb, erg, M.get("alpha", 1.0))
                gk = ("glass" if M.get("alpha", 1.0) < 1.0 else "pal", pi)
            if gk not in keymap:
                keymap[gk] = len(keymap)
            kv[n_] = keymap[gk]
        keys_all[E] = kv[inv_idx.ravel()]
        inv = {v: k for k, v in keymap.items()}
        for s in range(occ.shape[ax]):
            sl = [slice(None)] * 3
            sl[ax] = s
            kk = keys_all[tuple(sl)]               # 2D over (t1, t2)
            if (kk < 0).all():
                continue
            # merge tile faces of one texture together regardless of texel: remap palette-free keys
            for (i0, j0, i1, j1, k) in _greedy(kk):
                gk = inv[k]
                plane = s + (1 if sg > 0 else 0)
                quad = []
                for (a, b) in ((i0, j0), (i1, j0), (i1, j1), (i0, j1)):
                    p = [0.0, 0.0, 0.0]
                    p[ax], p[t1], p[t2] = plane, a, b
                    quad.append(p)
                # counter-clockwise seen from outside
                n = np.zeros(3)
                n[ax] = sg
                e1 = np.subtract(quad[1], quad[0])
                e2 = np.subtract(quad[2], quad[0])
                if np.dot(np.cross(e1, e2), n) < 0:
                    quad = quad[::-1]
                G = groups.setdefault(gk[0] if gk[0] != "tile" else ("tile", gk[1]), dict(pos=[], nrm=[], uv=[], idx=[]))
                base = len(G["pos"])
                for p in quad:
                    G["pos"].append([(p[0] - center[0]) * SCALE, (p[1] - center[1]) * SCALE, (p[2] - center[2]) * SCALE])
                    G["nrm"].append(n.tolist())
                    if gk[0] == "tile":
                        if d in (2, 3):
                            G["uv"].append([p[0] / 16.0, p[2] / 16.0])
                        else:
                            u = p[2] if d in (0, 1) else p[0]
                            G["uv"].append([u / 16.0, -p[1] / 16.0])
                    else:
                        G["uv"].append(list(pal.uv(gk[1])))
                G["idx"] += [base, base + 1, base + 2, base, base + 2, base + 3]
    return groups
