"""Base island tiles (16×16, seamless): grass, dirt, stone, planks, sand, leaves, water, brick,
grass side, bark, log top. Light from the top-left, hue-shifted ramps, no outline on tiles."""
import numpy as np

from art.pixel import G, N, S, A, W, R, M, T, canvas, lut, pnoise, jitter, roll, hx
from art.pixel import wput as put, wstamp as stamp
from art.registry import tile


@tile("grass")
def tile_grass(seed=12):
    f = 0.8 * pnoise(4, seed) + 0.2 * pnoise(8, seed + 1)
    idx = np.full((T, T), 3)
    idx[f < np.quantile(f, 0.18)] = 2
    idx[f > np.quantile(f, 0.88)] = 4
    a = lut(G)[idx]
    rng = np.random.default_rng(seed + 2)
    blades = [["d.d", ".d."], ["d..d", ".dd."], ["d.", ".d"], [".d", "d."]]
    for x, y in jitter(rng, 4, 4, m=0.1):  # blade shadows with a lit tip above
        stamp(a, int(x), int(y), blades[rng.integers(len(blades))], {"d": G[2]})
        put(a, int(x), int(y) - 1, G[4])
    for x, y in jitter(rng, 3, 2, m=0.2):  # a few sun-caught tips
        put(a, int(x), int(y), G[5])
    return a


@tile("dirt")
def tile_dirt(seed=21):
    f = 0.6 * pnoise(4, seed) + 0.4 * pnoise(8, seed + 1)
    idx = np.full((T, T), 3)
    idx[f < np.quantile(f, 0.25)] = 2
    idx[f > np.quantile(f, 0.82)] = 4
    a = lut(N)[idx]
    rng = np.random.default_rng(seed + 2)
    for x, y in jitter(rng, 4, 4, m=0.1):  # clods: lit top-left, dark bottom-right
        x, y = int(x), int(y)
        put(a, x, y, N[4])
        put(a, x + 1, y + 1, N[2])
    peb = {"a": M[2], "b": M[1], "c": M[0], "d": N[1]}
    stamp(a, 3, 9, [".ab.", "abbc", ".ccd", "..dd"], peb)
    return a


@tile("stone")
def tile_stone(seed=32):
    rng = np.random.default_rng(seed)
    pts = np.array(jitter(rng, 2, 3, m=0.25))
    ys, xs = np.mgrid[0:T, 0:T] + 0.5
    dx = np.abs(xs[..., None] - pts[:, 0]); dx = np.minimum(dx, T - dx)
    dy = np.abs(ys[..., None] - pts[:, 1]); dy = np.minimum(dy, T - dy)
    d = np.sqrt(dx ** 2 + dy ** 2)
    order = np.argsort(d, -1)
    ds = np.take_along_axis(d, order, -1)
    cid = np.where(ds[..., 1] - ds[..., 0] < 1.1, -1, order[..., 0])
    tone = rng.choice([3, 3, 4, 4, 3], size=len(pts))
    idx = np.where(cid >= 0, tone[np.maximum(cid, 0)], 1)
    up, lf, dn, rt = roll(cid, 1, 0), roll(cid, 0, 1), roll(cid, -1, 0), roll(cid, 0, -1)
    st = cid >= 0
    hi = st & ((up != cid) | (lf != cid))
    lo = st & ((dn != cid) | (rt != cid))
    idx[hi & ~lo] += 1
    idx[lo & ~hi] -= 1
    idx[(cid < 0) & ((up >= 0) | (lf >= 0))] = 0
    for x, y in jitter(rng, 4, 4, m=0.1):
        x, y = int(x) % T, int(y) % T
        if st[y, x] and not hi[y, x] and not lo[y, x]:
            idx[y, x] -= 1
    return lut(S)[np.clip(idx, 0, 6)]


@tile("wood")
def tile_planks(seed=41):
    rng = np.random.default_rng(seed)
    a = canvas(T, T)
    seams = [5, 12, 2, 9]
    for b in range(4):
        y0 = b * 4
        base = 4 if b != 2 else 3
        rows = [N[base + 1], N[base], N[base]]
        for dy in range(3):
            a[y0 + dy, :] = hx(rows[dy])
        a[y0 + 3, :] = hx(N[1])
        for _ in range(2):  # grain streaks
            gy = y0 + 1 + rng.integers(2)
            gx = rng.integers(T)
            for k in range(rng.integers(3, 7)):
                put(a, gx + k, gy, N[base - 1])
        s = seams[b]
        for dy in range(3):
            put(a, s, y0 + dy, N[1])
            put(a, s + 1, y0 + dy, N[base + 1] if dy < 2 else N[base])
            put(a, s - 1, y0 + dy, N[base - 1])
        put(a, s + 2, y0 + 1, N[1])  # nails
        put(a, s - 2, y0 + 1, N[1])
    stamp(a, 10, 9, [".c.", "cdc", ".c."], {"c": N[2], "d": N[1]})
    return a


@tile("sand")
def tile_sand(seed=61):
    ys, xs = np.mgrid[0:T, 0:T]
    rip = np.sin(2 * np.pi * (ys / 8 + 0.16 * np.sin(2 * np.pi * xs / 16)))
    idx = np.full((T, T), 3)
    trough = rip > 0.80
    idx[trough] = 2
    idx[roll(trough, 1, 0) & ~trough] = 4  # lit lip under each ripple
    a = lut(A)[idx]
    rng = np.random.default_rng(seed)
    for x, y in jitter(rng, 4, 4, m=0.1):
        put(a, int(x), int(y), A[1])
    for x, y in jitter(rng, 3, 3, m=0.2):
        put(a, int(x), int(y), A[5])
    return a


