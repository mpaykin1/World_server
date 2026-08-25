#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    reg=json.load(open(ROOT/'worlds/registry.json')); reg['runtime']='WORLD_FACTORY_QUALITY_CORE_V10'
    for e in reg.get('worlds',[]):
        p=(ROOT/e['manifest']).resolve(); m=json.load(open(p)); m['title']=m.get('title',e['id']).replace('V9','V10')
        q=m.setdefault('quality',{}); q['profile']='WORLD_FACTORY_QUALITY_CORE_V10'; m.setdefault('qualityLock',{})['runtimeStandard']='WORLD_FACTORY_QUALITY_CORE_V10'
        g=m.setdefault('graphics',{}); g['profile']='cinematic-preserve-v10'; g['performanceGovernor']='cpu-first-cache-everything-nondestructive-v10'
        f=g.setdefault('fpsOptimization',{}); f.update({
          'enabled':True,'mode':'cpu-first-cache-everything-near-lossless-v10','serverGpuRequired':False,'wasmThreadsAllImporters':True,
          'mmapWindowedHugeAssetParsing':True,'semanticConservativePvs':True,'incrementalGiCellReuse':True,'losslessDerivedCacheCompression':True,
          'serviceWorkerOfflineShaCache':True,'sharedWorkerMultiTabShaCache':True,'deterministicNetworkPhysicsReplayFarm':True,
          'automaticCpuFlamegraphEvidence':True,'dependencyImpactGraph':True,'exactBinaryDeltaDerivedChunks':True,'contentDefinedChunking':True,
          'forbidDynamicResolution':True,'forbidNearFieldFidelityReduction':True,'sourceFidelityFloorPercent':100,'nearFieldFidelityFloorPercent':100})
        p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'worlds/registry.json').write_text(json.dumps(reg,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'pass':True,'worlds':len(reg.get('worlds',[])),'runtime':reg['runtime']})); return 0
if __name__=='__main__': raise SystemExit(main())
