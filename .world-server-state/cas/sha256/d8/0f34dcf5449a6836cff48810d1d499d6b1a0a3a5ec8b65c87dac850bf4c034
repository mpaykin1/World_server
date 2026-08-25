from __future__ import annotations
import argparse,hashlib,json,sys,time
from datetime import datetime,timezone
from pathlib import Path
SERVICE_ROOT=Path(__file__).resolve().parents[1];REPO_ROOT=SERVICE_ROOT.parents[1];sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.error_ledger_v11 import ErrorLedgerV11

def main():
    ap=argparse.ArgumentParser(description="Promote V11 verified fixes into World_server error-prevention-registry without deleting existing rules.")
    ap.add_argument("--ledger",type=Path,default=SERVICE_ROOT/"runtime"/"quality"/"error-ledger-v11.json")
    ap.add_argument("--registry",type=Path,default=REPO_ROOT/"data"/"error-prevention-registry.json")
    ap.add_argument("--output",type=Path);args=ap.parse_args()
    ledger=ErrorLedgerV11(args.ledger)
    if not args.registry.is_file(): raise SystemExit(f"Registry missing: {args.registry}")
    reg=json.loads(args.registry.read_text(encoding="utf-8"));reg.setdefault("events",[]);reg.setdefault("knownErrors",[])
    existing={str(x.get("id")) for x in reg["knownErrors"] if isinstance(x,dict)};event_keys={(str(x.get("fingerprint")),str(x.get("type"))) for x in reg["events"] if isinstance(x,dict)}
    added=[]
    for row in ledger.fixed_verified():
        fp=str(row.get("fingerprint") or "");short=fp[:12];rid=f"ai3d-v11-{short}"
        if rid not in existing:
            reg["knownErrors"].append({"id":rid,"category":row.get("category") or "ai3d","severity":"release-blocker","status":"protected","symptom":str(row.get("message") or "")[:500],"rootCause":row.get("rootCause") or "verified fix from V11 ledger","protection":[str(row.get("regressionTest") or "V11 regression verifier"),"zero-known-fixable-errors gate"],"fingerprint":fp})
            existing.add(rid);added.append(rid)
        key=(fp,"FIX_CONFIRMED_V11")
        if key not in event_keys:
            reg["events"].append({"type":"FIX_CONFIRMED_V11","fingerprint":fp,"knownErrorId":rid,"at":datetime.now(timezone.utc).isoformat(),"verificationHash":row.get("verificationHash"),"regressionTest":row.get("regressionTest")});event_keys.add(key)
    target=args.output or args.registry;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(reg,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"schemaVersion":11,"addedKnownErrors":added,"fixedVerified":len(ledger.fixed_verified()),"output":str(target)},ensure_ascii=False,indent=2))
if __name__=="__main__":main()
