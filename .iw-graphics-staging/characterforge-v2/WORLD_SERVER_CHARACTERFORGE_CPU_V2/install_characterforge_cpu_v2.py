from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

PATCH_NAME = "WORLD_SERVER_CHARACTERFORGE_CPU_V2"
PATCH_VERSION = "2.0.0"


def find_root(start: Path) -> Path:
    for candidate in [start.resolve(), *start.resolve().parents]:
        if (candidate / "package.json").is_file() and (candidate / "services" / "ai3d-worker").is_dir():
            return candidate
    raise SystemExit("World_server root not found. Run this installer from C:\\Users\\user\\Desktop\\World_server.")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"Cannot patch {label}: expected anchor not found. Inspect upstream; do not force-edit.")
    return text.replace(old, new, 1)


def patch_server(path: Path):
    text = path.read_text(encoding="utf-8")
    text = replace_once(
        text,
        'if mode not in {"auto", "image_to_3d", "depth", "building", "map", "voxel_city"}:',
        'if mode not in {"auto", "image_to_3d", "depth", "building", "map", "voxel_city", "character_voxel"}:',
        "server allowed modes",
    )
    text = replace_once(
        text,
        'needs_image = mode in {"auto", "image_to_3d", "depth", "voxel_city"}',
        'needs_image = mode in {"auto", "image_to_3d", "depth", "voxel_city", "character_voxel"}',
        "server image-required modes",
    )

    route_anchor = '@app.get("/v1/jobs/{job_id}")\n'
    multiview_route = r'''@app.post("/v1/characterforge/jobs")
async def create_characterforge_multiview_job(
    front: UploadFile = File(...),
    side: UploadFile | None = File(default=None),
    back: UploadFile | None = File(default=None),
    left: UploadFile | None = File(default=None),
    params: str = Form("{}"),
    _token=Depends(require_token),
):
    """CPU CharacterForge multi-view upload endpoint.

    Front is required; side/back/left are optional and improve deterministic
    silhouette shaping and texture projection without requiring a GPU.
    """
    try:
        options = json.loads(params or "{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="params must be valid JSON.")
    if not isinstance(options, dict) or len(params) > 64_000:
        raise HTTPException(status_code=400, detail="params object is invalid or too large.")

    uploads = {"front": front, "side": side, "back": back, "left": left}
    job_id = uuid.uuid4().hex
    job_dir = RUNTIME / "jobs" / job_id
    job_dir.mkdir(parents=True, exist_ok=False)
    saved = {}
    try:
        for role, upload in uploads.items():
            if upload is None:
                continue
            if upload.content_type not in ALLOWED_IMAGE_TYPES:
                raise HTTPException(status_code=415, detail=f"{role}: only PNG, JPEG and WebP images are accepted.")
            suffix = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}[upload.content_type]
            target = job_dir / f"{role}{suffix}"
            size = 0
            with target.open("wb") as handle:
                while True:
                    chunk = await upload.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_UPLOAD:
                        raise HTTPException(status_code=413, detail=f"{role}: image exceeds {MAX_UPLOAD // (1024 * 1024)} MB limit.")
                    handle.write(chunk)
            try:
                verify_image(target)
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"{role}: invalid image: {exc}")
            saved[role] = target
        if "front" not in saved:
            raise HTTPException(status_code=400, detail="front image is required.")
        options["_characterViews"] = {role: str(path) for role, path in saved.items() if role != "front"}
        options["multiView"] = len(saved) > 1
        store.create(job_id, "character_voxel", options, str(saved["front"]))
    except Exception:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    dispatch(job_id)
    return public_job(store.get(job_id))


'''
    if '/v1/characterforge/jobs' not in text:
        if route_anchor not in text:
            raise RuntimeError("Cannot add CharacterForge multi-view endpoint: route anchor not found.")
        text = text.replace(route_anchor, multiview_route + route_anchor, 1)
    path.write_text(text, encoding="utf-8")


