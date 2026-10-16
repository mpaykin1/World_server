"""More life of the deep: jellyfish, manta, seahorse, nautilus, a hermit crab living in a diving helmet,
a kraken tentacle and a siphonophore garland."""
import math

import numpy as np

import profile
from vox import Model, wave, TAU
from assets import asset
from assets.kit import swim, sway, speckle


@asset
def jellyfish():
    out = []
    for c, ru, bell, core in (("violet", "лиловая", "jelly_v", "violet"), ("teal", "бирюзовая", "jelly_t", "teal")):
        m = Model(f"jellyfish_{c}", f"Медуза-колокол, {ru}", "creature",
                  "Колокол сжимается и раскрывается, щупальца отстают волной.", iso_dirs=4, tags=["анимация"])
        b = m.part("bell", (15, 9, 15), pivot=(7.5, 3, 7.5))
        dome = b.ellipsoid((7.5, 2.0, 7.5), (6.6, 6.4, 6.6)) & b.where(lambda X, Y, Z: Y >= 2)
        inner = b.ellipsoid((7.5, 2.0, 7.5), (5.2, 5.0, 5.2))
        b.fill(dome & ~inner, c + "_dim")
        b.tone(dome & b.where(lambda X, Y, Z: (Y > 6.4) | ((X < 5.5) & (Y > 4.5))), 3)
        b.fill(b.ellipsoid((7.5, 4.0, 7.5), (2.6, 2.2, 2.6)), core)              # the glowing heart
        b.fill(b.ellipsoid((7.0, 4.6, 7.5), (1.2, 1.0, 1.2)), core + "_hot")
        rim = dome & b.where(lambda X, Y, Z: Y < 3)
        b.paint(rim, c, 4)
        frill = b.torus((7.5, 2.0, 7.5), 6.2, 0.75) & b.where(lambda X, Y, Z: (np.sin(np.arctan2(Z - 7.5, X - 7.5) * 8) > 0))
        b.fill(frill, c)
        m.clip("pulse", "пульсирует", 8, 8)
        b.anim["pulse"] = lambda ph: {"s": (1 + 0.10 * math.sin(TAU * ph), 1 - 0.13 * math.sin(TAU * ph), 1 + 0.10 * math.sin(TAU * ph)),
                                      "t": (0, 0.8 * math.sin(TAU * ph - 0.6), 0), "glow": round(math.sin(TAU * ph))}
        # tentacles: six thin strands around the rim, each a chain of four links lagging the bell
        for k in range(4):
            a = k / 4 * TAU + 0.6
            x0, z0 = 7.5 + math.cos(a) * 4.6, 7.5 + math.sin(a) * 4.6
            prev = b
            org = (x0 - 1.5, -3.0, z0 - 1.5)
            for j in range(4):
                L = 4 if j < 3 else 5
                t = m.part(f"t{k}_{j}", (3, L, 3), origin=org, pivot=(1.5, L - 0.5, 1.5), parent=prev)
                t.fill(t.box((1, 1 if j % 2 else 0, 1), (2, L, 2)), (c + "_dim") if j < 3 else c)
                ph0 = k * 0.7 + j * 0.9
                t.anim["pulse"] = (lambda ph0, j: lambda ph: {"r": (wave(ph, ph0, 0.18 + 0.06 * j), 0, wave(ph, ph0 + 1.3, 0.16 + 0.06 * j))})(ph0, j)
                prev, org = t, (0, -L + 0.5, 0)
        # oral arms: two frilly ribbons in the middle
        for k in range(2):
            o = m.part(f"arm{k}", (3, 10, 3), origin=(6 + k * 1.5 - 1.5, -9.0, 6), pivot=(1.5, 9.5, 1.5), parent=b)
            o.fill(o.box((1, 0, 1), (2, 10, 2)), core + "_dim")
            o.fill(o.where(lambda X, Y, Z: (np.abs(X - 1.5) < 1.6) & (np.abs(Z - 1.5) < 0.6) & ((Y.astype(int) % 3) == 0)), core + "_dim")
            o.anim["pulse"] = (lambda k: lambda ph: {"r": (wave(ph, k + 0.5, 0.12), 0, wave(ph, k, 0.2))})(k)
        out.append(m)
    return out


