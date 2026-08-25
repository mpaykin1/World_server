from __future__ import annotations

import json
import math
import os
import shutil
import struct
import subprocess
from pathlib import Path
from typing import Callable


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(float(value), high))


def glb_extensions(path: Path) -> set[str]:
    path = Path(path)
    if not path.is_file():
        return set()
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        return set()
    try:
        json_len, json_type = struct.unpack("<II", data[12:20])
        if json_type != 0x4E4F534A:
            return set()
        doc = json.loads(data[20:20 + json_len].decode("utf-8"))
        return set(doc.get("extensionsUsed") or []) | set(doc.get("extensionsRequired") or [])
    except Exception:
        return set()


def screen_space_lod_plan(
    radius: float,
    fov_degrees: float = 70.0,
    desktop_height: int = 1080,
    mobile_height: int = 720,
    pixel_targets: list[float] | None = None,
) -> dict:
    radius = max(float(radius), 0.001)
    fov = math.radians(_clamp(fov_degrees, 35.0, 110.0))
    pixels = [max(float(x), 2.0) for x in (pixel_targets or [320.0, 150.0, 64.0, 26.0, 10.0])]

    def distances(viewport_height: int) -> list[float]:
        rows: list[float] = []
        denom_scale = 2.0 * math.tan(fov * 0.5)
        for px in pixels:
            distance = radius * float(viewport_height) / (denom_scale * px)
            rows.append(round(max(distance, radius * 1.1), 3))
        for index in range(1, len(rows)):
            rows[index] = round(max(rows[index], rows[index - 1] * 1.25), 3)
        return rows

    labels = ["LOD0", "LOD1", "LOD2", "LOD3", "HLOD"]
    desktop = distances(int(desktop_height))
    mobile = distances(int(mobile_height))
    return {
        "schemaVersion": 1,
        "method": "projected_sphere_screen_space_error",
        "radius": radius,
        "verticalFovDegrees": float(fov_degrees),
        "pixelRadiusTargets": pixels,
        "desktop": {label: desktop[i] for i, label in enumerate(labels)},
        "mobile": {label: mobile[i] for i, label in enumerate(labels)},
        "impostor": {
            "desktopFrom": round(desktop[-1] * 1.8, 3),
            "mobileFrom": round(mobile[-1] * 1.55, 3),
        },
        "hysteresisPercent": 12,
    }


def build_occlusion_cells(object_bounds: list[dict] | None, fallback_radius: float, cell_size: float | None = None) -> dict:
    rows = list(object_bounds or [])
    if not rows:
        return {"schemaVersion": 1, "status": "SKIPPED_NO_OBJECT_BOUNDS", "cells": []}
    size = _clamp(float(cell_size or max(float(fallback_radius) * 0.65, 2.0)), 1.0, 100.0)
    cells: dict[tuple[int, int, int], list[dict]] = {}
    for row in rows:
        center = row.get("center") or [0.0, 0.0, 0.0]
        if len(center) != 3:
            continue
        key = tuple(int(math.floor(float(v) / size)) for v in center)
        cells.setdefault(key, []).append({
            "object": row.get("name"),
            "center": [round(float(v), 4) for v in center],
            "radius": round(float(row.get("radius", 0.0) or 0.0), 4),
        })
    output = [{"cell": list(key), "objects": cells[key], "objectCount": len(cells[key])} for key in sorted(cells)]
    return {
        "schemaVersion": 1,
        "status": "CREATED",
        "cellSize": round(size, 4),
        "cellCount": len(output),
        "cells": output,
        "purpose": "runtime occlusion/streaming/HLOD scheduling hint; engine-native occlusion remains authoritative",
    }


def compare_multi_light_sets(base_root: Path, candidate_root: Path, compare_pair: Callable, policy: dict) -> dict:
    base_root = Path(base_root)
    candidate_root = Path(candidate_root)
    rows = []
    for base in sorted(base_root.glob("*.png")):
        candidate = candidate_root / base.name
        if not candidate.is_file():
            continue
        metric = compare_pair(base, candidate)
        metric["sample"] = base.stem
        rows.append(metric)
    if not rows:
        return {"passed": False, "status": "NO_RENDER_PAIRS", "samples": []}
    min_sil = min(x["silhouetteIoU"] for x in rows)
    avg_vis = sum(x["visualSimilarity"] for x in rows) / len(rows)
    sil_t = float(policy.get("silhouetteIoU", 0.992))
    vis_t = float(policy.get("visualSimilarity", 0.90))
    passed = min_sil >= sil_t and avg_vis >= vis_t
    return {
        "passed": bool(passed),
        "status": "PASSED" if passed else "FAILED",
        "minSilhouetteIoU": round(min_sil, 6),
        "avgVisualSimilarity": round(avg_vis, 6),
        "thresholds": {"silhouetteIoU": sil_t, "visualSimilarity": vis_t},
        "samples": rows,
    }


