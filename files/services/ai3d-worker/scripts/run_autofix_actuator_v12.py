from __future__ import annotations
import argparse,json,os,subprocess,sys,time
from pathlib import Path
SERVICE_ROOT=Path(__file__).resolve().parents[1];REPO_ROOT=SERVICE_ROOT.parents[1];sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.error_ledger_v11 import ErrorLedgerV11
from ai3d.autofix_actuator_v12 import branch_safety_gate_v12,choose_issue_v12,run_autofix_command_v12,progress_report_v12

def verify(ledger:Path,include_release:bool,timeout:int)->dict:
    cmd=[sys.executable,"scripts/run_zero_error_loop_v12.py","--cycles","1","--ledger",str(ledger)]
    if include_release:cmd.append("--include-release-gate")
    p=subprocess.run(cmd,cwd=str(SERVICE_ROOT),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=False,timeout=timeout)
    data={}
    report=SERVICE_ROOT/"runtime/quality/zero-error-loop-v12.json"
    if report.is_file():
        try:data=json.loads(report.read_text(encoding="utf-8"))
        except Exception:pass
    return {"passed":p.returncode==0,"returnCode":p.returncode,"report":data,"logTail":p.stdout[-12000:]}

def main():
    ap=argparse.ArgumentParser(description="V12 guarded Desktop-AI autofix actuator. Default behavior never declares success until zero fixable errors.")
    ap.add_argument("--ledger",type=Path,default=SERVICE_ROOT/"runtime/quality/error-ledger-v11.json")
    ap.add_argument("--autofix-command",default=os.environ.get("AI3D_DESKTOP_AUTOFIX_COMMAND",""))
    ap.add_argument("--root-cause-command",default=os.environ.get("AI3D_DESKTOP_ROOT_CAUSE_COMMAND",""))
    ap.add_argument("--max-attempts",type=int,default=0,help="0 means no artificial attempt limit; convergence or proven blocker must end the loop.")
    ap.add_argument("--timeout",type=int,default=1800);ap.add_argument("--include-release-gate",action="store_true")
    ap.add_argument("--output",type=Path,default=SERVICE_ROOT/"runtime/quality/autofix-actuator-v12.json");args=ap.parse_args()
    safety=branch_safety_gate_v12(REPO_ROOT)
    if not safety.get("passed"):
        report={"schemaVersion":12,"status":"REFUSED_UNSAFE_BRANCH","passed":False,"continueRequired":True,"safety":safety};args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(2)
    attempts=[];attempt=0
    while True:
        before_ledger=ErrorLedgerV11(args.ledger);before={r["fingerprint"] for r in before_ledger.open_fixable()}
        v=verify(args.ledger,args.include_release_gate,args.timeout)
        after_ledger=ErrorLedgerV11(args.ledger);after={r["fingerprint"] for r in after_ledger.open_fixable()}
        if v["passed"] and not after:
            attempts.append({"attempt":attempt,"openBefore":sorted(before),"openAfter":[],"checksPassed":True,"introducedNew":[]})
            break
        issue=choose_issue_v12(after_ledger)
        if issue is None:
            attempts.append({"attempt":attempt,"openBefore":sorted(before),"openAfter":sorted(after),"checksPassed":False,"introducedNew":sorted(after-before),"verification":v});break
        escalation=str(issue.get("escalationLevel") or "")
        command=args.root_cause_command if escalation in {"ROOT_CAUSE_MODE","IMPACT_SCAN_REQUIRED","ARCHITECTURE_REVIEW_REQUIRED"} and args.root_cause_command else args.autofix_command
        if not command:
            attempts.append({"attempt":attempt,"openBefore":sorted(before),"openAfter":sorted(after),"checksPassed":False,"introducedNew":sorted(after-before),"status":"AUTOFIX_COMMAND_REQUIRED","issue":issue});break
        fix=run_autofix_command_v12(repo=REPO_ROOT,ledger_path=args.ledger,command=command,issue=issue,timeout=args.timeout)
        attempt+=1
        attempts.append({"attempt":attempt,"openBefore":sorted(before),"openAfter":sorted(after),"checksPassed":False,"introducedNew":sorted(after-before),"issue":issue,"fix":fix})
        if args.max_attempts>0 and attempt>=args.max_attempts:break
    progress=progress_report_v12(attempts)
    report={"schemaVersion":12,"status":progress["status"],"passed":progress["passed"],"continueRequired":progress["continueRequired"],"safety":safety,"attempts":attempts,"progress":progress,"rule":"Do not stop while continueRequired=true. If automation cannot progress, Desktop AI must enter broader root-cause/impact analysis and continue."}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report["passed"] else 1)
if __name__=="__main__":main()
