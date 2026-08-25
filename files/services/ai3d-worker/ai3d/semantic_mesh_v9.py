from __future__ import annotations

import json
import math
import os
import subprocess
from pathlib import Path
from typing import Any


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(float(v), hi))


def _ranges(indices: list[int]) -> list[list[int]]:
    values = sorted({int(i) for i in indices if int(i) >= 0})
    if not values:
        return []
    out: list[list[int]] = []
    start = prev = values[0]
    for value in values[1:]:
        if value == prev + 1:
            prev = value
            continue
        out.append([start, prev])
        start = prev = value
    out.append([start, prev])
    return out


def _softmax_binary(row: Any) -> float:
    try:
        vals = [float(x) for x in row]
    except Exception:
        return _clamp(float(row))
    if not vals:
        return 0.0
    if len(vals) == 1:
        x = vals[0]
        return _clamp(x if 0.0 <= x <= 1.0 else 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, x)))))
    m = max(vals)
    ex = [math.exp(max(-30.0, min(30.0, v - m))) for v in vals]
    denom = sum(ex) or 1.0
    return _clamp(ex[min(1, len(ex) - 1)] / denom)


def fuse_mesh_semantic_scores_v9(
    multiview: list[float],
    intrinsic: list[float],
    pointcloud_ml: list[float] | None = None,
    policy: dict | None = None,
) -> dict:
    """Fuse camera and mesh-native evidence conservatively.

    The protected set uses weighted evidence for compatibility, while callers that already have
    protected camera vertices keep them through the shared Blender UNION vertex group. A 3D model
    can add protection but can never erase existing V7/V8 camera/rig/shape-key protection.
    """
    p = dict(policy or {})
    w2d = _clamp(p.get("multiViewWeight", 0.48))
    w3d = _clamp(p.get("intrinsicWeight", 0.42))
    wml = _clamp(p.get("pointCloudMlWeight", 0.35)) if pointcloud_ml else 0.0
    threshold = _clamp(p.get("protectThreshold", p.get("threshold", 0.56)), 0.05, 0.95)
    n = max(len(multiview), len(intrinsic), len(pointcloud_ml or []))
    if n == 0:
        return {"schemaVersion": 9, "status": "NO_EVIDENCE", "weights": [], "protected": []}
    weights: list[float] = []
    protected: list[int] = []
    for i in range(n):
        a = float(multiview[i]) if i < len(multiview) else 0.0
        b = float(intrinsic[i]) if i < len(intrinsic) else 0.0
        c = float(pointcloud_ml[i]) if pointcloud_ml and i < len(pointcloud_ml) else 0.0
        score = _clamp((a * w2d + b * w3d + c * wml) / max(w2d + w3d + wml, 1e-9))
        weights.append(round(score, 6))
        if score >= threshold:
            protected.append(i)
    coverage = len(protected) / max(n, 1)
    min_cov = float(p.get("minCoverage", 0.001))
    max_cov = float(p.get("maxCoverage", 0.92))
    return {
        "schemaVersion": 9,
        "status": "FUSED" if min_cov <= coverage <= max_cov else "REJECTED_COVERAGE",
        "weights": weights,
        "protected": protected,
        "coverage": round(coverage, 6),
        "threshold": threshold,
        "sources": {"multiView": bool(multiview), "intrinsic": bool(intrinsic), "pointCloudMl": bool(pointcloud_ml)},
    }


def intrinsic_importance_from_topology(
    vertex_count: int,
    edges: list[tuple[int, int]],
    sharp_edges: set[tuple[int, int]] | None = None,
    boundary_vertices: set[int] | None = None,
    material_boundary_vertices: set[int] | None = None,
) -> list[float]:
    sharp = {tuple(sorted(x)) for x in (sharp_edges or set())}
    boundary = set(boundary_vertices or set())
    material = set(material_boundary_vertices or set())
    degree = [0] * max(vertex_count, 0)
    sharp_degree = [0] * max(vertex_count, 0)
    for a, b in edges or []:
        if 0 <= a < vertex_count and 0 <= b < vertex_count:
            degree[a] += 1
            degree[b] += 1
            if tuple(sorted((a, b))) in sharp:
                sharp_degree[a] += 1
                sharp_degree[b] += 1
    out = []
    for i in range(vertex_count):
        score = 0.10
        if i in boundary:
            score = max(score, 0.92)
        if i in material:
            score = max(score, 0.84)
        if sharp_degree[i]:
            score = max(score, min(0.95, 0.62 + 0.12 * sharp_degree[i]))
        if degree[i] <= 2:
            score = max(score, 0.66)
        out.append(round(_clamp(score), 6))
    return out


