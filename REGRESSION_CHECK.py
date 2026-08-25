from pathlib import Path
import json, sys

p=Path(sys.argv[1] if len(sys.argv)>1 else "build/game")
required=["PIPELINE_REPORT.json","VALIDATION_REPORT.json","QUALITY_GATE.json","REGRESSION_REPORT.json"]
missing=[x for x in required if not (p/x).exists()]
if missing:
    print("FAIL missing:", ", ".join(missing))
    raise SystemExit(2)
reg=json.loads((p/"REGRESSION_REPORT.json").read_text(encoding="utf-8"))
print(json.dumps(reg,ensure_ascii=False,indent=2))
raise SystemExit(0 if reg.get("status")=="pass" else 3)
