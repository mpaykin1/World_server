#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
from quality_common import ROOT,QUALITY,read_json,write_json
from propagate_to_consumers import discover,pack_hash,runtime_hash

def audit(repo:Path):
 ph,rh=pack_hash(),runtime_hash();rows=[];bad=[]
 for m in discover(repo):
  cfg=read_json(m,{});lock=read_json(m.parent/'.world-quality/quality-pack.lock.json',{})
  ok=lock.get('runtimeHash')==rh and lock.get('packHash')==ph and cfg.get('inheritQualityGenome') is True and lock.get('pack')=='WORLD_FACTORY_QUALITY_CORE_V10'
  r={'marker':str(m),'project':cfg.get('project'),'pass':ok,'runtime':cfg.get('runtime'),'runtimeHash':lock.get('runtimeHash'),'qualityPackHash':lock.get('packHash'),'expectedRuntimeHash':rh,'expectedQualityPackHash':ph,'lockPresent':bool(lock)};rows.append(r)
  if not ok:bad.append(r)
 return {'schemaVersion':1,'pass':not bad,'mode':'consumer-drift-audit-v1','consumers':rows,'drifted':bad}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--repo',type=Path,default=ROOT.parent);a=ap.parse_args();r=audit(a.repo.resolve());write_json(QUALITY/'reports/consumer-drift.json',r);print(json.dumps(r,ensure_ascii=False,indent=2));return 0 if r['pass'] else 1
if __name__=='__main__':raise SystemExit(main())
