from pathlib import Path
import json

def evaluate_regression(report, validation, gate, cfg):
    issues=[]
    if cfg.get("require_green_gate",True) and gate.get("status")!="green":
        issues.append("quality_gate_not_green")
    perf=report.get("performance",{})
    if perf.get("desktop_readiness",0) < cfg.get("min_desktop_readiness",75):
        issues.append("desktop_readiness_below_threshold")
    if perf.get("mobile_readiness",0) < cfg.get("min_mobile_readiness",65):
        issues.append("mobile_readiness_below_threshold")
    if validation.get("status")!="ok":
        issues.append("validation_failed")
    return {"status":"pass" if not issues else "fail","issues":issues,"issue_count":len(issues)}

def write_regression_report(out_dir, data):
    p=Path(out_dir)/"REGRESSION_REPORT.json"
    p.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
    return str(p)
