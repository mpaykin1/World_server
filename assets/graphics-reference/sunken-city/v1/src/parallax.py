"""2.5D parallax backgrounds for side-scrolling levels (480×270, seamless horizontally): the abyss, the
far city, ruins in the middle distance, the reef close by, the dark foreground; and animated overlays
(light shafts, marine snow, bubbles — 8 frames, seamless in time)."""
import math
import os

import numpy as np
from PIL import Image

from export import save
from pixel import hx, BAYER4
from ramps import ABYSS, GLOWS, KELP, STONE_D, ROCK, SAND

W, H = 480, 270
TAU = math.pi * 2


def _pal(ramps):
    cols = [hx(c)[:3] for r in ramps for c in r]
    return np.array(cols, np.int32)


PAL = _pal([ABYSS, STONE_D, KELP, ROCK, SAND] + list(GLOWS.values()))


def quantize(rgb):
    d = ((rgb[..., None, :].astype(np.int32) - PAL[None, None]) ** 2 * np.array([3, 4, 2])).sum(-1)
    return PAL[d.argmin(-1)].astype(np.uint8)


def tint(img, glow, fog, k, keep_glow=0.75):
    """Push a sprite into the water: colours lean toward the fog, glowing pixels keep most of their light."""
    out = img.copy()
    a = img[..., 3] > 0
    f = np.array(hx(fog)[:3], np.float32)
    rgb = img[..., :3].astype(np.float32) * (1 - k) + f * k
    if glow is not None:
        g = glow[..., 3] > 0
        rgb[g] = img[..., :3][g] * keep_glow + f * (1 - keep_glow)
    out[..., :3] = quantize(rgb.astype(np.uint8))
    out[~a] = 0
    return out


def silhouette(img, glow, col, glow_k=0.5):
    out = np.zeros_like(img)
    a = img[..., 3] > 0
    out[a] = hx(col)
    if glow is not None:
        g = glow[..., 3] > 0
        c = (glow[..., :3].astype(np.float32) * glow_k + np.array(hx(col)[:3]) * (1 - glow_k)).astype(np.uint8)
        out[g, :3] = quantize(c[g][None])[0]
    return out


def place(layer, spr, x, y):
    """Paste with wrap-around in x (seamless loop) and clipping in y. y = bottom of the sprite."""
    h, w = spr.shape[:2]
    y0 = y - h
    for ox in (0, -W, W):
        x0 = x + ox
        xa, xb = max(0, x0), min(W, x0 + w)
        ya, yb = max(0, y0), min(H, y0 + h)
        if xa >= xb or ya >= yb:
            continue
        s = spr[ya - y0:yb - y0, xa - x0:xb - x0]
        m = s[..., 3] > 0
        layer[ya:yb, xa:xb][m] = s[m]


