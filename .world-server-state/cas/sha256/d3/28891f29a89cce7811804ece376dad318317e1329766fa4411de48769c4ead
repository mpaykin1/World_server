from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(float(value), high))


def _load_rgba(path: Path) -> np.ndarray:
    with Image.open(path).convert("RGBA") as image:
        return np.asarray(image, dtype=np.float32) / 255.0


def temporal_anti_shimmer_gate(hq_dir: Path, optimized_dir: Path, policy: dict | None = None) -> dict:
    p = dict(policy or {})
    max_ratio = _clamp(p.get("maxInstabilityRatio", 1.45), 1.0, 4.0)
    max_delta = _clamp(p.get("maxAbsoluteDelta", 0.035), 0.005, 0.25)
    hq_paths = sorted(Path(hq_dir).glob("frame_*.png"))
    pairs = [(h, Path(optimized_dir) / h.name) for h in hq_paths]
    pairs = [(h, o) for h, o in pairs if o.is_file()]
    if len(pairs) < 3:
        return {"schemaVersion": 6, "passed": False, "status": "UNVERIFIED_NO_TEMPORAL_SEQUENCE", "frames": len(pairs)}

    hq_frames = [_load_rgba(h) for h, _ in pairs]
    opt_frames = [_load_rgba(o) for _, o in pairs]
    if any(a.shape != b.shape for a, b in zip(hq_frames, opt_frames)):
        return {"schemaVersion": 6, "passed": False, "status": "FAILED_FRAME_SIZE_MISMATCH", "frames": len(pairs)}

    rows = []
    for index in range(1, len(pairs)):
        h0, h1 = hq_frames[index - 1], hq_frames[index]
        o0, o1 = opt_frames[index - 1], opt_frames[index]
        mask = ((h0[..., 3] > 0.03) | (h1[..., 3] > 0.03) | (o0[..., 3] > 0.03) | (o1[..., 3] > 0.03))
        if mask.any():
            h_delta = float(np.abs(h1[..., :3] - h0[..., :3])[mask].mean())
            o_delta = float(np.abs(o1[..., :3] - o0[..., :3])[mask].mean())
        else:
            h_delta = o_delta = 0.0
        ratio = 1.0 if h_delta <= 1e-6 else o_delta / h_delta
        excess = max(0.0, o_delta - h_delta)
        rows.append({
            "from": pairs[index - 1][0].stem,
            "to": pairs[index][0].stem,
            "hqDelta": round(h_delta, 6),
            "optimizedDelta": round(o_delta, 6),
            "instabilityRatio": round(ratio, 6),
            "absoluteExcess": round(excess, 6),
        })
    max_seen_ratio = max(float(r["instabilityRatio"]) for r in rows)
    max_seen_excess = max(float(r["absoluteExcess"]) for r in rows)
    passed = max_seen_ratio <= max_ratio and max_seen_excess <= max_delta
    return {
        "schemaVersion": 6,
        "passed": bool(passed),
        "status": "PASSED" if passed else "FAILED_TEMPORAL_INSTABILITY",
        "maxInstabilityRatio": round(max_seen_ratio, 6),
        "maxAbsoluteExcess": round(max_seen_excess, 6),
        "thresholds": {"maxInstabilityRatio": max_ratio, "maxAbsoluteDelta": max_delta},
        "transitions": rows,
        "rule": "Optimized detail may move with the camera, but may not flicker substantially more than the immutable HQ source under the same deterministic motion.",
    }