@asset
def manta():
    m = Model("manta", "Скат-манта", "creature", "Плывёт взмахами крыльев: волна идёт от тела к кончикам.", iso_dirs=8, tags=["анимация"])
    m.view2d = (-1.05, 0.0, 0.0)               # the 2D sprite looks at it from above, or it is a thin line
    D = 34
    body = m.part("body", (16, 5, 10), pivot=(8, 2.5, 5))
    body.fill(body.ellipsoid((8, 2.5, 5), (8, 1.9, 4.6)), "manta")
    body.paint(body.where(lambda X, Y, Z: Y < 2.0), "belly", 2)
    body.fill(body.box((13, 1, 3), (16, 3, 4)) | body.box((13, 1, 6), (16, 3, 7)), "manta")      # cephalic fins
    body.paint(body.where(lambda X, Y, Z: (X > 13.5) & (Y > 2.5) & (np.abs(Z - 5) < 2.2) & (np.abs(Z - 5) > 1.2)), "azure_hot")
    spots = body.where(lambda X, Y, Z: (Y > 3.5) & ((X.astype(int) + Z.astype(int) * 2) % 5 == 0))
    body.paint(spots, "azure")
    tail = m.part("tail", (14, 2, 2), origin=(-13, 1.5, 4), pivot=(13.5, 0.5, 1), parent=body)
    tail.fill(tail.box((0, 0, 0.5), (14, 1, 1.5)), "manta")
    tail.tone(tail.box((0, 0, 0), (5, 2, 2)), 1)
    wings = []
    for side, sg in (("l", 1), ("r", -1)):
        prev, org = body, (2, 1.5, 9.5 if sg > 0 else -2.5)
        for j, (L, w0, w1) in enumerate(((5, 11, 9), (5, 9, 6), (4, 6, 2))):
            p = m.part(f"wing_{side}{j}", (12, 2, L), origin=org, pivot=(6, 1, 0.5 if sg > 0 else L - 0.5), parent=prev)
            Zr = p.g[2] if sg > 0 else (L - p.g[2])
            w = w0 + (w1 - w0) * (Zr / L)
            shape = (np.abs(p.g[0] - 6 - (Zr * 0.5)) < w / 2) & (p.g[1] < 1.5)
            p.fill(shape, "manta")
            p.paint(shape & (np.abs(p.g[0] - 6 - Zr * 0.5) > w / 2 - 1.1), "azure_dim")
            ph0 = j * 0.9
            p.anim["glide"] = (lambda ph0, sg, j: lambda ph: {"r": (sg * wave(ph, ph0, 0.32 + 0.1 * j), 0, 0)})(ph0, sg, j)
            prev, org = p, (0.5 * L, 0, L - 0.5 if sg > 0 else -L + 0.5)
            wings.append(p)
    m.clip("glide", "машет крыльями", 8, 8)
    body.anim["glide"] = lambda ph: {"t": (0, 1.2 * math.sin(TAU * ph - 1.0), 0), "r": (0, 0, 0.05 * math.sin(TAU * ph))}
    tail.anim["glide"] = lambda ph: {"r": (0, wave(ph, 1.5, 0.15), wave(ph, 2.2, 0.1))}
    return m


@asset
def seahorse():
    m = Model("seahorse", "Морской конёк", "creature", "Покачивается, хвост закручивается, спинной плавник трепещет.", iso_dirs=8, tags=["анимация"])
    R = [
        "....cc......",
        "...cbbc.....",
        "...bbbbbsss.",
        "...bEbbbbss.",
        "..ffbbbbb...",
        ".fffbbbb....",
        "..ffbbbl....",
        "...fbbbl....",
        "....bbbl....",
        "....bbbl....",
        "....bbb.....",
        "....bbl.....",
        "....bbl.....",
        ".....bb.....",
        ".....bb.....",
        "......bb....",
        "......bbb...",
        "....bb.bb...",
        "....bbbb....",
        "............",
    ]
    leg = {"b": dict(mat="coral_o"), "l": dict(mat="coral_o", tone=5), "c": dict(mat="amber_hot", kind="fin"),
           "s": dict(mat="coral_o", tone=2), "E": dict(mat="coral_o", kind="paint", paint="pupil"), "f": dict(mat="amber_dim", kind="fin")}
    p = m.part("body", (12, 20, 7))
    profile.grow(p, R, leg, zc=3.5, depth=1.9)
    speckle(p, p.m == p.m[5, 14, 3], 5, 2, seed=3, p=0.1)
    segs = m.split(p, 1, [5, 9, 13], names=["head", "chest", "belly", "tail"], reverse=True)
    m.clip("idle", "покачивается", 8, 8)
    for i, s in enumerate(segs):
        s.anim["idle"] = (lambda i: lambda ph: {"r": (0, 0, wave(ph, i * 0.9, 0.04 + 0.07 * i)),
                                                "t": (0, 0.7 * math.sin(TAU * ph) if i == 0 else 0, 0),
                                                "glow": round(math.sin(TAU * ph * 2)) if i == 0 else 0})(i)
    return m


