#!/usr/bin/env python3
"""Advisory, dependency-free code-review signals. Not proof of defects."""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

CODE_SUFFIXES = {".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py"}
SKIP_PARTS = {"node_modules", ".git", "dist", "build", ".next", "coverage", "venv", ".venv"}
IMPORT_RE = re.compile(r"^\s*(?:import\s|from\s+\S+\s+import\s|(?:const|let|var)\s+.+?=\s*require\()")
RISK_RULES = (
    ("dynamic-execution", re.compile(r"(?<![\w.])eval\s*\(|\bnew\s+Function\s*\(")),
    ("nondeterministic-input", re.compile(r"\b(?:Math\.random|Date\.now)\s*\(")),
    ("empty-catch", re.compile(r"\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}")),
)


def inspect_text(path, text, max_lines=400, max_imports=10):
    """Return review signals, never an unsupported claim of a vulnerability."""
    lines = text.splitlines()
    signals = []
    if len(lines) > max_lines:
        signals.append({"kind": "large-file", "path": path, "lines": len(lines), "limit": max_lines})
    imports = sum(bool(IMPORT_RE.search(line)) for line in lines)
    if imports > max_imports:
        signals.append({"kind": "many-imports", "path": path, "count": imports, "limit": max_imports})
    for number, line in enumerate(lines, 1):
        # Heuristic only: a match in a string, comment or a test may be harmless.
        for kind, pattern in RISK_RULES:
            if pattern.search(line):
                signals.append({"kind": kind, "path": path, "line": number, "review_required": True})
    return signals


def git_paths(repo, base=None):
    if base:
        cmd = ["git", "-C", str(repo), "diff", "--name-only", "-z", base, "--"]
    else:
        cmd = ["git", "-C", str(repo), "ls-files", "-z"]
    result = subprocess.run(cmd, capture_output=True, check=True)
    return [Path(item.decode("utf-8", errors="replace"))
            for item in result.stdout.split(b"\0") if item]


def is_code(path):
    return path.suffix.lower() in CODE_SUFFIXES and not (SKIP_PARTS & set(path.parts))


def audit(repo, base=None, max_lines=400, max_imports=10):
    repo = Path(repo).resolve()
    if not repo.is_dir():
        raise ValueError("Repository directory does not exist")
    signals, scanned = [], 0
    for relative in git_paths(repo, base):
        if not is_code(relative):
            continue
        full = repo / relative
        if not full.is_file():
            continue
        try:
            text = full.read_text(encoding="utf-8")
        except (UnicodeError, OSError):
            signals.append({"kind": "unreadable", "path": str(relative)})
            continue
        scanned += 1
        signals.extend(inspect_text(str(relative), text, max_lines, max_imports))
    return {"repository": str(repo), "base": base, "files_scanned": scanned,
            "signals": signals, "signals_count": len(signals),
            "note": "Heuristic findings are review prompts, not confirmed defects."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=".", help="Git repository path")
    parser.add_argument("--base", help="Scan tracked files changed relative to this git ref")
    parser.add_argument("--max-lines", type=int, default=400)
    parser.add_argument("--max-imports", type=int, default=10)
    parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    args = parser.parse_args()
    if args.max_lines <= 0 or args.max_imports <= 0:
        parser.error("Limits must be positive")
    try:
        report = audit(args.repo, args.base, args.max_lines, args.max_imports)
    except (ValueError, subprocess.CalledProcessError) as error:
        print("Audit could not run: " + str(error), file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("Files scanned: {files_scanned}; review signals: {signals_count}".format(**report))
        for signal in report["signals"]:
            location = signal["path"] + (":" + str(signal["line"]) if "line" in signal else "")
            print(signal["kind"] + " " + location)
        print(report["note"])
    return 0  # Findings are advisory; validate with tests, not an invented CI gate.


if __name__ == "__main__":
    sys.exit(main())
