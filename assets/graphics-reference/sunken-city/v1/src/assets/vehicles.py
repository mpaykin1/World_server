"""Bathyscaphes and other craft: the great bathyscaphe (float, crew sphere, searchlights, propeller),
a scout bathyscaphe drone, a small submarine and a sea scooter. Propellers spin, lights breathe."""
import math

import numpy as np

from vox import Model, wave, TAU, noise3
from assets import asset
from assets.kit import speckle


def propeller(m, name, parent, origin, r=4.0, blades=3, mat="brass", hub="iron"):
    pr = m.part(name, (3, int(2 * r + 3), int(2 * r + 3)), origin=origin, pivot=(1.5, r + 1.5, r + 1.5), parent=parent)
    X, Y, Z = pr.g
    c = r + 1.5
    ang = np.arctan2(Z - c, Y - c)
    d = np.sqrt((Y - c) ** 2 + (Z - c) ** 2)
    blade = (np.abs(np.sin((ang) * blades / 2)) > 0.86) & (d < r + 0.5) & (np.abs(X - 1.5) < 0.9)
    pr.fill(blade, mat)
    pr.fill((d < 1.6) & (np.abs(X - 1.5) < 1.5), hub)
    return pr


@asset
def bathyscaphe():
    m = Model("bathyscaphe", "Батискаф", "vehicle", "Поплавок с бензином, гондола с иллюминаторами, прожекторы, винт; покачивается на ходу.",
              iso_dirs=8, tags=["транспорт", "анимация", "главное"])
    L, H, D = 48, 34, 26
    f = m.part("float", (L, H, D), pivot=(24, 17, 13))
    X, Y, Z = f.g
    zc = D / 2
    u = X / L
    r = 9.5 * np.clip(np.sin(np.clip(u, 0, 1) * math.pi) ** 0.45, 0.2, 1)
    hull = ((Y - 22) ** 2 * 1.25 + (Z - zc) ** 2 < r * r) & (X > 2) & (X < L - 1)
    f.fill(hull, "t_brass")
    f.paint(hull & (Y < 19), "iron", 2)
    f.fill((np.abs(Y - 22) < 0.7) & hull & ((X.astype(int) % 6) == 0), "brass", 6)
    f.fill(f.box((19, 31, zc - 3), (27, 34, zc + 3)), "iron")                           # hatch tower
    f.fill(f.box((20, 33, zc - 2), (26, 34, zc + 2)), "brass", 5)
    for sg in (1, -1):                                                                  # stabiliser fins
        f.fill(f.where(lambda X, Y, Z, sg=sg: (X > 3) & (X < 11) & (np.abs(Z - zc - sg * 9.5) < 0.6 + (11 - X) * 0.25) & (np.abs(Y - 22) < 0.7)), "iron")
    f.fill(f.where(lambda X, Y, Z: (X > 3) & (X < 10) & (np.abs(Z - zc) < 0.7) & (Y > 26) & (Y < 26 + (10 - X) * 0.9)), "iron")
    # the crew sphere hanging under the float, portholes lit from inside
    sph = f.sphere((26, 10, zc), 8.2)
    f.fill(sph, "iron")
    f.fill(f.box((23, 13, zc - 3), (29, 16, zc + 3)), "iron_d")
    for (px, py, pz) in ((26, 11, zc + 7.6), (33.6, 10, zc), (26, 11, zc - 7.6)):
        port = f.sphere((px, py, pz), 2.6) & sph
        f.fill(port, "amber")
        f.paint(f.sphere((px - 0.8, py + 0.8, pz), 1.0) & sph, "amber_hot")
        f.fill(f.sphere((px, py, pz), 3.3) & sph & ~port, "brass", 5)
    for (lx, ly) in ((L - 2.5, 22), (34, 4.5)):                                          # searchlights
        f.fill(f.sphere((lx, ly, zc), 2.0), "iron_d")
        f.fill(f.sphere((lx + 1.2, ly, zc), 1.3), "azure_hot")
    f.fill(f.capsule((20, 13, zc), (20, 4, zc + 5), 0.6), "iron")                         # manipulator arm
    f.fill(f.capsule((20, 4, zc + 5), (25, 1.5, zc + 6), 0.6), "iron")
    speckle(f, f.m == f.m[24, 26, int(zc)], 5, 2, seed=13, p=0.05)
    prop = propeller(m, "prop", f, (-1.5, 22 - 5.5, zc - 5.5), r=4.0, blades=3)
    m.clip("cruise", "идёт, винт крутится", 8, 12)
    f.anim["cruise"] = lambda ph: {"t": (0, 0.9 * math.sin(TAU * ph), 0), "r": (0, 0, 0.04 * math.sin(TAU * ph - 0.8)), "glow": round(math.sin(TAU * ph * 2))}
    prop.anim["cruise"] = lambda ph: {"r": (TAU / 3 * ph * 2, 0, 0)}
    return m


