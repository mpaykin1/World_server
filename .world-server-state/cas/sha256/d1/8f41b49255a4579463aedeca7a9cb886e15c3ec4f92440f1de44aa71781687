from __future__ import annotations
import argparse, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
SERVICE_ROOT=Path(__file__).resolve().parents[1];REPO_ROOT=SERVICE_ROOT.parents[1];sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.mesh_optimizer import MeshOptimizationPipeline
from ai3d.production_v6 import aggregate_runtime_benchmarks_v6
from ai3d.production_v7 import DeviceHistoryV7, collect_gpu_telemetry_v7, engine_native_gpu_timing_gate, production_readiness_gate_v7

def run(cmd,cwd):
    p=subprocess.run(cmd,cwd=str(cwd),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=False)
    return {'command':' '.join(cmd),'passed':p.returncode==0,'returnCode':p.returncode,'logTail':p.stdout[-5000:]}

def load(folder):
    rows=[]
    if not folder:return rows
    for path in sorted(folder.glob('*.json')):
        try:data=json.loads(path.read_text(encoding='utf-8'))
        except Exception:continue
        if isinstance(data,list):rows+=data
        elif isinstance(data,dict):rows+=data.get('rows',[data])
    return rows

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--fixture',type=Path);ap.add_argument('--benchmark-dir',type=Path);ap.add_argument('--required-targets',default='godot,web');ap.add_argument('--output',type=Path,default=Path('mesh-v7-verification.json'));ap.add_argument('--skip-repo-check',action='store_true');a=ap.parse_args()
    checks=[run([sys.executable,'-m','py_compile','server.py','ai3d/mesh_optimizer.py','ai3d/production_v7.py','ai3d/semantic_projection_v7.py','ai3d/plugins/mesh_quality_optimizer.py','scripts/verify_mesh_pipeline_v7.py','scripts/upload_roblox_assets_v7.py'],SERVICE_ROOT),run([sys.executable,'-m','unittest','tests.test_production_v7','tests.test_semantic_projection_v7','tests.test_mesh_quality_bridge_v6'],SERVICE_ROOT)]
    if not a.skip_repo_check:
        checks += [run(['npm','run','check'],REPO_ROOT),run(['npm','run','quality:check'],REPO_ROOT),run(['npm','run','quality:regression'],REPO_ROOT),run(['npm','run','duplicates:check'],REPO_ROOT),run(['npm','run','contracts:check'],REPO_ROOT)]
    fixture=None
    if a.fixture:
        if not shutil.which(os.environ.get('BLENDER_BIN','blender')):fixture={'passed':False,'reason':'Blender unavailable'}
        else:
            with tempfile.TemporaryDirectory(prefix='mesh-v7-') as td:
                job=Path(td)/'job';job.mkdir();inp=job/('input'+a.fixture.suffix.lower());shutil.copy2(a.fixture,inp)
                r=MeshOptimizationPipeline(SERVICE_ROOT).run({'id':'fixture','mode':'mesh_optimize','params':{'productionReadiness':{'requireRuntimeEvidence':True},'nativeGpuTimingV7':{'required':True}},'input_path':str(inp)},lambda *_:None)
                rep=json.loads((job/'optimization-report.json').read_text(encoding='utf-8'))
                fixture={'passed':r.get('status') in {'accepted','accepted_with_runtime_warning'},'qualityGate':rep.get('qualityGate'),'temporal':rep.get('temporalAntiShimmerQA'),'semanticProjectionV7':rep.get('semanticProjectionV7')}
    rows=load(a.benchmark_dir);required=[x.strip() for x in a.required_targets.split(',') if x.strip()]
    runtime=aggregate_runtime_benchmarks_v6(rows,{'requiredTargets':required}) if rows else {'status':'UNVERIFIED','passed':False}
    gpu=engine_native_gpu_timing_gate(rows,{'requiredTargets':required})
    static={'fidelity':True if fixture is None else bool((fixture.get('qualityGate') or {}).get('passed')),'temporal':True if fixture is None else bool((fixture.get('temporal') or {}).get('passed'))}
    ready=production_readiness_gate_v7(static,runtime,gpu,True,True)
    history=DeviceHistoryV7(SERVICE_ROOT/'runtime'/'device-history-v7.sqlite3');recorded=history.record(rows,'verification-fixture') if rows else 0
    report={'schemaVersion':7,'staticChecks':checks,'staticPassed':all(x['passed'] for x in checks),'fixture':fixture,'gpuTelemetry':collect_gpu_telemetry_v7(),'runtime':runtime,'nativeGpuTiming':gpu,'deviceHistoryRecorded':recorded,'deviceHistorySummary':history.summary(),'productionReadiness':ready}
    report['passed']=report['staticPassed'] and (fixture is None or fixture.get('passed')) and ready.get('passed')
    a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report['passed'] else 1)
if __name__=='__main__':main()
