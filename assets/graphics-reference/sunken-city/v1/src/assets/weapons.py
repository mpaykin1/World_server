"""Underwater weapons (horizontal, grip on the left): harpoon gun and its harpoon, trident, bubble cannon and
its bubble, shock spear, torpedo, hand sonar, a coral blade."""
import math

import numpy as np

from vox import Model, wave, TAU
from assets import asset
from assets.kit import speckle


@asset
def harpoon_gun():
    m = Model("harpoon_gun", "Гарпунное ружьё", "weapon", "Деревянный приклад, латунный ствол, гарпун заряжен, линь смотан.", iso_dirs=4, tags=["оружие"])
    p = m.part("gun", (38, 11, 5))
    X, Y, Z = p.g
    zc = 2.5
    flat = np.abs(Z - zc) < 1.6
    stock = (X < 13) & (Y > 2) & (Y < 7 + (13 - X) * 0.12) & flat & ~((X > 6) & (X < 11) & (Y < 4.5))
    p.fill(stock, "wood")
    p.tone(stock & (Y > 6), 4)
    p.fill((X >= 12) & (X < 28) & (np.abs(Y - 6) < 1.6) & (np.abs(Z - zc) < 1.4), "brass")
    p.fill((X >= 12) & (X < 28) & (np.abs(Y - 7.2) < 0.5) & (np.abs(Z - zc) < 0.6), "brass", 6)
    p.fill((X >= 10) & (X < 14) & (Y >= 1) & (Y < 5) & (np.abs(Z - zc) < 0.8) & ~((X > 11) & (X < 13) & (Y < 3.5)), "iron")    # trigger guard
    p.fill((X >= 20) & (X < 37) & (np.abs(Y - 8.4) < 0.5) & (np.abs(Z - zc) < 0.6), "iron", 5)   # the loaded shaft
    p.fill((X >= 34) & (X < 38) & (np.abs(Y - 8.4) < 1.6 - (X - 34) * 0.4) & (np.abs(Z - zc) < 0.6), "iron", 6)
    p.fill((np.abs(X - 33) < 0.6) & (Y > 8) & (Y < 10.5) & (np.abs(Z - zc) < 0.6), "iron", 4)
    coil = (np.abs(np.sqrt((X - 16) ** 2 + (Y - 3.0) ** 2) - 2.2) < 0.8) & (np.abs(Z - zc) < 1.2)
    p.fill(coil, "cloth", 5)
    p.fill((X >= 26) & (X < 29) & (np.abs(Y - 6) < 2.2) & (np.abs(Z - zc) < 1.8), "brass", 3)
    return m


@asset
def harpoon():
    m = Model("harpoon", "Гарпун", "weapon", "Снаряд: зазубренный наконечник, кольцо для линя.", iso_dirs=4, tags=["снаряд"])
    p = m.part("harpoon", (26, 7, 3))
    X, Y, Z = p.g
    p.fill((X >= 3) & (X < 21) & (np.abs(Y - 3.5) < 0.6) & (np.abs(Z - 1.5) < 0.6), "iron", 4)
    p.fill((X >= 20) & (X < 26) & (np.abs(Y - 3.5) < (26 - X) * 0.42) & (np.abs(Z - 1.5) < 0.6), "iron", 6)
    for bx in (19.0, 16.5):
        p.fill((np.abs(X - bx) < 0.6) & (np.abs(Y - 3.5) < 2.4) & (np.abs(Z - 1.5) < 0.6) & (np.abs(Y - 3.5) > 0.5), "iron", 5)
    p.fill((np.abs(np.sqrt((X - 1.8) ** 2 + (Y - 3.5) ** 2) - 1.4) < 0.6) & (np.abs(Z - 1.5) < 0.6), "brass")
    return m


@asset
def trident():
    m = Model("trident", "Трезубец", "weapon", "Медное древко, три зубца с сияющими остриями; свет пульсирует.", iso_dirs=4, tags=["оружие", "анимация"])
    p = m.part("trident", (46, 13, 3))
    X, Y, Z = p.g
    zc, yc = 1.5, 6.5
    flat = np.abs(Z - zc) < 0.6
    p.fill((X < 34) & (np.abs(Y - yc) < 0.7) & flat, "verd")
    p.fill((X < 8) & (np.abs(Y - yc) < 0.9) & flat, "cloth", 2)
    p.fill((X >= 32) & (X < 35) & (np.abs(Y - yc) < 5.0) & flat, "verd", 4)
    for dy in (-4.3, 0, 4.3):
        L = 46 if dy == 0 else 43
        p.fill((X >= 34) & (X < L) & (np.abs(Y - yc - dy) < 0.6) & flat, "verd", 5)
        p.fill((X >= L - 3) & (X < L) & (np.abs(Y - yc - dy) < 0.6) & flat, "teal_hot")
        p.fill((np.abs(X - (L - 4.5)) < 0.6) & (np.abs(Y - yc - dy) < 1.6) & flat, "verd", 5)
    p.fill(p.sphere((33.5, yc, zc), 1.4), "teal")
    m.clip("glow", "пульсирует", 8, 8)
    p.anim["glow"] = lambda ph: {"glow": round(1.5 * math.sin(TAU * ph))}
    return m


