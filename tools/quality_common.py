#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, math, mmap, os, struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
WORLDS = ROOT / 'worlds'
REGISTRY = WORLDS / 'registry.json'
QUALITY = ROOT / 'quality'
REPORTS = QUALITY / 'reports'
KNOWLEDGE = QUALITY / 'knowledge'

PLY_TYPES = {
    'char': ('b', 1, 'i1'), 'int8': ('b', 1, 'i1'),
    'uchar': ('B', 1, 'u1'), 'uint8': ('B', 1, 'u1'),
    'short': ('h', 2, 'i2'), 'int16': ('h', 2, 'i2'),
    'ushort': ('H', 2, 'u2'), 'uint16': ('H', 2, 'u2'),
    'int': ('i', 4, 'i4'), 'int32': ('i', 4, 'i4'),
    'uint': ('I', 4, 'u4'), 'uint32': ('I', 4, 'u4'),
    'float': ('f', 4, 'f4'), 'float32': ('f', 4, 'f4'),
    'double': ('d', 8, 'f8'), 'float64': ('d', 8, 'f8'),
}


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=False) + '\n', encoding='utf-8')


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def slugify(text: str) -> str:
    import re
    s = re.sub(r'[^a-zA-Z0-9_-]+', '-', text.strip()).strip('-_').lower()
    return (s or 'world')[:64]


@dataclass
class PlyHeader:
    fmt: str
    vertex_count: int
    face_count: int
    vertex_props: list[tuple[str, str]]
    data_offset: int
    vertex_stride: int
    offsets: dict[str, int]


def parse_ply_header(path: Path) -> PlyHeader:
    with path.open('rb') as f:
        first = f.readline()
        if first.strip() != b'ply':
            raise ValueError('Not a PLY file')
        fmt = None
        vertex_count = face_count = 0
        current = None
        props: list[tuple[str, str]] = []
        offsets: dict[str, int] = {}
        stride = 0
        while True:
            line = f.readline()
            if not line:
                raise ValueError('PLY header ended unexpectedly')
            s = line.decode('ascii', 'replace').strip()
            parts = s.split()
            if not parts:
                continue
            if parts[0] == 'format':
                fmt = parts[1]
            elif parts[0] == 'element':
                current = parts[1]
                if current == 'vertex': vertex_count = int(parts[2])
                elif current == 'face': face_count = int(parts[2])
            elif parts[0] == 'property' and current == 'vertex':
                if len(parts) >= 5 and parts[1] == 'list':
                    raise ValueError('List properties on PLY vertices are unsupported')
                typ, name = parts[1], parts[2]
                if typ not in PLY_TYPES:
                    raise ValueError(f'Unsupported PLY property type: {typ}')
                props.append((name, typ))
                offsets[name] = stride
                stride += PLY_TYPES[typ][1]
            elif parts[0] == 'end_header':
                data_offset = f.tell()
                break
        if fmt is None:
            raise ValueError('PLY format missing')
        return PlyHeader(fmt, vertex_count, face_count, props, data_offset, stride, offsets)


def _axis_view(path: Path, header: PlyHeader, name: str) -> np.ndarray:
    if name not in header.offsets:
        raise ValueError(f'PLY lacks {name}')
    typ = dict(header.vertex_props)[name]
    _, size, npcode = PLY_TYPES[typ]
    if header.fmt == 'binary_little_endian': endian = '<'
    elif header.fmt == 'binary_big_endian': endian = '>'
    else: raise ValueError('Binary view requested for ASCII PLY')
    mm = np.memmap(path, dtype=np.uint8, mode='r', offset=header.data_offset,
                   shape=(header.vertex_count * header.vertex_stride,))
    dtype = np.dtype(endian + npcode)
    return np.ndarray((header.vertex_count,), dtype=dtype, buffer=mm,
                      offset=header.offsets[name], strides=(header.vertex_stride,))


