from __future__ import annotations

import hashlib
import json
import math
import os
import shlex
import sqlite3
import statistics
import subprocess
import time
from collections import defaultdict
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .production_v8 import device_matrix_coverage, validate_roblox_place_runtime


def _f(value: Any, default: float | None = None) -> float | None:
    try:
        return float(value)
    except Exception:
        return default


def _truthy_pass(row: dict) -> bool:
    return bool(row.get("passed", row.get("status") in {"VERIFIED", "PASS", "PASSED"}))


def _evidence_day(row: dict) -> str | None:
    """Return a UTC calendar day from any supported V8/V9 evidence field."""
    ts = _f(row.get("timestampEpoch"))
    if ts is None:
        ts = _f(row.get("createdAt"))
    if ts is not None:
        try:
            return datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
        except Exception:
            pass
    for key in ("date", "day", "createdAtIso", "timestamp"):
        value = row.get(key)
        if value:
            text = str(value).strip()
            if len(text) >= 10:
                return text[:10]
    return None


def wilson_lower_bound(successes: int, total: int, z: float = 1.96) -> float:
    if total <= 0:
        return 0.0
    phat = successes / total
    denom = 1.0 + z * z / total
    center = phat + z * z / (2.0 * total)
    margin = z * math.sqrt((phat * (1.0 - phat) + z * z / (4.0 * total)) / total)
    return max(0.0, min(1.0, (center - margin) / denom))


class FleetHistoryV9:
    """Persistent evidence store for longitudinal fleet claims.

    V8 counts verified runs. V9 additionally requires evidence diversity: distinct device ids,
    sessions, calendar days, builds, and target/hardware-tier cells. Unknown identifiers are stored
    for diagnostics but cannot satisfy fleet diversity gates.
    """

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path)) as con:
            con.execute("""CREATE TABLE IF NOT EXISTS fleet_runs_v9(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at REAL NOT NULL,
                target TEXT NOT NULL,
                hardware_tier TEXT NOT NULL,
                device_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                build_id TEXT NOT NULL,
                asset_class TEXT NOT NULL,
                passed INTEGER NOT NULL,
                avg_fps REAL,
                p95_frame_ms REAL,
                gpu_p95_ms REAL,
                texture_mem_mb REAL,
                buffer_mem_mb REAL,
                evidence_json TEXT NOT NULL
            )""")
            con.execute("CREATE INDEX IF NOT EXISTS idx_fleet_runs_v9 ON fleet_runs_v9(target,hardware_tier,asset_class,created_at)")
            con.commit()

    def record(self, rows: list[dict], asset_class: str = "generic") -> int:
        count = 0
        with closing(sqlite3.connect(self.path)) as con:
            for row in rows or []:
                if not bool(row.get("executedInTarget")):
                    continue
                ts = _f(row.get("timestampEpoch"))
                if ts is None:
                    ts = _f(row.get("createdAt"), time.time())
                ts = ts or time.time()
                target = str(row.get("target") or "unknown").lower()
                tier = str(row.get("hardwareTier") or row.get("deviceTier") or "unknown").lower()
                device_id = str(row.get("deviceId") or row.get("deviceKey") or row.get("gpuName") or "unknown")
                session_id = str(row.get("sessionId") or row.get("runSessionId") or "unknown")
                build_id = str(row.get("buildId") or row.get("artifactSha") or row.get("commitSha") or "unknown")
                con.execute(
                    "INSERT INTO fleet_runs_v9(created_at,target,hardware_tier,device_id,session_id,build_id,asset_class,passed,avg_fps,p95_frame_ms,gpu_p95_ms,texture_mem_mb,buffer_mem_mb,evidence_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        ts, target, tier, device_id, session_id, build_id, asset_class, int(_truthy_pass(row)),
                        _f(row.get("avgFps", row.get("averageFps"))), _f(row.get("p95FrameMs")),
                        _f(row.get("gpuP95FrameMs", row.get("gpuFrameMsP95"))), _f(row.get("textureMemoryMB")),
                        _f(row.get("bufferMemoryMB")), json.dumps(row, ensure_ascii=False, separators=(",", ":")),
                    ),
                )
                count += 1
            con.commit()
        return count

    def rows(self, limit: int = 10000) -> list[dict]:
        with closing(sqlite3.connect(self.path)) as con:
            data = con.execute(
                "SELECT created_at,target,hardware_tier,device_id,session_id,build_id,asset_class,passed,avg_fps,p95_frame_ms,gpu_p95_ms,texture_mem_mb,buffer_mem_mb,evidence_json FROM fleet_runs_v9 ORDER BY created_at DESC LIMIT ?",
                (int(limit),),
            ).fetchall()
        out = []
        for r in data:
            try:
                evidence = json.loads(r[13])
            except Exception:
                evidence = {}
            out.append({
                **evidence,
                "timestampEpoch": r[0], "target": r[1], "hardwareTier": r[2], "deviceId": r[3],
                "sessionId": r[4], "buildId": r[5], "assetClass": r[6], "passed": bool(r[7]),
                "avgFps": r[8], "p95FrameMs": r[9], "gpuP95FrameMs": r[10], "textureMemoryMB": r[11],
                "bufferMemoryMB": r[12], "executedInTarget": True,
            })
        return out


