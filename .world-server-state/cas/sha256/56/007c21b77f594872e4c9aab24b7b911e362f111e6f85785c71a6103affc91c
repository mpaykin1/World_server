#!/usr/bin/env python3
from __future__ import annotations
import json, subprocess, sys, time
from pathlib import Path
from quality_common import ROOT, QUALITY, write_json, sha256
from propagate_to_consumers import runtime_hash, PACK_FILES

STEPS=[
 ('incident-contracts','python','tools/error_immunity.py','compile'),
 ('compiled-protection-pack','python','tools/compile_protection_pack.py'),
 ('auto-repair-drift-check','python','tools/auto_repair.py'),
 ('static','python','tools/validate_all.py'),
 ('regression','python','tools/regression_gate.py'),
 ('unit','python','-m','unittest','discover','-s','tests','-p','test_*.py'),
 ('wasm-simd-threads','node','tools/verify_wasm_threads.mjs'),
 ('v9-cpu-first-optimization','python','tools/v9_cpu_first_gate.py'),
 ('v10-cpu-quality','python','tools/v10_cpu_quality_gate.py'),
 ('bounded-memory-streaming','python','tools/streamed_asset_reader.py','--self-test'),
 ('content-defined-chunking','python','tools/content_defined_chunking.py','--self-test'),
 ('lossless-cache-codec','python','tools/derived_cache_codec.py','--self-test'),
 ('exact-binary-delta','python','tools/binary_delta.py','--self-test'),
 ('semantic-conservative-pvs','python','tools/semantic_pvs_builder.py','--self-test'),
 ('incremental-gi-reuse','python','tools/incremental_gi_reuse.py','--self-test'),
 ('cpu-flamegraph-evidence','python','tools/cpu_flamegraph.py','--self-test'),
 ('network-physics-replay-farm','python','tools/replay_farm.py','--self-test'),
 ('dependency-impact-graph','python','tools/dependency_graph_v10.py','--self-test'),
 ('cpu-causality-profiler','python','tools/cpu_performance_profiler.py','--self-test'),
 ('quality-safe-cpu-autotuner','python','tools/cpu_autotuner.py','--self-test'),
 ('deterministic-production-replay','python','tools/deterministic_replay.py','--verify-known'),
 ('quality-knowledge-graph','python','tools/quality_graph.py','--repo','.'),
 ('monotonic-quality-ratchet','python','tools/quality_ratchet.py'),
 ('content-addressed-bake-plan','python','tools/bake_farm.py','--dry-run'),
 ('fix-rule-queue','python','tools/fix_rule_agent.py'),
 ('consumer-propagation','python','tools/verify_consumers.py','--repo','.'),
]
def main():
    results=[]; started=time.time(); failed=False
    for name,*cmd in STEPS:
        p=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True)
        results.append({'name':name,'pass':p.returncode==0,'returncode':p.returncode,'stdout':p.stdout[-12000:],'stderr':p.stderr[-12000:]})
        if p.returncode!=0: failed=True
        print(f'[{name}]', 'PASS' if p.returncode==0 else 'FAIL')
        if p.stdout: print(p.stdout.strip())
        if p.stderr: print(p.stderr.strip(),file=sys.stderr)
    # Browser/visual tests are part of CI when node dependencies are installed; static pipeline records readiness explicitly.
    browser_ready=(ROOT/'tools/playtest.mjs').exists() and (ROOT/'tools/visual_regression.mjs').exists()
    score=100*(sum(r['pass'] for r in results)/len(results))
    report={'schemaVersion':5,'pass':not failed,'score':round(score,1),'durationSec':round(time.time()-started,2),'steps':results,'browserAutomationImplemented':browser_ready}
    write_json(QUALITY/'reports/quality-pipeline.json',report)
    if not failed:
        write_json(QUALITY/'knowledge/static-candidate.json',{
          'schemaVersion':1,'runtime':'WORLD_FACTORY_QUALITY_CORE_V10','runtimeHash':runtime_hash(),
          'qualityPackFiles':{f:sha256(ROOT/f) for f in PACK_FILES},'pipelineScore':report['score'],'source':'static-quality-pipeline-pass-not-full-release-approval'
        })
    return 1 if failed else 0
if __name__=='__main__':sys.exit(main())
