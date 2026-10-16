"""Finds of the deep: a pearl in its clam, a doubloon, an air bubble, a starfish (heals)."""
import math

import numpy as np

from vox import Model, wave, TAU
from assets import asset


@asset
def pearl_clam():
    m = Model("pearl_clam", "Жемчужина в раковине", "pickup", "Створки приоткрываются, жемчужина мерцает.", iso_dirs=4, tags=["находка", "анимация"])
    b = m.part("lower", (14, 5, 12))
    X, Y, Z = b.g
    shell = ((X - 7) ** 2 / 42 + (Z - 6) ** 2 / 30 + (Y / 4.2) ** 2 < 1) & (Y < 3.2)
    b.fill(shell, "shell")
    b.tone(shell & (np.sin(np.arctan2(Z - 6, X - 7) * 7) > 0.5), 3)
    b.carve(((X - 7) ** 2 / 30 + (Z - 6) ** 2 / 20 < 1) & (Y > 1.6))
    b.fill(b.sphere((7, 3.0, 6), 2.0), "pearl")
    b.fill(b.sphere((6.4, 3.8, 5.6), 0.8), "teal_hot")
    top = m.part("upper", (14, 5, 12), origin=(0, 2.6, 0), pivot=(7, 0.5, 0.8), parent=b)
    TX, TY, TZ = top.g
    s2 = ((TX - 7) ** 2 / 42 + (TZ - 6) ** 2 / 30 + (TY / 4.2) ** 2 < 1) & (TY < 3.2) & (TY > 0.5)
    top.fill(s2, "shell", 5)
    top.tone(s2 & (np.sin(np.arctan2(TZ - 6, TX - 7) * 7) > 0.5), 3)
    m.clip("open", "приоткрывается", 8, 6)
    top.anim["open"] = lambda ph: {"r": (-0.5 * (0.5 - 0.5 * math.cos(TAU * ph)), 0, 0)}
    b.anim["open"] = lambda ph: {"glow": round(1.4 * math.sin(TAU * ph * 2))}
    return m


@asset
def doubloon():
    m = Model("doubloon", "Дублон", "pickup", "Золотая монета с крестом: вращается.", iso_dirs=4, tags=["находка", "анимация"])
    p = m.part("coin", (10, 10, 2), pivot=(5, 5, 1))
    X, Y, Z = p.g
    r = np.sqrt((X - 5) ** 2 + (Y - 5) ** 2)
    p.fill(r < 4.6, "gold")
    p.tone((r > 3.6) & (r < 4.6), 5)
    p.tone(((np.abs(X - 5) < 0.6) | (np.abs(Y - 5) < 0.6)) & (r < 3), 3)
    m.clip("spin", "вращается", 8, 10)
    p.anim["spin"] = lambda ph: {"r": (0, TAU * ph / 2, 0), "t": (0, 0.4 * math.sin(TAU * ph), 0)}
    return m


@asset
def air_bubble():
    m = Model("air_bubble", "Пузырь воздуха", "pickup", "Глоток воздуха: колышется и дрожит.", iso_dirs=4, tags=["находка", "анимация"])
    p = m.part("bubble", (12, 12, 12), pivot=(6, 6, 6))
    sph = p.sphere((6, 6, 6), 5.2)
    p.fill(sph & ~p.sphere((6, 6, 6), 4.0), "glass")
    p.fill(p.sphere((4.3, 8.0, 8.2), 1.2) & sph, "pearl", 5)
    p.fill(p.sphere((8.2, 4.0, 8.6), 0.7) & sph, "pearl", 4)
    m.clip("wobble", "дрожит", 8, 8)
    p.anim["wobble"] = lambda ph: {"s": (1 + 0.08 * math.sin(TAU * ph), 1 - 0.08 * math.sin(TAU * ph), 1), "t": (0.5 * math.sin(TAU * ph * 2), 0.6 * math.sin(TAU * ph), 0)}
    return m


@asset
def starfish():
    m = Model("starfish", "Морская звезда", "pickup", "Лечит: пять лучей с огоньками, пульсирует.", iso_dirs=4, tags=["находка", "анимация"])
    m.view2d = (-1.1, 0.0, 0.0)
    p = m.part("star", (16, 4, 16), pivot=(8, 1, 8))
    X, Y, Z = p.g
    a = np.arctan2(Z - 8, X - 8)
    r = np.sqrt((X - 8) ** 2 + (Z - 8) ** 2)
    arm = r < 2.2 + 5.6 * np.maximum(0, np.cos((a * 5 + math.pi / 2) / 2) ** 6)
    body = arm & (Y < 2.0 + 1.2 * (1 - r / 8)) & (r < 8)
    p.fill(body, "crab")
    p.tone(body & (Y > 1.8), 5)
    dots = body & ((((X.astype(int) + Z.astype(int)) % 3) == 0)) & (Y > 1.6) & (r > 2.5)
    p.paint(dots, "amber")
    p.paint(body & (r < 1.4) & (Y > 1.6), "amber_hot")
    m.clip("pulse", "пульсирует", 8, 8)
    p.anim["pulse"] = lambda ph: {"s": (1 + 0.06 * math.sin(TAU * ph), 1, 1 + 0.06 * math.sin(TAU * ph)), "glow": round(1.3 * math.sin(TAU * ph))}
    return m
