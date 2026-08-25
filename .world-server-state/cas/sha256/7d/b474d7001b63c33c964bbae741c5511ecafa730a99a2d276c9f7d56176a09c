#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def build(root=ROOT):
    nodes={}; edges=[]
    def add(path,kind):
        p=Path(path); key=str(p.relative_to(root)).replace('\\','/') if p.is_absolute() else str(p).replace('\\','/')
        nodes[key]={'id':key,'kind':kind}; return key
    # shared runtime/code -> world manifest dependency, manifest -> assets/generated companions.
    runtime_files=sorted((root/'src').glob('*.js'))
    for p in runtime_files: add(p,'code')
    reg=json.loads((root/'worlds/registry.json').read_text())
    for w in reg.get('worlds',[]):
        mp=(root/w['manifest']).resolve(); mid=add(mp,'game-manifest')
        for rp in runtime_files: edges.append({'from':add(rp,'code'),'to':mid,'kind':'runtime-affects-game'})
        m=json.loads(mp.read_text()); base=mp.parent
        v=m.get('visual',{}).get('url')
        if v:
            aid=add((base/str(v).replace('./','',1)).resolve(),'source-asset'); edges.append({'from':aid,'to':mid,'kind':'asset-used-by-game'})
        for p in (base/'generated').rglob('*') if (base/'generated').exists() else []:
            if p.is_file():
                did=add(p,'derived-bake'); edges.append({'from':did,'to':mid,'kind':'derived-used-by-game'})
                if v: edges.append({'from':aid,'to':did,'kind':'source-generates-derived'})
    canonical=json.dumps({'nodes':sorted(nodes),'edges':sorted(edges,key=lambda x:(x['from'],x['to'],x['kind']))},separators=(',',':')).encode()
    return {'schemaVersion':1,'mode':'code-asset-bake-game-dependency-graph-v1','pass':True,'nodeCount':len(nodes),'edgeCount':len(edges),'graphSha256':hashlib.sha256(canonical).hexdigest(),'nodes':list(nodes.values()),'edges':edges,'failClosedOnMissingDependency':True}

def impacted(graph, changed):
    forward={}
    for e in graph['edges']: forward.setdefault(e['from'],set()).add(e['to'])
    seen=set(changed); q=list(changed)
    while q:
        x=q.pop(0)
        for y in forward.get(x,()):
            if y not in seen: seen.add(y); q.append(y)
    return sorted(seen-set(changed))

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--out'); ap.add_argument('--self-test',action='store_true'); a=ap.parse_args(); g=build();
    if g['nodes']:
        source=next((n['id'] for n in g['nodes'] if n['kind']=='source-asset'),None); g['sampleImpact']=impacted(g,[source]) if source else []
    if a.out: Path(a.out).write_text(json.dumps(g,indent=2)+'\n')
    print(json.dumps({k:v for k,v in g.items() if k not in ('nodes','edges')},indent=2)); return 0 if g['pass'] and g['nodeCount']>0 else 2
if __name__=='__main__': raise SystemExit(main())