def run_blender_finalizer(blender: str, script: Path, input_glb: Path, output_dir: Path, config: dict) -> dict:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    config_path = output_dir / "finalize-v4-config.json"
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    log_path = output_dir / "finalize-v4-blender.log"
    cmd = [
        blender, "--background", "--factory-startup", "--python", str(script), "--",
        "--input", str(input_glb), "--output-dir", str(output_dir), "--config", str(config_path),
    ]
    with log_path.open("w", encoding="utf-8", errors="replace") as log:
        proc = subprocess.run(
            cmd,
            stdout=log,
            stderr=subprocess.STDOUT,
            timeout=int(os.environ.get("AI3D_MESH_FINALIZE_TIMEOUT_SEC", "2400")),
            check=False,
        )
    manifest = output_dir / "finalize-v4-manifest.json"
    if proc.returncode != 0 or not manifest.is_file():
        tail = log_path.read_text(encoding="utf-8", errors="replace")[-5000:] if log_path.is_file() else ""
        return {"status": "FAILED", "returnCode": proc.returncode, "logTail": tail}
    try:
        result = json.loads(manifest.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"status": "FAILED", "reason": f"manifest parse error: {exc}"}
    result["log"] = log_path.name
    return result


def _run(cmd: list[str], timeout: int = 900) -> tuple[int, str]:
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=timeout, check=False)
    return proc.returncode, proc.stdout[-5000:]


def try_modern_web_compression(input_glb: Path, output_dir: Path) -> dict:
    input_glb = Path(input_glb)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    current = input_glb
    report = {"status": "NO_VERIFIED_MODERN_COMPRESSION", "steps": [], "selected": input_glb.name}

    gltfpack = os.environ.get("GLTFPACK_BIN") or shutil.which("gltfpack")
    if gltfpack:
        meshopt = output_dir / "WEB_MESHOPT.glb"
        rc, output = _run([gltfpack, "-i", str(current), "-o", str(meshopt), "-cc"])
        extensions = glb_extensions(meshopt) if rc == 0 else set()
        verified = "EXT_meshopt_compression" in extensions
        report["steps"].append({"tool": "gltfpack", "returnCode": rc, "verified": verified, "extensions": sorted(extensions), "logTail": output})
        if verified:
            current = meshopt
            report["status"] = "VERIFIED_MESHOPT"
            report["selected"] = meshopt.name

    transform = os.environ.get("GLTF_TRANSFORM_BIN") or shutil.which("gltf-transform")
    if transform:
        ktx = output_dir / "WEB_KTX2.glb"
        rc, output = _run([transform, "uastc", str(current), str(ktx)])
        extensions = glb_extensions(ktx) if rc == 0 else set()
        verified = "KHR_texture_basisu" in extensions
        report["steps"].append({"tool": "gltf-transform uastc", "returnCode": rc, "verified": verified, "extensions": sorted(extensions), "logTail": output})
        if verified:
            current = ktx
            report["status"] = "VERIFIED_KTX2" if report["status"] == "NO_VERIFIED_MODERN_COMPRESSION" else "VERIFIED_MESHOPT_PLUS_KTX2"
            report["selected"] = ktx.name

    report["selectedPath"] = str(current)
    return report


