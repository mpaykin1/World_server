from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path
from typing import Any, Iterable

SCHEMA_VERSION = 11
EXTERNAL_BLOCKER_KINDS = {
    "permission", "missing_hardware", "missing_credentials", "third_party_outage",
    "unavailable_runtime", "platform_rate_limit", "network_unavailable",
}


def _canonical_hash(data: Any) -> str:
    raw = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _normalize_text(value: Any) -> str:
    text = str(value or "").lower()
    text = re.sub(r"0x[0-9a-f]+", "<hex>", text)
    text = re.sub(r"\b[0-9a-f]{8,64}\b", "<hash>", text)
    text = re.sub(r"\b\d+(?:\.\d+)?\b", "<n>", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:1200]


def issue_fingerprint(check: str, category: str, message: str, root_cause: str | None = None) -> str:
    return _canonical_hash({
        "check": _normalize_text(check),
        "category": _normalize_text(category),
        "message": _normalize_text(message),
        "rootCause": _normalize_text(root_cause),
    })


def blocker_evidence_valid(blocker: dict | None) -> tuple[bool, list[str]]:
    b = dict(blocker or {})
    failures: list[str] = []
    kind = str(b.get("kind") or "").strip().lower()
    if kind not in EXTERNAL_BLOCKER_KINDS:
        failures.append("invalidBlockerKind")
    if not str(b.get("observedCommand") or b.get("source") or "").strip():
        failures.append("missingObservedCommand")
    if not str(b.get("evidenceHash") or "").strip():
        failures.append("missingEvidenceHash")
    if not str(b.get("detail") or "").strip():
        failures.append("missingDetail")
    if bool(b.get("codeFixAvailable", False)):
        failures.append("codeFixAvailableTrue")
    return (not failures, failures)


class ErrorLedgerV11:
    """Persistent, append-safe ledger of known failures.

    The ledger is deliberately strict: a fixable issue remains open until verification evidence exists.
    An issue cannot be relabeled external without structured blocker evidence.
    """

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.data = self._load()

    def _load(self) -> dict:
        if self.path.is_file():
            try:
                raw = json.loads(self.path.read_text(encoding="utf-8"))
                if isinstance(raw, dict) and isinstance(raw.get("issues"), dict):
                    raw["schemaVersion"] = SCHEMA_VERSION
                    return raw
            except Exception:
                pass
        return {"schemaVersion": SCHEMA_VERSION, "issues": {}, "runs": []}

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        tmp.replace(self.path)

    def record_failure(
        self,
        *,
        check: str,
        category: str,
        message: str,
        root_cause: str | None = None,
        evidence: dict | None = None,
        regression_test: str | None = None,
    ) -> str:
        fp = issue_fingerprint(check, category, message, root_cause)
        now = time.time()
        issues = self.data.setdefault("issues", {})
        row = dict(issues.get(fp) or {})
        occurrences = int(row.get("occurrences") or 0) + 1
        escalation = "NORMAL_FIX" if occurrences == 1 else ("ROOT_CAUSE_MODE" if occurrences == 2 else ("IMPACT_SCAN_REQUIRED" if occurrences == 3 else "ARCHITECTURE_REVIEW_REQUIRED"))
        row.update({
            "fingerprint": fp,
            "check": check,
            "category": category,
            "message": message,
            "rootCause": root_cause,
            "status": "OPEN_FIXABLE",
            "fixable": True,
            "lastSeenEpoch": now,
            "occurrences": occurrences,
            "escalationLevel": escalation,
            "rootCauseRequired": occurrences >= 2,
            "impactScanRequired": occurrences >= 3,
        })
        row.setdefault("firstSeenEpoch", now)
        if evidence:
            row["lastEvidence"] = evidence
            row["lastEvidenceHash"] = _canonical_hash(evidence)
        if regression_test:
            row["regressionTest"] = regression_test
        issues[fp] = row
        return fp

    def mark_fixed(self, fingerprint: str, *, regression_test: str, verification: dict) -> None:
        row = self.data.get("issues", {}).get(fingerprint)
        if not row:
            raise KeyError(f"Unknown issue fingerprint: {fingerprint}")
        if not regression_test.strip():
            raise ValueError("A fixed issue requires a regression test or durable verifier reference")
        if not bool((verification or {}).get("passed")):
            raise ValueError("A fixed issue requires passed verification evidence")
        row.update({
            "status": "FIXED_VERIFIED",
            "fixable": False,
            "regressionTest": regression_test,
            "fixedAtEpoch": time.time(),
            "verification": verification,
            "verificationHash": _canonical_hash(verification),
        })

    def mark_external_blocker(self, fingerprint: str, blocker: dict) -> None:
        row = self.data.get("issues", {}).get(fingerprint)
        if not row:
            raise KeyError(f"Unknown issue fingerprint: {fingerprint}")
        valid, failures = blocker_evidence_valid(blocker)
        if not valid:
            raise ValueError("Invalid external blocker evidence: " + ", ".join(failures))
        row.update({
            "status": "EXTERNAL_BLOCKER_PROVEN",
            "fixable": False,
            "externalBlocker": blocker,
            "externalBlockerHash": _canonical_hash(blocker),
            "blockedAtEpoch": time.time(),
        })

    def append_run(self, run: dict) -> str:
        record = dict(run)
        record.setdefault("timestampEpoch", time.time())
        record["runHash"] = _canonical_hash(record)
        self.data.setdefault("runs", []).append(record)
        self.data["runs"] = self.data["runs"][-200:]
        return record["runHash"]

    def open_fixable(self) -> list[dict]:
        return [dict(v) for v in self.data.get("issues", {}).values() if v.get("status") == "OPEN_FIXABLE" or bool(v.get("fixable"))]

    def proven_external_blockers(self) -> list[dict]:
        return [dict(v) for v in self.data.get("issues", {}).values() if v.get("status") == "EXTERNAL_BLOCKER_PROVEN"]

    def fixed_verified(self) -> list[dict]:
        return [dict(v) for v in self.data.get("issues", {}).values() if v.get("status") == "FIXED_VERIFIED"]

    def summary(self) -> dict:
        open_rows = self.open_fixable()
        blockers = self.proven_external_blockers()
        fixed = self.fixed_verified()
        return {
            "schemaVersion": SCHEMA_VERSION,
            "status": "ZERO_KNOWN_FIXABLE_ERRORS" if not open_rows else "OPEN_FIXABLE_ERRORS",
            "passed": not open_rows,
            "openFixableCount": len(open_rows),
            "externalBlockerCount": len(blockers),
            "fixedVerifiedCount": len(fixed),
            "openFixableFingerprints": [r["fingerprint"] for r in open_rows],
            "rule": "Do not stop while any reproducible fixable error remains open. External blockers require structured evidence and never count as fixed.",
        }


