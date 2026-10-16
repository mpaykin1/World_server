"""Relic icons (16×16, house style: top-left light, 1 px outline, ramp steps only)."""
import math

import numpy as np

from art.pixel import (S, N, Y, H, W, G, I, C, F, A, V, OUTLINE, new, put, stamp, paint, paint_round, flat,
                       m_ellipse, m_poly, m_rect, m_seg, outline, hx)
from art.registry import icon


def _band(c, x0, y0, x1, y1, width, ramp, lit_side=-1):
    """A tapered diagonal band (feathers, shards): lit on the upper-left side."""
    ax, ay = x1 - x0, y1 - y0
    L = math.hypot(ax, ay)
    ux, uy = ax / L, ay / L
    for y in range(16):
        for x in range(16):
            px, py = x + 0.5 - x0, y + 0.5 - y0
            u = (px * ux + py * uy) / L
            v = px * -uy + py * ux
            if not 0 <= u <= 1:
                continue
            w = width(u)
            if abs(v) <= w:
                side = v * lit_side
                k = 3 if side > w * 0.35 else 2 if side > -w * 0.2 else 1
                if abs(v) > w - 0.6:
                    k = max(0, k - 1)
                put(c, x, y, ramp[k])


@icon("gull_feather")
def gull_feather():
    c = new(16)
    _band(c, 2.6, 13.4, 13.8, 2.0, lambda u: 0.0 if u < 0.14 else 3.1 * math.sin(math.pi * min(1, (u - 0.14) / 0.88)) ** 0.6,
          [S[4], S[5], S[6], A[5]])
    # notches in the vane, the shaft and a dark tip
    for (x, y) in [(5, 8), (9, 4)]:
        c[y, x] = 0
    for t in np.linspace(0, 1, 18):
        put(c, int(2.4 + t * 9.6), int(13.6 - t * 9.6), A[5] if t > 0.15 else N[4])
    put(c, 13, 2, S[1]); put(c, 12, 2, S[2]); put(c, 13, 3, S[2])
    put(c, 1, 14, N[3]); put(c, 2, 13, N[4])
    return outline(c)


@icon("tide_charm")
def tide_charm():
    c = new(16)
    m = m_ellipse(8, 9, 5.4, 5.0, 16)
    paint_round(c, m, [W[1], W[2], W[3], W[4], W[5], W[6]], 8, 9, 5.4)
    # the spiral of the shell
    pts = []
    for k in range(40):
        a = k * 0.33
        r = 4.6 - k * 0.11
        if r < 0.6:
            break
        pts.append((int(round(8 + math.cos(a) * r)), int(round(9 + math.sin(a) * r * 0.92))))
    for x, y in pts:
        if m[y, x]:
            put(c, x, y, W[1])
    put(c, 8, 9, W[6])
    # string loop
    stamp(c, 6, 1, [".nnn.", "n...n", "n...n"], {"n": N[5]})
    put(c, 8, 4, Y[4])
    return outline(c)


@icon("iron_grip")
def iron_grip():
    c = new(16)
    fist = m_rect(3, 4, 12, 10, 16) & ~m_rect(3, 4, 3, 4, 16) & ~m_rect(12, 4, 12, 4, 16)
    paint(c, fist, [S[2], S[3], S[4], S[5]])
    for x in (5, 8, 11):                       # knuckle grooves
        put(c, x, 5, S[2]); put(c, x, 6, S[2])
    for x in range(4, 12):
        put(c, x, 4, S[6] if x < 9 else S[5])
    stamp(c, 1, 6, ["tt.", "ttt", "Tt."], {"t": S[4], "T": S[3]})           # thumb
    paint(c, m_rect(5, 11, 11, 14, 16), [N[2], N[3], N[4], N[5]])           # leather cuff
    for x in range(5, 12):
        put(c, x, 12, Y[3] if x % 2 else Y[2])
    return outline(c)


@icon("hawk_eye")
def hawk_eye():
    c = new(16)
    eye = m_poly([(1, 8), (5, 4.5), (11, 4.5), (15, 8), (11, 11.5), (5, 11.5)], 16)
    flat(c, eye, A[4])
    for y in range(16):
        for x in range(16):
            if eye[y, x] and (y >= 10 or x >= 13):
                put(c, x, y, A[2])
    iris = m_ellipse(8, 8, 2.9, 2.9, 16)
    paint_round(c, iris, [Y[1], Y[2], Y[3], Y[4], Y[5]], 8, 8, 2.9)
    flat(c, m_ellipse(8.2, 8, 1.1, 1.6, 16), OUTLINE)
    put(c, 7, 7, "#ffffff")
    # brow streak like a falcon's mark
    for x, y in [(2, 5), (3, 4), (4, 3), (5, 3), (6, 3), (10, 3), (11, 3), (12, 3), (13, 4)]:
        put(c, x, y, N[2])
    for x, y in [(7, 12), (7, 13), (8, 14)]:
        put(c, x, y, N[2])
    return outline(c)


