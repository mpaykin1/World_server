from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from ai3d.mesh_optimizer import MeshOptimizationPipeline
from ai3d.production_v6 import aggregate_runtime_benchmarks_v6
from ai3d.production_v7 import engine_native_gpu_timing_gate
from ai3d.production_v8 import device_matrix_coverage
from ai3d.production_v9 import (
    FleetHistoryV9,
    discover_gpu_counter_tools_v9,
    longitudinal_fleet_gate_v9,
    production_readiness_gate_v9,
    shader_memory_telemetry_gate_v9,
    validate_advanced_gpu_counters_v9,
    validate_device_farm_result_v9,
    validate_roblox_studio_automation_v9,
)


def run(cmd, cwd, timeout=1800):
    proc = subprocess.run(cmd, cwd=str(cwd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False, timeout=timeout)
    return {"command": " ".join(map(str, cmd)), "passed": proc.returncode == 0, "returnCode": proc.returncode, "logTail": proc.stdout[-7000:]}


def load_rows(folder: Path | None) -> list[dict]:
    rows: list[dict] = []
    if not folder or not folder.exists():
        return rows
    paths = [folder] if folder.is_file() else sorted(folder.glob("*.json"))
    for path in paths:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(data, list):
            rows += [x for x in data if isinstance(x, dict)]
        elif isinstance(data, dict):
            rows += [x for x in data.get("rows", [data]) if isinstance(x, dict)]
    return rows


def load_json(path: Path | None) -> dict:
    if path and path.is_file():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def main():
    ap = argparse.ArgumentParser(description="Evidence-first V9 mesh quality verification.")
    ap.add_argument("--fixture", type=Path)
    ap.add_argument("--benchmark-dir", type=Path)
    ap.add_argument("--device-farm-result", type=Path)
    ap.add_argument("--roblox-automation-result", type=Path)
    ap.add_argument("--required-targets", default="godot,web")
    ap.add_argument("--required-tiers", default="low,mid,high")
    ap.add_argument("--output", type=Path, default=Path("mesh-v9-verification.json"))
    ap.add_argument("--skip-repo-check", action="store_true")
    ap.add_argument("--run-release-gate", action="store_true")
    ap.add_argument("--require-advanced-gpu", action="store_true")
    ap.add_argument("--require-roblox-automation", action="store_true")
    ap.add_argument("--require-device-farm", action="store_true")
    args = ap.parse_args()

    checks = [
        run([sys.executable, "-m", "py_compile", "server.py", "ai3d/mesh_optimizer.py", "ai3d/production_v9.py", "ai3d/semantic_mesh_v9.py", "ai3d/plugins/mesh_quality_optimizer.py", "tools/semantic_mesh_v9_blender.py", "scripts/verify_mesh_pipeline_v9.py", "scripts/run_device_farm_v9.py", "scripts/run_roblox_studio_verify_v9.py"], SERVICE_ROOT),
        run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"], SERVICE_ROOT),
    ]
    if not args.skip_repo_check:
        for script in ("check", "quality:check", "quality:regression", "duplicates:check", "contracts:check"):
            checks.append(run(["npm", "run", script], REPO_ROOT))
        if args.run_release_gate:
            checks.append(run(["npm", "run", "release:gate"], REPO_ROOT, 3600))

    fixture = None
    if args.fixture:
        blender = os.environ.get("BLENDER_BIN", "blender")
        if not shutil.which(blender):
            fixture = {"passed": False, "reason": "Blender unavailable; real fixture validation was not executed"}
        else:
            with tempfile.TemporaryDirectory(prefix="mesh-v9-") as td:
                runtime = Path(td) / "runtime"
                runtime.mkdir()
                source = runtime / ("input" + args.fixture.suffix.lower())
                shutil.copy2(args.fixture, source)
                result = MeshOptimizationPipeline(SERVICE_ROOT).run(
                    {
                        "id": "fixture",
                        "mode": "mesh_optimize",
                        "params": {
                            "productionReadinessV9": {
                                "requireRuntimeEvidence": True,
                                "requireNativeGpuTiming": True,
                                "requireDeviceMatrix": True,
                                "requireLongitudinalFleet": True,
                                "requireShaderMemoryTelemetry": True,
                            }
                        },
                        "input_path": str(source),
                    },
                    lambda *_: None,
                )
                report_path = runtime / "optimization-report.json"
                report = json.loads(report_path.read_text(encoding="utf-8")) if report_path.is_file() else {}
                fixture = {
                    "passed": result.get("status") in {"accepted", "accepted_with_runtime_warning", "ACCEPTED", "ACCEPTED_WITH_RUNTIME_WARNING"},
                    "qualityGate": report.get("qualityGate"),
                    "temporal": report.get("temporalAntiShimmerQA"),
                    "semanticMeshV9": report.get("semanticMeshV9"),
                }

    rows = load_rows(args.benchmark_dir)
    required = [x.strip().lower() for x in args.required_targets.split(",") if x.strip()]
    tiers = [x.strip().lower() for x in args.required_tiers.split(",") if x.strip()]
    history = FleetHistoryV9(SERVICE_ROOT / "runtime" / "fleet-history-v9.sqlite3")
    recorded = history.record(rows, "verification-fixture") if rows else 0
    all_rows = history.rows()

    runtime_gate = aggregate_runtime_benchmarks_v6(rows, {"requiredTargets": required}) if rows else {"status": "UNVERIFIED", "passed": False}
    runtime_gate["schemaVersion"] = 9
    gpu_targets = [t for t in required if t in {"godot", "web"}]
    gpu_gate = engine_native_gpu_timing_gate(rows, {"requiredTargets": gpu_targets})
    gpu_gate["schemaVersion"] = 9
    matrix = device_matrix_coverage(all_rows, {"requiredTargets": required, "requiredTiers": tiers, "minRunsPerCell": 3})
    longitudinal = longitudinal_fleet_gate_v9(all_rows, {
        "requiredTargets": required,
        "requiredTiers": tiers,
        "minRunsPerCell": 5,
        "minDevicesPerCell": 2,
        "minSessionsPerCell": 3,
        "minDaysPerCell": 2,
        "minBuildsPerCell": 1,
    })
    shader = shader_memory_telemetry_gate_v9(rows, {"requiredTargets": gpu_targets})
    advanced = validate_advanced_gpu_counters_v9(rows, {"required": args.require_advanced_gpu, "requiredTargets": gpu_targets})
    device_farm_rows = load_rows(args.device_farm_result)
    device_farm = validate_device_farm_result_v9(device_farm_rows) if device_farm_rows else {"schemaVersion": 9, "status": "UNVERIFIED", "passed": False}
    roblox_input = load_json(args.roblox_automation_result)
    roblox = validate_roblox_studio_automation_v9(roblox_input) if roblox_input else {"schemaVersion": 9, "status": "UNVERIFIED", "passed": False}

    semantic_status = "READY"
    static = {"fidelity": True, "temporal": True}
    if fixture is not None:
        static["fidelity"] = bool((fixture.get("qualityGate") or {}).get("passed"))
        static["temporal"] = bool((fixture.get("temporal") or {}).get("passed"))
        semantic = (fixture.get("semanticMeshV9") or {}).get("inference") or {}
        semantic_status = str(semantic.get("status") or "UNAVAILABLE")
    semantic_gate = {"schemaVersion": 9, "status": semantic_status}

    readiness = production_readiness_gate_v9(
        static, runtime_gate, gpu_gate, matrix, longitudinal, shader, semantic_gate, roblox, device_farm,
        {
            "requireRuntimeEvidence": True,
            "requireNativeGpuTiming": bool(gpu_targets),
            "requireDeviceMatrix": True,
            "requireLongitudinalFleet": True,
            "requireShaderMemoryTelemetry": bool(gpu_targets),
            "requireMeshNativeSemantic": bool(args.fixture),
            "requireRobloxStudioVerification": args.require_roblox_automation,
            "requireDeviceFarmEvidence": args.require_device_farm,
        },
    )

    report = {
        "schemaVersion": 9,
        "staticChecks": checks,
        "staticPassed": all(x["passed"] for x in checks),
        "fixture": fixture,
        "fleetHistoryRecorded": recorded,
        "runtime": runtime_gate,
        "nativeGpuTiming": gpu_gate,
        "deviceMatrix": matrix,
        "longitudinalFleet": longitudinal,
        "shaderMemoryTelemetry": shader,
        "advancedGpuCounters": advanced,
        "deviceFarm": device_farm,
        "gpuProfilerDiscovery": discover_gpu_counter_tools_v9(),
        "robloxAutomation": roblox,
        "productionReadiness": readiness,
    }
    report["passed"] = report["staticPassed"] and (fixture is None or fixture.get("passed")) and readiness.get("fleetVerified", False)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
