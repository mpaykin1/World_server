"""Binary glTF 2.0 (.glb) writer for voxel rigs: one node per part (pivot = node origin), greedy-meshed
geometry, a palette texture (+ emissive palette for glowing voxels, KHR_materials_emissive_strength so
bloom picks it up) and world-aligned tile textures, NEAREST filtering for crisp pixels, and the rig's
procedural clips baked into looping animations (rotation / translation / scale, linear keys)."""
import io
import json
import math
import struct

import numpy as np
from PIL import Image

import mats
from mesher import Palette, mesh_part, SCALE
from vox import rot_matrix

NEAREST, REPEAT, CLAMP = 9728, 10497, 33071


def quat(R):
    m = R
    tr = m[0, 0] + m[1, 1] + m[2, 2]
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        w, x, y, z = 0.25 * s, (m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        w, x, y, z = (m[2, 1] - m[1, 2]) / s, 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        w, x, y, z = (m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s
    else:
        s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        w, x, y, z = (m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s
    q = np.array([x, y, z, w])
    return q / np.linalg.norm(q)


class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.accs = [], []
        self.doc = dict(asset=dict(version="2.0", generator="sunken-city-pack"), scenes=[dict(nodes=[])], scene=0,
                        nodes=[], meshes=[], materials=[], textures=[], images=[], samplers=[], buffers=[], bufferViews=[],
                        accessors=[], animations=[])

    def _view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin += data
        v = dict(buffer=0, byteOffset=off, byteLength=len(data))
        if target:
            v["target"] = target
        self.doc["bufferViews"].append(v)
        return len(self.doc["bufferViews"]) - 1

    def acc(self, arr, kind, comp, target=None, minmax=False):
        arr = np.ascontiguousarray(arr)
        view = self._view(arr.tobytes(), target)
        a = dict(bufferView=view, componentType=comp, count=int(arr.shape[0]), type=kind)
        if minmax:
            a["min"] = [float(v) for v in np.atleast_1d(arr.min(0))]
            a["max"] = [float(v) for v in np.atleast_1d(arr.max(0))]
        self.doc["accessors"].append(a)
        return len(self.doc["accessors"]) - 1

    def image(self, rgba, wrap=CLAMP):
        b = io.BytesIO()
        Image.fromarray(rgba).save(b, "PNG", optimize=True)
        view = self._view(b.getvalue())
        self.doc["images"].append(dict(bufferView=view, mimeType="image/png"))
        self.doc["samplers"].append(dict(magFilter=NEAREST, minFilter=NEAREST, wrapS=wrap, wrapT=wrap))
        self.doc["textures"].append(dict(sampler=len(self.doc["samplers"]) - 1, source=len(self.doc["images"]) - 1))
        return len(self.doc["textures"]) - 1

    def material(self, name, tex, etex=None, strength=0.0, alpha=1.0, rough=0.86, metal=0.0):
        m = dict(name=name, pbrMetallicRoughness=dict(baseColorTexture=dict(index=tex), metallicFactor=metal, roughnessFactor=rough))
        if alpha < 1.0:
            m["alphaMode"] = "BLEND"
            m["pbrMetallicRoughness"]["baseColorFactor"] = [1, 1, 1, alpha]
            m["doubleSided"] = True
        if etex is not None and strength > 0:
            m["emissiveTexture"] = dict(index=etex)
            m["emissiveFactor"] = [1.0, 1.0, 1.0]
            m["extensions"] = dict(KHR_materials_emissive_strength=dict(emissiveStrength=strength))
        self.doc["materials"].append(m)
        return len(self.doc["materials"]) - 1

    def bytes(self):
        d = self.doc
        for k in ("animations", "textures", "images", "samplers", "materials"):
            if not d[k]:
                d.pop(k)
        if any("extensions" in m for m in d.get("materials", [])):
            d["extensionsUsed"] = ["KHR_materials_emissive_strength"]
        while len(self.bin) % 4:
            self.bin.append(0)
        d["buffers"] = [dict(byteLength=len(self.bin))]
        js = json.dumps(d, separators=(",", ":")).encode()
        while len(js) % 4:
            js += b" "
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        out = struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
        out += struct.pack("<II", len(self.bin), 0x004E4942) + bytes(self.bin)
        return out


def export_glb(model, path=None, center_mode="bottom"):
    g = GLB()
    pal = Palette()
    part_groups = [mesh_part(p, pal, p.pivot) for p in model.parts]
    # materials: palette (opaque + glass) and every tile texture used
    base_img, emi_img = pal.images()
    mat_ids = {}
    any_glow_pal = any(e[1] != (0, 0, 0) for e in pal.entries)
    if pal.entries:
        t = g.image(base_img)
        te = g.image(emi_img) if any_glow_pal else None
        mat_ids["pal"] = g.material("voxel", t, te, 2.6 if any_glow_pal else 0.0)
        glass_alpha = [e[2] for e in pal.entries if e[2] < 1.0]
        if glass_alpha:
            mat_ids["glass"] = g.material("voxel_glass", t, te, 2.0 if any_glow_pal else 0.0, alpha=min(glass_alpha))
    tiles_used = sorted({k[1] for gr in part_groups for k in gr if isinstance(k, tuple)})
    for tn in tiles_used:
        T = mats.TILES[tn]
        t = g.image(T["rgba"], REPEAT)
        te = None
        if T["glow"] is not None:
            e = T["glow"].copy()
            e[..., 3] = 255
            te = g.image(e, REPEAT)
        mat_ids[("tile", tn)] = g.material(tn, t, te, 2.4 if te is not None else 0.0)
    # meshes + nodes
    lo, hi = model.bounds_rest()
    root_t = [-(lo[0] + hi[0]) / 2 * SCALE, -lo[1] * SCALE if center_mode == "bottom" else -(lo[1] + hi[1]) / 2 * SCALE, -(lo[2] + hi[2]) / 2 * SCALE]
    root = dict(name=model.id, translation=root_t, children=[])
    if any(model.tilt):
        root["rotation"] = quat(rot_matrix(*model.tilt)).tolist()
    g.doc["nodes"].append(root)
    node_of = {}
    for p, groups in zip(model.parts, part_groups):
        prims = []
        for key, G in groups.items():
            if not G["idx"]:
                continue
            pos = np.array(G["pos"], np.float32)
            # no NORMAL: glTF viewers must then shade flat — exactly the voxel look, and a quarter smaller
            small = len(pos) < 65536
            idx = np.array(G["idx"], np.uint16 if small else np.uint32)
            prim = dict(attributes=dict(POSITION=g.acc(pos, "VEC3", 5126, 34962, True),
                                        TEXCOORD_0=g.acc(np.array(G["uv"], np.float32), "VEC2", 5126, 34962)),
                        indices=g.acc(idx, "SCALAR", 5123 if small else 5125, 34963), material=mat_ids[key])
            prims.append(prim)
        node = dict(name=p.name)
        par = p.parent
        tr = (p.origin + p.pivot - (par.pivot if par is not None else 0)) * SCALE
        node["translation"] = [float(v) for v in tr]
        if prims:
            g.doc["meshes"].append(dict(name=f"{model.id}_{p.name}", primitives=prims))
            node["mesh"] = len(g.doc["meshes"]) - 1
        g.doc["nodes"].append(node)
        ni = len(g.doc["nodes"]) - 1
        node_of[id(p)] = ni
        if par is None:
            root["children"].append(ni)
        else:
            g.doc["nodes"][node_of[id(par)]].setdefault("children", []).append(ni)
    g.doc["scenes"][0]["nodes"] = [0]
    # animations: sample the procedural clips
    for cname, C in model.clips.items():
        dur = C["frames"] / C["fps"]
        K = max(24, C["frames"] * 3)
        times = np.linspace(0, dur, K + 1).astype(np.float32)
        tin = g.acc(times, "SCALAR", 5126, None, True)
        samplers, channels = [], []
        for p in model.parts:
            f = p.anim.get(cname)
            if not f:
                continue
            par = p.parent
            rest = (p.origin + p.pivot - (par.pivot if par is not None else 0))
            R, T, S = [], [], []
            prev = None
            for k in range(K + 1):
                st = f((k % K) / K)
                q = quat(rot_matrix(*st.get("r", (0, 0, 0))))
                if prev is not None and np.dot(q, prev) < 0:
                    q = -q
                prev = q
                R.append(q)
                T.append((rest + np.array(st.get("t", (0, 0, 0)), float)) * SCALE)
                s = st.get("s", 1.0)
                S.append(s if isinstance(s, (tuple, list)) else (s, s, s))
            for tpath, arr, typ in (("rotation", R, "VEC4"), ("translation", T, "VEC3"), ("scale", S, "VEC3")):
                arr = np.array(arr, np.float32)
                if np.ptp(arr, axis=0).max() < 1e-5:
                    continue
                out = g.acc(arr, typ, 5126)
                samplers.append(dict(input=tin, output=out, interpolation="LINEAR"))
                channels.append(dict(sampler=len(samplers) - 1, target=dict(node=node_of[id(p)], path=tpath)))
        if channels:
            g.doc["animations"].append(dict(name=cname, samplers=samplers, channels=channels))
    data = g.bytes()
    if path:
        import os
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(data)
    return data
