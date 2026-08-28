from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image

from .validation import file_meta
from .engine_quality_adapters import write_quality_preset
from .production_v4 import (
    build_occlusion_cells,
    compare_multi_light_sets,
    run_blender_finalizer,
    screen_space_lod_plan,
    try_modern_web_compression,
    write_engine_binding_pack,
    write_runtime_benchmark_pack,
)
from .production_v5 import (
    build_portal_room_graph,
    hardware_tier_policy,
    lod_transition_gate,
    optional_semantic_model_status,
    pbr_family_audit,
    run_blender_finalizer_v5,
    texel_density_plan,
    write_benchmark_collector,
    write_v5_engine_pack,
    write_runtime_benchmark_v5_pack,
)
from .quality_registry_v5 import QualityRegistryV5
from .production_v6 import (
    bake_pvs,
    collect_gpu_telemetry,
    aggregate_runtime_benchmarks_v6,
    production_readiness_gate,
    run_optional_semantic_inference,
    temporal_anti_shimmer_gate,
    write_v6_runtime_pack,
)
from .production_v7 import (
    collect_gpu_telemetry_v7,
    engine_native_gpu_timing_gate,
    production_readiness_gate_v7,
    refine_pvs_from_runtime,
    write_v7_runtime_pack,
)
from .semantic_projection_v7 import (
    render_semantic_reference,
    run_semantic_mask_inference,
    semantic_projection_config,
)
from .semantic_fusion_v8 import (
    build_multiview_projection_config,
    render_semantic_multiview,
    run_multiview_semantic_inference,
)
from .production_v8 import (
    DeviceHistoryV8,
    calibrate_policy_from_device_history,
    collect_gpu_telemetry_v8,
    device_matrix_coverage,
    production_readiness_gate_v8,
    refine_pvs_confidence_v8,
    validate_roblox_place_runtime,
    write_v8_runtime_pack,
)
from .semantic_mesh_v9 import (
    build_mesh_native_policy_v9,
    extract_mesh_native_features,
    fuse_semantic_evidence_v9,
    mesh_native_projection_config,
    pointcloud_model_status_v9,
    run_mesh_native_semantic,
)
from .production_v9 import (
    DeviceHistoryV9,
    FleetHistoryV9,
    device_farm_plan_v9,
    discover_gpu_counter_tools_v9,
    fleet_evidence_gate_v9,
    longitudinal_fleet_gate_v9,
    production_readiness_gate_v9,
    pvs_removal_candidates_v9,
    robust_device_calibration_v9,
    shader_memory_telemetry_gate_v9,
    statistical_calibration_v9,
    validate_advanced_gpu_counters_v9,
    validate_device_farm_result_v9,
    validate_roblox_studio_automation_v9,
    validate_roblox_studio_bridge_v9,
    write_v9_runtime_pack,
)
from .production_v10 import (
    build_pvs_canary_plan_v10,
    build_roblox_verification_contract_v10,
    device_farm_integrity_gate_v10,
    evidence_completeness_gate_v10,
    fleet_drift_gate_v10,
    normalize_profiler_evidence_v10,
    pvs_pruning_proof_v10,
    validate_pvs_canary_result_v10,
    validate_roblox_verification_result_v10,
    validate_semantic_model_contract_v10,
    write_v10_evidence_pack,
)
from .production_v11 import quality_confidence_v11
from .production_v12 import compatibility_matrix_gate_v12, shader_stutter_gate_v12, thermal_memory_pressure_gate_v12, write_v12_runtime_pack
from .quality_extensions import (
    compare_animation_sets,
    glb_extensions,
    reconstruct_detail_maps,
    static_performance_gate,
    stitch_impostor_atlas,
    try_ai_texture_enhancement,
)

PIPELINE_VERSION = "12.0.0"
ALLOWED_MESH_EXTENSIONS = {".glb", ".gltf", ".obj", ".ply", ".fbx"}


@dataclass(frozen=True)
class QualityThresholds:
    silhouette_iou: float = 0.985
    visual_similarity: float = 0.94


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(float(value), high))


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_mesh_upload(path: Path) -> dict:
    path = Path(path)
    ext = path.suffix.lower()
    if ext not in ALLOWED_MESH_EXTENSIONS:
        raise ValueError(f"Unsupported mesh extension: {ext}")
    if not path.is_file() or path.stat().st_size < 64:
        raise ValueError("Mesh file is missing or too small")

    head = path.read_bytes()[:65536]
    if ext == ".glb" and head[:4] != b"glTF":
        raise ValueError("Invalid GLB magic")
    if ext == ".gltf":
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise ValueError(f"Invalid glTF JSON: {exc}") from exc
        if not isinstance(doc, dict) or "asset" not in doc:
            raise ValueError("Invalid glTF: asset section is missing")
    if ext == ".ply" and not head.lstrip().startswith(b"ply"):
        raise ValueError("Invalid PLY header")
    if ext == ".fbx":
        valid_binary = head.startswith(b"Kaydara FBX Binary")
        valid_ascii = b"FBXHeaderExtension" in head or b"; FBX" in head[:2048]
        if not (valid_binary or valid_ascii):
            raise ValueError("Invalid FBX header")
    if ext == ".obj":
        text = head.decode("utf-8", errors="ignore")
        meaningful = any(
            line.startswith(("v ", "f ", "o ", "g ", "mtllib ", "usemtl "))
            for line in text.splitlines()
        )
        if not meaningful:
            raise ValueError("OBJ does not contain recognizable geometry records")

    return {"extension": ext, "size": path.stat().st_size, "sha256": _sha256(path)}


