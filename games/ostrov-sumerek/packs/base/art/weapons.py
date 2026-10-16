"""Base arsenal art: fists, 10 melee, 10 ranged (+ the drawn bow frame).
Melee weapons are drawn at 45° (grip bottom-left, tip top-right, base=45); guns and bows point
right (base=0). Each function returns (32×32 RGBA array, meta) where meta gives the grip (the
rotation pivot held in the hand), the tip (trails, hit sparks) and the muzzle (shots, flashes)."""
import math

import numpy as np

from art.pixel import (G, N, S, Y, H, K, W as WB, V, C, I, F, WRAP, OUTLINE, CELL, hx, new, blank, m_poly, m_ellipse,
                       m_rect, m_diag, m_seg, m_path, nb, paint, flat, put, stamp, outline, loc, U, P)
from art.registry import weapon


@weapon("fists")
def w_fists():
    c = new()
    cm = {"k": K[3], "s": K[2], "S": K[1], "d": K[0], "w": WRAP[2], "W": WRAP[1], "x": WRAP[0]}
    stamp(c, 9, 10, [
        "......kkkk...",
        "....kkkssskk.",
        "ww.ksssssssks",
        "wWwksssSSSSSs",
        "wWwkssssssssk",
        "wWwksssSSSSSs",
        "wWwkssssssssk",
        "wWwSsssSSSSSd",
        "ww..SSSSSSdd.",
    ], cm)
    return outline(c), dict(grip=(10, 15), tip=(21, 15), base=0)


@weapon("stick")
def w_stick():
    c = new()
    m = m_diag(5, 26, 22, 2)
    paint(c, m, [N[1], N[2], N[3], N[4]])
    for (x, y) in [(11, 20), (17, 14), (22, 9)]:
        put(c, x, y, N[1])
    put(c, 26, 5, N[5]); put(c, 27, 5, N[4])
    return outline(c), dict(grip=(9, 22), tip=(27, 4), base=45)


@weapon("dagger")
def w_dagger():
    c = new()
    paint(c, m_diag(7, 24, 5, 2), [H[0], H[1], H[2], H[3]])
    paint(c, m_diag(9, 17, 6, 2, dx=1, dy=1), [Y[1], Y[2], Y[3], Y[4]])
    paint(c, m_diag(13, 18, 10, 3, taper=[2, 2, 1]), [S[2], S[4], S[5], S[6]])
    for i in range(2, 9):
        put(c, 13 + i, 18 - i, S[6])
    stamp(c, 5, 24, ["yY", "YY"], {"y": Y[4], "Y": Y[2]})
    return outline(c), dict(grip=(9, 22), tip=(23, 8), base=45)


@weapon("sword")
def w_sword():
    c = new()
    paint(c, m_diag(6, 26, 4, 2), [N[0], N[1], N[2], N[2]])
    for i in (0, 2):
        put(c, 6 + i, 26 - i, WRAP[1])
    paint(c, m_diag(7, 19, 7, 2, dx=1, dy=1), [Y[1], Y[2], Y[3], Y[4]])
    put(c, 10, 22, H[3]); put(c, 11, 22, H[2])
    blade = m_diag(11, 21, 17, 3, taper=[3, 2, 2, 1])
    paint(c, blade, [S[2], S[4], S[5], S[6]])
    for i in range(1, 15):
        put(c, 11 + i, 21 - i, S[6])
    for i in range(2, 10):
        put(c, 12 + i, 21 - i, S[3])          # fuller
    stamp(c, 4, 27, ["yY", "YY"], {"y": Y[4], "Y": Y[2]})
    return outline(c), dict(grip=(7, 25), tip=(28, 4), base=45)


@weapon("katana")
def w_katana():
    c = new()
    paint(c, m_diag(3, 28, 8, 2), [N[0], N[0], N[1], N[1]])
    for i in range(0, 8, 2):
        put(c, 3 + i, 28 - i, WRAP[2])
    tsuba = m_ellipse(11, 20, 2, 2)
    paint(c, tsuba, [S[0], S[1], S[2], Y[2]])
    put(c, 12, 19, Y[3])
    blade = m_diag(12, 19, 18, 2, taper=[1, 1])
    paint(c, blade, [S[3], S[4], S[5], S[6]])
    for i in range(1, 17):
        put(c, 12 + i, 19 - i, S[6] if i % 3 else "#ffffff")
    return outline(c), dict(grip=(6, 25), tip=(29, 2), base=45)


