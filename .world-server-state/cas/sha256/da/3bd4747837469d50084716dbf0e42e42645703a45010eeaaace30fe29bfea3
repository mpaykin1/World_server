from __future__ import annotations

import json
from contextlib import closing
import os
import re
import shutil
import sqlite3
import subprocess
import time
from pathlib import Path
from typing import Any

from .production_v6 import collect_gpu_telemetry as collect_nvidia_telemetry_v6


def _num(value: Any, default: float | None = None) -> float | None:
    try:
        if isinstance(value, str):
            value = re.sub(r"[^0-9.+-]", "", value)
        return float(value)
    except Exception:
        return default


def _walk(obj: Any, prefix: str = "") -> list[tuple[str, Any]]:
    rows: list[tuple[str, Any]] = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            name = f"{prefix}.{key}" if prefix else str(key)
            rows.append((name.lower(), value))
            rows.extend(_walk(value, name))
    elif isinstance(obj, list):
        for index, value in enumerate(obj):
            rows.extend(_walk(value, f"{prefix}[{index}]"))
    return rows


def _first_numeric(flat: list[tuple[str, Any]], tokens: tuple[str, ...]) -> float | None:
    for name, value in flat:
        if all(token in name for token in tokens):
            number = _num(value)
            if number is not None:
                return number
    return None


def _first_text(flat: list[tuple[str, Any]], tokens: tuple[str, ...]) -> str | None:
    for name, value in flat:
        if all(token in name for token in tokens) and isinstance(value, (str, int, float)):
            return str(value)
    return None


def _run_json(command: list[str], timeout: int = 12) -> tuple[dict | list | None, str]:
    proc = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=timeout, check=False)
    text = proc.stdout.strip()
    try:
        return json.loads(text), text
    except Exception:
        for marker in ("{", "["):
            pos = text.find(marker)
            if pos >= 0:
                try:
                    return json.loads(text[pos:]), text
                except Exception:
                    pass
    return None, text


def _collect_rocm() -> dict | None:
    exe = shutil.which(os.environ.get("ROCM_SMI_BIN", "rocm-smi"))
    if not exe:
        return None
    try:
        data, raw = _run_json([exe, "--showproductname", "--showmeminfo", "vram", "--showuse", "--json"])
        if data is None:
            return {"schemaVersion": 7, "verified": False, "backend": "rocm-smi", "reason": raw[-1200:]}
        blocks = data if isinstance(data, list) else [data]
        if isinstance(data, dict) and any(str(k).lower().startswith("card") for k in data):
            blocks = [v for k, v in data.items() if str(k).lower().startswith("card")]
        gpus = []
        for index, block in enumerate(blocks):
            flat = _walk(block)
            total = _first_numeric(flat, ("vram", "total"))
            used = _first_numeric(flat, ("vram", "used"))
            util = _first_numeric(flat, ("gpu", "use"))
            name = _first_text(flat, ("card", "series")) or _first_text(flat, ("product", "name")) or f"AMD GPU {index}"
            row = {"gpu": name, "gpuUtilizationPercent": util}
            if total is not None:
                row["vramTotalMB"] = round(total / (1024 * 1024), 3) if total > 1024 * 1024 else total
            if used is not None:
                row["vramUsedMB"] = round(used / (1024 * 1024), 3) if used > 1024 * 1024 else used
            gpus.append(row)
        if gpus:
            return {"schemaVersion": 7, "verified": True, "backend": "rocm-smi", "gpus": gpus}
    except Exception as exc:
        return {"schemaVersion": 7, "verified": False, "backend": "rocm-smi", "reason": str(exc)}
    return None