@asset
def scout_drone():
    m = Model("scout_drone", "Батискаф-разведчик", "vehicle", "Шар-разведчик с огромной линзой и двумя движками; зависает и осматривается.",
              iso_dirs=8, tags=["транспорт", "анимация"])
    b = m.part("body", (18, 16, 16), pivot=(9, 8, 8))
    X, Y, Z = b.g
    sph = b.sphere((9, 8, 8), 6.6)
    b.fill(sph, "brass")
    b.paint(sph & (Y < 6), "copper", 3)
    lens = b.sphere((14.4, 8.5, 8), 3.6) & sph
    b.fill(b.sphere((14.0, 8.5, 8), 4.4) & sph, "iron_d")
    b.fill(lens, "teal")
    b.fill(b.sphere((15.2, 9.6, 8), 1.2) & sph, "teal_hot")
    b.fill(b.box((8.5, 14, 7.5), (9.5, 16, 8.5)), "iron")
    b.fill(b.sphere((9, 16, 8), 0.8), "crimson_hot")
    props = []
    for k, sg in enumerate((1, -1)):
        pod = m.part(f"pod{k}", (8, 6, 4), origin=(3, 5, 8 + sg * 7 - 2), pivot=(4, 3, 2), parent=b)
        pod.fill(pod.ellipsoid((4, 3, 2), (3.8, 2.4, 1.8)), "iron")
        pr = propeller(m, f"prop{k}", pod, (-2.2, -1.0, -2.5), r=2.8, blades=2)
        pr.anim["hover"] = (lambda k: lambda ph: {"r": (TAU * 2 * ph * (1 if k else -1), 0, 0)})(k)
        props.append(pr)
    m.clip("hover", "зависает", 8, 10)
    b.anim["hover"] = lambda ph: {"t": (0, 0.8 * math.sin(TAU * ph), 0), "r": (0, wave(ph, 0.5, 0.18), 0), "glow": round(math.sin(TAU * ph))}
    return m


@asset
def submarine():
    m = Model("submarine", "Подводная лодка", "vehicle", "Маленькая лодка: рубка, перископ, рули глубины, горящие иллюминаторы.",
              iso_dirs=8, tags=["транспорт", "анимация"])
    L, H, D = 64, 28, 20
    h = m.part("hull", (L, H, D), pivot=(32, 12, 10))
    X, Y, Z = h.g
    zc = D / 2
    u = X / L
    r = 8 * np.clip(np.sin(np.clip(u, 0, 1) * math.pi) ** 0.4, 0.2, 1)
    hull = ((Y - 11) ** 2 + (Z - zc) ** 2 < r * r) & (X > 3)
    h.fill(hull, "t_copper")
    h.paint(hull & (Y > 15.5), "t_brass")
    h.fill((np.abs(X - 36) < 7 - (Y - 18) * 0.25) & (np.abs(Z - zc) < 3) & (Y >= 17) & (Y < 25), "t_brass")
    h.fill((np.abs(X - 38) < 0.8) & (np.abs(Z - zc) < 0.8) & (Y >= 25) & (Y < 28), "iron")
    h.fill((np.abs(X - 39.3) < 1.5) & (np.abs(Z - zc) < 0.8) & (Y >= 27) & (Y < 28), "iron")
    for px in range(14, 58, 7):
        for sg in (1, -1):
            pz = zc + sg * 7.3
            h.fill(((X - px) ** 2 + (Y - 11.5) ** 2 < 2.6) & (np.abs(Z - pz) < 1.2) & hull, "amber")
    h.fill(h.where(lambda X, Y, Z: (np.abs(X - 54) < 2.5) & (np.abs(Y - 11) < 0.6) & (np.abs(Z - zc) < 11)), "iron")      # dive planes
    h.fill(h.where(lambda X, Y, Z: (X < 9) & (X > 4) & (np.abs(Z - zc) < 0.6) & (np.abs(Y - 11) < 7 - (9 - X) * 0.6)), "iron")
    h.fill(h.sphere((L - 1.5, 11, zc), 1.4), "azure_hot")
    prop = propeller(m, "prop", h, (0.5, 11 - 4.5, zc - 4.5), r=3.0, blades=4)
    m.clip("cruise", "идёт", 8, 12)
    h.anim["cruise"] = lambda ph: {"t": (0, 0.6 * math.sin(TAU * ph), 0), "r": (0, 0, 0.03 * math.sin(TAU * ph - 0.6))}
    prop.anim["cruise"] = lambda ph: {"r": (TAU / 4 * ph * 3, 0, 0)}
    return m


@asset
def sea_scooter():
    m = Model("sea_scooter", "Подводный скутер", "vehicle", "Буксировщик водолаза: винт в кольце, фара, ручки.", iso_dirs=8, tags=["транспорт", "анимация"])
    L, H, D = 28, 12, 12
    b = m.part("body", (L, H, D), pivot=(14, 6, 6))
    X, Y, Z = b.g
    r = 4.4 * np.clip(np.sin(np.clip(X / L, 0, 1) * math.pi) ** 0.3, 0.3, 1)
    body = ((Y - 6) ** 2 + (Z - 6) ** 2 < r * r) & (X > 4)
    b.fill(body, "gold")
    b.tone(body & (np.abs(X - 16) < 0.6), 2)
    b.fill(b.sphere((L - 1.5, 6, 6), 1.8), "teal_hot")
    shroud = (np.abs(np.sqrt((Y - 6) ** 2 + (Z - 6) ** 2) - 4.6) < 0.8) & (X > 0) & (X < 5)
    b.fill(shroud, "iron")
    for sg in (1, -1):
        b.fill(b.capsule((15, 6, 6 + sg * 4), (13, 9.5, 6 + sg * 5.5), 0.7), "iron_d")
    prop = propeller(m, "prop", b, (1.0, 6 - 4.5, 6 - 4.5), r=3.0, blades=3, mat="iron")
    m.clip("run", "работает", 8, 14)
    prop.anim["run"] = lambda ph: {"r": (TAU / 3 * ph * 4, 0, 0)}
    b.anim["run"] = lambda ph: {"t": (0, 0.3 * math.sin(TAU * ph), 0), "glow": round(math.sin(TAU * ph * 2))}
    return m