@asset
def nautilus():
    m = Model("nautilus", "Наутилус", "creature", "Спиральная раковина с огнями в камерах, щупальца шевелятся.", iso_dirs=8, tags=["анимация"])
    sh = m.part("shell", (16, 16, 9))
    X, Y, Z = sh.g
    dx, dy = X - 7.5, Y - 8.0
    r = np.sqrt(dx * dx + dy * dy)
    a = np.arctan2(dy, dx)
    spiral = np.exp(0.18 * ((a + TAU) % TAU))           # log spiral: growth per turn
    k = np.log(np.maximum(r, 0.3) / 1.0) / 0.18
    band = (k - ((a + TAU) % TAU)) / TAU
    solid = (r < 7.6) & (np.abs(Z - 4.5) < 4.0 * np.sqrt(np.clip(1 - (r / 8.2) ** 2, 0, 1)) + 0.6)
    sh.fill(solid, "shell")
    stripes = solid & (np.sin(a * 6 + r * 0.4) > 0.55) & (r > 3)
    sh.paint(stripes, "crab", 2)
    sh.paint(solid & (np.abs(band - np.round(band)) < 0.08) & ((Z < 1.6) | (Z > 7.4)), "teal")
    sh.paint(solid & (r < 1.6), "teal_hot")
    sh.carve(sh.box((11, 0, 0), (16, 8, 9)) & (r > 4))
    head = m.part("head", (6, 7, 7), origin=(11, 1, 1), pivot=(1, 3.5, 3.5), parent=sh)
    head.fill(head.ellipsoid((2, 3.5, 3.5), (2.2, 3.0, 2.6)), "crab")
    head.paint(head.where(lambda X, Y, Z: (np.abs(X - 2.5) < 0.6) & (np.abs(Y - 4.5) < 0.6)), "amber_hot")
    tents = []
    for j in range(4):
        t = m.part(f"tent{j}", (7, 2, 2), origin=(3.5, 1 + j * 1.4, 1 + (j % 2) * 3), pivot=(0.5, 1, 1), parent=head)
        t.fill(t.box((0, 0.5, 0.5), (7 - (j % 2), 1.5, 1.5)), "crab")
        t.tone(t.box((4, 0, 0), (7, 2, 2)), 4)
        tents.append(t)
    m.clip("idle", "дрейфует", 8, 8)
    sh.anim["idle"] = lambda ph: {"t": (0, 0.8 * math.sin(TAU * ph), 0), "r": (0, 0, 0.06 * math.sin(TAU * ph - 0.5)), "glow": round(math.sin(TAU * ph))}
    for j, t in enumerate(tents):
        t.anim["idle"] = (lambda j: lambda ph: {"r": (0, wave(ph, j * 0.8, 0.25), wave(ph, j * 0.8 + 1.0, 0.3))})(j)
    return m


@asset
def hermit_crab():
    m = Model("hermit_crab", "Рак-отшельник в водолазном шлеме", "creature",
              "Живёт в старом медном шлеме: в иллюминаторе горит свет, ножки семенят.", iso_dirs=8, tags=["анимация"])
    h = m.part("helmet", (14, 14, 14), origin=(0, 4, 0))
    sph = h.sphere((7, 7, 7), 6.4)
    h.fill(sph, "brass")
    h.paint(sph & h.where(lambda X, Y, Z: Y > 10), "copper", 4)
    port = h.where(lambda X, Y, Z: ((X - 7.5) ** 2 + (Y - 7.5) ** 2 < 10.5) & (Z > 10.5))
    bez = h.where(lambda X, Y, Z: (((X - 7.5) ** 2 + (Y - 7.5) ** 2 >= 10.5) & ((X - 7.5) ** 2 + (Y - 7.5) ** 2 < 17.5)) & (Z > 10.0))
    h.fill(bez & sph, "iron", 2)
    h.fill(port & sph, "amber")
    h.paint(port & h.where(lambda X, Y, Z: (X < 7.2) & (Y > 7.8)), "amber_hot")
    for (sx, sy) in ((1.0, 7.5), (13.0, 7.5)):
        h.fill(h.where(lambda X, Y, Z, sx=sx, sy=sy: ((Z - 7) ** 2 + (Y - sy) ** 2 < 5) & (np.abs(X - sx) < 1.1)), "amber_dim")
    h.fill(h.box((3, 0, 3), (11, 2, 11)), "brass", 2)
    speckle(h, h.m == h.m[7, 13, 7], 5, 2, seed=11, p=0.06)
    for bx, by in ((3, 3), (12, 3), (3, 12), (12, 12)):
        h.paint(h.sphere((bx, by, 12.5), 1.1), "brass", 6)
    body = m.part("body", (10, 5, 8), origin=(9, 0, 3), pivot=(2, 2.5, 4), parent=h)
    body.fill(body.ellipsoid((3, 2.5, 4), (3, 2.0, 3.2)), "crab")
    claws = []
    for k, z in enumerate((0.5, 5.0)):
        c = m.part(f"claw{k}", (6, 4, 3), origin=(4, 0.5, z), pivot=(0.5, 2, 1.5), parent=body)
        c.fill(c.ellipsoid((3.5, 2, 1.5), (2.6, 1.8, 1.2)), "crab")
        c.carve(c.box((4.5, 1.6, 0), (6, 2.4, 3)))
        c.tone(c.box((3, 2.5, 0), (6, 4, 3)), 5)
        claws.append(c)
    for k, z in enumerate((2.5, 5.5)):
        e = m.part(f"eye{k}", (2, 5, 2), origin=(4, 3, z - 1), pivot=(1, 0.5, 1), parent=body)
        e.fill(e.box((0.5, 0, 0.5), (1.5, 4, 1.5)), "crab")
        e.fill(e.box((0, 4, 0), (2, 5, 2)), "pupil")
        e.anim["walk"] = (lambda k: lambda ph: {"r": (0, 0, wave(ph, k * 1.5, 0.2))})(k)
    legs = []
    for k in range(3):
        for side, z in ((0, -1), (1, 8)):
            lg = m.part(f"leg{k}{side}", (2, 5, 2), origin=(1 + k * 2.4, -4.0, z), pivot=(1, 4.5, 1), parent=body)
            lg.fill(lg.box((0.5, 0, 0.5), (1.5, 5, 1.5)), "crab")
            lg.tone(lg.box((0, 0, 0), (2, 2, 2)), 2)
            ph0 = (k + side) % 2 * math.pi
            lg.anim["walk"] = (lambda ph0, side: lambda ph: {"r": ((1 if side else -1) * 0.1 * math.sin(TAU * ph + ph0), 0, 0.45 * math.sin(TAU * ph + ph0))})(ph0, side)
            legs.append(lg)
    m.clip("walk", "семенит", 8, 12)
    h.anim["walk"] = lambda ph: {"t": (0, 0.5 * abs(math.sin(TAU * ph)), 0), "r": (0, 0, 0.05 * math.sin(TAU * ph)), "glow": round(math.sin(TAU * ph))}
    for k, c in enumerate(claws):
        c.anim["walk"] = (lambda k: lambda ph: {"r": (0, 0, 0.25 * math.sin(TAU * ph + k * 1.7))})(k)
    return m


