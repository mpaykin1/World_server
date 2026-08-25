from __future__ import annotations
import argparse,json,subprocess,sys,tempfile
from pathlib import Path

SERVICE_ROOT=Path(__file__).resolve().parents[1]
REPO_ROOT=SERVICE_ROOT.parents[1]
sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.error_ledger_v11 import ErrorLedgerV11, close_resolved_check_failures, harvest_failed_checks, zero_known_fixable_errors_gate
from ai3d.production_v11 import regression_closure_gate_v11,reproducibility_gate_v11,flaky_test_gate_v11,fault_injection_gate_v11,convergence_gate_v11,quality_confidence_v11


def run(cmd,cwd,timeout=1800):
    p=subprocess.run(cmd,cwd=str(cwd),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=False,timeout=timeout)
    return {"command":" ".join(map(str,cmd)),"passed":p.returncode==0,"returnCode":p.returncode,"logTail":p.stdout[-8000:]}

def load_json(path):
    if path and path.is_file():
        try:return json.loads(path.read_text(encoding="utf-8"))
        except Exception:return {}
    return {}

def load_rows(path):
    if not path:return []
    paths=[path] if path.is_file() else sorted(path.glob("*.json"));out=[]
    for p in paths:
        d=load_json(p)
        if isinstance(d,list):out.extend(x for x in d if isinstance(x,dict))
        elif isinstance(d,dict):out.extend(x for x in d.get("rows",d.get("runs",[d])) if isinstance(x,dict))
    return out

def main():
    ap=argparse.ArgumentParser(description="V11 zero-known-error and convergence verifier")
    ap.add_argument("--ledger",type=Path,default=SERVICE_ROOT/"runtime"/"quality"/"error-ledger-v11.json")
    ap.add_argument("--repro-runs",type=Path)
    ap.add_argument("--stability-runs",type=Path)
    ap.add_argument("--fault-results",type=Path)
    ap.add_argument("--output",type=Path,default=Path("mesh-v11-verification.json"))
    ap.add_argument("--skip-repo-check",action="store_true")
    ap.add_argument("--run-release-gate",action="store_true")
    args=ap.parse_args()
    checks=[run([sys.executable,"-m","py_compile","server.py","ai3d/mesh_optimizer.py","ai3d/error_ledger_v11.py","ai3d/production_v11.py","scripts/verify_mesh_pipeline_v11.py","scripts/run_zero_error_loop_v11.py"],SERVICE_ROOT),run([sys.executable,"-m","unittest","discover","-s","tests","-p","test_*.py"],SERVICE_ROOT)]
    if not args.skip_repo_check:
        for name in ("check","quality:check","quality:regression","duplicates:check","contracts:check"):
            checks.append(run(["npm","run",name],REPO_ROOT))
        if args.run_release_gate:checks.append(run(["npm","run","release:gate"],REPO_ROOT,3600))
    ledger=ErrorLedgerV11(args.ledger);close_resolved_check_failures(ledger,checks);harvest_failed_checks(ledger,checks);ledger.append_run({"kind":"v11-verifier","checks":[{"command":c["command"],"passed":c["passed"]} for c in checks]});ledger.save()
    zero=zero_known_fixable_errors_gate(ledger);closure=regression_closure_gate_v11(ledger.data)
    repro=reproducibility_gate_v11(load_rows(args.repro_runs),{"minRuns":3}) if args.repro_runs else {"schemaVersion":11,"status":"NOT_REQUESTED","passed":True}
    flaky=flaky_test_gate_v11(load_rows(args.stability_runs),{"minRepeats":3}) if args.stability_runs else {"schemaVersion":11,"status":"NOT_REQUESTED","passed":True}
    faults=fault_injection_gate_v11(load_rows(args.fault_results)) if args.fault_results else {"schemaVersion":11,"status":"NOT_REQUESTED","passed":True}
    conv=convergence_gate_v11(static_checks_passed=all(c["passed"] for c in checks),zero_error_gate=zero,regression_closure=closure,reproducibility=repro,flaky_tests=flaky,fault_injection=faults,external_blockers=ledger.proven_external_blockers(),policy={"requireReproducibility":bool(args.repro_runs),"requireFlakyStability":bool(args.stability_runs),"requireFaultInjection":bool(args.fault_results)})
    confidence=quality_confidence_v11({"static":all(c["passed"] for c in checks),"zeroErrors":zero,"regression":closure,"semantic":0.99,"runtime":0.0,"deviceFleet":0.0,"profiler":0.0,"roblox":0.0,"pvsCanary":0.0})
    report={"schemaVersion":11,"checks":checks,"zeroKnownErrors":zero,"regressionClosure":closure,"reproducibility":repro,"flakyTests":flaky,"faultInjection":faults,"convergence":conv,"qualityConfidence":confidence,"passed":bool(conv.get("passed"))}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report["passed"] else 1)
if __name__=="__main__":main()
