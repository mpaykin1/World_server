from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
from typing import Callable


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(float(value), high))


def _name(row: dict) -> str:
    return str(row.get("name") or row.get("object") or "")


def build_portal_room_graph(object_bounds: list[dict] | None, cell_size: float = 8.0) -> dict:
    rows = list(object_bounds or [])
    if not rows:
        return {"schemaVersion": 5, "status": "SKIPPED_NO_BOUNDS", "rooms": [], "portals": []}
    room_tokens = ("room", "hall", "chamber", "corridor", "cellar", "attic", "interior", "комнат", "зал", "коридор", "подвал")
    portal_tokens = ("door", "gate", "arch", "portal", "window", "passage", "двер", "ворот", "арка", "проход", "окн")
    size = _clamp(cell_size, 2.0, 64.0)
    rooms: list[dict] = []
    portals: list[dict] = []
    for index, row in enumerate(rows):
        name = _name(row)
        low = name.lower()
        center = row.get("center") or [0.0, 0.0, 0.0]
        if len(center) != 3:
            center = [0.0, 0.0, 0.0]
        radius = max(float(row.get("radius", 0.0) or 0.0), 0.01)
        key = tuple(int(math.floor(float(v) / size)) for v in center)
        if any(token in low for token in room_tokens):
            rid = f"room-{len(rooms):04d}"
            rooms.append({"id": rid, "name": name or rid, "center": [round(float(v), 4) for v in center], "radius": round(radius, 4), "cell": list(key)})
        if any(token in low for token in portal_tokens):
            portals.append({"id": f"portal-{len(portals):04d}", "name": name or f"portal-{index}", "center": [round(float(v), 4) for v in center], "radius": round(radius, 4), "cell": list(key)})

    if not rooms:
        occupied: dict[tuple[int, int, int], list[dict]] = {}
        for row in rows:
            center = row.get("center") or [0.0, 0.0, 0.0]
            if len(center) != 3:
                continue
            key = tuple(int(math.floor(float(v) / size)) for v in center)
            occupied.setdefault(key, []).append(row)
        for key in sorted(occupied):
            centers = [r.get("center") or [0.0, 0.0, 0.0] for r in occupied[key]]
            center = [sum(float(v[i]) for v in centers) / max(len(centers), 1) for i in range(3)]
            radius = max([float(r.get("radius", 0.0) or 0.0) for r in occupied[key]] or [1.0])
            rooms.append({"id": f"cell-room-{len(rooms):04d}", "name": "spatial-cell", "center": [round(x, 4) for x in center], "radius": round(radius, 4), "cell": list(key), "inferred": True})

    def dist(a: list[float], b: list[float]) -> float:
        return math.sqrt(sum((float(a[i]) - float(b[i])) ** 2 for i in range(3)))

    edges: list[dict] = []
    for portal in portals:
        candidates = sorted(((dist(portal["center"], room["center"]), room) for room in rooms), key=lambda x: x[0])[:2]
        if len(candidates) == 2:
            max_link = max(size * 2.2, portal["radius"] * 6.0)
            if candidates[0][0] <= max_link and candidates[1][0] <= max_link:
                edges.append({"portal": portal["id"], "rooms": [candidates[0][1]["id"], candidates[1][1]["id"]], "distances": [round(candidates[0][0], 4), round(candidates[1][0], 4)]})

    if not edges:
        by_cell = {tuple(r["cell"]): r for r in rooms}
        seen = set()
        for key, room in by_cell.items():
            for delta in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
                other_key = tuple(key[i] + delta[i] for i in range(3))
                other = by_cell.get(other_key)
                if not other:
                    continue
                pair = tuple(sorted((room["id"], other["id"])))
                if pair in seen:
                    continue
                seen.add(pair)
                edges.append({"portal": None, "rooms": list(pair), "inferred": True})

    return {
        "schemaVersion": 5,
        "status": "CREATED",
        "roomCount": len(rooms),
        "portalCount": len(portals),
        "edgeCount": len(edges),
        "rooms": rooms,
        "portals": portals,
        "edges": edges,
        "authoritativeness": "HINT_ONLY",
        "rule": "Do not hide geometry solely from this graph without engine-native visibility validation.",
    }