def bake_pvs(portal_graph: dict | None, hop_depth: int = 2) -> dict:
    graph = dict(portal_graph or {})
    rooms = list(graph.get("rooms") or [])
    edges = list(graph.get("edges") or [])
    if not rooms:
        return {"schemaVersion": 6, "status": "SKIPPED_NO_ROOMS", "sets": {}}
    depth = int(_clamp(hop_depth, 1, 6))
    adjacency = {str(r.get("id")): set() for r in rooms if r.get("id")}
    for edge in edges:
        linked = [str(x) for x in (edge.get("rooms") or []) if str(x) in adjacency]
        for a in linked:
            adjacency[a].update(x for x in linked if x != a)
    sets = {}
    for room in adjacency:
        visible = {room}
        frontier = {room}
        for _ in range(depth):
            nxt = set()
            for node in frontier:
                nxt.update(adjacency.get(node, set()))
            nxt -= visible
            visible |= nxt
            frontier = nxt
            if not frontier:
                break
        sets[room] = sorted(visible)
    return {
        "schemaVersion": 6,
        "status": "CREATED",
        "hopDepth": depth,
        "roomCount": len(adjacency),
        "sets": sets,
        "authoritativeness": "CANDIDATE_SET_ONLY",
        "rule": "PVS reduces candidate visibility work. Engine-native frustum/occlusion validation remains authoritative before hiding geometry.",
    }