@icon("soul_jar")
def soul_jar():
    c = new(16)
    body = m_ellipse(8, 10, 5.0, 4.6, 16) | m_rect(5, 4, 10, 7, 16)
    paint_round(c, body, [I[0], I[1], I[2], I[3], I[4]], 8, 9, 5.5)
    soul = m_ellipse(8, 10.5, 2.6, 2.4, 16)
    paint_round(c, soul, [G[3], G[4], G[5], G[6], "#f0ffd0"], 8, 10.5, 2.6)
    put(c, 7, 7, G[5]); put(c, 8, 6, G[4])            # a wisp rising inside
    for y in range(7, 13):                            # glass glint
        put(c, 4 if y > 8 else 5, y, I[5])
    paint(c, m_rect(5, 1, 10, 3, 16), [N[2], N[3], N[4], N[5]])     # cork
    for x in range(4, 12):
        put(c, x, 4, S[5] if x < 8 else S[4])                       # rim
    return outline(c)


@icon("magnet_coin")
def magnet_coin():
    c = new(16)
    u = np.zeros((16, 16), bool)
    for y in range(16):
        for x in range(16):
            r = math.hypot(x + 0.5 - 8, y + 0.5 - 7.5)
            if 3.0 <= r <= 6.0 and y + 0.5 >= 7.5:
                u[y, x] = True
    u |= m_rect(2, 3, 4, 7, 16) | m_rect(11, 3, 13, 7, 16)
    paint(c, u, [H[1], H[2], H[3], H[4]])
    paint(c, m_rect(2, 2, 4, 3, 16), [S[3], S[4], S[5], S[6]])     # steel tips
    paint(c, m_rect(11, 2, 13, 3, 16), [S[3], S[4], S[5], S[6]])
    coin = m_ellipse(8, 4.5, 2.2, 2.2, 16)
    paint_round(c, coin, [Y[1], Y[2], Y[3], Y[4], Y[5]], 8, 4.5, 2.2)
    put(c, 8, 4, Y[6])
    for x, y in [(6, 1), (10, 1), (5, 4), (11, 4)]:                  # pull lines
        put(c, x, y, Y[5])
    return outline(c)


@icon("heart_seed")
def heart_seed():
    c = new(16)
    heart = m_ellipse(5.6, 7.6, 3.2, 3.0, 16) | m_ellipse(10.4, 7.6, 3.2, 3.0, 16) | m_poly([(2.6, 8.5), (13.4, 8.5), (8, 14.5)], 16)
    paint_round(c, heart, [H[0], H[1], H[2], H[3], H[4], H[5]], 7, 8, 6)
    put(c, 4, 6, H[5]); put(c, 5, 6, "#ffffff")
    # a sprout on top
    stamp(c, 7, 1, ["..ll", ".lL.", "s...", "s..."], {"l": G[5], "L": G[4], "s": G[3]})
    stamp(c, 5, 2, ["kk", ".k"], {"k": G[4]})
    return outline(c)


@icon("lantern_shard")
def lantern_shard():
    c = new(16)
    shard = m_poly([(8.5, 0.6), (12.6, 6.4), (10.4, 15.2), (5.6, 15.2), (3.6, 7.2)], 16)
    paint(c, shard, [F[2], F[3], F[4], F[5]])
    facet = m_poly([(8.5, 1.6), (9.6, 8), (8, 14), (6.6, 8)], 16)
    flat(c, facet & shard, Y[5])
    for y in (5, 6, 7, 8, 9):
        put(c, 8, y, "#fffbe0")
    for x, y in [(2, 3), (14, 10), (13, 2)]:                         # sparks
        put(c, x, y, Y[5])
    return outline(c)


@icon("storm_glass")
def storm_glass():
    c = new(16)
    globe = m_ellipse(8, 7, 5.6, 5.6, 16)
    paint_round(c, globe, [V[0], V[1], W[0], W[1], W[2], W[3]], 8, 7, 5.6)
    bolt = [(10, 2), (9, 3), (8, 4), (7, 5), (8, 5), (9, 5), (10, 5), (9, 6), (8, 7), (7, 8), (8, 8), (9, 8), (8, 9), (7, 10), (6, 11)]
    for x, y in bolt:
        put(c, x, y, Y[5])                                           # the bolt inside
    for x, y in [(9, 4), (10, 6), (9, 9), (7, 9)]:
        put(c, x, y, C[4])                                           # its cold halo
    put(c, 8, 5, "#ffffff"); put(c, 8, 8, "#ffffff")
    put(c, 4, 4, I[4]); put(c, 5, 3, I[5])                            # glass glint
    paint(c, m_rect(4, 12, 11, 14, 16), [Y[1], Y[2], Y[3], Y[4]])     # brass stand
    for x in range(5, 11):
        put(c, x, 12, Y[4] if x < 8 else Y[3])
    return outline(c)