def optional_semantic_model_status() -> dict:
    model = os.environ.get("AI3D_SEMANTIC_MODEL")
    if not model:
        return {"available": False, "backend": "heuristic_geometry_bone_material", "reason": "AI3D_SEMANTIC_MODEL not configured"}
    path = Path(model)
    if not path.is_file():
        return {"available": False, "backend": "heuristic_geometry_bone_material", "reason": "configured semantic model file missing", "configuredPath": str(path)}
    try:
        import onnxruntime  # noqa: F401
    except Exception:
        return {"available": False, "backend": "heuristic_geometry_bone_material", "reason": "onnxruntime unavailable", "configuredPath": str(path)}
    h = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"available": True, "backend": "onnxruntime_optional_semantic_labels", "model": path.name, "sha256": h}


def lod_transition_gate(base_dir: Path, next_dir: Path, compare_pair: Callable, policy: dict | None = None) -> dict:
    p = dict(policy or {})
    sil_t = _clamp(p.get("silhouetteIoU", 0.965), 0.80, 1.0)
    vis_t = _clamp(p.get("visualSimilarity", 0.86), 0.65, 1.0)
    rows = []
    for base in sorted(Path(base_dir).glob("*.png")):
        candidate = Path(next_dir) / base.name
        if not candidate.is_file():
            continue
        metric = compare_pair(base, candidate)
        metric["view"] = base.stem
        rows.append(metric)
    if not rows:
        return {"passed": False, "status": "UNVERIFIED_NO_RENDER_PAIRS", "views": []}
    min_sil = min(float(r["silhouetteIoU"]) for r in rows)
    avg_vis = sum(float(r["visualSimilarity"]) for r in rows) / len(rows)
    passed = min_sil >= sil_t and avg_vis >= vis_t
    return {"passed": bool(passed), "status": "PASSED" if passed else "FAILED", "minSilhouetteIoU": round(min_sil, 6), "avgVisualSimilarity": round(avg_vis, 6), "thresholds": {"silhouetteIoU": sil_t, "visualSimilarity": vis_t}, "views": rows, "purpose": "detect visible popping between adjacent LODs before runtime"}


def hardware_tier_policy(profile: dict | None = None) -> dict:
    p = dict(profile or {})
    vram = float(p.get("vramGB", 0.0) or 0.0)
    avg_fps = float(p.get("averageFps", 0.0) or 0.0)
    mobile = bool(p.get("mobile", False))
    if mobile or (vram and vram < 4.0) or (avg_fps and avg_fps < 40.0):
        tier = "low"
        settings = {"lodBias": 0.72, "textureMax": 1024, "shadowTier": 1, "giTier": 0, "aoTier": 1, "parallax": False, "impostorBias": 0.78}
    elif (vram and vram < 8.0) or (avg_fps and avg_fps < 75.0):
        tier = "medium"
        settings = {"lodBias": 0.9, "textureMax": 2048, "shadowTier": 2, "giTier": 1, "aoTier": 2, "parallax": False, "impostorBias": 0.92}
    elif vram >= 12.0 or avg_fps >= 120.0:
        tier = "ultra"
        settings = {"lodBias": 1.18, "textureMax": 4096, "shadowTier": 4, "giTier": 3, "aoTier": 3, "parallax": True, "impostorBias": 1.25}
    else:
        tier = "high"
        settings = {"lodBias": 1.0, "textureMax": 4096, "shadowTier": 3, "giTier": 2, "aoTier": 3, "parallax": True, "impostorBias": 1.08}
    return {"schemaVersion": 5, "tier": tier, "inputProfile": p, "settings": settings, "rule": "Adaptive policy changes runtime budgets, never the immutable HQ source."}


