"""Offline voxel → pixel-art renderer: the side view (2D sprites) and the isometric view (2.5D).

Every exposed voxel face is sampled (s×s points), carried through the rig pose, projected and depth-tested.
Shading never multiplies RGB: each pixel steps along its own ramp — lit by a fixed top-left light,
darkened by ambient occlusion and depth, bevelled on the silhouette — and gets a 1 px #1a1326 outline.
Glow materials ignore the light and also go into a separate glow mask.
"""
import math

import numpy as np

import mats
from pixel import hx, OUTLINE, BAYER4

DIRS = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]


def _n(*v):
    a = np.array(v, float)
    return a / np.linalg.norm(a)


# light fixed to the screen: top-left (and a little toward the viewer)
VIEWS = {
    "side": dict(L=_n(-0.42, 0.57, 0.72), k=2.4, c_ramp=0.33, c_tile=0.72, kt=2.6, fog=11.0, sub=2, edge=2.2),
    "iso": dict(L=_n(0.2, 0.83, 0.52), k=2.4, c_ramp=0.45, c_tile=0.80, kt=3.2, fog=16.0, sub=3, edge=3.5),
}
AO_STEP = np.array([1.6, 1.0, 0.45, 0.0])     # steps of darkening for AO levels 0..3
_REST = {}


def _blur(f):
    for ax in range(3):
        pad = [(2, 2) if i == ax else (0, 0) for i in range(3)]
        p = np.pad(f, pad)
        n = f.shape[ax]

        def sl(o):
            return tuple(slice(o, o + n) if i == ax else slice(None) for i in range(3))
        f = (p[sl(0)] + 4 * p[sl(1)] + 6 * p[sl(2)] + 4 * p[sl(3)] + p[sl(4)]) / 16.0
    return f


def smooth_normals(occ):
    f = _blur(occ.astype(np.float32))
    p = np.pad(f, 1)
    g = np.stack([p[2:, 1:-1, 1:-1] - p[:-2, 1:-1, 1:-1], p[1:-1, 2:, 1:-1] - p[1:-1, :-2, 1:-1], p[1:-1, 1:-1, 2:] - p[1:-1, 1:-1, :-2]], -1)
    n = -g
    L = np.linalg.norm(n, axis=-1, keepdims=True)
    return n / np.maximum(L, 1e-6)


