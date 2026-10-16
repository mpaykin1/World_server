"""Voxel models: a model is a little hierarchy of parts (a rig). Every part is a voxel grid of material ids
with a pivot; clips animate the parts procedurally — rotation / offset / scale as functions of the loop
phase (0…1), so motion is harmonic and loops seamlessly. One model feeds every output of the pack:
2D sprites, isometric 2.5D, sprite stacks and 3D (.glb with animations, .vox, .obj).

Coordinates: x → right, y → up, z → toward the viewer of the side view. 16 voxels = 1 block = 1 metre.
"""
import math

import numpy as np

import mats

TAU = math.pi * 2
DIR6 = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]


class Part:
    def __init__(self, model, name, shape, origin=(0, 0, 0), pivot=None, parent=None):
        self.model, self.name = model, name
        self.shape = tuple(int(s) for s in shape)
        self.m = np.zeros(self.shape, np.uint16)
        self.t = np.full(self.shape, 255, np.uint8)        # per-voxel ramp step (255 = material default)
        self.origin = np.array(origin, float)               # grid corner in the parent's grid space (rest pose)
        self.pivot = np.array(pivot if pivot is not None else [s / 2 for s in self.shape], float)
        self.parent = parent
        self.anim = {}                                      # clip → f(phase) → {'r': (rx, ry, rz), 't': (dx, dy, dz), 's': k}
        self._g = None

    # coordinate grids (voxel centres), cached
    @property
    def g(self):
        if self._g is None:
            self._g = [a.astype(np.float32) + 0.5 for a in np.indices(self.shape)]
        return self._g

    def occ(self):
        return self.m > 0

    # ── painting ──
    def fill(self, mask, mat, tone=None):
        mid = mats.get(mat) if isinstance(mat, str) else mat
        self.m[mask] = mid
        if tone is not None:
            self.t[mask] = tone
        else:
            self.t[mask] = 255
        return mask

    def paint(self, mask, mat, tone=None):
        """Recolour only voxels that already exist."""
        sel = mask & (self.m > 0)
        mid = mats.get(mat) if isinstance(mat, str) else mat
        self.m[sel] = mid
        self.t[sel] = 255 if tone is None else tone
        return sel

    def tone(self, mask, t):
        self.t[mask & (self.m > 0)] = t

    def carve(self, mask):
        self.m[mask] = 0
        self.t[mask] = 255

    # ── shapes (boolean masks over the grid) ──
    def ellipsoid(self, c, r):
        X, Y, Z = self.g
        return ((X - c[0]) / r[0]) ** 2 + ((Y - c[1]) / r[1]) ** 2 + ((Z - c[2]) / r[2]) ** 2 <= 1.0

    def sphere(self, c, r):
        return self.ellipsoid(c, (r, r, r))

    def box(self, lo, hi):
        X, Y, Z = self.g
        return (X >= lo[0]) & (X < hi[0]) & (Y >= lo[1]) & (Y < hi[1]) & (Z >= lo[2]) & (Z < hi[2])

    def cyl(self, axis, c, r, lo, hi):
        """Cylinder along axis 0/1/2; c = centre in the other two axes (in order), r radius."""
        G = self.g
        a = G[axis]
        o = [G[i] for i in range(3) if i != axis]
        return ((o[0] - c[0]) ** 2 + (o[1] - c[1]) ** 2 <= r * r) & (a >= lo) & (a < hi)

    def cone(self, axis, c, r0, r1, lo, hi):
        G = self.g
        a = G[axis]
        o = [G[i] for i in range(3) if i != axis]
        k = np.clip((a - lo) / max(hi - lo, 1e-6), 0, 1)
        r = r0 + (r1 - r0) * k
        return ((o[0] - c[0]) ** 2 + (o[1] - c[1]) ** 2 <= r * r) & (a >= lo) & (a < hi)

    def capsule(self, a, b, r, r1=None):
        X, Y, Z = self.g
        a, b = np.array(a, float), np.array(b, float)
        ab = b - a
        L2 = max(float(ab @ ab), 1e-9)
        t = np.clip(((X - a[0]) * ab[0] + (Y - a[1]) * ab[1] + (Z - a[2]) * ab[2]) / L2, 0, 1)
        dx, dy, dz = X - (a[0] + ab[0] * t), Y - (a[1] + ab[1] * t), Z - (a[2] + ab[2] * t)
        rr = r if r1 is None else r + (r1 - r) * t
        return dx * dx + dy * dy + dz * dz <= rr * rr

    def tube(self, pts, radii):
        m = np.zeros(self.shape, bool)
        for k in range(len(pts) - 1):
            m |= self.capsule(pts[k], pts[k + 1], radii[k], radii[k + 1])
        return m

    def torus(self, c, R, r, axis=1):
        G = self.g
        a = G[axis] - c[axis]
        o = [G[i] - c[i] for i in range(3) if i != axis]
        q = np.sqrt(o[0] ** 2 + o[1] ** 2) - R
        return q * q + a * a <= r * r

    def plane2d(self, mask2d, axis, lo, hi, at=(0, 0)):
        """Extrude a 2D mask (rows top→bottom) along `axis` (0 = x, 2 = z) between lo and hi.
        The mask's columns run along the other horizontal axis, rows along y (top row = highest y)."""
        h, w = mask2d.shape
        out = np.zeros(self.shape, bool)
        X, Y, Z = [np.floor(a).astype(int) for a in self.g]
        u = (Z if axis == 0 else X) - at[0]
        v = (h - 1) - (Y - at[1])
        A = X if axis == 0 else Z
        ok = (u >= 0) & (u < w) & (v >= 0) & (v < h) & (A >= lo) & (A < hi)
        out[ok] = mask2d[v[ok], u[ok]]
        return out

    def where(self, fn):
        X, Y, Z = self.g
        return fn(X, Y, Z)


