"""
Pixel-art toolkit for «Остров сумерек».

Every sprite and tile in the game is drawn by code with these helpers, so new content
automatically shares the look:
  * hue-shifted ramps — shadows drift to blue/violet, lights to warm yellow;
  * light always comes from the TOP-LEFT (bevel: lit rim up/left, shade rim down/right);
  * a 1 px dark outline (#1a1326) around every free-standing sprite (tiles have none);
  * tiles are seamless 16×16 (wrap-around helpers), sprites are 16×16 / 16×24 / 32×32 cells;
  * no anti-aliasing, no gradients — only ramp steps and occasional ordered dithering.
"""
import colorsys
import math

import numpy as np
from PIL import Image, ImageDraw

T = 16      # tile size
CELL = 32   # weapon cell size

# ---------------------------------------------------------------------------
# Palette — hue-shifted ramps (dark → light). Index 0 is the deepest shadow.
# ---------------------------------------------------------------------------
OUTLINE = "#1a1326"
G = ["#0f2a2a", "#173f33", "#23603a", "#3a823d", "#5ea443", "#8fc64d", "#c3e26b"]  # grass / leaves
N = ["#221519", "#3a2125", "#58342d", "#7a4b35", "#9d6a40", "#c08e52", "#ddb46e"]  # dirt / wood / hair
S = ["#1e1e2c", "#2f3043", "#45485c", "#5f6476", "#7e8494", "#a3a9b4", "#c9ced3"]  # stone / steel / cloth
A = ["#9c7a4a", "#b9955c", "#d0ae6c", "#e2c584", "#eed9a2", "#f8eec8"]             # sand
W = ["#11203f", "#18366a", "#20558f", "#2a74b3", "#3f97d1", "#78c3e6", "#c6eff8"]  # water / tunic
R = ["#33131d", "#571f27", "#7c2f2d", "#a04336", "#c25e45", "#dc8461"]             # brick
M = ["#5f5558", "#8a7e7a", "#ada196", "#cfc4b5"]                                   # mortar
Y = ["#4b2612", "#8a4a16", "#c27618", "#e6a425", "#ffd246", "#fff09a", "#ffffff"]  # gold
H = ["#3a0c1e", "#74122d", "#b31f38", "#df3a40", "#ff6e5c", "#ffb3a0"]             # heart / scarf / blood
K = ["#6e3a30", "#b8654c", "#e59a74", "#f7c9a0"]                                   # skin
V = ["#1d0f2e", "#35184f", "#5a2a7e", "#8a44b0", "#b874dc", "#e6c2f7"]             # violet (shades, magic)
C = ["#0b2a33", "#12506a", "#1f80a0", "#38b6d0", "#7de3ee", "#d2fdff"]             # tesla cyan
I = ["#1a3352", "#2d5a8a", "#4f90c2", "#86c6e8", "#c6edfb", "#ffffff"]             # ice
F = ["#3a0c10", "#7a1a14", "#c2361a", "#ef6a22", "#ffae3c", "#ffe58a"]             # fire
WRAP = ["#6e6656", "#a89e86", "#d8d2c0"]                                           # cloth wrap
RAMPS = dict(G=G, N=N, S=S, A=A, W=W, R=R, M=M, Y=Y, H=H, K=K, V=V, C=C, I=I, F=F, WRAP=WRAP)