def harvest_failed_checks(ledger: ErrorLedgerV11, checks: Iterable[dict]) -> list[str]:
    fingerprints: list[str] = []
    for check in checks:
        if bool(check.get("passed")):
            continue
        command = str(check.get("command") or check.get("name") or "unknown-check")
        log = str(check.get("logTail") or check.get("message") or check.get("error") or "check failed")
        fingerprints.append(ledger.record_failure(
            check=command,
            category=str(check.get("category") or "verification"),
            message=log,
            root_cause=check.get("rootCause"),
            evidence={"returnCode": check.get("returnCode"), "logHash": hashlib.sha256(log.encode("utf-8", errors="replace")).hexdigest()},
            regression_test=check.get("regressionTest"),
        ))
    return fingerprints


def zero_known_fixable_errors_gate(ledger_or_data: ErrorLedgerV11 | dict) -> dict:
    if isinstance(ledger_or_data, ErrorLedgerV11):
        return ledger_or_data.summary()
    rows = (ledger_or_data or {}).get("issues") or {}
    open_rows = [v for v in rows.values() if v.get("status") == "OPEN_FIXABLE" or bool(v.get("fixable"))]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "ZERO_KNOWN_FIXABLE_ERRORS" if not open_rows else "OPEN_FIXABLE_ERRORS",
        "passed": not open_rows,
        "openFixableCount": len(open_rows),
        "openFixableFingerprints": [r.get("fingerprint") for r in open_rows],
    }


def close_resolved_check_failures(ledger: ErrorLedgerV11, checks: Iterable[dict]) -> list[str]:
    """Close prior check-generated issues only when the same durable check now passes.

    The check command itself becomes the durable regression verifier reference. This does not replace
    task-specific behavioral tests; Desktop AI must add those when the original defect lacked coverage.
    """
    passed = {str(c.get("command") or c.get("name") or ""): c for c in checks if bool(c.get("passed"))}
    closed: list[str] = []
    for row in list(ledger.open_fixable()):
        command = str(row.get("check") or "")
        check = passed.get(command)
        if not check:
            continue
        try:
            ledger.mark_fixed(
                str(row.get("fingerprint")),
                regression_test=str(row.get("regressionTest") or f"durable-check:{command}"),
                verification={"passed": True, "command": command, "returnCode": check.get("returnCode", 0)},
            )
            closed.append(str(row.get("fingerprint")))
        except Exception:
            continue
    return closed
