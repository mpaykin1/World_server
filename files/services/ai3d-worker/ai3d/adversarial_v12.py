from __future__ import annotations

import json
import math
import struct
from typing import Any


def inspect_glb_bytes_v12(data: bytes) -> dict:
    out = {"valid": False, "failures": []}
    if len(data) < 12:
        out["failures"].append("truncated_glb"); return out
    if data[:4] != b"glTF":
        out["failures"].append("bad_magic"); return out
    try:
        _, version, total_len = struct.unpack("<4sII", data[:12])
    except struct.error:
        out["failures"].append("truncated_glb"); return out
    if version != 2:
        out["failures"].append("unsupported_version")
    if total_len != len(data):
        out["failures"].append("length_mismatch")
    offset = 12
    if offset + 8 > len(data):
        out["failures"].append("missing_json_chunk"); return out
    json_len, json_type = struct.unpack("<II", data[offset:offset+8])
    if json_type != 0x4E4F534A or offset + 8 + json_len > len(data):
        out["failures"].append("missing_json_chunk"); return out
    try:
        gltf = json.loads(data[offset+8:offset+8+json_len])
    except Exception:
        out["failures"].append("invalid_json_chunk"); return out
    offset += 8 + json_len
    if offset + 8 > len(data):
        out["failures"].append("missing_bin_chunk"); return out
    bin_len, bin_type = struct.unpack("<II", data[offset:offset+8])
    if bin_type != 0x004E4942 or offset + 8 + bin_len > len(data):
        out["failures"].append("missing_bin_chunk"); return out
    bin_data = data[offset+8:offset+8+bin_len]

    accessors = gltf.get("accessors") or []
    views = gltf.get("bufferViews") or []
    if len(accessors) < 2 or len(views) < 2:
        out["failures"].append("missing_geometry_accessors"); return out
    try:
        pa = accessors[0]; pv = views[pa["bufferView"]]
        pos_off = int(pv.get("byteOffset", 0)) + int(pa.get("byteOffset", 0))
        count = int(pa.get("count", 0))
        verts = [struct.unpack_from("<3f", bin_data, pos_off + i*12) for i in range(count)]
        if any(not all(math.isfinite(x) for x in v) for v in verts):
            out["failures"].append("nan_vertex")
        ia = accessors[1]; iv = views[ia["bufferView"]]
        idx_off = int(iv.get("byteOffset", 0)) + int(ia.get("byteOffset", 0))
        icount = int(ia.get("count", 0)); comp = int(ia.get("componentType", 5125))
        fmt, size = ("<I",4) if comp == 5125 else (("<H",2) if comp == 5123 else ("<B",1))
        idx = [struct.unpack_from(fmt, bin_data, idx_off+i*size)[0] for i in range(icount)]
        if any(i >= count for i in idx): out["failures"].append("index_oob")
        deg = 0
        for j in range(0, len(idx)-2, 3):
            a,b,c = idx[j:j+3]
            if a >= count or b >= count or c >= count: continue
            va,vb,vc = verts[a],verts[b],verts[c]
            ab=(vb[0]-va[0],vb[1]-va[1],vb[2]-va[2]); ac=(vc[0]-va[0],vc[1]-va[1],vc[2]-va[2])
            cr=(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])
            if cr[0]*cr[0]+cr[1]*cr[1]+cr[2]*cr[2] < 1e-14: deg += 1
        if len(idx) >= 3 and deg > max(0, (len(idx)//3)//10): out["failures"].append("degenerate_mesh")
    except Exception:
        out["failures"].append("geometry_parse_failure")

    for mat in gltf.get("materials") or []:
        pbr = mat.get("pbrMetallicRoughness") or {}
        nums = []
        nums.extend(pbr.get("baseColorFactor") or [])
        nums.extend([pbr.get("metallicFactor", 0.0), pbr.get("roughnessFactor", 1.0)])
        if any(not isinstance(x,(int,float)) or not math.isfinite(float(x)) for x in nums):
            out["failures"].append("invalid_material_numeric"); break
    for skin in gltf.get("skins") or []:
        if not isinstance(skin.get("joints"), list) or not skin.get("joints"):
            out["failures"].append("invalid_rig_weights"); break
    for anim in gltf.get("animations") or []:
        if bool(anim.get("extras", {}).get("containsNaN")):
            out["failures"].append("animation_nan"); break
    out["failures"] = sorted(set(out["failures"]))
    out["valid"] = not out["failures"]
    return out


def build_minimal_glb_v12(*, bad: str | None = None) -> bytes:
    verts = [(0.0,0.0,0.0),(1.0,0.0,0.0),(0.0,1.0,0.0),(0.0,0.0,1.0)]
    if bad == "nan_vertex": verts[1] = (float("nan"),0.0,0.0)
    indices = [0,1,2, 0,2,3, 0,3,1, 1,3,2]
    if bad == "index_oob": indices[2] = 99
    if bad == "degenerate_mesh": indices = [0,0,0]*12
    pos = b"".join(struct.pack("<3f", *v) for v in verts)
    idx = b"".join(struct.pack("<I", i) for i in indices)
    bin_data = pos + idx
    gltf: dict[str, Any] = {
        "asset":{"version":"2.0","generator":"V12 adversarial fixture"},
        "buffers":[{"byteLength":len(bin_data)}],
        "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":len(pos)},{"buffer":0,"byteOffset":len(pos),"byteLength":len(idx)}],
        "accessors":[
            {"bufferView":0,"componentType":5126,"count":len(verts),"type":"VEC3"},
            {"bufferView":1,"componentType":5125,"count":len(indices),"type":"SCALAR"},
        ],
        "meshes":[{"primitives":[{"attributes":{"POSITION":0},"indices":1}]}],
        "nodes":[{"mesh":0}],"scenes":[{"nodes":[0]}],"scene":0,
        "materials":[{"pbrMetallicRoughness":{"baseColorFactor":[1.0,1.0,1.0,1.0],"metallicFactor":0.0,"roughnessFactor":1.0}}],
    }
    if bad == "invalid_material_numeric": gltf["materials"][0]["pbrMetallicRoughness"]["roughnessFactor"] = float("nan")
    if bad == "invalid_rig_weights": gltf["skins"] = [{"joints":[]}]
    if bad == "animation_nan": gltf["animations"] = [{"samplers":[],"channels":[],"extras":{"containsNaN":True}}]
    raw = json.dumps(gltf,separators=(",",":"),allow_nan=True).encode("utf-8")
    raw += b" " * ((4 - len(raw)%4)%4)
    bin_data += b"\x00" * ((4 - len(bin_data)%4)%4)
    body = struct.pack("<II",len(raw),0x4E4F534A)+raw+struct.pack("<II",len(bin_data),0x004E4942)+bin_data
    data = struct.pack("<4sII",b"glTF",2,12+len(body))+body
    if bad == "bad_magic": data = b"BAD!" + data[4:]
    elif bad == "truncated_glb": data = data[:10]
    elif bad == "length_mismatch": data = data[:8] + struct.pack("<I",len(data)+16) + data[12:]
    elif bad == "missing_bin_chunk": data = data[:12+8+len(raw)]; data = data[:8] + struct.pack("<I",len(data)) + data[12:]
    return data