@tile("leaves")
def tile_leaves(seed=71):
    rng = np.random.default_rng(seed)
    a = canvas(T, T, G[1])
    clump = [".ab.", "abbc", "bbcd", ".cd."]
    pts = sorted(jitter(rng, 4, 4, m=0.05), key=lambda p: p[1])
    for x, y in pts:
        x, y = int(x), int(y)
        dark = rng.random() < 0.3
        o = -1 if dark else 0
        stamp(a, x + 1, y + 1, [".xx.", "xxxx", "xxxx", ".xx."], {"x": G[0]})
        stamp(a, x, y, clump, {"a": G[5 + o], "b": G[4 + o], "c": G[3 + o], "d": G[2 + o]})
    return a


def water_frame(f, seed=81):
    """Frame f of a seamless 4-frame water loop."""
    base = 0.85 * pnoise(4, seed) + 0.15 * pnoise(8, seed + 1)
    idx = np.full((T, T), 3)
    idx[base < np.quantile(base, 0.28)] = 2
    a = lut(W)[idx]
    rng = np.random.default_rng(seed + 2)
    states = [[".hh."], ["lhhl", ".dd."], [".hh.", "l..l", ".dd."], [".ll."]]
    for x, y in jitter(rng, 3, 4, m=0.1):
        ph = (f + rng.integers(4)) % 4
        stamp(a, int(x), int(y), states[ph], {"h": W[5], "l": W[4], "d": W[2]})
    srng = np.random.default_rng(seed + 10 + f)
    for x, y in jitter(srng, 2, 1, m=0.2):
        put(a, int(x), int(y), W[6])
    return a


@tile("water")
def tile_water():
    return water_frame(0)


@tile("brick")
def tile_brick(seed=51):
    rng = np.random.default_rng(seed)
    a = canvas(T, T, M[2])
    for row in range(4):
        y0 = row * 4
        off = 0 if row % 2 == 0 else 4
        for k in range(2):
            x0 = off + k * 8
            t = int(rng.choice([2, 3, 3, 3, 4]))
            for dy in range(3):
                for dx in range(7):
                    c = R[t]
                    if dy == 0 or (dx == 0 and dy < 2):
                        c = R[min(t + 1, 5)]
                    if dy == 2 or (dx == 6 and dy > 0):
                        c = R[t - 1]
                    put(a, x0 + dx, y0 + dy, c)
            for dx in range(8):
                put(a, x0 + dx, y0 + 3, M[1])
            put(a, x0 + 7, y0, M[3])
            if rng.random() < 0.5:  # chip
                cx = x0 + 1 + rng.integers(5)
                put(a, cx, y0 + 1, R[max(t - 2, 0)])
                put(a, cx + 1, y0 + 1, R[min(t + 1, 5)])
    return a


@tile("grass_side")
def tile_grass_side(seed=5):
    """Dirt with a grass lip on top — stacks seamlessly on plain dirt below."""
    a = tile_dirt().copy()
    rng = np.random.default_rng(seed)
    drips = [1, 2, 1, 0, 1, 3, 2, 1, 0, 1, 2, 1, 3, 1, 0, 2]
    for x in range(T):
        put(a, x, 0, G[4] if x % 5 else G[5])
        put(a, x, 1, G[3])
        put(a, x, 2, G[3] if (x * 7) % 3 else G[4])
        put(a, x, 3, G[2])
        L = drips[x]
        for k in range(L):
            put(a, x, 4 + k, G[3] if k < L - 1 else G[2])
        put(a, x, 4 + L, N[1])
        if rng.random() < 0.5:
            put(a, x, 5 + L, N[2])
    for x in (2, 9, 13):
        put(a, x, 1, G[5])
    return a


@tile("bark")
def tile_bark(seed=9):
    a = canvas(T, T, N[2])
    f = pnoise(4, seed)[0]
    for x in range(T):
        base = 3 if f[x] > 0.55 else 2
        for y in range(T):
            put(a, x, y, N[base])
    for x in range(T):
        if f[x] > 0.55 and f[(x - 1) % T] <= 0.55:
            for y in range(T):
                put(a, x, y, N[4])
    rng = np.random.default_rng(seed + 1)
    for x, y in jitter(rng, 4, 2, m=0.1):  # cracks
        L = rng.integers(3, 7)
        for k in range(L):
            put(a, int(x), int(y) + k, N[1])
    for x, y in jitter(rng, 3, 3, m=0.2):
        put(a, int(x), int(y), N[4])
    return a


@tile("log_top")
def tile_log_top():
    a = canvas(T, T)
    c = 7.5
    for y in range(T):
        for x in range(T):
            d = np.hypot(x - c, y - c)
            if d > 7.1:
                col = N[2]
            elif d > 6.2:
                col = N[3]
            elif int(d) in (2, 4) or d < 0.9:
                col = N[3]
            else:
                col = N[5] if d < 3.5 else N[4]
            a[y, x] = hx(col)
    for (x, y) in [(0, 0), (15, 0), (0, 15), (15, 15)]:
        a[y, x] = hx(N[1])
    return a
