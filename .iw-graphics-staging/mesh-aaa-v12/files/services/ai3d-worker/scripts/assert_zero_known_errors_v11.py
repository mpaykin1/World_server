from __future__ import annotations
import argparse, json, sys
from pathlib import Path

SERVICE_ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.error_ledger_v11 import ErrorLedgerV11, zero_known_fixable_errors_gate
from ai3d.production_v11 import regression_closure_gate_v11


def main():
    ap=argparse.ArgumentParser(description="Fail closed unless the V11 error ledger has zero known fixable errors.")
    ap.add_argument("--ledger",type=Path,default=SERVICE_ROOT/"runtime"/"quality"/"error-ledger-v11.json")
    ap.add_argument("--output",type=Path)
    args=ap.parse_args()
    ledger=ErrorLedgerV11(args.ledger)
    zero=zero_known_fixable_errors_gate(ledger)
    closure=regression_closure_gate_v11(ledger.data)
    report={"schemaVersion":11,"zeroKnownErrors":zero,"regressionClosure":closure,"passed":bool(zero.get("passed") and closure.get("passed")),"externalBlockers":ledger.proven_external_blockers()}
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report["passed"] else 1)
if __name__=="__main__":main()
