#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, tempfile
from pathlib import Path

def plan(previous: dict, current_cells: list[dict]):
    old={c['id']:c for c in previous.get('cells',[])}
    reuse=[]; rebuild=[]
    for c in current_cells:
        o=old.get(c['id'])
        if o and o.get('inputHash')==c.get('inputHash') and o.get('outputSha256'):
            reuse.append({'id':c['id'],'outputSha256':o['outputSha256'],'reason':'cell-input-hash-identical'})
        else: rebuild.append({'id':c['id'],'reason':'new-or-dirty-cell'})
    return {'schemaVersion':1,'mode':'incremental-gi-cell-reuse-v1','pass':True,'reused':reuse,'rebuild':rebuild,'reuseCount':len(reuse),'rebuildCount':len(rebuild),'sourceAssetsModified':False,'reuseRequiresExactInputHash':True}

def self_test():
    old={'cells':[{'id':'0,0,0','inputHash':'a','outputSha256':'11'},{'id':'1,0,0','inputHash':'b','outputSha256':'22'}]}
    cur=[{'id':'0,0,0','inputHash':'a'},{'id':'1,0,0','inputHash':'CHANGED'},{'id':'2,0,0','inputHash':'c'}]
    out=plan(old,cur); out['pass']=out['reuseCount']==1 and out['rebuildCount']==2 and out['reused'][0]['id']=='0,0,0'; return out

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--previous'); ap.add_argument('--cells'); ap.add_argument('--out'); ap.add_argument('--self-test',action='store_true'); a=ap.parse_args()
    if a.self_test or not (a.previous and a.cells): out=self_test()
    else: out=plan(json.loads(Path(a.previous).read_text()),json.loads(Path(a.cells).read_text())['cells'])
    if a.out: Path(a.out).write_text(json.dumps(out,indent=2)+'\n')
    print(json.dumps(out,indent=2)); return 0 if out['pass'] else 2
if __name__=='__main__': raise SystemExit(main())