def aggregate_runtime_benchmarks(rows: list[dict], policy: dict | None = None) -> dict:
    policy = dict(policy or {})
    target_policy = {"godot": {"minAverageFps": 60.0, "maxP95FrameMs": 22.0}, "web": {"minAverageFps": 60.0, "maxP95FrameMs": 22.0}, "roblox": {"minAverageFps": 30.0, "maxP95FrameMs": 38.0}}
    target_policy.update(policy.get("targets") or {})
    results = []
    verified = []
    for row in rows:
        target = str(row.get("target") or "").lower()
        if target not in target_policy:
            continue
        fps = float(row.get("avgFps", row.get("averageFps", 0.0)) or 0.0)
        p95 = float(row.get("p95FrameMs", 999.0) or 999.0)
        executed = bool(row.get("executedInTarget", False))
        limits = target_policy[target]
        passed = executed and fps >= float(limits["minAverageFps"]) and p95 <= float(limits["maxP95FrameMs"])
        result = {"target": target, "executedInTarget": executed, "avgFps": round(fps, 3), "p95FrameMs": round(p95, 3), "thresholds": limits, "passed": bool(passed)}
        if row.get("gpu") is not None:
            result["gpu"] = row.get("gpu")
        if row.get("vramGB") is not None:
            result["vramGB"] = row.get("vramGB")
        results.append(result)
        if executed:
            verified.append(target)
    required = set(policy.get("requiredTargets") or [])
    required_ok = all(any(r["target"] == target and r["passed"] for r in results) for target in required)
    executed_results = [r for r in results if r["executedInTarget"]]
    if any(not r["passed"] for r in executed_results):
        status = "FAILED"
    elif executed_results and required_ok:
        status = "VERIFIED"
    else:
        status = "UNVERIFIED"
    return {"schemaVersion": 5, "status": status, "passed": bool(status == "VERIFIED"), "verifiedTargets": sorted(set(verified)), "requiredTargets": sorted(required), "results": results}


def pbr_family_audit(atlas_manifest: dict | None, max_uv_stretch_ratio: float = 35.0) -> dict:
    atlas = dict(atlas_manifest or {})
    families = atlas.get("families") or []
    if atlas.get("status") not in {"CREATED", "PARTIAL"}:
        return {"passed": True, "status": "NOT_APPLIED", "families": []}
    rows = []
    all_passed = True
    for family in families:
        if family.get("status") != "CREATED":
            continue
        uv = family.get("uvAudit") or {}
        ratio = float(uv.get("p95OverP05", 1.0) or 1.0)
        textures = family.get("textures") or {}
        required = ["albedo", "roughness", "normal", "ao"]
        channels_ok = all(bool(textures.get(key)) for key in required)
        special = str(family.get("family") or "dielectric")
        if special == "metal":
            channels_ok = channels_ok and bool(textures.get("metallic"))
        if special == "emissive":
            channels_ok = channels_ok and bool(textures.get("emission")) and bool(textures.get("emission_strength"))
        if special == "transmissive":
            channels_ok = channels_ok and bool(textures.get("alpha")) and bool(textures.get("transmission"))
        passed = channels_ok and ratio <= float(max_uv_stretch_ratio)
        rows.append({"family": special, "passed": passed, "uvP95OverP05": round(ratio, 5), "channels": sorted(k for k, v in textures.items() if v)})
        all_passed = all_passed and passed
    return {"passed": bool(all_passed), "status": "PASSED" if all_passed else "FAILED", "families": rows, "maxUvStretchRatio": float(max_uv_stretch_ratio)}


