from __future__ import annotations
import argparse,json,subprocess,sys
from pathlib import Path
SERVICE_ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.production_v12 import artifact_hygiene_gate_v12

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--root",type=Path);ap.add_argument("--git-tracked-repo",type=Path);ap.add_argument("--output",type=Path,default=SERVICE_ROOT/"runtime/quality/artifact-hygiene-v12.json");args=ap.parse_args()
    if args.git_tracked_repo:
        repo=args.git_tracked_repo.resolve();raw=subprocess.check_output(["git","ls-files"],cwd=str(repo),text=True);paths=[Path(x.strip()) for x in raw.splitlines() if x.strip()]
        gate=artifact_hygiene_gate_v12(paths)
    else:
        gate=artifact_hygiene_gate_v12((args.root or SERVICE_ROOT).resolve())
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(gate,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(gate,ensure_ascii=False,indent=2));raise SystemExit(0 if gate["passed"] else 1)
if __name__=="__main__":main()
