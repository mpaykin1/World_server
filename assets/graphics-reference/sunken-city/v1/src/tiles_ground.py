"""Seabed and living-reef tiles (16×16, seamless): rippled sand, sand with shells, silt, basalt,
three corals, whale bone, a pile of doubloons."""
import numpy as np

from pixel import T, canvas, lut, pnoise, jitter, roll, hx
from pixel import wput as put, wstamp as stamp
from ramps import SAND, SILT, ROCK, BONE, SHELL, CORAL_P, CORAL_O, CORAL_V, KELP, PEARL
from pixel import Y as GOLD
from tilereg import tile


def ripples(seed, ramp):
    ys, xs = np.mgrid[0:T, 0:T]
    rip = np.sin(2 * np.pi * (ys / 8 + 0.18 * np.sin(2 * np.pi * xs / 16) + 0.06 * np.sin(2 * np.pi * xs / 8)))
    idx = np.full((T, T), 3)
    trough = rip > 0.78
    idx[trough] = 2
    idx[roll(trough, 1, 0) & ~trough] = 4
    f = pnoise(4, seed)
    idx[(f > 0.7) & (idx == 3)] = 2
    return lut(ramp)[idx]


@tile("sand", "Песок дна", group="ground")
def t_sand():
    a = ripples(201, SAND)
    rng = np.random.default_rng(202)
    for x, y in jitter(rng, 4, 4, m=0.1):
        put(a, int(x), int(y), SAND[1])
    for x, y in jitter(rng, 3, 3, m=0.2):
        put(a, int(x), int(y), SAND[5])
    return a


@tile("sand_shells", "Песок с ракушками", group="ground")
def t_sand_shells():
    a = ripples(211, SAND)
    shell = [".ab.", "abbc", ".cc."]
    stamp(a, 2, 3, shell, {"a": SHELL[6], "b": SHELL[5], "c": SHELL[3]})
    stamp(a, 10, 10, [".ab", "abc", ".c."], {"a": PEARL[4], "b": PEARL[3], "c": PEARL[1]})
    stamp(a, 11, 2, ["ab", "bc"], {"a": SHELL[4], "b": SHELL[3], "c": SHELL[1]})
    stamp(a, 4, 12, ["a.a", ".b."], {"a": KELP[3], "b": KELP[2]})
    return a


@tile("silt", "Ил", group="ground")
def t_silt():
    f = 0.6 * pnoise(4, 221) + 0.4 * pnoise(8, 222)
    idx = np.full((T, T), 2)
    idx[f < np.quantile(f, 0.3)] = 1
    idx[f > np.quantile(f, 0.85)] = 3
    a = lut(SILT)[idx]
    rng = np.random.default_rng(223)
    for x, y in jitter(rng, 3, 3, m=0.2):                 # worm holes: a dark pit with a lit lip
        x, y = int(x), int(y)
        put(a, x, y, SILT[0]); put(a, x - 1, y - 1, SILT[4])
    for x, y in jitter(rng, 4, 4, m=0.1):
        put(a, int(x), int(y), SILT[3])
    return a


@tile("rock", "Базальт", group="ground")
def t_rock():
    rng = np.random.default_rng(231)
    pts = np.array(jitter(rng, 2, 3, m=0.25))
    ys, xs = np.mgrid[0:T, 0:T] + 0.5
    dx = np.abs(xs[..., None] - pts[:, 0]); dx = np.minimum(dx, T - dx)
    dy = np.abs(ys[..., None] - pts[:, 1]); dy = np.minimum(dy, T - dy)
    d = np.sqrt(dx ** 2 + dy ** 2)
    order = np.argsort(d, -1)
    ds = np.take_along_axis(d, order, -1)
    cid = np.where(ds[..., 1] - ds[..., 0] < 1.1, -1, order[..., 0])
    tone = rng.choice([3, 3, 4, 2], size=len(pts))
    idx = np.where(cid >= 0, tone[np.maximum(cid, 0)], 0)
    up, lf, dn, rt = roll(cid, 1, 0), roll(cid, 0, 1), roll(cid, -1, 0), roll(cid, 0, -1)
    st = cid >= 0
    hi = st & ((up != cid) | (lf != cid))
    lo = st & ((dn != cid) | (rt != cid))
    idx[hi & ~lo] += 1
    idx[lo & ~hi] -= 1
    a = lut(ROCK)[np.clip(idx, 0, 6)]
    for x, y in jitter(rng, 3, 3, m=0.2):
        x, y = int(x) % T, int(y) % T
        if st[y, x]:
            put(a, x, y, ROCK[1]); put(a, x, y - 1, ROCK[5])
    return a


