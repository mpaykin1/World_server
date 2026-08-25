#!/usr/bin/env python3
from __future__ import annotations
import argparse, cProfile, io, json, pstats, tempfile
from pathlib import Path

def workload(n=50000):
    x=0
    for i in range(n): x=(x + ((i*i) ^ (i>>3))) & 0xffffffff
    return x

def capture(out_path: Path|None=None):
    pr=cProfile.Profile(); pr.enable(); checksum=workload(); pr.disable()
    st=pstats.Stats(pr).sort_stats('cumulative')
    rows=[]
    for (file,line,name),(cc,nc,tt,ct,callers) in sorted(st.stats.items(), key=lambda kv: kv[1][3], reverse=True)[:50]:
        rows.append({'function':name,'file':Path(file).name,'line':line,'calls':nc,'selfSec':round(tt,9),'cumulativeSec':round(ct,9)})
    out={'schemaVersion':1,'mode':'automatic-cpu-causality-flame-profile-v1','pass':bool(rows),'checksum':checksum,'top':rows,'capturesSourceAssets':False}
    if out_path: out_path.write_text(json.dumps(out,indent=2)+'\n')
    return out

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--out'); ap.add_argument('--self-test',action='store_true'); a=ap.parse_args(); out=capture(Path(a.out) if a.out else None); print(json.dumps(out,indent=2)); return 0 if out['pass'] else 2
if __name__=='__main__': raise SystemExit(main())
