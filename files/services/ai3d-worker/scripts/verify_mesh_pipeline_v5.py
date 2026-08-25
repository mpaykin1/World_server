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

from ai3d.mesh_optimizer import MeshOptimizationPipeline  # noqa: E402
from ai3d.production_v5 import aggregate_runtime_benchmarks  # noqa: E402


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
        "ai3d/semantic_protection.py", "ai3d/quality_extensions.py", "ai3d/production_v4.py", "ai3d/production_v5.py", "ai3d/quality_registry_v5.py",
        "tools/mesh_optimize_blender.py", "tools/mesh_finalize_v4_blender.py", "tools/mesh_finalize_v5_blender.py",
        "scripts/verify_mesh_pipeline_v5.py",
    ]
    tests = [
        "tests.test_mesh_optimizer_policy", "tests.test_material_profiles", "tests.test_semantic_protection",
        "tests.test_quality_extensions", "tests.test_production_v4", "tests.test_production_v5", "tests.test_quality_registry_v5",
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
    with tempfile.TemporaryDirectory(prefix="mesh-v5-verify-") as td:
        runtime = Path(td)
        job_dir = runtime / "jobs" / "fixture"
        job_dir.mkdir(parents=True)
        input_path = job_dir / ("input" + fixture.suffix.lower())
        shutil.copy2(fixture, input_path)
        pipeline = MeshOptimizationPipeline(SERVICE_ROOT)
        updates = []

        def progress(value: int, message: str):
            updates.append({"progress": int(value), "message": message})

        result = pipeline.run({
            "id": "fixture", "mode": "mesh_optimize",
            "params": {
                "targets": ["godot", "web", "roblox"], "maxAttempts": 3, "qualityEnhance": True,
                "atlas": {"enabled": True, "size": 2048}, "materialQA": {"enabled": True},
                "runtimeBenchmarks": {"emitHarness": True}, "transitionQA": {"enabled": True},
            },
            "input_path": str(input_path),
        }, progress)
        report_path = job_dir / "optimization-report.json"
        report = json.loads(report_path.read_text(encoding="utf-8")) if report_path.is_file() else {}
        gates = {
            "fidelity": bool((report.get("qualityGate") or {}).get("passed")),
            "animation": bool((report.get("animationGate") or {}).get("passed", True)),
            "atlasMaterial": bool((report.get("atlasMaterialQA") or {}).get("passed", True)),
            "pbrFamily": bool((report.get("pbrFamilyAudit") or {}).get("passed", True)),
            "performance": bool((report.get("performanceGate") or {}).get("passed", True)),
            "lodTransition": bool((report.get("lodTransitionQA") or {}).get("passed", False)),
        }
        hard_gates = {key: value for key, value in gates.items() if key != "lodTransition"}
        return {
            "passed": all(hard_gates.values()) and result.get("status") in {"accepted", "accepted_with_runtime_warning"},
            "gates": gates,
            "resultStatus": result.get("status"),
            "metrics": report.get("metrics"),
            "finalizeV5": report.get("finalizeV5"),
            "portalOcclusion": report.get("portalOcclusion"),
            "hardwareQualityPolicy": report.get("hardwareQualityPolicy"),
            "semanticBackend": report.get("semanticBackend"),
            "progressTail": updates[-12:],
            "artifactNames": sorted(item.get("name") for item in result.get("files", []) if item.get("name")),
        }


def load_benchmarks(folder: Path | None) -> dict | None:
    if not folder:
        return None
    rows = []
    for path in sorted(folder.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(data, list):
            rows.extend(data)
        elif isinstance(data, dict):
            rows.extend(data.get("rows", [data]))
    return aggregate_runtime_benchmarks(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--benchmark-dir", type=Path)
    parser.add_argument("--output", type=Path, default=Path("mesh-v5-verification.json"))
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
        "semanticModelConfigured": bool(os.environ.get("AI3D_SEMANTIC_MODEL")),
    }
    checks = static_checks()
    if args.skip_repo_check:
        checks = [row for row in checks if row["name"] != "repo_check"]
    fixture = None
    if args.fixture:
        fixture = {"passed": False, "reason": "Blender unavailable; real integration was not executed"} if not tools["blender"]["available"] else fixture_check(args.fixture)
    runtime = load_benchmarks(args.benchmark_dir)
    report = {
        "schemaVersion": 5,
        "tools": tools,
        "staticChecks": checks,
        "staticPassed": all(row["passed"] for row in checks),
        "fixture": fixture,
        "runtimeBenchmarks": runtime,
        "rule": "Runtime is VERIFIED only from actual engine output with executedInTarget=true.",
    }
    report["passed"] = report["staticPassed"] and (fixture is None or fixture.get("passed", False)) and (runtime is None or runtime.get("status") != "FAILED")
    output = args.output.resolve()
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