def rest_samples(part):
    """Face samples of one part in its own grid space (cached): positions, normals and colour data."""
    key = id(part)
    if key in _REST and _REST[key]["ver"] == part.m.sum():
        return _REST[key]
    occ = part.m > 0
    po = np.pad(occ, 1)
    sn = smooth_normals(occ)
    out = {s: dict(P=[], N=[], rid=[], step=[], kind=[], alpha=[], tile=[]) for s in (2, 3)}
    for d, (dx, dy, dz) in enumerate(DIRS):
        nb = po[1 + dx:1 + dx + occ.shape[0], 1 + dy:1 + dy + occ.shape[1], 1 + dz:1 + dz + occ.shape[2]]
        E = occ & ~nb
        if not E.any():
            continue
        V = np.argwhere(E)                                   # (n, 3)
        mid = part.m[E]
        tone = part.t[E]
        ax = int(np.nonzero([dx, dy, dz])[0][0])
        sg = dx + dy + dz
        t1, t2 = [a for a in range(3) if a != ax]
        # ambient occlusion at the 4 corners of every face
        o = V + np.array([dx, dy, dz]) + 1                    # outside cell, padded coords
        e1, e2 = np.eye(3, dtype=int)[t1], np.eye(3, dtype=int)[t2]
        corners = []
        for a, b in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            s1 = po[tuple((o + a * e1).T)]
            s2 = po[tuple((o + b * e2).T)]
            c = po[tuple((o + a * e1 + b * e2).T)]
            corners.append(np.where(s1 & s2, 0, 3 - (s1.astype(int) + s2 + c)))
        corners = np.stack(corners, 1).astype(np.float32)     # (n, 4)
        # colour data per face (ramp id, base step, kind)
        rid = np.zeros(len(V), np.int16)
        st = np.zeros(len(V), np.float32)
        kind = np.zeros(len(V), np.uint8)
        alpha = np.ones(len(V), np.float32)
        is_tile = np.zeros(len(V), bool)
        for m_id in np.unique(mid):
            M = mats.MATS[m_id]
            sel = mid == m_id
            if M["kind"] == "tile":
                tname = M["tiles"]["top" if d == 2 else "bottom" if d == 3 else "side"]
                T = mats.TILES[tname]
                vs = V[sel]
                if d in (2, 3):
                    u, row = vs[:, 0] % 16, vs[:, 2] % 16
                else:
                    u = (vs[:, 2] if d in (0, 1) else vs[:, 0]) % 16
                    row = 15 - (vs[:, 1] % 16)
                rid[sel] = T["idx"][row, u, 0]
                st[sel] = T["idx"][row, u, 1]
                is_tile[sel] = True
                if T["gmask"] is not None:
                    kind[sel] = np.where(T["gmask"][row, u], 1, 0)
            else:
                rid[sel] = M["rid"]
                tt = tone[sel].astype(np.float32)
                st[sel] = np.where(tt == 255, M["base"], tt)
                kind[sel] = 1 if M["kind"] == "glow" else 0
                if M.get("alpha", 1.0) < 1.0:
                    kind[sel] = kind[sel] + 2
                    alpha[sel] = M["alpha"]
        fn = np.zeros(3)
        fn[ax] = sg
        nrm = np.where(is_tile[:, None], fn[None, :], fn[None, :] * 0.9 + sn[E] * 1.25)
        nrm = np.where((alpha < 1.0)[:, None], sn[E] + fn[None, :] * 0.05, nrm)     # glass: a smooth surface
        nrm = nrm / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-6)
        for s in (2, 3):
            uu, ww = np.meshgrid((np.arange(s) + 0.5) / s, (np.arange(s) + 0.5) / s, indexing="ij")
            uu, ww = uu.ravel(), ww.ravel()
            off = np.zeros((s * s, 3), np.float32)
            off[:, ax] = 1.0 if sg > 0 else 0.0
            off[:, t1], off[:, t2] = uu, ww
            P = (V[:, None, :] + off[None, :, :]).reshape(-1, 3)
            ao = (corners[:, None, 0] * (1 - uu) * (1 - ww) + corners[:, None, 1] * uu * (1 - ww)
                  + corners[:, None, 2] * (1 - uu) * ww + corners[:, None, 3] * uu * ww).reshape(-1)
            aod = np.interp(ao, [0, 1, 2, 3], AO_STEP)
            R = out[s]
            R["P"].append(P.astype(np.float32))
            R["N"].append(np.repeat(nrm, s * s, 0).astype(np.float32))
            R["rid"].append(np.repeat(rid, s * s))
            R["step"].append(np.repeat(st, s * s) - aod.astype(np.float32))
            R["kind"].append(np.repeat(kind, s * s))
            R["alpha"].append(np.repeat(alpha, s * s))
            R["tile"].append(np.repeat(is_tile, s * s))
    for s in (2, 3):
        R = out[s]
        for k in R:
            R[k] = np.concatenate(R[k]) if R[k] else np.zeros((0, 3) if k in ("P", "N") else (0,))
    res = {2: out[2], 3: out[3], "ver": part.m.sum()}
    _REST[key] = res
    return res


def ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def project(model, view="side", yaw=0.0, clip=None, phase=0.0):
    """All face samples of a model, posed and projected: screen x/y, depth and shading inputs."""
    V = VIEWS[view]
    s = V["sub"]
    poses = model.pose(clip, phase)
    lo, hi = model.bounds_rest()
    c = (lo + hi) / 2
    from vox import rot_matrix
    Rt = rot_matrix(*model.tilt)
    Rv = ry(yaw + (model.yaw0 if view == "iso" else 0.0)) @ Rt
    if view == "side" and getattr(model, "view2d", None):          # flat things are seen a little from above in 2D
        Rv = rot_matrix(*model.view2d) @ Rv
    chunks = []
    for p in model.parts:
        R = rest_samples(p)[s]
        if not len(R["P"]):
            continue
        M = poses[id(p)]
        P = R["P"] @ M[:3, :3].T + M[:3, 3]
        A = M[:3, :3]
        N = R["N"] @ A.T
        N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-6)
        Q = (P - c) @ Rv.T + c
        Nq = N @ Rv.T
        st = p.anim[clip](phase) if clip and clip in p.anim else {}
        gd = float(st.get("glow", 0.0))                      # a clip may brighten / dim this part's glow
        chunks.append((Q, Nq, R, gd))
    Q = np.concatenate([q for q, _, _, _ in chunks])
    N = np.concatenate([n for _, n, _, _ in chunks])
    cat = lambda k: np.concatenate([r[k] for _, _, r, _ in chunks])
    gdelta = np.concatenate([np.full(len(r["P"]), gd, np.float32) for _, _, r, gd in chunks])
    if view == "side":
        sx, sy, dep = Q[:, 0], -Q[:, 1], Q[:, 2]
    else:
        sx, sy, dep = Q[:, 0] - Q[:, 2], 0.5 * (Q[:, 0] + Q[:, 2]) - Q[:, 1], Q[:, 0] + Q[:, 1] + Q[:, 2]
    lam = N @ V["L"]
    tile = cat("tile")
    kind = cat("kind")
    glow = (kind % 2) == 1
    d_ramp = np.round(V["k"] * (lam - V["c_ramp"]))
    d_tile = np.round(V["kt"] * (lam - V["c_tile"]))
    delta = np.where(tile, d_tile, d_ramp)
    delta = np.where(glow, np.clip(np.round(0.9 * (lam - 0.4)), -1, 0), delta)
    step = cat("step") + delta + np.where(glow, gdelta, 0.0)
    # glass: opaque at the rim, clear where it faces the viewer (bubbles, domes, portholes read as glass)
    vdir = np.array([0.0, 0.0, 1.0]) if view == "side" else np.array([1.0, 1.0, 1.0]) / math.sqrt(3)
    facing = np.abs(N @ vdir)
    alpha = np.where(kind >= 2, np.clip(cat("alpha") * (1.7 - 1.45 * facing), 0.0, 1.0), cat("alpha"))
    return dict(sx=sx, sy=sy, dep=dep, rid=cat("rid"), step=step.astype(np.float32), kind=kind, alpha=alpha, view=view)


def bounds(projs, pad=2):
    x0 = min(float(p["sx"].min()) for p in projs)
    y0 = min(float(p["sy"].min()) for p in projs)
    x1 = max(float(p["sx"].max()) for p in projs)
    y1 = max(float(p["sy"].max()) for p in projs)
    x0, y0 = math.floor(x0) - pad, math.floor(y0) - pad
    return x0, y0, int(math.ceil(x1)) + pad - x0 + 1, int(math.ceil(y1)) + pad - y0 + 1


def raster(pr, box):
    """Depth-test the samples into a canvas: per-pixel ramp id, step, kind, depth."""
    x0, y0, W, H = box
    ix = np.floor(pr["sx"] - x0).astype(np.int64)
    iy = np.floor(pr["sy"] - y0).astype(np.int64)
    ok = (ix >= 0) & (iy >= 0) & (ix < W) & (iy < H)
    glass = pr["kind"] >= 2
    if glass.any() and not pr.get("_inner"):
        # translucent voxels: the glass keeps a 1 px rim and a sparse dither, the inside shows what is behind it
        full = raster(dict(pr, _inner=True), box)
        bg = raster(dict({k: (v[~glass] if isinstance(v, np.ndarray) and v.shape[:1] == glass.shape else v) for k, v in pr.items()}, _inner=True), box) if (~glass).any() else None
        gp = full["mask"] & (full["kind"] >= 2)
        pg = np.pad(gp, 1)
        inner = pg[:-2, 1:-1] & pg[2:, 1:-1] & pg[1:-1, :-2] & pg[1:-1, 2:]
        yy, xx = np.mgrid[0:H, 0:W]
        keep = gp & (~inner | (BAYER4[yy % 4, xx % 4] < 0.22))
        out = {k: (v.copy() if isinstance(v, np.ndarray) else v) for k, v in full.items()}
        see = gp & ~keep
        for k in ("mask", "rid", "step", "kind", "dep"):
            if bg is not None:
                out[k][see] = bg[k][see]
            else:
                out[k][see] = False if k == "mask" else 0
        if bg is None:
            out["mask"][see] = False
        return out
    ix, iy = ix[ok], iy[ok]
    pix = iy * W + ix
    dep = pr["dep"][ok]
    order = np.lexsort((dep, pix))
    ps = pix[order]
    last = np.r_[ps[1:] != ps[:-1], True]
    sel = order[last]
    pid = pix[sel]
    out = dict(W=W, H=H, view=pr["view"])
    out["mask"] = np.zeros(H * W, bool)
    out["mask"][pid] = True
    for k, dt, fill in (("rid", np.int16, 0), ("step", np.float32, 0), ("kind", np.uint8, 0), ("dep", np.float32, -1e9)):
        a = np.full(H * W, fill, dt)
        src = pr[k][ok] if k != "dep" else dep
        a[pid] = src[sel]
        out[k] = a
    for k in ("mask", "rid", "step", "kind", "dep"):
        out[k] = out[k].reshape(H, W)
    return out