@weapon("axe")
def w_axe():
    c = new()
    paint(c, m_diag(5, 28, 21, 2), [N[1], N[2], N[3], N[4]])
    for i in range(1, 5):
        put(c, 5 + i, 28 - i, H[1])
    ctr = (21.5, 10.5)
    blade = m_poly([loc(ctr, -2.2, 0.4), loc(ctr, -5.6, 5.4), loc(ctr, -4.4, 8.2), loc(ctr, -0.6, 9.0),
                    loc(ctr, 3.4, 8.2), loc(ctr, 4.6, 5.4), loc(ctr, 2.0, 0.4)])
    paint(c, blade, [S[2], S[3], S[4], S[5]])
    poll = m_poly([loc(ctr, -1.6, -0.2), loc(ctr, -1.3, -2.4), loc(ctr, 1.5, -2.4), loc(ctr, 1.8, -0.2)])
    paint(c, poll, [S[1], S[2], S[3], S[4]])
    xs, ys = np.where(blade.T)
    for x, y in zip(xs, ys):
        d = (np.array([x + 0.5, y + 0.5]) - np.array(ctr)) @ P
        if d > 7.2:
            put(c, x, y, S[6])
        elif d > 6.2:
            put(c, x, y, S[5])
    return outline(c), dict(grip=(8, 25), tip=(15, 4), base=45)


@weapon("hammer")
def w_hammer():
    c = new()
    shaft = m_diag(5, 28, 19, 2)
    paint(c, shaft, [N[0], N[1], N[2], N[3]])
    for i in (4, 9, 14):
        put(c, 5 + i, 28 - i, S[3]); put(c, 6 + i, 28 - i, S[2])
    ctr = (22.5, 10.5)
    head = m_poly([loc(ctr, -3, 6.2), loc(ctr, 3, 6.2), loc(ctr, 3, -6.2), loc(ctr, -3, -6.2)])
    paint(c, head, [S[1], S[2], S[4], S[5]])
    band = m_poly([loc(ctr, -3.2, 1.1), loc(ctr, 3.2, 1.1), loc(ctr, 3.2, -1.1), loc(ctr, -3.2, -1.1)])
    paint(c, band & head, [Y[1], Y[2], Y[3], Y[4]])
    for s in (5.4, -5.4):
        face = m_poly([loc(ctr, -3, s - 0.8), loc(ctr, 3, s - 0.8), loc(ctr, 3, s + 0.8), loc(ctr, -3, s + 0.8)]) & head
        paint(c, face, [S[3], S[4], S[5], S[6]])
    return outline(c), dict(grip=(8, 25), tip=(22, 10), base=45)


@weapon("spear")
def w_spear():
    c = new()
    paint(c, m_diag(2, 29, 22, 2), [N[1], N[2], N[3], N[4]])
    ctr = (25.5, 6.5)
    head = m_poly([loc(ctr, -1.8, 0.0), loc(ctr, 1.2, 1.9), loc(ctr, 5.8, 0.0), loc(ctr, 1.2, -1.9)])
    paint(c, head, [S[3], S[4], S[5], S[6]])
    for i in range(0, 5):
        put(c, 25 + i, 7 - i, S[6])
    for (x, y, col) in [(21, 9, H[3]), (22, 9, H[2]), (21, 10, H[2]), (22, 10, H[1]), (20, 11, H[2]), (23, 8, H[3]), (20, 12, H[1])]:
        put(c, x, y, col)
    return outline(c), dict(grip=(9, 22), tip=(30, 1), base=45)


@weapon("scythe")
def w_scythe():
    c = new()
    paint(c, m_diag(4, 29, 22, 2), [N[0], N[0], N[1], N[2]])
    pts = [(24, 8), (20, 4.5), (15, 3.5), (10, 5), (6.5, 8.5), (5, 12)]
    blade = blank()
    for k, (a, b) in enumerate(zip(pts[:-1], pts[1:])):
        w = [4, 4, 3, 2, 2][k]
        blade |= m_seg(a[0], a[1], b[0], b[1], w)
    paint(c, blade, [V[1], V[2], S[4], S[5]])
    up, dn, lf, rt = nb(blade)
    edge = blade & ~dn
    xs, ys = np.where(edge.T)
    for x, y in zip(xs, ys):
        if y > 4:
            put(c, x, y, S[6] if x % 2 else V[4])
    put(c, 24, 8, S[3]); put(c, 25, 8, S[2]); put(c, 24, 9, S[2])
    return outline(c), dict(grip=(10, 23), tip=(5, 12), base=45)


