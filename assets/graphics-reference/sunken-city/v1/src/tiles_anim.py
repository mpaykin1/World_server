"""Animated tiles (16×16, 8 frames, seamless in space AND time): caustics on sand, breathing moss in six
colours, stained glass with light passing through, a hydrothermal vent, the surface seen from below and
a transparent overlay of rising bubbles. Every motion is a whole number of periods per loop."""
import math

import numpy as np

from pixel import T, canvas, lut, hx
from pixel import wput as put
from ramps import SAND, ROCK, AMBER, TEAL, GLOWS, GLOW_RU, GLASS, PEARL, ABYSS
from tilereg import anim_tile, TILE_FNS
from tiles_ground import ripples

TAU = math.pi * 2
ys, xs = np.mgrid[0:T, 0:T].astype(float)
U, V = TAU * xs / T, TAU * ys / T


def caustic_field(f, n=8, k=1.0):
    w = TAU * f / n
    a = np.sin(U + 1.3 * np.sin(V + w) + w)
    b = np.sin(V - 1.1 * np.sin(U - w) - w)
    c = np.sin(U + V + 0.9 * np.sin(U - V + 2 * w))
    return np.abs(a + b + 0.6 * c)


@anim_tile("caustics", "Каустика на песке")
def caustics(f):
    a = ripples(201, SAND)
    g = canvas(T, T)
    c = caustic_field(f)
    lo = c < 0.16
    mid = (c >= 0.16) & (c < 0.42)
    base = lut(SAND)
    for y in range(T):
        for x in range(T):
            if lo[y, x]:
                a[y, x] = hx(TEAL[3]); g[y, x] = hx(TEAL[3])
            elif mid[y, x]:
                a[y, x] = hx(SAND[5])
    return a, g


def _ramp_index(color, ramp):
    rgb = tuple(int(v) for v in color[:3])
    for i, c in enumerate(ramp):
        if hx(c)[:3] == rgb:
            return i
    return None


for _c, _r in GLOWS.items():
    def _mk(c=_c, r=_r):
        @anim_tile(f"moss_{c}_pulse", f"Дышащий мох, {GLOW_RU[c]}")
        def pulse(f):
            a, g = TILE_FNS[f"moss_{c}"]["fn"]()
            a, g = a.copy(), g.copy()
            w = TAU * f / 8
            for y, x in zip(*np.nonzero(g[..., 3])):
                i = _ramp_index(g[y, x], r)
                if i is None:
                    continue
                ph = TAU * (x + y) / 16
                d = int(round(1.4 * math.sin(w - ph)))
                j = int(np.clip(i + d, 1, len(r) - 1))
                a[y, x] = hx(r[j]); g[y, x] = hx(r[j])
            return a, g
    _mk()


@anim_tile("glass_rose_shimmer", "Витраж: свет проходит")
def glass_shimmer(f):
    a, g = TILE_FNS["glass_rose"]["fn"]()
    a, g = a.copy(), g.copy()
    w = TAU * f / 8
    for y, x in zip(*np.nonzero(g[..., 3])):
        for r in GLOWS.values():
            i = _ramp_index(g[y, x], r)
            if i is not None:
                d = 1 if math.sin(w - TAU * (x - y) / 16) > 0.55 else 0
                j = min(len(r) - 1, i + d)
                a[y, x] = hx(r[j]); g[y, x] = hx(r[j])
                break
    return a, g


@anim_tile("vent", "Гидротермальный источник")
def vent(f):
    a = lut(ROCK)[np.full((T, T), 2)]
    g = canvas(T, T)
    w = TAU * f / 8
    # glowing fissures: a jagged seam that breathes
    for x in range(T):
        y = int(7 + 2.0 * math.sin(TAU * x / 16) + 1.0 * math.sin(TAU * 3 * x / 16))
        lvl = 2 + int(round(1.5 + 1.5 * math.sin(w + TAU * x / 16)))
        for d, k in ((0, lvl), (1, max(1, lvl - 2))):
            put(a, x, y + d, AMBER[k]); put(g, x, y + d, AMBER[k])
        put(a, x, y - 1, ROCK[4])
    for x in range(0, T, 5):
        put(a, x, 13, ROCK[1]); put(a, x + 1, 12, ROCK[4])
    # bubbles rise 2 px per frame: one loop = 16 px, seamless
    for bx, by0 in ((3, 0), (11, 6), (7, 11)):
        y = (by0 - 2 * f) % T
        xw = bx + int(round(math.sin(TAU * (f / 8 + bx / 16))))
        put(a, xw, y, PEARL[4]); put(a, xw, y + 1, PEARL[2])
    return a, g


@anim_tile("surface", "Поверхность снизу")
def surface(f):
    c = caustic_field(f)
    a = canvas(T, T)
    g = canvas(T, T)
    for y in range(T):
        for x in range(T):
            v = c[y, x]
            if v < 0.3:
                col = GLASS[6]
            elif v < 0.6:
                col = GLASS[5]
            elif v < 1.1:
                col = GLASS[4]
            else:
                col = GLASS[3]
            a[y, x] = hx(col)
            if v < 0.6:
                g[y, x] = hx(col)
    return a, g


@anim_tile("bubbles", "Пузыри (оверлей)")
def bubbles(f):
    a = canvas(T, T)
    for k, (bx, by0, r) in enumerate(((2, 1, 1), (9, 5, 2), (13, 11, 1), (5, 13, 1), (11, 0, 1))):
        y = (by0 - 2 * f) % T
        x = bx + int(round(0.8 * math.sin(TAU * (f / 8 + k / 5))))
        if r == 2:
            for dx, dy, c in ((0, 0, PEARL[2]), (1, 0, PEARL[3]), (0, 1, PEARL[2]), (1, 1, PEARL[1]), (0, -1, PEARL[4]), (-1, 0, PEARL[4])):
                put(a, x + dx, y + dy, c)
            put(a, x, y, PEARL[5])
        else:
            put(a, x, y, PEARL[4]); put(a, x, y + 1, PEARL[2])
    return a, None