def write_engine_binding_pack(job_dir: Path, detail_maps: list[dict], atlas: dict, lod_plan: dict, occlusion: dict) -> list[Path]:
    job_dir = Path(job_dir)
    manifest_path = job_dir / "material-bindings-v4.json"
    manifest_path.write_text(json.dumps({
        "schemaVersion": 4,
        "atlas": atlas,
        "detailMaps": detail_maps,
        "lodPlan": lod_plan,
        "occlusionCells": "occlusion-cells.json",
        "principle": "bind generated maps only when present; never replace a valid authored channel with a missing generated map",
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    godot = job_dir / "godot_apply_quality_v4.gd"
    godot.write_text("""extends Node\n# Generated adapter; preserves authored materials.\nfunc apply_visibility_ranges(root: Node) -> void:\n    for node in root.find_children(\"*\", \"GeometryInstance3D\", true, false):\n        if node is GeometryInstance3D:\n            node.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF\n            node.visibility_range_fade_margin = 1.0\n""", encoding="utf-8")

    web = job_dir / "web_apply_quality_v4.js"
    web.write_text("""export function applyQualityV4(root, maps = {}) {\n  root.traverse?.((obj) => {\n    const material = obj.material;\n    if (!material) return;\n    if (maps.normalMap && !material.normalMap) material.normalMap = maps.normalMap;\n    if (maps.roughnessMap && !material.roughnessMap) material.roughnessMap = maps.roughnessMap;\n    if (maps.aoMap && !material.aoMap) material.aoMap = maps.aoMap;\n    material.needsUpdate = true;\n  });\n}\n""", encoding="utf-8")

    roblox = job_dir / "roblox_apply_quality_v4.luau"
    roblox.write_text("""local function applySurfaceAppearance(root, bindings)\n    for _, inst in ipairs(root:GetDescendants()) do\n        if inst:IsA(\"MeshPart\") then\n            local row = bindings[inst.Name]\n            if row then\n                local sa = inst:FindFirstChildOfClass(\"SurfaceAppearance\") or Instance.new(\"SurfaceAppearance\")\n                sa.Name = \"AUTO_PBR_V4\"\n                if row.ColorMap then sa.ColorMap = row.ColorMap end\n                if row.NormalMap then sa.NormalMap = row.NormalMap end\n                if row.RoughnessMap then sa.RoughnessMap = row.RoughnessMap end\n                if row.MetalnessMap then sa.MetalnessMap = row.MetalnessMap end\n                sa.Parent = inst\n            end\n        end\n    end\nend\nreturn applySurfaceAppearance\n""", encoding="utf-8")
    return [manifest_path, godot, web, roblox]


def write_runtime_benchmark_pack(job_dir: Path, lod_plan: dict) -> list[Path]:
    job_dir = Path(job_dir)
    spec = job_dir / "runtime-benchmark-spec.json"
    spec.write_text(json.dumps({
        "schemaVersion": 4,
        "warmupSeconds": 5,
        "sampleSeconds": 20,
        "targets": {
            "desktop": {"minAverageFps": 60, "maxP95FrameMs": 22, "maxDrawCallGrowthPercent": 5},
            "mobile": {"minAverageFps": 30, "maxP95FrameMs": 38, "maxDrawCallGrowthPercent": 5},
        },
        "lodPlan": lod_plan,
        "rule": "A runtime benchmark may only be marked VERIFIED when executed inside the actual target engine/runtime.",
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    godot = job_dir / "godot_runtime_benchmark_v4.gd"
    godot.write_text("""extends Node\nvar samples: Array[float] = []\nvar elapsed := 0.0\nfunc _process(delta: float) -> void:\n    elapsed += delta\n    if elapsed >= 5.0: samples.append(delta * 1000.0)\n    if elapsed >= 25.0:\n        samples.sort()\n        var avg_ms := 0.0\n        for v in samples: avg_ms += v\n        avg_ms /= max(samples.size(), 1)\n        var p95_index := int(clamp(floor(samples.size() * 0.95), 0, max(samples.size() - 1, 0)))\n        var p95 := samples[p95_index] if samples.size() > 0 else 999.0\n        print(JSON.stringify({\"avgFps\": 1000.0 / max(avg_ms, 0.001), \"p95FrameMs\": p95, \"samples\": samples.size()}))\n        get_tree().quit()\n""", encoding="utf-8")

    web = job_dir / "web_runtime_benchmark_v4.js"
    web.write_text("""export async function benchmarkV4(seconds = 20) {\n  const frames = []; const start = performance.now(); let prev = start;\n  return await new Promise((resolve) => {\n    function tick(now) {\n      frames.push(now - prev); prev = now;\n      if (now - start < seconds * 1000) return requestAnimationFrame(tick);\n      const sorted = frames.slice().sort((a,b)=>a-b);\n      const avg = frames.reduce((a,b)=>a+b,0) / Math.max(frames.length,1);\n      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 999;\n      resolve({avgFps: 1000 / Math.max(avg, 0.001), p95FrameMs: p95, frames: frames.length});\n    }\n    requestAnimationFrame(tick);\n  });\n}\n""", encoding="utf-8")

    roblox = job_dir / "roblox_runtime_benchmark_v4.luau"
    roblox.write_text("""local RunService = game:GetService(\"RunService\")\nlocal HttpService = game:GetService(\"HttpService\")\nlocal start = os.clock()\nlocal samples = {}\nlocal connection\nconnection = RunService.RenderStepped:Connect(function(dt)\n    local elapsed = os.clock() - start\n    if elapsed >= 5 then table.insert(samples, dt * 1000) end\n    if elapsed >= 25 then\n        connection:Disconnect(); table.sort(samples)\n        local total = 0\n        for _, v in ipairs(samples) do total += v end\n        local avg = total / math.max(#samples, 1)\n        local p95 = samples[math.max(1, math.floor(#samples * 0.95))] or 999\n        print(\"[MESH_V4_BENCH]\", HttpService:JSONEncode({avgFps = 1000 / math.max(avg, 0.001), p95FrameMs = p95, samples = #samples}))\n    end\nend)\n""", encoding="utf-8")
    return [spec, godot, web, roblox]
