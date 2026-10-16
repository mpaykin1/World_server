"""More of the seabed: a whale skeleton, a sea mine on its chain, a diving helmet, a hydrothermal vent."""
import math

import numpy as np

from vox import Model, wave, TAU, noise3
from assets import asset
from assets.archkit import grow_moss
from assets.kit import speckle


@asset
def whale_skeleton():
    m = Model("whale_skeleton", "Скелет кита", "wreck", "Череп, позвоночник дугой, рёбра; на костях светится мох.", iso_dirs=4, tags=["главное"])
    L, H, D = 124, 40, 44
    p = m.part("bones", (L, H, D))
    X, Y, Z = p.g
    zc = D / 2
    spine_y = 16 + 7 * np.sin(np.clip(X / L, 0, 1) * math.pi)
    for vx in range(10, 100, 4):                                                   # vertebrae
        vy = 16 + 7 * math.sin(vx / L * math.pi)
        p.fill(p.ellipsoid((vx, vy, zc), (1.6, 2.4, 2.4)), "bone")
        p.fill(p.box((vx - 0.6, vy + 1, zc - 0.6), (vx + 0.6, vy + 5, zc + 0.6)), "bone", 3)
    p.fill(p.tube([(4, 12, zc), (10, 16, zc), (30, 19.5, zc)], [0.6, 1.0, 1.2]), "bone")      # tail
    for rx in range(46, 92, 5):                                                    # ribs: arcs down to the sand
        vy = 16 + 7 * math.sin(rx / L * math.pi)
        for sg in (1, -1):
            pts = [(rx, vy, zc), (rx + 1, vy - 2, zc + sg * 9), (rx + 2, vy - 10, zc + sg * 15), (rx + 3, 2, zc + sg * 13)]
            p.fill(p.tube(pts, [1.1, 1.0, 0.9, 0.8]), "bone")
    skull = ((X - 108) / 16) ** 2 + ((Y - 15) / 9) ** 2 + ((Z - zc) / 12) ** 2 < 1
    p.fill(skull & (X > 96), "bone")
    p.carve((((X - 104) ** 2 + (Y - 17) ** 2 < 8) & (np.abs(np.abs(Z - zc) - 8) < 3)))       # eye sockets
    for sg in (1, -1):
        p.fill(p.tube([(98, 6, zc + sg * 8), (110, 4, zc + sg * 9), (122, 6, zc + sg * 4)], [1.6, 1.4, 1.1]), "bone")  # jaws
    speckle(p, p.m > 0, 6, 2, seed=8, p=0.1)
    grow_moss(p, 91, ["teal", "violet"], amount=0.4, drip=3)
    return m


@asset
def sea_mine():
    m = Model("sea_mine", "Морская мина", "wreck", "Рогатая мина качается на цепи; на макушке мигает огонь.", iso_dirs=4, tags=["опасность", "анимация"])
    base = m.part("anchor_block", (10, 4, 10), pivot=(5, 0, 5))
    base.fill(base.box((1, 0, 1), (9, 3, 9)), "rust")
    base.fill(base.box((4, 3, 4), (6, 4, 6)), "iron")
    prev, org = base, (4, 4, 4)
    for k in range(4):
        c = m.part(f"chain{k}", (2, 4, 2), origin=org, pivot=(1, 0, 1), parent=prev)
        c.fill(c.box((0.5, 0, 0.5), (1.5, 4, 1.5)), "iron_d")
        c.anim["bob"] = (lambda k: lambda ph: {"r": (wave(ph, k * 0.6, 0.05), 0, wave(ph, k * 0.6 + 1, 0.07))})(k)
        prev, org = c, (0, 4, 0)
    ball = m.part("mine", (16, 16, 16), origin=(-7, 3, -7), pivot=(8, 1, 8), parent=prev)
    X, Y, Z = ball.g
    sph = ball.sphere((8, 8, 8), 5.6)
    ball.fill(sph, "iron")
    ball.paint(sph & (noise3(ball.shape, 4, 3, 1) > 0.6), "rust")
    for (dx, dy, dz) in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, 0, 1), (0, 0, -1), (0.7, 0.7, 0), (-0.7, 0.7, 0), (0, 0.7, 0.7), (0, 0.7, -0.7)):
        ball.fill(ball.capsule((8 + dx * 5, 8 + dy * 5, 8 + dz * 5), (8 + dx * 7.6, 8 + dy * 7.6, 8 + dz * 7.6), 0.9, 0.6), "brass")
    ball.fill(ball.sphere((8, 14.2, 8), 1.0), "crimson_hot")
    ball.fill(ball.box((1, 7.5, 1), (15, 8.5, 15)) & sph, "iron_d")
    m.clip("bob", "качается, мигает", 8, 6)
    ball.anim["bob"] = lambda ph: {"r": (wave(ph, 2.4, 0.06), 0, wave(ph, 3.0, 0.08)), "glow": 2 if ph < 0.25 else -2}
    return m


