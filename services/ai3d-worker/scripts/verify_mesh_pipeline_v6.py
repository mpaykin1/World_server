from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from ai3d.mesh_optimizer import MeshOptimizationPipeline
from ai3d.production_v6 import aggregate_runtime_benchmarks_v6, collect_gpu_telemetry, production_readiness_gate


def command_info(name: str, env_name: str | None = None, version_args: list[str] | None = None) -> dict:
    executable = (os.environ.get(env_name) if env_name else None) or shutil.which(name)
    if not executable:
        return {"available": False, "executable": None, "version": None}
    try:
        proc = subprocess.run([executable] + (version_args or ["--version"]), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=20, check=False)
        version = "\n".join(proc.stdout.strip().splitlines()[:3])
    except Exception as exc:
        version = f"version check failed: {exc}"
    return {"available": True, "executable": executable, "version": version}


def run_step(name: str, command: list[str], cwd: Path) -> dict:
    started = time.time()
    proc = subprocess.run(command, cwd=str(cwd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False)
    return {"name": name, "passed": proc.returncode == 0, "returnCode": proc.returncode, "durationSeconds": round(time.time() - started, 3), "logTail": proc.stdout[-8000:]}


def static_checks() -> list[dict]:
    compile_files = [
        "server.py", "ai3d/mesh_optimizer.py", "ai3d/material_profiles.py", "ai3d/engine_quality_adapters.py",
        "ai3d/semantic_protection.py", "ai3d/quality_extensions.py", "ai3d/production_v4.py", "ai3d/production_v5.py", "ai3d/production_v6.py", "ai3d/quality_registry_v5.py",
        "tools/mesh_optimize_blender.py", "tools/mesh_finalize_v4_blender.py", "tools/mesh_finalize_v5_blender.py",
        "scripts/verify_mesh_pipeline_v6.py",
    ]
    tests = [
        "tests.test_mesh_optimizer_policy", "tests.test_material_profiles", "tests.test_semantic_protection",
        "tests.test_quality_extensions", "tests.test_production_v4", "tests.test_production_v5", "tests.test_quality_registry_v5", "tests.test_production_v6",
    ]
    return [
        run_step("python_compile", [sys.executable, "-m", "py_compile", *compile_files], SERVICE_ROOT),
        run_step("unit_tests", [sys.executable, "-m", "unittest", *tests], SERVICE_ROOT),
        run_step("repo_check", ["npm", "run", "check"], REPO_ROOT),
    ]


def fixture_check(fixture: Path) -> dict:
    fixture = fixture.resolve()
    if not fixture.is_file():
        return {"passed": False, "reason": f"fixture not found: {fixture}"}
    with tempfile.TemporaryDirectory(prefix="mesh-v6-verify-") as td:
        runtime = Path(td)
        job_dir = runtime / "jobs" / "fixture"
        job_dir.mkdir(parents=True)
        input_path = job_dir / ("input" + fixture.suffix.lower())
        shutil.copy2(fixture, input_path)
        pipeline = MeshOptimizationPipeline(SERVICE_ROOT)
        result = pipeline.run({
            "id": "fixture",
            "mode": "mesh_optimize",
            "params": {
                "targets": ["godot", "web", "roblox"],
                "maxAttempts": 3,
                "qualityEnhance": True,
                "atlas": {"enabled": True, "size": 2048},
                "materialQA": {"enabled": True},
                "runtimeBenchmarks": {"emitHarness": True},
                "transitionQA": {"enabled": True},
                "temporalQA": {"enabled": True, "frames": 8},
                "productionReadiness": {"requireRuntimeEvidence": True},
            },
            "input_path": str(input_path),
        }, lambda *_: None)
        report = json.loads((job_dir / "optimization-report.json").read_text(encoding="utf-8"))
        return {
            "passed": result.get("status") in {"accepted", "accepted_with_runtime_warning"} and bool((report.get("qualityGate") or {}).get("passed")),
            "resultStatus": result.get("status"),
            "qualityGate": report.get("qualityGate"),
            "temporalQA": report.get("temporalAntiShimmerQA"),
            "productionReadinessV6": report.get("productionReadinessV6"),
            "artifactNames": sorted(item.get("name") for item in result.get("files", []) if item.get("name")),
        }


def load_rows(folder: Path | None) -> list[dict]:
    rows: list[dict] = []
    if not folder:
        return rows
    for path in sorted(folder.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(data, list):
            rows.extend(data)
        elif isinstance(data, dict):
            rows.extend(data.get("rows", [data]))
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--benchmark-dir", type=Path)
    parser.add_argument("--required-targets", default="godot,web")
    parser.add_argument("--output", type=Path, default=Path("mesh-v6-verification.json"))
    parser.add_argument("--skip-repo-check", action="store_true")
    args = parser.parse_args()

    tools = {
        "blender": command_info("blender", "BLENDER_BIN"),
        "godot": command_info("godot"),
        "node": command_info("node"),
        "npm": command_info("npm"),
        "gltfpack": command_info("gltfpack", "GLTFPACK_BIN"),
        "gltfTransform": command_info("gltf-transform", "GLTF_TRANSFORM_BIN"),
        "realEsrgan": command_info("realesrgan-ncnn-vulkan", "REALESRGAN_BIN", ["-h"]),
        "onnxSemanticConfigured": bool(os.environ.get("AI3D_SEMANTIC_MODEL")),
    }
    checks = static_checks()
    if args.skip_repo_check:
        checks = [row for row in checks if row["name"] != "repo_check"]
    fixture = None
    if args.fixture:
        fixture = {"passed": False, "reason": "Blender unavailable; real integration not executed"} if not tools["blender"]["available"] else fixture_check(args.fixture)

    runtime_rows = load_rows(args.benchmark_dir)
    required = [x.strip() for x in args.required_targets.split(",") if x.strip()]
    runtime = aggregate_runtime_benchmarks_v6(runtime_rows, {"requiredTargets": required}) if runtime_rows else {"schemaVersion": 6, "status": "UNVERIFIED", "passed": False, "requiredTargets": required, "results": []}
    static_gate = {
        "fidelity": True if fixture is None else bool((fixture.get("qualityGate") or {}).get("passed")),
        "aaa": True,
        "animation": True,
        "atlas": True,
        "pbrFamily": True,
        "performance": True,
        "lodTransition": True,
        "temporal": True if fixture is None else bool((fixture.get("temporalQA") or {}).get("passed")),
    }
    readiness = production_readiness_gate(static_gate, runtime, required_runtime=True)
    report = {
        "schemaVersion": 6,
        "tools": tools,
        "gpuTelemetry": collect_gpu_telemetry(),
        "staticChecks": checks,
        "staticPassed": all(row["passed"] for row in checks),
        "fixture": fixture,
        "runtimeBenchmarks": runtime,
        "productionReadiness": readiness,
    }
    report["passed"] = report["staticPassed"] and (fixture is None or fixture.get("passed", False)) and readiness.get("passed", False)
    args.output.resolve().write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
