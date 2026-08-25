from __future__ import annotations

import hashlib
import json
import math
import os
import statistics
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

from .production_v9 import _evidence_day, _f, _truthy_pass, wilson_lower_bound


def canonical_json_hash(data: Any) -> str:
    payload = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def validate_semantic_model_contract_v10(contract: dict | None, model_path: Path | None = None, policy: dict | None = None) -> dict:
    """Validate provenance/calibration for an optional 3D semantic model.

    The contract is evidence only; it never lowers deterministic geometry protection. A provisioned
    model is accepted only when its file hash and held-out validation/calibration evidence agree.
    """
    c = dict(contract or {})
    p = dict(policy or {})
    min_precision = float(p.get("minPrecision", 0.90))
    min_recall = float(p.get("minRecall", 0.90))
    max_ece = float(p.get("maxExpectedCalibrationError", 0.08))
    min_val_samples = max(100, int(p.get("minValidationSamples", 1000)))
    failures: list[str] = []

    expected_sha = str(c.get("modelSha256") or "").lower().strip()
    if len(expected_sha) != 64 or any(ch not in "0123456789abcdef" for ch in expected_sha):
        failures.append("modelSha256")
    actual_sha = None
    if model_path is not None:
        path = Path(model_path)
        if not path.is_file():
            failures.append("modelFileMissing")
        else:
            h = hashlib.sha256()
            with path.open("rb") as fh:
                for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                    h.update(chunk)
            actual_sha = h.hexdigest()
            if expected_sha and actual_sha != expected_sha:
                failures.append("modelShaMismatch")

    if not str(c.get("modelVersion") or "").strip(): failures.append("modelVersion")
    if int(c.get("featureSchemaVersion") or 0) < 9: failures.append("featureSchemaVersion")
    if not str(c.get("validationDatasetSha256") or "").strip(): failures.append("validationDatasetSha256")
    if int(c.get("validationSamples") or 0) < min_val_samples: failures.append("validationSamples")

    metrics = c.get("metrics") or {}
    precision = _f(metrics.get("precision"))
    recall = _f(metrics.get("recall"))
    ece = _f(metrics.get("expectedCalibrationError"))
    if precision is None or precision < min_precision: failures.append("precision")
    if recall is None or recall < min_recall: failures.append("recall")
    if ece is None or ece > max_ece: failures.append("expectedCalibrationError")

    provenance = c.get("provenance") or {}
    if str(provenance.get("source") or "").lower() in {"", "synthetic", "estimated", "placeholder"}:
        failures.append("provenance.source")
    if not str(provenance.get("trainingRunId") or "").strip(): failures.append("provenance.trainingRunId")

    status = "VERIFIED" if not failures else ("UNPROVISIONED" if not c and model_path is None else "UNVERIFIED")
    return {
        "schemaVersion": 10,
        "status": status,
        "passed": status == "VERIFIED",
        "failures": sorted(set(failures)),
        "expectedModelSha256": expected_sha or None,
        "actualModelSha256": actual_sha,
        "metrics": {"precision": precision, "recall": recall, "expectedCalibrationError": ece},
        "policy": {"minPrecision": min_precision, "minRecall": min_recall, "maxExpectedCalibrationError": max_ece, "minValidationSamples": min_val_samples},
        "rule": "V10 semantic ML is additive only. A model cannot weaken intrinsic/multiview protection and cannot be called verified without hash, held-out metrics and provenance.",
    }


