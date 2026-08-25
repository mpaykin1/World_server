from __future__ import annotations
import argparse,json,subprocess,time
from pathlib import Path
import sys
SERVICE_ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.production_v11 import reproducibility_gate_v11

def load(path):
    try:return json.loads(path.read_text(encoding="utf-8"))
    except Exception:return {"_readError":True}

def main():
    ap=argparse.ArgumentParser(description="Run the same deterministic pipeline command repeatedly and compare normalized JSON results.")
    ap.add_argument("--command",required=True);ap.add_argument("--result-file",type=Path,required=True);ap.add_argument("--cwd",type=Path,default=Path.cwd());ap.add_argument("--repeats",type=int,default=3);ap.add_argument("--output",type=Path,default=Path("reproducibility-v11.json"));ap.add_argument("--timeout",type=int,default=3600);args=ap.parse_args()
    rows=[]
    for i in range(max(3,args.repeats)):
        p=subprocess.run(args.command,shell=True,cwd=str(args.cwd),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=args.timeout,check=False)
        result=load(args.result_file) if args.result_file.is_file() else {"_missingResult":True,"returnCode":p.returncode}
        rows.append({"iteration":i+1,"commandPassed":p.returncode==0,"result":result})
        if p.returncode!=0: break
    gate=reproducibility_gate_v11(rows,{"minRuns":max(3,args.repeats),"minStableRatio":1.0})
    if not all(r.get("commandPassed") for r in rows): gate={**gate,"passed":False,"status":"COMMAND_FAILED"}
    report={"schemaVersion":11,"runs":rows,"gate":gate,"passed":gate.get("passed")}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report["passed"] else 1)
if __name__=="__main__":main()