def half(img):
    """Nearest 1/2 downsample keeping the brightest pixel of each 2×2 (silhouettes stay solid)."""
    h, w = img.shape[0] // 2 * 2, img.shape[1] // 2 * 2
    a = img[:h, :w].reshape(h // 2, 2, w // 2, 2, 4)
    alpha = a[..., 3].max(axis=(1, 3))
    lum = a[..., :3].astype(int).sum(-1)
    idx = lum.reshape(h // 2, 2, w // 2, 2).transpose(0, 2, 1, 3).reshape(h // 2, w // 2, 4).argmax(-1)
    flat = a.transpose(0, 2, 1, 3, 4).reshape(h // 2, w // 2, 4, 4)
    out = np.take_along_axis(flat, idx[..., None, None].repeat(4, -1), 2)[:, :, 0]
    out[..., 3] = alpha
    return out


def gradient():
    ys, xs = np.mgrid[0:H, 0:W]
    t = 1 - ys / H                               # 1 at the top (toward the light)
    lvl = t * (len(ABYSS) - 1.001)
    base = np.floor(lvl).astype(int)
    frac = lvl - base
    step = base + (BAYER4[ys % 4, xs % 4] < frac)
    lut = np.array([hx(c) for c in ABYSS], np.uint8)
    out = lut[np.clip(step, 0, len(ABYSS) - 1)]
    # soft far shafts of light from the surface
    for cx, w0 in ((70, 30), (210, 22), (330, 38), (430, 18)):
        shaft = (np.abs(xs - cx - (H - ys) * 0.35) < w0 * (0.4 + 0.6 * t)) & (BAYER4[ys % 4, xs % 4] < 0.22 * t)
        out[shaft] = lut[np.clip(step[shaft] + 1, 0, len(ABYSS) - 1)]
    return out


def build(root, sprites):
    """sprites: id → (rgba, glow) side views from the model export."""
    os.makedirs(os.path.join(root, "2.5d/parallax"), exist_ok=True)
    rng = np.random.default_rng(7)
    layers = {}
    layers["0_abyss"] = gradient()
    far = np.zeros((H, W, 4), np.uint8)
    for k, (sid, x, y, sc) in enumerate((("cathedral_tower", 40, 210, 2), ("cathedral_tower", 300, 222, 2), ("viaduct", 150, 222, 2),
                                         ("viaduct", 380, 226, 2), ("arch", 250, 230, 2))):
        img, g = sprites[sid]
        if sc == 2:
            img, g = half(img), half(g)
        place(far, silhouette(img, g, ABYSS[3], 0.45), x, y)
    layers["1_far_city"] = far
    mid = np.zeros((H, W, 4), np.uint8)
    for sid, x, y in (("viaduct", 10, 262), ("arch", 170, 262), ("bridge_broken", 250, 240), ("column_broken", 400, 264), ("galleon", 330, 270)):
        img, g = sprites[sid]
        place(mid, tint(img, g, ABYSS[4], 0.58), x, y)
    layers["2_mid_ruins"] = mid
    near = np.zeros((H, W, 4), np.uint8)
    picks = ["kelp_tall", "kelp_mid", "coral_branch_pink", "moss_clump_teal", "kelp_short", "tube_sponge", "coral_brain",
             "moss_clump_violet", "anemone", "kelp_tall", "sea_fan", "moss_clump_amber", "kelp_mid", "seagrass"]
    x = 0
    for i, sid in enumerate(picks):
        img, g = sprites[sid]
        place(near, tint(img, g, ABYSS[3], 0.25), x, 270 - int(rng.integers(0, 6)))
        x += img.shape[1] + int(rng.integers(6, 22))
    # a band of rock along the bottom
    ys, xs = np.mgrid[0:H, 0:W]
    ridge = 258 + 6 * np.sin(xs * TAU / W * 3) + 3 * np.sin(xs * TAU / W * 7)
    rock = ys > ridge
    near[rock & (near[..., 3] == 0)] = hx(ROCK[2])
    near[(np.abs(ys - ridge) < 1) & rock] = hx(ROCK[4])
    layers["3_near_reef"] = near
    front = np.zeros((H, W, 4), np.uint8)
    dark = hx("#03050c")
    for k in range(9):
        cx = int(k * W / 9 + rng.integers(0, 30))
        hgt = int(rng.integers(40, 120))
        for y in range(hgt):
            sway = int(3 * math.sin(y * 0.12 + k))
            w = max(1, int(3 * (1 - y / hgt)) + 1)
            for dx in range(-w, w + 1):
                front[(H - 1 - y), (cx + sway + dx) % W] = dark
        if k % 3 == 0:
            for y in range(hgt // 2, hgt, 7):
                for dx in range(1, 7):
                    front[(H - 1 - y + dx // 2), (cx + int(3 * math.sin(y * 0.12 + k)) + dx) % W] = dark
    froc = ys > 262 + 5 * np.sin(xs * TAU / W * 2 + 1)
    front[froc] = dark
    layers["4_front"] = front
    out = {}
    for name, img in layers.items():
        save(os.path.join(root, f"2.5d/parallax/{name}.png"), img)
        out[name] = f"2.5d/parallax/{name}.png"
    # animated overlays: rays, marine snow, bubbles (8 frames each)
    rays, snow, bub = [], [], []
    pts = rng.random((260, 3))
    bpts = rng.random((40, 3))
    for f in range(8):
        w = TAU * f / 8
        r = np.zeros((H, W, 4), np.uint8)
        for k, (cx, w0) in enumerate(((60, 26), (150, 16), (260, 34), (360, 20), (440, 14))):
            amp = 0.5 + 0.5 * math.sin(w + k * 1.3)
            mask = (np.abs(xs - cx - (H - ys) * 0.33 - 6 * math.sin(w + k)) < w0) & (BAYER4[ys % 4, xs % 4] < 0.13 * amp * (1 - ys / H) ** 0.8)
            r[mask] = hx(GLOWS["teal"][3]) if k % 2 else hx(GLOWS["azure"][4])
        rays.append(r)
        s = np.zeros((H, W, 4), np.uint8)
        for (px, py, ph) in pts:
            x = int(px * W + 4 * math.sin(w + ph * TAU)) % W
            y = int(py * H + 2.5 * math.sin(w + ph * TAU)) % H                 # hangs and sways (seamless loop)
            s[y, x] = hx(SAND[5] if ph > 0.3 else GLOWS["teal"][4])
        snow.append(s)
        b = np.zeros((H, W, 4), np.uint8)
        for (px, py, ph) in bpts:
            x = int(px * W + 3 * math.sin(w * 2 + ph * TAU)) % W
            y = int(py * H - f * (H / 8)) % H
            b[y, x] = hx("#c8eef0"); b[(y + 1) % H, x] = hx("#4e95ae")
            if ph > 0.6:
                b[y, (x + 1) % W] = hx("#86c3d0")
        bub.append(b)
    for name, frames in (("rays", rays), ("snow", snow), ("bubbles", bub)):
        save(os.path.join(root, f"2.5d/parallax/anim_{name}.png"), np.concatenate(frames, 1))
        out[f"anim_{name}"] = f"2.5d/parallax/anim_{name}.png"
    return out
