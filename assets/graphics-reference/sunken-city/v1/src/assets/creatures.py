"""Fish of the drowned city: glowing fish in four colours, the lanternfish with rows of lights, the
anglerfish that fishes with an old Edison light bulb, and the electric eel."""
import math

import numpy as np

import profile
from vox import Model, wave, TAU
from assets import asset
from assets.kit import ell, poly, line, rows, swim, speckle

FISH_ROWS = [
    "................",
    ".......ggf......",
    "g.....bbbbbb....",
    "gg...bbbbbbbbb..",
    ".gffbsssssssbbe.",
    "gg...lbbbbbbbbb.",
    "g.....lllllll...",
    "........ff......",
    "................",
]


@asset
def glow_fish():
    out = []
    for c, ru in (("teal", "бирюзовая"), ("violet", "лиловая"), ("amber", "янтарная"), ("emerald", "изумрудная")):
        m = Model(f"glow_fish_{c}", f"Светящаяся рыбка, {ru}", "creature",
                  "Мелкая стайная рыба: светится полоса, хвост и спинной плавник.", iso_dirs=8, tags=["стая", "анимация"])
        p = m.part("body", (16, 9, 7))
        leg = {"b": dict(mat="fish"), "l": dict(mat="belly"), "s": dict(mat="fish", kind="paint", paint=c),
               "e": dict(mat="fish", kind="paint", paint=c + "_hot"), "f": dict(mat="fish_d", kind="fin"),
               "g": dict(mat=c + "_dim", kind="fin")}
        profile.grow(p, FISH_ROWS, leg, zc=3.5, depth=2.2, depth_fn=lambda x, y: 0.55 + 0.45 * min(1, max(0, (x - 3) / 7)))
        segs = m.split(p, 0, [5, 10], names=["head", "mid", "tail"], reverse=True)
        m.clip("swim", "плывёт", 8, 10)
        swim(segs, "swim", [0.08, 0.22, 0.42], k=1.1, rz=0.35, bob=0.35, glow=1)
        out.append(m)
    return out


@asset
def lantern_fish():
    m = Model("lantern_fish", "Рыба-фонарь", "creature",
              "Глубоководная рыба с рядами огоньков-фотофоров: свет бежит от головы к хвосту.", iso_dirs=8, tags=["анимация"])
    R = [
        "....................",
        "..........ff........",
        "gg......bbbbbbbb....",
        ".gg...bbbbbbbbbbbb..",
        "..gffbbbbbbbbbbbEEw.",
        ".gg..pbpbpbpbpbpbhbb",
        "gg....llllllllllll..",
        "........ff....ff....",
        "....................",
    ]
    leg = {"b": dict(mat="fish"), "l": dict(mat="belly"), "f": dict(mat="fish_d", kind="fin"), "g": dict(mat="amber_dim", kind="fin"),
           "p": dict(mat="fish", kind="paint", paint="amber_hot"), "h": dict(mat="fish", kind="paint", paint="teal_hot"),
           "E": dict(mat="fish", kind="paint", paint="pupil"), "w": dict(mat="fish", kind="paint", paint="teal")}
    p = m.part("body", (20, 9, 7))
    profile.grow(p, R, leg, zc=3.5, depth=2.0, depth_fn=lambda x, y: 0.5 + 0.5 * min(1, max(0, (x - 3) / 8)))
    segs = m.split(p, 0, [5, 10, 15], names=["head", "neck", "mid", "tail"], reverse=True)
    m.clip("swim", "плывёт, огни бегут", 8, 10)
    swim(segs, "swim", [0.06, 0.14, 0.26, 0.44], k=1.0, rz=0.3, bob=0.3, glow=2)
    return m


def angler_sprite():
    W, H = 34, 24
    body = ell(W, H, 14.5, 10.5, 11.5, 8.6) | ell(W, H, 22, 9.5, 8.5, 6.2)
    tail = poly(W, H, [(0, 15), (6, 11.5), (6, 8.5), (0, 4), (2, 9.5)])
    upper = poly(W, H, [(18.5, 9.2), (31.5, 12.6), (33.5, 11.0), (33.5, 9.6)])
    mouth = poly(W, H, [(18.5, 8.6), (33.6, 10.9), (33.6, 5.0), (21, 5.6)])
    jaw = poly(W, H, [(19, 7.0), (33.8, 6.0), (33.8, 2.2), (27, 1.5), (20, 3.5)])
    teeth_up = np.zeros((H, W), bool)
    teeth_dn = np.zeros((H, W), bool)
    for x in range(22, 34, 2):
        yu = int(round(9.2 + (x - 18.5) * (12.6 - 9.2) / 13.0 - 0.6))
        teeth_up[H - 1 - min(H - 1, max(0, yu - 1)), x] = True
        yd = int(round(5.8 + (x - 19) * (6.0 - 7.0) / 15.0 + 0.4))
        teeth_dn[H - 1 - min(H - 1, max(0, yd + 1)), x] = True
    eye = ell(W, H, 24.5, 14.5, 1.3, 1.3)
    pupil = ell(W, H, 24.8, 14.6, 0.6, 0.6)
    dorsal = line(W, H, [(9, 18), (7, 21), (12, 19), (11, 22), (15, 19.5)], 1)
    pect = poly(W, H, [(11, 9), (15, 9.5), (14, 5.5), (10.5, 6)])
    lay = [("b", body), ("f", tail), ("f", dorsal & ~body), ("m", mouth & body | mouth), ("J", jaw), ("t", teeth_up & (mouth | body)),
           ("T", teeth_dn & (mouth | jaw)), ("p", pect & body), ("E", eye & body), ("e", pupil & body)]
    return rows(W, H, lay), (W, H)


