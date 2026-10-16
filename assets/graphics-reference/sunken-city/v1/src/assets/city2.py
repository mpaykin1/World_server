"""Details of the city: a gargoyle with burning eyes, an angel statue with a glowing halo, a street lamp with
a jellyfish inside, the cathedral bell, a wrought-iron gate and a glass section of the city dome."""
import math

import numpy as np

import profile
from vox import Model, wave, TAU, noise3
from assets import asset
from assets.archkit import lancet, grow_moss
from assets.kit import speckle


@asset
def gargoyle():
    m = Model("gargoyle", "Горгулья", "city", "Каменная горгулья на консоли: крылья сложены, глаза тлеют.", iso_dirs=4, tags=["руины", "свет"])
    R = [
        "........ww..........",
        ".......wwww.........",
        "......wwwwww........",
        ".....wwwwwww....h...",
        "....wwwwwwww...hhh..",
        "....wwwwwwwbbbbhEhh.",
        "...wwwwwwwbbbbbhhhhm",
        "...wwwwwwbbbbbbbhhhm",
        "..wwwwwwbbbbbbbbb.mm",
        "..wwwwwbbbbbbbbbb...",
        "...wwwbbbbbbbbbbb...",
        "....bbbbbbbbbbbb....",
        "....bbb..bbbb.bbb...",
        "...bbbb..bbbb..bbb..",
        "..ssssssssssssssssss",
        "..ssssssssssssssssss",
        "...ssssssssssssssss.",
    ]
    leg = {"b": dict(mat="stone"), "h": dict(mat="stone", tone=4), "w": dict(mat="stone_d", kind="flat", thick=3),
           "E": dict(mat="stone", kind="paint", paint="crimson_hot"), "m": dict(mat="stone_d"), "s": dict(mat="t_brick", kind="flat", thick=12)}
    p = m.part("gargoyle", (20, 17, 14))
    profile.grow(p, R, leg, zc=7, depth=4.2)
    speckle(p, p.m == p.m[8, 6, 7], 5, 2, seed=4, p=0.12)
    grow_moss(p, 7, ["teal"], amount=0.5, drip=3, cushions=False)
    return m


@asset
def angel_statue():
    m = Model("angel_statue", "Статуя ангела", "city", "Ангел на постаменте в мхе; над головой светится нимб.", iso_dirs=4, tags=["свет", "анимация"])
    R = [
        "...w...hh...w...",
        "..ww..hhhh..ww..",
        "..www..hh..www..",
        ".wwww.rrrr.wwww.",
        ".wwwwrrrrrrwwww.",
        ".wwww.rrrr.wwww.",
        "..www.rrrr.www..",
        "..ww..rrrr..ww..",
        "...w..rrrr..w...",
        "......rrrr......",
        ".....rrrrrr.....",
        ".....rrrrrr.....",
        "....rrrrrrrr....",
        "....rrrrrrrr....",
        "...rrrrrrrrrr...",
        "...rrrrrrrrrr...",
        "..rrrrrrrrrrrr..",
        "..ssssssssssss..",
        ".ssssssssssssss.",
        ".ssssssssssssss.",
        "ssssssssssssssss",
    ]
    leg = {"r": dict(mat="stone"), "h": dict(mat="stone", tone=4), "w": dict(mat="stone", kind="flat", thick=2, tone=4),
           "o": dict(mat="amber", kind="fin"), "s": dict(mat="t_brick", kind="flat", thick=14)}
    p = m.part("statue", (16, 21, 16))
    profile.grow(p, R, leg, zc=8, depth=3.2)
    halo = m.part("halo", (8, 3, 8), origin=(4, 21.5, 4), pivot=(4, 1, 4), parent=p)
    halo.fill(halo.torus((4, 1, 4), 2.6, 0.7), "amber")
    speckle(p, p.m == p.m[8, 8, 8], 5, 2, seed=6, p=0.1)
    grow_moss(p, 9, ["emerald", "teal"], amount=0.45, drip=4, cushions=False)
    m.clip("glow", "нимб светится", 8, 6)
    halo.anim["glow"] = lambda ph: {"t": (0, 0.4 * math.sin(TAU * ph), 0), "r": (0, TAU / 8 * ph, 0), "glow": round(1.2 * math.sin(TAU * ph))}
    return m


