#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    reg=json.load(open(ROOT/'worlds/registry.json'));reg['runtime']='WORLD_FACTORY_QUALITY_CORE_V10'
    for e in reg.get('worlds',[]):
        p=(ROOT/e['manifest']).resolve();m=json.load(open(p));m['title']=m.get('title',e['id']).replace('V8','V9');q=m.setdefault('quality',{});q['profile']='WORLD_FACTORY_QUALITY_CORE_V10';m.setdefault('qualityLock',{})['runtimeStandard']='WORLD_FACTORY_QUALITY_CORE_V10';g=m.setdefault('graphics',{});g['profile']='cinematic-preserve-v9';g['performanceGovernor']='cpu-first-non-destructive-v9';f=g.setdefault('fpsOptimization',{});f.update({'enabled':True,'mode':'cpu-first-near-lossless-v9','serverGpuRequired':False,'hierarchicalSpatialGrid':True,'cpuPvs':True,'cpuOcclusionCache':True,'predictiveStreamingV2':True,'incrementalWorldCompiler':True,'incrementalCpuLightBake':True,'navCollisionHashCache':True,'simulationLod':True,'cpuCausalityProfiler':True,'qualitySafeCpuAutotuner':True,'deterministicProductionReplay':True,'clientRenderingOffload':True,'forbidDynamicResolution':True,'forbidNearFieldFidelityReduction':True});p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'worlds/registry.json').write_text(json.dumps(reg,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'pass':True,'worlds':len(reg.get('worlds',[])),'runtime':reg['runtime']}));return 0
if __name__=='__main__':raise SystemExit(main())
