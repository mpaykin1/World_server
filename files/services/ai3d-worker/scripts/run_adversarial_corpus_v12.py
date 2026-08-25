from __future__ import annotations
import argparse,json,sys
from pathlib import Path
SERVICE_ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.adversarial_v12 import build_minimal_glb_v12,inspect_glb_bytes_v12
from ai3d.production_v12 import adversarial_corpus_gate_v12

FAULTS=["bad_magic","truncated_glb","length_mismatch","missing_bin_chunk","nan_vertex","index_oob","degenerate_mesh","invalid_material_numeric","invalid_rig_weights","animation_nan"]

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--output",type=Path,default=SERVICE_ROOT/"runtime/quality/adversarial-corpus-v12.json");args=ap.parse_args()
    rows=[]
    for fault in FAULTS:
        inspection=inspect_glb_bytes_v12(build_minimal_glb_v12(bad=fault))
        rows.append({"faultClass":fault,"detected":fault in inspection.get("failures",[]),"detectorFailedClosed":not inspection.get("valid",True),"inspection":inspection})
    gate=adversarial_corpus_gate_v12(rows,{"requiredFaultClasses":FAULTS})
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(gate,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(gate,ensure_ascii=False,indent=2));raise SystemExit(0 if gate["passed"] else 1)
if __name__=="__main__":main()