def sample_ply_xyz(path: Path, max_points: int = 250_000) -> np.ndarray:
    h = parse_ply_header(path)
    if not all(k in h.offsets for k in ('x', 'y', 'z')):
        raise ValueError('PLY must contain x/y/z vertex properties')
    if h.vertex_count <= 0:
        return np.empty((0, 3), dtype=np.float32)
    step = max(1, math.ceil(h.vertex_count / max_points))
    if h.fmt.startswith('binary_'):
        x = _axis_view(path, h, 'x')[::step]
        y = _axis_view(path, h, 'y')[::step]
        z = _axis_view(path, h, 'z')[::step]
        pts = np.column_stack([x, y, z]).astype(np.float32, copy=False)
    elif h.fmt == 'ascii':
        idx = {name:i for i,(name,_) in enumerate(h.vertex_props)}
        pts_list = []
        with path.open('rb') as f:
            f.seek(h.data_offset)
            for i in range(h.vertex_count):
                line = f.readline().decode('ascii', 'replace').split()
                if i % step: continue
                pts_list.append([float(line[idx[k]]) for k in ('x','y','z')])
        pts = np.asarray(pts_list, dtype=np.float32)
    else:
        raise ValueError(f'Unsupported PLY format {h.fmt}')
    mask = np.isfinite(pts).all(axis=1)
    return pts[mask]


