from __future__ import annotations

import hashlib
import json
import math
import statistics
from typing import Any


def _canon(data: Any) -> Any:
    if isinstance(data, dict):
        ignored = {"timestamp", "timestampEpoch", "createdAt", "finishedAt", "duration", "durationSeconds", "runHash", "verificationHash"}
        return {k: _canon(v) for k, v in sorted(data.items()) if k not in ignored}
    if isinstance(data, list):
        return [_canon(v) for v in data]
    if isinstance(data, float):
        return round(data, 6)
    return data


def canonical_result_hash_v11(data: Any) -> str:
    raw = json.dumps(_canon(data), ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def reproducibility_gate_v11(runs: list[dict], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    min_runs = max(2, int(p.get("minRuns", 3)))
    rows = [r for r in runs or [] if isinstance(r, dict)]
    hashes = [canonical_result_hash_v11(r.get("result", r)) for r in rows]
    counts: dict[str, int] = {}
    for h in hashes: counts[h] = counts.get(h, 0) + 1
    dominant = max(counts.values(), default=0)
    ratio = dominant / len(hashes) if hashes else 0.0
    min_ratio = float(p.get("minStableRatio", 1.0))
    passed = len(rows) >= min_runs and ratio >= min_ratio
    return {
        "schemaVersion": 11,
        "status": "REPRODUCIBLE" if passed else ("INSUFFICIENT_RUNS" if len(rows) < min_runs else "NONDETERMINISTIC"),
        "passed": passed,
        "runs": len(rows),
        "uniqueCanonicalResults": len(counts),
        "dominantRatio": round(ratio, 6),
        "minStableRatio": min_ratio,
        "canonicalHashes": hashes,
    }


def flaky_test_gate_v11(check_runs: list[dict], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    min_repeats = max(2, int(p.get("minRepeats", 3)))
    by_name: dict[str, list[bool]] = {}
    for run in check_runs or []:
        name = str(run.get("name") or run.get("command") or "unknown")
        by_name.setdefault(name, []).append(bool(run.get("passed")))
    unstable, insufficient = [], []
    for name, outcomes in sorted(by_name.items()):
        if len(outcomes) < min_repeats:
            insufficient.append({"name": name, "runs": len(outcomes)})
        elif len(set(outcomes)) > 1:
            unstable.append({"name": name, "outcomes": outcomes})
    passed = bool(by_name) and not unstable and not insufficient
    return {
        "schemaVersion": 11,
        "status": "STABLE" if passed else ("FLAKY" if unstable else "INSUFFICIENT_REPEATS"),
        "passed": passed,
        "unstable": unstable,
        "insufficient": insufficient,
        "minRepeats": min_repeats,
    }


def fault_injection_gate_v11(results: list[dict], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    required = set(p.get("requiredFaultClasses") or [
        "syntax_error", "fake_runtime_evidence", "missing_asset", "inverted_lod", "semantic_mask_corruption", "pvs_visibility_hole",
    ])
    seen, missed = set(), []
    rows = []
    for raw in results or []:
        r = dict(raw)
        fault = str(r.get("faultClass") or "")
        detected = bool(r.get("detected")) and bool(r.get("detectorFailedClosed", True))
        if fault: seen.add(fault)
        if fault in required and not detected: missed.append(fault)
        rows.append({"faultClass": fault, "detected": detected, "detector": r.get("detector")})
    missing = sorted(required - seen)
    passed = not missed and not missing and bool(required)
    return {
        "schemaVersion": 11,
        "status": "FAULTS_DETECTED" if passed else "FAULT_COVERAGE_GAP",
        "passed": passed,
        "requiredFaultClasses": sorted(required),
        "missingFaultClasses": missing,
        "missedFaultClasses": sorted(set(missed)),
        "results": rows,
    }


def regression_closure_gate_v11(error_ledger: dict, policy: dict | None = None) -> dict:
    p = dict(policy or {})
    require_regression = bool(p.get("requireRegressionTestForFixed", True))
    issues = list(((error_ledger or {}).get("issues") or {}).values())
    open_fixable = [r for r in issues if r.get("status") == "OPEN_FIXABLE" or bool(r.get("fixable"))]
    bad_fixed = []
    for r in issues:
        if r.get("status") != "FIXED_VERIFIED": continue
        if require_regression and not str(r.get("regressionTest") or "").strip(): bad_fixed.append(r.get("fingerprint"))
        if not bool((r.get("verification") or {}).get("passed")): bad_fixed.append(r.get("fingerprint"))
    passed = not open_fixable and not bad_fixed
    return {
        "schemaVersion": 11,
        "status": "CLOSED_WITH_REGRESSION_PROTECTION" if passed else "REGRESSION_CLOSURE_INCOMPLETE",
        "passed": passed,
        "openFixableCount": len(open_fixable),
        "fixedWithoutDurableRegressionEvidence": sorted(set(x for x in bad_fixed if x)),
    }


def convergence_gate_v11(
    *,
    static_checks_passed: bool,
    zero_error_gate: dict,
    regression_closure: dict,
    reproducibility: dict,
    flaky_tests: dict,
    fault_injection: dict,
    external_blockers: list[dict] | None = None,
    policy: dict | None = None,
) -> dict:
    p = dict(policy or {})
    require_repro = bool(p.get("requireReproducibility", True))
    require_flaky = bool(p.get("requireFlakyStability", True))
    require_faults = bool(p.get("requireFaultInjection", True))
    gates = {
        "staticChecks": bool(static_checks_passed),
        "zeroKnownFixableErrors": bool(zero_error_gate.get("passed")),
        "regressionClosure": bool(regression_closure.get("passed")),
        "reproducibility": bool(reproducibility.get("passed")) if require_repro else True,
        "flakyTestStability": bool(flaky_tests.get("passed")) if require_flaky else True,
        "faultInjectionCoverage": bool(fault_injection.get("passed")) if require_faults else True,
    }
    blockers = list(external_blockers or [])
    passed = all(gates.values()) and not blockers
    if passed:
        status = "CONVERGED_ZERO_KNOWN_ERRORS"
    elif blockers and all(gates.values()):
        status = "EXTERNALLY_BLOCKED_NOT_CONVERGED"
    else:
        status = "CONTINUE_FIX_LOOP"
    return {
        "schemaVersion": 11,
        "status": status,
        "passed": passed,
        "gates": gates,
        "externalBlockers": blockers,
        "stopAllowed": passed or bool(blockers and not any(v is False for k, v in gates.items() if k != "staticChecks")),
        "rule": "Desktop AI must continue find->fix->regression-test->full-verify cycles while any reproducible fixable error remains. A proven external blocker is not a pass and must be reported separately.",
    }


def quality_confidence_v11(evidence_layers: dict, policy: dict | None = None) -> dict:
    """Non-compensating confidence: each critical missing layer caps total confidence."""
    p = dict(policy or {})
    critical = list(p.get("criticalLayers") or [
        "static", "zeroErrors", "regression", "semantic", "runtime", "deviceFleet", "profiler", "roblox", "pvsCanary",
    ])
    values = {}
    for name in critical:
        value = evidence_layers.get(name)
        if isinstance(value, dict):
            score = 1.0 if bool(value.get("passed")) else float(value.get("confidence", 0.0) or 0.0)
        elif isinstance(value, bool): score = 1.0 if value else 0.0
        else:
            try: score = float(value)
            except Exception: score = 0.0
        values[name] = max(0.0, min(score, 1.0))
    if not values:
        return {"schemaVersion": 11, "confidencePercent": 0.0, "passed": False, "layers": {}}
    geometric = math.prod(max(v, 1e-6) for v in values.values()) ** (1 / len(values))
    weakest = min(values.values())
    confidence = 100.0 * min(geometric, weakest + 0.15)
    complete = all(v >= 0.999 for v in values.values())
    return {
        "schemaVersion": 11,
        "status": "PRODUCTION_EVIDENCE_COMPLETE" if complete else "EVIDENCE_INCOMPLETE",
        "passed": complete,
        "confidencePercent": round(confidence, 2),
        "weakestLayer": min(values, key=values.get),
        "layers": values,
        "rule": "Strong layers cannot compensate for a missing critical evidence layer.",
    }