def normalize_profiler_evidence_v10(rows: list[dict], policy: dict | None = None) -> dict:
    """Normalize real vendor/engine profiler evidence into common units with provenance."""
    p = dict(policy or {})
    accepted = set(map(str.lower, p.get("acceptedBackends") or [
        "nvidia_nsight", "nvidia_nsys", "nvidia_ncu", "amd_rgp", "amd_rocprof",
        "intel_gpa", "intel_presentmon", "godot_renderingserver", "webgl_timer_query",
    ]))
    normalized, rejected = [], []
    for src in rows or []:
        row = dict(src)
        nested = row.get("advancedGpuCounters") or {}
        backend = str(nested.get("backend") or row.get("advancedCounterSource") or row.get("telemetrySource") or "").strip().lower()
        reasons = []
        if backend not in accepted: reasons.append("untrustedBackend")
        if not bool(row.get("executedInTarget")): reasons.append("notExecutedInTarget")
        if str(row.get("evidenceKind") or "measured").lower() in {"estimated", "synthetic", "placeholder"}: reasons.append("nonMeasuredEvidence")
        if nested and nested.get("measured") is False: reasons.append("measuredFalse")

        gpu_ms = _f(nested.get("gpuFrameMsP95", row.get("gpuP95FrameMs", row.get("gpuFrameMsP95"))))
        occ = _f(nested.get("shaderOccupancyPercent", nested.get("shaderOccupancy", row.get("shaderOccupancyPercent"))))
        bw = _f(nested.get("memoryBandwidthGBps", nested.get("dramThroughputGBs", row.get("memoryBandwidthGBps"))))
        vram = _f(nested.get("vramUsedMB", row.get("vramUsedMB", row.get("gpuMemoryUsedMB"))))
        if gpu_ms is not None and gpu_ms <= 0: reasons.append("gpuFrameMs")
        if occ is not None and not (0 <= occ <= 100): reasons.append("shaderOccupancyPercent")
        if bw is not None and bw < 0: reasons.append("memoryBandwidthGBps")
        if vram is not None and vram < 0: reasons.append("vramUsedMB")
        if gpu_ms is None and occ is None and bw is None and vram is None: reasons.append("noUsableCounters")

        if reasons:
            rejected.append({"backend": backend or None, "reasons": sorted(set(reasons)), "row": row})
            continue
        normalized.append({
            "target": str(row.get("target") or "").lower(),
            "hardwareTier": str(row.get("hardwareTier") or row.get("deviceTier") or "unknown").lower(),
            "deviceId": row.get("deviceId"), "sessionId": row.get("sessionId"), "providerExecutionId": row.get("providerExecutionId"),
            "backend": backend, "gpuFrameMsP95": gpu_ms, "shaderOccupancyPercent": occ,
            "memoryBandwidthGBps": bw, "vramUsedMB": vram, "executedInTarget": True,
            "sourceHash": canonical_json_hash(row),
        })
    return {
        "schemaVersion": 10,
        "status": "VERIFIED" if normalized and not rejected else ("PARTIAL" if normalized else "UNVERIFIED"),
        "passed": bool(normalized and not rejected),
        "normalized": normalized,
        "rejected": rejected,
        "rule": "Only measured engine/vendor counters with explicit provenance are normalized; estimated or synthetic counters are rejected.",
    }


def device_farm_integrity_gate_v10(rows: list[dict], policy: dict | None = None) -> dict:
    """Deduplicate and integrity-check real device-farm evidence."""
    p = dict(policy or {})
    min_samples = max(30, int(p.get("minSamplesPerRun", 180)))
    require_build = bool(p.get("requireBuildIdentity", True))
    seen = set()
    valid, invalid, duplicates = [], [], []
    for raw in rows or []:
        row = dict(raw)
        key = (str(row.get("providerExecutionId") or ""), str(row.get("deviceId") or ""), str(row.get("sessionId") or ""))
        if key in seen and all(key):
            duplicates.append({"key": key, "rowHash": canonical_json_hash(row)})
            continue
        seen.add(key)
        reasons = []
        for field in ("providerExecutionId", "deviceId", "sessionId", "target", "hardwareTier"):
            if not str(row.get(field) or "").strip(): reasons.append(field)
        if not bool(row.get("executedInTarget")): reasons.append("executedInTarget")
        if int(row.get("sampleCount") or 0) < min_samples: reasons.append("sampleCount")
        if _f(row.get("avgFps", row.get("averageFps"))) is None: reasons.append("avgFps")
        if _f(row.get("p95FrameMs")) is None: reasons.append("p95FrameMs")
        if require_build and not str(row.get("buildId") or row.get("commitSha") or row.get("artifactSha") or "").strip(): reasons.append("buildIdentity")
        if reasons:
            invalid.append({"missingOrInvalid": sorted(set(reasons)), "rowHash": canonical_json_hash(row)})
        else:
            clean = dict(row)
            clean["evidenceSha256"] = canonical_json_hash(row)
            valid.append(clean)
    status = "VERIFIED" if valid and not invalid and not duplicates else ("PARTIAL" if valid else "UNVERIFIED")
    return {"schemaVersion": 10, "status": status, "passed": status == "VERIFIED", "validRuns": valid, "invalid": invalid, "duplicates": duplicates, "minSamplesPerRun": min_samples}


