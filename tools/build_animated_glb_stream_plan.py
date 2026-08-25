#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, struct
from pathlib import Path
from quality_common import sha256, write_json
JSON_CHUNK=0x4E4F534A; BIN_CHUNK=0x004E4942

def _parse_glb(path:Path):
    data=path.read_bytes()
    if len(data)<20 or data[:4]!=b'glTF':raise RuntimeError('not GLB')
    magic,ver,total=struct.unpack_from('<III',data,0)
    if ver!=2 or total!=len(data):raise RuntimeError('GLB header/size mismatch')
    off=12;doc=None;bin_start=None;bin_len=0
    while off+8<=len(data):
        ln,typ=struct.unpack_from('<II',data,off);payload=off+8
        if typ==JSON_CHUNK: doc=json.loads(data[payload:payload+ln].decode('utf-8').rstrip('\x00 '))
        elif typ==BIN_CHUNK: bin_start=payload;bin_len=ln
        off=payload+ln
    if doc is None or bin_start is None:raise RuntimeError('GLB JSON/BIN chunk missing')
    return data,doc,bin_start,bin_len

def _accessor_views(doc,accessor_ids):
    out=set();acc=doc.get('accessors',[])
    for a in accessor_ids:
        if isinstance(a,int) and 0<=a<len(acc) and isinstance(acc[a].get('bufferView'),int):out.add(acc[a]['bufferView'])
    return out

def _classified_views(doc):
    p0=set();p1=set();p2=set();
    for skin in doc.get('skins',[]): p0 |= _accessor_views(doc,[skin.get('inverseBindMatrices')])
    for anim in doc.get('animations',[]):
        for s in anim.get('samplers',[]): p0 |= _accessor_views(doc,[s.get('input'),s.get('output')])
    for mesh in doc.get('meshes',[]):
        for prim in mesh.get('primitives',[]):
            ids=[prim.get('indices')]+list((prim.get('attributes') or {}).values())
            for tgt in prim.get('targets',[]) or []: ids += list((tgt or {}).values())
            p1 |= _accessor_views(doc,ids)
    for im in doc.get('images',[]):
        if isinstance(im.get('bufferView'),int):p2.add(im['bufferView'])
    return p0,p1,p2

def build(path:Path,out:Path,segment_bytes=524288):
    path=Path(path);data,doc,bin_start,bin_len=_parse_glb(path);views=doc.get('bufferViews',[]);p0,p1,p2=_classified_views(doc)
    ranges=[]
    for i,v in enumerate(views):
        start=bin_start+int(v.get('byteOffset',0));end=start+int(v.get('byteLength',0))-1
        pr=0 if i in p0 else 1 if i in p1 else 2 if i in p2 else 3
        ranges.append((start,end,pr,i))
    segs=[]
    for start in range(0,len(data),segment_bytes):
        end=min(len(data),start+segment_bytes)-1;priority=4;tags=[]
        if start<bin_start:priority=0;tags.append('container-json')
        for a,b,pr,vi in ranges:
            if b<start or a>end:continue
            priority=min(priority,pr);tags.append(f'bufferView:{vi}')
        chunk=data[start:end+1];segs.append({'id':len(segs),'start':start,'end':end,'bytes':len(chunk),'priority':priority,'sha256':hashlib.sha256(chunk).hexdigest(),'tags':tags[:24]})
    if sum(x['bytes'] for x in segs)!=len(data) or segs[0]['start']!=0 or segs[-1]['end']!=len(data)-1:raise RuntimeError('range conservation failed')
    animated=bool(doc.get('animations'));skinned=bool(doc.get('skins'));morph=any(p.get('targets') for m in doc.get('meshes',[]) for p in m.get('primitives',[]))
    result={'schemaVersion':1,'mode':'byte-identical-parallel-range-glb-v1','source':path.name,'sourceSha256':sha256(path),'sourceBytes':len(data),'segmentBytes':segment_bytes,'segments':segs,'coverageBytes':sum(x['bytes'] for x in segs),'byteConservation':True,'animated':animated,'skinned':skinned,'morphTargets':morph,'sourceAssetModified':False,'renderPolicy':'assemble-byte-identical-source-before-GLTFLoader-parse','qualityPolicy':'never-split-animation-or-skin-dependencies'}
    write_json(out,result);return result

def main():
    ap=argparse.ArgumentParser();ap.add_argument('source',type=Path);ap.add_argument('out',type=Path);ap.add_argument('--segment-bytes',type=int,default=524288);a=ap.parse_args();print(json.dumps(build(a.source,a.out,a.segment_bytes),indent=2))
if __name__=='__main__':main()
