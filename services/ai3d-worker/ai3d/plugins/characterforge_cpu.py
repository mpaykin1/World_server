from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import time
import zipfile
from pathlib import Path
from typing import Callable

from .cpu_reconstruction import CpuReconstructionEngine
from ..validation import validate_glb

TECHNOLOGY_NAME = "CharacterForge CPU Voxel Pipeline"
TECHNOLOGY_CLASS = "CPU-first Multi-view Game Character Reconstruction & Parametric Voxel Rigging"
TECHNOLOGY_VERSION = "2.0.0"
VIEW_ROLES = ("front", "side", "back", "left")


class CharacterForgeCpuEngine:
    """Production CPU-first voxel-character pipeline.

    Reuses the existing AI3D CPU reconstruction engine and adds deterministic
    multi-view shaping/texturing, stable palette identity, shared rig schema,
    multi-LOD export, a Godot package, content-addressed caching and verification.

    GPU-only engines are never reported as used in this CPU mode.
    """

    def __init__(self, service_root: Path | None = None):
        self.service_root = Path(service_root or Path(__file__).resolve().parents[3])
        self.cpu = CpuReconstructionEngine()
        self.blender = self._find_blender()
        self.blender_script = self.service_root / "scripts" / "characterforge_voxel_blender.py"

    @staticmethod
    def _find_blender() -> str | None:
        candidates: list[str] = []
        env = os.environ.get("BLENDER_BIN", "").strip()
        if env:
            candidates.append(env)
        found = shutil.which("blender")
        if found:
            candidates.append(found)
        if os.name == "nt":
            roots = [
                Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Blender Foundation",
                Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "Blender Foundation",
            ]
            for root in roots:
                if root.is_dir():
                    for exe in sorted(root.glob("Blender */blender.exe"), reverse=True):
                        candidates.append(str(exe))
        for candidate in candidates:
            p = Path(candidate)
            if p.is_file() or shutil.which(candidate):
                return str(candidate)
        return None

    def available(self) -> bool:
        return bool(self.cpu.available() and self.blender and self.blender_script.is_file())

    def status(self) -> dict:
        return {
            "available": self.available(),
            "technology": TECHNOLOGY_NAME,
            "version": TECHNOLOGY_VERSION,
            "class": TECHNOLOGY_CLASS,
            "cpuOnly": True,
            "blender": self.blender,
            "cpuReconstruction": bool(self.cpu.available()),
            "supports": [
                "single-view and front/side/back/left multi-view input",
                "parametric voxel detail controlled by natural language",
                "three synchronized voxel LOD GLBs",
                "stable canonical palette across LODs",
                "shared normalized humanoid rig schema across LODs",
                "voxel-safe idle/walk/run/jump clips and foot contact markers",
                "Godot CharacterBody3D package",
                "content-addressed CPU cache",
                "identity and regression manifests",
            ],
            "limitations": [
                "single-view hidden geometry remains inferred when side/back views are absent",
                "multi-view CPU shaping is silhouette-constrained, not neural multi-view 3D generation",
                "rigging is deterministic heuristic rigging, not SkinTokens",
                "TRELLIS.2/SkinTokens/InstantMesh are not used in CPU-only mode",
            ],
        }

    @staticmethod
    def resolve_voxel_resolution(params: dict) -> tuple[int, dict]:
        if "voxelResolution" in params:
            resolution = int(params.get("voxelResolution") or 48)
        else:
            detail = max(0.0, min(float(params.get("detailLevel", 55)), 100.0))
            resolution = round(16 + (detail / 100.0) ** 1.25 * 80)

        pixel_scale = max(0.25, min(float(params.get("pixelSizeScale", 1.0)), 4.0))
        resolution = round(resolution / pixel_scale)

        command = str(params.get("detailCommand", "")).lower().strip()
        less_tokens = (
            "меньше детал", "крупнее пиксел", "увеличь пиксел", "больше пиксел",
            "less detail", "bigger pixel", "larger pixel", "coarser",
        )
        more_tokens = (
            "больше детал", "мельче пиксел", "уменьши пиксел", "меньше пиксел",
            "more detail", "smaller pixel", "finer",
        )
        if any(token in command for token in less_tokens):
            resolution = round(resolution * 0.72)
        if any(token in command for token in more_tokens):
            resolution = round(resolution * 1.35)

        resolution = max(12, min(resolution, 160))
        return resolution, {
            "voxelsPerCharacterHeight": resolution,
            "pixelSizeScale": pixel_scale,
            "detailLevel": params.get("detailLevel", 55),
            "detailCommand": params.get("detailCommand", ""),
            "semanticRule": "bigger pixels = lower voxel resolution; smaller pixels = higher voxel resolution",
        }

    @staticmethod
    def _available_memory_gb() -> float | None:
        try:
            if os.name == "nt":
                import ctypes

                class MEMORYSTATUSEX(ctypes.Structure):
                    _fields_ = [
                        ("dwLength", ctypes.c_ulong),
                        ("dwMemoryLoad", ctypes.c_ulong),
                        ("ullTotalPhys", ctypes.c_ulonglong),
                        ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong),
                        ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong),
                        ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                    ]
                status = MEMORYSTATUSEX()
                status.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
                if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                    return round(status.ullAvailPhys / (1024 ** 3), 2)
            meminfo = Path("/proc/meminfo")
            if meminfo.is_file():
                for line in meminfo.read_text(encoding="utf-8", errors="ignore").splitlines():
                    if line.startswith("MemAvailable:"):
                        kb = float(line.split()[1])
                        return round(kb / (1024 ** 2), 2)
        except Exception:
            return None
        return None

    @classmethod
    def _apply_ram_governor(cls, requested: int) -> tuple[int, dict]:
        free_gb = cls._available_memory_gb()
        cap = 160
        if free_gb is not None:
            if free_gb < 4:
                cap = 48
            elif free_gb < 8:
                cap = 72
            elif free_gb < 16:
                cap = 96
            elif free_gb < 24:
                cap = 128
        env_cap = os.environ.get("CHARACTERFORGE_MAX_VPH", "").strip()
        if env_cap:
            try:
                cap = min(cap, max(12, min(int(env_cap), 160)))
            except ValueError:
                pass
        effective = min(requested, cap)
        return effective, {
            "requestedVph": requested,
            "effectiveVph": effective,
            "freeMemoryGB": free_gb,
            "safetyCapVph": cap,
            "capped": effective != requested,
        }

    @staticmethod
    def _maybe_remove_background(input_path: Path, output_path: Path, enabled: bool) -> tuple[Path, str]:
        if not enabled:
            return input_path, "disabled"
        try:
            from rembg import remove  # type: ignore
            output_path.write_bytes(remove(input_path.read_bytes()))
            return output_path, "rembg_cpu"
        except Exception as exc:
            return input_path, f"fallback_original:{type(exc).__name__}"

    @staticmethod
    def _collect_views(input_path: Path, params: dict) -> dict[str, Path]:
        views: dict[str, Path] = {"front": input_path}
        raw = params.get("_characterViews") or {}
        if isinstance(raw, dict):
            for role in VIEW_ROLES:
                if role == "front":
                    continue
                value = raw.get(role)
                if value:
                    path = Path(str(value))
                    if path.is_file():
                        views[role] = path
        return views

    @staticmethod
    def _sha_file(path: Path) -> str:
        h = hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()

    def _cache_key(self, views: dict[str, Path], params: dict, resolution: int, palette_size: int) -> str:
        h = hashlib.sha256()
        h.update(TECHNOLOGY_VERSION.encode())
        for role in sorted(views):
            h.update(role.encode())
            h.update(self._sha_file(views[role]).encode())
        stable = {
            "resolution": resolution,
            "paletteSize": palette_size,
            "rig": "humanoid-v2",
            "animations": params.get("animations", "idle,walk,run,jump"),
            "sideShapeStrength": float(params.get("sideShapeStrength", 0.80)),
            "removeBackground": bool(params.get("removeBackground", True)),
        }
        h.update(json.dumps(stable, sort_keys=True, separators=(",", ":")).encode())
        return h.hexdigest()

    @staticmethod
    def _cache_root(job_dir: Path) -> Path:
        # runtime/jobs/<job> -> runtime/characterforge-cache
        runtime = job_dir.parent.parent
        return runtime / "characterforge-cache"

    def _prune_cache(self, job_dir: Path) -> dict:
        root = self._cache_root(job_dir)
        root.mkdir(parents=True, exist_ok=True)
        now = time.time()
        ttl_days = max(1, int(os.environ.get("CHARACTERFORGE_CACHE_TTL_DAYS", "30")))
        max_gb = max(0.5, float(os.environ.get("CHARACTERFORGE_CACHE_MAX_GB", "8")))
        removed = []
        entries = []
        total = 0
        for child in root.iterdir():
            if not child.is_dir() or child.name.endswith(".tmp"):
                continue
            try:
                mtime = child.stat().st_mtime
                size = sum(p.stat().st_size for p in child.rglob("*") if p.is_file())
            except OSError:
                continue
            if now - mtime > ttl_days * 86400:
                shutil.rmtree(child, ignore_errors=True)
                removed.append(child.name)
                continue
            entries.append((mtime, size, child))
            total += size
        max_bytes = int(max_gb * 1024 ** 3)
        for _mtime, size, child in sorted(entries):
            if total <= max_bytes:
                break
            shutil.rmtree(child, ignore_errors=True)
            removed.append(child.name)
            total -= size
        return {"removed": removed, "remainingBytes": max(0, total), "ttlDays": ttl_days, "maxGB": max_gb}

    def _restore_cache(self, job_dir: Path, key: str) -> dict | None:
        root = self._cache_root(job_dir) / key
        result_path = root / "cached-result.json"
        if not result_path.is_file():
            return None
        try:
            cached = json.loads(result_path.read_text(encoding="utf-8"))
            names = cached.get("artifactNames") or []
            if not names or not all((root / name).is_file() for name in names):
                return None
            entries = []
            for name in names:
                src = root / name
                dst = job_dir / name
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
                entries.append({"path": str(dst), "role": cached.get("roles", {}).get(name, "characterforge_artifact")})
            return {
                "files": entries,
                "technology": TECHNOLOGY_NAME,
                "detail": cached.get("detail", {}),
                "cacheHit": True,
                "identity": cached.get("identity", {}),
            }
        except Exception:
            return None

    def _save_cache(self, job_dir: Path, key: str, file_entries: list[dict], detail: dict, identity: dict) -> None:
        root = self._cache_root(job_dir) / key
        temp = root.with_name(root.name + ".tmp")
        shutil.rmtree(temp, ignore_errors=True)
        temp.mkdir(parents=True, exist_ok=True)
        names: list[str] = []
        roles: dict[str, str] = {}
        for entry in file_entries:
            p = Path(entry["path"])
            if not p.is_file():
                continue
            # Cache only job-local artifacts; nested Godot files retain their subpath.
            try:
                rel = p.relative_to(job_dir)
            except ValueError:
                continue
            dest = temp / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, dest)
            rels = rel.as_posix()
            names.append(rels)
            roles[rels] = entry.get("role") or "characterforge_artifact"
        payload = {
            "technology": TECHNOLOGY_NAME,
            "version": TECHNOLOGY_VERSION,
            "artifactNames": names,
            "roles": roles,
            "detail": detail,
            "identity": identity,
        }
        (temp / "cached-result.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        if root.exists():
            shutil.rmtree(root, ignore_errors=True)
        temp.replace(root)

    def _run_blender(
        self,
        source_glb: Path,
        views: dict[str, Path],
        output_dir: Path,
        resolution: int,
        palette_size: int,
        params: dict,
        progress: Callable[[int, str], None],
    ) -> tuple[list[Path], Path, Path, Path]:
        if not self.blender:
            raise RuntimeError("Blender is required for CharacterForge CPU. Set BLENDER_BIN or install Blender.")
        if not self.blender_script.is_file():
            raise RuntimeError(f"CharacterForge Blender script missing: {self.blender_script}")

        coarse = max(12, round(resolution * 0.58))
        medium = resolution
        fine = min(160, max(medium + 4, round(resolution * 1.42)))
        resolutions = sorted(set([coarse, medium, fine]))
        log_path = output_dir / "characterforge-blender.log"
        summary_path = output_dir / "characterforge-blender-summary.json"
        identity_path = output_dir / "characterforge-identity.json"

        cmd = [
            self.blender, "--background", "--factory-startup", "--python", str(self.blender_script), "--",
            "--input", str(source_glb),
            "--output-dir", str(output_dir),
            "--resolutions", ",".join(str(x) for x in resolutions),
            "--primary", str(medium),
            "--palette-size", str(max(8, min(int(palette_size), 64))),
            "--rig", "humanoid",
            "--animations", str(params.get("animations", "idle,walk,run,jump")),
            "--side-shape-strength", str(max(0.0, min(float(params.get("sideShapeStrength", 0.80)), 1.0))),
        ]
        for role, path in views.items():
            cmd.extend([f"--view-{role}", str(path)])

        progress(61, f"Blender CPU multi-view voxelization: {resolutions} voxels/height")
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60 * 60)
        log_path.write_text(
            "COMMAND:\n" + " ".join(cmd) + "\n\nSTDOUT:\n" + proc.stdout + "\n\nSTDERR:\n" + proc.stderr,
            encoding="utf-8",
        )
        if proc.returncode != 0:
            raise RuntimeError(f"Blender CharacterForge failed with code {proc.returncode}. See {log_path}")

        outputs = sorted(output_dir.glob("character_voxel_*.glb"))
        primary = output_dir / "character_voxel.glb"
        if primary.is_file() and primary not in outputs:
            outputs.insert(0, primary)
        if not primary.is_file() or not summary_path.is_file() or not identity_path.is_file():
            raise RuntimeError("Blender did not produce the required CharacterForge primary/summary/identity artifacts.")
        for glb in outputs:
            validate_glb(glb)
        return outputs, log_path, summary_path, identity_path

    @staticmethod
    def _write_godot_package(job_dir: Path, primary_glb: Path) -> list[dict]:
        godot = job_dir / "godot-character"
        godot.mkdir(parents=True, exist_ok=True)
        controller = godot / "character_controller.gd"
        scene = godot / "character.tscn"
        manifest = godot / "manifest.json"
        controller.write_text('''extends CharacterBody3D

@export var speed := 4.5
@export var jump_velocity := 5.5
@export var gravity := 14.0
var _anim: AnimationPlayer

func _ready():
    _anim = _find_anim(self)

func _find_anim(node: Node) -> AnimationPlayer:
    if node is AnimationPlayer:
        return node
    for child in node.get_children():
        var found := _find_anim(child)
        if found:
            return found
    return null

func _play(name: String):
    if _anim and _anim.has_animation(name) and _anim.current_animation != name:
        _anim.play(name)

func _physics_process(delta):
    if not is_on_floor():
        velocity.y -= gravity * delta
    if Input.is_action_just_pressed("ui_accept") and is_on_floor():
        velocity.y = jump_velocity
        _play("Jump")
    var input2 := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
    var direction := Vector3(input2.x, 0.0, input2.y)
    if direction.length() > 0.01:
        direction = direction.normalized()
        velocity.x = direction.x * speed
        velocity.z = direction.z * speed
        rotation.y = lerp_angle(rotation.y, atan2(direction.x, direction.z), min(1.0, delta * 10.0))
        if is_on_floor(): _play("Walk")
    else:
        velocity.x = move_toward(velocity.x, 0.0, speed * delta * 5.0)
        velocity.z = move_toward(velocity.z, 0.0, speed * delta * 5.0)
        if is_on_floor(): _play("Idle")
    move_and_slide()
''', encoding="utf-8")
        scene.write_text(f'''[gd_scene load_steps=4 format=3]

[ext_resource type="PackedScene" path="{primary_glb.name}" id="1_model"]
[ext_resource type="Script" path="character_controller.gd" id="2_script"]

[sub_resource type="CapsuleShape3D" id="Capsule"]
radius = 0.35
height = 1.25

[node name="VoxelCharacter" type="CharacterBody3D"]
script = ExtResource("2_script")

[node name="Model" parent="." instance=ExtResource("1_model")]

[node name="CollisionShape3D" type="CollisionShape3D" parent="."]
shape = SubResource("Capsule")
position = Vector3(0, 0.9, 0)
''', encoding="utf-8")
        manifest_payload = {
            "technology": TECHNOLOGY_NAME,
            "model": primary_glb.name,
            "scene": scene.name,
            "controller": controller.name,
            "inputActions": ["ui_left", "ui_right", "ui_up", "ui_down", "ui_accept"],
            "note": "GLB carries the shared humanoid rig and animation clips; scene adds CharacterBody3D movement/collision.",
        }
        manifest.write_text(json.dumps(manifest_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        public_manifest = job_dir / "characterforge-godot-manifest.json"
        public_manifest.write_text(json.dumps(manifest_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        package = job_dir / "characterforge-godot.zip"
        with zipfile.ZipFile(package, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(scene, scene.name)
            zf.write(controller, controller.name)
            zf.write(manifest, manifest.name)
            zf.write(primary_glb, primary_glb.name)
            for extra_name in ("characterforge-rig-map.json", "characterforge-animation-contract.json"):
                extra = job_dir / extra_name
                if extra.is_file():
                    zf.write(extra, extra.name)
        return [
            {"path": str(package), "role": "godot_character_package"},
            {"path": str(public_manifest), "role": "godot_character_manifest"},
        ]

    def run(self, input_path: Path, job_dir: Path, params: dict, progress: Callable[[int, str], None]) -> dict:
        started = time.time()
        if not input_path or not input_path.is_file():
            raise RuntimeError("CharacterForge requires at least a front/source image.")
        if not self.cpu.available():
            raise RuntimeError("Existing CPU reconstruction engine is unavailable.")

        requested_resolution, detail = self.resolve_voxel_resolution(params)
        resolution, ram_governor = self._apply_ram_governor(requested_resolution)
        detail["ramGovernor"] = ram_governor
        detail["voxelsPerCharacterHeight"] = resolution
        palette_size = max(8, min(int(params.get("paletteSize", 24)), 64))
        raw_views = self._collect_views(input_path, params)
        cache_maintenance = self._prune_cache(job_dir)
        cache_key = self._cache_key(raw_views, params, resolution, palette_size)
        cached = self._restore_cache(job_dir, cache_key)
        if cached:
            progress(99, "CharacterForge CPU: restored verified result from content-addressed cache")
            cached["durationSeconds"] = round(time.time() - started, 3)
            cached["cacheKey"] = cache_key
            return cached

        progress(6, "CharacterForge CPU: preparing multi-view references and stable identity")
        prepared_views: dict[str, Path] = {}
        background_engines: dict[str, str] = {}
        for role, path in raw_views.items():
            prepared, engine = self._maybe_remove_background(
                path, job_dir / f"character-source-{role}-rmbg.png", bool(params.get("removeBackground", True))
            )
            prepared_views[role] = prepared
            background_engines[role] = engine

        front = prepared_views["front"]
        progress(14, "CharacterForge CPU: reconstructing canonical base volume from front view")
        base_glb = job_dir / "character_base_cpu.glb"
        cpu_params = dict(params)
        cpu_params.setdefault("depthPreview", True)
        cpu_params.setdefault("blenderEnhance", True)

        def cpu_progress(p: int, message: str):
            progress(14 + int(max(0, min(p, 100)) * 0.40), f"Base reconstruction: {message}")

        base_glb, classification = self.cpu.run(front, base_glb, cpu_params, progress=cpu_progress)
        validate_glb(base_glb)

        outputs, log_path, summary_path, identity_path = self._run_blender(
            base_glb, prepared_views, job_dir, resolution, palette_size, params, progress
        )
        identity = json.loads(identity_path.read_text(encoding="utf-8"))
        summary = json.loads(summary_path.read_text(encoding="utf-8"))

        progress(91, "CharacterForge CPU: packaging Godot controller and checking LOD identity")
        file_entries = [{"path": str(base_glb), "role": "character_base_cpu"}]
        for glb in outputs:
            role = "character_voxel" if glb.name == "character_voxel.glb" else "character_voxel_lod"
            file_entries.append({"path": str(glb), "role": role})
        file_entries.extend([
            {"path": str(log_path), "role": "characterforge_log"},
            {"path": str(summary_path), "role": "characterforge_blender_summary"},
            {"path": str(identity_path), "role": "characterforge_identity"},
        ])
        for extra_name, role in (("characterforge-rig-map.json", "characterforge_rig_map"), ("characterforge-animation-contract.json", "characterforge_animation_contract")):
            extra = job_dir / extra_name
            if extra.is_file():
                file_entries.append({"path": str(extra), "role": role})
        file_entries.extend(self._write_godot_package(job_dir, job_dir / "character_voxel.glb"))

        regression_path = job_dir / "characterforge-regression.json"
        resolutions = [int(x.get("voxelsPerCharacterHeight", 0)) for x in summary]
        palette_hashes = {x.get("paletteHash") for x in summary if x.get("paletteHash")}
        rig_hashes = {x.get("rigSchemaHash") for x in summary if x.get("rigSchemaHash")}
        regression_checks = {
            "threeOrMoreLods": len(summary) >= 3,
            "lodResolutionOrder": resolutions == sorted(resolutions),
            "stablePaletteAcrossLods": len(palette_hashes) == 1,
            "stableRigSchemaAcrossLods": len(rig_hashes) == 1,
            "footContactStabilizedAcrossLods": all(bool(x.get("footContactStabilized", False)) for x in summary),
            "primaryExists": (job_dir / "character_voxel.glb").is_file(),
            "godotPackageExists": (job_dir / "characterforge-godot.zip").is_file(),
            "retargetMapExists": (job_dir / "characterforge-rig-map.json").is_file(),
            "animationContractExists": (job_dir / "characterforge-animation-contract.json").is_file(),
        }
        regression = {
            "status": "PASS" if all(regression_checks.values()) else "FAIL",
            "checks": {**regression_checks, "multiviewRolesUsed": sorted(prepared_views)},
            "cacheKey": cache_key,
        }
        regression_path.write_text(json.dumps(regression, ensure_ascii=False, indent=2), encoding="utf-8")
        file_entries.append({"path": str(regression_path), "role": "characterforge_regression"})
        if regression["status"] != "PASS":
            raise RuntimeError(f"CharacterForge identity regression gate failed: {regression}")

        details_file = job_dir / "characterforge-detail.json"
        details_payload = {
            "technology": TECHNOLOGY_NAME,
            "version": TECHNOLOGY_VERSION,
            "technologyClass": TECHNOLOGY_CLASS,
            "cpuOnly": True,
            "classification": classification,
            "views": sorted(prepared_views),
            "backgroundEngines": background_engines,
            "detail": detail,
            "paletteSize": palette_size,
            "identity": identity,
            "cacheKey": cache_key,
            "cacheMaintenance": cache_maintenance,
            "commands": {
                "lessDetailExamples": ["сделай меньше детализацию", "сделай пиксели крупнее"],
                "moreDetailExamples": ["сделай больше детализацию", "сделай пиксели мельче"],
            },
            "limitations": [
                "missing views are inferred from the canonical front reconstruction",
                "multi-view geometry uses deterministic silhouette constraints on CPU",
                "high voxel resolutions can be slow and memory-heavy on CPU",
            ],
            "durationSeconds": round(time.time() - started, 3),
        }
        details_file.write_text(json.dumps(details_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        file_entries.append({"path": str(details_file), "role": "characterforge_manifest"})

        self._save_cache(job_dir, cache_key, file_entries, detail, identity)
        progress(99, "CharacterForge CPU multi-view voxel character ready")
        return {
            "files": file_entries,
            "durationSeconds": round(time.time() - started, 3),
            "technology": TECHNOLOGY_NAME,
            "detail": detail,
            "identity": identity,
            "cacheHit": False,
            "cacheKey": cache_key,
        }