def coral(seed, ramp):
    """Coral block: packed polyp cups — each a rounded rim lit top-left with a dark mouth, deep gaps between."""
    rng = np.random.default_rng(seed)
    a = canvas(T, T, ramp[0])
    f = pnoise(4, seed + 1)
    for y in range(T):
        for x in range(T):
            if f[y, x] > 0.55:
                a[y, x] = hx(ramp[1])
    cup = ["..bbb..", ".bcccb.", "bccdccb", "bcdedcb", "bccdccb", ".bcccb.", "..bbb.."]
    for x, y in sorted(jitter(rng, 3, 3, m=0.12), key=lambda p: p[1]):
        x, y = int(x) - 3, int(y) - 3
        hi = rng.choice([0, 1])
        stamp(a, x, y, cup, {"b": ramp[2], "c": ramp[3 + hi], "d": ramp[2], "e": ramp[0]})
        put(a, x + 2, y + 1, ramp[5]); put(a, x + 1, y + 2, ramp[4 + hi])
        put(a, x + 5, y + 5, ramp[1]); put(a, x + 4, y + 6, ramp[1])
    return a


@tile("coral_pink", "Коралл розовый", group="ground")
def t_coral_p():
    return coral(241, CORAL_P)


@tile("coral_orange", "Коралл оранжевый", group="ground")
def t_coral_o():
    return coral(243, CORAL_O)


@tile("coral_violet", "Коралл фиолетовый", group="ground")
def t_coral_v():
    return coral(247, CORAL_V)


@tile("bone", "Китовая кость", group="ground")
def t_bone():
    f = 0.7 * pnoise(4, 251) + 0.3 * pnoise(8, 252)
    idx = np.full((T, T), 4)
    idx[f < np.quantile(f, 0.25)] = 3
    idx[f > np.quantile(f, 0.85)] = 5
    a = lut(BONE)[idx]
    rng = np.random.default_rng(253)
    for x, y in jitter(rng, 4, 3, m=0.15):                  # pores
        x, y = int(x), int(y)
        put(a, x, y, BONE[1]); put(a, x + 1, y + 1, BONE[2]); put(a, x - 1, y - 1, BONE[6])
    for x in range(T):                                       # growth lines
        y = int(8 + 2.2 * np.sin(2 * np.pi * x / 16))
        put(a, x, y, BONE[3])
    return a


@tile("gold", "Россыпь дублонов", group="ground")
def t_gold():
    rng = np.random.default_rng(261)
    a = canvas(T, T, GOLD[1])
    coin = [".bbb.", "bcddb", "bdcdb", "bddeb", ".beb."]
    for x, y in sorted(jitter(rng, 3, 3, m=0.05), key=lambda p: p[1]):
        x, y = int(x) - 2, int(y) - 2
        stamp(a, x, y, coin, {"b": GOLD[3], "c": GOLD[5], "d": GOLD[4], "e": GOLD[2]})
        put(a, x + 1, y + 1, GOLD[6])
    for x, y in jitter(rng, 3, 2, m=0.2):
        put(a, int(x), int(y), GOLD[2])
    return a
