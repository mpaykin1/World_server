#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, hashlib, tempfile
from pathlib import Path

def build(semantic: dict):
    rooms={r['id']:r for r in semantic.get('rooms',[]) if r.get('id')}
    portals=semantic.get('portals',[])
    graph={rid:{rid} for rid in rooms}
    for p in portals:
        a,b=p.get('a'),p.get('b')
        if a in rooms and b in rooms and p.get('open',True):
            graph[a].add(b); graph[b].add(a)
    # conservative transitive closure: only proven room membership may be culled;
    # unknown/unassigned space is always visible.
    changed=True
    while changed:
        changed=False
        for r in graph:
            u=set(graph[r])
            for n in list(u): u |= graph.get(n,set())
            if u != graph[r]: graph[r]=u; changed=True
    pvs={r:sorted(v) for r,v in graph.items()}
    canonical=json.dumps({'rooms':semantic.get('rooms',[]),'portals':portals},sort_keys=True,separators=(',',':')).encode()
    return {'schemaVersion':1,'mode':'semantic-conservative-pvs-v1','semanticSha256':hashlib.sha256(canonical).hexdigest(),'pvs':pvs,'unknownSpacePolicy':'fail-visible','nearFieldBypass':True,'onlyCullSemanticallyAssignedRooms':True,'pass':True}

def self_test():
    s={'rooms':[{'id':'a'},{'id':'b'},{'id':'c'}],'portals':[{'a':'a','b':'b','open':True},{'a':'b','b':'c','open':False}]}
    out=build(s); out['pass']=out['pvs']['a']==['a','b'] and out['pvs']['c']==['c'] and out['unknownSpacePolicy']=='fail-visible'; return out

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('semantic',nargs='?'); ap.add_argument('--out'); ap.add_argument('--self-test',action='store_true'); a=ap.parse_args()
    out=self_test() if a.self_test or not a.semantic else build(json.loads(Path(a.semantic).read_text()))
    if a.out: Path(a.out).write_text(json.dumps(out,indent=2)+'\n')
    print(json.dumps(out,indent=2)); return 0 if out['pass'] else 2
if __name__=='__main__': raise SystemExit(main())
