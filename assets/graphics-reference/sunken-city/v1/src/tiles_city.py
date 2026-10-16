"""Tiles of the drowned gothic city (16×16, seamless): ashlar, weathered ashlar, ashlar overgrown with
glowing moss in six colours, moss carpets, paving, tracery frieze, fluted column, stained glass.
Light from the top-left, hue-shifted ramps, no outline on tiles; glow layers go to the emissive mask."""
import numpy as np

from pixel import T, canvas, lut, pnoise, jitter, hx, BAYER4
from pixel import wput as put
from ramps import STONE, STONE_D, KELP, GLOWS, GLOW_RU, IRON, OUTLINE
from tilereg import tile


def ashlar(ramp, seed, course=4, block=8, stagger=4, cracks=1):
    """Gothic ashlar: courses of dressed blocks with sunken mortar joints, each block bevelled."""
    rng = np.random.default_rng(seed)
    idx = np.zeros((T, T), int)
    bid = np.zeros((T, T), int)
    for y in range(T):
        row = y // course
        off = (row * stagger) % block
        for x in range(T):
            bid[y, x] = row * 100 + ((x + off) // block) % (T // block)
    tone = {b: rng.choice([3, 3, 4, 3, 2]) for b in np.unique(bid)}
    for y in range(T):
        for x in range(T):
            idx[y, x] = tone[bid[y, x]]
    up, lf = np.roll(bid, 1, 0), np.roll(bid, 1, 1)
    dn, rt = np.roll(bid, -1, 0), np.roll(bid, -1, 1)
    joint = (dn != bid) | (rt != bid)                 # the joint sits on the bottom/right edge of each block
    lit = ((up != bid) | (lf != bid)) & ~joint
    idx[lit] += 1
    shade = ((np.roll(joint, 1, 0) | np.roll(joint, 1, 1)) & ~joint & ~lit)
    idx[joint] = 0
    idx[(np.roll(joint, -1, 0) & ~joint)] = np.maximum(idx[(np.roll(joint, -1, 0) & ~joint)] - 1, 1)
    f = pnoise(4, seed + 3)
    idx[(f > np.quantile(f, 0.86)) & ~joint & ~lit] -= 1          # weathering
    a = lut(ramp)[np.clip(idx, 0, len(ramp) - 1)]
    for x, y in jitter(rng, 3, 3, m=0.2):                      # chips: lit dot above a dark dot
        x, y = int(x), int(y)
        if not joint[y % T, x % T] and not joint[(y + 1) % T, x % T]:
            put(a, x, y, ramp[1])
            put(a, x, y - 1, ramp[min(len(ramp) - 1, 5)])
    for _ in range(cracks):                                    # a hairline crack across one block
        x, y = rng.integers(T), rng.integers(T)
        for k in range(rng.integers(3, 6)):
            put(a, x + k, y + (k // 2) * rng.choice([-1, 1]), ramp[0])
    return a, joint


@tile("brick", "Готическая кладка")
def t_brick():
    a, _ = ashlar(STONE, 101)
    return a


@tile("brick_dark", "Кладка в водорослях")
def t_brick_dark():
    a, joint = ashlar(STONE_D, 113, cracks=2)
    rng = np.random.default_rng(114)
    f = pnoise(4, 115)
    for y in range(T):                                          # algae streaks hang from the joints
        for x in range(T):
            if joint[y, x] and f[y, x] > 0.45:
                put(a, x, y, KELP[2])
                if rng.random() < 0.6:
                    put(a, x, y + 1, KELP[1])
    return a


def cushion(a, g, cx, cy, r, ramp, rng, glow_from=2):
    """One luminous moss cushion (wraps around the tile): dim body, brighter heart offset to the top-left,
    a lit crescent, a dark rim at the bottom-right and a few hot spores."""
    ys, xs = np.mgrid[0:T, 0:T] + 0.5
    dx = (xs - cx + T / 2) % T - T / 2
    dy = (ys - cy + T / 2) % T - T / 2
    d = np.sqrt(dx * dx + dy * dy * 1.15)
    body = d <= r
    heart = np.sqrt((dx + 0.9) ** 2 + (dy + 0.9) ** 2 * 1.15) <= r - 1.2
    cres = body & ~np.roll(np.roll(body, 1, 0), 1, 1)
    rim = body & ~np.roll(np.roll(body, -1, 0), -1, 1)
    lvl = np.where(heart, 2, 1)
    lvl = np.where(cres, 3, lvl)
    lvl = np.where(rim & ~cres, 0, lvl)
    for y, x in zip(*np.nonzero(body)):
        c = ramp[int(lvl[y, x])]
        a[y, x] = hx(c)
        if lvl[y, x] >= glow_from:
            g[y, x] = hx(c)
        else:
            g[y, x] = (0, 0, 0, 0)
    for k in range(rng.integers(1, 3)):
        ox, oy = rng.integers(-1, 2), rng.integers(-1, 1)
        sp = ramp[5] if k == 0 else ramp[4]
        put(a, int(cx - r * 0.35) + ox, int(cy - r * 0.35) + oy, sp); put(g, int(cx - r * 0.35) + ox, int(cy - r * 0.35) + oy, sp)
    return body


def moss_cover(a, glow_ramp, seed, cover=0.5, mortar=None, drip=True):
    """Grow luminous moss on a tile as cushions: dark mat between them, glowing hearts and spores.
    cover: share of the tile under moss (0..1). The glowing pixels go into the glow mask."""
    rng = np.random.default_rng(seed)
    g = canvas(T, T)
    n = 3 if cover < 0.6 else 6
    pts = jitter(rng, 3 if n > 3 else 2, 2, m=0.15)
    if cover < 0.6:
        pts = pts[:n]
    if cover >= 0.6:                                            # a dark mat under a full carpet
        mat = pnoise(4, seed + 9) > 0.45
        for y in range(T):
            for x in range(T):
                a[y, x] = hx(glow_ramp[0] if mat[y, x] else KELP[0])
    if mortar is not None:                                      # thin moss threads along the joints
        thr = pnoise(8, seed + 2) > 0.5
        for y, x in zip(*np.nonzero(mortar & thr)):
            a[y, x] = hx(glow_ramp[1])
            if (x + y) % 3 == 0:
                a[y, x] = hx(glow_ramp[2]); g[y, x] = hx(glow_ramp[2])
    for x, y in sorted(pts, key=lambda p: p[1]):
        r = rng.uniform(2.6, 3.8) if cover < 0.6 else rng.uniform(3.2, 4.4)
        cushion(a, g, x, y, r, glow_ramp, rng)
    if drip:                                                    # a few glowing drips below
        for k in range(2):
            x = int(rng.integers(T))
            y0 = int(rng.integers(T))
            for d in range(rng.integers(2, 4)):
                c = glow_ramp[3 if d == 0 else 2]
                put(a, x, y0 + d, c); put(g, x, y0 + d, c)
    return a, g


for _c, _r in GLOWS.items():
    def _mk(c=_c, r=_r):
        @tile(f"brick_moss_{c}", f"Кладка, {GLOW_RU[c]} мох", glow=True)
        def t():
            a, joint = ashlar(STONE_D, 131 + len(c))
            return moss_cover(a, r, 140 + len(c) * 7, cover=0.34, mortar=joint)

        @tile(f"moss_{c}", f"Сияющий мох, {GLOW_RU[c]}", glow=True)
        def t2():
            f = pnoise(4, 150 + len(c))
            a = lut(KELP)[np.where(f > 0.5, 2, 1)]
            return moss_cover(a, r, 160 + len(c) * 5, cover=0.92, drip=False)
    _mk()


@tile("paving", "Плиты мостовой")
def t_paving():
    rng = np.random.default_rng(171)
    a = canvas(T, T, STONE[3])
    idx = np.full((T, T), 3)
    # two big slabs per row, offset; joints dark, slabs bevelled
    for y in range(T):
        for x in range(T):
            sx = (x + (4 if y >= 8 else 0)) % T
            jy = y % 8 == 7
            jx = sx % 8 == 7
            if jy or jx:
                idx[y, x] = 1
            elif y % 8 == 0 or sx % 8 == 0:
                idx[y, x] = 4
    f = pnoise(4, 172)
    idx[(f > 0.62) & (idx == 3)] = 2
    a = lut(STONE)[idx]
    for x, y in jitter(rng, 3, 3, m=0.25):
        put(a, int(x), int(y), STONE[2])
        put(a, int(x) + 1, int(y), STONE[5])
    return a


@tile("tracery", "Резной фриз")
def t_tracery():
    """Quatrefoils in a band — the carved gothic ornament: deep holes dark, rims lit top-left."""
    a = lut(STONE)[np.full((T, T), 3)]
    ys, xs = np.mgrid[0:T, 0:T] + 0.5
    cx, cy = 8, 8
    m = np.zeros((T, T), bool)
    for ox, oy in ((0, -3), (0, 3), (-3, 0), (3, 0)):
        m |= (xs - cx - ox) ** 2 + (ys - cy - oy) ** 2 <= 7.5
    ring = m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1))
    a[m] = hx(STONE[1])
    a[ring] = hx(STONE[2])
    lit = ring & ~np.roll(m, 1, 0) | ring & ~np.roll(m, 1, 1)
    a[np.roll(m, -1, 0) & ~m] = hx(STONE[5])
    a[np.roll(m, -1, 1) & ~m] = hx(STONE[5])
    a[np.roll(m, 1, 0) & ~m] = hx(STONE[2])
    a[0, :] = hx(STONE[5]); a[1, :] = hx(STONE[4]); a[T - 1, :] = hx(STONE[1]); a[T - 2, :] = hx(STONE[2])
    for x in (0, 15):                                           # corner nubs between the foils
        put(a, x, 8, STONE[4])
    return a


@tile("column", "Колонна")
def t_column():
    """Fluted shaft: vertical flutes, each lit on its left lip, shadowed on the right."""
    a = canvas(T, T)
    tones = [2, 4, 3, 3, 1]
    for x in range(T):
        k = tones[x % 4] if x % 4 != 3 else 1
        for y in range(T):
            a[y, x] = hx(STONE[k])
    f = pnoise(4, 181)
    for y in range(T):
        for x in range(T):
            if f[y, x] > 0.68:
                a[y, x] = hx(STONE[max(1, [2, 4, 3, 1][x % 4] - 1)])
    return a


GLASS_PANES = [("crimson", "#e83a5a"), ("azure", "#3a7cf0"), ("amber", "#e88a1e"), ("violet", "#a24ef0")]


def stained(seed, cols):
    rng = np.random.default_rng(seed)
    a = canvas(T, T, OUTLINE)
    g = canvas(T, T)
    # lead lines: a diamond lattice (period 8) — panes in between
    for y in range(T):
        for x in range(T):
            u, v = (x + y) % 8, (x - y) % 8
            lead = u == 0 or v == 0
            if lead:
                a[y, x] = hx(IRON[1])
                continue
            cell = ((x + y) // 8 + 2 * ((x - y) // 8)) % len(cols)
            r = GLOWS[cols[cell]]
            lvl = 3
            if u == 1 or v == 1:
                lvl = 4                                          # lit rim of each pane
            if u == 7 or v == 7:
                lvl = 2
            a[y, x] = hx(r[lvl]); g[y, x] = hx(r[lvl])
    for x, y in jitter(rng, 2, 2, m=0.3):
        x, y = int(x), int(y)
        if g[y % T, x % T, 3]:
            put(a, x, y, "#ffffff"); put(g, x, y, "#ffffff")
    return a, g


@tile("glass_rose", "Витраж розы", glow=True)
def t_glass_rose():
    return stained(191, ["crimson", "violet", "amber", "crimson"])


@tile("glass_azure", "Витраж лазурный", glow=True)
def t_glass_azure():
    return stained(193, ["azure", "teal", "violet", "azure"])


@tile("glass_amber", "Витраж янтарный", glow=True)
def t_glass_amber():
    return stained(197, ["amber", "crimson", "amber", "emerald"])
