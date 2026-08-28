from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import tempfile
from pathlib import Path
import sys

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))
from ai3d.production_v10 import device_farm_integrity_gate_v10


def load_rows(path: Path) -> list[dict]:
    if not path.is_file(): return []
    try: data = json.loads(path.read_text(encoding="utf-8"))
    except Exception: return []
    if isinstance(data, list): return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict): return [x for x in data.get("rows", [data]) if isinstance(x, dict)]
    return []


def main():
    ap=argparse.ArgumentParser(description="Execute a configured real-device provider and integrity-gate V10 evidence.")
    ap.add_argument("--scene-url", required=True)
    ap.add_argument("--output", type=Path, default=Path("device-farm-v10.json"))
    ap.add_argument("--min-samples", type=int, default=180)
    ap.add_argument("--run", action="store_true")
    args=ap.parse_args()
    template=os.environ.get("AI3D_DEVICE_FARM_COMMAND","").strip() or os.environ.get("AI3D_DEVICE_FARM_RUNNER_CMD","").strip()
    report={"schemaVersion":10,"sceneUrl":args.scene_url,"executed":False,"status":"PLAN_ONLY","integrity":{"status":"UNVERIFIED","passed":False}}
    if args.run and not template:
        report.update({"status":"UNPROVISIONED","reason":"No AI3D_DEVICE_FARM_COMMAND is configured; device discovery alone is not benchmark evidence."})
    elif args.run:
        with tempfile.TemporaryDirectory(prefix="ai3d-device-farm-v10-") as td:
            result=Path(td)/"result.json"
            cmd=template.format(scene_url=args.scene_url,output=str(result),service_root=str(SERVICE_ROOT))
            proc=subprocess.run(cmd if os.name=="nt" else shlex.split(cmd),shell=os.name=="nt",stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=False,timeout=3600)
            rows=load_rows(result)
            gate=device_farm_integrity_gate_v10(rows,{"minSamplesPerRun":args.min_samples,"requireBuildIdentity":True})
            report.update({"executed":True,"commandReturnCode":proc.returncode,"logTail":proc.stdout[-5000:],"rows":rows,"integrity":gate,"status":"CAPTURED_VERIFIED_EVIDENCE" if proc.returncode==0 and gate.get("passed") else "CAPTURED_UNVERIFIED_EVIDENCE"})
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
    raise SystemExit(0 if report["status"] in {"PLAN_ONLY","UNPROVISIONED","CAPTURED_VERIFIED_EVIDENCE"} else 1)


if __name__=="__main__": main()