def normalize_policy(params: dict | None) -> dict:
    p = dict(params or {})
    lod = p.get("lodRatios") or [0.78, 0.52, 0.26, 0.10]
    if not isinstance(lod, list) or len(lod) != 4:
        lod = [0.78, 0.52, 0.26, 0.10]
    lod = [_clamp(x, 0.03, 1.0) for x in lod]
    lod = [max(lod[i], lod[i + 1]) for i in range(3)] + [lod[3]]
    lod[0] = max(lod[0], 0.35)

    texture_sizes = p.get("textureSizes") or [4096, 2048, 1024, 512]
    if not isinstance(texture_sizes, list) or len(texture_sizes) != 4:
        texture_sizes = [4096, 2048, 1024, 512]
    texture_sizes = [int(_clamp(x, 256, 8192)) for x in texture_sizes]

    targets = p.get("targets") or ["godot", "web", "roblox"]
    if not isinstance(targets, list):
        targets = ["godot", "web", "roblox"]
    targets = [str(x).lower() for x in targets if str(x).lower() in {"godot", "web", "roblox"}]
    if not targets:
        targets = ["godot", "web", "roblox"]

    thresholds = p.get("qualityThresholds") or {}
    silhouette = _clamp(thresholds.get("silhouetteIoU", 0.985), 0.85, 1.0)
    visual = _clamp(thresholds.get("visualSimilarity", 0.94), 0.75, 1.0)

    return {
        "targets": targets,
        "lodRatios": lod,
        "textureSizes": texture_sizes,
        "qualityThresholds": {
            "silhouetteIoU": silhouette,
            "visualSimilarity": visual,
        },
        "maxAttempts": int(_clamp(p.get("maxAttempts", 3), 1, 4)),
        "renderSize": int(_clamp(p.get("renderSize", 512), 256, 1024)),
        "preserveAnimation": bool(p.get("preserveAnimation", True)),
        "preserveShapeKeys": bool(p.get("preserveShapeKeys", True)),
        "qualityEnhance": bool(p.get("qualityEnhance", True)),
        "collisionMode": str(p.get("collisionMode", "convex_hull")),
        "minMergeDistance": float(_clamp(p.get("minMergeDistance", 1e-6), 0.0, 1e-3)),
        "webCompression": str(p.get("webCompression", "draco")),
        "strictGate": bool(p.get("strictGate", True)),
        "animationRenderSize": int(_clamp(p.get("animationRenderSize", 384), 192, 768)),
        "impostorRenderSize": int(_clamp(p.get("impostorRenderSize", 384), 192, 1024)),
        "animationQA": {
            "enabled": bool((p.get("animationQA") or {}).get("enabled", True)),
            "silhouetteIoU": _clamp((p.get("animationQA") or {}).get("silhouetteIoU", 0.965), 0.85, 1.0),
            "visualSimilarity": _clamp((p.get("animationQA") or {}).get("visualSimilarity", 0.88), 0.70, 1.0),
        },
        "detailBake": {
            "enabled": bool((p.get("detailBake") or {}).get("enabled", True)),
            "size": int(_clamp((p.get("detailBake") or {}).get("size", 1024), 256, 2048)),
            "maxObjects": int(_clamp((p.get("detailBake") or {}).get("maxObjects", 8), 1, 32)),
        },
        "textureEnhancement": {
            "enabled": bool((p.get("textureEnhancement") or {}).get("enabled", True)),
            "targetMin": int(_clamp((p.get("textureEnhancement") or {}).get("targetMin", 2048), 512, 4096)),
            "maxTextures": int(_clamp((p.get("textureEnhancement") or {}).get("maxTextures", 16), 1, 64)),
        },
        "performanceGate": {
            "enabled": bool((p.get("performanceGate") or {}).get("enabled", True)),
            "maxCollisionTriangleRatio": _clamp((p.get("performanceGate") or {}).get("maxCollisionTriangleRatio", 0.18), 0.02, 0.60),
        },
        "atlas": {
            "enabled": bool((p.get("atlas") or {}).get("enabled", True)),
            "size": int(_clamp((p.get("atlas") or {}).get("size", 2048), 512, 4096)),
        },
        "materialQA": {
            "enabled": bool((p.get("materialQA") or {}).get("enabled", True)),
            "renderSize": int(_clamp((p.get("materialQA") or {}).get("renderSize", 384), 192, 768)),
            "silhouetteIoU": _clamp((p.get("materialQA") or {}).get("silhouetteIoU", 0.992), 0.90, 1.0),
            "visualSimilarity": _clamp((p.get("materialQA") or {}).get("visualSimilarity", 0.90), 0.70, 1.0),
        },
        "lodCalibration": {
            "enabled": bool((p.get("lodCalibration") or {}).get("enabled", True)),
            "verticalFovDegrees": _clamp((p.get("lodCalibration") or {}).get("verticalFovDegrees", 70.0), 35.0, 110.0),
            "desktopHeight": int(_clamp((p.get("lodCalibration") or {}).get("desktopHeight", 1080), 480, 2160)),
            "mobileHeight": int(_clamp((p.get("lodCalibration") or {}).get("mobileHeight", 720), 360, 1440)),
        },
        "modernCompression": {
            "enabled": bool((p.get("modernCompression") or {}).get("enabled", True)),
        },
        "runtimeBenchmarks": {
            "emitHarness": bool((p.get("runtimeBenchmarks") or {}).get("emitHarness", True)),
        },
        "transitionQA": {
            "enabled": bool((p.get("transitionQA") or {}).get("enabled", True)),
            "silhouetteIoU": _clamp((p.get("transitionQA") or {}).get("silhouetteIoU", 0.965), 0.80, 1.0),
            "visualSimilarity": _clamp((p.get("transitionQA") or {}).get("visualSimilarity", 0.86), 0.65, 1.0),
        },
        "atlasV5": {
            "maxUvStretchRatio": _clamp((p.get("atlasV5") or {}).get("maxUvStretchRatio", 35.0), 2.0, 200.0),
        },
        "portalOcclusion": {
            "enabled": bool((p.get("portalOcclusion") or {}).get("enabled", True)),
            "cellSize": _clamp((p.get("portalOcclusion") or {}).get("cellSize", 8.0), 2.0, 64.0),
        },
        "hardwareAdaptive": {
            "enabled": bool((p.get("hardwareAdaptive") or {}).get("enabled", True)),
            "profile": dict((p.get("hardwareAdaptive") or {}).get("profile") or {}),
        },
        "semanticML": {
            "enabledWhenProvisioned": bool((p.get("semanticML") or {}).get("enabledWhenProvisioned", True)),
        },
        "temporalQA": {
            "enabled": bool((p.get("temporalQA") or {}).get("enabled", True)),
            "frames": int(_clamp((p.get("temporalQA") or {}).get("frames", 8), 4, 16)),
            "renderSize": int(_clamp((p.get("temporalQA") or {}).get("renderSize", 384), 192, 768)),
            "maxInstabilityRatio": _clamp((p.get("temporalQA") or {}).get("maxInstabilityRatio", 1.45), 1.0, 4.0),
            "maxAbsoluteDelta": _clamp((p.get("temporalQA") or {}).get("maxAbsoluteDelta", 0.035), 0.005, 0.25),
        },
        "pvs": {
            "enabled": bool((p.get("pvs") or {}).get("enabled", True)),
            "hopDepth": int(_clamp((p.get("pvs") or {}).get("hopDepth", 2), 1, 6)),
        },
        "productionReadiness": {
            "requireRuntimeEvidence": bool((p.get("productionReadiness") or {}).get("requireRuntimeEvidence", True)),
        },
        "semanticProjectionV7": {
            "enabled": bool((p.get("semanticProjectionV7") or {}).get("enabled", True)),
            "protectedClassIds": [int(x) for x in ((p.get("semanticProjectionV7") or {}).get("protectedClassIds") or [])],
            "threshold": _clamp((p.get("semanticProjectionV7") or {}).get("threshold", 0.5), 0.05, 0.95),
            "renderSize": int(_clamp((p.get("semanticProjectionV7") or {}).get("renderSize", 512), 256, 1024)),
        },
        "nativeGpuTimingV7": {
            "required": bool((p.get("nativeGpuTimingV7") or {}).get("required", True)),
            "requiredTargets": list((p.get("nativeGpuTimingV7") or {}).get("requiredTargets") or ["godot", "web"]),
        },
        "pvsLearningV7": {
            "enabled": bool((p.get("pvsLearningV7") or {}).get("enabled", True)),
            "minSamples": int(_clamp((p.get("pvsLearningV7") or {}).get("minSamples", 3), 1, 50)),
        },
        "semanticFusionV8": {
            "enabled": bool((p.get("semanticFusionV8") or {}).get("enabled", True)),
            "views": int(_clamp((p.get("semanticFusionV8") or {}).get("views", 8), 4, 12)),
            "minVerifiedViews": int(_clamp((p.get("semanticFusionV8") or {}).get("minVerifiedViews", 4), 2, 12)),
            "minObservedViews": int(_clamp((p.get("semanticFusionV8") or {}).get("minObservedViews", 1), 1, 8)),
            "minVoteFraction": _clamp((p.get("semanticFusionV8") or {}).get("minVoteFraction", 0.34), 0.05, 1.0),
            "rayVisibility": bool((p.get("semanticFusionV8") or {}).get("rayVisibility", True)),
            "renderSize": int(_clamp((p.get("semanticFusionV8") or {}).get("renderSize", 512), 256, 1024)),
        },
        "deviceCalibrationV8": {
            "enabled": bool((p.get("deviceCalibrationV8") or {}).get("enabled", True)),
            "minRuns": int(_clamp((p.get("deviceCalibrationV8") or {}).get("minRuns", 20), 10, 500)),
            "minPassRate": _clamp((p.get("deviceCalibrationV8") or {}).get("minPassRate", 0.85), 0.50, 1.0),
            "maxLodRatioDelta": _clamp((p.get("deviceCalibrationV8") or {}).get("maxLodRatioDelta", 0.08), 0.01, 0.15),
        },
        "deviceMatrixV8": {
            "requiredTargets": list((p.get("deviceMatrixV8") or {}).get("requiredTargets") or ["web", "godot"]),
            "requiredTiers": list((p.get("deviceMatrixV8") or {}).get("requiredTiers") or ["low", "mid", "high"]),
            "minRunsPerCell": int(_clamp((p.get("deviceMatrixV8") or {}).get("minRunsPerCell", 3), 1, 20)),
        },
        "pvsLearningV8": {
            "enabled": bool((p.get("pvsLearningV8") or {}).get("enabled", True)),
            "minObservations": int(_clamp((p.get("pvsLearningV8") or {}).get("minObservations", 8), 3, 100)),
            "minSessions": int(_clamp((p.get("pvsLearningV8") or {}).get("minSessions", 3), 1, 20)),
            "minCameraCells": int(_clamp((p.get("pvsLearningV8") or {}).get("minCameraCells", 3), 1, 20)),
        },
        "robloxPlaceVerificationV8": {
            "enabled": bool((p.get("robloxPlaceVerificationV8") or {}).get("enabled", True)),
            "requirePbrBindings": bool((p.get("robloxPlaceVerificationV8") or {}).get("requirePbrBindings", True)),
        },
        "productionReadinessV8": {
            "requireRuntimeEvidence": bool((p.get("productionReadinessV8") or {}).get("requireRuntimeEvidence", True)),
            "requireNativeGpuTiming": bool((p.get("productionReadinessV8") or {}).get("requireNativeGpuTiming", True)),
            "requireDeviceMatrixForFleetVerified": bool((p.get("productionReadinessV8") or {}).get("requireDeviceMatrixForFleetVerified", True)),
            "requireRobloxPlaceVerification": bool((p.get("productionReadinessV8") or {}).get("requireRobloxPlaceVerification", False)),
        },
        "semanticMeshV9": {
            "enabled": bool((p.get("semanticMeshV9") or {}).get("enabled", True)),
            "threshold": _clamp((p.get("semanticMeshV9") or {}).get("threshold", 0.62), 0.15, 0.95),
            "minCoverage": _clamp((p.get("semanticMeshV9") or {}).get("minCoverage", 0.002), 0.0001, 0.25),
            "maxCoverage": _clamp((p.get("semanticMeshV9") or {}).get("maxCoverage", 0.92), 0.20, 0.98),
            "useOnnxWhenProvisioned": bool((p.get("semanticMeshV9") or {}).get("useOnnxWhenProvisioned", True)),
            "sharpAngleDegrees": _clamp((p.get("semanticMeshV9") or {}).get("sharpAngleDegrees", 32.0), 10.0, 85.0),
            "protectBoundary": bool((p.get("semanticMeshV9") or {}).get("protectBoundary", True)),
            "protectMaterialBoundaries": bool((p.get("semanticMeshV9") or {}).get("protectMaterialBoundaries", True)),
            "protectThinTopology": bool((p.get("semanticMeshV9") or {}).get("protectThinTopology", True)),
            "minWeight": _clamp((p.get("semanticMeshV9") or {}).get("minWeight", 0.55), 0.05, 0.95),
            "modelPath": str((p.get("semanticMeshV9") or {}).get("modelPath") or ""),
        },
        "deviceCalibrationV9": {
            "enabled": bool((p.get("deviceCalibrationV9") or {}).get("enabled", True)),
            "minRuns": int(_clamp((p.get("deviceCalibrationV9") or {}).get("minRuns", 30), 20, 1000)),
            "minDistinctDevices": int(_clamp((p.get("deviceCalibrationV9") or {}).get("minDistinctDevices", 3), 2, 100)),
            "minDistinctDays": int(_clamp((p.get("deviceCalibrationV9") or {}).get("minDistinctDays", 3), 1, 90)),
            "minWilsonPassRate": _clamp((p.get("deviceCalibrationV9") or {}).get("minWilsonPassRate", 0.78), 0.50, 0.99),
            "maxLodRatioDelta": _clamp((p.get("deviceCalibrationV9") or {}).get("maxLodRatioDelta", 0.06), 0.01, 0.12),
            "maxEvidenceAgeDays": int(_clamp((p.get("deviceCalibrationV9") or {}).get("maxEvidenceAgeDays", 30), 1, 365)),
        },
        "fleetEvidenceV9": {
            "requiredTargets": list((p.get("fleetEvidenceV9") or {}).get("requiredTargets") or ["web", "godot"]),
            "requiredTiers": list((p.get("fleetEvidenceV9") or {}).get("requiredTiers") or ["low", "mid", "high"]),
            "minRunsPerCell": int(_clamp((p.get("fleetEvidenceV9") or {}).get("minRunsPerCell", 3), 2, 20)),
            "minDistinctDevicesPerCell": int(_clamp((p.get("fleetEvidenceV9") or {}).get("minDistinctDevicesPerCell", 2), 1, 20)),
            "maxEvidenceAgeDays": int(_clamp((p.get("fleetEvidenceV9") or {}).get("maxEvidenceAgeDays", 30), 1, 365)),
            "maxFpsCv": _clamp((p.get("fleetEvidenceV9") or {}).get("maxFpsCv", 0.18), 0.02, 1.0),
            "requireRepeatability": bool((p.get("fleetEvidenceV9") or {}).get("requireRepeatability", True)),
        },
        "fleetHistoryV9": {
            "requiredTargets": list((p.get("fleetHistoryV9") or {}).get("requiredTargets") or ["web", "godot"]),
            "requiredTiers": list((p.get("fleetHistoryV9") or {}).get("requiredTiers") or ["low", "mid", "high"]),
            "minRunsPerCell": int(_clamp((p.get("fleetHistoryV9") or {}).get("minRunsPerCell", 5), 1, 50)),
            "minDevicesPerCell": int(_clamp((p.get("fleetHistoryV9") or {}).get("minDevicesPerCell", 2), 1, 20)),
            "minSessionsPerCell": int(_clamp((p.get("fleetHistoryV9") or {}).get("minSessionsPerCell", 3), 1, 50)),
            "minDaysPerCell": int(_clamp((p.get("fleetHistoryV9") or {}).get("minDaysPerCell", 2), 1, 30)),
            "minBuildsPerCell": int(_clamp((p.get("fleetHistoryV9") or {}).get("minBuildsPerCell", 1), 1, 20)),
            "minWilsonPassRate": _clamp((p.get("fleetHistoryV9") or {}).get("minWilsonPassRate", 0.70), 0.50, 0.99),
            "maxEvidenceAgeDays": int(_clamp((p.get("fleetHistoryV9") or {}).get("maxEvidenceAgeDays", 30), 1, 365)),
        },
        "shaderTelemetryV9": {
            "requiredTargets": list((p.get("shaderTelemetryV9") or {}).get("requiredTargets") or ["godot", "web"]),
            "maxGpuP95Ms": _clamp((p.get("shaderTelemetryV9") or {}).get("maxGpuP95Ms", 20.0), 5.0, 100.0),
            "maxDrawCalls": int(_clamp((p.get("shaderTelemetryV9") or {}).get("maxDrawCalls", 5000), 100, 100000)),
        },
        "advancedGpuCountersV9": {
            "required": bool((p.get("advancedGpuCountersV9") or {}).get("required", False)),
            "requiredTargets": list((p.get("advancedGpuCountersV9") or {}).get("requiredTargets") or []),
        },
        "deviceFarmV9": {
            "enabled": bool((p.get("deviceFarmV9") or {}).get("enabled", True)),
            "sceneUrl": str((p.get("deviceFarmV9") or {}).get("sceneUrl") or ""),
            "tiers": list((p.get("deviceFarmV9") or {}).get("tiers") or ["low", "mid", "high"]),
            "minSamplesPerRun": int(_clamp((p.get("deviceFarmV9") or {}).get("minSamplesPerRun", 120), 10, 5000)),
        },
        "pvsRemovalProofV9": {
            "enabled": bool((p.get("pvsRemovalProofV9") or {}).get("enabled", True)),
            "minSessions": int(_clamp((p.get("pvsRemovalProofV9") or {}).get("minSessions", 30), 10, 1000)),
            "minObservations": int(_clamp((p.get("pvsRemovalProofV9") or {}).get("minObservations", 500), 100, 100000)),
            "minCameraCells": int(_clamp((p.get("pvsRemovalProofV9") or {}).get("minCameraCells", 12), 5, 100)),
        },
        "robloxAutomationV9": {
            "enabled": bool((p.get("robloxAutomationV9") or {}).get("enabled", True)),
            "requirePbrBindings": bool((p.get("robloxAutomationV9") or {}).get("requirePbrBindings", True)),
        },
        "productionReadinessV9": {
            "requireRuntimeEvidence": bool((p.get("productionReadinessV9") or {}).get("requireRuntimeEvidence", True)),
            "requireNativeGpuTiming": bool((p.get("productionReadinessV9") or {}).get("requireNativeGpuTiming", True)),
            "requireDeviceMatrix": bool((p.get("productionReadinessV9") or {}).get("requireDeviceMatrix", True)),
            "requireLongitudinalFleet": bool((p.get("productionReadinessV9") or {}).get("requireLongitudinalFleet", (p.get("productionReadinessV9") or {}).get("requireFleetEvidence", True))),
            "requireShaderMemoryTelemetry": bool((p.get("productionReadinessV9") or {}).get("requireShaderMemoryTelemetry", True)),
            "requireMeshNativeSemantic": bool((p.get("productionReadinessV9") or {}).get("requireMeshNativeSemantic", False)),
            "requireRobloxStudioVerification": bool((p.get("productionReadinessV9") or {}).get("requireRobloxStudioVerification", (p.get("productionReadinessV9") or {}).get("requireRobloxAutomation", False))),
            "requireDeviceFarmEvidence": bool((p.get("productionReadinessV9") or {}).get("requireDeviceFarmEvidence", False)),
            "requireAdvancedGpuCounters": bool((p.get("productionReadinessV9") or {}).get("requireAdvancedGpuCounters", False)),
        },
        "semanticModelContractV10": {
            "required": bool((p.get("semanticModelContractV10") or {}).get("required", False)),
            "contract": dict((p.get("semanticModelContractV10") or {}).get("contract") or {}),
            "minPrecision": _clamp((p.get("semanticModelContractV10") or {}).get("minPrecision", 0.90), 0.5, 1.0),
            "minRecall": _clamp((p.get("semanticModelContractV10") or {}).get("minRecall", 0.90), 0.5, 1.0),
            "maxExpectedCalibrationError": _clamp((p.get("semanticModelContractV10") or {}).get("maxExpectedCalibrationError", 0.08), 0.0, 0.5),
            "minValidationSamples": int(_clamp((p.get("semanticModelContractV10") or {}).get("minValidationSamples", 1000), 100, 1000000)),
        },
        "profilerEvidenceV10": {
            "required": bool((p.get("profilerEvidenceV10") or {}).get("required", False)),
            "acceptedBackends": list((p.get("profilerEvidenceV10") or {}).get("acceptedBackends") or []),
        },
        "deviceFarmIntegrityV10": {
            "required": bool((p.get("deviceFarmIntegrityV10") or {}).get("required", False)),
            "minSamplesPerRun": int(_clamp((p.get("deviceFarmIntegrityV10") or {}).get("minSamplesPerRun", 180), 30, 10000)),
            "requireBuildIdentity": bool((p.get("deviceFarmIntegrityV10") or {}).get("requireBuildIdentity", True)),
        },
        "fleetDriftV10": {
            "required": bool((p.get("fleetDriftV10") or {}).get("required", True)),
            "minRunsPerWindow": int(_clamp((p.get("fleetDriftV10") or {}).get("minRunsPerWindow", 20), 10, 1000)),
            "recentFraction": _clamp((p.get("fleetDriftV10") or {}).get("recentFraction", 0.35), 0.15, 0.50),
            "maxMedianFpsDropFraction": _clamp((p.get("fleetDriftV10") or {}).get("maxMedianFpsDropFraction", 0.12), 0.02, 0.50),
            "maxMedianP95IncreaseFraction": _clamp((p.get("fleetDriftV10") or {}).get("maxMedianP95IncreaseFraction", 0.15), 0.02, 0.50),
        },
        "pvsPruningProofV10": {
            "required": bool((p.get("pvsPruningProofV10") or {}).get("required", False)),
            "minSessions": int(_clamp((p.get("pvsPruningProofV10") or {}).get("minSessions", 50), 20, 5000)),
            "minBuilds": int(_clamp((p.get("pvsPruningProofV10") or {}).get("minBuilds", 3), 2, 100)),
            "minDevices": int(_clamp((p.get("pvsPruningProofV10") or {}).get("minDevices", 5), 3, 1000)),
            "minPortalStates": int(_clamp((p.get("pvsPruningProofV10") or {}).get("minPortalStates", 3), 2, 100)),
            "minHoldoutObservations": int(_clamp((p.get("pvsPruningProofV10") or {}).get("minHoldoutObservations", 250), 50, 100000)),
        },
        "robloxVerificationV10": {
            "required": bool((p.get("robloxVerificationV10") or {}).get("required", False)),
            "requirePublishedPlace": bool((p.get("robloxVerificationV10") or {}).get("requirePublishedPlace", True)),
            "requireAutomationEvidence": bool((p.get("robloxVerificationV10") or {}).get("requireAutomationEvidence", True)),
        },
        "evidenceCompletenessV10": {
            "requireSemanticModelContract": bool((p.get("evidenceCompletenessV10") or {}).get("requireSemanticModelContract", (p.get("semanticModelContractV10") or {}).get("required", False))),
            "requireRuntime": bool((p.get("evidenceCompletenessV10") or {}).get("requireRuntime", True)),
            "requireProfiler": bool((p.get("evidenceCompletenessV10") or {}).get("requireProfiler", (p.get("profilerEvidenceV10") or {}).get("required", False))),
            "requireDeviceFarm": bool((p.get("evidenceCompletenessV10") or {}).get("requireDeviceFarm", (p.get("deviceFarmIntegrityV10") or {}).get("required", False))),
            "requireLongitudinalFleet": bool((p.get("evidenceCompletenessV10") or {}).get("requireLongitudinalFleet", True)),
            "requireDriftStable": bool((p.get("evidenceCompletenessV10") or {}).get("requireDriftStable", True)),
            "requireRobloxStudio": bool((p.get("evidenceCompletenessV10") or {}).get("requireRobloxStudio", (p.get("robloxVerificationV10") or {}).get("required", False))),
            "requirePvsPruningProof": bool((p.get("evidenceCompletenessV10") or {}).get("requirePvsPruningProof", (p.get("pvsPruningProofV10") or {}).get("required", False))),
        },
        "aaaEnhancement": {
            "enabled": bool((p.get("aaaEnhancement") or {}).get("enabled", True)),
            "preserveSilhouetteIoU": _clamp((p.get("aaaEnhancement") or {}).get("preserveSilhouetteIoU", 0.995), 0.90, 1.0),
            "minDetailEnergyRatio": _clamp((p.get("aaaEnhancement") or {}).get("minDetailEnergyRatio", 0.96), 0.5, 2.0),
            "maxDetailEnergyRatio": _clamp((p.get("aaaEnhancement") or {}).get("maxDetailEnergyRatio", 2.35), 1.0, 5.0),
            "materialAutoclassify": bool((p.get("aaaEnhancement") or {}).get("materialAutoclassify", True)),
            "microBevel": bool((p.get("aaaEnhancement") or {}).get("microBevel", True)),
            "weatheringProfile": bool((p.get("aaaEnhancement") or {}).get("weatheringProfile", True)),
            "wetnessProfile": bool((p.get("aaaEnhancement") or {}).get("wetnessProfile", True)),
            "lightingProfiles": bool((p.get("aaaEnhancement") or {}).get("lightingProfiles", True)),
        },
    }


