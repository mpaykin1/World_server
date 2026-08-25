from __future__ import annotations

import argparse, hashlib, json, os, shlex, subprocess, sys, time
from pathlib import Path

SERVICE_ROOT=Path(__file__).resolve().parents[1]
REPO_ROOT=SERVICE_ROOT.parents[1]
sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.error_ledger_v11 import ErrorLedgerV11, close_resolved_check_failures, harvest_failed_checks, zero_known_fixable_errors_gate

DEFAULT_CHECKS=[
    [sys.executable,"-m","unittest","discover","-s","tests","-p","test_*.py"],
    [sys.executable,"scripts/run_fault_injection_v11.py","--output","runtime/quality/fault-injection-v11.json"],
    ["npm","run","check"], ["npm","run","quality:check"], ["npm","run","quality:regression"],
    ["npm","run","duplicates:check"], ["npm","run","contracts:check"],
]


def run(cmd,cwd,timeout):
    p=subprocess.run(cmd,cwd=str(cwd),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=False,timeout=timeout)
    out=p.stdout or ""
    return {"command":" ".join(map(str,cmd)),"passed":p.returncode==0,"returnCode":p.returncode,"logTail":out[-12000:],"category":"verification"}


def run_checks(timeout, include_release_gate=False):
    rows=[]
    commands=list(DEFAULT_CHECKS) + ([["npm","run","release:gate"]] if include_release_gate else [])
    for cmd in commands:
        cwd=SERVICE_ROOT if cmd[0]==sys.executable else REPO_ROOT
        rows.append(run(cmd,cwd,timeout))
    return rows


def main():
    ap=argparse.ArgumentParser(description="V11 fail-closed convergence runner. It never reports success while a fixable error is known.")
    ap.add_argument("--ledger",type=Path,default=SERVICE_ROOT/"runtime"/"quality"/"error-ledger-v11.json")
    ap.add_argument("--report",type=Path,default=SERVICE_ROOT/"runtime"/"quality"/"zero-error-loop-v11.json")
    ap.add_argument("--timeout",type=int,default=1800)
    ap.add_argument("--autofix-command",default=os.environ.get("AI3D_DESKTOP_AUTOFIX_COMMAND",""))
    ap.add_argument("--cycles",type=int,default=1,help="Verification cycles in this process. Desktop AI must rerun after each code fix until PASS.")
    ap.add_argument("--include-release-gate",action="store_true")
    args=ap.parse_args()
    ledger=ErrorLedgerV11(args.ledger)
    history=[]
    cycles=max(1,args.cycles)
    for cycle in range(1,cycles+1):
        checks=run_checks(args.timeout,args.include_release_gate)
        failed=[c for c in checks if not c["passed"]]
        closed=close_resolved_check_failures(ledger,checks)
        fingerprints=harvest_failed_checks(ledger,checks)
        run_hash=ledger.append_run({"cycle":cycle,"checks":[{"command":c["command"],"passed":c["passed"],"returnCode":c["returnCode"]} for c in checks]})
        ledger.save()
        history.append({"cycle":cycle,"runHash":run_hash,"checks":checks,"newFailureFingerprints":fingerprints,"closedFingerprints":closed})
        if not failed and zero_known_fixable_errors_gate(ledger).get("passed"):
            break
        if args.autofix_command and failed:
            env=os.environ.copy();env["AI3D_ERROR_LEDGER"]=str(args.ledger);env["AI3D_ZERO_ERROR_REPORT"]=str(args.report)
            subprocess.run(args.autofix_command,shell=True,cwd=str(REPO_ROOT),env=env,check=False)
        elif failed:
            break
    zero=zero_known_fixable_errors_gate(ledger)
    report={"schemaVersion":11,"status":"ZERO_KNOWN_FIXABLE_ERRORS" if zero.get("passed") else "CONTINUE_FIX_LOOP","passed":bool(zero.get("passed") and all(c["passed"] for c in history[-1]["checks"])),"zeroKnownErrors":zero,"history":history,"rule":"If status is CONTINUE_FIX_LOOP, Desktop AI must fix the listed root causes, add/retain regression protection, then rerun this gate. Do not declare completion."}
    args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report["passed"] else 1)
if __name__=="__main__":main()