@asset
def bubble_gun():
    out = []
    m = Model("bubble_gun", "Пузырная пушка", "weapon", "Латунный раструб, стеклянный бак со светящимися пузырями.", iso_dirs=4, tags=["оружие", "анимация"])
    p = m.part("gun", (30, 15, 9))
    X, Y, Z = p.g
    zc = 4.5
    p.fill((X < 9) & (Y > 2) & (Y < 7) & (np.abs(Z - zc) < 1.8), "wood")
    p.fill((X >= 8) & (X < 22) & ((Y - 6) ** 2 + (Z - zc) ** 2 < 9), "brass")
    bell = (X >= 21) & (X < 30) & ((Y - 6) ** 2 + (Z - zc) ** 2 < (2.6 + (X - 21) * 0.5) ** 2)
    p.fill(bell, "brass", 5)
    p.carve((X >= 23) & ((Y - 6) ** 2 + (Z - zc) ** 2 < (1.6 + (X - 23) * 0.5) ** 2))
    tank = (X >= 10) & (X < 19) & ((Y - 11.5) ** 2 + (Z - zc) ** 2 < 8.5)
    p.fill(tank, "glass")
    for bx, by in ((12, 11), (15, 12.5), (17, 10.6)):
        p.fill(p.sphere((bx, by, zc), 1.0), "teal")
    p.fill((X >= 9) & (X < 20) & (np.abs(Y - 9) < 0.6) & (np.abs(Z - zc) < 2.4), "brass", 2)
    m.clip("fire", "стреляет", 6, 12)
    p.anim["fire"] = lambda ph: {"t": (-1.5 * math.sin(math.pi * ph) if ph < 0.5 else 0, 0, 0), "glow": 2 if ph < 0.3 else 0}
    out.append(m)
    b = Model("bubble", "Пузырь-снаряд", "weapon", "Светящийся пузырь: дрожит в полёте.", iso_dirs=4, tags=["снаряд", "анимация"])
    q = b.part("bubble", (10, 10, 10), pivot=(5, 5, 5))
    sph = q.sphere((5, 5, 5), 4.4)
    q.fill(sph & ~q.sphere((5, 5, 5), 3.2), "glass")
    q.fill(q.sphere((5, 5, 5), 2.2), "teal_dim")
    q.fill(q.sphere((3.6, 6.6, 7.0), 1.0) & sph, "teal_hot")
    b.clip("wobble", "дрожит", 8, 10)
    q.anim["wobble"] = lambda ph: {"s": (1 + 0.1 * math.sin(TAU * ph), 1 - 0.1 * math.sin(TAU * ph), 1 + 0.05 * math.sin(TAU * ph * 2))}
    out.append(b)
    return out


@asset
def shock_spear():
    m = Model("shock_spear", "Электро-острога", "weapon", "Железное древко, медные витки катушки, на острие трещит разряд.", iso_dirs=4, tags=["оружие", "анимация"])
    p = m.part("spear", (46, 9, 4))
    X, Y, Z = p.g
    zc, yc = 2, 4.5
    p.fill((X < 36) & (np.abs(Y - yc) < 0.7) & (np.abs(Z - zc) < 0.7), "iron")
    p.fill((X < 9) & (np.abs(Y - yc) < 1.0) & (np.abs(Z - zc) < 1.0) & ((X.astype(int) % 2) == 0), "cloth", 2)
    coil = (X >= 30) & (X < 38) & ((Y - yc) ** 2 + (Z - zc) ** 2 < 5)
    p.fill(coil, "copper")
    p.tone(coil & ((X.astype(int) % 2) == 0), 5)
    p.fill((X >= 38) & (X < 46) & (np.abs(Y - yc) < (46 - X) * 0.24 + 0.2) & (np.abs(Z - zc) < 0.6), "iron", 6)
    p.fill(p.sphere((44.5, yc, zc), 1.0), "spark")
    for k in range(3):
        p.fill(p.capsule((38, yc, zc), (41 + k, yc + (1.5 if k % 2 else -1.5), zc), 0.5), "spark")
    m.clip("charge", "трещит разрядом", 8, 12)
    p.anim["charge"] = lambda ph: {"glow": [1, -1, 2, 0, 1, -2, 2, -1][int(ph * 8) % 8]}
    return m


