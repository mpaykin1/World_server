#!/usr/bin/env python3
import json, struct, sys
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'apps'/'hunyuan-godot'/'assets'/'visual_full_quality.glb'
with p.open('rb') as f:
    magic,version,total=struct.unpack('<4sII',f.read(12))
    assert magic==b'glTF' and version==2, 'not GLB2'
    doc=None
    while f.tell()<total:
        n,t=struct.unpack('<II',f.read(8)); data=f.read(n)
        if t==0x4E4F534A:
            doc=json.loads(data.decode('utf-8').rstrip('\x00 \r\n\t'));break
assert doc is not None, 'GLB JSON missing'
triangles=0; vertices=0
for mesh in doc.get('meshes',[]):
    for prim in mesh.get('primitives',[]):
        idx=prim.get('indices'); pos=prim.get('attributes',{}).get('POSITION')
        assert idx is not None and pos is not None
        triangles += doc['accessors'][idx]['count']//3
        vertices += doc['accessors'][pos]['count']
assert triangles==1_313_748, f'FULL QUALITY REGRESSION: triangles={triangles}'
assert vertices==686_093, f'FULL QUALITY REGRESSION: vertices={vertices}'
assert p.stat().st_size>30_000_000, f'FULL QUALITY REGRESSION: file too small {p.stat().st_size}'
print(f'[FULL_QUALITY_GUARD] PASS vertices={vertices} triangles={triangles} bytes={p.stat().st_size}')
