"""Wavefront .obj + .mtl export of the rest pose (same greedy mesh as the .glb): a palette texture per model,
shared tile textures, map_Ke for glowing parts. For engines and tools that do not read glTF."""
import os

import numpy as np
from PIL import Image

import mats
from mesher import Palette, mesh_part, SCALE


def write_obj(model, folder, tex_folder="textures"):
    os.makedirs(os.path.join(folder, tex_folder), exist_ok=True)
    pal = Palette()
    poses = model.pose()
    lo, hi = model.bounds_rest()
    off = np.array([-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2]) * SCALE
    groups = {}
    for p in model.parts:
        M = poses[id(p)]
        for key, G in mesh_part(p, pal, np.zeros(3)).items():
            if not G["idx"]:
                continue
            pos = np.array(G["pos"]) / SCALE
            w = (pos @ M[:3, :3].T + M[:3, 3]) * SCALE + off
            n = np.array(G["nrm"]) @ M[:3, :3].T
            dst = groups.setdefault(key, dict(pos=[], nrm=[], uv=[], idx=[]))
            base = len(dst["pos"])
            dst["pos"] += w.tolist()
            dst["nrm"] += n.tolist()
            dst["uv"] += G["uv"]
            dst["idx"] += [base + i for i in G["idx"]]
    mid = model.id
    lines = [f"# {model.name} — «Затонувший город»", f"mtllib {mid}.mtl"]
    mtl = []
    vo = 0
    if pal.entries:
        base, emi = pal.images()
        Image.fromarray(base).save(os.path.join(folder, f"{mid}_palette.png"))
        has_glow = any(e[1] != (0, 0, 0) for e in pal.entries)
        if has_glow:
            Image.fromarray(emi).save(os.path.join(folder, f"{mid}_palette_e.png"))
        for nm in ("pal", "glass"):
            if nm in groups:
                mtl += [f"newmtl {mid}_{nm}", "Kd 1 1 1", f"map_Kd {mid}_palette.png", "Ns 10"]
                if nm == "glass":
                    mtl.append("d 0.5")
                if has_glow:
                    mtl += ["Ke 1 1 1", f"map_Ke {mid}_palette_e.png"]
    for key in groups:
        if isinstance(key, tuple):
            tn = key[1]
            T = mats.TILES[tn]
            Image.fromarray(T["rgba"]).save(os.path.join(folder, tex_folder, f"{tn}.png"))
            mtl += [f"newmtl {tn}", "Kd 1 1 1", f"map_Kd {tex_folder}/{tn}.png", "Ns 10"]
            if T["glow"] is not None:
                e = T["glow"].copy()
                e[..., 3] = 255
                Image.fromarray(e).save(os.path.join(folder, tex_folder, f"{tn}_glow.png"))
                mtl += ["Ke 1 1 1", f"map_Ke {tex_folder}/{tn}_glow.png"]
    for key, G in groups.items():
        name = key[1] if isinstance(key, tuple) else f"{mid}_{key}"
        lines.append(f"o {name}")
        lines.append(f"usemtl {name}")
        lines += [f"v {x:.5f} {y:.5f} {z:.5f}" for x, y, z in G["pos"]]
        lines += [f"vt {u:.5f} {1 - v:.5f}" for u, v in G["uv"]]
        lines += [f"vn {x:.3f} {y:.3f} {z:.3f}" for x, y, z in G["nrm"]]
        idx = np.array(G["idx"]).reshape(-1, 3) + vo + 1
        lines += [f"f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c}" for a, b, c in idx]
        vo += len(G["pos"])
    with open(os.path.join(folder, f"{mid}.obj"), "w") as fh:
        fh.write("\n".join(lines) + "\n")
    with open(os.path.join(folder, f"{mid}.mtl"), "w") as fh:
        fh.write("\n".join(mtl) + "\n")
