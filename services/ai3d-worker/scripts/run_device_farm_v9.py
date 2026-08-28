from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]


def load_rows(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else list(data.get("rows") or [data])


def main():
    ap = argparse.ArgumentParser(description="Run an external real-device provider and capture V9 target-runtime evidence.")
    ap.add_argument("--scene-url", required=True)
    ap.add_argument("--output", type=Path, default=Path("device-farm-v9.json"))
    ap.add_argument("--run", action="store_true")
    args = ap.parse_args()

    command_template = (
        os.environ.get("AI3D_DEVICE_FARM_COMMAND", "").strip()
        or os.environ.get("AI3D_DEVICE_FARM_RUNNER_CMD", "").strip()
    )
    adb = shutil.which(os.environ.get("ADB_BIN", "adb"))
    report = {
        "schemaVersion": 9,
        "sceneUrl": args.scene_url,
        "executed": False,
        "rows": [],
        "providers": {"externalCommand": bool(command_template), "adbDiscovery": bool(adb)},
    }
    if not args.run:
        report.update({
            "status": "PLAN_ONLY",
            "rule": "Use --run only with a configured provider that writes real target-generated JSON evidence.",
        })
    elif command_template:
        with tempfile.TemporaryDirectory(prefix="ai3d-device-farm-v9-") as td:
            result = Path(td) / "result.json"
            command = command_template.format(scene_url=args.scene_url, output=str(result), service_root=str(SERVICE_ROOT))
            proc = subprocess.run(
                command if os.name == "nt" else shlex.split(command),
                shell=os.name == "nt",
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                check=False,
                timeout=3600,
            )
            rows = load_rows(result)
            verified = [r for r in rows if r.get("executedInTarget") is True and r.get("providerExecutionId") and r.get("deviceId")]
            report.update({
                "executed": True,
                "commandReturnCode": proc.returncode,
                "logTail": proc.stdout[-5000:],
                "rows": rows,
                "verifiedRows": len(verified),
                "status": "CAPTURED_REAL_EVIDENCE" if proc.returncode == 0 and verified else "UNVERIFIED_RESULT",
            })
    elif adb:
        proc = subprocess.run([adb, "devices"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False)
        devices = [line.split("\t")[0] for line in proc.stdout.splitlines() if "\tdevice" in line]
        report.update({
            "status": "ADB_DEVICES_FOUND_NO_RESULT_CHANNEL" if devices else "NO_ADB_DEVICES",
            "adbDevices": devices,
            "rule": "Device discovery is not a performance benchmark. Configure AI3D_DEVICE_FARM_COMMAND to collect target-generated JSON evidence.",
        })
    else:
        report.update({"status": "UNPROVISIONED", "rule": "No real device-farm provider is configured; no PASS is emitted."})

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report.get("status") in {"PLAN_ONLY", "CAPTURED_REAL_EVIDENCE", "ADB_DEVICES_FOUND_NO_RESULT_CHANNEL", "UNPROVISIONED", "NO_ADB_DEVICES"} else 1)


if __name__ == "__main__":
    main()
