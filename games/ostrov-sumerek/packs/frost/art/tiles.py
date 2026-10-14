"""Frost tiles (16×16, seamless, no outline): snow, snow side, frozen soil, ice, packed snow,
frost brick, pine needles. Cold ramps: shadows lean violet-blue, lights stay white."""
import numpy as np

from art.pixel import N, S, I, G, T, canvas, lut, pnoise, jitter, roll, hx, make_ramp
from art.pixel import wput as put, wstamp as stamp
from art.registry import tile

SN = ["#4c5680", "#6f7ca6", "#97a6c9", "#c0cde6", "#e3ebf7", "#ffffff"]        # snow: violet shadows → white
FD = ["#1d1520", "#2f2330", "#46333a", "#5e4646", "#7a5c55", "#987766"]        # frozen soil
PN = ["#0b1f24", "#123236", "#1b4a48", "#2a6658", "#3f8466", "#67a578"]        # pine needles


@tile("snow")
def tile_snow(seed=101):
    f = 0.7 * pnoise(4, seed) + 0.3 * pnoise(8, seed + 1)
    idx = np.full((T, T), 4)
    idx[f < np.quantile(f, 0.22)] = 3
    idx[f > np.quantile(f, 0.86)] = 5
    a = lut(SN)[idx]
    rng = np.random.default_rng(seed + 2)
    for x, y in jitter(rng, 4, 4, m=0.1):         # drift ridges: lit lip, blue shadow under it
        x, y = int(x), int(y)
        put(a, x, y, SN[5]); put(a, x + 1, y, SN[5])
        put(a, x, y + 1, SN[3]); put(a, x + 1, y + 1, SN[2])
    for x, y in jitter(rng, 3, 3, m=0.2):         # glints
        put(a, int(x), int(y), "#ffffff")
    return a


def frozen_soil(seed=111):
    f = 0.6 * pnoise(4, seed) + 0.4 * pnoise(8, seed + 1)
    idx = np.full((T, T), 3)
    idx[f < np.quantile(f, 0.3)] = 2
    idx[f > np.quantile(f, 0.84)] = 4
    a = lut(FD)[idx]
    rng = np.random.default_rng(seed + 2)
    for x, y in jitter(rng, 4, 4, m=0.1):
        x, y = int(x), int(y)
        put(a, x, y, FD[4]); put(a, x + 1, y + 1, FD[1])
    for x, y in jitter(rng, 3, 3, m=0.2):         # rime crystals in the soil
        put(a, int(x), int(y), SN[3])
    return a


@tile("frozen_dirt")
def tile_frozen_dirt():
    return frozen_soil()


@tile("snow_side")
def tile_snow_side(seed=7):
    """Frozen soil with a snow cap that drips over the edge — stacks on frozen_dirt."""
    a = frozen_soil().copy()
    drips = [2, 3, 2, 1, 2, 4, 3, 2, 1, 2, 3, 2, 4, 2, 1, 3]
    for x in range(T):
        put(a, x, 0, SN[5] if x % 4 else SN[4])
        put(a, x, 1, SN[4])
        put(a, x, 2, SN[4] if (x * 5) % 3 else SN[3])
        L = drips[x]
        for k in range(L):
            put(a, x, 3 + k, SN[3] if k < L - 1 else SN[2])
        put(a, x, 3 + L, FD[1])
    return a


@tile("ice")
def tile_ice(seed=121):
    ys, xs = np.mgrid[0:T, 0:T]
    f = 0.75 * pnoise(4, seed) + 0.25 * pnoise(8, seed + 3)
    idx = np.full((T, T), 3)
    idx[f < np.quantile(f, 0.3)] = 2
    idx[f > np.quantile(f, 0.8)] = 4
    a = lut(I)[idx]
    # long diagonal glare streaks (light from the top-left)
    band = ((xs + ys) % 16 == 3) | ((xs + ys) % 16 == 4)
    a[band & (f > np.quantile(f, 0.4))] = hx(I[5])
    rng = np.random.default_rng(seed)
    for x, y in jitter(rng, 2, 2, m=0.25):        # hairline cracks
        x, y = int(x), int(y)
        for k in range(5):
            put(a, x + k, y + (k // 2), I[1])
        put(a, x + 1, y - 1, I[4])
    for x, y in jitter(rng, 3, 3, m=0.2):
        put(a, int(x), int(y), "#ffffff")
    return a


@tile("packed_snow")
def tile_packed_snow(seed=131):
    f = pnoise(4, seed)
    idx = np.full((T, T), 3)
    idx[f < np.quantile(f, 0.35)] = 2
    idx[f > np.quantile(f, 0.85)] = 4
    a = lut(SN)[idx]
    for y in range(T):                            # sled ruts
        for x in (4, 11):
            put(a, x, y, SN[2]); put(a, x - 1, y, SN[4])
    rng = np.random.default_rng(seed)
    for x, y in jitter(rng, 2, 3, m=0.2):         # footprints
        stamp(a, int(x), int(y), ["ab", "bb", "b."], {"a": SN[1], "b": SN[2]})
    return a


@tile("frost_brick")
def tile_frost_brick(seed=141):
    rng = np.random.default_rng(seed)
    a = canvas(T, T, S[1])
    for row in range(4):
        y0 = row * 4
        off = 0 if row % 2 == 0 else 4
        for k in range(2):
            x0 = off + k * 8
            t = int(rng.choice([3, 3, 4, 4, 5]))
            for dy in range(3):
                for dx in range(7):
                    c = S[t]
                    if dy == 0 or (dx == 0 and dy < 2):
                        c = S[min(t + 1, 6)]
                    if dy == 2 or (dx == 6 and dy > 0):
                        c = S[t - 1]
                    put(a, x0 + dx, y0 + dy, c)
            for dx in range(8):
                put(a, x0 + dx, y0 + 3, S[1])
            if rng.random() < 0.6:                # frost on the top edge of a brick
                for dx in range(rng.integers(2, 6)):
                    put(a, x0 + 1 + dx, y0, SN[4] if dx % 2 else SN[5])
    return a


@tile("pine_needles")
def tile_pine_needles(seed=151):
    rng = np.random.default_rng(seed)
    a = canvas(T, T, PN[1])
    sprig = [".ab..", "abbc.", ".bccd", "..cd."]
    for x, y in sorted(jitter(rng, 4, 4, m=0.05), key=lambda p: p[1]):
        x, y = int(x), int(y)
        stamp(a, x + 1, y + 1, [".xx.", "xxxx", ".xx."], {"x": PN[0]})
        stamp(a, x, y, sprig, {"a": PN[5], "b": PN[4], "c": PN[3], "d": PN[2]})
    for x, y in jitter(rng, 3, 3, m=0.2):         # snow caught in the branches
        stamp(a, int(x), int(y), ["ww", "s."], {"w": SN[5], "s": SN[3]})
    return a
