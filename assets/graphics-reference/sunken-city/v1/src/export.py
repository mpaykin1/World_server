"""Export one model into every form of the pack:
  2d/sprites        side view at rest (+ _glow mask)
  2d/anim           side view, every clip: a horizontal strip of frames
  2.5d/iso          isometric, every direction in a row (rest pose)
  2.5d/iso_anim     isometric clips: rows = directions, columns = frames
  2.5d/stack        sprite stack: top-down slices, bottom first, in a grid
  2.5d/stack_anim   sprite stacks per frame (rows = frames)
  3d/glb · 3d/vox · 3d/obj
Returns the manifest entry (sizes, frames, fps, files)."""
import math
import os

import numpy as np
from PIL import Image

import render
from gltf import export_glb
from voxelize import voxelize, frame_box, stack_slices
from voxfile import write_vox
from objfile import write_obj


def save(path, a):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(a).save(path, optimize=True)


def save_pair(root, rel, img, glow):
    save(os.path.join(root, rel + ".png"), img)
    out = {"png": rel + ".png"}
    if glow is not None and glow[..., 3].any():
        save(os.path.join(root, rel + "_glow.png"), glow)
        out["glow"] = rel + "_glow.png"
    return out


def grid(frames, cols):
    n = len(frames)
    h, w = frames[0].shape[:2]
    rows = (n + cols - 1) // cols
    out = np.zeros((rows * h, cols * w, 4), np.uint8)
    for i, f in enumerate(frames):
        r, c = divmod(i, cols)
        out[r * h:(r + 1) * h, c * w:(c + 1) * w] = f
    return out


def export_model(m, root, stacks=True, big=False):
    e = dict(id=m.id, name=m.name, cat=m.cat, desc=m.desc, tags=m.tags, voxels=m.voxel_count(), parts=len(m.parts), clips={})
    lo, hi = m.bounds_rest()
    e["size_vox"] = [int(round(v)) for v in (hi - lo)]
    # ── 2D: side view ──
    img, g, _ = render.render(m, "side")
    e["2d"] = save_pair(root, f"2d/sprites/{m.id}", img, g)
    e["2d"]["w"], e["2d"]["h"] = img.shape[1], img.shape[0]
    for c, C in m.clips.items():
        a, ga, box = render.render_set(m, "side", [0], c, C["frames"])
        fw = a.shape[1] // C["frames"]
        e["clips"][c] = dict(ru=C["ru"], frames=C["frames"], fps=C["fps"],
                             **{"2d": dict(save_pair(root, f"2d/anim/{m.id}_{c}", a, ga), w=fw, h=a.shape[0])})
    # ── 2.5D: isometric ──
    n = m.iso_dirs
    yaws = [k * math.tau / n for k in range(n)]
    a, ga, _ = render.render_set(m, "iso", yaws, None, 1)
    h = a.shape[0] // n
    row = np.concatenate([a[k * h:(k + 1) * h] for k in range(n)], 1)
    grow = np.concatenate([ga[k * h:(k + 1) * h] for k in range(n)], 1)
    e["iso"] = dict(save_pair(root, f"2.5d/iso/{m.id}", row, grow), w=row.shape[1] // n, h=h, dirs=n)
    for c, C in m.clips.items():
        a, ga, _ = render.render_set(m, "iso", yaws, c, C["frames"])
        e["clips"][c]["iso"] = dict(save_pair(root, f"2.5d/iso_anim/{m.id}_{c}", a, ga), w=a.shape[1] // C["frames"], h=a.shape[0] // n, dirs=n)
    # ── 2.5D: sprite stacks ──
    if stacks:
        occ, rgb, glow, _ = voxelize(m)
        sl, gsl = stack_slices(occ, rgb, glow)
        X, Y, Z = occ.shape
        frames = [sl[:, k * X:(k + 1) * X] for k in range(Y)]
        gframes = [gsl[:, k * X:(k + 1) * X] for k in range(Y)]
        cols = max(1, min(Y, 16, 2040 // max(1, X)))
        e["stack"] = dict(save_pair(root, f"2.5d/stack/{m.id}", grid(frames, cols), grid(gframes, cols)), w=X, h=Z, layers=Y, cols=cols)
        for c, C in m.clips.items():
            if Y > 64:
                continue
            box = frame_box(m, c, C["frames"])
            rows, grows = [], []
            for f in range(C["frames"]):
                o2, r2, g2, _ = voxelize(m, c, f / C["frames"], box)
                s2, gs2 = stack_slices(o2, r2, g2)
                rows.append(s2)
                grows.append(gs2)
            A = np.concatenate(rows, 0)
            GA = np.concatenate(grows, 0)
            sx, sy, sz = (box[1] - box[0])
            e["clips"][c]["stack"] = dict(save_pair(root, f"2.5d/stack_anim/{m.id}_{c}", A, GA), w=int(sx), h=int(sz), layers=int(sy))
    # ── 3D ──
    os.makedirs(os.path.join(root, "3d/glb"), exist_ok=True)
    data = export_glb(m, os.path.join(root, f"3d/glb/{m.id}.glb"))
    e["glb"] = dict(file=f"3d/glb/{m.id}.glb", bytes=len(data), anims=list(m.clips))
    occ, rgb, glow, _ = voxelize(m)
    if max(occ.shape) <= 256:
        os.makedirs(os.path.join(root, "3d/vox"), exist_ok=True)
        write_vox(os.path.join(root, f"3d/vox/{m.id}.vox"), occ, rgb, glow)
        e["vox"] = f"3d/vox/{m.id}.vox"
    write_obj(m, os.path.join(root, "3d/obj"))
    e["obj"] = f"3d/obj/{m.id}.obj"
    return e
