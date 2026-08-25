from __future__ import annotations
import argparse,json,shlex,subprocess,time
from pathlib import Path
import sys
SERVICE_ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.production_v11 import flaky_test_gate_v11

def main():
    ap=argparse.ArgumentParser(description="Repeat a check to expose flaky green/red behavior.")
    ap.add_argument("--command",required=True);ap.add_argument("--cwd",type=Path,default=Path.cwd());ap.add_argument("--repeats",type=int,default=3);ap.add_argument("--output",type=Path,default=Path("stability-v11.json"));ap.add_argument("--timeout",type=int,default=1800);args=ap.parse_args()
    rows=[]
    for i in range(max(3,args.repeats)):
        p=subprocess.run(args.command,shell=True,cwd=str(args.cwd),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=args.timeout,check=False)
        rows.append({"name":args.command,"iteration":i+1,"passed":p.returncode==0,"returnCode":p.returncode,"logTail":p.stdout[-4000:]})
    gate=flaky_test_gate_v11(rows,{"minRepeats":max(3,args.repeats)})
    report={"schemaVersion":11,"rows":rows,"gate":gate,"passed":gate.get("passed")}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report["passed"] else 1)
if __name__=="__main__":main()