@asset
def diving_helmet():
    m = Model("diving_helmet", "Водолазный шлем", "wreck", "Медный шлем: три иллюминатора, болты, нагрудник.", iso_dirs=4)
    h = m.part("helmet", (18, 20, 18))
    X, Y, Z = h.g
    sph = h.ellipsoid((9, 11, 9), (7, 7.5, 7))
    h.fill(sph, "copper")
    h.fill(h.box((1, 0, 1), (17, 5, 17)) & (((X - 9) ** 2 + (Z - 9) ** 2) < 72), "brass")
    for (cx, cy, cz, nx) in ((9, 11, 16.2, "z"), (2, 11, 9, "x"), (16, 11, 9, "x")):
        if nx == "z":
            port = ((X - cx) ** 2 + (Y - cy) ** 2 < 10) & (Z > 13)
            rim = ((X - cx) ** 2 + (Y - cy) ** 2 < 15) & (Z > 12.5)
        else:
            port = ((Z - cz) ** 2 + (Y - cy) ** 2 < 6) & (np.abs(X - cx) < 2.5)
            rim = ((Z - cz) ** 2 + (Y - cy) ** 2 < 10) & (np.abs(X - cx) < 3)
        h.fill(rim & sph, "brass", 5)
        h.fill(port & sph, "glass")
    for bx, bz in ((3, 3), (15, 3), (3, 15), (15, 15), (9, 1.5), (9, 16.5)):
        h.fill(h.sphere((bx, 4.5, bz), 1.0), "brass", 6)
    speckle(h, h.m == h.m[9, 17, 9], 5, 2, seed=9, p=0.08)
    h.paint(h.where(lambda X, Y, Z: noise3(h.shape, 4, 5, 1) > 0.66), "verd", 4)
    return m


@asset
def hot_vent():
    m = Model("hot_vent", "Гидротермальный источник", "wreck", "Каменная труба, в трещинах — жар; свет дышит.", iso_dirs=4, tags=["свет", "анимация"])
    p = m.part("vent", (20, 36, 20))
    X, Y, Z = p.g
    r = 8.5 - Y * 0.14 + 1.3 * np.sin(Y * 0.5) + 0.8 * np.sin(np.arctan2(Z - 10, X - 10) * 3 + Y * 0.2)
    d = np.sqrt((X - 10) ** 2 + (Z - 10) ** 2)
    p.fill(d < r, "rock")
    p.carve((d < 2.4) & (Y > 26))
    n = noise3(p.shape, 4, 7, 2)
    crack = (d < r) & (d > r - 1.4) & (np.abs(n - 0.5) < 0.04)
    p.paint(crack, "amber")
    p.paint((d < r) & (Y > 31), "amber_dim")
    p.fill((d < 2.4) & (Y > 26) & (Y < 30), "amber_hot")
    speckle(p, p.m == p.m[10, 4, 10], 4, 1, seed=12, p=0.1)
    m.clip("glow", "жар дышит", 8, 6)
    p.anim["glow"] = lambda ph: {"glow": round(1.4 * math.sin(TAU * ph))}
    return m
