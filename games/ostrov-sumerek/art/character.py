"""
Parametric 16×24 characters (side view facing right) — the hero's build, re-colourable and
re-shapeable. A sheet is 6 frames: walk ×4 (contact, pass, contact, pass), idle, jump.

    from art.character import Spec, sheet
    keeper = Spec(colors=dict(tunic=[...], scarf=[...]), head=[...7 rows...], extras=[...])
    @hero("keeper")
    def _(): return sheet(keeper)

Letters in the part tables map to colour slots:
  H h j  hair (dark → light)      S s k  skin        e  eye
  R r q  scarf                    T t u  tunic       B  belt   y buckle
  P p    trousers (far / near)    D d c  boots
Extra letters (hoods, hats, lanterns …) are added through Spec.extra_colors.
"""
from dataclasses import dataclass, field

import numpy as np

from art.pixel import N, K, H, W, S, Y, OUTLINE, hx, auto_outline

CW, CH = 16, 24

HEAD = [  # rows 4..10
    ".....hhjjjh.....",
    "....hhhhjjjh....",
    "...HHhhhhhhhh...",
    "...HHHhhhhhks...",
    "....HHSsssess...",
    "....HSssssesss..",
    ".....HSsssss....",
]
SCARF = [  # rows 11..12
    ".....Rrrrrq.....",
    "....RRrrrrR.....",
]
TORSO = [  # rows 13..16
    "......utttT.....",
    "......utttT.....",
    "......uttTT.....",
    "......BBByB.....",
]
TAILS = [  # scarf tail: 4 flutter poses, phase-shifted against the legs
    ["...r", ".rr.", "R..."],
    ["....", "..rr", "Rr.."],
    ["...r", "..r.", ".R.."],
    ["..qr", "Rr..", "...."],
]
NEAR_ARM = {  # (row, rows, col)
    "back": (13, ["..ut", ".ut.", "ss.."], 4),
    "side": (13, ["u", "u", "s"], 8),
    "fwd": (13, ["ut..", ".ut.", "..ss"], 8),
    "up": (13, ["..ss", ".ut.", "ut.."], 8),
}
FAR_ARM = {
    "fwd": (14, ["T", "S"], 11),
    "back": (14, [".T", "S."], 4),
    "up": (12, ["S", "T"], 6),
}
LEGS = {  # bottom-aligned to row 22 (row 23 = sole outline)
    "contactA": [
        "......PPpp......",
        "......PPpp......",
        ".....PP..pp.....",
        ".....DD..dd.....",
        "....DDD..ddc....",
        "....DDDD.dddc...",
    ],
    "passA": [
        "......Ppp.......",
        "......Ppp.......",
        "......Ppp.......",
        ".....PPpp.......",
        "....DD.dd.......",
        "....D..dd.......",
        ".......dddc.....",
    ],
    "contactB": [
        "......ppPP......",
        "......ppPP......",
        ".....pp..PP.....",
        ".....dd..DD.....",
        "....ddc..DDD....",
        "....dddc.DDDD...",
    ],
    "passB": [
        "......pPP.......",
        "......pPP.......",
        "......pPP.......",
        ".....ppPP.......",
        "....dd.DD.......",
        "....d..DD.......",
        ".......DDDD.....",
    ],
    "stand": [
        "......PPpp......",
        "......PPpp......",
        "......PPpp......",
        "......PPpp......",
        "......DDdd......",
        ".....DDDdddc....",
    ],
    "jump": [
        "......PPpp......",
        "......PPpppp....",
        ".....PP...pp....",
        ".....PP...dd....",
        "....DDD...ddc...",
        "................",
        "................",
    ],
}
FRAMES = [  # walk ×4, idle, jump — the order the engine expects
    dict(legs="contactA", near="back", far="fwd", bob=0, tail=0),
    dict(legs="passA", near="side", far=None, bob=-1, tail=1),
    dict(legs="contactB", near="fwd", far="back", bob=0, tail=2),
    dict(legs="passB", near="side", far=None, bob=-1, tail=3),
    dict(legs="stand", near="side", far=None, bob=0, tail=1),
    dict(legs="jump", near="up", far="back", bob=-1, tail=3),
]