def finish(r, outline=True, fog=True, bevel=True):
    """Pixel-art finishing: depth fog, inner depth edges, bevel, ramp lookup, outline → RGBA + glow RGBA."""
    V = VIEWS[r["view"]]
    m, step, kind, dep = r["mask"], r["step"].copy(), r["kind"], r["dep"]
    glow = (kind % 2 == 1) & m
    lit = m & ~glow
    if fog and m.any():
        # recesses darken against their own surroundings (a local front), not against the whole model
        dd = np.where(m, dep, -1e9)
        rad = 4
        pd = np.pad(dd, rad, constant_values=-1e9)
        front = dd.copy()
        for oy in range(-rad, rad + 1):
            for ox in range(-rad, rad + 1):
                front = np.maximum(front, pd[rad + oy:rad + oy + m.shape[0], rad + ox:rad + ox + m.shape[1]])
        step -= np.where(lit, np.clip((front - dep) / V["fog"], 0, 2.0), 0)
    # inner depth edges: a pixel just behind a nearer neighbour gets a step darker (reads like a hand-drawn line)
    p = np.pad(dep, 1, constant_values=-1e9)
    nearer = np.zeros_like(m)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nb = p[1 + dy:1 + dy + m.shape[0], 1 + dx:1 + dx + m.shape[1]]
        nearer |= nb > dep + V["edge"]
    step -= np.where(lit & nearer, 1.0, 0.0)
    if bevel:
        pm = np.pad(m, 1)
        up, lf = pm[:-2, 1:-1], pm[1:-1, :-2]
        dn, rt = pm[2:, 1:-1], pm[1:-1, 2:]
        top_left = lit & (~up | ~lf) & dn & rt
        bot_right = lit & (~dn | ~rt) & up & lf
        step += np.where(top_left, 1.0, 0.0)
        step -= np.where(bot_right, 1.0, 0.0)
    T, lens = mats.ramp_rgb_table()
    rid = r["rid"].astype(int)
    si = np.clip(np.round(step), 0, lens[rid] - 1).astype(int)
    rgba = np.zeros(m.shape + (4,), np.uint8)
    rgba[m, :3] = T[rid[m], si[m]]
    rgba[m, 3] = 255
    g = np.zeros_like(rgba)
    g[glow] = rgba[glow]
    if outline:
        pm = np.pad(m, 1)
        ring = (pm[:-2, 1:-1] | pm[2:, 1:-1] | pm[1:-1, :-2] | pm[1:-1, 2:]) & ~m
        rgba[ring] = hx(OUTLINE)
    return rgba, g


def render(model, view="side", yaw=0.0, clip=None, phase=0.0, box=None, pad=2):
    pr = project(model, view, yaw, clip, phase)
    if box is None:
        box = bounds([pr], pad)
    r = raster(pr, box)
    rgba, g = finish(r)
    return rgba, g, box


def render_set(model, view, yaws, clip=None, frames=1, pad=2):
    """A grid of renders sharing one canvas: rows = directions (yaws), columns = animation frames."""
    projs = [[project(model, view, y, clip, f / frames) for f in range(frames)] for y in yaws]
    box = bounds([p for row in projs for p in row], pad)
    rows, grows = [], []
    for row in projs:
        imgs = [finish(raster(p, box)) for p in row]
        rows.append(np.concatenate([a for a, _ in imgs], 1))
        grows.append(np.concatenate([g for _, g in imgs], 1))
    return np.concatenate(rows, 0), np.concatenate(grows, 0), box