def _alpha_mask(arr: np.ndarray) -> np.ndarray:
    if arr.shape[-1] < 4:
        return np.ones(arr.shape[:2], dtype=bool)
    return arr[..., 3] > 8


def compare_render_pair(hq_path: Path, optimized_path: Path) -> dict:
    with Image.open(hq_path).convert("RGBA") as hq_img:
        hq = np.asarray(hq_img, dtype=np.float32) / 255.0
    with Image.open(optimized_path).convert("RGBA") as opt_img:
        opt = np.asarray(opt_img, dtype=np.float32) / 255.0

    if hq.shape != opt.shape:
        raise ValueError(f"Render sizes differ: {hq.shape} vs {opt.shape}")

    a = _alpha_mask(hq)
    b = _alpha_mask(opt)
    union = a | b
    inter = a & b
    silhouette_iou = 1.0 if not union.any() else float(inter.sum() / union.sum())

    if union.any():
        rgb_error = float(np.abs(hq[..., :3][union] - opt[..., :3][union]).mean())
    else:
        rgb_error = 0.0
    visual_similarity = float(_clamp(1.0 - rgb_error, 0.0, 1.0))

    return {
        "silhouetteIoU": round(silhouette_iou, 6),
        "visualSimilarity": round(visual_similarity, 6),
        "meanAbsoluteRgbError": round(rgb_error, 6),
    }


def compare_render_sets(hq_dir: Path, optimized_dir: Path, thresholds: dict) -> dict:
    pairs = []
    for hq_path in sorted(hq_dir.glob("*.png")):
        opt_path = optimized_dir / hq_path.name
        if not opt_path.is_file():
            continue
        metric = compare_render_pair(hq_path, opt_path)
        metric["view"] = hq_path.stem
        pairs.append(metric)

    if not pairs:
        return {
            "passed": False,
            "reason": "No comparable renders were produced",
            "views": [],
            "minSilhouetteIoU": 0.0,
            "avgVisualSimilarity": 0.0,
        }

    min_sil = min(x["silhouetteIoU"] for x in pairs)
    avg_vis = sum(x["visualSimilarity"] for x in pairs) / len(pairs)
    passed = min_sil >= float(thresholds["silhouetteIoU"]) and avg_vis >= float(thresholds["visualSimilarity"])
    return {
        "passed": bool(passed),
        "views": pairs,
        "minSilhouetteIoU": round(min_sil, 6),
        "avgVisualSimilarity": round(avg_vis, 6),
        "thresholds": thresholds,
    }


def _detail_energy(path: Path) -> float:
    with Image.open(path).convert("RGB") as image:
        arr = np.asarray(image, dtype=np.float32) / 255.0
    lum = arr[..., 0] * 0.2126 + arr[..., 1] * 0.7152 + arr[..., 2] * 0.0722
    if lum.shape[0] < 3 or lum.shape[1] < 3:
        return 0.0
    gx = np.abs(lum[:, 1:] - lum[:, :-1]).mean()
    gy = np.abs(lum[1:, :] - lum[:-1, :]).mean()
    return float(gx + gy)


def compare_enhancement_sets(base_dir: Path, enhanced_dir: Path, policy: dict) -> dict:
    rows = []
    for base in sorted(base_dir.glob("*.png")):
        enhanced = enhanced_dir / base.name
        if not enhanced.is_file():
            continue
        similarity = compare_render_pair(base, enhanced)
        before_energy = _detail_energy(base)
        after_energy = _detail_energy(enhanced)
        ratio = 1.0 if before_energy <= 1e-9 else after_energy / before_energy
        rows.append({
            "view": base.stem,
            "silhouetteIoU": similarity["silhouetteIoU"],
            "detailEnergyBefore": round(before_energy, 6),
            "detailEnergyAfter": round(after_energy, 6),
            "detailEnergyRatio": round(ratio, 6),
        })
    if not rows:
        return {"passed": False, "reason": "No AAA enhancement renders", "views": []}
    min_sil = min(r["silhouetteIoU"] for r in rows)
    avg_ratio = sum(r["detailEnergyRatio"] for r in rows) / len(rows)
    passed = (
        min_sil >= float(policy["preserveSilhouetteIoU"])
        and avg_ratio >= float(policy["minDetailEnergyRatio"])
        and avg_ratio <= float(policy["maxDetailEnergyRatio"])
    )
    return {
        "passed": bool(passed),
        "minSilhouetteIoU": round(min_sil, 6),
        "avgDetailEnergyRatio": round(avg_ratio, 6),
        "thresholds": policy,
        "views": rows,
    }


def _safe_reduction(before: float, after: float) -> float:
    if before <= 0:
        return 0.0
    return round((1.0 - after / before) * 100.0, 2)