def patch_runner(path: Path):
    text = path.read_text(encoding="utf-8")
    text = replace_once(
        text,
        'from .plugins.world_quality import WorldQualityEnhancer\n',
        'from .plugins.world_quality import WorldQualityEnhancer\nfrom .plugins.characterforge_cpu import CharacterForgeCpuEngine\n',
        "runner import",
    )
    text = replace_once(
        text,
        '        self.world_quality = WorldQualityEnhancer()\n',
        '        self.world_quality = WorldQualityEnhancer()\n        self.characterforge = CharacterForgeCpuEngine()\n',
        "runner init",
    )
    status_anchor = '            "voxel_tools": {"voxelsrv": (Path("C:/Users/user/Desktop/майн/voxelsrv/src").is_dir()), "littlecubes": (Path("C:/Users/user/Desktop/майн/LittleCubes/src").is_dir())},\n'
    status_new = status_anchor + '            "characterforge_cpu": self.characterforge.status(),\n'
    text = replace_once(text, status_anchor, status_new, "runner plugin status")
    text = replace_once(
        text,
        '        if mode in {"auto", "image_to_3d", "depth", "voxel_city"} and not input_path:\n',
        '        if mode in {"auto", "image_to_3d", "depth", "voxel_city", "character_voxel"} and not input_path:\n',
        "runner input requirement",
    )

    anchor = '        if mode in {"auto", "depth"} or (mode == "image_to_3d" and bool(params.get("depthPreview", True))):\n'
    block = '''        if mode == "character_voxel":\n            progress(5, "CharacterForge CPU: starting voxel character pipeline")\n            result = self.characterforge.run(input_path, job_dir, params, progress)\n            for entry in result.get("files", []):\n                p = Path(entry.get("path", ""))\n                if p.is_file():\n                    files.append(file_meta(p, entry.get("role") or "characterforge_artifact"))\n            manifest = {\n                "jobId": job["id"],\n                "mode": mode,\n                "technology": result.get("technology"),\n                "cpuOnly": True,\n                "detail": result.get("detail"),\n                "identity": result.get("identity"),\n                "cacheHit": bool(result.get("cacheHit", False)),\n                "cacheKey": result.get("cacheKey"),\n                "durationSeconds": result.get("durationSeconds"),\n                "files": files,\n                "engines": self.plugin_status(),\n                "truthPolicy": "No GPU backend may be claimed in character_voxel CPU mode.",\n            }\n            manifest_path = job_dir / "characterforge-generation-manifest.json"\n            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")\n            files.append(file_meta(manifest_path, "characterforge-generation-manifest"))\n            progress(99, "CharacterForge CPU: complete")\n            return {"files": files, "durationSeconds": result.get("durationSeconds", round(time.time() - started, 3))}\n\n'''
    if 'if mode == "character_voxel":' not in text:
        if anchor not in text:
            raise RuntimeError("Cannot patch runner character mode: anchor not found.")
        text = text.replace(anchor, block + anchor, 1)
    elif '"cacheHit": bool(result.get("cacheHit", False))' not in text:
        # Upgrade V1's character block conservatively by adding metadata fields near detail.
        text = text.replace(
            '                "detail": result.get("detail"),\n                "durationSeconds": result.get("durationSeconds"),',
            '                "detail": result.get("detail"),\n                "identity": result.get("identity"),\n                "cacheHit": bool(result.get("cacheHit", False)),\n                "cacheKey": result.get("cacheKey"),\n                "durationSeconds": result.get("durationSeconds"),',
            1,
        )
    path.write_text(text, encoding="utf-8")


def patch_package_json(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    scripts = data.setdefault("scripts", {})
    scripts["characterforge:check"] = "python services/ai3d-worker/scripts/verify_characterforge_cpu.py"
    scripts["characterforge:check:strict"] = "python services/ai3d-worker/scripts/verify_characterforge_cpu.py --require-blender"
    scripts["characterforge:selftest"] = "python services/ai3d-worker/scripts/verify_characterforge_cpu.py --require-blender --blender-selftest"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    patch_root = Path(__file__).resolve().parent
    root = find_root(Path.cwd())
    payload = patch_root / "payload"
    backup = root / ".characterforge-backups" / ("v2-" + time.strftime("%Y%m%d-%H%M%S"))
    backup.mkdir(parents=True, exist_ok=True)

    inplace = [
        root / "services" / "ai3d-worker" / "server.py",
        root / "services" / "ai3d-worker" / "ai3d" / "runner.py",
        root / "package.json",
    ]
    for p in inplace:
        if not p.is_file():
            raise SystemExit(f"Required upstream file missing: {p}")

    existing_backups = []
    created_files = []
    targets = set(inplace)
    for source in payload.rglob("*"):
        if source.is_file():
            targets.add(root / source.relative_to(payload))
    for target in sorted(targets):
        rel = target.relative_to(root)
        if target.is_file():
            dest = backup / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, dest)
            existing_backups.append(rel.as_posix())
        else:
            created_files.append(rel.as_posix())

    try:
        for source in payload.rglob("*"):
            if source.is_file():
                rel = source.relative_to(payload)
                dest = root / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, dest)

        patch_server(root / "services" / "ai3d-worker" / "server.py")
        patch_runner(root / "services" / "ai3d-worker" / "ai3d" / "runner.py")
        patch_package_json(root / "package.json")

        state = {
            "patch": PATCH_NAME,
            "version": PATCH_VERSION,
            "installedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "backup": str(backup),
            "backupFiles": existing_backups,
            "createdFiles": created_files,
            "technology": "CharacterForge CPU Voxel Pipeline",
            "mode": "character_voxel",
            "multiViewEndpoint": "/v1/characterforge/jobs",
        }
        (root / "CHARACTERFORGE_CPU_INSTALL.json").write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        print("CHARACTERFORGE_CPU_V2_INSTALL_PASS")
        print(json.dumps(state, ensure_ascii=False, indent=2))
    except Exception:
        for rel_text in existing_backups:
            rel = Path(rel_text)
            saved = backup / rel
            if saved.is_file():
                dest = root / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(saved, dest)
        for rel_text in created_files:
            target = root / rel_text
            if target.is_file():
                target.unlink()
        raise


if __name__ == "__main__":
    main()
