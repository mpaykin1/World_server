"""The drowned gothic city, built of the pack's own tiles: a portal arch, columns, a viaduct, bridges
(whole and fallen), the cathedral tower with its spire and rose window, a lancet window, stairs."""
import math

import numpy as np

from vox import Model
from assets import asset
from assets.archkit import lancet, apex, crumble, grow_moss, lantern, pinnacle

MOSS = ["teal", "emerald", "teal", "violet", "azure", "amber"]


@asset
def arch():
    m = Model("arch", "Стрельчатая арка", "city", "Портал с колоннами, архивольтом и щипцом; мох на карнизах.", iso_dirs=4, tags=["руины"])
    W, H, D = 64, 96, 16
    p = m.part("arch", (W, H, D))
    X, Y, Z = p.g
    x0, x1, spring = 14, 50, 50
    outer = lancet(X, Y, x0 - 6, x1 + 6, spring, 1.0)
    hole = lancet(X, Y, x0, x1, spring, 1.0)
    p.fill((X >= 0) & (X < W) & (Y < 84), "t_brick")
    p.fill(outer & ~hole & (Y > spring - 2), "t_tracery")
    gable = (Y >= 76) & (np.abs(X - W / 2) < (H - Y) * 1.6 + 2)
    p.fill(gable, "t_brick")
    p.carve(hole)
    p.carve((Z > 12) & ~lancet(X, Y, x0 - 6, x1 + 6, spring, 1.0) & (Y < 84) & (np.abs(X - W / 2) < 22) & (Y > 56))   # recess beside the ring
    for cx in (x0 + 2.5, x1 - 2.5):
        p.fill((((X - cx) ** 2 + (Z - 13) ** 2) <= 9) & (Y < spring - 4), "t_column")
        p.fill((np.abs(X - cx) < 4.2) & (np.abs(Z - 13) < 3.4) & (Y >= spring - 4) & (Y < spring), "t_tracery")
        p.fill((np.abs(X - cx) < 4.2) & (np.abs(Z - 13) < 3.4) & (Y < 4), "t_brick")
    for px in (6, W - 6):
        pinnacle(p, px, 8, 84, 96, 9)
    rose = (X - W / 2) ** 2 + (Y - 79) ** 2 <= 16
    p.fill(rose & (Z > 9), "t_glass_rose")
    crumble(p, 3, depth=8, k=0.62)
    grow_moss(p, 5, MOSS, amount=0.55)
    return m


@asset
def column():
    out = []
    for broken in (False, True):
        mid = "column_broken" if broken else "column"
        m = Model(mid, "Обломок колонны" if broken else "Колонна", "city",
                  "Обломок с упавшим барабаном." if broken else "Колонна с базой и капителью.", iso_dirs=4, tags=["руины"])
        H = 46 if broken else 84
        p = m.part("column", (20, H, 20))
        X, Y, Z = p.g
        r = np.sqrt((X - 10) ** 2 + (Z - 10) ** 2)
        p.fill((np.abs(X - 10) < 9) & (np.abs(Z - 10) < 9) & (Y < 6), "t_brick")
        p.fill((r < 7.5) & (Y >= 6) & (Y < 9), "t_tracery")
        p.fill((r < 6) & (Y >= 9) & (Y < H - 8), "t_column")
        if not broken:
            p.fill((r < 7.5) & (Y >= H - 8) & (Y < H - 4), "t_tracery")
            p.fill((np.abs(X - 10) < 9) & (np.abs(Z - 10) < 9) & (Y >= H - 4), "t_brick")
        else:
            crumble(p, 9, depth=12, k=0.4)
            drum = m.part("drum", (14, 13, 22), origin=(16, 0, -2))
            dX, dY, dZ = drum.g
            drum.fill(((dX - 7) ** 2 + (dY - 6.5) ** 2 <= 36) & (dZ > 2) & (dZ < 20), "t_column")
            m.tilt = (0, 0, 0)
        grow_moss(p, 11 + broken, MOSS[:2], amount=0.65)
        out.append(m)
    return out


