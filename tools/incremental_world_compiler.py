#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, time
from pathlib import Path

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(1<<20),b''):h.update(b)
    return h.hexdigest()
def build_plan(root:Path, previous:dict|None=None):
    previous=previous or {};old=previous.get('files',{});cur={};changed=[];removed=[]
    for p in sorted(root.rglob('*')):
        if p.is_file() and '/generated/' not in p.as_posix() and '.quality-cache' not in p.as_posix():
            rel=p.relative_to(root).as_posix();s=sha(p);cur[rel]=s
            if old.get(rel)!=s:changed.append(rel)
    for rel in old:
        if rel not in cur:removed.append(rel)
    affected=set()
    for rel in changed+removed:
        low=rel.lower()
        if low.endswith(('.ply','.glb','.spz')):affected|={'collision','nav','pvs','lighting','streaming','meshlets','semantic'}
        elif low.endswith(('.png','.jpg','.jpeg','.webp','.ktx2')):affected|={'materials','texture-residency','visual-regression'}
        elif low.endswith('.json'):affected|={'metadata','nav','pvs'}
    if not changed and not removed:affected=set()
    return {'schemaVersion':1,'mode':'content-hash-incremental-world-compiler-v1','files':cur,'changed':changed,'removed':removed,'affectedSystems':sorted(affected),'fullRebuild':False,'sourceAssetsModified':False,'generatedAt':time.time()}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('root',nargs='?',default='.');ap.add_argument('--state',default='.quality-cache/incremental-state.json');a=ap.parse_args();root=Path(a.root).resolve();state=root/a.state;old=json.load(open(state,encoding='utf-8')) if state.exists() else {};plan=build_plan(root,old);state.parent.mkdir(parents=True,exist_ok=True);state.write_text(json.dumps(plan,indent=2)+'\n');print(json.dumps(plan,indent=2));return 0
if __name__=='__main__':raise SystemExit(main())