@asset
def torpedo():
    m = Model("torpedo", "Торпеда", "weapon", "Снаряд: красная боеголовка, стабилизаторы, винт крутится.", iso_dirs=4, tags=["снаряд", "анимация"])
    b = m.part("body", (34, 11, 11), pivot=(17, 5.5, 5.5))
    X, Y, Z = b.g
    r = 3.4 * np.clip(np.clip(np.sin(np.clip((X - 3) / 30, 0, 1) * math.pi), 0, 1) ** 0.25, 0.5, 1)
    body = ((Y - 5.5) ** 2 + (Z - 5.5) ** 2 < r * r) & (X > 3)
    b.fill(body, "iron")
    b.paint(body & (X > 27), "blood", 3)
    b.paint(body & (np.abs(X - 20) < 1), "brass")
    for (dy, dz) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        b.fill(b.where(lambda X, Y, Z, dy=dy, dz=dz: (X > 3) & (X < 8) & (np.abs((Y - 5.5) * dz - (Z - 5.5) * dy) < 0.6) & (((Y - 5.5) * dy + (Z - 5.5) * dz) > 0) & (((Y - 5.5) * dy + (Z - 5.5) * dz) < 5.2)), "iron_d")
    pr = m.part("prop", (3, 9, 9), origin=(0, 1, 1), pivot=(1.5, 4.5, 4.5), parent=b)
    PX, PY, PZ = pr.g
    ang = np.arctan2(PZ - 4.5, PY - 4.5)
    pr.fill((np.abs(np.sin(ang * 1.5)) > 0.85) & (((PY - 4.5) ** 2 + (PZ - 4.5) ** 2) < 16) & (np.abs(PX - 1.5) < 0.8), "brass")
    pr.fill((((PY - 4.5) ** 2 + (PZ - 4.5) ** 2) < 2.0), "brass", 2)
    m.clip("run", "идёт", 8, 16)
    pr.anim["run"] = lambda ph: {"r": (TAU / 3 * ph * 3, 0, 0)}
    b.anim["run"] = lambda ph: {"r": (0.2 * math.sin(TAU * ph), 0, 0)}
    return m


@asset
def hand_sonar():
    m = Model("hand_sonar", "Ручной сонар", "weapon", "Латунная тарелка с сияющим ядром: импульс расходится кольцами.", iso_dirs=4, tags=["оружие", "анимация"])
    p = m.part("sonar", (18, 16, 12))
    X, Y, Z = p.g
    dish = (np.abs(np.sqrt((Y - 9) ** 2 + (Z - 6) ** 2) - (X - 6) * 0.9) < 1.0) & (X > 6) & (X < 13)
    p.fill(dish, "brass")
    p.fill(p.sphere((10, 9, 6), 1.8), "azure_hot")
    p.fill((X >= 3) & (X < 8) & (np.abs(Y - 9) < 1.5) & (np.abs(Z - 6) < 1.5), "iron")
    p.fill((X >= 2) & (X < 5) & (Y >= 2) & (Y < 9) & (np.abs(Z - 6) < 1.2), "wood")
    m.clip("ping", "импульс", 8, 8)
    p.anim["ping"] = lambda ph: {"glow": 2 if ph < 0.15 else (1 if ph < 0.4 else -1)}
    return m


@asset
def coral_blade():
    m = Model("coral_blade", "Коралловый клинок", "weapon", "Клинок из розового коралла, рукоять из кости, кромка светится.", iso_dirs=4, tags=["оружие"])
    p = m.part("blade", (36, 11, 3))
    X, Y, Z = p.g
    yc, zc = 5.5, 1.5
    flat = np.abs(Z - zc) < 0.6
    p.fill((X < 8) & (np.abs(Y - yc) < 0.9) & flat, "bone")
    p.fill((np.abs(X - 8.5) < 1.2) & (np.abs(Y - yc) < 3.6) & flat, "bone", 3)
    w = 2.2 * np.clip(1 - (X - 9) / 28, 0, 1) ** 0.5 + 0.4 * np.sin(X * 1.3)
    blade = (X >= 9) & (X < 36) & (np.abs(Y - yc - 0.5 * np.sin(X * 0.4)) < w) & flat
    p.fill(blade, "coral_p")
    p.paint(blade & (Y - yc - 0.5 * np.sin(X * 0.4) > w - 0.9), "teal")
    speckle(p, blade, 5, 2, seed=2, p=0.12)
    return m
