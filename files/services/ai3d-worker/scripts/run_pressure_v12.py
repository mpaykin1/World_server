from __future__ import annotations
import argparse,json,sys
from pathlib import Path
SERVICE_ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.production_v12 import thermal_memory_pressure_gate_v12

def load(p:Path):
    d=json.loads(p.read_text(encoding="utf-8"));return d if isinstance(d,list) else d.get("rows",d.get("samples",[]))
def main():
    ap=argparse.ArgumentParser();ap.add_argument("input",type=Path);ap.add_argument("--output",type=Path,default=SERVICE_ROOT/"runtime/quality/pressure-v12.json");args=ap.parse_args();gate=thermal_memory_pressure_gate_v12(load(args.input));args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(gate,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(json.dumps(gate,ensure_ascii=False,indent=2));raise SystemExit(0 if gate["passed"] else 1)
if __name__=="__main__":main()
