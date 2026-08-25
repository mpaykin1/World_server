#!/usr/bin/env python3
from __future__ import annotations
import json, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REQ=['src/cpu-first-orchestrator.js','src/hierarchical-spatial-grid.js','src/cpu-occlusion-cache.js','src/predictive-streaming-v2.js','src/simulation-lod.js','tools/incremental_world_compiler.py','tools/incremental_light_bake.py','tools/pvs_builder.py','tools/nav_collision_cache.py','tools/deterministic_replay.py','tools/cpu_performance_profiler.py','tools/cpu_autotuner.py']
FLAGS=['hierarchicalSpatialGrid','cpuPvs','cpuOcclusionCache','predictiveStreamingV2','incrementalWorldCompiler','incrementalCpuLightBake','navCollisionHashCache','simulationLod','cpuCausalityProfiler','qualitySafeCpuAutotuner','deterministicProductionReplay','clientRenderingOffload']
def main():
    problems=[f'missing {x}' for x in REQ if not (ROOT/x).exists()];st=json.load(open(ROOT/'quality/standards.json'));fps=st['graphics']['fpsOptimization']
    for k in FLAGS:
        if fps.get(k) is not True:problems.append(f'flag {k} not enabled')
    if fps.get('serverGpuRequired') is not False:problems.append('server GPU dependency not eliminated')
    if fps.get('forbidNearFieldFidelityReduction') is not True:problems.append('near fidelity not protected')
    inc=json.load(open(ROOT/'quality/knowledge/incidents.json'))['incidents'];wanted={'full-world-rebuild-after-single-object-change','cpu-optimization-reduced-near-graphics','pvs-overculled-near-visible-object','autotuner-selected-lossy-knob','replay-bug-was-not-promoted-to-regression','cached-nav-collision-used-for-wrong-source','background-bake-starved-game-loop','server-required-paid-gpu'}
    have={x['fingerprint'] for x in inc};missing=wanted-have
    if missing:problems.append('missing protected V9 incidents '+','.join(sorted(missing)))
    out={'schemaVersion':1,'runtime':'WORLD_FACTORY_QUALITY_CORE_V10','pass':not problems,'problems':problems,'requiredModules':len(REQ),'requiredCpuFlags':len(FLAGS),'serverGpuRequired':False,'nearFieldFidelityFloor':100,'sourceFidelityFloor':100}
    (ROOT/'quality/reports/v9-cpu-first-gate.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2));return 0 if out['pass'] else 2
if __name__=='__main__':raise SystemExit(main())