def pointcloud_model_status_v9(policy: dict | str | None = None) -> dict:
    if isinstance(policy, str):
        configured = Path(policy)
    else:
        p = dict(policy or {})
        configured = Path(str(p.get("modelPath") or os.environ.get("AI3D_POINTCLOUD_SEMANTIC_ONNX") or os.environ.get("AI3D_SEMANTIC_3D_MODEL") or ""))
    if not configured.is_file():
        return {
            "schemaVersion": 9,
            "status": "FALLBACK_GEOMETRY_NATIVE",
            "available": False,
            "modelPath": None,
            "backend": "geometry_native_fallback",
            "reason": "No provisioned 3D semantic ONNX model",
        }
    try:
        import onnxruntime as ort  # type: ignore

        return {
            "schemaVersion": 9,
            "status": "READY",
            "available": True,
            "modelPath": str(configured),
            "backend": "onnxruntime",
            "providers": ort.get_available_providers(),
        }
    except Exception as exc:
        return {
            "schemaVersion": 9,
            "status": "FALLBACK_GEOMETRY_NATIVE",
            "available": False,
            "modelPath": str(configured),
            "backend": "geometry_native_fallback",
            "reason": str(exc),
        }


def build_mesh_native_policy_v9(policy: dict | None = None) -> dict:
    p = dict(policy or {})
    model = pointcloud_model_status_v9(p)
    return {
        "schemaVersion": 9,
        "enabled": bool(p.get("enabled", True)),
        "threshold": _clamp(p.get("threshold", 0.62), 0.15, 0.95),
        "minCoverage": _clamp(p.get("minCoverage", 0.002), 0.0001, 0.25),
        "maxCoverage": _clamp(p.get("maxCoverage", 0.92), 0.20, 0.98),
        "sharpAngleDegrees": max(10.0, min(float(p.get("sharpAngleDegrees", 32.0)), 85.0)),
        "protectBoundary": bool(p.get("protectBoundary", True)),
        "protectMaterialBoundaries": bool(p.get("protectMaterialBoundaries", True)),
        "protectThinTopology": bool(p.get("protectThinTopology", True)),
        "minWeight": _clamp(p.get("minWeight", 0.55), 0.05, 0.95),
        "groupName": "AI3D_SEMANTIC_PROTECTED",
        "pointCloudModel": model,
        "status": "READY",
        "rule": "Geometry-native protection is always available and merges into the same protected group as V8. Optional 3D ONNX evidence may add protection but can never remove camera/rig/shape-key protection.",
    }


def extract_mesh_native_features(blender: str, script_path: Path, source_path: Path, output_dir: Path, policy: dict | None = None) -> dict:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    config_path = output_dir / "semantic-mesh-v9-config.json"
    config_path.write_text(json.dumps(policy or {}, ensure_ascii=False, indent=2), encoding="utf-8")
    manifest = output_dir / "semantic-mesh-v9-features.json"
    log = output_dir / "semantic-mesh-v9-blender.log"
    cmd = [
        str(blender), "--background", "--factory-startup", "--python", str(script_path), "--",
        "--input", str(source_path), "--output", str(manifest), "--config", str(config_path),
    ]
    try:
        with log.open("w", encoding="utf-8", errors="replace") as handle:
            proc = subprocess.run(cmd, stdout=handle, stderr=subprocess.STDOUT, text=True, timeout=900, check=False)
        if proc.returncode != 0 or not manifest.is_file():
            return {"schemaVersion": 9, "status": "FAILED", "featuresCreated": False, "returnCode": proc.returncode, "log": str(log)}
        data = json.loads(manifest.read_text(encoding="utf-8"))
        data["featuresCreated"] = True
        data["manifestPath"] = str(manifest)
        return data
    except Exception as exc:
        return {"schemaVersion": 9, "status": "FAILED", "featuresCreated": False, "reason": str(exc), "log": str(log)}


def _onnx_vertex_probabilities(feature_file: Path, model_path: Path) -> list[float]:
    import numpy as np
    import onnxruntime as ort  # type: ignore

    data = np.load(feature_file)
    x = np.asarray(data["features"], dtype=np.float32)
    if x.ndim != 2 or x.shape[0] <= 0:
        raise ValueError("semantic feature matrix must be [vertices, features]")
    session = ort.InferenceSession(str(model_path), providers=ort.get_available_providers())
    input_meta = session.get_inputs()[0]
    rank = len(input_meta.shape or [])
    feed = x[None, :, :] if rank == 3 else x
    outputs = session.run(None, {input_meta.name: feed})
    if not outputs:
        raise ValueError("3D semantic ONNX returned no outputs")
    y = np.asarray(outputs[0])
    while y.ndim > 2 and y.shape[0] == 1:
        y = y[0]
    if y.ndim == 1:
        probs = [_softmax_binary(v) for v in y.tolist()]
    elif y.ndim == 2:
        if y.shape[0] != x.shape[0] and y.shape[1] == x.shape[0]:
            y = y.T
        if y.shape[0] != x.shape[0]:
            raise ValueError(f"ONNX vertex output count mismatch: {y.shape} vs {x.shape}")
        probs = [_softmax_binary(row.tolist()) for row in y]
    else:
        raise ValueError(f"unsupported ONNX output shape {y.shape}")
    if len(probs) != x.shape[0]:
        raise ValueError("ONNX probability count mismatch")
    return probs


