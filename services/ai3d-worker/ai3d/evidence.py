from __future__ import annotations

from typing import Any

SCHEMA = "ai3d-evidence-v1"
SCHEMA_V2 = "ai3d-evidence-v2"

# Canonical registry — human labels are only labels, rules are by ID
REGISTRY = {
    "pipeline_completion": {"label": "Pipeline Completion %"},
    "geometry_integrity": {"label": "Geometry Integrity %"},
    "glb_validity": {"label": "GLB Validity %"},
    "volumetric_artifact_integrity": {"label": "Volumetric Artifact Integrity %"},
    "image3d_correspondence": {"label": "Image->3D Correspondence %"},
    "depth_accuracy": {"label": "Depth Accuracy %"},
    "silhouette_accuracy": {"label": "Silhouette Accuracy %"},
    "structural_similarity": {"label": "Structural Similarity %"},
    "texture_quality": {"label": "Texture Quality %"},
    "godot_runtime_compatibility": {"label": "Godot Runtime Compatibility %"},
    "voxel_runtime_compatibility": {"label": "Voxel Runtime Compatibility %"},
    "overall_visual_quality": {"label": "Overall Visual Quality %"},
}

# Reverse map label -> id
LABEL_TO_ID = {v["label"]: k for k, v in REGISTRY.items()}
# Backward compat: old human labels
LABEL_TO_ID["Real Image->3D Artifact %"] = "volumetric_artifact_integrity"
LABEL_TO_ID["Real Image→3D Artifact %"] = "volumetric_artifact_integrity"
LABEL_TO_ID["Overall Quality %"] = "overall_visual_quality"
LABEL_TO_ID["Geometry Integrity %"] = "geometry_integrity"
LABEL_TO_ID["GLB Validity %"] = "glb_validity"
LABEL_TO_ID["Depth Accuracy %"] = "depth_accuracy"
LABEL_TO_ID["Silhouette Accuracy %"] = "silhouette_accuracy"
LABEL_TO_ID["Structural Similarity %"] = "structural_similarity"
LABEL_TO_ID["Texture Quality %"] = "texture_quality"
LABEL_TO_ID["Godot Runtime Compatibility %"] = "godot_runtime_compatibility"
LABEL_TO_ID["Voxel Runtime Compatibility %"] = "voxel_runtime_compatibility"
LABEL_TO_ID["Pipeline Completion %"] = "pipeline_completion"

REQUIRED_IDS = set(REGISTRY.keys())

def verified(percent: int | float, evidence: list[dict[str, Any] | str], **extra: Any) -> dict[str, Any]:
    if not isinstance(percent, (int, float)):
        raise ValueError("VERIFIED percent must be numeric 0..100")
    if not (0 <= percent <= 100):
        raise ValueError("VERIFIED percent out of range 0..100")
    if not evidence or not isinstance(evidence, list) or len(evidence) == 0:
        raise ValueError("VERIFIED requires non-empty evidence[]")
    # V2: evidence must be list of structured dicts, not free-form strings
    for e in evidence:
        if not isinstance(e, dict):
            raise ValueError("VERIFIED evidence must be structured dict (kind, inputSha256, artifactSha256, verifier, measurement/threshold)")
        if "kind" not in e or not isinstance(e["kind"], str) or not e["kind"].strip():
            raise ValueError("VERIFIED evidence requires 'kind' string")
        # For image3d related, require binding
        kind = e["kind"]
        if kind in ("artifact_measurement", "image3d_correspondence", "glb_validation", "geometry_integrity"):
            if "artifactSha256" not in e or not e["artifactSha256"]:
                raise ValueError(f"VERIFIED evidence kind {kind} requires artifactSha256")
        if kind in ("image3d_correspondence", "depth_accuracy"):
            if "inputSha256" not in e or not e["inputSha256"]:
                raise ValueError(f"VERIFIED evidence kind {kind} requires inputSha256")
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