@weapon("flamesword")
def w_flamesword():
    c = new()
    paint(c, m_diag(6, 26, 4, 2), [S[0], S[1], S[1], S[2]])
    paint(c, m_diag(7, 19, 7, 2, dx=1, dy=1), [S[0], S[1], S[2], S[3]])
    put(c, 10, 22, F[5]); put(c, 11, 22, F[3])
    blade = m_diag(11, 21, 17, 3, taper=[3, 2, 2, 1])
    paint(c, blade, [F[1], F[2], F[3], F[4]])
    for i in range(1, 15):
        put(c, 12 + i, 21 - i, F[5] if i % 4 else "#fff6c8")
    for i in (3, 6, 9, 12):     # flame tongues licking off the edge
        put(c, 10 + i, 20 - i, F[3]); put(c, 10 + i, 19 - i, F[4]); put(c, 9 + i, 19 - i, F[2])
    stamp(c, 4, 27, ["yY", "YY"], {"y": S[3], "Y": S[1]})
    return outline(c), dict(grip=(7, 25), tip=(28, 4), base=45)


@weapon("flail")
def w_flail():
    c = new()
    paint(c, m_diag(4, 28, 9, 2), [N[1], N[2], N[3], N[4]])
    put(c, 12, 20, S[4]); put(c, 13, 20, S[3]); put(c, 12, 19, S[5])
    for k, (x, y) in enumerate([(14, 18), (15, 17), (16, 16), (17, 15), (18, 14)]):
        put(c, x, y, S[5] if k % 2 else S[3])
    ball = m_ellipse(22.5, 9.5, 4, 4)
    paint(c, ball, [S[1], S[3], S[4], S[5]])
    for a in range(8):
        ang = a * math.pi / 4
        x, y = 22.5 + math.cos(ang) * 5.6, 9.5 + math.sin(ang) * 5.6
        put(c, int(round(x)), int(round(y)), S[6] if a in (5, 6, 4) else S[4])
    put(c, 21, 8, S[6]); put(c, 20, 8, S[5])
    return outline(c), dict(grip=(6, 26), tip=(22, 10), base=45)


@weapon("sling")
def w_sling():
    c = new()
    paint(c, m_seg(4, 16, 14, 16, 3), [N[1], N[2], N[3], N[4]])
    paint(c, m_path([(14, 16), (19, 13), (24, 9)], 2) | m_path([(14, 16), (19, 19), (24, 23)], 2), [N[1], N[2], N[3], N[4]])
    for (x, y) in [(24, 8), (25, 8), (24, 23), (25, 23)]:
        put(c, x, y, N[1])
    band = m_seg(24, 9, 12, 15) | m_seg(24, 23, 12, 17)
    flat(c, band, H[1])
    stamp(c, 10, 15, ["Lp", "LP", "Lp"], {"L": N[0], "p": S[4], "P": S[5]})
    for (x, y) in [(5, 15), (7, 15), (9, 15)]:
        put(c, x, y, WRAP[1])
    return outline(c), dict(grip=(7, 16), tip=(24, 16), muzzle=(25, 16), base=0)


def bow_arc():
    return m_path([(13, 3), (17, 6), (20, 11), (21, 16), (20, 21), (17, 26), (13, 29)], 2)


@weapon("bow")
def w_bow():
    c = new()
    paint(c, bow_arc(), [N[1], N[2], N[3], N[4]])
    flat(c, m_seg(13, 4, 13, 28), WRAP[2])
    flat(c, m_seg(14, 16, 27, 16), N[4])
    stamp(c, 27, 14, ["a..", "bbc", "a.."], {"a": S[4], "b": S[6], "c": S[5]})
    stamp(c, 13, 15, ["rR", ".w", "rR"], {"r": H[3], "R": H[2], "w": N[4]})
    for y in range(14, 19):
        put(c, 21, y, H[1]); put(c, 20, y, H[2])
    return outline(c), dict(grip=(20, 16), tip=(29, 16), muzzle=(30, 16), base=0)