def run_mesh_native_semantic(features: dict, output_dir: Path, policy: dict | None = None) -> dict:
    """Produce per-object protected ranges from intrinsic geometry plus optional real 3D ONNX.

    The ONNX path is additive. If inference fails or produces suspicious global coverage, V9 keeps
    the intrinsic protection and reports the fallback instead of silently accepting bad ML output.
    """
    p = dict(policy or {})
    threshold = float(p.get("threshold", 0.62))
    min_cov = float(p.get("minCoverage", 0.002))
    max_cov = float(p.get("maxCoverage", 0.92))
    objects = list(features.get("objects") or [])
    total = sum(int(o.get("vertexCount") or 0) for o in objects)
    model = pointcloud_model_status_v9(p)
    model_probs: list[float] | None = None
    model_error = None
    feature_file = Path(str(features.get("featureFile") or ""))
    if model.get("available") and bool(p.get("useOnnxWhenProvisioned", True)) and feature_file.is_file():
        try:
            model_probs = _onnx_vertex_probabilities(feature_file, Path(str(model.get("modelPath"))))
        except Exception as exc:
            model_error = str(exc)
            model_probs = None

    result_objects = []
    cursor = 0
    intrinsic_total = 0
    fused_total = 0
    for obj in objects:
        count = int(obj.get("vertexCount") or 0)
        intrinsic_indices = [int(i) for i in (obj.get("protectedIndices") or []) if 0 <= int(i) < count]
        intrinsic = set(intrinsic_indices)
        intrinsic_total += len(intrinsic)
        ml_selected: set[int] = set()
        if model_probs is not None:
            start = int(obj.get("featureStart", cursor))
            for local in range(count):
                idx = start + local
                if idx < len(model_probs) and float(model_probs[idx]) >= threshold:
                    ml_selected.add(local)
        fused = intrinsic | ml_selected
        fused_total += len(fused)
        result_objects.append({
            "object": obj.get("object"),
            "vertexCount": count,
            "protectedRanges": _ranges(sorted(fused)),
            "intrinsicProtected": len(intrinsic),
            "mlProtected": len(ml_selected),
            "protectedVertices": len(fused),
        })
        cursor += count

    intrinsic_cov = intrinsic_total / max(total, 1)
    fused_cov = fused_total / max(total, 1)
    ml_rejected = False
    if model_probs is not None and fused_cov > max_cov:
        # Reject suspicious ML expansion while retaining deterministic intrinsic protection.
        ml_rejected = True
        fused_total = intrinsic_total
        fused_cov = intrinsic_cov
        for row, src in zip(result_objects, objects):
            intrinsic = [int(i) for i in (src.get("protectedIndices") or []) if 0 <= int(i) < int(src.get("vertexCount") or 0)]
            row["protectedRanges"] = _ranges(intrinsic)
            row["mlProtected"] = 0
            row["protectedVertices"] = len(intrinsic)

    if not features.get("featuresCreated"):
        status, enabled = "UNAVAILABLE", False
    elif total <= 0:
        status, enabled = "NO_MESH_VERTICES", False
    else:
        status, enabled = ("READY_ML_REJECTED_INTRINSIC_FALLBACK" if ml_rejected else "READY"), True

    backend = "mesh_intrinsic"
    if model_probs is not None and not ml_rejected:
        backend = "mesh_intrinsic+onnxruntime"
    elif model_error:
        backend = "mesh_intrinsic+onnx_failed_fallback"

    result = {
        "schemaVersion": 9,
        "status": status,
        "enabled": enabled,
        "vertexCount": total,
        "protectedVertices": fused_total,
        "coverage": round(fused_cov, 6),
        "intrinsicCoverage": round(intrinsic_cov, 6),
        "objects": result_objects,
        "pointCloudModel": model,
        "backend": backend,
        "modelInferenceError": model_error,
        "mlRejectedForCoverage": ml_rejected,
        "coverageGuard": {"min": min_cov, "max": max_cov},
        "rule": "V9 3D ONNX evidence is additive only. Suspicious ML coverage is discarded while deterministic mesh/rig protection remains active.",
    }
    out = Path(output_dir) / "semantic-mesh-v9-result.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    result["resultPath"] = str(out)
    return result


def mesh_native_projection_config(result: dict) -> dict:
    if not str(result.get("status") or "").startswith("READY"):
        return {"schemaVersion": 9, "enabled": False, "status": result.get("status", "UNAVAILABLE")}
    return {
        "schemaVersion": 9,
        "enabled": True,
        "status": "READY",
        "coverage": result.get("coverage", 0.0),
        "source": "mesh_native_v9",
        "resultPath": result.get("resultPath"),
        "backend": result.get("backend"),
    }


def fuse_semantic_evidence_v9(camera_projection: dict, mesh_projection: dict) -> dict:
    camera = bool((camera_projection or {}).get("enabled"))
    mesh = bool((mesh_projection or {}).get("enabled"))
    return {
        "schemaVersion": 9,
        "status": "FUSED" if camera and mesh else ("CAMERA_ONLY" if camera else "MESH_ONLY" if mesh else "HEURISTIC_ONLY"),
        "cameraEvidence": camera,
        "meshEvidence": mesh,
        "rule": "V9 semantic evidence is union-only. Mesh-native evidence may add protected vertices but never removes V8 camera, rig, shape-key or name-based protection.",
    }