def fleet_drift_gate_v10(rows: list[dict], policy: dict | None = None) -> dict:
    """Detect recent statistically meaningful fleet regressions before allowing calibration."""
    p = dict(policy or {})
    min_group = max(10, int(p.get("minRunsPerWindow", 20)))
    recent_fraction = max(0.15, min(float(p.get("recentFraction", 0.35)), 0.50))
    max_fps_drop = max(0.02, float(p.get("maxMedianFpsDropFraction", 0.12)))
    max_p95_increase = max(0.02, float(p.get("maxMedianP95IncreaseFraction", 0.15)))
    ordered = sorted([r for r in rows or [] if bool(r.get("executedInTarget"))], key=lambda r: _f(r.get("timestampEpoch"), _f(r.get("createdAt"), 0.0)) or 0.0)
    if len(ordered) < min_group * 2:
        return {"schemaVersion": 10, "status": "INSUFFICIENT_HISTORY", "passed": False, "regressionDetected": False, "runs": len(ordered)}
    recent_n = max(min_group, int(len(ordered) * recent_fraction))
    baseline = ordered[:-recent_n]
    recent = ordered[-recent_n:]
    if len(baseline) < min_group:
        return {"schemaVersion": 10, "status": "INSUFFICIENT_HISTORY", "passed": False, "regressionDetected": False, "runs": len(ordered)}

    def med(group, key, fallback=None):
        vals = [_f(r.get(key, fallback)) for r in group]
        vals = [x for x in vals if x is not None]
        return statistics.median(vals) if vals else None
    b_fps, r_fps = med(baseline, "avgFps"), med(recent, "avgFps")
    b_p95, r_p95 = med(baseline, "p95FrameMs"), med(recent, "p95FrameMs")
    b_pass = sum(_truthy_pass(r) for r in baseline); r_pass = sum(_truthy_pass(r) for r in recent)
    b_rate, r_rate = b_pass / len(baseline), r_pass / len(recent)
    pooled = (b_pass + r_pass) / (len(baseline) + len(recent))
    denom = math.sqrt(max(1e-12, pooled * (1 - pooled) * (1 / len(baseline) + 1 / len(recent))))
    z = (r_rate - b_rate) / denom if denom else 0.0
    fps_reg = b_fps is not None and r_fps is not None and r_fps < b_fps * (1 - max_fps_drop)
    p95_reg = b_p95 is not None and r_p95 is not None and r_p95 > b_p95 * (1 + max_p95_increase)
    pass_reg = z <= -1.96
    regression = bool(fps_reg or p95_reg or pass_reg)
    return {
        "schemaVersion": 10, "status": "REGRESSION_DETECTED" if regression else "STABLE", "passed": not regression,
        "regressionDetected": regression, "baselineRuns": len(baseline), "recentRuns": len(recent),
        "baselineMedianFps": b_fps, "recentMedianFps": r_fps, "baselineMedianP95FrameMs": b_p95, "recentMedianP95FrameMs": r_p95,
        "baselinePassRate": round(b_rate, 6), "recentPassRate": round(r_rate, 6), "passRateZScore": round(z, 4),
        "signals": {"fpsDrop": fps_reg, "p95Increase": p95_reg, "passRateDropSignificant": pass_reg},
    }


def pvs_pruning_proof_v10(pvs: dict, samples: list[dict], candidates: list[dict], policy: dict | None = None) -> dict:
    """Two-phase conservative proof for PVS pruning.

    V10 still defaults to zero automatic removals. Proof-ready candidates require diversity across
    sessions/builds/devices/portal states and a holdout window with zero sightings.
    """
    p = dict(policy or {})
    min_sessions = max(20, int(p.get("minSessions", 50)))
    min_builds = max(2, int(p.get("minBuilds", 3)))
    min_devices = max(3, int(p.get("minDevices", 5)))
    min_portal_states = max(2, int(p.get("minPortalStates", 3)))
    min_holdout = max(50, int(p.get("minHoldoutObservations", 250)))
    approved = []
    by_room = defaultdict(list)
    for s in samples or []:
        by_room[str(s.get("room") or "")].append(s)
    for cand in candidates or []:
        room, target = str(cand.get("room") or ""), str(cand.get("visibleRoom") or "")
        rows = by_room.get(room, [])
        sessions = {str(r.get("sessionId") or "") for r in rows if r.get("sessionId")}
        builds = {str(r.get("buildId") or r.get("commitSha") or "") for r in rows if r.get("buildId") or r.get("commitSha")}
        devices = {str(r.get("deviceId") or "") for r in rows if r.get("deviceId")}
        portal_states = {str(r.get("portalStateHash") or "") for r in rows if r.get("portalStateHash")}
        ordered = sorted(rows, key=lambda r: _f(r.get("timestampEpoch"), 0.0) or 0.0)
        holdout = ordered[-min_holdout:] if len(ordered) >= min_holdout else []
        sightings = sum(target in set(map(str, r.get("visibleRooms") or [])) for r in rows)
        holdout_sightings = sum(target in set(map(str, r.get("visibleRooms") or [])) for r in holdout)
        ok = len(sessions) >= min_sessions and len(builds) >= min_builds and len(devices) >= min_devices and len(portal_states) >= min_portal_states and len(holdout) >= min_holdout and sightings == 0 and holdout_sightings == 0
        if ok:
            approved.append({"room": room, "visibleRoom": target, "status": "PROOF_READY_FOR_CANARY", "sessions": len(sessions), "builds": len(builds), "devices": len(devices), "portalStates": len(portal_states), "holdoutObservations": len(holdout)})
    return {
        "schemaVersion": 10, "status": "PROOF_READY" if approved else "NO_PROVEN_REMOVALS", "passed": bool(approved),
        "proofReadyCandidates": approved, "autoRemovalsApplied": 0,
        "rule": "V10 never removes PVS entries merely from absence. Even proof-ready entries require a canary/rollback stage before any automatic application.",
    }