@weapon("bow_drawn")
def w_bow_drawn():
    c = new()
    paint(c, bow_arc(), [N[1], N[2], N[3], N[4]])
    flat(c, m_seg(13, 4, 6, 16) | m_seg(6, 16, 13, 28), WRAP[2])
    flat(c, m_seg(7, 16, 22, 16), N[4])
    stamp(c, 22, 14, ["a..", "bbc", "a.."], {"a": S[4], "b": S[6], "c": S[5]})
    stamp(c, 6, 15, ["rR", ".w", "rR"], {"r": H[3], "R": H[2], "w": N[4]})
    for y in range(14, 19):
        put(c, 21, y, H[1]); put(c, 20, y, H[2])
    return outline(c), dict(grip=(20, 16), tip=(24, 16), muzzle=(25, 16), base=0)


@weapon("xbow")
def w_xbow():
    c = new()
    stock = m_poly([(3, 17), (24, 14.5), (24, 17.5), (6, 20.5), (3, 21)])
    paint(c, stock, [N[1], N[2], N[3], N[4]])
    prod = m_path([(20, 6), (22.5, 11), (23, 16), (22.5, 21), (20, 26)], 2)
    paint(c, prod, [I[1], I[2], I[3], I[4]])
    flat(c, m_seg(20, 7, 14, 15) | m_seg(20, 25, 14, 16), WRAP[2])
    flat(c, m_seg(13, 14, 27, 14), I[3])
    stamp(c, 27, 12, ["a..", "bbc", "a.."], {"a": I[4], "b": I[5], "c": "#ffffff"})
    stamp(c, 12, 13, ["i", ".", "i"], {"i": I[4]})
    put(c, 10, 21, S[2]); put(c, 10, 22, S[1])
    return outline(c), dict(grip=(9, 19), tip=(29, 14), muzzle=(30, 14), base=0)


@weapon("pistol")
def w_pistol():
    c = new()
    paint(c, m_rect(14, 11, 27, 12), [S[2], S[4], S[5], S[6]])
    put(c, 26, 10, S[4])
    paint(c, m_rect(10, 10, 16, 15), [S[1], S[3], S[4], S[5]])
    for y in (11, 13):
        for x in range(11, 16):
            put(c, x, y, S[2])
    paint(c, m_rect(8, 9, 9, 10), [S[1], S[2], S[3], S[4]])
    grip = m_poly([(8, 14), (12, 14), (11, 22), (6, 22)])
    paint(c, grip, [N[1], N[2], N[3], N[4]])
    put(c, 9, 17, Y[3])
    flat(c, m_seg(12, 16, 14, 18) | m_seg(14, 18, 15, 16), S[2])
    return outline(c), dict(grip=(9, 18), tip=(27, 12), muzzle=(28, 11.5), base=0)


@weapon("shotgun")
def w_shotgun():
    c = new()
    paint(c, m_rect(12, 11, 30, 13), [S[2], S[3], S[5], S[6]])
    for x in range(12, 31):
        put(c, x, 12, S[2])
    paint(c, m_rect(17, 14, 23, 15), [N[1], N[2], N[3], N[4]])
    paint(c, m_rect(9, 10, 13, 15), [S[0], S[1], S[2], S[3]])
    stock = m_poly([(2, 13), (10, 11.5), (10, 15.5), (3, 19)])
    paint(c, stock, [N[1], N[2], N[3], N[4]])
    put(c, 11, 16, S[2]); put(c, 11, 17, S[1])
    put(c, 29, 10, S[5])
    return outline(c), dict(grip=(10, 16), tip=(30, 12), muzzle=(31, 12), base=0)


@weapon("smg")
def w_smg():
    c = new()
    paint(c, m_rect(9, 11, 22, 15), [S[0], S[1], S[2], S[3]])
    paint(c, m_rect(22, 12, 27, 13), [S[2], S[3], S[4], S[5]])
    paint(c, m_rect(27, 11, 28, 14), [S[1], S[2], S[3], S[4]])
    drum = m_ellipse(15.5, 18.5, 3.6, 3.6)
    paint(c, drum, [S[0], S[1], S[3], S[4]])
    put(c, 15, 18, S[0]); put(c, 14, 17, S[5])
    paint(c, m_rect(10, 15, 12, 21), [S[0], S[1], S[2], S[2]])
    flat(c, m_seg(3, 12, 9, 12) | m_seg(3, 12, 3, 15), S[3])
    for x in (18, 20):
        put(c, x, 12, H[3])
    put(c, 19, 10, S[3]); put(c, 20, 10, S[3])
    return outline(c), dict(grip=(11, 18), tip=(28, 12), muzzle=(29, 12.5), base=0)