@asset
def street_lamp():
    m = Model("street_lamp", "Фонарь с медузой", "city", "Кованый фонарь: внутри живая медуза, свет качается и дышит.", iso_dirs=4, tags=["свет", "анимация"])
    post = m.part("post", (14, 52, 14), pivot=(7, 0, 7))
    X, Y, Z = post.g
    post.fill((np.abs(X - 7) < 4) & (np.abs(Z - 7) < 4) & (Y < 4), "t_brick")
    post.fill(((X - 7) ** 2 + (Z - 7) ** 2 < 2.2) & (Y >= 4) & (Y < 46), "iron")
    for yy in (12, 30):
        post.fill(((X - 7) ** 2 + (Z - 7) ** 2 < 4.5) & (np.abs(Y - yy) < 1), "iron", 4)
    post.fill(post.capsule((7, 44, 7), (12.5, 47, 7), 0.8), "iron")
    post.fill(post.capsule((12.5, 47, 7), (12.5, 45, 7), 0.6), "iron")
    cage = m.part("lantern", (9, 13, 9), origin=(8, 32, 2.5), pivot=(4.5, 12.5, 4.5), parent=post)
    CX, CY, CZ = cage.g
    cage.fill((np.abs(CX - 4.5) < 4.2) & (np.abs(CZ - 4.5) < 4.2) & (CY < 1.2), "iron")
    cage.fill((np.abs(CX - 4.5) < 3.4) & (np.abs(CZ - 4.5) < 3.4) & (CY >= 9) & (CY < 11 - np.maximum(np.abs(CX - 4.5), np.abs(CZ - 4.5)) * 0.4), "iron")
    for bx, bz in ((1, 1), (8, 1), (1, 8), (8, 8)):
        cage.fill((np.abs(CX - bx) < 0.6) & (np.abs(CZ - bz) < 0.6) & (CY < 10), "iron")
    cage.fill(cage.box((4, 10.5, 4), (5, 13, 5)), "iron")
    cage.fill(cage.ellipsoid((4.5, 6.4, 4.5), (2.6, 2.0, 2.6)) & (CY > 5), "teal")
    cage.fill(cage.ellipsoid((4.5, 6.8, 4.5), (1.2, 1.0, 1.2)), "teal_hot")
    for tx in (3.5, 5.5):
        cage.fill((np.abs(CX - tx) < 0.6) & (np.abs(CZ - 4.5) < 0.6) & (CY > 2) & (CY < 5.5), "teal_dim")
    cage.fill((np.abs(CX - 4.5) < 3.8) & (np.abs(CZ - 4.5) < 3.8) & (CY >= 1) & (CY < 9) & ((np.abs(CX - 4.5) > 3.0) | (np.abs(CZ - 4.5) > 3.0)), "glass")
    grow_moss(post, 13, ["teal"], amount=0.6, drip=2, cushions=False)
    m.clip("glow", "свет качается", 8, 6)
    cage.anim["glow"] = lambda ph: {"r": (wave(ph, 0, 0.08), 0, wave(ph, 1.2, 0.1)), "glow": round(1.3 * math.sin(TAU * ph))}
    return m


