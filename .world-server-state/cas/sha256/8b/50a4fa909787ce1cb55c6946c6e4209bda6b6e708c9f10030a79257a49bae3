#!/usr/bin/env python3
"""Select representative canaries: complexity/device/runtime diversity instead of first-N only."""
from __future__ import annotations
import argparse, json
from pathlib import Path
from quality_common import ROOT, QUALITY, read_json, write_json
from propagate_to_consumers import discover

def score(marker:Path):
 d=read_json(marker,{});meta=d.get('qualityCanary',{});return (int(meta.get('criticality',1))*4+int(meta.get('worldComplexity',1))*3+int(meta.get('mobileTraffic',1))*2+int(meta.get('webgpuTraffic',0)),str(d.get('project',marker.parent.name)))
def choose(consumers,n=3):
 def cscore(x):
  meta=x.get('metadata',x.get('qualityCanary',{}));return (int(meta.get('criticality',1))*4+int(meta.get('worldComplexity',1))*3+float(meta.get('mobileTraffic',0))*2+float(meta.get('webgpuTraffic',0)),str(x.get('name') or x.get('project','')))
 ranked=sorted(consumers,key=cscore,reverse=True);chosen=[];seen=set()
 for x in ranked:
  meta=x.get('metadata',x.get('qualityCanary',{}));family=meta.get('family',x.get('name') or x.get('project'))
  if family in seen and len(chosen)<min(n,max(0,len(ranked)-1)):continue
  chosen.append(x);seen.add(family)
  if len(chosen)>=n:break
 for x in ranked:
  if len(chosen)>=n:break
  if x not in chosen:chosen.append(x)
 return chosen

def select(repo:Path,n=3):
 ms=discover(repo);rank=sorted(ms,key=score,reverse=True);chosen=[];seen=set()
 for m in rank:
  d=read_json(m,{});family=d.get('qualityCanary',{}).get('family',m.parent.name)
  if family in seen and len(chosen)<min(n,len(rank)-1):continue
  chosen.append(m);seen.add(family)
  if len(chosen)>=n:break
 for m in rank:
  if len(chosen)>=n:break
  if m not in chosen:chosen.append(m)
 return chosen

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--repo',type=Path,default=ROOT.parent);ap.add_argument('--count',type=int,default=3);a=ap.parse_args();c=select(a.repo.resolve(),a.count);o={'schemaVersion':1,'mode':'representative-cross-project-canary-v1','selected':[str(x) for x in c]};write_json(QUALITY/'reports/canary-selection.json',o);print(json.dumps(o,ensure_ascii=False,indent=2));return 0
if __name__=='__main__':raise SystemExit(main())
