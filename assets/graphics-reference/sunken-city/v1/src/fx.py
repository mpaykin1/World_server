"""2D effects, drawn frame by frame as pixel art (strips, transparent background, glow masks):
bubble burst, electric arc, sonar ring, silt puff, ink cloud, lure flash, torpedo trail, heal sparkles, hit."""
import math
import os

import numpy as np

from export import save_pair
from pixel import hx, BAYER4
from ramps import SPARK, TEAL, AMBER, EMERALD, SILT, PEARL, VIOLET, AZURE, OUTLINE

TAU = math.pi * 2


def cv(w, h):
    return np.zeros((h, w, 4), np.uint8)


def dot(a, g, x, y, c, glow=True):
    h, w = a.shape[:2]
    if 0 <= x < w and 0 <= y < h:
        a[int(y), int(x)] = hx(c)
        if glow and g is not None:
            g[int(y), int(x)] = hx(c)


def ring(a, g, cx, cy, r, c, th=1.0, glow=True, dither=1.0):
    h, w = a.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w] + 0.5
    d = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    m = (np.abs(d - r) < th) & (BAYER4[ys.astype(int) % 4, xs.astype(int) % 4] < dither)
    a[m] = hx(c)
    if glow and g is not None:
        g[m] = hx(c)


def bubble_burst(f):
    a, g = cv(16, 16), cv(16, 16)
    if f < 4:
        r = 2 + f * 1.1
        ring(a, None, 8, 8, r, PEARL[3], 0.6)
        dot(a, g, 8 - r * 0.5, 8 - r * 0.5, PEARL[5])
    else:
        k = f - 3
        for j in range(8):
            ang = j / 8 * TAU
            dot(a, g, 8 + math.cos(ang) * (3 + k * 1.6), 8 + math.sin(ang) * (3 + k * 1.6), PEARL[4 - min(3, k // 2)])
    return a, None


def arc(f):
    a, g = cv(32, 16), cv(32, 16)
    rng = np.random.default_rng(f * 7 + 1)
    y = 8.0
    pts = []
    for x in range(1, 31):
        y += rng.uniform(-1.6, 1.6)
        y = min(14, max(2, y + (8 - y) * 0.15))
        pts.append((x, int(round(y))))
    for (x, y) in pts:
        dot(a, g, x, y, SPARK[5])
        dot(a, g, x, y - 1, SPARK[3])
        dot(a, g, x, y + 1, SPARK[2])
    for k in range(3):                                   # branches
        x0, y0 = pts[int(rng.integers(4, 26))]
        for d in range(int(rng.integers(3, 6))):
            dot(a, g, x0 + d, y0 + (d if k % 2 else -d), SPARK[3])
    return a, g


def sonar(f):
    a, g = cv(48, 48), cv(48, 48)
    for k, off in enumerate((0, 4)):
        t = (f + off) % 8
        r = 3 + t * 2.8
        ring(a, g, 24, 24, r, AZURE[4] if t < 4 else AZURE[3], 0.7, dither=1.0 - t / 10)
    dot(a, g, 24, 24, AZURE[5])
    return a, g


def silt(f):
    a = cv(24, 16)
    rng = np.random.default_rng(3)
    for j in range(26):
        ang = rng.uniform(0.15, math.pi - 0.15)
        sp = rng.uniform(0.6, 1.4)
        r = (1 + f * 1.4) * sp
        x = 12 + math.cos(ang) * r * 1.4
        y = 14 - math.sin(ang) * r * 0.9 + f * f * 0.06
        c = SILT[min(5, 2 + int(sp * 2))] if f < 6 else SILT[2]
        if f < 7 or j % 2:
            dot(a, None, x, y, c, glow=False)
    return a, None


def ink(f):
    a = cv(24, 24)
    ys, xs = np.mgrid[0:24, 0:24] + 0.5
    r = 2 + f * 1.3
    d = np.sqrt((xs - 12) ** 2 + (ys - 12) ** 2) + 1.4 * np.sin(np.arctan2(ys - 12, xs - 12) * 5 + f)
    dens = np.clip(1 - d / (r + 0.1), 0, 1) * (1 - f / 9)
    m = BAYER4[ys.astype(int) % 4, xs.astype(int) % 4] < dens * 1.6
    a[m] = hx(VIOLET[0])
    a[m & (d < r * 0.5)] = hx(OUTLINE)
    return a, None


def lure_flash(f):
    a, g = cv(16, 16), cv(16, 16)
    k = [1, 3, 5, 4, 2, 1][f]
    for j in range(8):
        ang = j / 8 * TAU
        L = k * (1.4 if j % 2 == 0 else 0.8)
        for d in range(int(L) + 1):
            dot(a, g, 8 + math.cos(ang) * d, 8 + math.sin(ang) * d, AMBER[5 - min(3, d)])
    dot(a, g, 8, 8, "#ffffff")
    return a, g


def torpedo_trail(f):
    a = cv(32, 8)
    rng = np.random.default_rng(11)
    for j in range(14):
        x = (rng.integers(0, 32) + f * 4) % 32
        y = 4 + int(round(1.5 * math.sin(j + f * 0.8)))
        c = PEARL[4] if x < 10 else PEARL[3] if x < 20 else PEARL[1]
        dot(a, None, x, y, c, glow=False)
        if j % 3 == 0:
            dot(a, None, x + 1, y, PEARL[2], glow=False)
    return a, None


def heal(f):
    a, g = cv(16, 16), cv(16, 16)
    for j, (x0, ph) in enumerate(((4, 0), (9, 3), (13, 5), (7, 6))):
        y = (14 - ((f + ph) % 8) * 1.7)
        c = EMERALD[5] if (f + j) % 2 else EMERALD[4]
        dot(a, g, x0, y, c)
        if (f + ph) % 4 == 0:
            dot(a, g, x0 - 1, y, EMERALD[3]); dot(a, g, x0 + 1, y, EMERALD[3]); dot(a, g, x0, y - 1, EMERALD[3]); dot(a, g, x0, y + 1, EMERALD[3])
    return a, g


def hit(f):
    a, g = cv(16, 16), cv(16, 16)
    r = [1, 3, 5, 6, 7, 7.5][f]
    ring(a, g, 8, 8, r, TEAL[5] if f < 2 else TEAL[3], 0.7, dither=1.0 - f / 7)
    if f < 3:
        for j in range(4):
            ang = j / 4 * TAU + 0.78
            dot(a, g, 8 + math.cos(ang) * (r + 1), 8 + math.sin(ang) * (r + 1), "#ffffff")
    return a, g


FX = [("bubble_burst", "Пузырь лопается", bubble_burst, 8, 12), ("arc", "Электрическая дуга", arc, 8, 16),
      ("sonar", "Импульс сонара", sonar, 8, 10), ("silt", "Облако ила", silt, 8, 10), ("ink", "Чернильное облако", ink, 8, 8),
      ("lure_flash", "Вспышка приманки", lure_flash, 6, 12), ("torpedo_trail", "След торпеды", torpedo_trail, 8, 16),
      ("heal", "Лечение", heal, 8, 10), ("hit", "Удар", hit, 6, 14)]


def build(root):
    out = []
    for fid, ru, fn, n, fps in FX:
        frames = [fn(f) for f in range(n)]
        strip = np.concatenate([a for a, _ in frames], 1)
        gl = [g if g is not None else np.zeros_like(a) for a, g in frames]
        gstrip = np.concatenate(gl, 1)
        e = dict(id=fid, name=ru, frames=n, fps=fps, w=frames[0][0].shape[1], h=frames[0][0].shape[0],
                 **save_pair(root, f"2d/fx/{fid}", strip, gstrip))
        out.append(e)
    return out