def longitudinal_fleet_gate_v9(rows: list[dict], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    required_targets = [str(x).lower() for x in (p.get("requiredTargets") or ["web", "godot"])]
    required_tiers = [str(x).lower() for x in (p.get("requiredTiers") or ["low", "mid", "high"])]
    min_runs = max(1, int(p.get("minRunsPerCell", 5)))
    min_devices = max(1, int(p.get("minDevicesPerCell", 2)))
    min_sessions = max(1, int(p.get("minSessionsPerCell", 3)))
    min_days = max(1, int(p.get("minDaysPerCell", 2)))
    min_builds = max(1, int(p.get("minBuildsPerCell", 1)))
    min_wilson = max(0.5, min(float(p.get("minWilsonPassRate", 0.70)), 0.999))
    max_age_days = max(1.0, float(p.get("maxEvidenceAgeDays", 30.0)))
    now_epoch = float(p.get("nowEpoch", time.time()))

    cells: dict[tuple[str, str], list[dict]] = defaultdict(list)
    stale_rows = 0
    for row in rows or []:
        if not bool(row.get("executedInTarget")):
            continue
        ts = _f(row.get("timestampEpoch"), _f(row.get("createdAt")))
        if ts is None or now_epoch - ts > max_age_days * 86400.0:
            stale_rows += 1
            continue
        target = str(row.get("target") or "").lower()
        tier = str(row.get("hardwareTier") or row.get("deviceTier") or "unknown").lower()
        cells[(target, tier)].append(row)

    matrix = []
    missing = []
    for target in required_targets:
        for tier in required_tiers:
            cell_rows = cells.get((target, tier), [])
            passed_rows = [r for r in cell_rows if _truthy_pass(r)]
            device_ids = {str(r.get("deviceId") or r.get("deviceKey") or "unknown") for r in passed_rows} - {"unknown", "", "None"}
            sessions = {str(r.get("sessionId") or r.get("runSessionId") or "unknown") for r in passed_rows} - {"unknown", "", "None"}
            builds = {str(r.get("buildId") or r.get("commitSha") or r.get("artifactSha") or "unknown") for r in passed_rows} - {"unknown", "", "None"}
            days = {d for r in passed_rows if (d := _evidence_day(r))}
            lower = wilson_lower_bound(len(passed_rows), len(cell_rows)) if cell_rows else 0.0
            ok = (
                len(cell_rows) >= min_runs and len(device_ids) >= min_devices and len(sessions) >= min_sessions
                and len(days) >= min_days and len(builds) >= min_builds and lower >= min_wilson
            )
            row = {
                "target": target, "tier": tier, "runs": len(cell_rows), "passedRuns": len(passed_rows),
                "distinctDevices": len(device_ids), "distinctSessions": len(sessions), "distinctDays": len(days),
                "distinctBuilds": len(builds), "wilsonPassRateLower95": round(lower, 6), "passed": ok,
            }
            matrix.append(row)
            if not ok:
                missing.append({
                    **row,
                    "required": {"runs": min_runs, "devices": min_devices, "sessions": min_sessions, "days": min_days, "builds": min_builds, "wilsonPassRateLower95": min_wilson},
                })
    status = "VERIFIED_LONGITUDINAL" if not missing else "INSUFFICIENT_LONGITUDINAL_EVIDENCE"
    return {
        "schemaVersion": 9, "status": status, "passed": not missing, "matrix": matrix, "missing": missing,
        "freshEvidenceMaxAgeDays": max_age_days, "staleRowsIgnored": stale_rows,
        "rule": "V9 fleet verification requires fresh repeated passing evidence across distinct devices, sessions, days and builds; repeated or stale runs cannot satisfy fleet verification.",
    }


def statistical_calibration_v9(base_policy: dict, rows: list[dict], policy: dict | None = None) -> dict:
    """Tune only the LOD seed after statistically strong real-device evidence.

    Visual/semantic/temporal thresholds are copied unchanged. This is deliberately more stringent
    than V8: evidence must be longitudinal and the Wilson lower bound must exceed the configured
    confidence threshold.
    """
    p = dict(policy or {})
    min_runs = max(20, int(p.get("minRuns", 40)))
    min_devices = max(2, int(p.get("minDevices", 3)))
    min_days = max(2, int(p.get("minDays", 3)))
    min_lower = max(0.65, min(float(p.get("minWilsonPassRate", 0.80)), 0.99))
    max_delta = max(0.01, min(float(p.get("maxLodRatioDelta", 0.05)), 0.10))
    max_age_days = max(1.0, float(p.get("maxEvidenceAgeDays", 30.0)))
    now_epoch = float(p.get("nowEpoch", time.time()))
    valid = []
    for r in rows or []:
        if not bool(r.get("executedInTarget")):
            continue
        ts = _f(r.get("timestampEpoch"), _f(r.get("createdAt")))
        if ts is None or now_epoch - ts > max_age_days * 86400.0:
            continue
        valid.append(r)
    passed = [r for r in valid if _truthy_pass(r)]
    devices = {str(r.get("deviceId") or r.get("deviceKey") or "unknown") for r in passed} - {"unknown", "", "None"}
    days = {d for r in passed if (d := _evidence_day(r))}
    lower = wilson_lower_bound(len(passed), len(valid)) if valid else 0.0
    if len(valid) < min_runs or len(devices) < min_devices or len(days) < min_days or lower < min_lower:
        return {
            "schemaVersion": 9, "status": "INSUFFICIENT_STATISTICAL_EVIDENCE", "applied": False, "policy": base_policy,
            "evidence": {"runs": len(valid), "passedRuns": len(passed), "devices": len(devices), "days": len(days), "wilsonPassRateLower95": round(lower, 6)},
            "rule": "No V9 tuning without longitudinal real-device evidence and a strong lower confidence bound.",
        }
    fps = [_f(r.get("avgFps", r.get("averageFps"))) for r in passed]
    fps = [x for x in fps if x is not None]
    p95 = [_f(r.get("p95FrameMs")) for r in passed]
    p95 = [x for x in p95 if x is not None]
    median_fps = statistics.median(fps) if fps else None
    median_p95 = statistics.median(p95) if p95 else None
    delta = 0.0
    rationale = "hold"
    if median_fps is not None and median_fps >= 80 and (median_p95 is None or median_p95 <= 13.0):
        delta = max_delta
        rationale = "statistically verified fleet headroom; preserve more geometry"
    elif median_fps is not None and median_fps < 48:
        delta = -max_delta
        rationale = "statistically verified fleet pressure; use a more aggressive starting seed only"
    new_policy = json.loads(json.dumps(base_policy))
    lod = list(new_policy.get("lodRatios") or [0.78, 0.52, 0.26, 0.10])
    floors = [0.50, 0.30, 0.12, 0.05]
    tuned = [round(max(floors[i], min(1.0, float(v) + delta)), 4) for i, v in enumerate(lod[:4])]
    for i in range(2, -1, -1):
        tuned[i] = max(tuned[i], tuned[i + 1])
    new_policy["lodRatios"] = tuned
    return {
        "schemaVersion": 9, "status": "CALIBRATED" if delta else "EVIDENCE_STRONG_HOLD", "applied": bool(delta), "policy": new_policy,
        "evidence": {"runs": len(valid), "passedRuns": len(passed), "devices": len(devices), "days": len(days), "wilsonPassRateLower95": round(lower, 6), "medianFps": median_fps, "medianP95FrameMs": median_p95},
        "lodDelta": delta, "rationale": rationale,
        "neverRelaxed": ["qualityThresholds", "animationQA", "temporalQA", "semanticProjectionV7", "semanticFusionV8", "semanticMeshV9"],
    }


def shader_memory_telemetry_gate_v9(rows: list[dict], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    required_targets = [str(x).lower() for x in (p.get("requiredTargets") or ["godot", "web"])]
    max_gpu_p95 = float(p.get("maxGpuP95Ms", 20.0))
    max_draw_calls = int(p.get("maxDrawCalls", 5000))
    target_rows: dict[str, list[dict]] = defaultdict(list)
    for row in rows or []:
        if bool(row.get("executedInTarget")):
            target_rows[str(row.get("target") or "").lower()].append(row)
    checks = []
    failed = []
    unavailable = []
    for target in required_targets:
        rows_for_target = target_rows.get(target, [])
        verified = []
        for row in rows_for_target:
            gpu = _f(row.get("gpuP95FrameMs", row.get("gpuFrameMsP95")))
            draw = _f(row.get("drawCallsP95", row.get("avgDrawCalls", row.get("drawCalls"))))
            texture = _f(row.get("textureMemoryMB"))
            buffer_mem = _f(row.get("bufferMemoryMB"))
            disjoint = bool(row.get("gpuTimerDisjoint", False))
            source = str(row.get("telemetrySource") or row.get("gpuTimingSource") or "")
            # Godot stable exposes GPU render time plus draw calls and texture/buffer memory.
            # Web guarantees only timer queries when EXT_disjoint_timer_query_webgl2 exists;
            # memory/occupancy counters are optional and must not be fabricated.
            required_present = gpu is not None and gpu > 0 and source not in {"", "estimated", "synthetic"}
            if target == "godot":
                required_present = required_present and draw is not None and texture is not None and buffer_mem is not None
            if target == "web":
                required_present = required_present and not disjoint
            if required_present:
                verified.append({"gpuP95Ms": gpu, "drawCalls": draw, "textureMemoryMB": texture, "bufferMemoryMB": buffer_mem, "source": source})
        if not verified:
            unavailable.append(target)
            checks.append({"target": target, "status": "UNAVAILABLE", "passed": False})
            continue
        gpu_p95 = max(v["gpuP95Ms"] for v in verified if v["gpuP95Ms"] is not None)
        draw_peak = max([v["drawCalls"] for v in verified if v["drawCalls"] is not None] or [0])
        ok = gpu_p95 <= max_gpu_p95 and draw_peak <= max_draw_calls
        row = {"target": target, "status": "VERIFIED" if ok else "FAILED", "passed": ok, "gpuP95Ms": gpu_p95, "drawCallsPeak": draw_peak, "samples": len(verified)}
        checks.append(row)
        if not ok:
            failed.append(row)
    status = "FAILED" if failed else ("UNVERIFIED" if unavailable else "VERIFIED")
    return {
        "schemaVersion": 9, "status": status, "passed": status == "VERIFIED", "checks": checks, "unavailableTargets": unavailable, "failed": failed,
        "optionalCounters": ["shaderOccupancyPercent", "memoryBandwidthGBps", "shaderCompileMs"],
        "rule": "Unsupported shader occupancy/bandwidth counters remain UNAVAILABLE. V9 accepts only engine/vendor measurements and never estimates them from triangle or file counts.",
    }


def validate_device_farm_result_v9(rows: list[dict], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    min_samples = max(10, int(p.get("minSamplesPerRun", 120)))
    valid = []
    invalid = []
    for row in rows or []:
        reasons = []
        if not bool(row.get("executedInTarget")): reasons.append("executedInTarget")
        if not str(row.get("providerExecutionId") or "").strip(): reasons.append("providerExecutionId")
        if not str(row.get("deviceId") or "").strip(): reasons.append("deviceId")
        if not str(row.get("sessionId") or "").strip(): reasons.append("sessionId")
        if not str(row.get("target") or "").strip(): reasons.append("target")
        if not str(row.get("hardwareTier") or "").strip(): reasons.append("hardwareTier")
        if int(row.get("sampleCount") or 0) < min_samples: reasons.append("sampleCount")
        if _f(row.get("avgFps", row.get("averageFps"))) is None: reasons.append("avgFps")
        if _f(row.get("p95FrameMs")) is None: reasons.append("p95FrameMs")
        if reasons: invalid.append({"row": row, "missingOrInvalid": reasons})
        else: valid.append(row)
    return {"schemaVersion": 9, "status": "VERIFIED" if valid and not invalid else ("PARTIAL" if valid else "UNVERIFIED"), "passed": bool(valid and not invalid), "validRuns": len(valid), "invalidRuns": len(invalid), "invalid": invalid}


def validate_roblox_studio_bridge_v9(data: dict, policy: dict | None = None) -> dict:
    p = dict(policy or {})
    base = validate_roblox_place_runtime(data, {"requirePbrBindings": bool(p.get("requirePbrBindings", True))})
    failures = list(base.get("failedChecks") or [])
    if not str(data.get("studioVersion") or "").strip(): failures.append("studioVersion")
    if not str(data.get("verificationRunId") or "").strip(): failures.append("verificationRunId")
    if bool(p.get("requirePublishedPlace", True)) and not bool(data.get("publishedPlaceId") or data.get("placeId")): failures.append("publishedPlaceId")
    if bool(p.get("requireRebindEvidence", True)):
        checks = data.get("placeChecks") or {}
        if checks.get("assetIdsRebound") is not True: failures.append("assetIdsRebound")
        if checks.get("surfaceAppearanceAssetIdsValid") is not True: failures.append("surfaceAppearanceAssetIdsValid")
    status = "VERIFIED" if base.get("passed") and not failures else "UNVERIFIED"
    return {**base, "schemaVersion": 9, "status": status, "passed": status == "VERIFIED", "failedChecks": sorted(set(failures)), "rule": "V9 Roblox PASS requires Studio/place execution plus verified rebinding evidence; Open Cloud upload success alone is insufficient."}


def build_device_farm_manifest_v9(job_dir: Path, targets: list[str], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    tiers = [str(x).lower() for x in (p.get("tiers") or ["low", "mid", "high"])]
    cells = []
    for target in targets:
        for tier in tiers:
            token = hashlib.sha256(f"{Path(job_dir).name}:{target}:{tier}".encode()).hexdigest()[:16]
            cells.append({"runToken": token, "target": target, "hardwareTier": tier, "requiredSamples": int(p.get("minSamplesPerRun", 120))})
    return {
        "schemaVersion": 9,
        "status": "READY_IF_PROVIDER_CONFIGURED",
        "cells": cells,
        "providerCommandEnvironment": "AI3D_DEVICE_FARM_COMMAND",
        "resultContract": ["providerExecutionId", "executedInTarget", "target", "hardwareTier", "deviceId", "sessionId", "sampleCount", "avgFps", "p95FrameMs", "timestampEpoch", "buildId"],
        "rule": "V9 device-farm orchestration is provider-agnostic: the configured provider command must produce target-runtime evidence matching this contract; missing provider credentials never become PASS.",
    }


def write_v9_runtime_pack(job_dir: Path, targets: list[str], pvs: dict, roblox_plan: dict | None = None, policy: dict | None = None) -> list[Path]:
    job_dir = Path(job_dir)
    manifest = build_device_farm_manifest_v9(job_dir, targets, (policy or {}).get("deviceFarmV9") or {})
    manifest_path = job_dir / "device-farm-manifest-v9.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    runner = job_dir / "run_device_farm_v9.py"
    runner.write_text(r'''from __future__ import annotations
import json, os, shlex, subprocess, sys
from pathlib import Path
manifest=Path(sys.argv[1] if len(sys.argv)>1 else "device-farm-manifest-v9.json").resolve()
out=Path(sys.argv[2] if len(sys.argv)>2 else "device-farm-results-v9.json").resolve()
command=os.environ.get("AI3D_DEVICE_FARM_COMMAND","").strip()
if not command:
    out.write_text(json.dumps({"schemaVersion":9,"status":"UNVERIFIED","reason":"AI3D_DEVICE_FARM_COMMAND not configured","rows":[]},indent=2),encoding="utf-8")
    raise SystemExit(2)
cmd=command.replace("{manifest}",str(manifest)).replace("{output}",str(out))
proc=subprocess.run(cmd if os.name=="nt" else shlex.split(cmd),shell=(os.name=="nt"),check=False)
if proc.returncode!=0 or not out.is_file(): raise SystemExit(proc.returncode or 3)
data=json.loads(out.read_text(encoding="utf-8"))
if not isinstance(data.get("rows"),list): raise SystemExit(4)
print(json.dumps({"status":"COLLECTED","rows":len(data["rows"])}))
''', encoding="utf-8")

    godot = job_dir / "godot_profiler_v9.gd"
    godot.write_text(r'''extends Node
var samples:Array = []
var warmup := 120
var frames := 0
func _ready():
    RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), true)
func _process(_delta):
    frames += 1
    if frames <= warmup: return
    var viewport_rid = get_viewport().get_viewport_rid()
    var row = {
        "gpuFrameMs": RenderingServer.viewport_get_measured_render_time_gpu(viewport_rid),
        "cpuRenderMs": RenderingServer.viewport_get_measured_render_time_cpu(viewport_rid),
        "drawCalls": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME),
        "primitives": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME),
        "textureMemoryBytes": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TEXTURE_MEM_USED),
        "bufferMemoryBytes": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_BUFFER_MEM_USED)
    }
    samples.append(row)
    if samples.size() >= 300:
        print("[AI3D_V9_GODOT_PROFILER]" + JSON.stringify({"schemaVersion":9,"executedInTarget":true,"target":"godot","telemetrySource":"Godot RenderingServer","samples":samples}))
        get_tree().quit()
''', encoding="utf-8")

    web = job_dir / "web_gpu_profiler_v9.js"
    web.write_text(r'''export function createAI3DV9GpuTimer(gl){
  const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if(!ext) return {supported:false, reason:'EXT_disjoint_timer_query_webgl2 unavailable'};
  let q=null;
  return {
    supported:true,
    begin(){ if(q) return false; q=gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT,q); return true; },
    end(){ if(!q) return false; gl.endQuery(ext.TIME_ELAPSED_EXT); return true; },
    poll(){ if(!q) return null; const available=gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE); const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT); if(!available) return null; const ns=gl.getQueryParameter(q,gl.QUERY_RESULT); gl.deleteQuery(q); q=null; return {gpuFrameMs:Number(ns)/1e6,gpuTimerDisjoint:Boolean(disjoint),telemetrySource:'WebGL2 EXT_disjoint_timer_query_webgl2'}; }
  };
}
''', encoding="utf-8")

    studio_bridge = job_dir / "run_roblox_studio_verify_v9.py"
    studio_bridge.write_text(r'''from __future__ import annotations
import json, os, shlex, subprocess, sys
from pathlib import Path
script=Path(sys.argv[1] if len(sys.argv)>1 else "roblox_place_verify_v9.luau").resolve()
out=Path(sys.argv[2] if len(sys.argv)>2 else "roblox-studio-verification-v9.json").resolve()
command=os.environ.get("ROBLOX_STUDIO_VERIFY_COMMAND","").strip()
if not command:
    out.write_text(json.dumps({"schemaVersion":9,"status":"UNVERIFIED","reason":"ROBLOX_STUDIO_VERIFY_COMMAND not configured"},indent=2),encoding="utf-8")
    raise SystemExit(2)
cmd=command.replace("{script}",str(script)).replace("{output}",str(out))
proc=subprocess.run(cmd if os.name=="nt" else shlex.split(cmd),shell=(os.name=="nt"),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=False)
if not out.is_file():
    marker='[AI3D_V9_ROBLOX_VERIFY]'
    lines=[line for line in proc.stdout.splitlines() if marker in line]
    if lines:
        out.write_text(lines[-1].split(marker,1)[1],encoding='utf-8')
if proc.returncode!=0 or not out.is_file(): raise SystemExit(proc.returncode or 3)
print(out)
''', encoding="utf-8")

    luau = job_dir / "roblox_place_verify_v9.luau"
    luau.write_text(r'''-- AI3D V9 place-side verification. Run through the configured Studio automation bridge.
local HttpService=game:GetService('HttpService')
local Workspace=game:GetService('Workspace')
local meshCount,collidable,surfaceCount,boundIds=0,0,0,0
local finiteBounds,noMissing=true,true
for _,inst in ipairs(Workspace:GetDescendants()) do
  if inst:IsA('MeshPart') then
    meshCount+=1
    if inst.CanCollide then collidable+=1 end
    local s=inst.Size
    if s.X~=s.X or s.Y~=s.Y or s.Z~=s.Z or s.Magnitude<=0 then finiteBounds=false end
    if tonumber(string.match(inst.MeshId,'%d+'))==nil then noMissing=false else boundIds+=1 end
  elseif inst:IsA('SurfaceAppearance') then
    surfaceCount+=1
  end
end
local checks={modelLoaded=meshCount>0,finiteBounds=finiteBounds,collisionPresent=collidable>0,materialsBound=meshCount>0,surfaceAppearanceBound=surfaceCount>0,noMissingAssets=noMissing,assetIdsRebound=boundIds==meshCount and meshCount>0,surfaceAppearanceAssetIdsValid=surfaceCount>0}
local report={schemaVersion=9,executedInRobloxStudio=true,placeId=game.PlaceId,publishedPlaceId=game.PlaceId,studioVersion=version(),verificationRunId=HttpService:GenerateGUID(false),placeChecks=checks,counts={meshParts=meshCount,collidableMeshParts=collidable,surfaceAppearance=surfaceCount}}
print('[AI3D_V9_ROBLOX_VERIFY]'..HttpService:JSONEncode(report))
''', encoding="utf-8")

    contract = job_dir / "runtime-evidence-contract-v9.json"
    contract.write_text(json.dumps({
        "schemaVersion": 9,
        "fleetEvidence": {"requiresDistinctDevices": True, "requiresDistinctSessions": True, "requiresDistinctDays": True, "repeatedSingleDeviceRuns": "insufficient"},
        "godotTelemetry": ["gpu render ms", "cpu render ms", "draw calls", "primitives", "texture memory", "buffer memory"],
        "webTelemetry": ["WebGL2 EXT_disjoint_timer_query_webgl2 GPU time when available"],
        "optionalOnlyNeverEstimated": ["shader occupancy", "memory bandwidth"],
        "robloxStudio": {"uploadPlan": roblox_plan or {}, "requiresPlaceSideRebindEvidence": True},
        "pvs": pvs,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    return [manifest_path, runner, godot, web, studio_bridge, luau, contract]


def _production_readiness_gate_v9_strict(static_gates: dict, runtime: dict, gpu_timing: dict, device_matrix: dict, longitudinal: dict, shader_memory: dict, semantic_mesh: dict, roblox_studio: dict | None = None, device_farm: dict | None = None, policy: dict | None = None) -> dict:
    p = dict(policy or {})
    failed_static = [k for k, v in static_gates.items() if v is False]
    require_runtime = bool(p.get("requireRuntimeEvidence", True))
    require_gpu = bool(p.get("requireNativeGpuTiming", True))
    require_matrix = bool(p.get("requireDeviceMatrix", True))
    require_longitudinal = bool(p.get("requireLongitudinalFleet", True))
    require_shader = bool(p.get("requireShaderMemoryTelemetry", True))
    require_semantic_mesh = bool(p.get("requireMeshNativeSemantic", False))
    require_roblox = bool(p.get("requireRobloxStudioVerification", False))
    require_device_farm = bool(p.get("requireDeviceFarmEvidence", False))
    statuses = {
        "runtime": str((runtime or {}).get("status", "UNVERIFIED")),
        "gpuTiming": str((gpu_timing or {}).get("status", "UNVERIFIED")),
        "deviceMatrix": str((device_matrix or {}).get("status", "INCOMPLETE")),
        "longitudinalFleet": str((longitudinal or {}).get("status", "INSUFFICIENT_LONGITUDINAL_EVIDENCE")),
        "shaderMemory": str((shader_memory or {}).get("status", "UNVERIFIED")),
        "semanticMesh": str((semantic_mesh or {}).get("status", "UNAVAILABLE")),
        "robloxStudio": str((roblox_studio or {}).get("status", "UNVERIFIED")),
        "deviceFarm": str((device_farm or {}).get("status", "UNVERIFIED")),
    }
    if failed_static or statuses["runtime"] == "FAILED" or statuses["gpuTiming"] == "FAILED" or statuses["shaderMemory"] == "FAILED":
        status = "REJECTED"
    elif require_runtime and statuses["runtime"] != "VERIFIED":
        status = "CANDIDATE_RUNTIME_UNVERIFIED"
    elif require_gpu and statuses["gpuTiming"] != "VERIFIED":
        status = "CANDIDATE_GPU_TIMING_UNVERIFIED"
    elif require_shader and statuses["shaderMemory"] != "VERIFIED":
        status = "CANDIDATE_SHADER_MEMORY_TELEMETRY_UNVERIFIED"
    elif require_semantic_mesh and not statuses["semanticMesh"].startswith("READY"):
        status = "CANDIDATE_MESH_SEMANTIC_UNVERIFIED"
    elif require_roblox and statuses["robloxStudio"] != "VERIFIED":
        status = "CANDIDATE_ROBLOX_STUDIO_UNVERIFIED"
    elif require_device_farm and statuses["deviceFarm"] != "VERIFIED":
        status = "CANDIDATE_DEVICE_FARM_UNVERIFIED"
    elif require_matrix and statuses["deviceMatrix"] != "VERIFIED":
        status = "VERIFIED_TARGET_RUNTIME_FLEET_MATRIX_INCOMPLETE"
    elif require_longitudinal and statuses["longitudinalFleet"] != "VERIFIED_LONGITUDINAL":
        status = "VERIFIED_FLEET_MATRIX_LONGITUDINAL_INCOMPLETE"
    else:
        status = "VERIFIED_FLEET_LONGITUDINAL"
    target_verified = status in {"VERIFIED_TARGET_RUNTIME_FLEET_MATRIX_INCOMPLETE", "VERIFIED_FLEET_MATRIX_LONGITUDINAL_INCOMPLETE", "VERIFIED_FLEET_LONGITUDINAL"}
    passed = status == "VERIFIED_FLEET_LONGITUDINAL"
    return {
        "schemaVersion": 9, "status": status, "passed": passed, "targetVerified": target_verified, "fleetVerified": status == "VERIFIED_FLEET_LONGITUDINAL",
        "failedStaticGates": failed_static, "statuses": statuses,
        "rule": "V9 separates target-runtime, matrix, and longitudinal fleet verification. Missing external evidence is never upgraded to PASS and static visual gates remain mandatory.",
    }

# Compatibility/upgrade adapters for the V9 integration layer used by mesh_optimizer.py.
DeviceHistoryV9 = FleetHistoryV9


def robust_device_calibration_v9(base_policy: dict, rows: list[dict], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    mapped = {
        "minRuns": p.get("minRuns", 40),
        "minDevices": p.get("minDistinctDevices", p.get("minDevices", 3)),
        "minDays": p.get("minDistinctDays", p.get("minDays", 3)),
        "minWilsonPassRate": p.get("minWilsonPassRate", 0.80),
        "maxLodRatioDelta": p.get("maxLodRatioDelta", 0.05),
        "maxEvidenceAgeDays": p.get("maxEvidenceAgeDays", 30),
    }
    return statistical_calibration_v9(base_policy, rows, mapped)


def fleet_evidence_gate_v9(rows: list[dict], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    mapped = {
        "requiredTargets": p.get("requiredTargets") or ["web", "godot"],
        "requiredTiers": p.get("requiredTiers") or ["low", "mid", "high"],
        "minRunsPerCell": p.get("minRunsPerCell", 3),
        "minDevicesPerCell": p.get("minDistinctDevicesPerCell", 2),
        "minSessionsPerCell": p.get("minSessionsPerCell", 2),
        "minDaysPerCell": p.get("minDistinctDaysPerCell", 1),
        "minBuildsPerCell": p.get("minBuildsPerCell", 1),
        "minWilsonPassRate": p.get("minWilsonPassRate", 0.60),
        "maxEvidenceAgeDays": p.get("maxEvidenceAgeDays", 30),
    }
    compat_rows = []
    for i, source in enumerate(rows or []):
        row = dict(source)
        # Original V9 evidence used deviceKey/createdAt without explicit sessions/builds.
        # These compatibility ids are scoped only to the legacy fleet_evidence_gate_v9 wrapper;
        # strict longitudinal_fleet_gate_v9 still requires real session/build identifiers.
        row.setdefault("sessionId", f"legacy-session-{i}")
        row.setdefault("buildId", "legacy-v9-build")
        compat_rows.append(row)
    result = longitudinal_fleet_gate_v9(compat_rows, mapped)
    # V9 also records repeatability information, but it never turns an insufficient
    # longitudinal result into PASS merely because FPS variance is low.
    for cell in result.get("matrix") or []:
        relevant = [r for r in compat_rows if str(r.get("target") or "").lower() == cell["target"] and str(r.get("hardwareTier") or r.get("deviceTier") or "unknown").lower() == cell["tier"] and _truthy_pass(r)]
        fps = [_f(r.get("avgFps", r.get("averageFps"))) for r in relevant]
        fps = [x for x in fps if x is not None and x > 0]
        if len(fps) >= 2:
            mean = statistics.mean(fps)
            cv = statistics.pstdev(fps) / mean if mean > 0 else 999.0
        else:
            cv = None
        cell["fpsCoefficientOfVariation"] = round(cv, 6) if cv is not None else None
        max_cv = float(p.get("maxFpsCv", 0.18))
        cell["repeatabilityPassed"] = cv is not None and cv <= max_cv
        if bool(p.get("requireRepeatability", True)) and cell.get("passed") and not cell["repeatabilityPassed"]:
            cell["passed"] = False
    if any(not c.get("passed") for c in result.get("matrix") or []):
        result["passed"] = False
        result["status"] = "INSUFFICIENT_LONGITUDINAL_EVIDENCE"
    return result


def discover_gpu_counter_tools_v9() -> dict:
    import shutil as _shutil
    names = ["nvidia-smi", "ncu", "nsys", "amd-smi", "rocprof", "rocprofv3", "intel_gpu_top", "xctrace"]
    found = {name: _shutil.which(name) for name in names}
    return {"schemaVersion": 9, "available": {k: v for k, v in found.items() if v}, "missing": [k for k, v in found.items() if not v]}


def validate_advanced_gpu_counters_v9(rows: list[dict], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    required_targets = [str(x).lower() for x in (p.get("requiredTargets") or [])]
    if not required_targets:
        required_targets = sorted({str(r.get("target") or "").lower() for r in rows or [] if str(r.get("target") or "").strip()})
    accepted_backends = {"ncu", "nsys", "nvidia-smi", "amd-smi", "rocprof", "rocprofv3", "intel_gpu_top", "xctrace", "godot", "webgl_timer_query"}
    checks, missing = [], []
    for target in required_targets:
        candidates = [r for r in rows or [] if str(r.get("target") or "").lower() == target]
        valid = []
        for r in candidates:
            nested = r.get("advancedGpuCounters") or {}
            measured = bool(nested.get("measured")) if nested else bool(r.get("executedInTarget"))
            source = str(nested.get("backend") or r.get("advancedCounterSource") or r.get("telemetrySource") or "").strip().lower()
            occupancy = _f(nested.get("shaderOccupancy", nested.get("shaderOccupancyPercent", r.get("shaderOccupancyPercent"))))
            bandwidth = _f(nested.get("dramThroughputGBs", nested.get("memoryBandwidthGBps", r.get("memoryBandwidthGBps"))))
            if measured and source in accepted_backends and (occupancy is not None or bandwidth is not None):
                valid.append({"occupancy": occupancy, "bandwidth": bandwidth, "source": source})
        ok = bool(valid)
        checks.append({"target": target, "passed": ok, "verifiedSamples": len(valid), "sources": sorted({v["source"] for v in valid})})
        if not ok:
            missing.append(target)
    required = bool(p.get("required", False))
    if required_targets and not missing:
        status = "VERIFIED"
    elif required:
        status = "UNVERIFIED"
    else:
        status = "OPTIONAL_UNVERIFIED"
    return {
        "schemaVersion": 9, "status": status, "passed": status == "VERIFIED" or not required,
        "checks": checks, "missingTargets": missing, "required": required,
        "rule": "Advanced counters are accepted only when a real vendor/engine profiler says they were measured; estimated/synthetic backends are rejected."
    }


def device_farm_plan_v9(scene_url: str, policy: dict | None = None) -> dict:
    p = dict(policy or {})
    targets = ["web", "godot", "roblox"]
    tiers = [str(x).lower() for x in (p.get("tiers") or ["low", "mid", "high"])]
    cells = [{"target": target, "hardwareTier": tier, "sceneUrl": scene_url or None} for target in targets for tier in tiers]
    configured = bool(os.environ.get("AI3D_DEVICE_FARM_COMMAND", "").strip())
    return {"schemaVersion": 9, "status": "READY" if configured else "READY_IF_PROVIDER_CONFIGURED", "providerCommandConfigured": configured, "cells": cells, "resultContract": ["providerExecutionId", "executedInTarget", "deviceId", "sessionId", "sampleCount", "avgFps", "p95FrameMs"]}


def validate_roblox_studio_automation_v9(data: dict, policy: dict | None = None) -> dict:
    """Compatibility wrapper plus strict V9 Studio evidence validation.

    Older V9 runners emit an `automation` block and V8-style placeChecks. New V9
    runners additionally emit studioVersion/run id and rebind checks. Both are accepted
    only when the place-side checks themselves pass; a numeric asset id is never enough.
    """
    p = dict(policy or {})
    automation = data.get("automation") or {}
    runner_ok = (
        automation.get("studioLaunched") is True and automation.get("commandVerified") is True
        and automation.get("resultCaptured") is True and str(automation.get("marker") or "") == "[AI3D_V9_ROBLOX_VERIFY]"
    )
    # Strong/new evidence path.
    if data.get("studioVersion") or data.get("verificationRunId") or (data.get("placeChecks") or {}).get("assetIdsRebound") is not None:
        strict = validate_roblox_studio_bridge_v9(data, {
            "requirePbrBindings": bool(p.get("requirePbrBindings", True)),
            "requirePublishedPlace": bool(p.get("requirePublishedPlace", True)),
            "requireRebindEvidence": bool(p.get("requireRebindEvidence", True)),
        })
        require_runner = bool(p.get("requireAutomationRunner", True))
        if strict.get("passed") and runner_ok:
            return {**strict, "automationVerified": True}
        if strict.get("passed") and require_runner and not runner_ok:
            failures = sorted(set(list(strict.get("failedChecks") or []) + ["automationRunnerEvidence"]))
            return {**strict, "status": "UNVERIFIED", "passed": False, "automationVerified": False, "failedChecks": failures, "rule": "V9 automated Roblox verification requires both valid place-side checks and captured automation-runner evidence."}
        return {**strict, "automationVerified": runner_ok}
    # Compatibility evidence path: still requires actual Studio execution + V8 place checks + runner marker.
    base = validate_roblox_place_runtime(data, {"requirePbrBindings": bool(p.get("requirePbrBindings", True))})
    failures = list(base.get("failedChecks") or [])
    if not runner_ok:
        failures.append("automationRunnerEvidence")
    status = "VERIFIED" if base.get("passed") and runner_ok else "UNVERIFIED"
    return {**base, "schemaVersion": 9, "status": status, "passed": status == "VERIFIED", "automationVerified": runner_ok, "failedChecks": sorted(set(failures)), "rule": "V9 requires real Studio/place checks and captured runner evidence; upload success alone never passes."}


def pvs_removal_candidates_v9(pvs: dict, samples: list[dict], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    min_sessions = max(10, int(p.get("minSessions", 30)))
    min_observations = max(100, int(p.get("minObservations", 500)))
    min_cells = max(5, int(p.get("minCameraCells", 12)))
    base = {str(k): set(map(str, v)) for k, v in (pvs.get("sets") or {}).items()}
    seen: dict[tuple[str, str], dict[str, Any]] = {}
    room_observations: dict[str, int] = defaultdict(int)
    room_sessions: dict[str, set[str]] = defaultdict(set)
    room_cells: dict[str, set[str]] = defaultdict(set)
    for sample in samples or []:
        room = str(sample.get("room") or "")
        if not room: continue
        session = str(sample.get("sessionId") or "unknown")
        cell = str(sample.get("cameraCell") or "unknown")
        room_observations[room] += 1; room_sessions[room].add(session); room_cells[room].add(cell)
        for vis in sample.get("visibleRooms") or []:
            key = (room, str(vis)); row = seen.setdefault(key, {"count": 0, "sessions": set(), "cells": set()})
            row["count"] += 1; row["sessions"].add(session); row["cells"].add(cell)
    candidates = []
    for room, visible in base.items():
        enough_context = room_observations[room] >= min_observations and len(room_sessions[room]) >= min_sessions and len(room_cells[room]) >= min_cells
        if not enough_context: continue
        for vis in sorted(visible - {room}):
            evidence = seen.get((room, vis))
            if not evidence or evidence["count"] == 0:
                candidates.append({"room": room, "visibleRoom": vis, "observations": room_observations[room], "sessions": len(room_sessions[room]), "cameraCells": len(room_cells[room]), "status": "MANUAL_REVIEW_CANDIDATE_ONLY"})
    return {"schemaVersion": 9, "status": "CANDIDATES_FOUND" if candidates else "NO_SAFE_CANDIDATES", "candidates": candidates, "autoRemovalsApplied": 0, "rule": "Even after strong absence evidence, V9 only emits removal candidates. Automatic PVS removals remain forbidden because unseen paths and dynamic portal states can invalidate absence conclusions."}

def production_readiness_gate_v9(*args, **kwargs) -> dict:
    """V9 production readiness with compatibility for the original 7-argument V9 API.

    New calls use the strict evidence layers. Older verifier calls are preserved so Desktop AI
    upgrades do not break, but legacy calls can only claim target-runtime verification, never
    longitudinal fleet verification.
    """
    if kwargs or len(args) >= 9:
        return _production_readiness_gate_v9_strict(*args, **kwargs)
    if len(args) == 7:
        static_gates, runtime, gpu_timing, fleet, advanced, roblox, policy = args
        p = dict(policy or {})
        failed_static = [k for k, v in (static_gates or {}).items() if v is False]
        runtime_status = str((runtime or {}).get("status", "UNVERIFIED"))
        gpu_status = str((gpu_timing or {}).get("status", "UNVERIFIED"))
        adv_status = str((advanced or {}).get("status", "OPTIONAL_UNVERIFIED"))
        fleet_status = str((fleet or {}).get("status", "INCOMPLETE"))
        if failed_static or runtime_status == "FAILED" or gpu_status == "FAILED" or adv_status == "FAILED":
            status = "REJECTED"
        elif p.get("requireRuntimeEvidence", True) and runtime_status != "VERIFIED":
            status = "CANDIDATE_RUNTIME_UNVERIFIED"
        elif p.get("requireNativeGpuTiming", True) and gpu_status != "VERIFIED":
            status = "CANDIDATE_GPU_TIMING_UNVERIFIED"
        elif p.get("requireAdvancedGpuCounters", False) and adv_status != "VERIFIED":
            status = "CANDIDATE_ADVANCED_GPU_COUNTERS_UNVERIFIED"
        elif p.get("requireRobloxAutomation", False) and str((roblox or {}).get("status", "UNVERIFIED")) != "VERIFIED":
            status = "CANDIDATE_ROBLOX_STUDIO_UNVERIFIED"
        elif p.get("requireFleetEvidence", True) and fleet_status not in {"VERIFIED", "VERIFIED_LONGITUDINAL", "VERIFIED_FLEET"}:
            status = "VERIFIED_TARGET_RUNTIME_FLEET_INCOMPLETE"
        else:
            status = "VERIFIED_FLEET"
        passed = status in {"VERIFIED_TARGET_RUNTIME_FLEET_INCOMPLETE", "VERIFIED_FLEET"}
        return {
            "schemaVersion": 9, "status": status, "passed": passed, "fleetVerified": status == "VERIFIED_FLEET",
            "failedStaticGates": failed_static,
            "statuses": {"runtime": runtime_status, "gpuTiming": gpu_status, "fleet": fleet_status, "advancedGpu": adv_status, "robloxStudio": str((roblox or {}).get("status", "UNVERIFIED"))},
            "compatibilityMode": "v9-original-seven-argument",
            "rule": "Legacy V9 calls remain supported but cannot claim longitudinal fleet verification without the strict V9 evidence layers.",
        }
    raise TypeError("production_readiness_gate_v9 expects either the legacy 7-argument V9 API or the strict V9 evidence API")