@asset
def angler():
    m = Model("angler", "Удильщик с лампочкой", "creature",
              "Хищник глубины: на удилище — старая лампа накаливания, нить светится, приманка качается.",
              iso_dirs=8, tags=["враг", "анимация"])
    rws, (W, H) = angler_sprite()
    D = 13
    p = m.part("body", (W, H, D))
    leg = {"b": dict(mat="angler"), "f": dict(mat="angler_d", kind="fin", thick=2), "m": dict(mat="blood", kind="flat", thick=7, tone=0),
           "J": dict(mat="angler"), "t": dict(mat="teeth", kind="flat", thick=7), "T": dict(mat="teeth", kind="flat", thick=7),
           "p": dict(mat="angler", kind="paint", paint="angler_d"), "E": dict(mat="angler", kind="paint", paint="amber_hot"),
           "e": dict(mat="angler", kind="paint", paint="pupil")}
    profile.grow(p, rws, leg, zc=D / 2, depth=5.6, depth_fn=lambda x, y: 0.55 + 0.45 * min(1, max(0, (x - 4) / 9)))
    skin = p.m == p.m[16, 12, int(D / 2)]
    speckle(p, skin, 4, 2, seed=7, p=0.08)
    body, tailp = m.split(p, 0, [7], names=["body", "tail"], reverse=True)
    bo = body.origin                                    # the body grid starts at x = 7 of the sprite
    # the lower jaw is its own part, hinged at the back of the mouth
    jw = W - 19
    jaw = m.part("jaw", (jw, 9, D), origin=(19 - bo[0], 0, 0), pivot=(1.5, 6.5, D / 2), parent=body)
    g = body.g
    jsel = (g[0] + bo[0] >= 19) & (g[1] < 7.2) & (body.m > 0)
    x0 = int(19 - bo[0])
    jaw.m[:] = np.where(jsel[x0:x0 + jw, 0:9, :], body.m[x0:x0 + jw, 0:9, :], 0)
    jaw.t[:] = body.t[x0:x0 + jw, 0:9, :]
    body.carve(jsel)
    # the lure: a stalk of three joints from the forehead, an Edison bulb hanging from its tip
    s1 = m.part("rod1", (8, 8, 3), origin=(18 - bo[0], 17, D / 2 - 1.5), pivot=(1.5, 0.5, 1.5), parent=body)
    s1.fill(s1.capsule((1.5, 0.5, 1.5), (5.5, 6.5, 1.5), 0.6), "angler_d")
    s2 = m.part("rod2", (9, 6, 3), origin=(4.5, 6, 0), pivot=(0.5, 1.0, 1.5), parent=s1)
    s2.fill(s2.capsule((0.5, 1.0, 1.5), (7.5, 2.5, 1.5), 0.55), "angler_d")
    s3 = m.part("rod3", (5, 7, 3), origin=(7.0, 0.5, 0), pivot=(0.5, 5.5, 1.5), parent=s2)
    s3.fill(s3.capsule((0.5, 5.5, 1.5), (2.5, 1.5, 1.5), 0.5), "angler_d")
    bulb = m.part("bulb", (7, 9, 7), origin=(-1.0, -7.0, -2.0), pivot=(3.5, 8.0, 3.5), parent=s3)
    glass = bulb.ellipsoid((3.5, 3.6, 3.5), (2.9, 3.4, 2.9))
    bulb.fill(glass, "amber_dim")
    bulb.tone(glass & bulb.where(lambda X, Y, Z: (X < 3.2) & (Y > 4.2)), 4)
    bulb.fill(bulb.box((2.5, 6.0, 2.5), (4.5, 8.5, 4.5)), "brass")
    bulb.fill(bulb.box((2.6, 7.0, 2.6), (4.4, 7.6, 4.4)), "iron")
    fil = bulb.where(lambda X, Y, Z: (np.abs(Z - 3.5) < 0.6) & (((np.abs(X - 2.5) < 0.6) | (np.abs(X - 4.5) < 0.6)) & (Y > 2.5) & (Y < 5.6)
                                                                  | (np.abs(Y - 3.0) < 0.6) & (X > 2.0) & (X < 5.0)))
    bulb.fill(fil, "filament")
    shell_ = glass & ~bulb.ellipsoid((3.5, 3.6, 3.5), (1.9, 2.4, 1.9))
    bulb.paint(fil.any(axis=2, keepdims=True) & shell_ & bulb.where(lambda X, Y, Z: np.ones_like(X, bool)), "filament")
    tail = [body, tailp]
    m.clip("idle", "подкрадывается", 8, 8)
    m.clip("bite", "кусает", 6, 12)
    tail[1].anim["idle"] = lambda ph: {"r": (0, wave(ph, 0, 0.28), 0)}
    tail[0].anim["idle"] = lambda ph: {"t": (0, 0.6 * math.sin(TAU * ph), 0), "r": (0, 0, 0.03 * math.sin(TAU * ph))}
    jaw.anim["idle"] = lambda ph: {"r": (0, 0, -0.05 - 0.05 * math.sin(TAU * ph))}
    s1.anim["idle"] = lambda ph: {"r": (0, 0, wave(ph, 0.0, 0.10))}
    s2.anim["idle"] = lambda ph: {"r": (0, wave(ph, 0.4, 0.15), wave(ph, 0.7, 0.16))}
    s3.anim["idle"] = lambda ph: {"r": (0, 0, wave(ph, 1.3, 0.22))}
    bulb.anim["idle"] = lambda ph: {"r": (wave(ph, 1.6, 0.25), 0, wave(ph, 2.0, 0.3)), "glow": round(1.2 * math.sin(TAU * ph * 2))}
    # bite: open wide, lunge, snap shut — fast in, slow out
    def jaw_bite(ph):
        o = math.sin(math.pi * min(1, ph / 0.55)) if ph < 0.55 else 0.0
        return {"r": (0, 0, -0.1 - 0.6 * o)}
    jaw.anim["bite"] = jaw_bite
    tail[0].anim["bite"] = lambda ph: {"t": (3.5 * math.sin(math.pi * ph), 0, 0), "r": (0, 0, 0.08 * math.sin(math.pi * ph))}
    tail[1].anim["bite"] = lambda ph: {"r": (0, wave(ph, 0, 0.45, 2), 0)}
    for s, k in ((s1, 0.0), (s2, 0.5), (s3, 1.0)):
        s.anim["bite"] = (lambda k: lambda ph: {"r": (0, 0, -0.25 * math.sin(math.pi * ph) * (1 + k))})(k)
    bulb.anim["bite"] = lambda ph: {"r": (0, 0, 0.5 * math.sin(math.pi * ph)), "glow": 1 if ph < 0.5 else 0}
    return m


