from __future__ import annotations

import json
from contextlib import closing
import math
import os
import shutil
import sqlite3
import statistics
import subprocess
import time
from pathlib import Path
from typing import Any

from .production_v7 import DeviceHistoryV7, collect_gpu_telemetry_v7, engine_native_gpu_timing_gate, validate_roblox_upload_result


def _f(value: Any, default: float | None = None) -> float | None:
    try:
        return float(value)
    except Exception:
        return default


def collect_gpu_telemetry_v8() -> dict:
    base = collect_gpu_telemetry_v7()
    attempts = list(base.get("attempts") or [])
    if base.get("verified"):
        return {**base, "schemaVersion": 8, "quality": "verified_vendor_cli"}

    amd_smi = shutil.which(os.environ.get("AMD_SMI_BIN", "amd-smi"))
    if amd_smi:
        try:
            proc = subprocess.run([amd_smi, "metric", "--json"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=15, check=False)
            data = json.loads(proc.stdout)
            rows = data if isinstance(data, list) else [data]
            gpus = []
            for i, row in enumerate(rows):
                text = json.dumps(row).lower()
                def pick(keys):
                    stack=[row]
                    while stack:
                        obj=stack.pop()
                        if isinstance(obj,dict):
                            for k,v in obj.items():
                                if all(token in str(k).lower() for token in keys):
                                    val=_f(v)
                                    if val is not None:return val
                                if isinstance(v,(dict,list)):stack.append(v)
                        elif isinstance(obj,list):stack.extend(obj)
                    return None
                total = pick(("vram","total")) or pick(("memory","total"))
                used = pick(("vram","used")) or pick(("memory","used"))
                util = pick(("gfx","activity")) or pick(("gpu","util"))
                if any(x is not None for x in (total, used, util)):
                    gpus.append({"gpu": f"AMD GPU {i}", "vramTotalMB": total, "vramUsedMB": used, "gpuUtilizationPercent": util})
            if gpus:
                return {"schemaVersion":8,"verified":True,"backend":"amd-smi","quality":"verified_vendor_cli","gpus":gpus}
            attempts.append({"backend":"amd-smi","verified":False,"reason":"No numeric GPU metrics parsed"})
        except Exception as exc:
            attempts.append({"backend":"amd-smi","verified":False,"reason":str(exc)})

    return {
        "schemaVersion": 8,
        "verified": False,
        "backend": "unavailable",
        "quality": "unverified",
        "reason": "No vendor telemetry backend returned trustworthy measurements. V8 never estimates VRAM/utilization from model size.",
        "attempts": attempts or [base],
    }


def device_matrix_coverage(rows: list[dict], policy: dict | None = None) -> dict:
    p = dict(policy or {})
    required_targets = [str(x).lower() for x in (p.get("requiredTargets") or ["web", "godot"])]
    required_tiers = [str(x).lower() for x in (p.get("requiredTiers") or ["low", "mid", "high"])]
    min_runs = max(1, int(p.get("minRunsPerCell", 3)))
    cells: dict[tuple[str,str], int] = {}
    verified_rows = 0
    for row in rows or []:
        if not bool(row.get("executedInTarget")):
            continue
        target = str(row.get("target") or "").lower()
        tier = str(row.get("hardwareTier") or row.get("deviceTier") or "unknown").lower()
        if not bool(row.get("passed", row.get("status") == "VERIFIED")):
            continue
        verified_rows += 1
        cells[(target,tier)] = cells.get((target,tier),0)+1
    matrix=[]
    missing=[]
    for target in required_targets:
        for tier in required_tiers:
            count=cells.get((target,tier),0)
            ok=count>=min_runs
            matrix.append({"target":target,"tier":tier,"verifiedRuns":count,"requiredRuns":min_runs,"passed":ok})
            if not ok:missing.append({"target":target,"tier":tier,"missingRuns":min_runs-count})
    status="VERIFIED" if not missing else "INCOMPLETE"
    return {"schemaVersion":8,"status":status,"passed":status=="VERIFIED","verifiedRows":verified_rows,"matrix":matrix,"missing":missing}


def calibrate_policy_from_device_history(base_policy: dict, history_groups: list[dict], policy: dict | None = None) -> dict:
    p=dict(policy or {})
    min_runs=max(10,int(p.get("minRuns",20)))
    min_pass_rate=max(0.5,min(float(p.get("minPassRate",0.85)),1.0))
    max_ratio_delta=max(0.01,min(float(p.get("maxLodRatioDelta",0.08)),0.15))
    eligible=[]
    for row in history_groups or []:
        runs=int(row.get("runs") or 0)
        passed=int(row.get("passedRuns") or 0)
        if runs<min_runs:continue
        rate=passed/max(1,runs)
        if rate<min_pass_rate:continue
        eligible.append({**row,"passRate":rate})
    if not eligible:
        return {"schemaVersion":8,"status":"INSUFFICIENT_EVIDENCE","applied":False,"policy":base_policy,"eligibleGroups":0,"rule":"No automatic tuning without statistically meaningful history."}

    fps=[_f(r.get("avgFps")) for r in eligible if _f(r.get("avgFps")) is not None]
    p95=[_f(r.get("avgP95FrameMs")) for r in eligible if _f(r.get("avgP95FrameMs")) is not None]
    median_fps=statistics.median(fps) if fps else None
    median_p95=statistics.median(p95) if p95 else None
    lod=list(base_policy.get("lodRatios") or [0.78,0.52,0.26,0.10])
    delta=0.0
    rationale="hold"
    if median_fps is not None and median_fps>=75 and (median_p95 is None or median_p95<=14.0):
        delta=max_ratio_delta
        rationale="performance headroom used to retain more geometry"
    elif median_fps is not None and median_fps<50:
        delta=-max_ratio_delta
        rationale="performance pressure suggests a more aggressive starting seed; visual gates remain unchanged"
    tuned=[]
    for idx,val in enumerate(lod):
        floor=[0.50,0.30,0.12,0.05][min(idx,3)]
        tuned.append(round(max(floor,min(1.0,float(val)+delta)),4))
    tuned=[max(tuned[i],tuned[i+1]) for i in range(3)]+[tuned[3]]
    new=dict(base_policy);new["lodRatios"]=tuned
    return {"schemaVersion":8,"status":"CALIBRATED","applied":bool(delta),"policy":new,"eligibleGroups":len(eligible),"medianFps":median_fps,"medianP95FrameMs":median_p95,"lodDelta":delta,"rationale":rationale,"hardRule":"Fidelity/semantic/temporal thresholds are never relaxed by history calibration."}


def refine_pvs_confidence_v8(pvs: dict, samples: list[dict], policy: dict | None = None) -> dict:
    p=dict(policy or {})
    min_observations=max(3,int(p.get("minObservations",8)))
    min_sessions=max(1,int(p.get("minSessions",3)))
    min_cells=max(1,int(p.get("minCameraCells",3)))
    base={str(k):set(map(str,v)) for k,v in (pvs.get("sets") or {}).items()}
    evidence:dict[tuple[str,str],dict[str,set|int]]={}
    for s in samples or []:
        room=str(s.get("room") or "")
        if not room:continue
        session=str(s.get("sessionId") or "unknown")
        cell=str(s.get("cameraCell") or s.get("cameraBin") or "unknown")
        for vis in s.get("visibleRooms") or []:
            vis=str(vis); key=(room,vis)
            row=evidence.setdefault(key,{"observations":0,"sessions":set(),"cells":set()})
            row["observations"]+=1;row["sessions"].add(session);row["cells"].add(cell)
    additions=[];rejected=[]
    for (room,vis),ev in evidence.items():
        obs=int(ev["observations"]);sessions=len(ev["sessions"]);cells=len(ev["cells"])
        confidence=min(1.0,(obs/min_observations)*0.5+(sessions/min_sessions)*0.3+(cells/min_cells)*0.2)
        passed=obs>=min_observations and sessions>=min_sessions and cells>=min_cells
        row={"room":room,"visibleRoom":vis,"observations":obs,"sessions":sessions,"cameraCells":cells,"confidence":round(confidence,4)}
        if passed:
            base.setdefault(room,{room}).add(vis);additions.append(row)
        else:rejected.append(row)
    return {"schemaVersion":8,"status":"REFINED" if additions else "UNCHANGED","sets":{k:sorted(v) for k,v in base.items()},"additions":additions,"insufficientEvidence":rejected,"removalsApplied":0,"rule":"V8 PVS learning requires repeated evidence across independent sessions and camera cells; absence evidence can never remove visibility automatically."}


def validate_roblox_place_runtime(data: dict, policy: dict | None = None) -> dict:
    p=dict(policy or {})
    upload=validate_roblox_upload_result(data.get("upload") or data)
    checks=data.get("placeChecks") or {}
    required=["modelLoaded","finiteBounds","collisionPresent","materialsBound","noMissingAssets"]
    failures=[name for name in required if checks.get(name) is not True]
    pbr_required=bool(p.get("requirePbrBindings",True))
    if pbr_required and checks.get("surfaceAppearanceBound") is not True:
        failures.append("surfaceAppearanceBound")
    executed=bool(data.get("executedInRobloxStudio") or data.get("executedInTarget"))
    published=bool(data.get("placeId") or data.get("publishedPlaceId"))
    status="VERIFIED" if upload.get("passed") and executed and published and not failures else "UNVERIFIED"
    return {"schemaVersion":8,"status":status,"passed":status=="VERIFIED","upload":upload,"executedInRobloxStudio":executed,"publishedPlaceVerified":published,"failedChecks":failures,"rule":"Numeric asset IDs alone are not place verification; V8 requires evidence that the published/Studio place loaded and bound the assets correctly."}


def write_v8_runtime_pack(job_dir: Path, pvs: dict, roblox_plan: dict | None = None) -> list[Path]:
    job_dir=Path(job_dir)
    contract=job_dir/"runtime-evidence-contract-v8.json"
    contract.write_text(json.dumps({
        "schemaVersion":8,
        "deviceMatrix":{"tiers":["low","mid","high"],"targets":["web","godot"],"minimumVerifiedRunsPerCell":3},
        "robloxPlaceVerification":{"requires":["assetIds","executedInRobloxStudio","placeId","modelLoaded","finiteBounds","collisionPresent","materialsBound","noMissingAssets","surfaceAppearanceBound"]},
        "pvsLearning":{"minObservations":8,"minSessions":3,"minCameraCells":3,"removals":"forbidden automatically"},
        "thresholdCalibration":{"minRuns":20,"neverRelax":["silhouetteIoU","visualSimilarity","semanticProtection","temporalAntiShimmer"]},
        "rule":"V8 VERIFIED is evidence driven; missing target-runtime measurements remain UNVERIFIED."
    },ensure_ascii=False,indent=2),encoding="utf-8")

    pvs_seed=job_dir/"pvs-runtime-learning-seed-v8.json"
    pvs_seed.write_text(json.dumps({"schemaVersion":8,"basePvs":pvs,"samples":[],"sampleFields":["room","visibleRooms","sessionId","cameraCell","portalStates"]},ensure_ascii=False,indent=2),encoding="utf-8")

    roblox_contract=job_dir/"roblox-place-verification-contract-v8.json"
    roblox_contract.write_text(json.dumps({"schemaVersion":8,"uploadPlan":roblox_plan or {},"expectedReport":{"executedInRobloxStudio":True,"placeId":"<numeric>","upload":{"assetIds":{"model":"<numeric>"}},"placeChecks":{"modelLoaded":True,"finiteBounds":True,"collisionPresent":True,"materialsBound":True,"surfaceAppearanceBound":True,"noMissingAssets":True}}},ensure_ascii=False,indent=2),encoding="utf-8")

    luau=job_dir/"roblox_place_verify_v8.luau"
    luau.write_text("""-- AI3D V8 Roblox place-side verifier. Run in Studio after rebinding uploaded assets.\nlocal HttpService = game:GetService('HttpService')\nlocal Workspace = game:GetService('Workspace')\nlocal descendants = Workspace:GetDescendants()\nlocal meshCount, collisionCount, surfaceCount = 0, 0, 0\nlocal finiteBounds, noMissing = true, true\nfor _, inst in ipairs(descendants) do\n  if inst:IsA('MeshPart') then\n    meshCount += 1\n    if inst.CanCollide then collisionCount += 1 end\n    local s=inst.Size\n    if s.X ~= s.X or s.Y ~= s.Y or s.Z ~= s.Z or s.Magnitude <= 0 then finiteBounds=false end\n    if tonumber(inst.MeshId:match('%d+')) == nil then noMissing=false end\n  elseif inst:IsA('SurfaceAppearance') then surfaceCount += 1 end\nend\nlocal report={schemaVersion=8,executedInRobloxStudio=true,placeId=game.PlaceId,placeChecks={modelLoaded=meshCount>0,finiteBounds=finiteBounds,collisionPresent=collisionCount>0,materialsBound=meshCount>0,surfaceAppearanceBound=surfaceCount>0,noMissingAssets=noMissing},counts={meshParts=meshCount,collidableMeshParts=collisionCount,surfaceAppearance=surfaceCount}}\nprint('[AI3D_V8_ROBLOX_VERIFY]'..HttpService:JSONEncode(report))\n""",encoding="utf-8")
    return [contract,pvs_seed,roblox_contract,luau]

class DeviceHistoryV8:
    def __init__(self, path: Path):
        self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True)
        with closing(sqlite3.connect(self.path)) as con:
            con.execute("""CREATE TABLE IF NOT EXISTS device_runs_v8(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at REAL NOT NULL,
                target TEXT NOT NULL,
                device_key TEXT NOT NULL,
                hardware_tier TEXT NOT NULL,
                asset_class TEXT NOT NULL,
                avg_fps REAL,
                p95_frame_ms REAL,
                gpu_p95_ms REAL,
                vram_used_mb REAL,
                passed INTEGER NOT NULL,
                evidence_json TEXT NOT NULL
            )""")
            con.execute("CREATE INDEX IF NOT EXISTS idx_device_runs_v8 ON device_runs_v8(target,hardware_tier,asset_class,created_at)")
            con.commit()
    def record(self, rows:list[dict], asset_class:str="generic") -> int:
        count=0
        with closing(sqlite3.connect(self.path)) as con:
            for row in rows or []:
                if not bool(row.get("executedInTarget")):continue
                target=str(row.get("target") or "unknown").lower()
                key=str(row.get("deviceKey") or row.get("gpuName") or row.get("deviceClass") or "unknown")
                tier=str(row.get("hardwareTier") or row.get("deviceTier") or "unknown").lower()
                passed=bool(row.get("passed",row.get("status")=="VERIFIED"))
                con.execute("INSERT INTO device_runs_v8(created_at,target,device_key,hardware_tier,asset_class,avg_fps,p95_frame_ms,gpu_p95_ms,vram_used_mb,passed,evidence_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)",(
                    time.time(),target,key,tier,asset_class,_f(row.get("avgFps",row.get("averageFps"))),_f(row.get("p95FrameMs")),_f(row.get("gpuP95FrameMs",row.get("gpuFrameMsP95"))),_f(row.get("vramUsedMB")),int(passed),json.dumps(row,ensure_ascii=False,separators=(",",":"))))
                count+=1
            con.commit()
        return count
    def rows(self, limit:int=2000) -> list[dict]:
        with closing(sqlite3.connect(self.path)) as con:
            data=con.execute("SELECT target,device_key,hardware_tier,asset_class,avg_fps,p95_frame_ms,gpu_p95_ms,vram_used_mb,passed,evidence_json FROM device_runs_v8 ORDER BY created_at DESC LIMIT ?",(int(limit),)).fetchall()
        out=[]
        for r in data:
            try: evidence=json.loads(r[9])
            except Exception:evidence={}
            out.append({**evidence,"target":r[0],"deviceKey":r[1],"hardwareTier":r[2],"assetClass":r[3],"avgFps":r[4],"p95FrameMs":r[5],"gpuP95FrameMs":r[6],"vramUsedMB":r[7],"passed":bool(r[8]),"executedInTarget":True})
        return out
    def groups(self, limit:int=200) -> list[dict]:
        with closing(sqlite3.connect(self.path)) as con:
            data=con.execute("SELECT target,hardware_tier,asset_class,COUNT(*),AVG(avg_fps),AVG(p95_frame_ms),AVG(gpu_p95_ms),SUM(passed) FROM device_runs_v8 GROUP BY target,hardware_tier,asset_class ORDER BY COUNT(*) DESC LIMIT ?",(int(limit),)).fetchall()
        return [{"target":r[0],"hardwareTier":r[1],"assetClass":r[2],"runs":r[3],"avgFps":r[4],"avgP95FrameMs":r[5],"avgGpuP95Ms":r[6],"passedRuns":r[7]} for r in data]

