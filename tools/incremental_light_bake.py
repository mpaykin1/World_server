#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, math
from pathlib import Path

def dirty_cells(changed_bounds, cell=8.0, padding=1):
    out=set()
    for b in changed_bounds:
        mn=b['min'];mx=b['max']
        for x in range(math.floor(mn[0]/cell)-padding,math.floor(mx[0]/cell)+padding+1):
          for y in range(math.floor(mn[1]/cell)-padding,math.floor(mx[1]/cell)+padding+1):
           for z in range(math.floor(mn[2]/cell)-padding,math.floor(mx[2]/cell)+padding+1):out.add((x,y,z))
    return sorted(out)
def plan(source_sha,changed_bounds):
    cells=dirty_cells(changed_bounds);return {'schemaVersion':1,'mode':'cpu-incremental-light-bake-v1','sourceSha256':source_sha,'dirtyCells':[list(x) for x in cells],'rebuildWholeWorld':False,'sourceAssetModified':False,'gpuRequired':False}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source-sha',default='0'*64);ap.add_argument('--bounds-json',default='[]');a=ap.parse_args();print(json.dumps(plan(a.source_sha,json.loads(a.bounds_json)),indent=2));return 0
if __name__=='__main__':raise SystemExit(main())
