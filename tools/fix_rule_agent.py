#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path
from quality_common import ROOT, QUALITY, read_json, write_json

TARGETS={
 'spawn':['src/world-loader.js','src/player-controller.js','tools/semantic_analyzer.py'],
 'jump':['src/player-controller.js','src/input.js'],
 'camera':['src/player-controller.js','src/input.js'],
 'collision':['src/world-loader.js','src/dynamic-swept-collision.js','src/dynamic-environment.js','tools/auto_collider.py'],
 'visual':['src/quality-gate.js','tools/regression_gate.py','tools/visual_regression.mjs'],
 'performance':['src/performance-governor.js','src/proximity-quality.js','src/atmosphere-quality.js','src/webgpu-hzb-visibility.js','src/gpu-occlusion-manager.js','src/wasm-simd-codec.js'],
 'optimization':['src/fps-quality-optimizer.js','src/webgpu-hzb-visibility.js','src/webgpu-meshlet-indirect.js','src/network-interest-manager.js','src/distant-pose-sharing.js'],
 'material':['src/wet-surface-system.js','src/lighting-quality.js','src/reflection-probes.js'],
 'stream':['src/streaming-manager.js','src/lossless-range-stream.js','tools/build_animated_glb_stream_plan.py'],
 'telemetry':['api/quality-telemetry.js','tools/import_production_telemetry.py','tools/learn_from_reports.py'],
}

def choose(text):
    t=text.lower();out=[]
    for k,files in TARGETS.items():
        if k in t:out.extend(files)
    return sorted(set(out)) or ['src/quality-gate.js','tools/validate_all.py']

def task_md(queue):
    lines=['# DESKTOP AI — automatic Fix → Rule → Test → Rollout task','',
      'Do not patch one game. Fix the shared V8 core. Preserve all source asset hashes and all already-protected behavior.','']
    for q in queue:
        lines += [f"## Incident `{q['fingerprint']}`",'',f"Candidate files: {', '.join(q['candidateFiles'])}",'',
          'Required result: root cause identified; shared-core fix; prevention rule; deterministic regression test bound to the fingerprint; all historical tests pass; protection pack recompiled.','']
    lines += ['## Mandatory verification','',
      'Run: `python tools/global_quality_autopilot.py --repo <World_server>` then browser/fuzz/visual tests. Any regression = rollback. After PASS, canary first, then all consumers.','']
    return '\n'.join(lines)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--write-task',action='store_true',default=True);a=ap.parse_args()
    inc=read_json(QUALITY/'knowledge/incidents.json',{}).get('incidents',[]);queue=[]
    for x in inc:
        if x.get('status') in ('protected',):continue
        text=' '.join(x.get('symptoms',[]))+' '+str(x.get('rootCause',''));fp=x.get('fingerprint')
        queue.append({'fingerprint':fp,'state':'blocked-until-protected','candidateFiles':choose(text),
          'requiredOutputs':[f'new prevention rule bound to {fp}',f'deterministic regression test bound to {fp}','shared-runtime fix, not per-world patch','full historical regression pass','promotion/rollout only after canary PASS'],
          'acceptance':['source asset hashes unchanged','all protected incidents still pass','visual/performance quality does not regress','consumer pack/runtime hash updated','unknown incident removed from quarantine only after proof']})
    out={'schemaVersion':2,'queue':queue,'autoSafeRepairs':['tools/auto_repair.py --apply','tools/self_heal_protected_errors.py --apply'],'codePatchMode':'desktop-ai-executor-with-fail-closed-proof-obligations','unknownIncidentPolicy':'generate task + block release, never guess-patch'}
    write_json(QUALITY/'knowledge/fix-queue.json',out)
    (ROOT/'DESKTOP_AI_FIX_TASK.md').write_text(task_md(queue),encoding='utf-8')
    print(json.dumps(out,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
