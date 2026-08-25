#!/usr/bin/env python3
from __future__ import annotations
import json, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REQ=[
 'src/cpu-import-worker-pool.js','src/workers/generic-import-worker.js','src/shared-cache-worker.js','src/offline-cache-manager.js','sw.js',
 'tools/streamed_asset_reader.py','tools/content_defined_chunking.py','tools/derived_cache_codec.py','tools/binary_delta.py',
 'tools/semantic_pvs_builder.py','tools/incremental_gi_reuse.py','tools/cpu_flamegraph.py','tools/replay_farm.py','tools/dependency_graph_v10.py'
]
FLAGS=['wasmThreadsAllImporters','mmapWindowedHugeAssetParsing','semanticConservativePvs','incrementalGiCellReuse','losslessDerivedCacheCompression','serviceWorkerOfflineShaCache','sharedWorkerMultiTabShaCache','deterministicNetworkPhysicsReplayFarm','automaticCpuFlamegraphEvidence','dependencyImpactGraph','exactBinaryDeltaDerivedChunks','contentDefinedChunking']
SELF=[
 [sys.executable,'tools/streamed_asset_reader.py','--self-test'],[sys.executable,'tools/content_defined_chunking.py','--self-test'],
 [sys.executable,'tools/derived_cache_codec.py','--self-test'],[sys.executable,'tools/binary_delta.py','--self-test'],
 [sys.executable,'tools/semantic_pvs_builder.py','--self-test'],[sys.executable,'tools/incremental_gi_reuse.py','--self-test'],
 [sys.executable,'tools/cpu_flamegraph.py','--self-test'],[sys.executable,'tools/replay_farm.py','--self-test'],
 [sys.executable,'tools/dependency_graph_v10.py','--self-test']]
WANTED={
 'threaded-importer-race-corrupted-asset','huge-world-parser-loaded-whole-file-oom','semantic-pvs-overculled-unknown-space',
 'incremental-gi-reused-dirty-cell','content-defined-chunking-changed-bytes','offline-cache-served-wrong-sha',
 'shared-worker-cache-cross-version-stale','cpu-tuning-without-causality-evidence','replay-farm-nondeterministic-network-physics',
 'dependency-impact-missed-required-rebuild','derived-cache-compression-changed-bytes','binary-delta-reconstruction-mismatch'}
def main():
    problems=[f'missing {x}' for x in REQ if not (ROOT/x).exists()]
    st=json.load(open(ROOT/'quality/standards.json')); fps=st['graphics']['fpsOptimization']
    for k in FLAGS:
        if fps.get(k) is not True: problems.append(f'flag {k} not enabled')
    if fps.get('serverGpuRequired') is not False: problems.append('server GPU dependency reintroduced')
    if fps.get('nearFieldFidelityFloorPercent') != 100 or fps.get('sourceFidelityFloorPercent') != 100: problems.append('fidelity floor below 100')
    have={x['fingerprint'] for x in json.load(open(ROOT/'quality/knowledge/incidents.json'))['incidents']}
    miss=WANTED-have
    if miss: problems.append('missing protected V10 incidents '+','.join(sorted(miss)))
    self_results=[]
    for cmd in SELF:
        p=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True)
        self_results.append({'cmd':' '.join(cmd),'pass':p.returncode==0,'stdout':p.stdout[-2000:],'stderr':p.stderr[-1000:]})
        if p.returncode: problems.append('self-test failed: '+' '.join(cmd))
    out={'schemaVersion':1,'runtime':'WORLD_FACTORY_QUALITY_CORE_V10','pass':not problems,'problems':problems,'requiredModules':len(REQ),'requiredCpuFlags':len(FLAGS),'selfTests':self_results,'serverGpuRequired':False,'nearFieldFidelityFloor':100,'sourceFidelityFloor':100}
    (ROOT/'quality/reports/v10-cpu-quality-gate.json').write_text(json.dumps(out,indent=2)+'\n')
    print(json.dumps(out,indent=2)); return 0 if out['pass'] else 2
if __name__=='__main__': raise SystemExit(main())
