"""Island inhabitants (16×24 sheets, same skeleton as the hero — art/character.py)."""
from art.character import Spec, sheet
from art.pixel import S, N, Y, W, G, A
from art.registry import hero

# hand pixel per near-arm pose (row, col) — things held in the hand hang from here
HAND = {"back": (15, 4), "side": (15, 8), "fwd": (15, 11), "up": (13, 11)}
LANTERN = [".g.", "lYl", "YwY", ".l."]


def lantern_in_hand(i, fr):
    r, c = HAND[fr["near"]]
    return [(r + 1, c - 1, LANTERN)]


# «Призрак смотрителя»: keeper's cap, white beard, long coat, the old lantern
KEEPER_OLD = Spec(
    colors=dict(hair=[S[3], S[4], S[5]], tunic=[W[0], W[1], W[2]], pants=[S[1], S[2]], boots=[N[1], N[2], N[3]], scarf=[W[0], W[1], W[2]]),
    head=[
        ".....aCCCCa.....",
        "....aCCCCCCa....",
        "...HaCCCCCCvvv..",
        "...HHhSssesk....",
        "....HbSsssssk...",
        "....bbbbbbbbb...",
        ".....bbbbxbb....",
    ],
    scarf=[
        "......bbxbT.....",
        ".....TTbbTT.....",
    ],
    tails=None,
    extras=[(17, 6, ["utttT", "uttTT"]), lantern_in_hand],
    extra_colors={"a": W[0], "C": W[1], "v": S[0], "b": S[6], "x": S[5], "g": S[3], "l": Y[2], "Y": Y[5], "w": "#fffbe8"},
    poses={4: {"near": "fwd"}},                  # standing, he holds the lantern out in front
)


@hero("keeper_old")
def keeper_old():
    return sheet(KEEPER_OLD)


def rod(i, fr):
    r, c = HAND[fr["near"]]
    pts = [(r - k, c + k) for k in range(1, 8) if c + k <= 15 and r - k >= 0]     # forward and up, clear of the face
    out = [(y, x, ["o"]) for y, x in pts]
    if pts:
        ty, tx = pts[-1]
        out += [(ty + k, tx, ["i"]) for k in range(1, 6)]                            # the line hangs from the tip
    return out


# «Рыбак»: yellow sou'wester and raincoat, rubber boots, a rod over the shoulder
FISHER = Spec(
    colors=dict(hair=[N[1], N[2], N[3]], tunic=[Y[2], Y[3], Y[4]], scarf=[Y[2], Y[3], Y[4]], pants=[S[1], S[2]],
                boots=[G[1], G[2], G[3]], belt=Y[1], buckle=S[4]),
    head=[
        "......aAAAa.....",
        ".....aAwwwAa....",
        "..aaaAAAAAAAa...",
        "...aHhSssesk....",
        "....HSsgsssss...",
        "....HSgggss.....",
        ".....Sssss......",
    ],
    scarf=[
        ".....tttttu.....",
        "....TTttttT.....",
    ],
    tails=None,
    extras=[rod],
    extra_colors={"a": Y[1], "A": Y[3], "w": Y[5], "g": N[2], "o": N[4], "i": S[5]},
)


@hero("fisher")
def fisher():
    return sheet(FISHER)
