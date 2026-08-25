from __future__ import annotations
import argparse, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
SERVICE_ROOT=Path(__file__).resolve().parents[1];REPO_ROOT=SERVICE_ROOT.parents[1];sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.mesh_optimizer import MeshOptimizationPipeline
from ai3d.production_v6 import aggregate_runtime_benchmarks_v6
from ai3d.production_v7 import engine_native_gpu_timing_gate
from ai3d.production_v8 import DeviceHistoryV8, collect_gpu_telemetry_v8, device_matrix_coverage, production_readiness_gate_v8, validate_roblox_place_runtime

def run(cmd,cwd,timeout=1800):
    p=subprocess.run(cmd,cwd=str(cwd),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=False,timeout=timeout)
    return {'command':' '.join(cmd),'passed':p.returncode==0,'returnCode':p.returncode,'logTail':p.stdout[-6000:]}
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
    ap=argparse.ArgumentParser();ap.add_argument('--fixture',type=Path);ap.add_argument('--benchmark-dir',type=Path);ap.add_argument('--roblox-place-result',type=Path);ap.add_argument('--required-targets',default='godot,web');ap.add_argument('--required-tiers',default='low,mid,high');ap.add_argument('--output',type=Path,default=Path('mesh-v8-verification.json'));ap.add_argument('--skip-repo-check',action='store_true');ap.add_argument('--run-release-gate',action='store_true');a=ap.parse_args()
    checks=[
        run([sys.executable,'-m','py_compile','server.py','ai3d/mesh_optimizer.py','ai3d/production_v8.py','ai3d/semantic_fusion_v8.py','ai3d/plugins/mesh_quality_optimizer.py','scripts/verify_mesh_pipeline_v8.py'],SERVICE_ROOT),
        run([sys.executable,'-m','unittest','tests.test_production_v8','tests.test_semantic_fusion_v8','tests.test_production_v7','tests.test_semantic_projection_v7','tests.test_mesh_quality_bridge_v6'],SERVICE_ROOT),
    ]
    if not a.skip_repo_check:
        for script in ('check','quality:check','quality:regression','duplicates:check','contracts:check'):
            checks.append(run(['npm','run',script],REPO_ROOT))
        if a.run_release_gate:checks.append(run(['npm','run','release:gate'],REPO_ROOT,3600))
    fixture=None
    if a.fixture:
        if not shutil.which(os.environ.get('BLENDER_BIN','blender')):fixture={'passed':False,'reason':'Blender unavailable; real fixture validation not executed'}
        else:
            with tempfile.TemporaryDirectory(prefix='mesh-v8-') as td:
                job=Path(td)/'job';job.mkdir();inp=job/('input'+a.fixture.suffix.lower());shutil.copy2(a.fixture,inp)
                r=MeshOptimizationPipeline(SERVICE_ROOT).run({'id':'fixture','mode':'mesh_optimize','params':{'productionReadinessV8':{'requireRuntimeEvidence':True,'requireNativeGpuTiming':True}},'input_path':str(inp)},lambda *_:None)
                rep=json.loads((job/'optimization-report.json').read_text(encoding='utf-8'))
                fixture={'passed':r.get('status') in {'accepted','accepted_with_runtime_warning'},'qualityGate':rep.get('qualityGate'),'temporal':rep.get('temporalAntiShimmerQA'),'semanticFusionV8':rep.get('semanticFusionV8')}
    rows=load(a.benchmark_dir);required=[x.strip().lower() for x in a.required_targets.split(',') if x.strip()];tiers=[x.strip().lower() for x in a.required_tiers.split(',') if x.strip()]
    history=DeviceHistoryV8(SERVICE_ROOT/'runtime'/'device-history-v8.sqlite3');recorded=history.record(rows,'verification-fixture') if rows else 0
    all_rows=history.rows();runtime=aggregate_runtime_benchmarks_v6(rows,{'requiredTargets':required}) if rows else {'status':'UNVERIFIED','passed':False};runtime['schemaVersion']=8
    gpu=engine_native_gpu_timing_gate(rows,{'requiredTargets':[t for t in required if t in {'godot','web'}]})
    matrix=device_matrix_coverage(all_rows,{'requiredTargets':required,'requiredTiers':tiers,'minRunsPerCell':3})
    roblox={'schemaVersion':8,'status':'UNVERIFIED','passed':False}
    if a.roblox_place_result and a.roblox_place_result.is_file():roblox=validate_roblox_place_runtime(json.loads(a.roblox_place_result.read_text(encoding='utf-8')))
    static={'fidelity':True if fixture is None else bool((fixture.get('qualityGate') or {}).get('passed')),'temporal':True if fixture is None else bool((fixture.get('temporal') or {}).get('passed'))}
    ready=production_readiness_gate_v8(static,runtime,gpu,matrix,roblox,{'requireRuntimeEvidence':True,'requireNativeGpuTiming':True,'requireDeviceMatrixForFleetVerified':True,'requireRobloxPlaceVerification':False})
    report={'schemaVersion':8,'staticChecks':checks,'staticPassed':all(x['passed'] for x in checks),'fixture':fixture,'gpuTelemetry':collect_gpu_telemetry_v8(),'runtime':runtime,'nativeGpuTiming':gpu,'deviceHistoryRecorded':recorded,'deviceMatrix':matrix,'robloxPlace':roblox,'productionReadiness':ready}
    report['passed']=report['staticPassed'] and (fixture is None or fixture.get('passed')) and ready.get('passed')
    a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report['passed'] else 1)
if __name__=='__main__':main()