def deck_arcade(p, X, Y, Z, x0, x1, y0, h, z0, z1, step=12):
    """A parapet pierced by a row of small pointed openings."""
    p.fill((X >= x0) & (X < x1) & (Y >= y0) & (Y < y0 + h) & (((Z >= z0) & (Z < z0 + 3)) | ((Z >= z1 - 3) & (Z < z1))), "t_brick")
    for ax in range(int(x0) + 3, int(x1) - step + 2, step):
        hole = lancet(X, Y, ax + 2, ax + step - 2, y0 + h * 0.45, 1.0) & (Y >= y0 + 2) & (Y < y0 + h - 2)
        p.carve(hole & (((Z >= z0) & (Z < z0 + 3)) | ((Z >= z1 - 3) & (Z < z1))))
    p.fill((X >= x0) & (X < x1) & (Y >= y0 + h - 2) & (Y < y0 + h) & (((Z >= z0 - 1) & (Z < z0 + 4)) | ((Z >= z1 - 4) & (Z < z1 + 1))), "t_tracery")


@asset
def viaduct():
    m = Model("viaduct", "Виадук", "city", "Две стрельчатые арки на трёх опорах, аркада парапета, фонари; кладка в мхе.", iso_dirs=4, tags=["руины", "мост"])
    W, H, D = 128, 112, 28
    p = m.part("viaduct", (W, H, D))
    X, Y, Z = p.g
    z0, z1 = 2, 26
    p.fill((Z >= z0) & (Z < z1) & (Y < 96), "t_brick")
    for (a, b) in ((18, 58), (70, 110)):
        p.carve(lancet(X, Y, a, b, 46, 1.0) & (Y > 0))
        ring = lancet(X, Y, a - 4, b + 4, 46, 1.0) & ~lancet(X, Y, a, b, 46, 1.0) & (Y > 44)
        p.fill(ring & (Z >= z0 - 1) & (Z < z1 + 1), "t_tracery")
    for px in (9, 64, 119):                                                  # piers with stepped cutwaters
        p.fill((np.abs(X - px) < 11) & (Z >= 0) & (Z < D) & (Y < 26), "t_brick_dark")
        p.fill((np.abs(X - px) < 9) & (Y >= 26) & (Y < 34) & (Z >= 1) & (Z < D - 1), "t_brick")
        p.fill((np.abs(X - px) < (11 - (Y - 26) * 0.25)) & (Y >= 26) & (Y < 34) & (Z >= 0) & (Z < D), "t_brick")
    p.fill((Y >= 88) & (Y < 92) & (Z >= z0 - 1) & (Z < z1 + 1), "t_tracery")                    # cornice
    p.fill((Y >= 92) & (Y < 96) & (Z >= z0 - 2) & (Z < z1 + 2), "t_paving")
    deck_arcade(p, X, Y, Z, 0, W, 96, 14, z0 - 2, z1 + 2)
    for lx in (9, 64, 119):
        lantern(p, lx, 110, z0 - 0.5, "amber")
        lantern(p, lx, 110, z1 + 0.5, "teal")
    crumble(p, 21, depth=10, k=0.6)
    p.carve(p.box((86, 98, 0), (100, 112, 6)))                              # a fallen bit of parapet
    grow_moss(p, 23, MOSS, amount=0.6)
    return m


def bridge_body(p, broken=False):
    X, Y, Z = p.g
    W = p.shape[0]
    hump = 6 * np.sin(np.clip(X / W, 0, 1) * math.pi)
    yd = 18 + hump
    deck = (Y >= yd) & (Y < yd + 6) & (Z >= 6) & (Z < 34)
    p.fill(deck, "t_paving")
    under = (Y >= yd - 6) & (Y < yd) & (Z >= 8) & (Z < 32) & (np.abs(X - W / 2) < W / 2 - 4)
    p.fill(under, "t_brick")
    for zz in (6, 31):                                                       # balustrades: quatrefoil band
        rail = (Y >= yd + 6) & (Y < yd + 14) & (Z >= zz) & (Z < zz + 3)
        p.fill(rail, "t_tracery")
        holes = rail & (((X.astype(int) % 8) - 4) ** 2 + ((Y - yd - 10) * 1.2) ** 2 < 5)
        p.carve(holes)
        p.fill((Y >= yd + 14) & (Y < yd + 16) & (Z >= zz - 1) & (Z < zz + 4), "t_brick")
    for px in (4, W - 5):
        p.fill((np.abs(X - px) < 4) & (Y < yd + 22) & (Z >= 4) & (Z < 36) & ((Z < 10) | (Z >= 30)), "t_brick")
    if broken:
        n = np.sin(Y * 0.7) * 3 + np.sin(Z * 0.9) * 2
        gap = (X > W * 0.44 + n) & (X < W * 0.62 - n)
        p.carve(gap)