def _collect_intel_xpu() -> dict | None:
    exe = shutil.which(os.environ.get("XPU_SMI_BIN", "xpu-smi"))
    if not exe:
        return None
    try:
        discovery, raw = _run_json([exe, "discovery", "-j"])
        if discovery is None:
            return {"schemaVersion": 7, "verified": False, "backend": "xpu-smi", "reason": raw[-1200:]}
        candidates = discovery if isinstance(discovery, list) else discovery.get("device_list", discovery.get("devices", [])) if isinstance(discovery, dict) else []
        if isinstance(candidates, dict):
            candidates = list(candidates.values())
        gpus = []
        for index, device in enumerate(candidates or []):
            flat = _walk(device)
            device_id = int(_first_numeric(flat, ("device", "id")) or index)
            stats, _ = _run_json([exe, "stats", "-d", str(device_id), "-j"])
            stats_flat = _walk(stats or {})
            name = _first_text(flat, ("device", "name")) or _first_text(flat, ("name",)) or f"Intel GPU {device_id}"
            total = _first_numeric(stats_flat, ("memory", "physical")) or _first_numeric(flat, ("memory", "physical"))
            used = _first_numeric(stats_flat, ("memory", "used"))
            util = _first_numeric(stats_flat, ("gpu", "util"))
            row = {"gpu": name, "gpuUtilizationPercent": util}
            if total is not None:
                row["vramTotalMB"] = total
            if used is not None:
                row["vramUsedMB"] = used
            gpus.append(row)
        if gpus:
            return {"schemaVersion": 7, "verified": True, "backend": "xpu-smi", "gpus": gpus}
    except Exception as exc:
        return {"schemaVersion": 7, "verified": False, "backend": "xpu-smi", "reason": str(exc)}
    return None


def collect_gpu_telemetry_v7() -> dict:
    attempts = []
    nvidia = collect_nvidia_telemetry_v6()
    attempts.append(nvidia)
    if nvidia.get("verified"):
        return {**nvidia, "schemaVersion": 7}
    for collector in (_collect_rocm, _collect_intel_xpu):
        result = collector()
        if result:
            attempts.append(result)
            if result.get("verified"):
                return result
    return {
        "schemaVersion": 7,
        "verified": False,
        "backend": "unavailable",
        "reason": "No NVIDIA/AMD/Intel real telemetry backend returned verified data. VRAM is never guessed.",
        "attempts": attempts,
    }


def engine_native_gpu_timing_gate(rows: list[dict], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    defaults = {
        "godot": {"maxGpuP95Ms": 18.5, "minSamples": 60},
        "web": {"maxGpuP95Ms": 18.5, "minSamples": 60},
        "roblox": {"maxGpuP95Ms": 35.0, "minSamples": 60},
    }
    defaults.update(p.get("targets") or {})
    required = set(p.get("requiredTargets") or [])
    results = []
    for row in rows:
        target = str(row.get("target") or "").lower()
        if target not in defaults:
            continue
        executed = bool(row.get("executedInTarget"))
        verified = bool(row.get("gpuTimingVerified"))
        gpu_p95 = _num(row.get("gpuP95FrameMs", row.get("gpuFrameMsP95")), 999.0) or 999.0
        samples = int(_num(row.get("gpuTimingSamples", row.get("sampleCount")), 0) or 0)
        source = str(row.get("gpuTimingSource") or "")
        limits = defaults[target]
        passed = executed and verified and gpu_p95 <= float(limits["maxGpuP95Ms"]) and samples >= int(limits["minSamples"]) and bool(source)
        results.append({"target": target, "executedInTarget": executed, "gpuTimingVerified": verified, "gpuP95FrameMs": round(gpu_p95, 4), "gpuTimingSamples": samples, "gpuTimingSource": source, "thresholds": limits, "passed": bool(passed)})
    required_ok = all(any(r["target"] == t and r["passed"] for r in results) for t in required)
    if any(r["executedInTarget"] and r["gpuTimingVerified"] and not r["passed"] for r in results):
        status = "FAILED"
    elif required and required_ok:
        status = "VERIFIED"
    elif not required and results and all(r["passed"] for r in results):
        status = "VERIFIED"
    else:
        status = "UNVERIFIED"
    return {"schemaVersion": 7, "status": status, "passed": status == "VERIFIED", "requiredTargets": sorted(required), "results": results}


def refine_pvs_from_runtime(pvs: dict, samples: list[dict], min_samples: int = 3) -> dict:
    base = {str(k): set(map(str, v)) for k, v in (pvs.get("sets") or {}).items()}
    evidence: dict[str, dict[str, int]] = {}
    for sample in samples or []:
        room = str(sample.get("room") or "")
        if not room:
            continue
        evidence.setdefault(room, {})
        for visible in sample.get("visibleRooms") or []:
            visible = str(visible)
            evidence[room][visible] = evidence[room].get(visible, 0) + 1
    additions = []
    for room, counts in evidence.items():
        base.setdefault(room, {room})
        for visible, count in counts.items():
            if count >= int(min_samples) and visible not in base[room]:
                base[room].add(visible)
                additions.append({"room": room, "visibleRoom": visible, "samples": count})
    return {"schemaVersion": 7, "status": "REFINED" if additions else "UNCHANGED", "sets": {k: sorted(v) for k, v in base.items()}, "additions": additions, "removalsApplied": 0, "rule": "Runtime learning may safely expand PVS to prevent over-culling. It never removes visibility solely from absence evidence."}


class DeviceHistoryV7:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path)) as con:
            con.execute("""CREATE TABLE IF NOT EXISTS device_runs(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at REAL NOT NULL,
                target TEXT NOT NULL,
                device_key TEXT NOT NULL,
                asset_class TEXT NOT NULL,
                avg_fps REAL,
                p95_frame_ms REAL,
                gpu_p95_ms REAL,
                vram_used_mb REAL,
                passed INTEGER NOT NULL,
                evidence_json TEXT NOT NULL
            )""")
            con.execute("CREATE INDEX IF NOT EXISTS idx_device_runs_key ON device_runs(target,device_key,asset_class,created_at)")
            con.commit()

    def record(self, rows: list[dict], asset_class: str = "generic") -> int:
        count = 0
        with closing(sqlite3.connect(self.path)) as con:
            for row in rows:
                if not bool(row.get("executedInTarget")):
                    continue
                device_key = str(row.get("deviceKey") or row.get("gpuName") or row.get("deviceClass") or "unknown")
                passed = bool(row.get("passed", row.get("status") == "VERIFIED"))
                con.execute("INSERT INTO device_runs(created_at,target,device_key,asset_class,avg_fps,p95_frame_ms,gpu_p95_ms,vram_used_mb,passed,evidence_json) VALUES(?,?,?,?,?,?,?,?,?,?)", (
                    time.time(), str(row.get("target") or "unknown"), device_key, asset_class,
                    _num(row.get("avgFps", row.get("averageFps"))), _num(row.get("p95FrameMs")),
                    _num(row.get("gpuP95FrameMs", row.get("gpuFrameMsP95"))), _num(row.get("vramUsedMB")), int(passed), json.dumps(row, ensure_ascii=False, separators=(",", ":")),
                ))
                count += 1
            con.commit()
        return count

    def summary(self, limit: int = 100) -> dict:
        with closing(sqlite3.connect(self.path)) as con:
            rows = con.execute("SELECT target,device_key,asset_class,COUNT(*),AVG(avg_fps),AVG(p95_frame_ms),AVG(gpu_p95_ms),SUM(passed) FROM device_runs GROUP BY target,device_key,asset_class ORDER BY COUNT(*) DESC LIMIT ?", (int(limit),)).fetchall()
        return {"schemaVersion": 7, "groups": [{"target": r[0], "deviceKey": r[1], "assetClass": r[2], "runs": r[3], "avgFps": r[4], "avgP95FrameMs": r[5], "avgGpuP95Ms": r[6], "passedRuns": r[7]} for r in rows]}


