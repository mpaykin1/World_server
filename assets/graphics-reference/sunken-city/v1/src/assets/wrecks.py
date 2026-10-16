"""Wrecks and treasures: a broken galleon on its side, a sunken submarine, an anchor with chain, a chest of
pearls, barrel, crate, ship's wheel, cannon, a whale skeleton, a sea mine, a diving helmet, a hot vent."""
import math

import numpy as np

from vox import Model, wave, TAU, noise3
from assets import asset
from assets.archkit import crumble, grow_moss, lantern
from assets.kit import speckle


@asset
def galleon():
    m = Model("galleon", "Затонувший галеон", "wreck", "Корпус лёг на борт: пробоина, сломанные мачты, рваный парус, медь ниже ватерлинии.",
              iso_dirs=4, tags=["главное"])
    L, H, D = 152, 92, 56
    p = m.part("hull", (L, H, D))
    X, Y, Z = p.g
    zc, keel, deck = D / 2, 6, 46
    u = np.clip(X / L, 0, 1)
    halfw = 22 * np.clip(np.sin(np.clip(u, 0.02, 0.98) * math.pi) ** 0.55, 0, 1)
    halfw = np.where(u < 0.18, np.maximum(halfw, 14 + 40 * u), halfw)                 # a full stern
    kh = keel + 10 * np.clip((u - 0.82) / 0.18, 0, 1) ** 2 + 6 * np.clip((0.12 - u) / 0.12, 0, 1)
    top = deck + 18 * (u < 0.24) + 6 * np.clip((u - 0.86) / 0.14, 0, 1)
    fy = np.clip((Y - kh) / np.maximum(top - kh, 1), 0, 1)
    w = halfw * fy ** 0.42 * (1 - 0.07 * np.clip((fy - 0.82) / 0.18, 0, 1))
    solid = (Y >= kh) & (Y < top) & (np.abs(Z - zc) < w)
    inner = (Y >= kh + 2) & (np.abs(Z - zc) < w - 2.2)
    shellm = solid & ~inner
    p.fill(shellm, "t_planks")
    p.fill(solid & (np.abs(Y - deck) < 1) & (u > 0.2), "t_planks")                        # main deck
    p.fill(solid & (np.abs(Y - (deck + 18)) < 1) & (u <= 0.24), "t_planks")              # poop deck
    n = noise3(p.shape, 9, 5, 2)
    p.paint(shellm & (Y < 20), "t_copper")
    p.paint(shellm & (n > 0.62) & (Y >= 20), "t_planks_rot")
    # gunports with cannon muzzles
    for gx in range(40, 132, 12):
        port = (np.abs(X - gx) < 2.5) & (np.abs(Y - 36) < 2.5)
        p.carve(port & shellm)
        for sg in (1, -1):
            zz = zc + sg * (22 * math.sin(gx / L * math.pi) ** 0.55 * 0.97)
            p.fill(p.capsule((gx, 36, zz - sg * 2), (gx, 36, zz + sg * 2.5), 1.2), "iron_d")
    # the breach: a ragged hole in the starboard side shows the ribs
    breach = ((X - 92) ** 2 / 300 + (Y - 24) ** 2 / 120 < 1 + 0.35 * (n - 0.5)) & (Z > zc)
    p.carve(breach & shellm)
    for rx in range(80, 106, 5):
        p.fill((np.abs(X - rx) < 1) & breach & solid & (np.abs(Z - zc) > w - 3.5), "wood")
    # transom with lit stern windows
    for wz in (zc - 10, zc - 3.5, zc + 3.5, zc + 10):
        p.carve((X < 3) & (np.abs(Z - wz) < 2) & (Y > 50) & (Y < 57))
        p.fill((X >= 1) & (X < 2) & (np.abs(Z - wz) < 2) & (Y > 50) & (Y < 57), "amber_dim")
    lantern(p, 5, deck + 19, zc, "amber")
    # masts: broken stumps, a fallen top lying across the deck, a torn sail
    for mx, mh in ((112, 30), (72, 42)):
        p.fill(((X - mx) ** 2 + (Z - zc) ** 2 < 6.5) & (Y >= deck) & (Y < deck + mh), "wood")
        jag = ((X - mx) ** 2 + (Z - zc) ** 2 < 6.5) & (Y >= deck + mh - 3) & (n > 0.5)
        p.carve(jag)
    p.fill(p.capsule((70, deck + 4, zc - 18), (122, deck + 9, zc + 20), 2.2), "wood")
    sail = (np.abs(Z - (zc - 6 + (X - 60) * 0.3)) < 0.6) & (X > 60) & (X < 98) & (Y > deck + 12) & (Y < deck + 40) & (n > 0.38)
    p.fill(sail & (p.m == 0), "t_sail")
    p.fill(p.capsule((56, deck + 40, zc - 8), (100, deck + 40, zc + 6), 1.2), "wood")
    # bowsprit
    p.fill(p.capsule((L - 8, deck + 4, zc), (L - 1, deck + 12, zc), 1.6), "wood")
    grow_moss(p, 71, ["teal", "emerald", "violet"], amount=0.45, drip=5)
    m.tilt = (0.22, 0.0, 0.05)
    return m


