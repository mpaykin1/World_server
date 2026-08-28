from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
from pathlib import Path

MARKER = "[AI3D_V9_ROBLOX_VERIFY]"


def main():
    ap = argparse.ArgumentParser(description="Run a provisioned Roblox Studio automation bridge and capture place-side verification evidence.")
    ap.add_argument("--place", type=Path)
    ap.add_argument("--script", type=Path)
    ap.add_argument("--output", type=Path, default=Path("roblox-studio-v9.json"))
    args = ap.parse_args()

    template = (
        os.environ.get("ROBLOX_STUDIO_VERIFY_COMMAND", "").strip()
        or os.environ.get("ROBLOX_STUDIO_VERIFY_CMD", "").strip()
    )
    runner = shutil.which("run-in-roblox") or shutil.which("run-in-roblox.exe")
    if not template and runner and args.place and args.script:
        template = f'"{runner}" --place "{{place}}" --script "{{script}}"'

    report = {
        "schemaVersion": 9,
        "status": "UNPROVISIONED",
        "passed": False,
        "automation": {"studioLaunched": False, "commandVerified": False, "resultCaptured": False},
    }
    if not template:
        report["reason"] = "No ROBLOX_STUDIO_VERIFY_COMMAND/ROBLOX_STUDIO_VERIFY_CMD or supported local runner is provisioned."
    else:
        command = template.format(place=str(args.place or ""), script=str(args.script or ""), output=str(args.output))
        proc = subprocess.run(
            command if os.name == "nt" else shlex.split(command),
            shell=os.name == "nt",
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            check=False,
            timeout=1800,
        )
        match = re.search(re.escape(MARKER) + r"(\{.*?\})(?:\r?\n|$)", proc.stdout, re.S)
        payload = {}
        if match:
            try:
                payload = json.loads(match.group(1))
            except Exception:
                payload = {}
        automation = {
            "studioLaunched": True,
            "commandVerified": proc.returncode == 0,
            "resultCaptured": bool(payload),
            "marker": MARKER if payload else "",
        }
        report = {
            **payload,
            "schemaVersion": 9,
            "status": "CAPTURED" if proc.returncode == 0 and payload else "UNVERIFIED",
            "passed": False,
            "automation": automation,
            "logTail": proc.stdout[-5000:],
        }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
