"""Living floor of the city: kelp of three heights, sea grass, glowing moss clumps in six colours,
branching corals, brain coral, glowing tube sponges, an anemone and a sea fan."""
import math

import numpy as np

from vox import Model, wave, TAU
from assets import asset
from assets.kit import sway, speckle
from ramps import GLOW_RU


def kelp_model(mid, ru, H, seed, blades=True):
    m = Model(mid, ru, "flora", "Ламинария: стебель с газовыми пузырями и лентами листьев, качается в течении.", iso_dirs=4, tags=["анимация"])
    rng = np.random.default_rng(seed)
    p = m.part("kelp", (13, H, 9))
    X, Y, Z = p.g
    cx = 6.5 + 1.2 * np.sin(Y / 9.0 + seed)
    stalk = (np.abs(X - cx) < 0.9) & (np.abs(Z - 4.5) < 0.9)
    p.fill(stalk, "kelp_d")
    holdfast = (Y < 3) & ((X - 6.5) ** 2 + (Z - 4.5) ** 2 < (3.4 - Y) ** 2)
    p.fill(holdfast, "kelp_d", 1)
    y = 6
    side = 1
    while y < H - 4:
        L = rng.integers(4, 7)
        w = 1.2 + rng.random() * 0.8
        for k in range(L):
            yy = y + k * 1.0
            xx = 6.5 + 1.2 * math.sin(yy / 9.0 + seed) + side * (1.0 + k * 0.85)
            blade = (np.abs(Y - yy - 0.5) < w * (1 - k / (L + 1)) + 0.4) & (np.abs(X - xx) < 0.8) & (np.abs(Z - 4.5 - side * 0.5) < 1.6)
            p.fill(blade & (p.m == 0), "kelp")
        bx = 6.5 + 1.2 * math.sin(y / 9.0 + seed) + side * 1.2
        p.fill(p.sphere((bx, y - 0.3, 4.5), 1.05), "grass", 5)                    # gas bladder at the blade's base
        y += rng.integers(4, 7)
        side = -side
    p.fill(p.ellipsoid((6.5 + 1.2 * math.sin((H - 3) / 9.0 + seed), H - 2.5, 4.5), (1.6, 2.4, 1.2)), "kelp", 5)
    speckle(p, p.m == p.m[int(6.5), 2, 4], 3, 1, seed=seed, p=0.15)
    n = max(3, H // 8)
    segs = m.split(p, 1, [int(H * k / n) for k in range(1, n)], names=[f"s{i}" for i in range(n)])
    m.clip("sway", "колышется", 8, 6)
    sway(segs, "sway", 0.07 + 2.4 / H, k=0.65, axis=2)
    return m


@asset
def kelp():
    return [kelp_model("kelp_tall", "Ламинария высокая", 64, 3), kelp_model("kelp_mid", "Ламинария", 40, 7), kelp_model("kelp_short", "Ламинария низкая", 24, 11)]


@asset
def seagrass():
    m = Model("seagrass", "Морская трава", "flora", "Пучок травы: каждая травинка гнётся своей волной.", iso_dirs=4, tags=["анимация"])
    base = m.part("root", (12, 2, 12), pivot=(6, 0, 6))
    base.fill(base.ellipsoid((6, 0, 6), (5, 1.6, 5)), "sand")
    rng = np.random.default_rng(21)
    for k in range(9):
        a = rng.random() * TAU
        r = rng.random() * 3.6
        x, z = 6 + math.cos(a) * r, 6 + math.sin(a) * r
        H = int(rng.integers(8, 15))
        prev, org = base, (x - 1, 1, z - 1)
        n = 3
        for j in range(n):
            L = H // n + (1 if j < H % n else 0)
            s = m.part(f"b{k}_{j}", (2, L, 2), origin=org, pivot=(1, 0, 1), parent=prev)
            s.fill(s.box((0.5, 0, 0.5), (1.5, L, 1.5)), "grass", 2 + j + (k % 2))
            ph0 = k * 0.9 + j * 0.8
            s.anim["sway"] = (lambda ph0, j: lambda ph: {"r": (wave(ph, ph0 + 1.1, 0.10 + 0.05 * j), 0, wave(ph, ph0, 0.16 + 0.08 * j))})(ph0, j)
            prev, org = s, (0, L, 0)
    m.clip("sway", "колышется", 8, 6)
    return m


@asset
def moss_clump():
    out = []
    for c, r in GLOW_RU.items():
        m = Model(f"moss_clump_{c}", f"Сияющий мох, {r}", "flora", "Подушка светящегося мха: дышит светом.", iso_dirs=4, tags=["анимация", "свет"])
        p = m.part("moss", (14, 7, 14), pivot=(7, 0, 7))
        rng = np.random.default_rng(len(c) * 31)
        p.fill(p.ellipsoid((7, 0, 7), (6.4, 2.6, 6.0)), "kelp_d", 1)
        for k in range(9):
            a, d = rng.random() * TAU, rng.random() * 4.2
            x, z = 7 + math.cos(a) * d, 7 + math.sin(a) * d
            rad = 1.6 + rng.random() * 1.4
            yy = 1.6 + (4.2 - d) * 0.45
            ball = p.sphere((x, yy, z), rad)
            p.fill(ball, c + "_dim")
            p.tone(ball & p.sphere((x - 0.6, yy + 0.7, z - 0.4), rad * 0.62), 3)
            p.fill(p.sphere((x - 0.5, yy + rad * 0.8, z), 0.6), c + "_hot")
        speckle(p, p.m == p.m[7, 0, 7], 2, 0, seed=len(c), p=0.2)
        m.clip("pulse", "дышит светом", 8, 6)
        p.anim["pulse"] = lambda ph: {"s": (1 + 0.03 * math.sin(TAU * ph), 1 + 0.06 * math.sin(TAU * ph), 1 + 0.03 * math.sin(TAU * ph)),
                                      "glow": round(1.3 * math.sin(TAU * ph))}
        out.append(m)
    return out


def branch(p, x, y, z, ang, tilt, length, r, depth, mat, tip, rng):
    if depth == 0 or length < 1.5:
        p.fill(p.sphere((x, y, z), max(0.7, r * 0.9)), tip)
        return
    dx = math.cos(ang) * math.sin(tilt)
    dz = math.sin(ang) * math.sin(tilt)
    dy = math.cos(tilt)
    x2, y2, z2 = x + dx * length, y + dy * length, z + dz * length
    p.fill(p.capsule((x, y, z), (x2, y2, z2), r, r * 0.8), mat)
    for k in range(2 if depth > 1 else 3):
        branch(p, x2, y2, z2, ang + rng.uniform(-1.4, 1.4) + k * 2.1, min(1.2, tilt + rng.uniform(0.1, 0.5)),
               length * rng.uniform(0.62, 0.8), r * 0.75, depth - 1, mat, tip, rng)


@asset
def coral_branch():
    out = []
    for c, ru, mat, tip in (("pink", "розовый", "coral_p", "teal_hot"), ("orange", "оранжевый", "coral_o", "amber_hot"), ("violet", "фиолетовый", "coral_v", "violet_hot")):
        m = Model(f"coral_branch_{c}", f"Ветвистый коралл, {ru}", "flora", "Ветви с полипами, кончики светятся.", iso_dirs=4, tags=["анимация"])
        p = m.part("coral", (24, 26, 24))
        rng = np.random.default_rng(len(c) + 5)
        p.fill(p.ellipsoid((12, 0, 12), (5, 2.2, 5)), mat, 1)
        for k in range(3):
            branch(p, 12, 1.5, 12, k * 2.2 + rng.random(), 0.55 + rng.random() * 0.35, 6.8, 1.35, 3, mat, tip, rng)
        speckle(p, p.m == p.m[12, 1, 12], 4, 2, seed=3, p=0.1)
        m.clip("glow", "мерцают полипы", 8, 6)
        p.anim["glow"] = lambda ph: {"glow": round(1.2 * math.sin(TAU * ph))}
        out.append(m)
    return out


@asset
def coral_brain():
    m = Model("coral_brain", "Коралл-мозговик", "flora", "Полусфера с извилистыми бороздами.", iso_dirs=4)
    p = m.part("coral", (18, 10, 18))
    X, Y, Z = p.g
    dome = ((X - 9) ** 2 + (Z - 9) ** 2) / 64 + (Y / 9.5) ** 2 <= 1
    p.fill(dome, "coral_v")
    groove = np.sin(X * 0.9 + np.sin(Z * 0.6) * 2.2) * np.cos(Z * 0.8 + np.sin(X * 0.5) * 1.8) > 0.35
    p.paint(dome & groove, "coral_v", 1)
    p.paint(dome & ~groove & (np.sin(X * 0.9 + np.sin(Z * 0.6) * 2.2) * np.cos(Z * 0.8 + np.sin(X * 0.5) * 1.8) < -0.6), "coral_v", 5)
    return m


@asset
def tube_sponge():
    m = Model("tube_sponge", "Трубчатая губка", "flora", "Трубки с сияющими краями — свет дышит волной от трубки к трубке.", iso_dirs=4, tags=["анимация", "свет"])
    base = m.part("base", (16, 3, 16), pivot=(8, 0, 8))
    base.fill(base.ellipsoid((8, 0, 8), (7, 2.5, 7)), "coral_o", 1)
    rng = np.random.default_rng(41)
    for k, (dx, dz, H, rr) in enumerate(((0, 0, 18, 2.6), (-4, 2, 13, 2.1), (4, -2, 11, 2.0), (2, 4, 9, 1.7), (-3, -4, 8, 1.6))):
        t = m.part(f"tube{k}", (8, H, 8), origin=(8 + dx - 4, 1, 8 + dz - 4), pivot=(4, 0, 4), parent=base)
        X, Y, Z = t.g
        r = rr + 0.25 * np.sin(Y * 0.7 + k)
        d = np.sqrt((X - 4) ** 2 + (Z - 4) ** 2)
        wall = (d <= r) & (d >= r - 1.1)
        t.fill(wall, "coral_o")
        t.fill((d < r - 1.1) & (Y < 2), "coral_o", 0)
        t.paint(wall & (Y > H - 1.5), "amber_hot")
        t.paint(wall & (Y > H - 3) & (Y <= H - 1.5), "amber")
        t.anim["pulse"] = (lambda k: lambda ph: {"glow": round(1.3 * math.sin(TAU * ph - k * 1.1)), "r": (wave(ph, k, 0.03), 0, wave(ph, k + 1, 0.03))})(k)
    m.clip("pulse", "дышит светом", 8, 6)
    return m


@asset
def anemone():
    m = Model("anemone", "Анемон", "flora", "Венчик щупалец со светящимися кончиками, колышется.", iso_dirs=4, tags=["анимация"])
    col = m.part("column", (10, 7, 10), pivot=(5, 0, 5))
    col.fill(col.cyl(1, (5, 5), 3.6, 0, 6), "coral_p", 2)
    col.fill(col.cyl(1, (5, 5), 4.2, 5, 7), "coral_p", 3)
    col.fill(col.cyl(1, (5, 5), 1.6, 6, 7), "crimson_dim")
    for k in range(10):
        a = k / 10 * TAU
        prev, org = col, (5 + math.cos(a) * 3.4 - 1, 6.5, 5 + math.sin(a) * 3.4 - 1)
        for j in range(3):
            s = m.part(f"t{k}_{j}", (2, 3, 2), origin=org, pivot=(1, 0, 1), parent=prev)
            s.fill(s.box((0.5, 0, 0.5), (1.5, 3, 1.5)), "coral_p" if j < 2 else "teal", 4 if j < 2 else None)
            base_t = (math.cos(a) * 0.5, 0, -math.sin(a) * 0.0)
            s.anim["wave"] = (lambda a, j, k: lambda ph: {"r": (math.sin(a) * (0.35 if j == 0 else 0.15) + wave(ph, k * 0.6 + j, 0.18), 0,
                                                                -math.cos(a) * (0.35 if j == 0 else 0.15) + wave(ph, k * 0.6 + j + 1.2, 0.18)),
                                                          "glow": round(math.sin(TAU * ph - k * 0.6)) if j == 2 else 0})(a, j, k)
            prev, org = s, (0, 3, 0)
    m.clip("wave", "колышется", 8, 6)
    return m


@asset
def sea_fan():
    m = Model("sea_fan", "Морской веер", "flora", "Горгонария: кружевной веер на стебле, покачивается.", iso_dirs=4, tags=["анимация"])
    p = m.part("fan", (26, 28, 3), pivot=(13, 0, 1.5))
    X, Y, Z = p.g
    stem = (np.abs(X - 13) < 1) & (Y < 6) & (np.abs(Z - 1.5) < 0.6)
    p.fill(stem, "coral_v", 2)
    r = np.sqrt((X - 13) ** 2 + (Y - 4) ** 2)
    ang = np.arctan2(Y - 4, X - 13)
    fan = (r < 13) & (r > 2) & (ang > 0.25) & (ang < math.pi - 0.25) & (np.abs(Z - 1.5) < 0.6)
    lace = fan & ((np.abs(np.sin(ang * 14)) < 0.32) | (np.abs(np.sin(r * 1.25)) < 0.3))
    p.fill(lace, "coral_v", 3)
    p.paint(lace & (r > 11.5), "violet")
    m.clip("sway", "покачивается", 8, 5)
    p.anim["sway"] = lambda ph: {"r": (wave(ph, 0, 0.12), 0, wave(ph, 1.2, 0.05)), "glow": round(math.sin(TAU * ph))}
    return m