DEFAULT_COLORS = {
    "hair": [N[2], N[3], N[4]],
    "skin": [K[1], K[2], K[3]],
    "eye": OUTLINE,
    "scarf": [H[1], H[2], H[3]],
    "tunic": [W[1], W[2], W[3]],
    "belt": N[1], "buckle": Y[4],
    "pants": [S[2], S[3]],
    "boots": [N[2], N[3], N[4]],
}


@dataclass
class Spec:
    colors: dict = field(default_factory=dict)        # overrides of DEFAULT_COLORS slots
    head: list = None                                 # 7 rows replacing HEAD
    scarf: list = None                                # 2 rows replacing SCARF
    torso: list = None                                # 4 rows replacing TORSO
    tails: list = "default"                           # 4 poses, None = no tail
    legs: dict = None                                 # per-pose overrides of LEGS
    extras: list = field(default_factory=list)        # [(row, col, rows) | callable(frame_index, frame) -> list]
    behind: list = field(default_factory=list)        # same, painted before the body (capes, back items)
    extra_colors: dict = field(default_factory=dict)  # letter -> hex for extra parts
    poses: dict = None                                # {frame index: {"near": "fwd", ...}} per-frame pose overrides


def _paint(grid, row0, col0, rows):
    for dy, r in enumerate(rows):
        for dx, ch in enumerate(r):
            y, x = row0 + dy, col0 + dx
            if ch != "." and 0 <= y < CH and 0 <= x < CW:
                grid[y][x] = ch


def _cmap(spec):
    c = dict(DEFAULT_COLORS)
    c.update(spec.colors or {})
    m = {
        "H": c["hair"][0], "h": c["hair"][1], "j": c["hair"][2],
        "S": c["skin"][0], "s": c["skin"][1], "k": c["skin"][2], "e": c["eye"],
        "R": c["scarf"][0], "r": c["scarf"][1], "q": c["scarf"][2],
        "T": c["tunic"][0], "t": c["tunic"][1], "u": c["tunic"][2],
        "B": c["belt"], "y": c["buckle"],
        "P": c["pants"][0], "p": c["pants"][1],
        "D": c["boots"][0], "d": c["boots"][1], "c": c["boots"][2],
    }
    m.update(spec.extra_colors or {})
    return m


def _extras(items, i, fr):
    out = []
    for it in items:
        out.extend(it(i, fr) if callable(it) else [it])
    return out


def frame(spec, i, fr):
    fr = dict(fr, **((spec.poses or {}).get(i, {})))
    g = [["."] * CW for _ in range(CH)]
    b = fr["bob"]
    for row, col, rows in _extras(spec.behind, i, fr):
        _paint(g, row + b, col, rows)
    if fr["far"]:
        row, rows, col = FAR_ARM[fr["far"]]
        _paint(g, row + b, col, rows)
    legs = (spec.legs or {}).get(fr["legs"], LEGS[fr["legs"]])
    _paint(g, 23 - len(legs), 0, legs)
    _paint(g, 4 + b, 0, spec.head or HEAD)
    _paint(g, 11 + b, 0, spec.scarf or SCARF)
    _paint(g, 13 + b, 0, spec.torso or TORSO)
    tails = TAILS if spec.tails == "default" else spec.tails
    if tails:
        _paint(g, 11 + b, 1, tails[fr["tail"]])
    row, rows, col = NEAR_ARM[fr["near"]]
    _paint(g, row + b, col, rows)
    for row, col, rows in _extras(spec.extras, i, fr):
        _paint(g, row + b, col, rows)
    cm = _cmap(spec)
    a = np.zeros((CH, CW, 4), np.uint8)
    for y in range(CH):
        for x in range(CW):
            ch = g[y][x]
            if ch != ".":
                a[y, x] = hx(cm[ch])
    return auto_outline(a)


def sheet(spec):
    return np.concatenate([frame(spec, i, fr) for i, fr in enumerate(FRAMES)], 1)