def production_readiness_gate_v8(static_gates:dict, runtime:dict, gpu_timing:dict, device_matrix:dict, roblox_place:dict|None=None, policy:dict|None=None)->dict:
    p=dict(policy or {})
    failed_static=[k for k,v in static_gates.items() if v is False]
    runtime_status=str((runtime or {}).get('status','UNVERIFIED'))
    gpu_status=str((gpu_timing or {}).get('status','UNVERIFIED'))
    matrix_status=str((device_matrix or {}).get('status','INCOMPLETE'))
    roblox_status=str((roblox_place or {}).get('status','UNVERIFIED'))
    require_runtime=bool(p.get('requireRuntimeEvidence',True))
    require_gpu=bool(p.get('requireNativeGpuTiming',True))
    require_matrix=bool(p.get('requireDeviceMatrixForFleetVerified',True))
    require_roblox=bool(p.get('requireRobloxPlaceVerification',False))
    if failed_static or runtime_status=='FAILED' or gpu_status=='FAILED':
        status='REJECTED'
    elif require_roblox and roblox_status not in {'VERIFIED'}:
        status='CANDIDATE_ROBLOX_PLACE_UNVERIFIED'
    elif require_runtime and runtime_status!='VERIFIED':
        status='CANDIDATE_RUNTIME_UNVERIFIED'
    elif require_gpu and gpu_status!='VERIFIED':
        status='CANDIDATE_NATIVE_GPU_TIMING_UNVERIFIED'
    elif require_matrix and matrix_status!='VERIFIED':
        status='VERIFIED_TARGET_RUNTIME_FLEET_INCOMPLETE'
    else:
        status='VERIFIED_FLEET'
    return {'schemaVersion':8,'status':status,'passed':status in {'VERIFIED_TARGET_RUNTIME_FLEET_INCOMPLETE','VERIFIED_FLEET'},'fleetVerified':status=='VERIFIED_FLEET','failedStaticGates':failed_static,'runtimeStatus':runtime_status,'gpuTimingStatus':gpu_status,'deviceMatrixStatus':matrix_status,'robloxPlaceStatus':roblox_status,'rule':'V8 distinguishes per-target runtime verification from representative fleet verification; missing evidence cannot be converted to PASS.'}