@asset
def cathedral_bell():
    m = Model("cathedral_bell", "Колокол", "city", "Бронзовый колокол в патине на балке; раскачивается.", iso_dirs=4, tags=["анимация"])
    beam = m.part("beam", (30, 4, 6), pivot=(15, 2, 3))
    beam.fill(beam.box((0, 0, 1), (30, 4, 5)), "wood")
    beam.fill(beam.box((0, 0, 0), (3, 4, 6)) | beam.box((27, 0, 0), (30, 4, 6)), "iron")
    bell = m.part("bell", (22, 24, 22), origin=(4, -22, -8), pivot=(11, 23, 11), parent=beam)
    X, Y, Z = bell.g
    prof = lambda y: 10.5 - 4.2 * (y / 22) ** 0.6 if y < 22 else 0
    d = np.sqrt((X - 11) ** 2 + (Z - 11) ** 2)
    R = 10.6 - 4.6 * np.clip(Y / 21, 0, 1) ** 0.7 + 0.8 * (Y < 2)
    solid = (d < R) & (Y < 21)
    shell = solid & ~((d < R - 1.6) & (Y < 19))
    bell.fill(shell, "verd")
    bell.fill(bell.where(lambda X, Y, Z: (np.abs(d - (R - 0.2)) < 0.8) & (np.abs(Y - 4) < 1)) & shell, "copper", 5)
    bell.fill(bell.box((9.5, 20, 9.5), (12.5, 24, 12.5)), "iron")
    bell.fill(bell.sphere((11, 3, 11), 2.0), "iron_d")
    bell.fill(bell.box((10.5, 3, 10.5), (11.5, 19, 11.5)), "iron_d")
    speckle(bell, shell, 5, 1, seed=3, p=0.12)
    m.clip("swing", "раскачивается", 8, 5)
    bell.anim["swing"] = lambda ph: {"r": (0, 0, 0.28 * math.sin(TAU * ph))}
    return m


@asset
def iron_gate():
    m = Model("iron_gate", "Кованые ворота", "city", "Стрельчатые ворота с копьями прутьев, ржавчина и мох.", iso_dirs=4, tags=["руины"])
    W, H, D = 48, 72, 6
    p = m.part("gate", (W, H, D))
    X, Y, Z = p.g
    zc = 3
    frame = lancet(X, Y, 1, 47, 44, 1.0) & ~lancet(X, Y, 4, 44, 44, 1.0) & (Y > 0)
    p.fill(frame & (np.abs(Z - zc) < 2), "t_brick")
    inside = lancet(X, Y, 4, 44, 44, 1.0)
    bars = inside & ((X.astype(int) % 5) == 2) & (np.abs(Z - zc) < 0.7)
    p.fill(bars, "iron")
    for yy in (14, 30):
        p.fill(inside & (np.abs(Y - yy) < 0.8) & (np.abs(Z - zc) < 0.7), "iron", 4)
    tips = inside & ((X.astype(int) % 5) == 2) & (np.abs(Z - zc) < 0.7) & (np.abs(Y - 40) < 3)
    p.fill(tips & ((np.abs(X - (X.astype(int) - X.astype(int) % 5 + 2.5)) < (43 - Y) * 0.5)), "iron", 5)
    rings = inside & (((X - 24) ** 2 + (Y - 22) ** 2 < 30) & ((X - 24) ** 2 + (Y - 22) ** 2 > 18)) & (np.abs(Z - zc) < 0.7)
    p.fill(rings, "iron", 4)
    p.paint(p.where(lambda X, Y, Z: noise3(p.shape, 5, 4, 1) > 0.62), "rust")
    grow_moss(p, 15, ["teal", "emerald"], amount=0.5, drip=4, cushions=False)
    return m


@asset
def dome_section():
    m = Model("dome_section", "Купол города", "city", "Четверть стеклянного купола: латунные рёбра, слабое сияние стекла.", iso_dirs=4, tags=["главное"])
    R = 52
    p = m.part("dome", (R + 4, R + 4, R + 4))
    X, Y, Z = p.g
    d = np.sqrt(X ** 2 + Y ** 2 + Z ** 2)
    shell = (d < R) & (d > R - 2.2)
    lat = np.arcsin(np.clip(Y / np.maximum(d, 1e-3), -1, 1))
    lon = np.arctan2(Z, X)
    ribs = shell & ((np.abs(np.sin(lon * 6)) < 0.08) | (np.abs(np.sin(lat * 7)) < 0.07))
    p.fill(shell, "glass")
    p.fill(ribs, "brass")
    p.fill((d < R + 1.5) & (d > R - 3) & (Y < 3), "t_brick")
    p.paint(ribs & ((np.abs(np.sin(lon * 6)) < 0.08) & (np.abs(np.sin(lat * 7)) < 0.07)), "teal_hot")
    return m
