from pathlib import Path
import json

def build_issue_report(report, validation, perf):
    issues = []
    if report["scene"].get("status") != "ok":
        issues.append("scene reconstruction weak")
    if report["avatar"].get("status") != "ok":
        issues.append("avatar tracking weak")
    if validation.get("status") != "ok":
        issues.extend(validation.get("errors", []))
    if perf.get("mobile_readiness", 0) < 70:
        issues.append("mobile performance below target")
    if perf.get("desktop_readiness", 0) < 75:
        issues.append("desktop performance below target")
    return {
        "status": "green" if not issues else "needs_work",
        "issue_count": len(issues),
        "issues": issues,
    }

def write_quality_gate(out_dir, gate_report):
    path = Path(out_dir) / "QUALITY_GATE.json"
    path.write_text(json.dumps(gate_report, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(path)
