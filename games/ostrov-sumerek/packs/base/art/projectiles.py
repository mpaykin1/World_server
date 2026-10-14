"""Base projectile sprites (16×16): pebble, arrow, bolt, saw, bomb, flail ball, shell casing."""
import math

from art.pixel import S, N, Y, H, I, WRAP, new, m_ellipse, m_rect, m_seg, paint, flat, put, stamp, outline
from art.registry import projectile


@projectile("pebble")
def p_pebble():
    c = new(16)
    paint(c, m_ellipse(7.5, 8, 2.6, 2.2, 16), [S[2], S[3], S[4], S[5]])
    return outline(c)


@projectile("arrow")
def p_arrow():
    c = new(16)
    flat(c, m_seg(2, 8, 12, 8, 1, 16), N[4])
    stamp(c, 12, 6, ["a..", "aa.", "bbc", "aa.", "a.."], {"a": S[4], "b": S[6], "c": S[5]})
    stamp(c, 1, 6, ["rr.", ".rr", "...", ".RR", "RR."], {"r": H[3], "R": WRAP[2]})
    return outline(c)


@projectile("bolt")
def p_bolt():
    c = new(16)
    paint(c, m_rect(3, 7, 11, 8, 16), [I[1], I[2], I[3], I[4]])
    stamp(c, 11, 5, ["a...", "ab..", "abbc", "abbc", "ab..", "a..."], {"a": I[4], "b": I[5], "c": "#ffffff"})
    stamp(c, 1, 6, ["i.", "ii", "ii", "i."], {"i": I[4]})
    return outline(c)


@projectile("saw")
def p_saw():
    c = new(16)
    paint(c, m_ellipse(7.5, 7.5, 5.2, 5.2, 16), [S[3], S[4], S[5], S[6]])
    for a in range(8):
        ang = a * math.pi / 4 + 0.39
        put(c, int(round(7.5 + math.cos(ang) * 6.4)), int(round(7.5 + math.sin(ang) * 6.4)), S[5])
    paint(c, m_ellipse(7.5, 7.5, 2, 2, 16), [H[1], H[2], H[3], H[3]])
    put(c, 7, 7, S[0]); put(c, 8, 8, S[0])
    return outline(c)


@projectile("bomb")
def p_bomb():
    c = new(16)
    paint(c, m_ellipse(7.5, 9, 4.2, 4.2, 16), [S[0], S[1], S[2], S[3]])
    put(c, 6, 7, S[4]); put(c, 5, 8, S[3])
    stamp(c, 10, 2, ["...s", "..f.", ".f..", "cc.."], {"s": Y[5], "f": N[3], "c": Y[2]})
    return outline(c)


@projectile("ball")
def p_ball():
    c = new(16)
    paint(c, m_ellipse(7.5, 7.5, 4, 4, 16), [S[1], S[3], S[4], S[5]])
    for a in range(8):
        ang = a * math.pi / 4
        put(c, int(round(7.5 + math.cos(ang) * 5.6)), int(round(7.5 + math.sin(ang) * 5.6)), S[5])
    put(c, 6, 6, S[6])
    return outline(c)


@projectile("casing")
def p_casing():
    c = new(16)
    stamp(c, 7, 6, ["ab", "ab", "aB", ".B"], {"a": Y[4], "b": Y[3], "B": Y[1]})
    return c
