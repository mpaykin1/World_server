"""Boomerang: the held sprite (32×32, points right like a gun: base 0) and the spinning projectile (16×16)."""
from art.pixel import N, H, Y, new, m_path, paint, put, outline
from art.registry import weapon, projectile

WOOD = [N[2], N[3], N[4], N[5]]


@weapon("boomerang")
def w_boomerang():
    c = new()
    paint(c, m_path([(6, 19), (12, 15), (17, 11)], 3) | m_path([(17, 11), (22, 14), (27, 18)], 3), WOOD)
    for (x, y) in [(9, 17), (10, 16), (23, 15), (24, 16)]:            # painted bands
        put(c, x, y, H[3])
    for (x, y) in [(16, 11), (17, 11), (17, 12)]:                       # brass-capped elbow
        put(c, x, y, Y[4])
    put(c, 6, 20, N[1]); put(c, 28, 19, N[1])
    return outline(c), dict(grip=(8, 18), tip=(27, 18), muzzle=(17, 11), base=0)


@projectile("boomerang")
def p_boomerang():
    c = new(16)
    paint(c, m_path([(2, 11), (5, 7), (8, 4)], 2, 16) | m_path([(8, 4), (11, 7), (14, 11)], 2, 16), WOOD)
    put(c, 4, 9, H[3]); put(c, 12, 9, H[3])
    put(c, 8, 4, Y[4]); put(c, 8, 5, Y[4])
    return outline(c)
