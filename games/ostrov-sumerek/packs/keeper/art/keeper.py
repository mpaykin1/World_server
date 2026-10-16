"""«Смотритель»: a hooded young keeper in a teal oilskin coat, a lantern hanging at the belt."""
from art.character import Spec, sheet
from art.pixel import S, N, Y
from art.registry import hero

TEAL = ["#143034", "#1f4a4c", "#2f6a66", "#4a8f80"]

KEEPER = Spec(
    colors=dict(tunic=[TEAL[0], TEAL[1], TEAL[2]], scarf=[Y[1], Y[2], Y[3]], pants=[S[1], S[2]], boots=[N[1], N[2], N[3]]),
    head=[
        ".....oooo.......",
        "....oOOOOoo.....",
        "...oOOOOOOoo....",
        "...oOOSsssek....",
        "...oOSsssssk....",
        "....oOSsss......",
        ".....oSSs.......",
    ],
    tails=[["...r", ".rr.", "R..."], ["....", "..rr", "Rr.."], ["...r", "..r.", ".R.."], ["..qr", "Rr..", "...."]],
    extras=[(17, 10, [".g.", "lYl", "lwl"])],          # the belt lantern (its glow: lantern { x: 11, y: 19 })
    extra_colors={"o": TEAL[1], "O": TEAL[2], "g": S[3], "l": Y[2], "Y": Y[5], "w": "#fffbe8"},
)


@hero("keeper")
def keeper():
    return sheet(KEEPER)