def write_v5_engine_pack(job_dir: Path, atlas_manifest: dict, portal_graph: dict, hardware_policy: dict, semantic_status: dict) -> list[Path]:
    job_dir = Path(job_dir)
    manifest = job_dir / "production-bindings-v5.json"
    manifest.write_text(json.dumps({"schemaVersion": 5, "materialFamilies": atlas_manifest.get("families") or [], "portalGraph": "portal-occlusion-graph.json", "hardwareQualityPolicy": "hardware-quality-policy.json", "semanticModel": semantic_status, "rules": ["bind metalness/emission/alpha/transmission only when the generated family atlas contains that verified channel", "do not replace authored transparent/transmissive behavior with an opaque fallback", "engine-native visibility and runtime benchmark results remain authoritative"]}, ensure_ascii=False, indent=2), encoding="utf-8")

    assets = []
    for family in atlas_manifest.get("families") or []:
        for channel, filename in (family.get("textures") or {}).items():
            if filename:
                assets.append({"family": family.get("family"), "channel": channel, "file": filename, "assetId": None})
    roblox_manifest = job_dir / "roblox-pbr-upload-manifest-v5.json"
    roblox_manifest.write_text(json.dumps({"schemaVersion": 5, "assets": assets, "uploadStatus": "REQUIRES_AUTHORIZED_ROBLOX_UPLOAD_TOOL", "rule": "assetId must be filled by an authenticated uploader before rebinding"}, ensure_ascii=False, indent=2), encoding="utf-8")

    roblox = job_dir / "roblox_apply_quality_v5.luau"
    roblox.write_text('''local function applyQualityV5(root, bindings)\n    for _, inst in ipairs(root:GetDescendants()) do\n        if inst:IsA("MeshPart") then\n            local row = bindings[inst.Name]\n            if row then\n                local sa = inst:FindFirstChildOfClass("SurfaceAppearance") or Instance.new("SurfaceAppearance")\n                sa.Name = "AUTO_PBR_V5"\n                if row.ColorMap then sa.ColorMap = row.ColorMap end\n                if row.NormalMap then sa.NormalMap = row.NormalMap end\n                if row.RoughnessMap then sa.RoughnessMap = row.RoughnessMap end\n                if row.MetalnessMap then sa.MetalnessMap = row.MetalnessMap end\n                sa.Parent = inst\n            end\n        end\n    end\nend\nreturn applyQualityV5\n''', encoding="utf-8")

    godot = job_dir / "godot_apply_quality_v5.gd"
    godot.write_text('''extends Node\nfunc quality_settings(policy: Dictionary) -> Dictionary:\n    return policy.get("settings", {})\nfunc apply_visibility_hysteresis(root: Node, margin: float = 1.0) -> void:\n    for node in root.find_children("*", "GeometryInstance3D", true, false):\n        if node is GeometryInstance3D:\n            node.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF\n            node.visibility_range_fade_margin = margin\n''', encoding="utf-8")

    web = job_dir / "web_apply_quality_v5.js"
    web.write_text('''export function selectQualityV5(policy) { return policy?.settings ?? {}; }\nexport function applyPbrFamilyV5(material, maps = {}) {\n  if (maps.normalMap && !material.normalMap) material.normalMap = maps.normalMap;\n  if (maps.roughnessMap && !material.roughnessMap) material.roughnessMap = maps.roughnessMap;\n  if (maps.metalnessMap && !material.metalnessMap) material.metalnessMap = maps.metalnessMap;\n  if (maps.emissiveMap && !material.emissiveMap) material.emissiveMap = maps.emissiveMap;\n  if (maps.alphaMap && !material.alphaMap) material.alphaMap = maps.alphaMap;\n  material.needsUpdate = true;\n}\n''', encoding="utf-8")
    return [manifest, roblox_manifest, roblox, godot, web]


