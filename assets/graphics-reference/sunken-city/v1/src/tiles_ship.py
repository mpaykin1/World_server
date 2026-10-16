"""Tiles of wrecks and machines (16×16, seamless): waterlogged planks, rotten planks, copper sheathing
gone green, rusted plate, riveted brass of a bathyscaphe, torn sailcloth, a glass dome panel."""
import numpy as np

from pixel import T, canvas, lut, pnoise, jitter, hx
from pixel import wput as put, wstamp as stamp
from ramps import WOOD, WOOD_G, VERD, COPPER, RUST, IRON, BRASS, CLOTH, GLASS, KELP, SHELL, TEAL
from tilereg import tile


def planks(ramp, seed, rot=False):
    rng = np.random.default_rng(seed)
    a = canvas(T, T)
    seams = rng.integers(0, T, 4)
    for b in range(4):
        y0 = b * 4
        base = rng.choice([3, 4, 3])
        rows = [ramp[base + 1], ramp[base], ramp[base]]
        for dy in range(3):
            a[y0 + dy, :] = hx(rows[dy])
        a[y0 + 3, :] = hx(ramp[1])
        for _ in range(3):                                     # grain
            gy = y0 + 1 + rng.integers(2)
            gx = rng.integers(T)
            for k in range(rng.integers(3, 8)):
                put(a, gx + k, gy, ramp[base - 1])
        s = int(seams[b])
        for dy in range(3):
            put(a, s, y0 + dy, ramp[1])
            put(a, s + 1, y0 + dy, ramp[base + 1] if dy < 2 else ramp[base])
        put(a, s - 2, y0 + 1, IRON[2]); put(a, s + 3, y0 + 1, IRON[2])     # treenails
    if rot:
        f = pnoise(4, seed + 5)
        hole = f > np.quantile(f, 0.9)
        for y, x in zip(*np.nonzero(hole)):
            put(a, x, y, ramp[0])
        rim = np.roll(hole, 1, 0) & ~hole
        for y, x in zip(*np.nonzero(rim)):
            put(a, x, y, ramp[1])
        for x, y in jitter(rng, 3, 2, m=0.2):                  # barnacles
            stamp(a, int(x), int(y), [".a.", "abc", ".c."], {"a": SHELL[5], "b": SHELL[2], "c": SHELL[3]})
        g = pnoise(8, seed + 6)
        for y, x in zip(*np.nonzero(g > 0.72)):
            put(a, x, y, KELP[3] if (x + y) % 2 else KELP[2])
    return a


@tile("planks", "Доски корабля", group="ship")
def t_planks():
    return planks(WOOD, 301)


@tile("planks_rot", "Гнилые доски", group="ship")
def t_planks_rot():
    return planks(WOOD_G, 307, rot=True)


@tile("hull_copper", "Медная обшивка", group="ship")
def t_copper():
    """Copper sheathing gone green: overlapping plates, bare copper only in the middle of a few plates,
    rivets in the corners, verdigris blooming from every seam."""
    a = canvas(T, T)
    f = 0.7 * pnoise(4, 311) + 0.3 * pnoise(8, 312)
    for y in range(T):
        for x in range(T):
            off = 4 if (y // 8) % 2 else 0
            sx, sy = (x + off) % 8, y % 8
            seam = sy == 7 or sx == 7
            edge = sy == 0 or sx == 0
            bare = f[y, x] > 0.62 and 1 < sx < 6 and 1 < sy < 6
            if seam:
                c = VERD[1]
            elif bare:
                c = COPPER[4] if edge else COPPER[3]
            else:
                c = VERD[4] if edge else (VERD[3] if f[y, x] > 0.35 else VERD[2])
            a[y, x] = hx(c)
            if sx == 1 and sy == 1:
                a[y, x] = hx(VERD[6])
    return a


@tile("rust", "Ржавые листы", group="ship")
def t_rust():
    a = canvas(T, T)
    f = 0.6 * pnoise(4, 321) + 0.4 * pnoise(8, 322)
    for y in range(T):
        for x in range(T):
            seam = y % 8 == 7 or x == 15
            k = 3
            if f[y, x] > 0.58:
                k = 4
            if f[y, x] < 0.32:
                k = 2
            if y % 8 == 0 or x == 0:
                k += 1
            a[y, x] = hx(RUST[k] if not seam else IRON[1])
    rng = np.random.default_rng(323)
    for y0 in (2, 10):                                         # rivet rows
        for x in range(1, T, 4):
            put(a, x, y0 + 2, IRON[5]); put(a, x + 1, y0 + 3, IRON[2])
    for x, y in jitter(rng, 2, 2, m=0.3):                      # rust streaks run down
        for d in range(4):
            put(a, int(x), int(y) + d, RUST[5 - min(d, 3)])
    return a


@tile("brass", "Латунь с заклёпками", group="ship")
def t_brass():
    a = canvas(T, T)
    f = pnoise(4, 331)
    for y in range(T):
        for x in range(T):
            k = 3 + (1 if f[y, x] > 0.6 else 0) - (1 if f[y, x] < 0.25 else 0)
            if y % 8 == 0:
                k = 5
            if y % 8 == 7:
                k = 1
            a[y, x] = hx(BRASS[k])
    for y0 in (3, 11):
        for x in range(2, T, 6):
            stamp(a, x, y0, ["ab", "bc"], {"a": BRASS[6], "b": BRASS[4], "c": BRASS[1]})
    for x, y in jitter(np.random.default_rng(332), 2, 2, m=0.3):
        put(a, int(x), int(y), VERD[4])
    return a


@tile("sail", "Рваная парусина", group="ship")
def t_sail():
    a = canvas(T, T)
    f = pnoise(4, 341)
    for y in range(T):
        for x in range(T):
            k = 3 + (1 if (x + y // 2) % 4 == 0 else 0) - (1 if f[y, x] < 0.3 else 0)
            a[y, x] = hx(CLOTH[k])
    for y in range(0, T, 4):                                   # weave
        for x in range(T):
            if (x + y) % 3 == 0:
                put(a, x, y, CLOTH[2])
    tear = pnoise(8, 342) > 0.8
    for y, x in zip(*np.nonzero(tear)):
        put(a, x, y, CLOTH[0])
    return a


@tile("dome", "Стекло купола", group="ship")
def t_dome():
    """A glass panel in a brass frame — the city's air dome. Glass is dim teal, the frame lit top-left."""
    a = canvas(T, T)
    for y in range(T):
        for x in range(T):
            a[y, x] = hx(GLASS[2] if (x + y) % 5 else GLASS[3])
    for i in range(T):
        put(a, i, 0, BRASS[5]); put(a, i, 1, BRASS[3]); put(a, 0, i, BRASS[5]); put(a, 1, i, BRASS[3])
        put(a, i, 15, BRASS[1]); put(a, 15, i, BRASS[1])
    g = canvas(T, T)
    for k in range(3, 9):                                      # a glint across the pane
        put(a, k + 2, 12 - k, GLASS[6]); put(a, k + 3, 12 - k, GLASS[5])
    for k in range(3):
        put(a, 11 + k, 4 + k, TEAL[3]); put(g, 11 + k, 4 + k, TEAL[3])
    return a, g