def ply_info(path: Path) -> dict:
    h = parse_ply_header(path)
    names = {n for n, _ in h.vertex_props}
    is_splat = {'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'rot_0'}.issubset(names)
    kind = 'ply-splat' if is_splat else 'ply-mesh'
    pts = sample_ply_xyz(path, 80_000)
    bounds = None
    if len(pts):
        mn = pts.min(axis=0).astype(float).tolist()
        mx = pts.max(axis=0).astype(float).tolist()
        bounds = {'min': mn, 'max': mx, 'extents': [mx[i]-mn[i] for i in range(3)]}
    return {
        'type': kind,
        'vertices': h.vertex_count,
        'faces': h.face_count,
        'format': h.fmt,
        'bounds': bounds,
        'properties': sorted(names),
    }


def glb_info(path: Path) -> dict:
    out = {'type': 'glb', 'triangles': None, 'bounds': None, 'materials': None, 'textures': None}
    try:
        with path.open('rb') as f:
            magic, version, length = struct.unpack('<4sII', f.read(12))
            if magic != b'glTF': return out
            chunk_len, chunk_type = struct.unpack('<II', f.read(8))
            if chunk_type != 0x4E4F534A: return out
            doc = json.loads(f.read(chunk_len).decode('utf-8').rstrip('\x00 \t\r\n'))
        accessors = doc.get('accessors', [])
        tris = 0; bounds = []
        for mesh in doc.get('meshes', []):
            for prim in mesh.get('primitives', []):
                if prim.get('mode', 4) != 4: continue
                if 'indices' in prim:
                    tris += accessors[prim['indices']].get('count', 0) // 3
                else:
                    pi = prim.get('attributes', {}).get('POSITION')
                    if pi is not None: tris += accessors[pi].get('count', 0) // 3
                pi = prim.get('attributes', {}).get('POSITION')
                if pi is not None and pi < len(accessors):
                    a = accessors[pi]
                    if 'min' in a and 'max' in a: bounds.append((a['min'], a['max']))
        out['triangles'] = tris
        out['materials'] = len(doc.get('materials', []))
        out['textures'] = len(doc.get('textures', []))
        if bounds:
            mn = [min(b[0][i] for b in bounds) for i in range(3)]
            mx = [max(b[1][i] for b in bounds) for i in range(3)]
            out['bounds'] = {'min': mn, 'max': mx, 'extents': [mx[i]-mn[i] for i in range(3)]}
    except Exception as exc:
        out['inspectWarning'] = str(exc)
    return out


def inspect_asset(path: Path) -> dict:
    ext = path.suffix.lower()
    if ext == '.ply': return ply_info(path)
    if ext == '.glb': return glb_info(path)
    if ext == '.spz': return {'type': 'spz', 'triangles': None, 'bounds': None}
    raise ValueError(f'Unsupported format: {ext}. Allowed: .glb .ply .spz')


def transform_matrix_for_axis(axis: str, scale: float = 1.0) -> np.ndarray:
    axis = axis.upper()
    # Source -> runtime Y-up. Matrices are applied to column vectors.
    if axis == 'Y': R = np.eye(3)
    elif axis == 'Z':
        # Rotate -90 deg around X: (x,y,z)->(x,z,-y)
        R = np.array([[1,0,0],[0,0,1],[0,-1,0]], dtype=float)
    elif axis == 'X':
        # Rotate +90 deg around Z: (x,y,z)->(-y,x,z)
        R = np.array([[0,-1,0],[1,0,0],[0,0,1]], dtype=float)
    else: raise ValueError(axis)
    return R * scale


def rotation_for_axis(axis: str) -> list[float]:
    return {'Y':[0,0,0], 'Z':[-90,0,0], 'X':[0,0,90]}[axis.upper()]


def infer_up_axis(info: dict, explicit: str = 'auto') -> tuple[str, float, dict]:
    if explicit.lower() != 'auto':
        return explicit.upper(), 1.0, {'method':'explicit'}
    if info.get('type') == 'glb':
        return 'Y', 1.0, {'method':'gltf-standard'}
    b = info.get('bounds')
    if not b:
        return 'Y', 0.20, {'method':'fallback-no-bounds'}
    e = np.asarray(b['extents'], dtype=float)
    if not np.isfinite(e).all() or (e <= 0).any():
        return 'Y', 0.10, {'method':'fallback-invalid-bounds'}
    order = np.argsort(e)
    smallest, second = int(order[0]), int(order[1])
    ratio = float(e[second] / max(e[smallest], 1e-9))
    # Environment scans usually have vertical extent significantly smaller than horizontal span.
    confidence = max(0.25, min(0.94, (ratio - 1.05) / 1.6 + 0.45))
    return 'XYZ'[smallest], confidence, {
        'method':'smallest-extent', 'extents': e.tolist(), 'ratio': ratio,
    }


def infer_scale(info: dict, explicit: float | None = None) -> tuple[float, float, dict]:
    if explicit is not None:
        return float(explicit), 1.0, {'method':'explicit'}
    b = info.get('bounds')
    if not b:
        return 1.0, 0.20, {'method':'fallback-no-bounds'}
    extent = float(max(b['extents']))
    if not math.isfinite(extent) or extent <= 0:
        return 1.0, 0.10, {'method':'fallback-invalid-bounds'}
    # Conservative unit inference: never rescale plausible meter-scale environments.
    if 3.0 <= extent <= 2500.0:
        return 1.0, 0.90, {'method':'plausible-meters', 'maxExtent':extent}
    candidates = [1.0, 0.1, 0.01, 0.001, 10.0, 100.0]
    scored = []
    for s in candidates:
        v = extent * s
        # Prefer 10..500 m scenes, but do not overfit.
        if 10 <= v <= 500: score = 1.0
        elif 3 <= v <= 2500: score = 0.75
        else: score = max(0.0, 1 - abs(math.log10(max(v,1e-9)/100))/4)
        scored.append((score, s, v))
    scored.sort(reverse=True)
    best, second = scored[0], scored[1]
    confidence = min(0.88, 0.45 + max(0, best[0]-second[0])*0.5)
    return float(best[1]), confidence, {'method':'extent-unit-heuristic','sourceExtent':extent,'runtimeExtent':best[2]}


def load_registry() -> dict:
    return read_json(REGISTRY, {'schemaVersion':2, 'runtime':'WORLD_FACTORY_QUALITY_CORE_V10', 'worlds':[]})


def iter_world_manifests():
    registry = load_registry()
    for entry in registry.get('worlds', []):
        p = (ROOT / entry['manifest'].replace('./','',1)).resolve()
        if p.exists():
            yield entry, p, read_json(p, {})


def append_jsonl(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a', encoding='utf-8') as f:
        f.write(json.dumps(obj, ensure_ascii=False, separators=(',',':')) + '\n')