def collect_gpu_telemetry() -> dict:
    nvidia = shutil.which(os.environ.get("NVIDIA_SMI_BIN", "nvidia-smi"))
    if nvidia:
        try:
            proc = subprocess.run(
                [nvidia, "--query-gpu=name,memory.total,memory.used,utilization.gpu", "--format=csv,noheader,nounits"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=10,
                check=False,
            )
            rows = []
            for line in proc.stdout.splitlines():
                parts = [x.strip() for x in line.split(",")]
                if len(parts) >= 4:
                    rows.append({
                        "gpu": parts[0],
                        "vramTotalMB": float(parts[1]),
                        "vramUsedMB": float(parts[2]),
                        "gpuUtilizationPercent": float(parts[3]),
                    })
            if rows:
                return {"schemaVersion": 6, "verified": True, "backend": "nvidia-smi", "gpus": rows}
        except Exception as exc:
            return {"schemaVersion": 6, "verified": False, "backend": "nvidia-smi", "reason": str(exc)}
    return {"schemaVersion": 6, "verified": False, "backend": "unavailable", "reason": "No supported real GPU telemetry backend found; VRAM is never guessed."}


def run_optional_semantic_inference(image_path: Path | None) -> dict:
    model = os.environ.get("AI3D_SEMANTIC_MODEL")
    if not model:
        return {"schemaVersion": 6, "status": "HEURISTIC_FALLBACK", "available": False, "reason": "AI3D_SEMANTIC_MODEL not configured"}
    model_path = Path(model)
    if not model_path.is_file() or not image_path or not Path(image_path).is_file():
        return {"schemaVersion": 6, "status": "HEURISTIC_FALLBACK", "available": False, "reason": "model or semantic input image missing"}
    try:
        import onnxruntime as ort
    except Exception:
        return {"schemaVersion": 6, "status": "HEURISTIC_FALLBACK", "available": False, "reason": "onnxruntime unavailable"}
    try:
        session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        inp = session.get_inputs()[0]
        shape = list(inp.shape)
        size = 512
        if len(shape) == 4 and isinstance(shape[-1], int) and shape[-1] > 32:
            size = int(min(max(shape[-1], 128), 1024))
        with Image.open(image_path).convert("RGB").resize((size, size), Image.Resampling.BILINEAR) as image:
            arr = np.asarray(image, dtype=np.float32) / 255.0
        tensor = np.transpose(arr, (2, 0, 1))[None, ...]
        output = np.asarray(session.run(None, {inp.name: tensor})[0])
        if output.size == 0:
            raise ValueError("semantic model returned empty output")
        return {
            "schemaVersion": 6,
            "status": "ONNX_INFERENCE_VERIFIED",
            "available": True,
            "model": model_path.name,
            "modelSha256": hashlib.sha256(model_path.read_bytes()).hexdigest(),
            "inputName": inp.name,
            "inputShape": [str(x) for x in shape],
            "outputShape": list(output.shape),
            "outputMin": round(float(np.nanmin(output)), 6),
            "outputMax": round(float(np.nanmax(output)), 6),
            "rule": "Inference is real, but geometry changes require a model-specific 2D-to-mesh projection adapter. Heuristic protection remains authoritative until that adapter exists.",
        }
    except Exception as exc:
        return {"schemaVersion": 6, "status": "HEURISTIC_FALLBACK", "available": False, "reason": f"semantic inference failed: {exc}"}


def aggregate_runtime_benchmarks_v6(rows: list[dict], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    targets = {
        "godot": {"minAverageFps": 60.0, "maxP95FrameMs": 22.0},
        "web": {"minAverageFps": 60.0, "maxP95FrameMs": 22.0},
        "roblox": {"minAverageFps": 30.0, "maxP95FrameMs": 38.0},
    }
    targets.update(p.get("targets") or {})
    required = set(p.get("requiredTargets") or [])
    require_telemetry = bool(p.get("requireGpuTelemetry", False))
    results = []
    for row in rows:
        target = str(row.get("target") or "").lower()
        if target not in targets:
            continue
        executed = bool(row.get("executedInTarget", False))
        fps = float(row.get("avgFps", row.get("averageFps", 0.0)) or 0.0)
        p95 = float(row.get("p95FrameMs", 999.0) or 999.0)
        telemetry = row.get("gpuTelemetry") or {}
        telemetry_ok = bool(telemetry.get("verified")) if require_telemetry else True
        limits = targets[target]
        passed = executed and fps >= float(limits["minAverageFps"]) and p95 <= float(limits["maxP95FrameMs"]) and telemetry_ok
        results.append({
            "target": target,
            "executedInTarget": executed,
            "avgFps": round(fps, 3),
            "p95FrameMs": round(p95, 3),
            "gpuTelemetry": telemetry,
            "thresholds": limits,
            "passed": bool(passed),
        })
    required_ok = all(any(r["target"] == target and r["passed"] for r in results) for target in required)
    if any(r["executedInTarget"] and not r["passed"] for r in results):
        status = "FAILED"
    elif required and required_ok:
        status = "VERIFIED"
    elif results and not required and any(r["executedInTarget"] for r in results) and all(r["passed"] for r in results if r["executedInTarget"]):
        status = "VERIFIED"
    else:
        status = "UNVERIFIED"
    return {"schemaVersion": 6, "status": status, "passed": status == "VERIFIED", "requiredTargets": sorted(required), "requireGpuTelemetry": require_telemetry, "results": results}


def production_readiness_gate(gates: dict, runtime: dict | None = None, required_runtime: bool = True) -> dict:
    hard_names = ["fidelity", "aaa", "animation", "atlas", "pbrFamily", "performance", "lodTransition", "temporal"]
    failed = [name for name in hard_names if gates.get(name) is False]
    runtime_status = (runtime or {}).get("status", "UNVERIFIED")
    if failed or runtime_status == "FAILED":
        status = "REJECTED"
    elif required_runtime and runtime_status != "VERIFIED":
        status = "CANDIDATE_RUNTIME_UNVERIFIED"
    else:
        status = "VERIFIED"
    return {
        "schemaVersion": 6,
        "status": status,
        "passed": status == "VERIFIED",
        "staticPassed": not failed,
        "failedStaticGates": failed,
        "runtimeStatus": runtime_status,
        "requiredRuntime": bool(required_runtime),
        "rule": "Production VERIFIED requires all static/visual gates plus actual target-runtime evidence when required.",
    }


def write_v6_runtime_pack(job_dir: Path, pvs: dict, policy: dict | None = None) -> list[Path]:
    job_dir = Path(job_dir)
    matrix = job_dir / "device-farm-matrix-v6.json"
    matrix.write_text(json.dumps({
        "schemaVersion": 6,
        "targets": [
            {"target": "godot", "deviceClass": "desktop", "required": True},
            {"target": "web", "deviceClass": "desktop_chromium", "required": True},
            {"target": "web", "deviceClass": "mobile_emulation", "required": False},
            {"target": "roblox", "deviceClass": "studio_or_device", "required": False},
        ],
        "telemetry": ["avgFps", "p95FrameMs", "gpuName", "realVramWhenExposed"],
        "pvs": {"status": pvs.get("status"), "roomCount": len(pvs.get("sets") or {})},
        "rule": "A target is VERIFIED only by a result emitted from that target runtime. Missing provider stays UNVERIFIED, never PASS.",
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    collector = job_dir / "collect_gpu_telemetry_v6.py"
    collector.write_text(
        "from __future__ import annotations\n"
        "import json, os, shutil, subprocess\n"
        "exe=shutil.which(os.environ.get('NVIDIA_SMI_BIN','nvidia-smi'))\n"
        "result={'schemaVersion':6,'verified':False,'backend':'unavailable','reason':'nvidia-smi not found'}\n"
        "if exe:\n"
        " p=subprocess.run([exe,'--query-gpu=name,memory.total,memory.used,utilization.gpu','--format=csv,noheader,nounits'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=False)\n"
        " rows=[]\n"
        " for line in p.stdout.splitlines():\n"
        "  x=[v.strip() for v in line.split(',')]\n"
        "  if len(x)>=4: rows.append({'gpu':x[0],'vramTotalMB':float(x[1]),'vramUsedMB':float(x[2]),'gpuUtilizationPercent':float(x[3])})\n"
        " if rows: result={'schemaVersion':6,'verified':True,'backend':'nvidia-smi','gpus':rows}\n"
        "print(json.dumps(result,ensure_ascii=False))\n",
        encoding="utf-8",
    )

    orchestrator = job_dir / "run_device_farm_v6.py"
    orchestrator.write_text(
        "from __future__ import annotations\n"
        "import argparse, json, os, subprocess\n"
        "from pathlib import Path\n"
        "def main():\n"
        " p=argparse.ArgumentParser(); p.add_argument('--output',default='device-farm-results-v6.json'); a=p.parse_args(); rows=[]\n"
        " commands={'godot':os.environ.get('AI3D_GODOT_BENCH_COMMAND'),'web':os.environ.get('AI3D_WEB_BENCH_COMMAND'),'roblox':os.environ.get('AI3D_ROBLOX_BENCH_COMMAND')}\n"
        " for target,cmd in commands.items():\n"
        "  if not cmd: rows.append({'target':target,'executedInTarget':False,'status':'UNVERIFIED','reason':'benchmark command not configured'}); continue\n"
        "  proc=subprocess.run(cmd,shell=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=False)\n"
        "  parsed=None\n"
        "  for line in reversed(proc.stdout.splitlines()):\n"
        "   try:\n"
        "    value=json.loads(line.strip())\n"
        "    if isinstance(value,dict): parsed=value; break\n"
        "   except Exception: pass\n"
        "  if parsed is None: rows.append({'target':target,'executedInTarget':False,'status':'UNVERIFIED','reason':'command did not emit JSON','returnCode':proc.returncode})\n"
        "  else: rows.append({**parsed,'target':target,'executedInTarget':bool(parsed.get('executedInTarget',False)),'returnCode':proc.returncode})\n"
        " Path(a.output).write_text(json.dumps({'schemaVersion':6,'rows':rows},ensure_ascii=False,indent=2),encoding='utf-8'); print(a.output)\n"
        "if __name__=='__main__': main()\n",
        encoding="utf-8",
    )

    roblox_upload = job_dir / "roblox_pbr_upload_rebind_v6.json"
    roblox_upload.write_text(json.dumps({
        "schemaVersion": 6,
        "status": "READY_FOR_AUTHENTICATED_UPLOADER",
        "uploaderCommandEnv": "AI3D_ROBLOX_ASSET_UPLOADER",
        "rebindScript": "roblox_apply_quality_v5.luau",
        "rule": "Texture upload becomes automatic only when a real authenticated uploader command is configured. Asset IDs are never fabricated.",
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    return [matrix, collector, orchestrator, roblox_upload]
