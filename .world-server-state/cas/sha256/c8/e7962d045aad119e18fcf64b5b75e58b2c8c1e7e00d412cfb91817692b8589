#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, statistics, time, gc
SAFE_CATEGORIES=('decode','streaming','physics','ai','animation','visibility','nav','background-bake','gc')
def analyze(samples):
    totals={k:sum(float(s.get(k,0)) for s in samples) for k in SAFE_CATEGORIES};n=max(1,len(samples));avg={k:round(v/n,4) for k,v in totals.items()};ordered=sorted(avg.items(),key=lambda kv:kv[1],reverse=True);frame=[sum(float(s.get(k,0)) for k in SAFE_CATEGORIES) for s in samples];return {'schemaVersion':1,'mode':'cpu-first-causality-profiler-v1','samples':len(samples),'averageMs':avg,'topBottlenecks':ordered[:4],'frameP95Ms':round(sorted(frame)[max(0,min(len(frame)-1,int(len(frame)*.95)-1))],4) if frame else 0,'qualityKnobsTouched':False,'serverGpuRequired':False}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--self-test',action='store_true');a=ap.parse_args();samples=[{'decode':2,'streaming':1,'physics':3,'ai':4,'animation':1,'visibility':1,'nav':.2,'background-bake':0,'gc':.2} for _ in range(20)];r=analyze(samples);print(json.dumps(r,indent=2));return 0 if r['topBottlenecks'][0][0]=='ai' else 2
if __name__=='__main__':raise SystemExit(main())
