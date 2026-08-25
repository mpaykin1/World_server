#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math
from pathlib import Path

def build(cells, portals=None, max_hops=4):
    ids=[str(c['id']) for c in cells]; graph={i:set([i]) for i in ids};
    for p in portals or []:
        a,b=str(p.get('a')),str(p.get('b'))
        if a in graph and b in graph and p.get('open',True): graph[a].add(b);graph[b].add(a)
    pvs={}
    for src in ids:
        seen={src};front={src}
        for _ in range(max_hops):
            nxt=set()
            for x in front:nxt.update(graph.get(x,()))
            nxt-=seen
            if not nxt:break
            seen|=nxt;front=nxt
        pvs[src]=sorted(seen)
    return {'schemaVersion':1,'mode':'cpu-precomputed-pvs-v1','cells':ids,'pvs':pvs,'failVisibleUnknown':True,'nearBypass':True,'sourceGeometryModified':False}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('input',nargs='?');ap.add_argument('--output');a=ap.parse_args()
    if a.input:d=json.load(open(a.input,encoding='utf-8'));r=build(d.get('cells',d.get('rooms',[])),d.get('portals',[]))
    else:r=build([{'id':'a'},{'id':'b'},{'id':'c'}],[{'a':'a','b':'b'}])
    if a.output:Path(a.output).write_text(json.dumps(r,indent=2)+'\n')
    print(json.dumps(r,ensure_ascii=False,indent=2));return 0
if __name__=='__main__':raise SystemExit(main())