class Model:
    def __init__(self, mid, name, cat, desc="", iso_dirs=4, tags=()):
        self.id, self.name, self.cat, self.desc = mid, name, cat, desc
        self.parts, self.clips = [], {}
        self.iso_dirs, self.tags = iso_dirs, list(tags)
        self.yaw0 = 0.0          # rest heading for iso renders (radians)
        self.tilt = (0, 0, 0)    # static pose for the whole model (e.g. a wreck lying on its side)

    def part(self, name, shape, origin=(0, 0, 0), pivot=None, parent=None):
        p = Part(self, name, shape, origin, pivot, parent)
        self.parts.append(p)
        return p

    def clip(self, name, ru, frames=8, fps=10):
        self.clips[name] = dict(name=name, ru=ru, frames=frames, fps=fps)

    def split(self, part, axis, cuts, names=None, reverse=False):
        """Cut a part into a chain of segments along an axis (a spine). cuts: grid coordinates of the cuts.
        The first segment keeps the name; every next one is a child of the previous, its pivot on the cut,
        so a rotation at one joint carries everything behind it (a wave travels down the chain).
        reverse=True chains from the high end (a fish's head at +x) toward the low end (its tail)."""
        edges = [0] + sorted(cuts) + [part.shape[axis]]
        spans = list(zip(edges[:-1], edges[1:]))
        if reverse:
            spans = spans[::-1]
        segs, prev, prev_abs = [], part.parent, None
        for i, (a, b) in enumerate(spans):
            if b <= a:
                continue
            sl = [slice(None)] * 3
            sl[axis] = slice(a, b)
            shape = list(part.shape)
            shape[axis] = b - a
            origin = np.array(part.origin, float)          # in the original part's parent space
            origin[axis] += a
            joint = (b if reverse else a) if segs else (a + b) / 2
            piv = np.array(part.pivot, float)
            piv[axis] = joint - a
            nm = (names[len(segs)] if names and len(segs) < len(names) else f"{part.name}{len(segs)}")
            q = Part(self, nm, shape, origin=origin if prev_abs is None else origin - prev_abs, pivot=piv, parent=prev)
            q.m[:] = part.m[tuple(sl)]
            q.t[:] = part.t[tuple(sl)]
            segs.append(q)
            prev, prev_abs = q, origin
        idx = self.parts.index(part)
        self.parts[idx:idx + 1] = segs
        return segs

    # ── transforms ──
    def pose(self, clip=None, phase=0.0):
        """4×4 matrices (grid space → model space) for every part at a phase of a clip."""
        mats_out = {}
        for p in self.parts:
            st = p.anim.get(clip)(phase) if clip and clip in p.anim else {}
            M = local_matrix(p, st)
            if p.parent is not None:
                M = mats_out[id(p.parent)] @ M
            mats_out[id(p)] = M
        return mats_out

    def bounds_rest(self):
        lo, hi = np.full(3, 1e9), np.full(3, -1e9)
        P = self.pose()
        for p in self.parts:
            occ = np.argwhere(p.occ())
            if not len(occ):
                continue
            pts = np.concatenate([occ, occ + 1]).astype(float)
            w = pts @ P[id(p)][:3, :3].T + P[id(p)][:3, 3]
            lo, hi = np.minimum(lo, w.min(0)), np.maximum(hi, w.max(0))
        return lo, hi

    def voxel_count(self):
        return int(sum((p.m > 0).sum() for p in self.parts))