def production_readiness_gate_v7(static_gates: dict, runtime: dict, gpu_timing: dict, require_runtime: bool = True, require_gpu_timing: bool = True) -> dict:
    failed = [name for name, value in static_gates.items() if value is False]
    runtime_status = (runtime or {}).get("status", "UNVERIFIED")
    gpu_status = (gpu_timing or {}).get("status", "UNVERIFIED")
    if failed or runtime_status == "FAILED" or gpu_status == "FAILED":
        status = "REJECTED"
    elif require_runtime and runtime_status != "VERIFIED":
        status = "CANDIDATE_RUNTIME_UNVERIFIED"
    elif require_gpu_timing and gpu_status != "VERIFIED":
        status = "CANDIDATE_NATIVE_GPU_TIMING_UNVERIFIED"
    else:
        status = "VERIFIED"
    return {"schemaVersion": 7, "status": status, "passed": status == "VERIFIED", "failedStaticGates": failed, "runtimeStatus": runtime_status, "nativeGpuTimingStatus": gpu_status, "requireRuntime": bool(require_runtime), "requireNativeGpuTiming": bool(require_gpu_timing), "rule": "V7 VERIFIED requires visual/static gates plus real target runtime and engine-native GPU timing when required."}


def validate_roblox_upload_result(data: dict) -> dict:
    ids = {}
    for key, value in (data.get("assetIds") or {}).items():
        text = str(value)
        if re.fullmatch(r"[1-9][0-9]{3,}", text):
            ids[str(key)] = text
    return {"schemaVersion": 7, "passed": bool(ids), "assetIds": ids, "invalidCount": max(0, len(data.get("assetIds") or {}) - len(ids))}


