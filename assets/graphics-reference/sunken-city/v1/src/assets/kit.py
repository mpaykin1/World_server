"""Small helpers shared by the asset files: masks → ASCII rows for profile.grow, wave chains, pulses."""
import math

import numpy as np
from PIL import Image, ImageDraw

from vox import wave, TAU


def canvas_masks(w, h):
    return np.zeros((h, w), bool)


def ell(w, h, cx, cy, rx, ry):
    """Ellipse mask in sprite coords (x right, y UP from the bottom row)."""
    ys, xs = np.mgrid[0:h, 0:w]
    Y = (h - 1 - ys) + 0.5
    X = xs + 0.5
    return ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1.0


def poly(w, h, pts):
    """Polygon mask; pts in sprite coords with y up."""
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).polygon([(x, h - y) for x, y in pts], fill=1)
    return np.array(im).astype(bool)


def line(w, h, pts, width=1):
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).line([(x, h - 1 - y) for x, y in pts], fill=1, width=width)
    return np.array(im).astype(bool)


def rows(w, h, layers):
    """layers: [(char, mask)] in paint order → list of strings (top row first) for profile.grow."""
    g = np.full((h, w), ".", dtype="<U1")
    for ch, m in layers:
        g[m] = ch
    return ["".join(r) for r in g]


def swim(segs, clip, amps, k=1.0, rz=0.0, bob=0.0, glow=None, cycles=1):
    """Lateral (yaw) wave travelling down a chain of segments + an optional vertical flex (reads in 2D)."""
    for i, s in enumerate(segs):
        a = amps[i] if i < len(amps) else amps[-1]

        def f(ph, i=i, a=a):
            st = {"r": (0, wave(ph, i * k, a, cycles), wave(ph, i * k + 0.6, rz * a, cycles)),
                  "t": (0, bob * math.sin(TAU * ph * cycles) if i == 0 else 0, 0)}
            if glow is not None:
                st["glow"] = round(glow * math.sin(TAU * ph * cycles - i * 0.9))
            return st
        s.anim[clip] = f


def sway(segs, clip, amp, k=0.8, axis=2, cycles=1, extra=None):
    """A stalk bending in the current: each joint adds a little, the wave travels up the chain."""
    for i, s in enumerate(segs):
        def f(ph, i=i):
            r = [0.0, 0.0, 0.0]
            r[axis] = wave(ph, i * k, amp * (0.5 + 0.5 * i / max(1, len(segs) - 1)), cycles)
            r[0] += wave(ph, i * k + 1.7, amp * 0.45, cycles)
            st = {"r": tuple(r)}
            if extra:
                st.update(extra(ph, i))
            return st
        s.anim[clip] = f


def pulse(part, clip, amp=0.06, glow=1, cycles=1, phase=0.0):
    part.anim[clip] = lambda ph: {"s": 1 + amp * math.sin(TAU * (ph * cycles) - phase), "glow": round(glow * math.sin(TAU * ph * cycles - phase))}


def speckle(part, mat_mask, tone_hi, tone_lo, seed=0, p=0.12):
    """Scatter lighter / darker ramp steps over a material (skin, stone) — hand-painted texture in 3D."""
    rng = np.random.default_rng(seed)
    r = rng.random(part.shape)
    part.t[mat_mask & (r < p)] = tone_hi
    part.t[mat_mask & (r > 1 - p)] = tone_lo