class MeshOptimizationPipeline:
    def __init__(self, service_root: Path):
        self.service_root = Path(service_root)
        self.script = self.service_root / "tools" / "mesh_optimize_blender.py"
        self.semantic_projection_script_v7 = self.service_root / "tools" / "semantic_projection_v7_blender.py"
        self.semantic_multiview_script_v8 = self.service_root / "tools" / "semantic_multiview_v8_blender.py"
        self.semantic_mesh_script_v9 = self.service_root / "tools" / "semantic_mesh_v9_blender.py"
        self.finalizer_script = self.service_root / "tools" / "mesh_finalize_v5_blender.py"
        self.blender = os.environ.get("BLENDER_BIN") or shutil.which("blender") or "blender"

    def status(self) -> dict:
        resolved = shutil.which(self.blender) if not Path(self.blender).is_file() else self.blender
        return {
            "available": bool(resolved),
            "blender": str(resolved or self.blender),
            "pipelineVersion": PIPELINE_VERSION,
            "formats": sorted(ALLOWED_MESH_EXTENSIONS),
            "qualityGate": "multi_view_hq_vs_lod0",
        }

    def _run_blender(self, input_path: Path, out_dir: Path, config: dict) -> dict:
        out_dir.mkdir(parents=True, exist_ok=True)
        config_path = out_dir / "mesh-optimize-config.json"
        config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        log_path = out_dir / "blender-mesh-optimize.log"

        cmd = [
            self.blender,
            "--background",
            "--factory-startup",
            "--python",
            str(self.script),
            "--",
            "--input",
            str(input_path),
            "--output-dir",
            str(out_dir),
            "--config",
            str(config_path),
        ]
        started = time.time()
        with log_path.open("w", encoding="utf-8", errors="replace") as log:
            proc = subprocess.run(
                cmd,
                cwd=str(self.service_root),
                stdout=log,
                stderr=subprocess.STDOUT,
                timeout=int(os.environ.get("AI3D_MESH_OPTIMIZE_TIMEOUT_SEC", "1800")),
                check=False,
            )
        if proc.returncode != 0:
            tail = log_path.read_text(encoding="utf-8", errors="replace")[-6000:]
            raise RuntimeError(f"Blender mesh optimization failed ({proc.returncode}):\n{tail}")

        manifest_path = out_dir / "mesh-manifest.json"
        if not manifest_path.is_file():
            raise RuntimeError("Blender optimizer did not produce mesh-manifest.json")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["durationSeconds"] = round(time.time() - started, 3)
        return manifest

    @staticmethod
    def _copy_artifact(src: Path, dst: Path) -> Path:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        return dst

    def run(self, job: dict, progress: Callable[[int, str], None]) -> dict:
        params = normalize_policy(job.get("params"))
        input_path = Path(job["input_path"]) if job.get("input_path") else None
        if not input_path:
            raise RuntimeError("mesh_optimize requires an input model")
        upload = verify_mesh_upload(input_path)

        job_dir = Path(input_path).parent
        source_name = f"SOURCE_HQ{input_path.suffix.lower()}"
        source_path = job_dir / source_name
        if input_path.resolve() != source_path.resolve():
            shutil.copy2(input_path, source_path)

        progress(5, "Mesh optimizer: source preserved and validated")

        # V8 persistent device history may improve the starting LOD seed, but it never
        # relaxes visual/semantic/temporal gates. Weak history is ignored.
        device_history_v8 = DeviceHistoryV8(Path(os.environ.get("AI3D_RUNTIME_DIR", self.service_root / "runtime")) / "mesh-device-history-v8.sqlite3")
        device_groups_before_v8 = device_history_v8.groups()
        calibration_v8 = calibrate_policy_from_device_history(params, device_groups_before_v8, params.get("deviceCalibrationV8") or {})
        if (params.get("deviceCalibrationV8") or {}).get("enabled", True) and calibration_v8.get("applied"):
            params = calibration_v8["policy"]

        # V9 calibration adds diversity and statistical-confidence requirements. It can
        # only tune starting LOD ratios and never relax any visual/semantic gate.
        device_history_v9 = DeviceHistoryV9(Path(os.environ.get("AI3D_RUNTIME_DIR", self.service_root / "runtime")) / "mesh-device-history-v9.sqlite3")
        device_rows_before_v9 = device_history_v9.rows()
        calibration_v9 = robust_device_calibration_v9(params, device_rows_before_v9, params.get("deviceCalibrationV9") or {})
        if (params.get("deviceCalibrationV9") or {}).get("enabled", True) and calibration_v9.get("applied"):
            params = calibration_v9["policy"]

        semantic_mesh_v9_policy = build_mesh_native_policy_v9(params.get("semanticMeshV9") or {})
        params["semanticMeshV9"] = {**(params.get("semanticMeshV9") or {}), **{k:v for k,v in semantic_mesh_v9_policy.items() if k not in {"pointCloudModel","rule","schemaVersion"}}}
        semantic_model_path_v10 = Path(str((params.get("semanticMeshV9") or {}).get("modelPath") or "")) if str((params.get("semanticMeshV9") or {}).get("modelPath") or "").strip() else None
        semantic_contract_policy_v10 = params.get("semanticModelContractV10") or {}
        semantic_model_contract_v10 = validate_semantic_model_contract_v10(
            semantic_contract_policy_v10.get("contract") or {}, semantic_model_path_v10, semantic_contract_policy_v10
        )
        # V10: unverified ML never enters the destructive optimization path. Intrinsic mesh
        # protection remains enabled, so refusing an unproven model cannot reduce protection.
        if semantic_model_path_v10 is not None and not semantic_model_contract_v10.get("passed"):
            params["semanticMeshV9"] = {**(params.get("semanticMeshV9") or {}), "modelPath": "", "useOnnxWhenProvisioned": False}
        semantic_projection = {"enabled": False, "status": "DISABLED_OR_UNAVAILABLE"}
        semantic_mask_result = {"schemaVersion": 7, "status": "NOT_RUN", "maskCreated": False}
        semantic_fusion_v8 = {"schemaVersion": 8, "status": "NOT_RUN", "views": []}
        semantic_dir = job_dir / "semantic-v8"
        semantic_v8_policy = params.get("semanticFusionV8") or {}
        semantic_v7_policy = params.get("semanticProjectionV7") or {}
        semantic_model_available = bool(os.environ.get("AI3D_SEMANTIC_MODEL"))
        if semantic_v8_policy.get("enabled", True) and self.status().get("available") and semantic_model_available:
            multiview_render = render_semantic_multiview(
                self.blender, self.semantic_multiview_script_v8, source_path, semantic_dir,
                int(semantic_v8_policy.get("renderSize", 512)), int(semantic_v8_policy.get("views", 8)),
            )
            semantic_fusion_v8 = run_multiview_semantic_inference(multiview_render, semantic_dir, {**semantic_v7_policy, **semantic_v8_policy})
            semantic_projection = build_multiview_projection_config(semantic_fusion_v8, semantic_v8_policy)

        # Safe fallback: if multi-view evidence is missing or suspicious, retain the
        # proven V7 aligned single-view projection. If that also fails, Blender-side
        # semantic/name/rig heuristics remain authoritative.
        if not semantic_projection.get("enabled") and semantic_v7_policy.get("enabled", True) and self.status().get("available") and semantic_model_available:
            fallback_dir = job_dir / "semantic-v7-fallback"
            semantic_ref = render_semantic_reference(self.blender, self.semantic_projection_script_v7, source_path, fallback_dir, int(semantic_v7_policy.get("renderSize", 512)))
            if semantic_ref.get("status") == "CREATED":
                semantic_mask_result = run_semantic_mask_inference(Path(semantic_ref["image"]), fallback_dir / "semantic-protection-mask.png", semantic_v7_policy)
                semantic_projection = semantic_projection_config(semantic_mask_result, Path(semantic_ref["camera"]))

        # V9 adds true mesh-native evidence. It works without a 3D ML model using
        # conservative topology/rig salience, and can consume a provisioned ONNX point/vertex
        # classifier. Its protected vertices are UNIONED with V8 camera evidence.
        semantic_mesh_features_v9 = {"schemaVersion": 9, "status": "NOT_RUN", "featuresCreated": False}
        semantic_mesh_result_v9 = {"schemaVersion": 9, "status": "UNAVAILABLE", "enabled": False, "objects": []}
        semantic_mesh_config_v9 = {"schemaVersion": 9, "enabled": False, "status": "UNAVAILABLE"}
        if (params.get("semanticMeshV9") or {}).get("enabled", True) and self.status().get("available"):
            semantic_mesh_dir_v9 = job_dir / "semantic-mesh-v9"
            semantic_mesh_features_v9 = extract_mesh_native_features(
                self.blender, self.semantic_mesh_script_v9, source_path, semantic_mesh_dir_v9, params.get("semanticMeshV9") or {}
            )
            semantic_mesh_result_v9 = run_mesh_native_semantic(semantic_mesh_features_v9, semantic_mesh_dir_v9, params.get("semanticMeshV9") or {})
            semantic_mesh_config_v9 = mesh_native_projection_config(semantic_mesh_result_v9)
            if semantic_mesh_config_v9.get("enabled"):
                params["semanticMeshV9"] = {**(params.get("semanticMeshV9") or {}), **semantic_mesh_config_v9}
        semantic_evidence_v9 = fuse_semantic_evidence_v9(semantic_projection, semantic_mesh_config_v9)

        attempt_reports = []
        accepted = None
        initial_ratio = params["lodRatios"][0]

        for attempt in range(1, params["maxAttempts"] + 1):
            if attempt == 1:
                ratio0 = initial_ratio
            else:
                remaining = max(1, params["maxAttempts"] - 1)
                ratio0 = initial_ratio + (1.0 - initial_ratio) * ((attempt - 1) / remaining)
            ratio0 = round(_clamp(ratio0, initial_ratio, 1.0), 4)

            attempt_dir = job_dir / f"attempt-{attempt}"
            config = dict(params)
            config["lodRatios"] = [ratio0] + params["lodRatios"][1:]
            config["attempt"] = attempt
            config["semanticProjection"] = semantic_projection
            progress(10 + (attempt - 1) * 20, f"Mesh optimizer: Blender pass {attempt}, LOD0 ratio {ratio0:.2f}")

            manifest = self._run_blender(source_path, attempt_dir, config)
            quality = compare_render_sets(
                attempt_dir / "renders_hq",
                attempt_dir / "renders_lod0_base",
                params["qualityThresholds"],
            )
            animation_quality = {"status": "DISABLED", "passed": True, "samples": []}
            if params.get("animationQA", {}).get("enabled", True):
                animation_quality = compare_animation_sets(
                    attempt_dir / "renders_anim_hq",
                    attempt_dir / "renders_anim_lod0_base",
                    compare_render_pair,
                    params["animationQA"],
                )
            attempt_report = {
                "attempt": attempt,
                "lod0Ratio": ratio0,
                "quality": quality,
                "animationQuality": animation_quality,
                "manifest": manifest,
            }
            attempt_reports.append(attempt_report)

            if quality["passed"] and animation_quality.get("passed", True):
                accepted = attempt_report
                break

        report_path = job_dir / "optimization-report.json"
        files = [file_meta(source_path, "source_hq")]
        for candidate, kind in [
            (Path(str(semantic_mesh_features_v9.get("featurePath") or "")), "semantic_mesh_features_v9"),
            (Path(str(semantic_mesh_features_v9.get("manifestPath") or "")), "semantic_mesh_feature_manifest_v9"),
            (Path(str(semantic_mesh_result_v9.get("resultPath") or "")), "semantic_mesh_result_v9"),
        ]:
            if str(candidate) not in {".", ""} and candidate.is_file():
                files.append(file_meta(candidate, kind))
        if semantic_mask_result.get("maskCreated"):
            mask_path = Path(semantic_mask_result["maskPath"])
            if mask_path.is_file():
                files.append(file_meta(mask_path, "semantic_protection_mask_v7"))
        for view in semantic_fusion_v8.get("views") or []:
            mask_value = view.get("maskPath")
            if mask_value and Path(mask_value).is_file():
                files.append(file_meta(Path(mask_value), "semantic_protection_mask_v8"))
        semantic_status_path = job_dir / "semantic-projection-v7.json"
        semantic_status_path.write_text(json.dumps({"inference": semantic_mask_result, "projection": semantic_projection}, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(semantic_status_path, "semantic_projection_v7"))
        semantic_v8_path = job_dir / "semantic-fusion-v8.json"
        semantic_v8_path.write_text(json.dumps({"fusion": semantic_fusion_v8, "projection": semantic_projection}, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(semantic_v8_path, "semantic_fusion_v8"))
        calibration_path_v8 = job_dir / "device-calibration-v8.json"
        calibration_path_v8.write_text(json.dumps(calibration_v8, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(calibration_path_v8, "device_calibration_v8"))
        quality_gate = {
            "passed": bool(accepted),
            "policy": "HQ render is immutable; optimized output is published only after the visual gate passes",
            "attempts": [
                {
                    "attempt": x["attempt"],
                    "lod0Ratio": x["lod0Ratio"],
                    "passed": x["quality"]["passed"],
                    "minSilhouetteIoU": x["quality"]["minSilhouetteIoU"],
                    "avgVisualSimilarity": x["quality"]["avgVisualSimilarity"],
                    "animationPassed": x.get("animationQuality", {}).get("passed", True),
                    "animationStatus": x.get("animationQuality", {}).get("status", "UNKNOWN"),
                }
                for x in attempt_reports
            ],
        }

        if not accepted:
            report = {
                "pipelineVersion": PIPELINE_VERSION,
                "status": "REJECTED_BY_VISUAL_QUALITY_GATE",
                "source": upload,
                "policy": params,
                "qualityGate": quality_gate,
                "attempts": attempt_reports,
                "publishedOptimizedArtifacts": False,
            }
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            files.append(file_meta(report_path, "optimization_report"))
            progress(99, "Mesh optimizer: optimized version rejected; HQ source preserved")
            return {
                "files": files,
                "qualityGate": quality_gate,
                "metrics": {"accepted": False},
                "status": "rejected",
            }

        accepted_dir = job_dir / f"attempt-{accepted['attempt']}"
        manifest = accepted["manifest"]
        aaa_policy = params.get("aaaEnhancement") or {}
        aaa_gate = {"passed": False, "reason": "AAA enhancement disabled"}
        if aaa_policy.get("enabled"):
            aaa_gate = compare_enhancement_sets(
                accepted_dir / "renders_lod0_base",
                accepted_dir / "renders_lod0_aaa",
                aaa_policy,
            )

        chosen_lod0 = "LOD0_AAA.glb" if aaa_gate.get("passed") and (accepted_dir / "LOD0_AAA.glb").is_file() else "LOD0_BASE.glb"
        canonical_map = {
            "MASTER_HQ.glb": "master_hq",
            chosen_lod0: "lod0",
            "LOD1.glb": "lod1",
            "LOD2.glb": "lod2",
            "LOD3.glb": "lod3",
            "COLLISION.glb": "collision",
        }
        for name, kind in canonical_map.items():
            src = accepted_dir / name
            if src.is_file():
                public_name = "LOD0.glb" if kind == "lod0" else name
                dst = self._copy_artifact(src, job_dir / public_name)
                files.append(file_meta(dst, kind))

        if (accepted_dir / "LOD0_BASE.glb").is_file():
            files.append(file_meta(self._copy_artifact(accepted_dir / "LOD0_BASE.glb", job_dir / "LOD0_BASE.glb"), "lod0_base"))
        if (accepted_dir / "LOD0_AAA.glb").is_file():
            files.append(file_meta(self._copy_artifact(accepted_dir / "LOD0_AAA.glb", job_dir / "LOD0_AAA.glb"), "lod0_aaa_candidate"))

        # Far-distance assets: merged HLOD and an 8-view transparent impostor atlas.
        if (accepted_dir / "HLOD.glb").is_file():
            files.append(file_meta(self._copy_artifact(accepted_dir / "HLOD.glb", job_dir / "HLOD.glb"), "hlod"))
        impostor_result = stitch_impostor_atlas(accepted_dir / "renders_impostor", job_dir / "IMPOSTOR_ATLAS.png", params.get("impostorRenderSize", 384))
        if (job_dir / "IMPOSTOR_ATLAS.png").is_file():
            files.append(file_meta(job_dir / "IMPOSTOR_ATLAS.png", "impostor_atlas"))
        if (job_dir / "IMPOSTOR_ATLAS.json").is_file():
            files.append(file_meta(job_dir / "IMPOSTOR_ATLAS.json", "impostor_manifest"))

        # Convert the true HQ->LOD normal/AO bake into curvature + a reconstructed height field.
        detail_outputs = []
        detail_dir = accepted_dir / "detail_bakes"
        if detail_dir.is_dir():
            for normal in sorted(detail_dir.glob("*_NORMAL.png")):
                stem = normal.name[:-len("_NORMAL.png")]
                ao = detail_dir / f"{stem}_AO.png"
                public_normal = self._copy_artifact(normal, job_dir / f"DETAIL_{stem}_NORMAL.png")
                files.append(file_meta(public_normal, "detail_normal"))
                public_ao = None
                if ao.is_file():
                    public_ao = self._copy_artifact(ao, job_dir / f"DETAIL_{stem}_AO.png")
                    files.append(file_meta(public_ao, "detail_ao"))
                generated_dir = job_dir / f"detail_{stem}"
                result = reconstruct_detail_maps(public_normal, public_ao, generated_dir)
                generated = {}
                for key in ("height", "curvature", "ormBase"):
                    name = result.get(key)
                    if name and (generated_dir / name).is_file():
                        dst = self._copy_artifact(generated_dir / name, job_dir / f"DETAIL_{stem}_{name}")
                        files.append(file_meta(dst, f"detail_{key}"))
                        generated[key] = dst.name
                detail_outputs.append({"object": stem, "normal": public_normal.name, "ao": public_ao.name if public_ao else None, **generated, "method": result.get("heightMethod")})

        texture_enhancement = []
        texture_policy = params.get("textureEnhancement") or {}
        texture_manifest_path = accepted_dir / "textures_source" / "texture-source-manifest.json"
        if texture_policy.get("enabled", True) and texture_manifest_path.is_file():
            try:
                texture_manifest = json.loads(texture_manifest_path.read_text(encoding="utf-8"))
            except Exception:
                texture_manifest = {"textures": []}
            count = 0
            for row in texture_manifest.get("textures", []):
                if count >= int(texture_policy.get("maxTextures", 16)):
                    break
                source_name = row.get("file")
                if not source_name:
                    continue
                if min(int(row.get("width", 0)), int(row.get("height", 0))) >= int(texture_policy.get("targetMin", 2048)):
                    continue
                source_texture = accepted_dir / "textures_source" / source_name
                if not source_texture.is_file():
                    continue
                roles = row.get("roles") or ["generic"]
                role = "normal" if "normal" in roles else ("albedo" if "albedo" in roles else roles[0])
                dst = job_dir / f"TEXTURE_ENHANCED_{count:02d}_{Path(source_name).stem}.png"
                result = try_ai_texture_enhancement(source_texture, dst, role, int(texture_policy.get("targetMin", 2048)))
                if dst.is_file():
                    files.append(file_meta(dst, "enhanced_texture"))
                    texture_enhancement.append({**result, "sourceRoles": roles})
                    count += 1

        source_stats = manifest.get("sourceStats") or {}
        lod_stats = manifest.get("lodStats") or []
        lod0_stats = lod_stats[0] if lod_stats else {}

        # V4 finalization: atlas candidate + multi-light material gate + calibrated runtime metadata.
        lod_radius = float((manifest.get("renderRig") or {}).get("radius", 1.0) or 1.0)
        lod_cfg = params.get("lodCalibration") or {}
        lod_plan = screen_space_lod_plan(lod_radius, float(lod_cfg.get("verticalFovDegrees", 70.0)), int(lod_cfg.get("desktopHeight", 1080)), int(lod_cfg.get("mobileHeight", 720)))
        lod_plan_path = job_dir / "screen-space-lod-plan.json"
        lod_plan_path.write_text(json.dumps(lod_plan, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(lod_plan_path, "screen_space_lod_plan"))

        occlusion = build_occlusion_cells(source_stats.get("objectBounds"), lod_radius)
        occlusion_path = job_dir / "occlusion-cells.json"
        occlusion_path.write_text(json.dumps(occlusion, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(occlusion_path, "occlusion_cells"))

        portal_graph = build_portal_room_graph(
            source_stats.get("objectBounds"),
            float((params.get("portalOcclusion") or {}).get("cellSize", 8.0)),
        ) if (params.get("portalOcclusion") or {}).get("enabled", True) else {"status": "DISABLED", "rooms": [], "portals": []}
        portal_path = job_dir / "portal-occlusion-graph.json"
        portal_path.write_text(json.dumps(portal_graph, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(portal_path, "portal_occlusion_graph"))

        semantic_model = optional_semantic_model_status() if (params.get("semanticML") or {}).get("enabledWhenProvisioned", True) else {"available": False, "backend": "disabled"}
        semantic_path = job_dir / "semantic-backend-v5.json"
        semantic_path.write_text(json.dumps(semantic_model, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(semantic_path, "semantic_backend"))

        hardware_policy = hardware_tier_policy((params.get("hardwareAdaptive") or {}).get("profile") or {})
        hardware_path = job_dir / "hardware-quality-policy.json"
        hardware_path.write_text(json.dumps(hardware_policy, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(hardware_path, "hardware_quality_policy"))

        texel_plan = texel_density_plan(source_stats.get("objectBounds"))
        texel_path = job_dir / "texel-density-plan-v5.json"
        texel_path.write_text(json.dumps(texel_plan, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(texel_path, "texel_density_plan"))

        registry_bucket = {
            "extension": upload["extension"],
            "triangles": source_stats.get("triangles", 0),
            "hasArmature": source_stats.get("armatures", 0) > 0,
            "hasShapeKeys": source_stats.get("shapeKeyMeshes", 0) > 0,
            "materials": source_stats.get("materials", 0),
        }
        registry = QualityRegistryV5(job_dir.parents[1] / "quality-registry-v5.sqlite3")
        registry_suggestion = registry.suggest(registry_bucket, hardware_policy.get("tier", "high"))
        registry_suggestion_path = job_dir / "quality-registry-suggestion-v5.json"
        registry_suggestion_path.write_text(json.dumps(registry_suggestion, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(registry_suggestion_path, "quality_registry_suggestion"))

        transition_gate = {"passed": True, "status": "DISABLED"}
        if (params.get("transitionQA") or {}).get("enabled", True):
            transition_gate = lod_transition_gate(
                accepted_dir / "renders_lod0_base",
                accepted_dir / "renders_lod1",
                compare_render_pair,
                params.get("transitionQA") or {},
            )

        temporal_gate = {"passed": True, "status": "DISABLED"}
        if (params.get("temporalQA") or {}).get("enabled", True):
            temporal_gate = temporal_anti_shimmer_gate(
                accepted_dir / "renders_temporal_hq",
                accepted_dir / "renders_temporal_lod0_base",
                params.get("temporalQA") or {},
            )
        temporal_path = job_dir / "temporal-anti-shimmer-v6.json"
        temporal_path.write_text(json.dumps(temporal_gate, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(temporal_path, "temporal_anti_shimmer_v6"))

        pvs = bake_pvs(portal_graph, int((params.get("pvs") or {}).get("hopDepth", 2))) if (params.get("pvs") or {}).get("enabled", True) else {"status": "DISABLED", "sets": {}}
        pvs_path = job_dir / "baked-pvs-v6.json"
        pvs_path.write_text(json.dumps(pvs, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(pvs_path, "baked_pvs_v6"))

        semantic_inference = run_optional_semantic_inference(accepted_dir / "renders_hq" / "front.png")
        semantic_inference_path = job_dir / "semantic-inference-v6.json"
        semantic_inference_path.write_text(json.dumps(semantic_inference, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(semantic_inference_path, "semantic_inference_v6"))

        gpu_telemetry = collect_gpu_telemetry()
        gpu_path = job_dir / "gpu-telemetry-v6.json"
        gpu_path.write_text(json.dumps(gpu_telemetry, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(gpu_path, "gpu_telemetry_v6"))
        gpu_telemetry_v7 = collect_gpu_telemetry_v7()
        gpu_v7_path = job_dir / "gpu-telemetry-v7.json"
        gpu_v7_path.write_text(json.dumps(gpu_telemetry_v7, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(gpu_v7_path, "gpu_telemetry_v7"))
        runtime_visibility_samples = list((job.get("params") or {}).get("runtimeVisibilitySamplesV7") or [])
        pvs_refined_v7 = refine_pvs_from_runtime(pvs, runtime_visibility_samples, int((params.get("pvsLearningV7") or {}).get("minSamples", 3))) if (params.get("pvsLearningV7") or {}).get("enabled", True) else {"schemaVersion": 7, "status": "DISABLED", "sets": pvs.get("sets", {})}
        pvs_v7_path = job_dir / "pvs-refined-v7.json"
        pvs_v7_path.write_text(json.dumps(pvs_refined_v7, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(pvs_v7_path, "pvs_refined_v7"))

        runtime_visibility_samples_v8 = list((job.get("params") or {}).get("runtimeVisibilitySamplesV8") or runtime_visibility_samples)
        pvs_refined_v8 = refine_pvs_confidence_v8(pvs, runtime_visibility_samples_v8, params.get("pvsLearningV8") or {}) if (params.get("pvsLearningV8") or {}).get("enabled", True) else {"schemaVersion": 8, "status": "DISABLED", "sets": pvs.get("sets", {})}
        pvs_v8_path = job_dir / "pvs-refined-v8.json"
        pvs_v8_path.write_text(json.dumps(pvs_refined_v8, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(pvs_v8_path, "pvs_refined_v8"))

        gpu_telemetry_v8 = collect_gpu_telemetry_v8()
        gpu_v8_path = job_dir / "gpu-telemetry-v8.json"
        gpu_v8_path.write_text(json.dumps(gpu_telemetry_v8, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(gpu_v8_path, "gpu_telemetry_v8"))

        runtime_rows_v8 = list((job.get("params") or {}).get("runtimeBenchmarkRowsV8") or [])
        triangle_count_v8 = int(source_stats.get("triangles", 0) or 0)
        asset_class_v8 = str((job.get("params") or {}).get("assetClassV8") or ("rigged" if source_stats.get("armatures", 0) else "static") + ("_large" if triangle_count_v8 >= 500000 else "_medium" if triangle_count_v8 >= 100000 else "_small"))
        if runtime_rows_v8:
            device_history_v8.record(runtime_rows_v8, asset_class_v8)
        device_rows_v8 = device_history_v8.rows()
        device_groups_v8 = device_history_v8.groups()
        device_matrix_v8 = device_matrix_coverage(device_rows_v8, params.get("deviceMatrixV8") or {})
        device_matrix_path_v8 = job_dir / "device-matrix-v8.json"
        device_matrix_path_v8.write_text(json.dumps(device_matrix_v8, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(device_matrix_path_v8, "device_matrix_v8"))

        runtime_rows_v9 = list((job.get("params") or {}).get("runtimeBenchmarkRowsV9") or runtime_rows_v8)
        if runtime_rows_v9:
            device_history_v9.record(runtime_rows_v9, asset_class_v8)
        device_rows_v9 = device_history_v9.rows()
        fleet_v9 = fleet_evidence_gate_v9(device_rows_v9, params.get("fleetEvidenceV9") or {})
        fleet_v9_path = job_dir / "fleet-evidence-v9.json"
        fleet_v9_path.write_text(json.dumps(fleet_v9, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(fleet_v9_path, "fleet_evidence_v9"))

        longitudinal_v9 = longitudinal_fleet_gate_v9(device_rows_v9, params.get("fleetHistoryV9") or params.get("fleetEvidenceV9") or {})
        longitudinal_v9_path = job_dir / "fleet-longitudinal-v9.json"
        longitudinal_v9_path.write_text(json.dumps(longitudinal_v9, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(longitudinal_v9_path, "fleet_longitudinal_v9"))

        shader_memory_v9 = shader_memory_telemetry_gate_v9(runtime_rows_v9, params.get("shaderTelemetryV9") or {})
        shader_memory_v9_path = job_dir / "shader-memory-telemetry-v9.json"
        shader_memory_v9_path.write_text(json.dumps(shader_memory_v9, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(shader_memory_v9_path, "shader_memory_telemetry_v9"))

        device_farm_result_rows_v9 = list((job.get("params") or {}).get("deviceFarmResultRowsV9") or [])
        device_farm_result_v9 = validate_device_farm_result_v9(device_farm_result_rows_v9, params.get("deviceFarmV9") or {})
        device_farm_result_v9_path = job_dir / "device-farm-result-gate-v9.json"
        device_farm_result_v9_path.write_text(json.dumps(device_farm_result_v9, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(device_farm_result_v9_path, "device_farm_result_gate_v9"))

        advanced_gpu_v9 = validate_advanced_gpu_counters_v9(runtime_rows_v9, params.get("advancedGpuCountersV9") or {})
        advanced_gpu_v9["discovery"] = discover_gpu_counter_tools_v9()
        advanced_gpu_v9_path = job_dir / "advanced-gpu-counters-v9.json"
        advanced_gpu_v9_path.write_text(json.dumps(advanced_gpu_v9, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(advanced_gpu_v9_path, "advanced_gpu_counters_v9"))

        device_farm_v9 = device_farm_plan_v9(str((params.get("deviceFarmV9") or {}).get("sceneUrl") or ""), params.get("deviceFarmV9") or {})
        device_farm_v9_path = job_dir / "device-farm-plan-v9.json"
        device_farm_v9_path.write_text(json.dumps(device_farm_v9, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(device_farm_v9_path, "device_farm_plan_v9"))

        pvs_removal_v9 = pvs_removal_candidates_v9(pvs_refined_v8, runtime_visibility_samples_v8, params.get("pvsRemovalProofV9") or {}) if (params.get("pvsRemovalProofV9") or {}).get("enabled", True) else {"schemaVersion": 9, "status": "DISABLED", "candidates": [], "autoRemovalsApplied": 0}
        pvs_removal_v9_path = job_dir / "pvs-removal-proof-candidates-v9.json"
        pvs_removal_v9_path.write_text(json.dumps(pvs_removal_v9, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(pvs_removal_v9_path, "pvs_removal_candidates_v9"))

        runtime_rows_v10 = list((job.get("params") or {}).get("runtimeBenchmarkRowsV10") or runtime_rows_v9)
        runtime_rows_v12 = list((job.get("params") or {}).get("runtimeBenchmarkRowsV12") or runtime_rows_v10)
        shader_stutter_v12 = shader_stutter_gate_v12(runtime_rows_v12, params.get("shaderStutterV12") or {})
        shader_stutter_v12_path = job_dir / "shader-stutter-v12.json"
        shader_stutter_v12_path.write_text(json.dumps(shader_stutter_v12, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(shader_stutter_v12_path, "shader_stutter_v12"))
        pressure_rows_v12 = list((job.get("params") or {}).get("pressureSamplesV12") or runtime_rows_v12)
        pressure_v12 = thermal_memory_pressure_gate_v12(pressure_rows_v12, params.get("pressureV12") or {})
        pressure_v12_path = job_dir / "thermal-memory-pressure-v12.json"
        pressure_v12_path.write_text(json.dumps(pressure_v12, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(pressure_v12_path, "thermal_memory_pressure_v12"))
        compatibility_rows_v12 = list((job.get("params") or {}).get("compatibilityMatrixRowsV12") or [])
        compatibility_v12 = compatibility_matrix_gate_v12(compatibility_rows_v12, params.get("compatibilityV12") or {}) if compatibility_rows_v12 else {"schemaVersion": 12, "status": "UNVERIFIED_COMPATIBILITY", "passed": False, "rows": []}
        compatibility_v12_path = job_dir / "compatibility-matrix-v12.json"
        compatibility_v12_path.write_text(json.dumps(compatibility_v12, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(compatibility_v12_path, "compatibility_matrix_v12"))
        profiler_v10 = normalize_profiler_evidence_v10(runtime_rows_v10, params.get("profilerEvidenceV10") or {})
        profiler_v10_path = job_dir / "profiler-normalized-v10.json"
        profiler_v10_path.write_text(json.dumps(profiler_v10, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(profiler_v10_path, "profiler_normalized_v10"))

        device_farm_rows_v10 = list((job.get("params") or {}).get("deviceFarmResultRowsV10") or device_farm_result_rows_v9)
        device_farm_v10 = device_farm_integrity_gate_v10(device_farm_rows_v10, params.get("deviceFarmIntegrityV10") or {})
        device_farm_v10_path = job_dir / "device-farm-integrity-v10.json"
        device_farm_v10_path.write_text(json.dumps(device_farm_v10, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(device_farm_v10_path, "device_farm_integrity_v10"))

        fleet_drift_v10 = fleet_drift_gate_v10(device_rows_v9, params.get("fleetDriftV10") or {})
        fleet_drift_v10_path = job_dir / "fleet-drift-v10.json"
        fleet_drift_v10_path.write_text(json.dumps(fleet_drift_v10, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(fleet_drift_v10_path, "fleet_drift_v10"))

        pvs_proof_v10 = pvs_pruning_proof_v10(
            pvs_refined_v8, runtime_visibility_samples_v8, list(pvs_removal_v9.get("candidates") or []), params.get("pvsPruningProofV10") or {}
        )
        pvs_proof_v10_path = job_dir / "pvs-pruning-proof-v10.json"
        pvs_proof_v10_path.write_text(json.dumps(pvs_proof_v10, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(pvs_proof_v10_path, "pvs_pruning_proof_v10"))

        pvs_canary_plan_v10 = build_pvs_canary_plan_v10(pvs_refined_v8, pvs_proof_v10)
        pvs_canary_input_v10 = dict((job.get("params") or {}).get("pvsCanaryResultV10") or {})
        pvs_canary_result_v10 = validate_pvs_canary_result_v10(pvs_canary_input_v10, pvs_canary_plan_v10) if pvs_canary_input_v10 else {"schemaVersion": 10, "status": "UNVERIFIED", "passed": False, "rollbackRequired": False, "planSha256": pvs_canary_plan_v10.get("planSha256")}
        for name, payload, kind in (("pvs-canary-plan-v10.json", pvs_canary_plan_v10, "pvs_canary_plan_v10"), ("pvs-canary-result-v10.json", pvs_canary_result_v10, "pvs_canary_result_v10")):
            path = job_dir / name
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            files.append(file_meta(path, kind))

        finalize_v4_report = {"status": "DISABLED"}
        atlas_gate = {"passed": True, "status": "NOT_APPLIED"}
        final_primary = job_dir / "LOD0.glb"
        atlas_candidate = None
        v4_dir = job_dir / "finalize-v5"
        if (params.get("atlas") or {}).get("enabled", True) and final_primary.is_file():
            finalize_v4_report = run_blender_finalizer_v5(self.blender, self.finalizer_script, final_primary, v4_dir, params)
            candidate = v4_dir / "LOD0_ATLAS_V5.glb"
            if finalize_v4_report.get("status") != "FAILED" and candidate.is_file():
                atlas_candidate = candidate
                atlas_gate = compare_multi_light_sets(
                    v4_dir / "renders_material_base",
                    v4_dir / "renders_material_atlas",
                    compare_render_pair,
                    params.get("materialQA") or {},
                )
            manifest_v4 = v4_dir / "finalize-v5-manifest.json"
            if manifest_v4.is_file():
                files.append(file_meta(self._copy_artifact(manifest_v4, job_dir / manifest_v4.name), "finalize_v5_manifest"))

        atlas_manifest = json.loads(json.dumps(finalize_v4_report.get("atlas") or {})) if isinstance(finalize_v4_report, dict) else {}
        # Flatten family-atlas textures into job root so authenticated file endpoints can serve them.
        for family in atlas_manifest.get("families") or []:
            textures = family.get("textures") or {}
            for channel, relative_name in list(textures.items()):
                source = v4_dir / str(relative_name)
                if not source.is_file():
                    continue
                safe_family = str(family.get("family") or "generic").upper()
                public_name = f"ATLAS_{safe_family}_{str(channel).upper()}.png"
                dst = self._copy_artifact(source, job_dir / public_name)
                files.append(file_meta(dst, "atlas_texture_v5"))
                textures[channel] = public_name

        pbr_family_gate = pbr_family_audit(
            atlas_manifest or {},
            float((params.get("atlasV5") or {}).get("maxUvStretchRatio", 35.0)),
        )
        if atlas_candidate is not None and atlas_gate.get("passed") and pbr_family_gate.get("passed", True):
            final_primary = self._copy_artifact(atlas_candidate, job_dir / "LOD0_FINAL.glb")
            files.append(file_meta(final_primary, "lod0_final_atlas_v5"))
        elif atlas_candidate is not None and atlas_gate.get("passed") and not pbr_family_gate.get("passed", True):
            atlas_gate = {**atlas_gate, "passed": False, "status": "FAILED_PBR_FAMILY_AUDIT", "pbrFamilyAudit": pbr_family_gate}

        for artifact in write_engine_binding_pack(job_dir, detail_outputs, atlas_manifest or {}, lod_plan, occlusion):
            files.append(file_meta(artifact, "engine_binding"))
        for artifact in write_v5_engine_pack(job_dir, atlas_manifest or {}, portal_graph, hardware_policy, semantic_model):
            files.append(file_meta(artifact, "engine_binding_v5"))
        for artifact in write_benchmark_collector(job_dir):
            files.append(file_meta(artifact, "runtime_benchmark_collector"))
        if (params.get("runtimeBenchmarks") or {}).get("emitHarness", True):
            for artifact in write_runtime_benchmark_v5_pack(job_dir, lod_plan):
                files.append(file_meta(artifact, "runtime_benchmark_harness_v5"))

        for artifact in write_v6_runtime_pack(job_dir, pvs, params.get("productionReadiness") or {}):
            files.append(file_meta(artifact, "runtime_production_pack_v6"))

        target_selection = {"godot": final_primary.name, "web": final_primary.name, "roblox": final_primary.name}
        target_outputs = {}
        compression_report = {"web": {"requested": params.get("webCompression"), "used": "none"}}
        for target in params["targets"]:
            selected = job_dir / target_selection[target]
            if target == "web" and final_primary.name == "LOD0.glb" and str(params.get("webCompression", "draco")).lower() == "draco":
                candidate_name = "LOD0_AAA_WEB_DRACO.glb" if chosen_lod0 == "LOD0_AAA.glb" else "LOD0_BASE_WEB_DRACO.glb"
                candidate = accepted_dir / candidate_name
                if candidate.is_file() and "KHR_draco_mesh_compression" in glb_extensions(candidate):
                    selected = candidate
                    compression_report["web"] = {"requested": "draco", "used": "KHR_draco_mesh_compression", "verified": True}
                else:
                    compression_report["web"] = {"requested": "draco", "used": "none", "verified": False, "reason": "Blender exporter did not emit KHR_draco_mesh_compression"}
            modern_web_report = None
            if target == "web" and selected.is_file() and (params.get("modernCompression") or {}).get("enabled", True):
                modern_web_report = try_modern_web_compression(selected, job_dir / "web-modern")
                verified_path = Path(modern_web_report.get("selectedPath", str(selected)))
                if verified_path.is_file() and modern_web_report.get("status") != "NO_VERIFIED_MODERN_COMPRESSION":
                    selected = verified_path
                    compression_report["webModern"] = modern_web_report
            if selected.is_file():
                target_name = f"{target.upper()}_OPTIMIZED.glb"
                dst = self._copy_artifact(selected, job_dir / target_name)
                files.append(file_meta(dst, f"{target}_optimized"))
                target_outputs[target] = target_name

        roblox_assets_v7 = []
        roblox_model = job_dir / "ROBLOX_OPTIMIZED.glb"
        if roblox_model.is_file():
            roblox_assets_v7.append({"key": "model", "path": str(roblox_model), "assetType": "Model", "displayName": roblox_model.stem, "contentType": "model/gltf-binary"})
        for texture in sorted(job_dir.glob("ATLAS_*.png")):
            if texture.is_file() and texture.stat().st_size <= 20 * 1024 * 1024:
                roblox_assets_v7.append({"key": texture.stem.lower(), "path": str(texture), "assetType": "Image", "displayName": texture.stem, "contentType": "image/png"})
        roblox_plan_v7 = {"schemaVersion": 7, "status": "READY_IF_AUTHORIZED" if roblox_assets_v7 else "NO_ASSETS_DISCOVERED", "assets": roblox_assets_v7}
        for artifact in write_v7_runtime_pack(job_dir, pvs_refined_v7, roblox_plan_v7):
            files.append(file_meta(artifact, "runtime_production_pack_v7"))

        roblox_place_input_v8 = dict((job.get("params") or {}).get("robloxPlaceVerificationResultV8") or {})
        roblox_place_v8 = validate_roblox_place_runtime(roblox_place_input_v8, params.get("robloxPlaceVerificationV8") or {}) if roblox_place_input_v8 else {"schemaVersion": 8, "status": "UNVERIFIED", "passed": False, "reason": "No Roblox Studio/place-side verification evidence supplied"}
        roblox_place_path_v8 = job_dir / "roblox-place-verification-v8.json"
        roblox_place_path_v8.write_text(json.dumps(roblox_place_v8, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(roblox_place_path_v8, "roblox_place_verification_v8"))
        for artifact in write_v8_runtime_pack(job_dir, pvs_refined_v8, roblox_plan_v7):
            files.append(file_meta(artifact, "runtime_production_pack_v8"))

        roblox_automation_input_v9 = dict((job.get("params") or {}).get("robloxStudioAutomationResultV9") or {})
        if roblox_automation_input_v9 and "upload" not in roblox_automation_input_v9 and roblox_place_input_v8:
            roblox_automation_input_v9["upload"] = roblox_place_input_v8.get("upload") or roblox_place_input_v8
        roblox_automation_v9 = validate_roblox_studio_automation_v9(roblox_automation_input_v9, params.get("robloxAutomationV9") or {}) if roblox_automation_input_v9 else {"schemaVersion": 9, "status": "UNVERIFIED", "passed": False, "reason": "No automated Roblox Studio runner evidence supplied"}
        roblox_automation_v9_path = job_dir / "roblox-studio-automation-v9.json"
        roblox_automation_v9_path.write_text(json.dumps(roblox_automation_v9, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(roblox_automation_v9_path, "roblox_studio_automation_v9"))
        for artifact in write_v9_runtime_pack(job_dir, list(params.get("targets") or []), pvs_refined_v8, roblox_plan_v7, params):
            files.append(file_meta(artifact, "runtime_production_pack_v9"))

        roblox_contract_assets_v10 = [{"kind": a.get("assetType"), "path": a.get("path"), "assetId": a.get("assetId")} for a in roblox_assets_v7]
        roblox_contract_v10 = build_roblox_verification_contract_v10(job_dir, roblox_contract_assets_v10, params.get("robloxVerificationV10") or {})
        roblox_result_input_v10 = dict((job.get("params") or {}).get("robloxStudioVerificationResultV10") or {})
        roblox_result_v10 = validate_roblox_verification_result_v10(roblox_result_input_v10, roblox_contract_v10, params.get("robloxVerificationV10") or {}) if roblox_result_input_v10 else {"schemaVersion": 10, "status": "UNVERIFIED", "passed": False, "failedChecks": ["noResultEvidence"], "contractSha256": roblox_contract_v10.get("contractSha256")}
        roblox_result_v10_path = job_dir / "roblox-verification-result-v10.json"
        roblox_result_v10_path.write_text(json.dumps(roblox_result_v10, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(roblox_result_v10_path, "roblox_verification_v10"))
        for artifact in write_v10_evidence_pack(job_dir, semantic_model_contract_v10, profiler_v10, roblox_contract_v10):
            files.append(file_meta(artifact, "evidence_pack_v10"))
        for artifact in write_v12_runtime_pack(job_dir, params.get("runtimeEvidenceV12") or {}):
            files.append(file_meta(artifact, "runtime_production_pack_v12"))

        calibration_after_v8 = calibrate_policy_from_device_history(params, device_groups_v8, params.get("deviceCalibrationV8") or {})
        calibration_after_path_v8 = job_dir / "device-calibration-next-v8.json"
        calibration_after_path_v8.write_text(json.dumps(calibration_after_v8, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(calibration_after_path_v8, "device_calibration_next_v8"))
        calibration_after_v9 = robust_device_calibration_v9(params, device_rows_v9, params.get("deviceCalibrationV9") or {})
        calibration_after_path_v9 = job_dir / "device-calibration-next-v9.json"
        calibration_after_path_v9.write_text(json.dumps(calibration_after_v9, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(calibration_after_path_v9, "device_calibration_next_v9"))

        performance_gate = {"passed": True, "status": "DISABLED"}
        if params.get("performanceGate", {}).get("enabled", True):
            performance_gate = static_performance_gate(manifest, params.get("performanceGate") or {})
        metrics = {
            "accepted": True,
            "sourceTriangles": source_stats.get("triangles", 0),
            "lod0Triangles": lod0_stats.get("triangles", 0),
            "triangleReductionPercent": _safe_reduction(source_stats.get("triangles", 0), lod0_stats.get("triangles", 0)),
            "sourceVertices": source_stats.get("vertices", 0),
            "lod0Vertices": lod0_stats.get("vertices", 0),
            "vertexReductionPercent": _safe_reduction(source_stats.get("vertices", 0), lod0_stats.get("vertices", 0)),
            "sourceMaterials": source_stats.get("materials", 0),
            "lod0Materials": lod0_stats.get("materials", 0),
            "visualSimilarity": accepted["quality"]["avgVisualSimilarity"],
            "silhouetteIoU": accepted["quality"]["minSilhouetteIoU"],
            "aaaEnhancementAccepted": bool(aaa_gate.get("passed")),
            "aaaEnhancementDetailEnergyRatio": aaa_gate.get("avgDetailEnergyRatio"),
            "aaaEnhancementSilhouetteIoU": aaa_gate.get("minSilhouetteIoU"),
            "animationQA": accepted.get("animationQuality"),
            "performanceGatePassed": performance_gate.get("passed"),
            "exactInstancesLinked": (manifest.get("sourceInstancing") or {}).get("linkedObjects", 0),
            "detailBakeObjects": len(detail_outputs),
            "impostorViews": impostor_result.get("views", 0),
            "enhancedTextures": len(texture_enhancement),
            "textureEnhancementBackends": sorted(set(x.get("backend", "unknown") for x in texture_enhancement)),
            "atlasMaterialQAPassed": atlas_gate.get("passed"),
            "atlasStatus": (atlas_manifest or {}).get("status") if isinstance(atlas_manifest, dict) else None,
            "lodCalibrationMethod": lod_plan.get("method"),
            "occlusionCellCount": occlusion.get("cellCount", 0),
            "portalRoomCount": portal_graph.get("roomCount", 0),
            "portalEdgeCount": portal_graph.get("edgeCount", 0),
            "lodTransitionQAPassed": transition_gate.get("passed"),
            "pbrFamilyAtlasQAPassed": pbr_family_gate.get("passed"),
            "hardwareTier": hardware_policy.get("tier"),
            "semanticBackend": semantic_model.get("backend"),
            "texelDensityObjectsPlanned": len(texel_plan.get("objects") or []),
            "temporalQAPassed": temporal_gate.get("passed"),
            "temporalInstabilityRatio": temporal_gate.get("maxInstabilityRatio"),
            "pvsRoomSets": len(pvs.get("sets") or {}),
            "gpuTelemetryVerified": gpu_telemetry.get("verified", False),
            "semanticInferenceStatusV6": semantic_inference.get("status"),
            "semanticFusionV8VerifiedViews": semantic_fusion_v8.get("verifiedViewCount", 0),
            "semanticFusionV8Status": semantic_fusion_v8.get("status"),
            "gpuTelemetryV8Verified": gpu_telemetry_v8.get("verified", False),
            "gpuTelemetryV8Backend": gpu_telemetry_v8.get("backend"),
            "pvsRefinedV8Status": pvs_refined_v8.get("status"),
            "deviceMatrixV8Status": device_matrix_v8.get("status"),
            "deviceMatrixV8MissingCells": len(device_matrix_v8.get("missing") or []),
            "robloxPlaceVerificationV8Status": roblox_place_v8.get("status"),
            "deviceCalibrationV8Applied": bool(calibration_v8.get("applied")),
        }

        engine_presets = {
            "pipelineVersion": PIPELINE_VERSION,
            "targets": {
                "godot": {
                    "primary": target_outputs.get("godot"),
                    "runtime": ["LOD0.glb", "LOD1.glb", "LOD2.glb", "LOD3.glb", "HLOD.glb", "IMPOSTOR_ATLAS.png"],
                    "detailMaps": detail_outputs,
                    "screenSpaceLodPlan": lod_plan.get("desktop"),
                    "occlusionCells": "occlusion-cells.json",
                    "bindings": "production-bindings-v5.json",
                    "recommendations": ["visibility ranges", "HLOD", "occlusion culling", "MultiMesh for identical static instances"],
                },
                "web": {
                    "primary": target_outputs.get("web"),
                    "runtime": ["LOD0.glb", "LOD1.glb", "LOD2.glb", "LOD3.glb", "HLOD.glb", "IMPOSTOR_ATLAS.png"],
                    "detailMaps": detail_outputs,
                    "compression": compression_report,
                    "screenSpaceLodPlan": lod_plan.get("desktop"),
                    "bindings": "production-bindings-v5.json",
                    "recommendations": ["frustum culling", "distance LOD", "verified mesh compression", "texture mipmaps"],
                },
                "roblox": {
                    "primary": target_outputs.get("roblox"),
                    "runtime": ["LOD0.glb", "LOD1.glb", "LOD2.glb", "LOD3.glb", "HLOD.glb"],
                    "detailMaps": detail_outputs,
                    "screenSpaceLodPlan": lod_plan.get("mobile"),
                    "bindings": "production-bindings-v5.json",
                    "recommendations": ["RenderFidelity Automatic where appropriate", "StreamingEnabled for worlds", "separate simple collision geometry", "bake supported PBR maps into SurfaceAppearance inputs"],
                },
            },
        }
        presets_path = job_dir / "engine-presets.json"
        presets_path.write_text(json.dumps(engine_presets, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(presets_path, "engine_presets"))
        quality_preset_path = write_quality_preset(job_dir / "aaa-quality-presets.json")
        files.append(file_meta(quality_preset_path, "aaa_quality_presets"))
        material_manifest = accepted_dir / "material-enhancement-manifest.json"
        if material_manifest.is_file():
            files.append(file_meta(self._copy_artifact(material_manifest, job_dir / material_manifest.name), "material_enhancement_manifest"))

        quality_memory = {
            "schemaVersion": 5,
            "pipelineVersion": PIPELINE_VERSION,
            "sourceFingerprint": upload["sha256"],
            "inputBucket": registry_bucket,
            "registrySuggestionBeforeRecord": registry_suggestion,
            "acceptedPolicy": {
                "lod0Ratio": accepted["lod0Ratio"],
                "lodRatios": accepted["manifest"].get("policy", {}).get("lodRatios"),
                "textureSizes": params["textureSizes"],
            },
            "outcome": metrics,
            "performanceGate": performance_gate,
            "compression": compression_report,
            "atlasMaterialQA": atlas_gate,
            "lodPlan": lod_plan,
            "occlusion": {"status": occlusion.get("status"), "cellCount": occlusion.get("cellCount", 0)},
            "semanticProtection": [row for lod in lod_stats[:1] for row in (lod.get("semanticProtection") or [])],
            "semanticBackend": semantic_model,
            "portalOcclusion": {"roomCount": portal_graph.get("roomCount", 0), "portalCount": portal_graph.get("portalCount", 0), "edgeCount": portal_graph.get("edgeCount", 0)},
            "hardwarePolicy": hardware_policy,
            "texelDensityPlan": {"status": texel_plan.get("status"), "objectCount": len(texel_plan.get("objects") or [])},
            "lodTransitionQA": transition_gate,
            "pbrFamilyAudit": pbr_family_gate,
            "temporalQA": temporal_gate,
            "bakedPVS": {"status": pvs.get("status"), "roomSets": len(pvs.get("sets") or {})},
            "gpuTelemetry": gpu_telemetry,
            "semanticInferenceV6": semantic_inference,
            "semanticFusionV8": {"status": semantic_fusion_v8.get("status"), "verifiedViewCount": semantic_fusion_v8.get("verifiedViewCount", 0)},
            "deviceCalibrationV8": calibration_v8,
            "deviceMatrixV8": {"status": device_matrix_v8.get("status"), "missing": device_matrix_v8.get("missing", [])},
            "pvsRefinedV8": {"status": pvs_refined_v8.get("status"), "additions": pvs_refined_v8.get("additions", [])},
            "gpuTelemetryV8": gpu_telemetry_v8,
            "robloxPlaceVerificationV8": roblox_place_v8,
            "reuseRule": "May seed future optimization only for a matching input bucket and hardware tier; V8 calibration never relaxes visual/semantic/temporal gates and runtime evidence remains mandatory.",
        }
        memory_path = job_dir / "quality-memory.json"
        memory_path.write_text(json.dumps(quality_memory, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(memory_path, "quality_memory"))
        registry.record(
            registry_bucket,
            hardware_policy.get("tier", "high"),
            upload["sha256"],
            quality_memory.get("acceptedPolicy") or {},
            metrics,
            {
                "fidelity": quality_gate.get("passed"),
                "aaa": aaa_gate.get("passed"),
                "animation": (accepted.get("animationQuality") or {}).get("passed", True),
                "performance": performance_gate.get("passed", True),
                "atlas": atlas_gate.get("passed", True),
                "pbrFamily": pbr_family_gate.get("passed", True),
                "lodTransition": transition_gate.get("passed", True),
                "temporal": temporal_gate.get("passed", True),
            },
        )

        static_gates_v6 = {
            "fidelity": quality_gate.get("passed", False),
            "aaa": aaa_gate.get("passed", True),
            "animation": (accepted.get("animationQuality") or {}).get("passed", True),
            "atlas": atlas_gate.get("passed", True),
            "pbrFamily": pbr_family_gate.get("passed", True),
            "performance": performance_gate.get("passed", True),
            "lodTransition": transition_gate.get("passed", True),
            "temporal": temporal_gate.get("passed", True),
        }
        runtime_policy_v8 = {"requiredTargets": list(params.get("targets") or []), "requireGpuTelemetry": False}
        runtime_gate_v8 = aggregate_runtime_benchmarks_v6(runtime_rows_v8, runtime_policy_v8)
        runtime_gate_v8["schemaVersion"] = 8
        runtime_gate_path_v8 = job_dir / "runtime-benchmark-gate-v8.json"
        runtime_gate_path_v8.write_text(json.dumps(runtime_gate_v8, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(runtime_gate_path_v8, "runtime_benchmark_gate_v8"))

        production_readiness = production_readiness_gate(
            static_gates_v6,
            runtime=runtime_gate_v8,
            required_runtime=bool((params.get("productionReadiness") or {}).get("requireRuntimeEvidence", True)),
        )
        readiness_path = job_dir / "production-readiness-v6.json"
        readiness_path.write_text(json.dumps(production_readiness, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(readiness_path, "production_readiness_v6"))

        configured_gpu_targets = list((params.get("nativeGpuTimingV7") or {}).get("requiredTargets") or [])
        gpu_required_targets = [t for t in configured_gpu_targets if t in (params.get("targets") or [])]
        native_gpu_timing_v7 = engine_native_gpu_timing_gate(runtime_rows_v8, {"requiredTargets": gpu_required_targets})
        production_readiness_v7 = production_readiness_gate_v7(
            static_gates_v6,
            runtime_gate_v8,
            native_gpu_timing_v7,
            require_runtime=bool((params.get("productionReadiness") or {}).get("requireRuntimeEvidence", True)),
            require_gpu_timing=bool((params.get("nativeGpuTimingV7") or {}).get("required", True)) and bool(gpu_required_targets),
        )
        readiness_v7_path = job_dir / "production-readiness-v7.json"
        readiness_v7_path.write_text(json.dumps(production_readiness_v7, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(readiness_v7_path, "production_readiness_v7"))

        production_readiness_v8 = production_readiness_gate_v8(
            static_gates_v6, runtime_gate_v8, native_gpu_timing_v7, device_matrix_v8, roblox_place_v8,
            params.get("productionReadinessV8") or {},
        )
        readiness_v8_path = job_dir / "production-readiness-v8.json"
        readiness_v8_path.write_text(json.dumps(production_readiness_v8, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(readiness_v8_path, "production_readiness_v8"))

        runtime_gate_v9 = aggregate_runtime_benchmarks_v6(runtime_rows_v9, {"requiredTargets": list(params.get("targets") or []), "requireGpuTelemetry": False})
        runtime_gate_v9["schemaVersion"] = 9
        runtime_gate_v9_path = job_dir / "runtime-benchmark-gate-v9.json"
        runtime_gate_v9_path.write_text(json.dumps(runtime_gate_v9, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(runtime_gate_v9_path, "runtime_benchmark_gate_v9"))
        native_gpu_timing_v9 = engine_native_gpu_timing_gate(runtime_rows_v9, {"requiredTargets": gpu_required_targets})
        native_gpu_timing_v9["schemaVersion"] = 9
        production_readiness_v9 = production_readiness_gate_v9(
            static_gates_v6, runtime_gate_v9, native_gpu_timing_v9, device_matrix_v8, longitudinal_v9,
            shader_memory_v9, semantic_mesh_result_v9, roblox_automation_v9, device_farm_result_v9,
            params.get("productionReadinessV9") or {},
        )
        if bool((params.get("productionReadinessV9") or {}).get("requireAdvancedGpuCounters", False)) and not advanced_gpu_v9.get("passed"):
            production_readiness_v9 = {
                **production_readiness_v9,
                "status": "CANDIDATE_ADVANCED_GPU_COUNTERS_UNVERIFIED",
                "passed": False,
                "fleetVerified": False,
                "advancedGpuCountersRequired": True,
            }
        readiness_v9_path = job_dir / "production-readiness-v9.json"
        readiness_v9_path.write_text(json.dumps(production_readiness_v9, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(readiness_v9_path, "production_readiness_v9"))
        evidence_v10 = evidence_completeness_gate_v10(
            static_gates_v6, semantic_model_contract_v10, runtime_gate_v9, profiler_v10, device_farm_v10,
            longitudinal_v9, fleet_drift_v10, roblox_result_v10, pvs_proof_v10, params.get("evidenceCompletenessV10") or {}
        )
        readiness_v10_path = job_dir / "production-evidence-v10.json"
        readiness_v10_path.write_text(json.dumps(evidence_v10, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(readiness_v10_path, "production_evidence_v10"))
        quality_confidence_v11_report = quality_confidence_v11({
            "static": bool(static_gates_v6.get("passed", static_gates_v6.get("status") in {"PASS", "PASSED"})),
            "zeroErrors": 1.0 if bool(quality_gate.get("passed")) and bool(performance_gate.get("passed")) else 0.0,
            "regression": 1.0 if bool(quality_gate.get("passed")) and bool(accepted.get("animationQuality", {}).get("passed", True)) else 0.0,
            "semantic": semantic_model_contract_v10,
            "runtime": runtime_gate_v9,
            "deviceFleet": longitudinal_v9,
            "profiler": profiler_v10,
            "roblox": roblox_result_v10,
            "pvsCanary": pvs_canary_result_v10,
        })
        quality_confidence_v11_path = job_dir / "quality-confidence-v11.json"
        quality_confidence_v11_path.write_text(json.dumps(quality_confidence_v11_report, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(quality_confidence_v11_path, "quality_confidence_v11"))
        hard_runtime_warning = not bool(evidence_v10.get("passed"))
        final_status = "ACCEPTED" if not hard_runtime_warning else "ACCEPTED_WITH_RUNTIME_WARNING"
        report = {
            "pipelineVersion": PIPELINE_VERSION,
            "status": final_status,
            "source": upload,
            "policy": params,
            "qualityGate": quality_gate,
            "aaaEnhancementGate": aaa_gate,
            "animationGate": accepted.get("animationQuality"),
            "performanceGate": performance_gate,
            "compression": compression_report,
            "atlasMaterialQA": atlas_gate,
            "pbrFamilyAudit": pbr_family_gate,
            "lodTransitionQA": transition_gate,
            "temporalAntiShimmerQA": temporal_gate,
            "bakedPVS": pvs,
            "gpuTelemetryV6": gpu_telemetry,
            "semanticInferenceV6": semantic_inference,
            "productionReadinessV6": production_readiness,
            "productionReadinessV7": production_readiness_v7,
            "productionReadinessV8": production_readiness_v8,
            "productionReadinessV9": production_readiness_v9,
            "productionEvidenceV10": evidence_v10,
            "qualityConfidenceV11": quality_confidence_v11_report,
            "shaderStutterV12": shader_stutter_v12,
            "thermalMemoryPressureV12": pressure_v12,
            "compatibilityMatrixV12": compatibility_v12,
            "semanticModelContractV10": semantic_model_contract_v10,
            "profilerEvidenceV10": profiler_v10,
            "deviceFarmIntegrityV10": device_farm_v10,
            "fleetDriftV10": fleet_drift_v10,
            "pvsPruningProofV10": pvs_proof_v10,
            "pvsCanaryV10": {"plan": pvs_canary_plan_v10, "result": pvs_canary_result_v10},
            "robloxVerificationV10": roblox_result_v10,
            "runtimeBenchmarkGateV8": runtime_gate_v8,
            "runtimeBenchmarkGateV9": runtime_gate_v9,
            "fleetEvidenceV9": fleet_v9,
            "fleetLongitudinalV9": longitudinal_v9,
            "shaderMemoryTelemetryV9": shader_memory_v9,
            "deviceFarmResultV9": device_farm_result_v9,
            "advancedGpuCountersV9": advanced_gpu_v9,
            "deviceFarmV9": device_farm_v9,
            "pvsRemovalProofV9": pvs_removal_v9,
            "robloxStudioAutomationV9": roblox_automation_v9,
            "semanticMeshV9": {"policy": semantic_mesh_v9_policy, "features": semantic_mesh_features_v9, "inference": semantic_mesh_result_v9, "evidence": semantic_evidence_v9, "lod0": (lod_stats[0].get("semanticMeshV9") if lod_stats else None)},
            "deviceCalibrationV9": calibration_v9,
            "deviceCalibrationNextV9": calibration_after_v9,
            "deviceMatrixV8": device_matrix_v8,
            "nativeGpuTimingV7": native_gpu_timing_v7,
            "gpuTelemetryV7": gpu_telemetry_v7,
            "gpuTelemetryV8": gpu_telemetry_v8,
            "pvsRefinedV7": pvs_refined_v7,
            "pvsRefinedV8": pvs_refined_v8,
            "semanticProjectionV7": {"inference": semantic_mask_result, "projection": semantic_projection},
            "semanticFusionV8": semantic_fusion_v8,
            "deviceCalibrationV8": calibration_v8,
            "deviceCalibrationNextV8": calibration_after_v8,
            "robloxPlaceVerificationV8": roblox_place_v8,
            "portalOcclusion": portal_graph,
            "hardwareQualityPolicy": hardware_policy,
            "texelDensityPlan": texel_plan,
            "qualityRegistrySuggestion": registry_suggestion,
            "semanticBackend": semantic_model,
            "finalizeV5": finalize_v4_report,
            "lodPlan": lod_plan,
            "occlusion": occlusion,
            "impostor": impostor_result,
            "detailMaps": detail_outputs,
            "textureEnhancement": texture_enhancement,
            "metrics": metrics,
            "capabilities": manifest.get("capabilities", {}),
            "attempts": attempt_reports,
            "targetOutputs": target_outputs,
        }
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        files.append(file_meta(report_path, "optimization_report"))

        progress(99, "Mesh optimizer: quality gate passed and engine artifacts published")
        return {
            "files": files,
            "qualityGate": quality_gate,
            "aaaEnhancementGate": aaa_gate,
            "animationGate": accepted.get("animationQuality"),
            "performanceGate": performance_gate,
            "compression": compression_report,
            "atlasMaterialQA": atlas_gate,
            "pbrFamilyAudit": pbr_family_gate,
            "lodTransitionQA": transition_gate,
            "temporalAntiShimmerQA": temporal_gate,
            "bakedPVS": pvs,
            "gpuTelemetryV6": gpu_telemetry,
            "semanticInferenceV6": semantic_inference,
            "productionReadinessV6": production_readiness,
            "productionReadinessV7": production_readiness_v7,
            "productionReadinessV8": production_readiness_v8,
            "productionReadinessV9": production_readiness_v9,
            "productionEvidenceV10": evidence_v10,
            "qualityConfidenceV11": quality_confidence_v11_report,
            "shaderStutterV12": shader_stutter_v12,
            "thermalMemoryPressureV12": pressure_v12,
            "compatibilityMatrixV12": compatibility_v12,
            "semanticModelContractV10": semantic_model_contract_v10,
            "profilerEvidenceV10": profiler_v10,
            "deviceFarmIntegrityV10": device_farm_v10,
            "fleetDriftV10": fleet_drift_v10,
            "pvsPruningProofV10": pvs_proof_v10,
            "pvsCanaryV10": {"plan": pvs_canary_plan_v10, "result": pvs_canary_result_v10},
            "robloxVerificationV10": roblox_result_v10,
            "runtimeBenchmarkGateV8": runtime_gate_v8,
            "runtimeBenchmarkGateV9": runtime_gate_v9,
            "fleetEvidenceV9": fleet_v9,
            "fleetLongitudinalV9": longitudinal_v9,
            "shaderMemoryTelemetryV9": shader_memory_v9,
            "deviceFarmResultV9": device_farm_result_v9,
            "advancedGpuCountersV9": advanced_gpu_v9,
            "deviceFarmV9": device_farm_v9,
            "pvsRemovalProofV9": pvs_removal_v9,
            "robloxStudioAutomationV9": roblox_automation_v9,
            "semanticMeshV9": {"policy": semantic_mesh_v9_policy, "features": semantic_mesh_features_v9, "inference": semantic_mesh_result_v9, "evidence": semantic_evidence_v9, "lod0": (lod_stats[0].get("semanticMeshV9") if lod_stats else None)},
            "deviceCalibrationV9": calibration_v9,
            "deviceCalibrationNextV9": calibration_after_v9,
            "deviceMatrixV8": device_matrix_v8,
            "nativeGpuTimingV7": native_gpu_timing_v7,
            "gpuTelemetryV7": gpu_telemetry_v7,
            "gpuTelemetryV8": gpu_telemetry_v8,
            "pvsRefinedV7": pvs_refined_v7,
            "pvsRefinedV8": pvs_refined_v8,
            "semanticProjectionV7": {"inference": semantic_mask_result, "projection": semantic_projection},
            "semanticFusionV8": semantic_fusion_v8,
            "deviceCalibrationV8": calibration_v8,
            "deviceCalibrationNextV8": calibration_after_v8,
            "robloxPlaceVerificationV8": roblox_place_v8,
            "portalOcclusion": portal_graph,
            "hardwareQualityPolicy": hardware_policy,
            "texelDensityPlan": texel_plan,
            "qualityRegistrySuggestion": registry_suggestion,
            "semanticBackend": semantic_model,
            "finalizeV5": finalize_v4_report,
            "lodPlan": lod_plan,
            "occlusion": occlusion,
            "impostor": impostor_result,
            "detailMaps": detail_outputs,
            "textureEnhancement": texture_enhancement,
            "metrics": metrics,
            "status": "accepted" if not hard_runtime_warning else "accepted_with_runtime_warning",
        }
