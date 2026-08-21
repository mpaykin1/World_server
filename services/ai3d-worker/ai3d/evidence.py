from __future__ import annotations

from typing import Any

SCHEMA = "ai3d-evidence-v1"


def verified(percent: int | float, evidence: list[str], **extra: Any) -> dict[str, Any]:
    if not isinstance(percent, (int, float)):
        raise ValueError("VERIFIED percent must be numeric 0..100")
    if not (0 <= percent <= 100):
        raise ValueError("VERIFIED percent out of range 0..100")
    if not evidence or not isinstance(evidence, list) or not all(isinstance(e, str) and e.strip() for e in evidence):
        raise ValueError("VERIFIED requires non-empty evidence[]")
    out: dict[str, Any] = {"status": "VERIFIED", "percent": float(percent) if isinstance(percent, float) else int(percent), "evidence": list(evidence)}
    out.update(extra)
    return out


def estimated(estimatedPercent: int | float, basis: list[str], **extra: Any) -> dict[str, Any]:
    if not isinstance(estimatedPercent, (int, float)):
        raise ValueError("ESTIMATED estimatedPercent must be numeric")
    if not (0 <= estimatedPercent <= 100):
        raise ValueError("ESTIMATED estimatedPercent out of range")
    if not basis or not isinstance(basis, list) or not all(isinstance(e, str) and e.strip() for e in basis):
        raise ValueError("ESTIMATED requires non-empty basis[]")
    if "percent" in extra:
        raise ValueError("ESTIMATED must not have percent, use estimatedPercent")
    out: dict[str, Any] = {"status": "ESTIMATED", "estimatedPercent": float(estimatedPercent) if isinstance(estimatedPercent, float) else int(estimatedPercent), "basis": list(basis)}
    out.update(extra)
    return out


def untested(reason: str, **extra: Any) -> dict[str, Any]:
    if not reason or not isinstance(reason, str) or not reason.strip():
        raise ValueError("UNTESTED requires non-empty reason")
    if "percent" in extra or "estimatedPercent" in extra:
        raise ValueError("UNTESTED must not have percent/estimatedPercent")
    out: dict[str, Any] = {"status": "UNTESTED", "reason": reason.strip()}
    out.update(extra)
    return out


def enforce_evidence_report(report: dict[str, Any]) -> None:
    """
    Validates the entire evidence report against ai3d-evidence-v1 rules.
    Raises ValueError on first violation (CI FAIL).
    """
    if not isinstance(report, dict):
        raise ValueError("Report must be dict")
    if report.get("evidencePolicy") != SCHEMA:
        raise ValueError(f"evidencePolicy must be {SCHEMA}")

    quality = report.get("qualityEvidence")
    if not isinstance(quality, dict):
        raise ValueError("qualityEvidence must be dict")

    for key, metric in quality.items():
        if not isinstance(metric, dict):
            raise ValueError(f"Metric {key} must be dict")
        status = metric.get("status")
        if status not in ("VERIFIED", "ESTIMATED", "UNTESTED"):
            raise ValueError(f"Metric {key} has invalid status {status}")

        has_percent = "percent" in metric
        has_estimated = "estimatedPercent" in metric
        has_evidence = "evidence" in metric
        has_basis = "basis" in metric
        has_reason = "reason" in metric

        if status == "VERIFIED":
            if not has_percent:
                raise ValueError(f"VERIFIED {key} must have percent")
            if has_estimated:
                raise ValueError(f"VERIFIED {key} must not have estimatedPercent")
            if not has_evidence or not metric["evidence"]:
                raise ValueError(f"VERIFIED {key} requires evidence[]")
            # percent already validated to be numeric by constructors, but double-check
            p = metric["percent"]
            if not isinstance(p, (int, float)) or not (0 <= p <= 100):
                raise ValueError(f"VERIFIED {key} percent invalid")

        elif status == "ESTIMATED":
            if has_percent:
                raise ValueError(f"ESTIMATED {key} must not have percent")
            if not has_estimated:
                raise ValueError(f"ESTIMATED {key} must have estimatedPercent")
            if not has_basis or not metric["basis"]:
                raise ValueError(f"ESTIMATED {key} requires basis[]")

        elif status == "UNTESTED":
            if has_percent or has_estimated:
                raise ValueError(f"UNTESTED {key} must not have percent/estimatedPercent")
            if not has_reason or not str(metric["reason"]).strip():
                raise ValueError(f"UNTESTED {key} requires reason")

    # Specific gates from the task
    # 5. placeholder Real Image->3D >0
    real = quality.get("Real Image->3D Artifact %") or quality.get("Real Image→3D Artifact %")
    if real:
        if real.get("status") == "VERIFIED":
            # Check if underlying mesh was placeholder (evidence should contain placeholder flag)
            ev = " ".join(real.get("evidence", [])).lower()
            is_placeholder_ev = "placeholder" in ev and "not real" in ev
            # Also check explicit flag if present
            if real.get("isPlaceholder") or is_placeholder_ev:
                if real.get("percent", 0) != 0:
                    raise ValueError("PLACEHOLDER Real Image->3D must be VERIFIED 0%")

    # 6. Godot VERIFIED without runtime
    godot = quality.get("Godot Runtime Compatibility %")
    if godot and godot.get("status") == "VERIFIED":
        ev = " ".join(godot.get("evidence", [])).lower()
        if "runtime" not in ev and "godot import" not in ev:
            # Also check for explicit runtime flag
            if not godot.get("runtimeTested"):
                raise ValueError("Godot VERIFIED requires runtime test evidence")

    # 7. Depth Accuracy VERIFIED without ground truth
    depth = quality.get("Depth Accuracy %")
    if depth and depth.get("status") == "VERIFIED":
        ev = " ".join(depth.get("evidence", [])).lower()
        if "ground truth" not in ev and "ground_truth" not in ev:
            raise ValueError("Depth Accuracy VERIFIED requires ground truth evidence")

    # 8. Silhouette/Structural/Texture VERIFIED without render-back
    for k in ["Silhouette Accuracy %", "Structural Similarity %", "Texture Quality %"]:
        m = quality.get(k)
        if m and m.get("status") == "VERIFIED":
            ev = " ".join(m.get("evidence", [])).lower()
            if "render" not in ev and "render-back" not in ev:
                raise ValueError(f"{k} VERIFIED requires render-back evidence")