def write_benchmark_collector(job_dir: Path) -> list[Path]:
    job_dir = Path(job_dir)
    script = job_dir / "collect_runtime_benchmarks_v5.py"
    script.write_text('''from __future__ import annotations\nimport argparse, json\nfrom pathlib import Path\ndef main():\n    p=argparse.ArgumentParser(); p.add_argument("inputs", nargs="+"); p.add_argument("--output", default="runtime-benchmark-results-v5.json"); a=p.parse_args(); rows=[]\n    for item in a.inputs:\n        path=Path(item)\n        if not path.is_file(): continue\n        data=json.loads(path.read_text(encoding="utf-8"))\n        if isinstance(data, list): rows.extend(data)\n        elif isinstance(data, dict): rows.extend(data.get("rows", [data]))\n    Path(a.output).write_text(json.dumps({"schemaVersion":5,"rows":rows}, ensure_ascii=False, indent=2), encoding="utf-8")\n    print(a.output)\nif __name__ == "__main__": main()\n''', encoding="utf-8")
    spec = job_dir / "runtime-benchmark-policy-v5.json"
    spec.write_text(json.dumps({"schemaVersion": 5, "targets": {"godot": {"minAverageFps": 60, "maxP95FrameMs": 22}, "web": {"minAverageFps": 60, "maxP95FrameMs": 22}, "roblox": {"minAverageFps": 30, "maxP95FrameMs": 38}}, "rule": "Only a result marked executedInTarget=true may count as VERIFIED."}, ensure_ascii=False, indent=2), encoding="utf-8")
    return [script, spec]


def run_blender_finalizer_v5(blender: str, script: Path, input_glb: Path, output_dir: Path, config: dict) -> dict:
    import subprocess
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    config_path = output_dir / "finalize-v5-config.json"
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    log_path = output_dir / "finalize-v5-blender.log"
    cmd = [blender, "--background", "--factory-startup", "--python", str(script), "--", "--input", str(input_glb), "--output-dir", str(output_dir), "--config", str(config_path)]
    with log_path.open("w", encoding="utf-8", errors="replace") as log:
        proc = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, timeout=int(os.environ.get("AI3D_MESH_FINALIZE_TIMEOUT_SEC", "2400")), check=False)
    manifest = output_dir / "finalize-v5-manifest.json"
    if proc.returncode != 0 or not manifest.is_file():
        tail = log_path.read_text(encoding="utf-8", errors="replace")[-5000:] if log_path.is_file() else ""
        return {"status": "FAILED", "returnCode": proc.returncode, "logTail": tail}
    try:
        result = json.loads(manifest.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"status": "FAILED", "reason": f"manifest parse error: {exc}"}
    result["log"] = log_path.name
    return result