@weapon("saw")
def w_saw():
    c = new()
    body = m_rect(5, 10, 19, 18)
    paint(c, body, [S[0], S[1], S[2], S[3]])
    for x in range(5, 20):
        put(c, x, 10, Y[3] if (x // 2) % 2 else S[0])
    saw = m_ellipse(23.5, 14.5, 5.5, 5.5)
    paint(c, saw, [S[3], S[4], S[5], S[6]])
    for a in range(10):
        ang = a * math.pi / 5 + 0.2
        put(c, int(round(23.5 + math.cos(ang) * 6.6)), int(round(14.5 + math.sin(ang) * 6.6)), S[5])
    paint(c, m_ellipse(23.5, 14.5, 2, 2), [H[1], H[2], H[3], H[3]])
    put(c, 23, 14, S[0])
    paint(c, m_rect(8, 18, 10, 23), [S[0], S[1], S[2], S[2]])
    paint(c, m_rect(9, 7, 15, 8), [S[0], S[1], S[2], S[3]])
    return outline(c), dict(grip=(9, 20), tip=(29, 14), muzzle=(29, 14.5), base=0)


@weapon("bomb")
def w_bomb():
    c = new()
    tube = m_rect(8, 10, 25, 18)
    paint(c, tube, [S[0], S[1], S[2], S[3]])
    for x0 in (11, 17, 23):
        paint(c, m_rect(x0, 9, x0 + 1, 19), [Y[1], Y[2], Y[3], Y[4]])
    muzzle = m_rect(26, 9, 28, 19)
    paint(c, muzzle, [S[0], S[1], S[2], S[3]])
    flat(c, m_rect(27, 11, 28, 17), "#07040c")
    stock = m_poly([(3, 14), (8, 13), (8, 18), (4, 20)])
    paint(c, stock, [N[1], N[2], N[3], N[4]])
    paint(c, m_rect(12, 19, 14, 23), [N[0], N[1], N[2], N[3]])
    return outline(c), dict(grip=(13, 20), tip=(28, 14), muzzle=(29, 14), base=0)


@weapon("tesla")
def w_tesla():
    c = new()
    paint(c, m_seg(2, 21, 20, 15, 2), [S[0], S[1], S[2], S[3]])
    for k, x in enumerate(range(13, 21)):
        y = int(round(21 - (x - 2) * 6 / 18))
        put(c, x, y - 1, Y[3] if k % 2 else Y[2]); put(c, x, y, Y[2] if k % 2 else Y[1]); put(c, x, y + 1, Y[1])
    flat(c, m_seg(21, 13, 25, 10) | m_seg(21, 16, 25, 19), S[5])
    orb = m_ellipse(25, 14.5, 3.2, 3.2)
    paint(c, orb, [C[2], C[3], C[4], C[5]])
    put(c, 24, 13, "#ffffff"); put(c, 25, 14, C[5])
    return outline(c), dict(grip=(8, 19), tip=(27, 14), muzzle=(28, 14), base=0)


@weapon("laser")
def w_laser():
    c = new()
    body = m_poly([(5, 13), (23, 11), (23, 17.5), (9, 18), (5, 17)])
    paint(c, body, [S[3], S[4], S[5], S[6]])
    flat(c, m_seg(8, 15, 21, 14), V[3])
    paint(c, m_rect(14, 12, 17, 13), [C[3], C[4], C[4], C[5]])
    prism = m_poly([(23, 9.5), (29.5, 14.5), (23, 19.5)])
    paint(c, prism, [V[2], V[4], C[4], F[4]])
    for y in range(11, 19):
        put(c, 24, y, V[5] if y % 2 else C[5])
    paint(c, m_rect(10, 17, 12, 22), [V[0], V[1], V[2], V[2]])
    paint(c, m_rect(2, 13, 5, 17), [V[0], V[1], V[2], V[3]])
    return outline(c), dict(grip=(11, 19), tip=(29, 14), muzzle=(30, 14.5), base=0)
