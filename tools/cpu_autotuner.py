#!/usr/bin/env python3
from __future__ import annotations
import argparse, itertools, json
SAFE={'decodeConcurrency','prefetchChunks','distantAiHz','distantAnimationHz','distantPhysicsHz','backgroundBakeWorkers','occlusionCacheFrames'}
FORBIDDEN={'resolution','pixelRatio','textureResolution','textureScale','geometryLod','decimation','nearFieldResolution','materialSimplification','shadowResolution','reflectionResolution','anisotropy','nearAnimationHz'}
def choose(candidates,baseline):
    valid=[]
    for c in candidates:
        knobs=set(c.get('knobs',{}))
        if knobs-SAFE or knobs&FORBIDDEN:continue
        if c.get('sourceFidelity',0)<100 or c.get('nearFieldFidelity',0)<100 or c.get('visualRegression',True):continue
        if c.get('p99Ms',1e9)>baseline.get('p99Ms',1e9) or c.get('hitches',1e9)>baseline.get('hitches',1e9):continue
        valid.append(c)
    return max(valid,key=lambda x:(x.get('fps',0),-x.get('cpuMs',1e9)),default=None)
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--self-test',action='store_true');a=ap.parse_args();base={'p99Ms':24,'hitches':2};c=[{'knobs':{'distantAiHz':4},'sourceFidelity':100,'nearFieldFidelity':100,'visualRegression':False,'p99Ms':22,'hitches':1,'fps':58,'cpuMs':15},{'knobs':{'resolution':.8},'sourceFidelity':99,'nearFieldFidelity':99,'visualRegression':True,'p99Ms':15,'hitches':0,'fps':90,'cpuMs':10}];r=choose(c,base);out={'pass':bool(r) and 'resolution' not in r['knobs'],'chosen':r,'safeKnobs':sorted(SAFE),'forbidden':sorted(FORBIDDEN)};print(json.dumps(out,indent=2));return 0 if out['pass'] else 2
if __name__=='__main__':raise SystemExit(main())