@asset
def bridge():
    out = []
    for broken in (False, True):
        m = Model("bridge_broken" if broken else "bridge", "Обрушенный мост" if broken else "Мост с балюстрадой", "city",
                  "Пролёт обрушился, края осыпаются." if broken else "Горбатый мост, балюстрада с четырёхлистниками, фонари на устоях.",
                  iso_dirs=4, tags=["руины", "мост"])
        W = 112
        p = m.part("bridge", (W, 48, 40))
        bridge_body(p, broken)
        for px in (4, W - 5):
            lantern(p, px, 40, 7, "amber")
            lantern(p, px, 40, 33, "teal")
        crumble(p, 31 + broken, depth=6, k=0.6)
        if broken:                                                          # hanging stones at the break
            ch = m.part("chunk", (10, 10, 12), origin=(52, 2, 14))
            ch.fill(ch.ellipsoid((5, 5, 6), (4.5, 4.0, 5.2)), "t_brick_dark")
        grow_moss(p, 33 + broken, MOSS, amount=0.5)
        out.append(m)
    return out


@asset
def cathedral_tower():
    m = Model("cathedral_tower", "Башня собора", "city", "Башня с контрфорсами, стрельчатыми витражами, розой, звонницей и шпилем.",
              iso_dirs=4, tags=["руины", "главное"])
    W, H, D = 64, 256, 64
    p = m.part("tower", (W, H, D))
    X, Y, Z = p.g
    c = W / 2
    ax, az = np.abs(X - c), np.abs(Z - c)
    p.fill((ax < 26) & (az < 26) & (Y < 152), "t_brick")
    p.fill((ax < 30) & (az < 30) & (Y < 10), "t_brick_dark")                          # plinth
    for (bx, bz) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):                             # corner buttresses, stepping in
        cx, cz = c + bx * 25, c + bz * 25
        for y0, y1, w in ((0, 62, 8), (62, 108, 6), (108, 150, 4.5)):
            p.fill((np.abs(X - cx) < w) & (np.abs(Z - cz) < w) & (Y >= y0) & (Y < y1), "t_brick")
        pinnacle(p, cx, cz, 150, 176, 8)
    for y in (56, 106, 148):                                                          # string courses
        p.fill((ax < 27.5) & (az < 27.5) & (Y >= y) & (Y < y + 3), "t_tracery")
    U = np.where(az >= ax, X, Z)                                                      # coordinate along the face
    face = (np.maximum(ax, az) > 23)
    for (u0, u1, s0, y_lo) in ((20, 29, 84, 60), (35, 44, 84, 60), (24, 40, 134, 110)):
        win = lancet(U, Y, u0, u1, s0, 1.0) & (Y > y_lo) & face
        p.carve(win & (np.maximum(ax, az) > 24))
        p.fill(win & (np.maximum(ax, az) <= 24) & (np.maximum(ax, az) > 23), "t_glass_azure" if y_lo < 100 else "t_glass_amber")
    rr = np.sqrt((X - c) ** 2 + (Y - 82) ** 2)
    front = Z > c + 22
    p.carve((rr < 12) & front & (Z > c + 24))
    p.fill((rr < 12) & (Z > c + 22) & (Z <= c + 24), "t_glass_rose")
    ang = np.arctan2(Y - 82, X - c)
    spokes = ((np.abs(np.sin(ang * 4)) < 0.16) & (rr < 11.5) & (rr > 3)) | ((rr > 11) & (rr < 14)) | (rr < 3)
    p.fill(spokes & (Z > c + 22) & (Z < c + 27), "t_tracery")
    p.carve((Z > c + 22) & (np.abs(X - c) < 14) & (Y > 60) & (Y < 100) & ~(rr < 14.5) & (Z > c + 25))   # the rose sits in a niche
    door = lancet(X, Y, c - 10, c + 10, 26, 1.0) & front
    p.carve(door & (Z > c + 20))
    p.fill(lancet(X, Y, c - 14, c + 14, 26, 1.0) & ~lancet(X, Y, c - 10, c + 10, 26, 1.0) & (Y > 22) & (Z > c + 24) & (Z < c + 28), "t_tracery")
    crumble(p, 41, depth=8, k=0.7)
    # belfry: open lancets on every face
    bel = np.zeros(p.shape, bool)
    for (u0, u1) in ((18, 30), (34, 46)):
        bel |= lancet(U, Y, u0, u1, 172, 1.0) & (Y > 156) & (Y < 184)
    p.fill((ax < 23) & (az < 23) & (Y >= 152) & (Y < 188) & ~bel, "t_brick")
    p.fill((ax < 24) & (az < 24) & (Y >= 152) & (Y < 155), "t_tracery")
    p.fill((ax < 24) & (az < 24) & (Y >= 186) & (Y < 189), "t_tracery")
    p.carve((ax < 19) & (az < 19) & (Y >= 155) & (Y < 184))
    # the spire: a slender octagonal pyramid with crockets and a glowing finial
    k = np.clip((Y - 188) / (H - 10 - 188), 0, 1)
    half = 19 * (1 - k) ** 1.15 + 0.6
    octa = (ax < half) & (az < half) & (ax + az < half * 1.42)
    p.fill(octa & (Y >= 188) & (Y < H - 10), "t_brick_dark")
    crock = octa & (Y >= 192) & (Y < H - 12) & ((Y.astype(int) % 8) == 0) & ((ax + az) > half * 1.42 - 2.4)
    p.fill(crock, "stone", 5)
    for yy in (200, 220):                                                             # little gables (lucarnes)
        p.fill((np.abs(X - c) < 3) & (Z > c) & (Z < c + 19 * (1 - (yy - 188) / 58) + 3) & (Y >= yy) & (Y < yy + 6), "t_brick_dark")
        p.fill((np.abs(X - c) < 1.6) & (Z > c + 19 * (1 - (yy - 188) / 58) + 1) & (Z < c + 19 * (1 - (yy - 188) / 58) + 3) & (Y >= yy) & (Y < yy + 4), "amber")
    p.fill((ax < 1.5) & (az < 1.5) & (Y >= H - 10) & (Y < H - 2), "iron")
    p.fill(p.sphere((c, H - 3, c), 1.8), "amber_hot")
    p.fill((np.abs(X - c) < 3.5) & (np.abs(Z - c) < 0.6) & (np.abs(Y - (H - 6)) < 0.6), "iron")
    grow_moss(p, 43, MOSS, amount=0.55, drip=9)
    return m