@asset
def submarine_wreck():
    m = Model("submarine_wreck", "Затонувшая подлодка", "wreck", "Ржавый корпус, рубка, перископ, гнутый винт, слабый свет в иллюминаторах.", iso_dirs=4)
    L, H, D = 140, 46, 36
    p = m.part("hull", (L, H, D))
    X, Y, Z = p.g
    u = X / L
    r = 15 * np.clip(np.sin(np.clip(u, 0.0, 1.0) * math.pi) ** 0.35, 0.15, 1)
    cy, zc = 17, D / 2
    hull = (Y - cy) ** 2 + (Z - zc) ** 2 < r * r
    p.fill(hull & (X > 6), "t_rust")
    n = noise3(p.shape, 8, 9, 2)
    p.paint(hull & (n > 0.6), "t_copper")
    tower = (np.abs(X - 84) < 10 - (Y - 30) * 0.12) & (np.abs(Z - zc) < 4.5) & (Y >= 28) & (Y < 42)
    p.fill(tower, "t_rust")
    p.fill((np.abs(X - 86) < 1) & (np.abs(Z - zc) < 1) & (Y >= 42) & (Y < 46), "iron")
    p.fill((np.abs(X - 87.5) < 1.5) & (np.abs(Z - zc) < 1) & (Y >= 44) & (Y < 46), "iron")
    for px in range(30, 122, 9):                                                         # portholes
        for sg in (1, -1):
            pz = zc + sg * (np.sqrt(max(0.0, (15 * math.sin(px / L * math.pi) ** 0.35) ** 2 - 1)) - 0.4)
            ring = ((X - px) ** 2 + (Y - (cy + 1)) ** 2 < 4) & (np.abs(Z - pz) < 1.5)
            p.fill(ring & hull, "teal_dim" if (px // 9) % 3 else "teal")
    p.fill((X < 7) & ((Y - cy) ** 2 + (Z - zc) ** 2 < 4), "iron")                    # shaft + bent propeller
    for k in range(4):
        a = k / 4 * TAU + 0.4
        p.fill(p.capsule((3, cy, zc), (3 + 1.5 * math.sin(a * 3), cy + 7 * math.sin(a), zc + 7 * math.cos(a)), 1.2), "copper")
    crush = (X > L - 22) & (n > 0.45) & (Y > cy - 6)
    p.carve(crush & hull)
    p.fill((np.abs(Y - (cy + 14.5)) < 0.6) & (np.abs(Z - zc) < 0.6) & (X > 20) & (X < 120) & ((X.astype(int) % 4) < 2), "iron")
    grow_moss(p, 81, ["teal", "azure"], amount=0.4, drip=4)
    m.tilt = (0.0, 0.0, -0.06)
    return m


@asset
def anchor():
    m = Model("anchor", "Якорь с цепью", "wreck", "Адмиралтейский якорь, ржавчина, цепь уходит вверх.", iso_dirs=4)
    p = m.part("anchor", (28, 48, 8))
    X, Y, Z = p.g
    zc = 4
    flat = np.abs(Z - zc) < 1.6
    shank = (np.abs(X - 14) < 1.6) & (Y > 6) & (Y < 34) & flat
    stock = (np.abs(Y - 31) < 1.4) & (np.abs(X - 14) < 11) & (np.abs(Z - zc) < 2.2)
    r = np.sqrt((X - 14) ** 2 + (Y - 15) ** 2)
    arms = (np.abs(r - 11) < 1.6) & (Y < 15) & flat
    flukes = (((X - 3.5) ** 2 + (Y - 13) ** 2 < 9) | ((X - 24.5) ** 2 + (Y - 13) ** 2 < 9)) & flat
    ring = (np.abs(np.sqrt((X - 14) ** 2 + (Y - 37) ** 2) - 3) < 1) & (np.abs(Z - zc) < 1)
    p.fill(shank | arms | flukes | ring, "iron")
    p.fill(stock, "wood")
    speckle(p, p.m > 0, 2, 1, seed=4, p=0.12)
    p.paint(p.where(lambda X, Y, Z: noise3(p.shape, 5, 2, 1) > 0.6), "rust")
    for k in range(3):                                                                # chain links
        y0 = 40 + k * 3
        if k % 2 == 0:
            p.fill((np.abs(np.sqrt((X - 14) ** 2 + (Y - y0) ** 2 * 0.6) - 1.6) < 0.7) & (np.abs(Z - zc) < 0.6), "iron_d")
        else:
            p.fill((np.abs(np.sqrt((Z - zc) ** 2 + (Y - y0) ** 2 * 0.6) - 1.6) < 0.7) & (np.abs(X - 14) < 0.6), "iron_d")
    return m


@asset
def treasure_chest():
    m = Model("treasure_chest", "Сундук с жемчугом", "wreck", "Окованный сундук: крышка открывается, внутри золото и светящийся жемчуг.",
              iso_dirs=4, tags=["анимация", "находка"])
    b = m.part("box", (16, 9, 12))
    b.fill(b.box((0, 0, 0), (16, 9, 12)), "t_planks")
    b.carve(b.box((1.5, 2, 1.5), (14.5, 9, 10.5)))
    b.fill(b.box((1.5, 2, 1.5), (14.5, 6.5, 10.5)), "gold")
    for x, z in ((4, 4), (8, 7), (11, 4), (6, 9)):
        b.fill(b.sphere((x, 7, z), 1.1), "pearl")
    b.fill(b.sphere((10, 7.2, 8), 1.3), "teal_hot")
    for bx in (1.5, 13.5):
        b.fill(b.box((bx, 0, -0.1), (bx + 1.2, 9, 12.1)), "iron")
    b.fill(b.box((7, 4, 11.5), (9, 7, 12.5)), "gold", 5)
    lid = m.part("lid", (16, 5, 12), origin=(0, 9, 0), pivot=(8, 0.5, 0.5), parent=b)
    LX, LY, LZ = lid.g
    lid.fill(((LZ - 6) ** 2 / 36 + (LY / 4.5) ** 2 <= 1), "t_planks")
    for bx in (1.5, 13.5):
        lid.fill((((LZ - 6) ** 2 / 36 + (LY / 4.5) ** 2 <= 1.08)) & (LX >= bx) & (LX < bx + 1.2), "iron")
    m.clip("open", "открывается", 8, 8)
    lid.anim["open"] = lambda ph: {"r": (-1.1 * (0.5 - 0.5 * math.cos(TAU * ph)), 0, 0)}
    b.anim["open"] = lambda ph: {"glow": round(1.5 * (0.5 - 0.5 * math.cos(TAU * ph)))}
    return m


@asset
def barrel_crate():
    out = []
    m = Model("barrel", "Бочка", "wreck", "Дубовая бочка, железные обручи.", iso_dirs=4)
    p = m.part("barrel", (12, 16, 12))
    X, Y, Z = p.g
    r = 4.6 + 1.2 * np.sin(Y / 16 * math.pi)
    d = np.sqrt((X - 6) ** 2 + (Z - 6) ** 2)
    body = d < r
    p.fill(body, "wood")
    ang = np.arctan2(Z - 6, X - 6)
    p.tone(body & (np.sin(ang * 8) > 0.7), 2)
    p.tone(body & (Y > 15), 4)
    for y0 in (2.5, 13):
        p.fill((d < r + 0.4) & (np.abs(Y - y0) < 0.8), "iron")
    out.append(m)
    c = Model("crate", "Ящик", "wreck", "Дощатый ящик с железными уголками.", iso_dirs=4)
    q = c.part("crate", (14, 14, 14))
    q.fill(q.box((0, 0, 0), (14, 14, 14)), "t_planks")
    Xq, Yq, Zq = q.g
    edge = ((Xq < 1.5) | (Xq > 12.5)) & ((Yq < 1.5) | (Yq > 12.5)) | ((Xq < 1.5) | (Xq > 12.5)) & ((Zq < 1.5) | (Zq > 12.5)) | ((Yq < 1.5) | (Yq > 12.5)) & ((Zq < 1.5) | (Zq > 12.5))
    q.fill(edge, "iron")
    out.append(c)
    return out


@asset
def ship_wheel():
    m = Model("ship_wheel", "Штурвал", "wreck", "Восемь рукоятей, медная ступица; медленно поворачивается.", iso_dirs=4, tags=["анимация"])
    p = m.part("wheel", (24, 24, 4), pivot=(12, 12, 2))
    X, Y, Z = p.g
    r = np.sqrt((X - 12) ** 2 + (Y - 12) ** 2)
    ang = np.arctan2(Y - 12, X - 12)
    flat = np.abs(Z - 2) < 1.2
    p.fill((np.abs(r - 7.5) < 1.2) & flat, "wood")
    p.fill((np.abs(np.sin(ang * 4)) < 0.18) & (r < 11.5) & flat & (np.abs(Z - 2) < 0.8), "wood")
    p.fill((r > 9) & (r < 11.8) & (np.abs(np.sin(ang * 4)) < 0.3) & flat, "wood", 4)
    p.fill((r < 2.6) & (np.abs(Z - 2) < 1.8), "brass")
    m.clip("turn", "поворачивается", 8, 6)
    p.anim["turn"] = lambda ph: {"r": (0, 0, TAU / 8 * ph)}
    return m


@asset
def cannon():
    m = Model("cannon", "Корабельная пушка", "wreck", "Чугунный ствол на лафете с колёсами.", iso_dirs=4)
    p = m.part("cannon", (30, 13, 13))
    X, Y, Z = p.g
    r = 3.3 - X * 0.03
    barrel = ((Y - 8) ** 2 + (Z - 6.5) ** 2 < r * r) & (X > 3) & (X < 29)
    p.fill(barrel, "iron")
    p.carve(((Y - 8) ** 2 + (Z - 6.5) ** 2 < 1.6) & (X > 27))
    p.fill(((Y - 8) ** 2 + (Z - 6.5) ** 2 < (r + 0.6) ** 2) & ((np.abs(X - 26) < 1) | (np.abs(X - 10) < 1)), "iron_d")
    p.fill(p.sphere((3, 8, 6.5), 2.2), "iron")
    p.fill(p.box((4, 2, 2), (22, 6, 11)), "wood")
    for wx in (7, 19):
        for wz in (1.5, 11.5):
            p.fill(((X - wx) ** 2 + (Y - 3) ** 2 < 7) & (np.abs(Z - wz) < 1), "wood", 2)
    p.paint(p.where(lambda X, Y, Z: noise3(p.shape, 4, 6, 1) > 0.62) & barrel, "rust")
    return m