@asset
def eel():
    m = Model("eel", "Электрический угорь", "creature",
              "Длинное тело волной, по бокам — светящиеся разряды, которые бегут вдоль спины.", iso_dirs=8, tags=["враг", "анимация"])
    L, Hh, D = 44, 7, 6
    p = m.part("body", (L, Hh, D))
    X, Y, Z = p.g
    r = np.clip(2.6 - np.abs(X - 30) * 0.035, 0.9, 2.6) * np.where(X < 8, (X + 2) / 10, 1)
    r = np.where(X > 38, r * np.clip((44 - X) / 6, 0.45, 1), r)
    body = (Y - 3.5) ** 2 / 1.0 + (Z - 3) ** 2 / 0.8 <= r * r
    p.fill(body, "eel")
    p.paint(body & (Y < 2.8), "belly", 1)
    fin = (np.abs(Z - 3) < 0.6) & (Y < 1.2) & (X > 3) & (X < 36)
    p.fill(fin, "eel")
    p.tone(fin, 2)
    spots = body & ((X.astype(int) % 5) == 0) & (np.abs(Y - 4.2) < 0.7) & ((Z < 1.6) | (Z > 4.4)) & (X > 6) & (X < 38)
    p.paint(spots, "azure_hot")
    stripe = body & (np.abs(Y - 4.9) < 0.5) & ((Z < 2) | (Z > 4)) & (X > 8) & (X < 37) & ((X.astype(int) % 5) == 2)
    p.paint(stripe, "azure")
    p.paint(body & (np.abs(X - 40.5) < 0.6) & (np.abs(Y - 4.3) < 0.6) & ((Z < 2.0) | (Z > 4.0)), "teal_hot")
    p.paint(body & (X > 42.5) & (np.abs(Y - 3.0) < 0.6), "angler_d")
    cuts = list(range(6, 40, 5))
    segs = m.split(p, 0, cuts, names=[f"s{i}" for i in range(len(cuts) + 1)], reverse=True)
    m.clip("swim", "плывёт волной", 8, 10)
    n = len(segs)
    swim(segs, "swim", [0.05 + 0.25 * i / (n - 1) for i in range(n)], k=0.75, rz=0.25, bob=0.4, glow=2)
    return m
