from __future__ import annotations

import hashlib
import json
import os
import subprocess
import time
from pathlib import Path

from .error_ledger_v11 import ErrorLedgerV11
from .production_v12 import autofix_progress_gate_v12


def _git(repo: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=str(repo), text=True, stderr=subprocess.STDOUT).strip()


def branch_safety_gate_v12(repo: Path) -> dict:
    try:
        branch = _git(repo, "branch", "--show-current")
        status = _git(repo, "status", "--porcelain")
    except Exception as exc:
        return {"passed": False, "status": "GIT_UNAVAILABLE", "error": str(exc)}
    safe = bool(branch) and branch != "master" and (branch.startswith("ai/") or branch.startswith("opencode/"))
    return {"passed": safe, "status": "SAFE_FEATURE_BRANCH" if safe else "UNSAFE_BRANCH", "branch": branch, "workingTreeDirty": bool(status)}


def run_autofix_command_v12(*, repo: Path, ledger_path: Path, command: str, issue: dict, timeout: int = 1800) -> dict:
    safety = branch_safety_gate_v12(repo)
    if not safety.get("passed"):
        return {"passed": False, "status": "REFUSED_UNSAFE_BRANCH", "safety": safety}
    env = os.environ.copy()
    env["AI3D_ERROR_LEDGER"] = str(ledger_path)
    env["AI3D_FIX_ISSUE_JSON"] = json.dumps(issue, ensure_ascii=False)
    env["AI3D_FIX_FINGERPRINT"] = str(issue.get("fingerprint") or "")
    started = time.time()
    p = subprocess.run(command, shell=True, cwd=str(repo), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False, timeout=timeout)
    diff = subprocess.run(["git","diff","--binary"], cwd=str(repo), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False).stdout
    return {
        "passed": p.returncode == 0,
        "status": "AUTOFIX_COMMAND_COMPLETED" if p.returncode == 0 else "AUTOFIX_COMMAND_FAILED",
        "returnCode": p.returncode,
        "durationSeconds": round(time.time()-started,3),
        "logTail": p.stdout[-12000:],
        "diffHash": hashlib.sha256(diff.encode("utf-8",errors="replace")).hexdigest(),
        "safety": safety,
    }


def choose_issue_v12(ledger: ErrorLedgerV11) -> dict | None:
    rows = ledger.open_fixable()
    if not rows: return None
    rank = {"ARCHITECTURE_REVIEW_REQUIRED":4,"IMPACT_SCAN_REQUIRED":3,"ROOT_CAUSE_MODE":2,"NORMAL_FIX":1}
    rows.sort(key=lambda r:(rank.get(str(r.get("escalationLevel")),0),int(r.get("occurrences") or 0),float(r.get("lastSeenEpoch") or 0)), reverse=True)
    return rows[0]


def progress_report_v12(attempts: list[dict]) -> dict:
    return autofix_progress_gate_v12(attempts, {"stallLimit":3})