def hx(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def to_hex(rgb):
    return "#%02x%02x%02x" % tuple(int(max(0, min(255, round(v)))) for v in rgb[:3])


def lut(ramp):
    return np.array([hx(c) for c in ramp], np.uint8)


def make_ramp(base, n=6, spread=0.78, shift=0.07):
    """A new hue-shifted ramp around `base` in the house style: darker steps rotate toward
    blue-violet and lose saturation, lighter steps rotate toward warm yellow.
    Use it for new materials so they sit in the same light as everything else."""
    r, g, b = [v / 255 for v in hx(base)[:3]]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    out = []
    for i in range(n):
        t = i / (n - 1)                       # 0 = darkest
        L = max(0.05, min(0.95, l + (t - 0.5) * spread))
        cool, warm = 0.70, 0.14               # target hues (violet-blue, yellow)
        target = cool if t < 0.5 else warm
        k = abs(t - 0.5) * 2 * shift
        dh = ((target - h + 0.5) % 1.0) - 0.5
        hh = (h + dh * k) % 1.0
        ss = max(0, min(1, s * (0.75 + 0.5 * (1 - abs(t - 0.55) * 1.6))))
        out.append(to_hex([v * 255 for v in colorsys.hls_to_rgb(hh, L, ss)]))
    return out


# ---------------------------------------------------------------------------
# Canvases and plotting
# ---------------------------------------------------------------------------
def canvas(w, h, fill=None):
    a = np.zeros((h, w, 4), np.uint8)
    if fill:
        a[:] = hx(fill)
    return a


def new(size=CELL):
    return np.zeros((size, size, 4), np.uint8)


def blank(size=CELL):
    return np.zeros((size, size), bool)


def put(a, x, y, c):
    """Plot with clipping (sprites)."""
    if 0 <= y < a.shape[0] and 0 <= x < a.shape[1]:
        a[int(y), int(x)] = hx(c)


def wput(a, x, y, c):
    """Plot with wrap-around (seamless tiles)."""
    h, w = a.shape[:2]
    a[int(y) % h, int(x) % w] = hx(c)


def stamp(a, x0, y0, rows, cmap):
    """Draw a small ASCII sprite ('.' = skip) with clipping."""
    for dy, r in enumerate(rows):
        for dx, ch in enumerate(r):
            if ch != ".":
                put(a, x0 + dx, y0 + dy, cmap[ch])


def wstamp(a, x0, y0, rows, cmap):
    """ASCII sprite with wrap-around (tiles)."""
    for dy, r in enumerate(rows):
        for dx, ch in enumerate(r):
            if ch != ".":
                wput(a, x0 + dx, y0 + dy, cmap[ch])


def roll(m, dy, dx):
    return np.roll(np.roll(m, dy, 0), dx, 1)


def pnoise(n, seed, size=T):
    """Periodic (tileable) value noise, n×n lattice, smoothstep interpolation."""
    g = np.random.default_rng(seed).random((n, n))
    c = (np.arange(size) + 0.5) * n / size - 0.5
    i0 = np.floor(c).astype(int)
    f = c - i0
    f = f * f * (3 - 2 * f)
    a, b = i0 % n, (i0 + 1) % n
    gy = g[a] * (1 - f)[:, None] + g[b] * f[:, None]
    return gy[:, a] * (1 - f)[None, :] + gy[:, b] * f[None, :]


def jitter(rng, nx, ny, size=T, m=0.15):
    """Evenly spread random points on the torus (one per grid cell)."""
    cw, ch = size / nx, size / ny
    return [((i + rng.uniform(m, 1 - m)) * cw, (j + rng.uniform(m, 1 - m)) * ch)
            for j in range(ny) for i in range(nx)]


BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def dither(a, mask, color, level, ox=0, oy=0):
    """Ordered (Bayer 4×4) dither: paints `color` on `level` (0..1) of the masked pixels."""
    h, w = mask.shape
    ys, xs = np.mgrid[0:h, 0:w]
    sel = mask & (BAYER4[(ys + oy) % 4, (xs + ox) % 4] < level)
    a[sel] = hx(color)


# ---------------------------------------------------------------------------
# Masks
# ---------------------------------------------------------------------------
def mask_from(rows):
    return np.array([[c != "." for c in r] for r in rows])


def m_poly(pts, size=CELL):
    im = Image.new("L", (size, size), 0)
    ImageDraw.Draw(im).polygon([(float(x), float(y)) for x, y in pts], fill=1)
    return np.array(im).astype(bool)


def m_ellipse(cx, cy, rx, ry, size=CELL):
    im = Image.new("L", (size, size), 0)
    ImageDraw.Draw(im).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=1)
    return np.array(im).astype(bool)


def m_rect(x0, y0, x1, y1, size=CELL):
    m = blank(size)
    m[max(0, y0):y1 + 1, max(0, x0):x1 + 1] = True
    return m


def m_diag(x0, y0, n, w=1, dx=1, dy=-1, size=CELL, taper=None):
    """45° band: step i moves (dx, dy); width = w pixels shifted right.
    taper: widths for the last steps (e.g. [2, 1])."""
    m = blank(size)
    for i in range(n):
        ww = w
        if taper:
            back = n - 1 - i
            if back < len(taper):
                ww = taper[len(taper) - 1 - back]
        for k in range(ww):
            x, y = x0 + i * dx + k, y0 + i * dy
            if 0 <= x < size and 0 <= y < size:
                m[y, x] = True
    return m