def rot_matrix(rx, ry, rz):
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx                     # applied as X, then Y, then Z (glTF: quaternion of the same)


def local_matrix(p, st):
    r = st.get("r", (0, 0, 0))
    t = st.get("t", (0, 0, 0))
    s = st.get("s", 1.0)
    s3 = np.array(s if isinstance(s, (tuple, list)) else (s, s, s), float)
    M = np.eye(4)
    R = rot_matrix(*r) * s3[None, :]
    M[:3, :3] = R
    # grid point v → origin + pivot + t + R·(v − pivot)
    M[:3, 3] = p.origin + p.pivot + np.array(t, float) - R @ p.pivot
    return M


def wave(phase, k=0.0, amp=1.0, cycles=1):
    """A travelling wave sample: sin(τ·(cycles·phase) − k). k shifts it along a body chain."""
    return amp * math.sin(TAU * cycles * phase - k)


def noise3(shape, scale, seed=0, octaves=2):
    """Smooth 3D value noise in 0…1 on the grid (deterministic)."""
    rng = np.random.default_rng(seed)
    out = np.zeros(shape, np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = max(1, int(round(scale / (2 ** o))))
        dims = [d // s + 2 for d in shape]
        g = rng.random(dims).astype(np.float32)
        idx = [np.arange(d) / s for d in shape]
        i0 = [np.floor(a).astype(int) for a in idx]
        f = [a - b for a, b in zip(idx, i0)]
        f = [x * x * (3 - 2 * x) for x in f]
        X0, Y0, Z0 = np.ix_(*i0)
        FX, FY, FZ = np.ix_(*f)
        c = 0
        for dx in (0, 1):
            wx = FX if dx else 1 - FX
            for dy in (0, 1):
                wy = FY if dy else 1 - FY
                for dz in (0, 1):
                    wz = FZ if dz else 1 - FZ
                    c = c + g[X0 + dx, Y0 + dy, Z0 + dz] * wx * wy * wz
        out += amp * c
        tot += amp
        amp *= 0.5
    return out / tot


def exposed_top(occ):
    up = np.zeros_like(occ)
    up[:, :-1] = occ[:, 1:]
    return occ & ~up


def shell(occ):
    """Voxels on the surface of a solid (6-neighbour)."""
    p = np.pad(occ, 1)
    inner = p[2:, 1:-1, 1:-1] & p[:-2, 1:-1, 1:-1] & p[1:-1, 2:, 1:-1] & p[1:-1, :-2, 1:-1] & p[1:-1, 1:-1, 2:] & p[1:-1, 1:-1, :-2]
    return occ & ~inner
