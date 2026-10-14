"""Coin spin (4 frames), heart states (full / half / empty), animated water (4 frames)."""
import numpy as np

from art.pixel import Y, H, S, OUTLINE, T, canvas, hx, mask_from, edge4, near8, strip
from art.registry import strip_art
from tiles import water_frame  # noqa: E402  (same pack)

COIN_MASKS = {
    12: ["......XXXX......", "....XXXXXXXX....", "...XXXXXXXXXX...", "...XXXXXXXXXX...",
         "..XXXXXXXXXXXX..", "..XXXXXXXXXXXX..", "..XXXXXXXXXXXX..", "..XXXXXXXXXXXX..",
         "...XXXXXXXXXX...", "...XXXXXXXXXX...", "....XXXXXXXX....", "......XXXX......"],
    8: ["......XXXX......", ".....XXXXXX.....", "....XXXXXXXX....", "....XXXXXXXX....",
        "....XXXXXXXX....", "....XXXXXXXX....", "....XXXXXXXX....", "....XXXXXXXX....",
        "....XXXXXXXX....", "....XXXXXXXX....", ".....XXXXXX.....", "......XXXX......"],
    4: [".......XX.......", "......XXXX......", "......XXXX......", "......XXXX......",
        "......XXXX......", "......XXXX......", "......XXXX......", "......XXXX......",
        "......XXXX......", "......XXXX......", "......XXXX......", ".......XX......."],
}


def coin_frame(kind):
    a = canvas(T, T)
    w = {"face": 12, "turnR": 8, "edge": 4, "turnL": 8}[kind]
    m = np.zeros((T, T), bool)
    m[2:14] = mask_from(COIN_MASKS[w])
    ol = edge4(m)
    inner = m & ~ol
    ys, xs = np.mgrid[0:T, 0:T]
    lit = (xs + ys) < 15
    a[m] = hx(Y[3])
    if kind == "edge":
        a[inner & (xs == 7)] = hx(Y[4])
        a[inner & (xs == 8)] = hx(Y[2])
        a[3, 7] = hx(Y[5]); a[4, 7] = hx(Y[5]); a[12, 8] = hx(Y[1])
    else:
        rim = inner & near8(ol)
        a[rim & lit] = hx(Y[4])
        a[rim & ~lit] = hx(Y[2])
        band = np.zeros_like(m)
        if kind != "face":
            right = kind == "turnR"
            band = inner & (xs == (10 if right else 5))
            a[band] = hx(Y[2] if right else Y[5])
            a[band & (ys >= 11)] = hx(Y[1] if right else Y[4])
        face = inner & ~rim & ~band
        wall = face & near8(rim)
        a[wall & lit] = hx(Y[2])
        a[wall & ~lit] = hx(Y[4])
        if kind == "face":
            for y in range(6, 10):
                a[y, 7] = hx(Y[5]); a[y, 8] = hx(Y[4]); a[y + 1, 9] = hx(Y[2])
            a[10, 7] = hx(Y[2]); a[10, 8] = hx(Y[2])
            a[4, 4] = hx(Y[6]); a[5, 3] = hx(Y[5]); a[3, 5] = hx(Y[5])
        else:
            bx = 7 if kind == "turnR" else 8
            for y in range(6, 10):
                a[y, bx] = hx(Y[5])
            a[10, bx] = hx(Y[2])
            a[4, 5 if kind == "turnR" else 6] = hx(Y[6])
    a[ol] = hx(Y[0])
    return a


HEART = [
    "................", "................", "................", "...XXXX..XXXX...",
    "..XXXXXXXXXXXX..", ".XXXXXXXXXXXXXX.", ".XXXXXXXXXXXXXX.", ".XXXXXXXXXXXXXX.",
    "..XXXXXXXXXXXX..", "...XXXXXXXXXX...", "....XXXXXXXX....", ".....XXXXXX.....",
    "......XXXX......", ".......XX.......", "................", "................",
]


def heart(state="full"):
    m = mask_from(HEART)
    ol = edge4(m)
    inner = m & ~ol
    ys, xs = np.mgrid[0:T, 0:T]
    rim = inner & near8(ol)
    a = canvas(T, T)
    a[inner] = hx(H[3])
    a[rim & ((xs + ys) >= 17)] = hx(H[2])
    a[inner & (ys >= 11)] = hx(H[2])
    a[inner & (ys >= 13)] = hx(H[1])
    a[rim & ((xs + ys) < 13)] = hx(H[4])
    for x, y, c in [(3, 6, H[5]), (4, 6, "#ffffff"), (3, 7, "#ffffff"), (4, 5, H[5]), (2, 7, H[4]), (5, 5, H[4])]:
        a[y, x] = hx(c)
    empty = np.zeros_like(m)
    if state == "half":
        empty = inner & (xs >= 8)
    elif state == "empty":
        empty = inner
    a[empty] = hx(S[1])
    a[empty & rim & ((xs + ys) < 16)] = hx(S[2])
    a[ol] = hx(H[0] if state != "empty" else OUTLINE)
    return a


@strip_art("coin")
def coin_strip():
    return strip([coin_frame(k) for k in ("face", "turnR", "edge", "turnL")])


@strip_art("hearts")
def hearts_strip():
    return strip([heart(s) for s in ("full", "half", "empty")])


@strip_art("water")
def water_strip():
    return strip([water_frame(f) for f in range(4)])
