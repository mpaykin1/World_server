from __future__ import annotations
import argparse,json,subprocess,sys
from pathlib import Path
SERVICE_ROOT=Path(__file__).resolve().parents[1];REPO_ROOT=SERVICE_ROOT.parents[1];sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.error_ledger_v11 import ErrorLedgerV11
from ai3d.production_v12 import quality_confidence_v12,autofix_progress_gate_v12

def load(p:Path|None):
    if p and p.is_file():
        try:return json.loads(p.read_text(encoding="utf-8"))
        except Exception:return {}
    return {}
def run(cmd,cwd,timeout=3600):
    p=subprocess.run(cmd,cwd=str(cwd),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=False,timeout=timeout);return {"command":" ".join(cmd),"passed":p.returncode==0,"returnCode":p.returncode,"logTail":p.stdout[-12000:]}
def main():
    ap=argparse.ArgumentParser(description="Full cumulative V12 verifier")
    ap.add_argument("--ledger",type=Path,default=SERVICE_ROOT/"runtime/quality/error-ledger-v11.json");ap.add_argument("--require-compatibility",action="store_true");ap.add_argument("--shader-samples",type=Path);ap.add_argument("--pressure-samples",type=Path);ap.add_argument("--include-release-gate",action="store_true");ap.add_argument("--autofix-report",type=Path);ap.add_argument("--output",type=Path,default=SERVICE_ROOT/"runtime/quality/mesh-v12-verification.json");args=ap.parse_args()
    cmd=[sys.executable,"scripts/run_zero_error_loop_v12.py","--cycles","1","--ledger",str(args.ledger)]
    if args.include_release_gate:cmd.append("--include-release-gate")
    if args.require_compatibility:cmd.append("--require-compatibility")
    if args.shader_samples:cmd.extend(["--shader-samples",str(args.shader_samples)])
    if args.pressure_samples:cmd.extend(["--pressure-samples",str(args.pressure_samples)])
    maincheck=run(cmd,SERVICE_ROOT)
    zero=load(SERVICE_ROOT/"runtime/quality/zero-error-loop-v12.json");adv=load(SERVICE_ROOT/"runtime/quality/adversarial-corpus-v12.json");hyg=load(SERVICE_ROOT/"runtime/quality/artifact-hygiene-v12.json");compat=load(SERVICE_ROOT/"runtime/quality/compatibility-matrix-v12.json") if args.require_compatibility else {"passed":True,"status":"NOT_REQUIRED"};shader=load(SERVICE_ROOT/"runtime/quality/shader-stutter-v12.json") if args.shader_samples else {"passed":True,"status":"NOT_REQUIRED"};pressure=load(SERVICE_ROOT/"runtime/quality/pressure-v12.json") if args.pressure_samples else {"passed":True,"status":"NOT_REQUIRED"}
    auto=load(args.autofix_report);auto_gate=(auto.get("progress") or autofix_progress_gate_v12(auto.get("attempts") or [])) if auto else {"passed":True,"status":"NOT_REQUESTED"}
    # Runtime/fleet/profiler/Roblox remain non-compensating external evidence. Their absent state must not be mislabeled full-production evidence.
    confidence=quality_confidence_v12({"static":maincheck["passed"],"zeroErrors":zero,"regression":zero,"adversarial":adv,"compatibility":compat,"shaderStutter":shader,"pressure":pressure,"runtime":0.0,"fleet":0.0,"profiler":0.0,"roblox":0.0})
    ledger=ErrorLedgerV11(args.ledger)
    report={"schemaVersion":12,"status":zero.get("status","CONTINUE_FIX_LOOP_V12"),"passed":bool(maincheck["passed"] and zero.get("passed")),"localConvergence":zero,"adversarial":adv,"artifactHygiene":hyg,"compatibility":compat,"shaderStutter":shader,"pressure":pressure,"autofix":auto_gate,"qualityConfidence":confidence,"externalBlockers":ledger.proven_external_blockers(),"fullProductionEvidence":bool(confidence.get("passed")),"rule":"Local convergence does not equal full production evidence. Desktop AI must continue fixing all local errors; external runtime evidence stays explicitly unverified until measured."}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report["passed"] else 1)
if __name__=="__main__":main()
