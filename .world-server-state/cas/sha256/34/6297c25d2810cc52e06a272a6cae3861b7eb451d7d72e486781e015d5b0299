#!/usr/bin/env python3
from __future__ import annotations
import json, sys
from pathlib import Path
from quality_common import ROOT, QUALITY, read_json, sha256

REQUIRED_MODULES = [
    'src/shared-memory-decode.js',
    'src/webgpu-material-table.js',
    'src/webgpu-clustered-lighting.js',
    'src/virtual-texture-residency.js',
    'src/portal-visibility.js',
    'src/animation-budget.js',
    'src/physics-spatial-broadphase.js',
    'src/network-delta-codec.js',
    'src/device-performance-schedule.js',
    'src/frame-budget-orchestrator.js',
]
REQUIRED_GATES = {
    'shared-memory-zero-copy-fallback',
    'webgpu-exact-material-table',
    'clustered-lighting-fail-bright',
    'virtual-texture-near-full-resolution',
    'portal-visibility-conservative',
    'animation-budget-near-interaction-full-rate',
    'physics-broadphase-near-contact-awake',
    'network-delta-lossless',
    'device-schedule-safe-knobs-only',
    'derived-artifact-cas-source-lock',
    'pattern-applicability-firewall',
    'frame-budget-near-critical',
    'stutter-p99-regression',
}
FORBIDDEN_SCHEDULE_TOKENS = ('resolution','texturedownscale','geometrylod','nearfieldresolution','sourcerecompression','pixelratio')

def fail(msg, problems):
    problems.append(msg)

def main() -> int:
    problems=[]
    standards=read_json(QUALITY/'standards.json',{})
    if standards.get('id')!='WORLD_FACTORY_QUALITY_CORE_V10': fail('standards runtime is not V8',problems)
    gates={x if isinstance(x,str) else x.get('id') for x in standards.get('qualityGates',[]) if isinstance(x,(str,dict))}
    missing=sorted(REQUIRED_GATES-gates)
    if missing: fail('missing V8 quality gates: '+', '.join(missing),problems)
    for rel in REQUIRED_MODULES:
        if not (ROOT/rel).is_file(): fail('missing module '+rel,problems)
    v=(ROOT/'vercel.json').read_text(encoding='utf-8')
    for token in ('Cross-Origin-Opener-Policy','same-origin','Cross-Origin-Embedder-Policy','require-corp','Cross-Origin-Resource-Policy'):
        if token not in v: fail('cross-origin isolation contract missing '+token,problems)
    sched=read_json(QUALITY/'knowledge/device-schedules.json',{})
    blob=json.dumps(sched,sort_keys=True).lower()
    for tok in FORBIDDEN_SCHEDULE_TOKENS:
        if tok in blob: fail('device schedule contains forbidden fidelity knob: '+tok,problems)
    patterns=read_json(QUALITY/'knowledge/patterns.json',{})
    policy=patterns.get('promotionPolicy',{})
    if not policy.get('blindGlobalPropagationForbidden'): fail('blind pattern propagation is not forbidden',problems)
    if not policy.get('requireApplicabilityProof'): fail('pattern applicability proof is not required',problems)
    incidents=read_json(QUALITY/'knowledge/incidents.json',{}).get('incidents',[])
    protected={x.get('fingerprint') for x in incidents if isinstance(x,dict) and x.get('status')=='protected'}
    required_incidents={
      'shared-memory-fastpath-broke-on-nonisolated-deploy','material-table-fastpath-changed-material',
      'clustered-lighting-dropped-visible-light','virtual-texture-evicted-near-detail','portal-overcull-visible-room',
      'animation-budget-stuttered-near-character','physics-sleep-disabled-player-contact',
      'network-compression-changed-local-state','device-learning-lowered-graphics','derived-cache-hash-mismatch',
      'good-pattern-propagated-to-incompatible-project','frame-budget-sacrificed-near-quality',
      'p99-stutter-regressed-after-fps-optimization'}
    miss=sorted(required_incidents-protected)
    if miss: fail('V8 error immunity missing incidents: '+', '.join(miss),problems)
    # Source fidelity + meshlet conservation on every registered world when data exists.
    reg=read_json(ROOT/'worlds'/'registry.json',{})
    for entry in reg.get('worlds',[]):
        rel=str(entry['manifest']).removeprefix('./')
        mf=ROOT/rel if rel.startswith('worlds/') else ROOT/'worlds'/rel
        if not mf.is_file():
            fail('manifest missing '+str(mf),problems); continue
        m=read_json(mf,{})
        visual=m.get('visual',{}); url=str(visual.get('url','')).removeprefix('./')
        src=(mf.parent/url).resolve()
        expected=visual.get('sha256')
        if expected and src.is_file() and sha256(src)!=expected: fail(f'{m.get("id")}: source SHA changed',problems)
        mesh=m.get('graphics',{}).get('meshlets',{})
        if mesh.get('enabled') and mesh.get('sourceTriangles')!=mesh.get('meshletTriangles'):
            fail(f'{m.get("id")}: meshlet triangle conservation failed',problems)
    report={'schemaVersion':1,'runtime':'WORLD_FACTORY_QUALITY_CORE_V10','pass':not problems,'problems':problems,
            'requiredModules':len(REQUIRED_MODULES),'requiredV8Gates':len(REQUIRED_GATES),
            'protectedV8OptimizationIncidents':len(required_incidents),'sourceQualityReduced':False}
    (QUALITY/'reports').mkdir(parents=True,exist_ok=True)
    (QUALITY/'reports'/'v8-optimization-gate.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return 0 if not problems else 2
if __name__=='__main__': raise SystemExit(main())
