from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
from pathlib import Path
import sys

SERVICE_ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.production_v10 import validate_roblox_verification_result_v10


def main():
    ap=argparse.ArgumentParser(description="Run a provisioned Roblox Studio bridge against a V10 verification contract.")
    ap.add_argument("--contract",type=Path,required=True)
    ap.add_argument("--place",type=Path)
    ap.add_argument("--script",type=Path)
    ap.add_argument("--output",type=Path,default=Path("roblox-studio-v10.json"))
    args=ap.parse_args()
    contract=json.loads(args.contract.read_text(encoding="utf-8"))
    marker=str(contract.get("marker") or "[AI3D_V10_ROBLOX_VERIFY]")
    template=os.environ.get("ROBLOX_STUDIO_VERIFY_COMMAND","").strip() or os.environ.get("ROBLOX_STUDIO_VERIFY_CMD","").strip()
    runner=shutil.which("run-in-roblox") or shutil.which("run-in-roblox.exe")
    if not template and runner and args.place and args.script:
        template=f'"{runner}" --place "{{place}}" --script "{{script}}"'
    report={"schemaVersion":10,"status":"UNPROVISIONED","passed":False,"contractSha256":contract.get("contractSha256")}
    if not template:
        report["reason"]="No Roblox Studio automation runner is provisioned; no place-side PASS can be emitted."
    else:
        cmd=template.format(place=str(args.place or ""),script=str(args.script or ""),output=str(args.output),contract=str(args.contract))
        proc=subprocess.run(cmd if os.name=="nt" else shlex.split(cmd),shell=os.name=="nt",stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=False,timeout=1800)
        match=re.search(re.escape(marker)+r"(\{.*?\})(?:\r?\n|$)",proc.stdout,re.S)
        payload={}
        if match:
            try: payload=json.loads(match.group(1))
            except Exception: payload={}
        if payload:
            payload.setdefault("marker",marker); payload.setdefault("contractSha256",contract.get("contractSha256"))
            payload.setdefault("automation",{})
            payload["automation"].update({"studioLaunched":True,"commandVerified":proc.returncode==0,"resultCaptured":True})
        gate=validate_roblox_verification_result_v10(payload,contract)
        report={**payload,**gate,"commandReturnCode":proc.returncode,"logTail":proc.stdout[-5000:]}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
    raise SystemExit(0 if report.get("passed") or report.get("status")=="UNPROVISIONED" else 1)


if __name__=="__main__": main()
