"""Frost relic icon: «Иней» — a six-armed rime crystal."""
import math

from art.pixel import I, new, put, outline
from art.registry import icon


@icon("rime_charm")
def rime_charm():
    c = new(16)
    cx, cy = 7.5, 7.5
    for k in range(6):
        a = k * math.pi / 3 + math.pi / 6
        dx, dy = math.cos(a), math.sin(a)
        for r in range(1, 8):
            x, y = int(round(cx + dx * r)), int(round(cy + dy * r))
            lit = (dx + dy) < 0                               # arms toward the top-left catch the light
            put(c, x, y, I[5] if lit and r < 6 else I[4] if r < 6 else I[3])
            if r == 4:                                        # little side branches
                for s in (-1, 1):
                    b = a + s * 0.9
                    put(c, int(round(x + math.cos(b) * 1.6)), int(round(y + math.sin(b) * 1.6)), I[3])
    for x, y in [(7, 7), (8, 7), (7, 8), (8, 8)]:
        put(c, x, y, "#ffffff")
    put(c, 6, 6, I[5])
    return outline(c)