def m_seg(x0, y0, x1, y1, w=1, size=CELL):
    im = Image.new("L", (size, size), 0)
    ImageDraw.Draw(im).line([(x0, y0), (x1, y1)], fill=1, width=w)
    return np.array(im).astype(bool)


def m_path(pts, w=2, size=CELL):
    m = blank(size)
    for (a, b) in zip(pts[:-1], pts[1:]):
        m |= m_seg(a[0], a[1], b[0], b[1], w, size)
    return m


def nb(m):
    up = np.zeros_like(m); up[1:] = m[:-1]
    dn = np.zeros_like(m); dn[:-1] = m[1:]
    lf = np.zeros_like(m); lf[:, 1:] = m[:, :-1]
    rt = np.zeros_like(m); rt[:, :-1] = m[:, 1:]
    return up, dn, lf, rt


def edge4(m):
    """Pixels of m that touch the outside (4-neighbour) → outline ring."""
    p = np.pad(m, 1)
    full = p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return m & ~full


def near8(m):
    p = np.pad(m, 1)
    r = np.zeros_like(m)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy or dx:
                r |= p[1 + dy:1 + dy + m.shape[0], 1 + dx:1 + dx + m.shape[1]]
    return r


# ---------------------------------------------------------------------------
# Painting
# ---------------------------------------------------------------------------
def paint(cell, m, ramp, lo=1, mid=2, hi=3):
    """Bevel shading with light from the top-left: lit rim / body / shadow rim.
    `ramp` may be any list; the default picks 4 consecutive steps."""
    up, dn, lf, rt = nb(m)
    lit = m & (~up | ~lf)
    shd = m & (~dn | ~rt)
    body = m & ~lit & ~shd
    cell[body] = hx(ramp[mid])
    cell[lit & ~shd] = hx(ramp[hi])
    cell[shd & ~lit] = hx(ramp[lo])
    cell[lit & shd] = hx(ramp[mid])


def paint_round(cell, m, ramp, cx, cy, r):
    """Sphere-ish shading for round shapes (light from the top-left), ramp of ≥4 steps."""
    ys, xs = np.nonzero(m)
    for y, x in zip(ys, xs):
        dx, dy = (x + 0.5 - cx) / max(r, 1e-3), (y + 0.5 - cy) / max(r, 1e-3)
        lit = -(dx + dy) * 0.7 + 0.35 - 0.25 * (dx * dx + dy * dy)
        k = int(np.clip(round((lit + 0.6) / 1.4 * (len(ramp) - 1)), 0, len(ramp) - 1))
        cell[y, x] = hx(ramp[k])


def flat(cell, m, color):
    cell[m] = hx(color)


def auto_outline(a, color=OUTLINE):
    """1 px silhouette outline around opaque pixels (4-neighbour)."""
    op = a[..., 3] > 0
    nbm = np.zeros_like(op)
    nbm[1:] |= op[:-1]; nbm[:-1] |= op[1:]; nbm[:, 1:] |= op[:, :-1]; nbm[:, :-1] |= op[:, 1:]
    a[nbm & ~op] = hx(color)
    return a


def outline(cell):
    return auto_outline(cell, OUTLINE)


# diagonal helpers for weapons drawn at 45° (grip bottom-left, tip top-right)
U = np.array([0.7071, -0.7071])   # along the weapon (toward the tip)
P = np.array([-0.7071, -0.7071])  # perpendicular, up-left side


def loc(c, su, sp):
    v = np.array(c, float) + U * su + P * sp
    return (float(v[0]), float(v[1]))


def flip_h(a):
    return a[:, ::-1].copy()


def tint(a, color, k):
    """Blend opaque pixels toward `color` by k (0..1) — for variants (frozen, cursed …)."""
    out = a.copy()
    op = out[..., 3] > 0
    c = np.array(hx(color)[:3], float)
    out[op, :3] = (out[op, :3] * (1 - k) + c * k).astype(np.uint8)
    return out


def recolor(a, mapping):
    """Swap exact colours: mapping {old_hex: new_hex}. Handy for palette-swapped variants."""
    out = a.copy()
    for old, newc in mapping.items():
        o = np.array(hx(old)[:3])
        sel = (out[..., 3] > 0) & np.all(out[..., :3] == o, axis=-1)
        out[sel, :3] = hx(newc)[:3]
    return out


def strip(frames):
    return np.concatenate(frames, 1)


def upscale(a, s):
    return Image.fromarray(a).resize((a.shape[1] * s, a.shape[0] * s), Image.NEAREST)