def write_v7_runtime_pack(job_dir: Path, pvs: dict, roblox_plan: dict | None = None) -> list[Path]:
    job_dir = Path(job_dir)
    contract = job_dir / "runtime-evidence-contract-v7.json"
    contract.write_text(json.dumps({"schemaVersion": 7, "requiredEvidence": {"godot": ["executedInTarget", "avgFps", "p95FrameMs", "gpuTimingVerified", "gpuP95FrameMs", "gpuTimingSource"], "web": ["executedInTarget", "avgFps", "p95FrameMs", "gpuTimingVerified", "gpuP95FrameMs", "gpuTimingSource"], "roblox": ["executedInTarget", "avgFps", "p95FrameMs"]}, "acceptedGodotGpuTimingSources": ["RenderingServer.viewport_get_measured_render_time_gpu", "RenderingDevice.timestamps"], "acceptedWebGpuTimingSources": ["EXT_disjoint_timer_query_webgl2", "EXT_disjoint_timer_query"], "pvsLearning": "additive-only by default", "rule": "Missing native timing remains UNVERIFIED; CPU frame timers may not impersonate GPU timing."}, ensure_ascii=False, indent=2), encoding="utf-8")

    pvs_seed = job_dir / "pvs-runtime-learning-seed-v7.json"
    pvs_seed.write_text(json.dumps({"schemaVersion": 7, "basePvs": pvs, "samples": [], "rule": "Record current room plus actually visible rooms from runtime."}, ensure_ascii=False, indent=2), encoding="utf-8")

    web_timer = job_dir / "web_gpu_timer_v7.js"
    web_timer.write_text("""export class VerifiedGpuTimerV7 {\n  constructor(gl){this.gl=gl;this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2')||gl.getExtension('EXT_disjoint_timer_query');this.samplesMs=[];}\n  begin(){if(!this.ext)return null;const gl=this.gl,ext=this.ext,q=gl.createQuery?gl.createQuery():ext.createQueryEXT();if(gl.beginQuery)gl.beginQuery(ext.TIME_ELAPSED_EXT,q);else ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,q);return q;}\n  end(q){if(!q||!this.ext)return;const gl=this.gl,ext=this.ext;if(gl.endQuery)gl.endQuery(ext.TIME_ELAPSED_EXT);else ext.endQueryEXT(ext.TIME_ELAPSED_EXT);const poll=()=>{const available=gl.getQueryParameter?gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE):ext.getQueryObjectEXT(q,ext.QUERY_RESULT_AVAILABLE_EXT);const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);if(!available)return requestAnimationFrame(poll);if(!disjoint){const ns=gl.getQueryParameter?gl.getQueryParameter(q,gl.QUERY_RESULT):ext.getQueryObjectEXT(q,ext.QUERY_RESULT_EXT);this.samplesMs.push(Number(ns)/1e6);}};poll();}\n  report(){const s=[...this.samplesMs].sort((a,b)=>a-b),p95=s.length?s[Math.min(s.length-1,Math.floor(s.length*.95))]:null;return {target:'web',executedInTarget:true,gpuTimingVerified:s.length>=60,gpuP95FrameMs:p95,gpuTimingSamples:s.length,gpuTimingSource:this.ext?'EXT_disjoint_timer_query_webgl2':''};}\n}\n""", encoding="utf-8")

    godot_timer = job_dir / "godot_gpu_timer_v7.gd"
    godot_timer.write_text("""extends Node\nvar samples: Array[float] = []\nfunc _ready():\n    RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), true)\nfunc _process(_delta):\n    var ms := RenderingServer.viewport_get_measured_render_time_gpu(get_viewport().get_viewport_rid())\n    if ms > 0.0: samples.append(ms)\nfunc report() -> Dictionary:\n    var s := samples.duplicate(); s.sort(); var p95 = null\n    if s.size() > 0: p95 = s[min(s.size()-1, int(floor(s.size()*0.95)))]\n    return {\"target\":\"godot\",\"executedInTarget\":true,\"gpuTimingVerified\":s.size()>=60,\"gpuP95FrameMs\":p95,\"gpuTimingSamples\":s.size(),\"gpuTimingSource\":\"RenderingServer.viewport_get_measured_render_time_gpu\"}\n""", encoding="utf-8")

    roblox = job_dir / "roblox-open-cloud-plan-v7.json"
    roblox.write_text(json.dumps(roblox_plan or {"schemaVersion": 7, "status": "NO_ASSETS_DISCOVERED"}, ensure_ascii=False, indent=2), encoding="utf-8")
    return [contract, pvs_seed, web_timer, godot_timer, roblox]