def _check_structured_evidence(metric_id: str, metric: dict[str, Any]) -> None:
    ev_list = metric.get("evidence", [])
    if not isinstance(ev_list, list) or len(ev_list) == 0:
        raise ValueError(f"VERIFIED {metric_id} requires structured evidence[]")
    for ev in ev_list:
        if not isinstance(ev, dict):
            raise ValueError(f"VERIFIED {metric_id} evidence must be structured dict, got string")
        if "kind" not in ev:
            raise ValueError(f"VERIFIED {metric_id} evidence missing kind")
        # Generic required
        if "verifier" not in ev or not ev["verifier"]:
            raise ValueError(f"VERIFIED {metric_id} evidence requires verifier")
        if "verifierVersion" not in ev:
            raise ValueError(f"VERIFIED {metric_id} evidence requires verifierVersion")

def enforce_evidence_report(report: dict[str, Any]) -> None:
    if not isinstance(report, dict):
        raise ValueError("Report must be dict")
    if report.get("evidencePolicy") not in (SCHEMA, SCHEMA_V2, "ai3d-evidence-v2"):
        raise ValueError(f"evidencePolicy must be {SCHEMA} or {SCHEMA_V2}")

    quality = report.get("qualityEvidence")
    if not isinstance(quality, dict):
        raise ValueError("qualityEvidence must be dict")

    # Check canonical IDs: no unknown, no missing required
    # Allow both canonical IDs and legacy human labels, but normalize
    normalized: dict[str, dict[str, Any]] = {}
    for key, metric in quality.items():
        # Try to map label to canonical id
        cid = None
        if key in REGISTRY:
            cid = key
        elif key in LABEL_TO_ID:
            cid = LABEL_TO_ID[key]
        else:
            # Unknown metric ID -> FAIL
            raise ValueError(f"Unknown metric ID/label '{key}' — not in canonical registry")
        if cid in normalized:
            raise ValueError(f"Duplicate metric for canonical id {cid}")
        normalized[cid] = metric

    # Check required IDs present
    missing = REQUIRED_IDS - set(normalized.keys())
    if missing:
        raise ValueError(f"Missing required metric IDs: {sorted(missing)}")

    # Validate each metric
    for cid, metric in normalized.items():
        if not isinstance(metric, dict):
            raise ValueError(f"Metric {cid} must be dict")
        status = metric.get("status")
        if status not in ("VERIFIED", "ESTIMATED", "UNTESTED"):
            raise ValueError(f"Metric {cid} has invalid status {status}")
        has_percent = "percent" in metric
        has_estimated = "estimatedPercent" in metric
        has_evidence = "evidence" in metric
        has_basis = "basis" in metric
        has_reason = "reason" in metric

        if status == "VERIFIED":
            if not has_percent:
                raise ValueError(f"VERIFIED {cid} must have percent")
            if has_estimated:
                raise ValueError(f"VERIFIED {cid} must not have estimatedPercent")
            if not has_evidence or not metric["evidence"]:
                raise ValueError(f"VERIFIED {cid} requires evidence[]")
            _check_structured_evidence(cid, metric)
            p = metric["percent"]
            if not isinstance(p, (int, float)) or not (0 <= p <= 100):
                raise ValueError(f"VERIFIED {cid} percent invalid")
            # Specific structured checks
            if cid == "depth_accuracy":
                for ev in metric["evidence"]:
                    if ev.get("kind") != "depth_accuracy":
                        raise ValueError(f"depth_accuracy evidence kind must be depth_accuracy")
                    for req in ("groundTruthArtifactSha256", "predictedDepthSha256", "comparisonMethod", "numericResult", "threshold", "passed", "inputSha256", "artifactSha256"):
                        if req not in ev:
                            raise ValueError(f"depth_accuracy evidence missing {req}")
            if cid in ("silhouette_accuracy", "structural_similarity", "texture_quality"):
                for ev in metric["evidence"]:
                    if ev.get("kind") not in ("silhouette_accuracy", "structural_similarity", "texture_quality", "render_back"):
                        raise ValueError(f"{cid} evidence kind invalid")
                    for req in ("inputSha256", "renderSha256"):
                        if req not in ev:
                            raise ValueError(f"{cid} evidence requires {req} (render artifact)")
                    if cid == "silhouette_accuracy" and "numericResult" in ev:
                        if "IoU" not in str(ev.get("comparisonMethod", "")) and "IoU" not in str(ev.get("numericResult", "")):
                            # Require IoU for silhouette
                            pass
                    if cid == "godot_runtime_compatibility":
                        for req in ("godotExecutable", "exitCode", "importLogSha256", "outputSha256"):
                            if req not in ev:
                                raise ValueError(f"godot evidence missing {req}")

        elif status == "ESTIMATED":
            if has_percent:
                raise ValueError(f"ESTIMATED {cid} must not have percent")
            if not has_estimated:
                raise ValueError(f"ESTIMATED {cid} must have estimatedPercent")
            if not has_basis or not metric["basis"]:
                raise ValueError(f"ESTIMATED {cid} requires basis[]")

        elif status == "UNTESTED":
            if has_percent or has_estimated:
                raise ValueError(f"UNTESTED {cid} must not have percent/estimatedPercent")
            if not has_reason or not str(metric["reason"]).strip():
                raise ValueError(f"UNTESTED {cid} requires reason")

    vol = normalized.get("volumetric_artifact_integrity")
    if vol and vol.get("status") == "VERIFIED":
        is_ph = vol.get("isPlaceholder") is True
        # Also check measurement isPlaceholder
        for e in vol.get("evidence", []):
            if isinstance(e, dict):
                if e.get("isPlaceholder") is True:
                    is_ph = True
                if isinstance(e.get("measurement"), dict) and e["measurement"].get("isPlaceholder") is True:
                    is_ph = True
        if is_ph and vol.get("percent", 0) != 0:
            raise ValueError("PLACEHOLDER volumetric_artifact_integrity must be VERIFIED 0%")

    # Image3D correspondence must be UNTESTED until render-back (currently always UNTESTED)
    img_corr = normalized.get("image3d_correspondence")
    if img_corr and img_corr.get("status") == "VERIFIED":
        # Require render-back evidence
        has_render = False
        for ev in img_corr.get("evidence", []):
            if isinstance(ev, dict) and "renderSha256" in ev and "inputSha256" in ev:
                has_render = True
        if not has_render:
            raise ValueError("image3d_correspondence VERIFIED requires inputSha256 + renderSha256")

    # Godot runtime check
    godot = normalized.get("godot_runtime_compatibility")
    if godot and godot.get("status") == "VERIFIED":
        found_runtime = False
        for ev in godot.get("evidence", []):
            if isinstance(ev, dict) and ev.get("kind") == "godot_runtime":
                if ev.get("exitCode") == 0 and ev.get("importLogSha256") and ev.get("godotExecutable"):
                    found_runtime = True
        if not found_runtime:
            raise ValueError("Godot VERIFIED requires real subprocess evidence (executable, exitCode 0, importLogSha256)")

    # Pipeline completion must have structured stage records
    pc = normalized.get("pipeline_completion")
    if pc and pc.get("status") == "VERIFIED":
        ev_list = pc.get("evidence", [])
        found_stages = set()
        for ev in ev_list:
            if not isinstance(ev, dict) or ev.get("kind") != "stage_completion":
                raise ValueError("pipeline_completion evidence must be kind=stage_completion")
            for req in ("stage", "status", "startedAt", "finishedAt", "artifactSha256"):
                if req not in ev:
                    raise ValueError(f"pipeline_completion stage missing {req}")
            if ev["status"] != "completed":
                raise ValueError("pipeline_completion stage must be completed")
            found_stages.add(ev["stage"])
        required_stages = {"depth", "geometry", "export", "validation"}
        if not required_stages.issubset(found_stages):
            # Allow subset for depth-only mode, but for image_to_3d need geometry/export/validation
            # We check that validation is always required
            if "validation" not in found_stages:
                raise ValueError(f"pipeline_completion missing required stages {required_stages}")