@asset
def lancet_window():
    m = Model("lancet_window", "Стрельчатое окно-витраж", "city", "Двойное окно с трилистником, свинцовые переплёты.", iso_dirs=4)
    W, H, D = 32, 64, 8
    p = m.part("window", (W, H, D))
    X, Y, Z = p.g
    p.fill((Y < 64), "t_brick")
    outer = lancet(X, Y, 4, 28, 40, 1.0) & (Y > 4)
    p.carve(outer & (Z > 2))
    for (a, b) in ((6, 15), (17, 26)):
        p.fill(lancet(X, Y, a, b, 40, 1.0) & (Y > 6) & (Z > 2) & (Z <= 4), "t_glass_rose" if a < 10 else "t_glass_azure")
    trefoil = ((X - 16) ** 2 + (Y - 50) ** 2) < 14
    p.fill(trefoil & (Z > 2) & (Z <= 4), "t_glass_amber")
    p.fill((np.abs(X - 16) < 1.2) & (Y > 4) & (Y < 46) & (Z > 2), "t_tracery")
    p.fill(((((X - 16) ** 2 + (Y - 50) ** 2) >= 14) & (((X - 16) ** 2 + (Y - 50) ** 2) < 22)) & (Z > 2), "t_tracery")
    p.fill((Y < 5) & (Z >= 0), "t_tracery")
    grow_moss(p, 51, ["teal"], amount=0.5, drip=4)
    return m


@asset
def stairs():
    m = Model("stairs", "Лестница", "city", "Широкие ступени собора, выщербленные и в мхе.", iso_dirs=4, tags=["руины"])
    p = m.part("stairs", (48, 34, 40))
    X, Y, Z = p.g
    step = np.floor(Z / 5)
    p.fill((Y < (8 - step) * 4) & (Z < 40), "t_paving")
    p.fill(((X < 4) | (X >= 44)) & (Y < (8 - step) * 4 + 6), "t_brick")
    crumble(p, 61, depth=4, k=0.62)
    grow_moss(p, 63, ["emerald", "teal"], amount=0.45, drip=3)
    return m
