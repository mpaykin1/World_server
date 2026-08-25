from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

SERVICE_ROOT=Path(__file__).resolve().parents[1]
REPO_ROOT=SERVICE_ROOT.parents[1]
sys.path.insert(0,str(SERVICE_ROOT))

from ai3d.production_v6 import aggregate_runtime_benchmarks_v6
from ai3d.production_v9 import longitudinal_fleet_gate_v9
from ai3d.production_v10 import (
    device_farm_integrity_gate_v10,evidence_completeness_gate_v10,fleet_drift_gate_v10,
    normalize_profiler_evidence_v10,pvs_pruning_proof_v10,validate_roblox_verification_result_v10,
    validate_semantic_model_contract_v10,
)


def run(cmd,cwd,timeout=1800):
    p=subprocess.run(cmd,cwd=str(cwd),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=False,timeout=timeout)
    return {"command":" ".join(map(str,cmd)),"passed":p.returncode==0,"returnCode":p.returncode,"logTail":p.stdout[-5000:]}

def load_rows(path:Path|None):
    if not path or not path.exists(): return []
    paths=[path] if path.is_file() else sorted(path.glob("*.json")); out=[]
    for p in paths:
        try:d=json.loads(p.read_text(encoding="utf-8"))
        except Exception:continue
        if isinstance(d,list):out.extend(x for x in d if isinstance(x,dict))
        elif isinstance(d,dict):out.extend(x for x in d.get("rows",[d]) if isinstance(x,dict))
    return out

def load_json(path:Path|None):
    if path and path.is_file():
        try:return json.loads(path.read_text(encoding="utf-8"))
        except Exception:return {}
    return {}


def main():
    ap=argparse.ArgumentParser(description="V10 evidence-completeness verifier.")
    ap.add_argument("--benchmark-dir",type=Path)
    ap.add_argument("--device-farm-result",type=Path)
    ap.add_argument("--semantic-contract",type=Path)
    ap.add_argument("--semantic-model",type=Path)
    ap.add_argument("--roblox-contract",type=Path)
    ap.add_argument("--roblox-result",type=Path)
    ap.add_argument("--pvs",type=Path)
    ap.add_argument("--visibility-samples",type=Path)
    ap.add_argument("--output",type=Path,default=Path("mesh-v10-verification.json"))
    ap.add_argument("--skip-repo-check",action="store_true")
    ap.add_argument("--run-release-gate",action="store_true")
    args=ap.parse_args()
    checks=[run([sys.executable,"-m","py_compile","server.py","ai3d/mesh_optimizer.py","ai3d/production_v10.py","scripts/verify_mesh_pipeline_v10.py","scripts/run_device_farm_v10.py","scripts/run_roblox_studio_verify_v10.py"],SERVICE_ROOT),run([sys.executable,"-m","unittest","discover","-s","tests","-p","test_*.py"],SERVICE_ROOT)]
    if not args.skip_repo_check:
        for name in ("check","quality:check","quality:regression","duplicates:check","contracts:check"):
            checks.append(run(["npm","run",name],REPO_ROOT))
        if args.run_release_gate:checks.append(run(["npm","run","release:gate"],REPO_ROOT,3600))
    rows=load_rows(args.benchmark_dir); device_rows=load_rows(args.device_farm_result)
    runtime=aggregate_runtime_benchmarks_v6(rows,{"requiredTargets":["godot","web"],"requireGpuTelemetry":False}) if rows else {"status":"UNVERIFIED","passed":False}
    profiler=normalize_profiler_evidence_v10(rows)
    device=device_farm_integrity_gate_v10(device_rows)
    combined=device_rows or rows
    longitudinal=longitudinal_fleet_gate_v9(combined,{"requiredTargets":["godot","web"],"requiredTiers":["low","mid","high"]}) if combined else {"status":"INSUFFICIENT_LONGITUDINAL_EVIDENCE","passed":False}
    drift=fleet_drift_gate_v10(combined)
    semantic_contract=load_json(args.semantic_contract)
    semantic=validate_semantic_model_contract_v10(semantic_contract,args.semantic_model) if semantic_contract or args.semantic_model else {"schemaVersion":10,"status":"UNPROVISIONED","passed":False}
    rb_contract=load_json(args.roblox_contract); rb_result=load_json(args.roblox_result)
    roblox=validate_roblox_verification_result_v10(rb_result,rb_contract) if rb_contract else {"schemaVersion":10,"status":"UNVERIFIED","passed":False}
    pvs=load_json(args.pvs); vis=load_rows(args.visibility_samples)
    pvs_proof=pvs_pruning_proof_v10(pvs,vis,[]) if pvs else {"schemaVersion":10,"status":"NO_PROVEN_REMOVALS","passed":False}
    policy={"requireSemanticModelContract":bool(semantic_contract or args.semantic_model),"requireRuntime":True,"requireProfiler":False,"requireDeviceFarm":bool(args.device_farm_result),"requireLongitudinalFleet":bool(args.device_farm_result),"requireDriftStable":bool(args.device_farm_result),"requireRobloxStudio":bool(rb_contract),"requirePvsPruningProof":False}
    evidence=evidence_completeness_gate_v10({"staticChecks":all(c["passed"] for c in checks)},semantic,runtime,profiler,device,longitudinal,drift,roblox,pvs_proof,policy)
    report={"schemaVersion":10,"staticChecks":checks,"semanticModel":semantic,"runtime":runtime,"profiler":profiler,"deviceFarm":device,"longitudinalFleet":longitudinal,"fleetDrift":drift,"roblox":roblox,"pvsProof":pvs_proof,"productionEvidence":evidence}
    report["passed"]=all(c["passed"] for c in checks) and (not policy["requireRuntime"] or evidence.get("passed"))
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report["passed"] else 1)

if __name__=="__main__":main()
