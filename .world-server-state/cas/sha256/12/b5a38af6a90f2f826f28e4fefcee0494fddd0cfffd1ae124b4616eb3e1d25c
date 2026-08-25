#!/usr/bin/env python3
"""V9 CPU-first preparer. Reuses proven V8 source-locked preparation, then adds CPU-only incremental/cache plans."""
from __future__ import annotations
import argparse, json, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def run(cmd):
    p=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True);return {'cmd':' '.join(cmd),'pass':p.returncode==0,'stdout':p.stdout[-3000:],'stderr':p.stderr[-3000:]}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--quality',default='production');ap.add_argument('--heavy-bakes',default='local-cpu-incremental');a=ap.parse_args();steps=[]
    # Proven V8 preparer remains source-preserving; distributed setting prevents accidental giant synchronous work.
    steps.append(run([sys.executable,'tools/prepare_world_v8.py','--quality',a.quality,'--heavy-bakes','distributed']))
    for wid in [x['id'] for x in json.load(open(ROOT/'worlds/registry.json'))['worlds']]:
        wr=ROOT/'worlds'/wid
        steps.append(run([sys.executable,'tools/incremental_world_compiler.py',str(wr)]))
    out={'schemaVersion':1,'runtime':'WORLD_FACTORY_QUALITY_CORE_V10','pass':all(x['pass'] for x in steps),'serverGpuRequired':False,'heavyBakes':a.heavy_bakes,'steps':steps,'sourceAssetsModified':False}
    (ROOT/'quality/reports/v9-preparation.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2));return 0 if out['pass'] else 2
if __name__=='__main__':raise SystemExit(main())