def build_roblox_verification_contract_v10(job_dir: Path, assets: list[dict], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    normalized = []
    for asset in assets or []:
        path = Path(str(asset.get("path") or "")) if asset.get("path") else None
        sha = None
        if path and path.is_file():
            h = hashlib.sha256(path.read_bytes()).hexdigest()
            sha = h
        normalized.append({"kind": asset.get("kind"), "path": str(path) if path else None, "sha256": sha, "assetId": asset.get("assetId")})
    contract = {
        "schemaVersion": 10, "marker": "[AI3D_V10_ROBLOX_VERIFY]", "jobId": Path(job_dir).name,
        "requiredChecks": ["modelLoaded", "finiteBounds", "collisionPresent", "materialsPresent", "surfaceAppearanceBound", "assetIdsRebound", "surfaceAppearanceAssetIdsValid", "noMissingAssets"],
        "requirePublishedPlace": bool(p.get("requirePublishedPlace", True)), "assets": normalized,
    }
    contract["contractSha256"] = canonical_json_hash(contract)
    return contract


def validate_roblox_verification_result_v10(result: dict | None, contract: dict, policy: dict | None = None) -> dict:
    data = dict(result or {})
    p = dict(policy or {})
    failures = []
    if str(data.get("marker") or "") != str(contract.get("marker")): failures.append("marker")
    if str(data.get("contractSha256") or "") != str(contract.get("contractSha256")): failures.append("contractSha256")
    if not str(data.get("studioVersion") or "").strip(): failures.append("studioVersion")
    if not str(data.get("verificationRunId") or "").strip(): failures.append("verificationRunId")
    if bool(contract.get("requirePublishedPlace")) and not str(data.get("placeId") or data.get("publishedPlaceId") or "").strip(): failures.append("placeId")
    checks = data.get("placeChecks") or {}
    for check in contract.get("requiredChecks") or []:
        if checks.get(check) is not True: failures.append(check)
    if p.get("requireAutomationEvidence", True):
        auto = data.get("automation") or {}
        if not (auto.get("studioLaunched") is True and auto.get("resultCaptured") is True and auto.get("commandVerified") is True): failures.append("automationEvidence")
    status = "VERIFIED" if not failures else "UNVERIFIED"
    return {"schemaVersion": 10, "status": status, "passed": status == "VERIFIED", "failedChecks": sorted(set(failures)), "contractSha256": contract.get("contractSha256")}


def evidence_completeness_gate_v10(
    static_gates: dict, semantic_contract: dict, runtime: dict, profiler: dict, device_farm: dict,
    longitudinal: dict, drift: dict, roblox: dict, pvs_proof: dict, policy: dict | None = None,
) -> dict:
    p = dict(policy or {})
    required = {
        "semanticModel": bool(p.get("requireSemanticModelContract", False)),
        "runtime": bool(p.get("requireRuntime", True)),
        "profiler": bool(p.get("requireProfiler", False)),
        "deviceFarm": bool(p.get("requireDeviceFarm", False)),
        "longitudinalFleet": bool(p.get("requireLongitudinalFleet", True)),
        "driftStable": bool(p.get("requireDriftStable", True)),
        "roblox": bool(p.get("requireRobloxStudio", False)),
        "pvsProof": bool(p.get("requirePvsPruningProof", False)),
    }
    static_fail = [k for k, v in (static_gates or {}).items() if v is False]
    layers = {
        "static": not static_fail,
        "semanticModel": bool((semantic_contract or {}).get("passed")),
        "runtime": str((runtime or {}).get("status")) == "VERIFIED" or bool((runtime or {}).get("passed")),
        "profiler": bool((profiler or {}).get("passed")),
        "deviceFarm": bool((device_farm or {}).get("passed")),
        "longitudinalFleet": bool((longitudinal or {}).get("passed")),
        "driftStable": str((drift or {}).get("status")) == "STABLE",
        "roblox": bool((roblox or {}).get("passed")),
        "pvsProof": bool((pvs_proof or {}).get("passed")),
    }
    hard_missing = [name for name, req in required.items() if req and not layers[name]]
    if not layers["static"]:
        status = "REJECTED_STATIC_REGRESSION"
    elif required["runtime"] and not layers["runtime"]:
        status = "CODE_VERIFIED_RUNTIME_INCOMPLETE"
    elif required["longitudinalFleet"] and not layers["longitudinalFleet"]:
        status = "VERIFIED_TARGET_RUNTIME_FLEET_INCOMPLETE"
    elif hard_missing:
        status = "FLEET_VERIFIED_EVIDENCE_INCOMPLETE"
    else:
        status = "PRODUCTION_EVIDENCE_COMPLETE"

    weights = {"static": 30, "semanticModel": 10, "runtime": 15, "profiler": 10, "deviceFarm": 10, "longitudinalFleet": 15, "driftStable": 5, "roblox": 3, "pvsProof": 2}
    applicable = {"static": True, **required}
    denom = sum(weights[k] for k, enabled in applicable.items() if enabled)
    earned = sum(weights[k] for k, enabled in applicable.items() if enabled and layers[k])
    score = round(100 * earned / denom, 2) if denom else 100.0
    return {
        "schemaVersion": 10, "status": status, "passed": status == "PRODUCTION_EVIDENCE_COMPLETE", "productionEvidenceComplete": status == "PRODUCTION_EVIDENCE_COMPLETE",
        "evidenceCompletenessPercent": score, "layers": layers, "required": required, "missingRequiredLayers": hard_missing, "failedStaticGates": static_fail,
        "rule": "V10 evidence layers are non-compensating: high scores elsewhere cannot hide a missing required runtime, fleet, profiler, semantic provenance, Roblox or PVS proof layer.",
    }


def write_v10_evidence_pack(job_dir: Path, semantic_contract: dict, profiler_contract: dict, roblox_contract: dict) -> list[Path]:
    job_dir = Path(job_dir)
    job_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    for name, payload in (
        ("semantic-model-contract-v10.json", semantic_contract),
        ("profiler-normalization-v10.json", profiler_contract),
        ("roblox-verification-contract-v10.json", roblox_contract),
    ):
        path = job_dir / name
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        outputs.append(path)
    return outputs


def build_pvs_canary_plan_v10(pvs: dict, proof: dict) -> dict:
    candidates = list((proof or {}).get("proofReadyCandidates") or [])
    baseline_hash = canonical_json_hash(pvs or {})
    plan = {
        "schemaVersion": 10,
        "status": "READY_FOR_CANARY" if candidates else "NO_PROVEN_CANDIDATES",
        "baselinePvsSha256": baseline_hash,
        "candidates": candidates,
        "requiredChecks": ["noMissingVisibleRooms", "noCameraPopRegression", "noNavigationRegression", "runtimeNotWorse"],
        "autoApply": False,
        "rollback": {"restoreBaselinePvsSha256": baseline_hash, "automaticOnAnyFailedCheck": True},
    }
    plan["planSha256"] = canonical_json_hash(plan)
    return plan


def validate_pvs_canary_result_v10(result: dict | None, plan: dict) -> dict:
    data = dict(result or {})
    failures = []
    if str(data.get("planSha256") or "") != str(plan.get("planSha256") or ""): failures.append("planSha256")
    if str(data.get("baselinePvsSha256") or "") != str(plan.get("baselinePvsSha256") or ""): failures.append("baselinePvsSha256")
    checks = data.get("checks") or {}
    for check in plan.get("requiredChecks") or []:
        if checks.get(check) is not True: failures.append(check)
    if not str(data.get("canaryRunId") or "").strip(): failures.append("canaryRunId")
    status = "VERIFIED_CANARY" if not failures else "ROLLBACK_REQUIRED"
    return {
        "schemaVersion": 10, "status": status, "passed": status == "VERIFIED_CANARY",
        "failedChecks": sorted(set(failures)), "planSha256": plan.get("planSha256"),
        "rollbackRequired": status != "VERIFIED_CANARY",
        "rule": "A PVS removal candidate cannot be promoted without a contract-bound canary; any failed check requires restoring the exact baseline PVS.",
    }
