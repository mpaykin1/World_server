from __future__ import annotations
import argparse,json,subprocess,sys
from pathlib import Path
SERVICE_ROOT=Path(__file__).resolve().parents[1];REPO_ROOT=SERVICE_ROOT.parents[1];sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.error_ledger_v11 import ErrorLedgerV11,close_resolved_check_failures,harvest_failed_checks
from ai3d.production_v12 import convergence_gate_v12

def run(cmd,cwd,timeout):
    p=subprocess.run(cmd,cwd=str(cwd),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=False,timeout=timeout)
    return {"command":" ".join(map(str,cmd)),"passed":p.returncode==0,"returnCode":p.returncode,"logTail":p.stdout[-12000:]}
def load(p:Path):
    if p.is_file():
        try:return json.loads(p.read_text(encoding="utf-8"))
        except Exception:return {}
    return {}
def main():
    ap=argparse.ArgumentParser();ap.add_argument("--ledger",type=Path,default=SERVICE_ROOT/"runtime/quality/error-ledger-v11.json");ap.add_argument("--cycles",type=int,default=1);ap.add_argument("--include-release-gate",action="store_true");ap.add_argument("--require-compatibility",action="store_true");ap.add_argument("--shader-samples",type=Path);ap.add_argument("--pressure-samples",type=Path);ap.add_argument("--timeout",type=int,default=1800);ap.add_argument("--output",type=Path,default=SERVICE_ROOT/"runtime/quality/zero-error-loop-v12.json");args=ap.parse_args()
    history=[]
    for cycle in range(1,max(1,args.cycles)+1):
        v11cmd=[sys.executable,"scripts/run_zero_error_loop_v11.py","--cycles","1","--ledger",str(args.ledger)]
        if args.include_release_gate:v11cmd.append("--include-release-gate")
        checks=[
            run([sys.executable,"-W","error::ResourceWarning","-m","unittest","discover","-s","tests","-p","test_*.py"],SERVICE_ROOT,args.timeout),
            run(v11cmd,SERVICE_ROOT,args.timeout),
            run([sys.executable,"scripts/run_adversarial_corpus_v12.py"],SERVICE_ROOT,args.timeout),
            run([sys.executable,"scripts/run_artifact_hygiene_v12.py","--git-tracked-repo",str(REPO_ROOT)],SERVICE_ROOT,args.timeout),
        ]
        if args.require_compatibility:checks.append(run([sys.executable,"scripts/run_compatibility_matrix_v12.py"],SERVICE_ROOT,args.timeout))
        if args.shader_samples:checks.append(run([sys.executable,"scripts/run_shader_stutter_v12.py",str(args.shader_samples)],SERVICE_ROOT,args.timeout))
        if args.pressure_samples:checks.append(run([sys.executable,"scripts/run_pressure_v12.py",str(args.pressure_samples)],SERVICE_ROOT,args.timeout))
        ledger=ErrorLedgerV11(args.ledger);closed=close_resolved_check_failures(ledger,checks);new=harvest_failed_checks(ledger,checks);ledger.append_run({"kind":"v12-zero-error-loop","cycle":cycle,"checks":[{"command":c["command"],"passed":c["passed"]} for c in checks]});ledger.save()
        v11=load(SERVICE_ROOT/"runtime/quality/zero-error-loop-v11.json");hyg=load(SERVICE_ROOT/"runtime/quality/artifact-hygiene-v12.json");adv=load(SERVICE_ROOT/"runtime/quality/adversarial-corpus-v12.json");compat=load(SERVICE_ROOT/"runtime/quality/compatibility-matrix-v12.json") if args.require_compatibility else {"status":"NOT_REQUIRED","passed":True};shader=load(SERVICE_ROOT/"runtime/quality/shader-stutter-v12.json") if args.shader_samples else {"status":"NOT_REQUIRED","passed":True};pressure=load(SERVICE_ROOT/"runtime/quality/pressure-v12.json") if args.pressure_samples else {"status":"NOT_REQUIRED","passed":True}
        conv=convergence_gate_v12(v11=v11,artifact_hygiene=hyg,adversarial=adv,compatibility=compat,shader_stutter=shader,pressure=pressure,external_blockers=ledger.proven_external_blockers(),policy={"requireCompatibility":args.require_compatibility,"requireShaderStutter":bool(args.shader_samples),"requirePressure":bool(args.pressure_samples)})
        history.append({"cycle":cycle,"checks":checks,"closedFingerprints":closed,"newFailureFingerprints":new,"convergence":conv})
        if conv.get("passed"):break
        # Do not spin without a code change; Desktop AI/autofix actuator must fix root cause then rerun.
        break
    final=history[-1]["convergence"]
    report={"schemaVersion":12,"status":final["status"],"passed":bool(final["passed"]),"continueRequired":not bool(final["passed"]),"history":history,"rule":"If continueRequired=true, do not stop. Fix root cause, add/retain regression test, rerun all gates, and repeat until convergence or a proven external blocker."}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report["passed"] else 1)
if __name__=="__main__":main()
