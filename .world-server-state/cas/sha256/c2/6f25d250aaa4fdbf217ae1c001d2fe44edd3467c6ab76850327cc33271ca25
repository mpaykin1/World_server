#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def run(cmd):
    p=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True); return {'cmd':' '.join(cmd),'pass':p.returncode==0,'stdout':p.stdout[-2500:],'stderr':p.stderr[-1500:]}
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--quality',default='production'); ap.add_argument('--heavy-bakes',default='local-cpu-incremental'); a=ap.parse_args(); steps=[]
    steps.append(run([sys.executable,'tools/prepare_world_v9.py','--quality',a.quality,'--heavy-bakes',a.heavy_bakes]))
    steps += [
      run([sys.executable,'tools/dependency_graph_v10.py','--out','quality/reports/dependency-graph-v10.json']),
      run([sys.executable,'tools/replay_farm.py','--out','quality/reports/replay-farm-v10.json']),
      run([sys.executable,'tools/cpu_flamegraph.py','--out','quality/reports/cpu-flamegraph-v10.json']),
      run([sys.executable,'tools/v10_cpu_quality_gate.py'])]
    out={'schemaVersion':1,'runtime':'WORLD_FACTORY_QUALITY_CORE_V10','pass':all(x['pass'] for x in steps),'serverGpuRequired':False,'heavyBakes':a.heavy_bakes,'steps':steps,'sourceAssetsModified':False}
    (ROOT/'quality/reports/v10-preparation.json').write_text(json.dumps(out,indent=2)+'\n'); print(json.dumps(out,indent=2)); return 0 if out['pass'] else 2
if __name__=='__main__': raise SystemExit(main())