def write_runtime_benchmark_v5_pack(job_dir: Path, lod_plan: dict) -> list[Path]:
    job_dir = Path(job_dir)
    spec = job_dir / "runtime-benchmark-spec-v5.json"
    spec.write_text(json.dumps({
        "schemaVersion": 5,
        "warmupSeconds": 5,
        "sampleSeconds": 20,
        "targets": {
            "godot": {"minAverageFps": 60, "maxP95FrameMs": 22},
            "web": {"minAverageFps": 60, "maxP95FrameMs": 22},
            "roblox": {"minAverageFps": 30, "maxP95FrameMs": 38},
        },
        "lodPlan": lod_plan,
        "requiredOutputFields": ["target", "executedInTarget", "avgFps", "p95FrameMs"],
        "rule": "Do not hand-edit executedInTarget=true. It must be emitted by the target runtime harness.",
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    godot = job_dir / "godot_runtime_benchmark_v5.gd"
    godot.write_text('''extends Node\nvar samples: Array[float] = []\nvar elapsed := 0.0\nfunc _process(delta: float) -> void:\n    elapsed += delta\n    if elapsed >= 5.0: samples.append(delta * 1000.0)\n    if elapsed >= 25.0:\n        samples.sort()\n        var avg_ms := 0.0\n        for v in samples: avg_ms += v\n        avg_ms /= max(samples.size(), 1)\n        var p95_index := int(clamp(floor(samples.size() * 0.95), 0, max(samples.size() - 1, 0)))\n        var p95 := samples[p95_index] if samples.size() > 0 else 999.0\n        var gpu := RenderingServer.get_video_adapter_name()\n        print(JSON.stringify({"target":"godot","executedInTarget":true,"avgFps":1000.0/max(avg_ms,0.001),"p95FrameMs":p95,"samples":samples.size(),"gpu":gpu}))\n        get_tree().quit()\n''', encoding="utf-8")

    web = job_dir / "web_runtime_benchmark_v5.js"
    web.write_text('''export async function benchmarkV5({ seconds = 20, renderer = null } = {}) {\n  const frames = []; const start = performance.now(); let prev = start;\n  const gpu = (() => { try { const gl = renderer?.getContext?.(); return gl?.getParameter?.(gl.RENDERER) ?? null; } catch { return null; } })();\n  return await new Promise((resolve) => {\n    function tick(now) {\n      frames.push(now - prev); prev = now;\n      if (now - start < seconds * 1000) return requestAnimationFrame(tick);\n      const sorted = frames.slice().sort((a,b)=>a-b);\n      const avg = frames.reduce((a,b)=>a+b,0) / Math.max(frames.length,1);\n      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 999;\n      resolve({target:'web', executedInTarget:true, avgFps:1000/Math.max(avg,0.001), p95FrameMs:p95, frames:frames.length, gpu});\n    }\n    requestAnimationFrame(tick);\n  });\n}\n''', encoding="utf-8")

    roblox = job_dir / "roblox_runtime_benchmark_v5.luau"
    roblox.write_text('''local RunService = game:GetService("RunService")\nlocal HttpService = game:GetService("HttpService")\nlocal start = os.clock()\nlocal samples = {}\nlocal connection\nconnection = RunService.RenderStepped:Connect(function(dt)\n    local elapsed = os.clock() - start\n    if elapsed >= 5 then table.insert(samples, dt * 1000) end\n    if elapsed >= 25 then\n        connection:Disconnect(); table.sort(samples)\n        local total = 0\n        for _, v in ipairs(samples) do total += v end\n        local avg = total / math.max(#samples, 1)\n        local p95 = samples[math.max(1, math.floor(#samples * 0.95))] or 999\n        print("[MESH_V5_BENCH]", HttpService:JSONEncode({target="roblox",executedInTarget=true,avgFps=1000/math.max(avg,0.001),p95FrameMs=p95,samples=#samples}))\n    end\nend)\n''', encoding="utf-8")
    return [spec, godot, web, roblox]


def texel_density_plan(object_bounds: list[dict] | None, base_texels_per_meter: float = 256.0) -> dict:
    rows = []
    hero_tokens = ("face", "head", "hand", "weapon", "sword", "gun", "shield", "statue", "ornament", "sign", "лицо", "голов", "рук", "меч", "щит", "стату", "орнамент")
    background_tokens = ("background", "distant", "far", "sky", "terrain_far", "фон", "дальний")
    base = _clamp(base_texels_per_meter, 64.0, 1024.0)
    for row in list(object_bounds or []):
        name = _name(row)
        low = name.lower()
        radius = max(float(row.get("radius", 0.0) or 0.0), 0.05)
        surface_area = float(row.get("surfaceArea", 0.0) or 0.0)
        if surface_area <= 0:
            surface_area = 4.0 * math.pi * radius * radius
        importance = 2.0 if any(token in low for token in hero_tokens) else (0.5 if any(token in low for token in background_tokens) else 1.0)
        tpm = base * importance
        linear_m = math.sqrt(max(surface_area, 1e-6))
        target = int(2 ** round(math.log2(max(256.0, min(8192.0, linear_m * tpm)))))
        target = int(_clamp(target, 256, 8192))
        rows.append({"object": name, "radius": round(radius, 4), "surfaceArea": round(surface_area, 4), "importance": importance, "targetTexelsPerMeter": round(tpm, 2), "recommendedTextureSize": target})
    return {"schemaVersion": 5, "status": "CREATED" if rows else "SKIPPED_NO_BOUNDS", "baseTexelsPerMeter": base, "objects": rows, "rule": "Plan is a ceiling/target hint; authored higher-quality maps are never downscaled solely because of this file."}