@asset
def kraken_tentacle():
    m = Model("kraken_tentacle", "Щупальце кракена", "creature", "Поднимается из бездны и медленно ищет добычу; присоски светятся.", iso_dirs=4, tags=["враг", "анимация"])
    H = 60
    p = m.part("tentacle", (14, H, 14))
    X, Y, Z = p.g
    r = 5.6 * (1 - Y / H) ** 0.8 + 0.7
    cx = 7 + 2.5 * np.sin(Y / 14)
    shape = (X - cx) ** 2 + (Z - 7) ** 2 <= r * r
    p.fill(shape, "angler")
    p.paint(shape & (X - cx > r * 0.4), "coral_p", 2)
    suck = shape & (X - cx > r * 0.55) & ((Y.astype(int) % 4) == 0) & (np.abs(Z - 7) < r * 0.6)
    p.paint(suck, "crimson")
    speckle(p, p.m == p.m[7, 2, 7], 4, 1, seed=5, p=0.07)
    segs = m.split(p, 1, list(range(8, H, 8)), names=[f"s{i}" for i in range(8)])
    m.clip("sway", "ищет добычу", 8, 6)
    sway(segs, "sway", 0.16, k=0.7, axis=2, extra=lambda ph, i: {"glow": round(math.sin(TAU * ph - i * 0.8))})
    return m


@asset
def siphonophore():
    m = Model("siphonophore", "Сифонофора-гирлянда", "creature", "Колония-гирлянда: бусины светятся по очереди, цепочка извивается.", iso_dirs=4, tags=["анимация"])
    cols = ["teal", "violet", "azure", "teal", "violet", "azure", "teal", "violet", "azure", "teal"]
    prev, org = None, (0, 0, 0)
    beads = []
    for j, c in enumerate(cols):
        r = 2.3 if j == 0 else 1.7 - j * 0.06
        b = m.part(f"b{j}", (6, 6, 6), origin=org, pivot=(3 if j == 0 else 0.5, 3, 3), parent=prev)
        b.fill(b.sphere((3, 3, 3), r), c + "_dim")
        b.fill(b.sphere((2.6, 3.4, 3.0), r * 0.5), c)
        b.fill(b.box((3, 1.5, 3), (6, 2.0, 3.6)), c + "_dim")
        b.anim["drift"] = (lambda j: lambda ph: {"r": (0, wave(ph, j * 0.7, 0.16), wave(ph, j * 0.7 + 1.4, 0.12)),
                                                 "glow": 1 if (int(ph * 10) - j) % 10 in (0, 1) else -1})(j)
        beads.append(b)
        prev, org = b, (5.6 if j == 0 else 4.4, 0, 0)
    m.clip("drift", "переливается", 10, 10)
    return m
