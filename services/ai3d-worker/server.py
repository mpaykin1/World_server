from __future__ import annotations

import json
import os
import shutil
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from ai3d.auth import verify_token
from ai3d.runner import PipelineRunner
from ai3d.store import JobStore
from ai3d.validation import ALLOWED_IMAGE_TYPES, verify_image

SERVICE_ROOT = Path(__file__).resolve().parent
RUNTIME = Path(os.environ.get("AI3D_RUNTIME_DIR", SERVICE_ROOT / "runtime")).resolve()
RUNTIME.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD = max(1, min(int(os.environ.get("AI3D_MAX_UPLOAD_MB", "25")), 100)) * 1024 * 1024
MAX_WORKERS = max(1, min(int(os.environ.get("AI3D_MAX_WORKERS", "1")), 8))
JOB_TTL_HOURS = max(1, int(os.environ.get("AI3D_JOB_TTL_HOURS", "72")))
SECRET = os.environ.get("AI3D_SHARED_SECRET", "")

store = JobStore(RUNTIME / "jobs.sqlite3")
runner = PipelineRunner(RUNTIME)
executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="ai3d-job")
_inflight: set[str] = set()
_inflight_lock = threading.Lock()

app = FastAPI(title="World Server AI3D Worker", version="1.0.0")
origins_raw = os.environ.get("AI3D_ALLOWED_ORIGINS", "*").strip()
origins = [x.strip() for x in origins_raw.split(",") if x.strip()] or ["*"]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])


def require_token(authorization: str | None = Header(default=None)):
    if not SECRET or len(SECRET) < 24:
        raise HTTPException(status_code=503, detail="AI3D_SHARED_SECRET is not configured on worker.")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    payload = verify_token(authorization[7:].strip(), SECRET)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired bearer token.")
    return payload


def public_job(job: dict) -> dict:
    result = job.get("result") or {}
    files = []
    for item in result.get("files", []):
        name = item.get("name")
        if not name:
            continue
        files.append({**item, "url": f"/v1/jobs/{job['id']}/files/{name}"})
    return {
        "id": job["id"], "mode": job["mode"], "status": job["status"], "progress": int(job["progress"]),
        "message": job.get("message") or "", "error": job.get("error"), "createdAt": job["created_at"],
        "updatedAt": job["updated_at"], "files": files,
    }


def execute_job(job_id: str) -> None:
    with _inflight_lock:
        if job_id in _inflight:
            return
        _inflight.add(job_id)
    try:
        job = store.get(job_id)
        if not job:
            return
        store.update(job_id, status="running", progress=2, message="Worker started job", error=None)

        def progress(value: int, message: str):
            store.update(job_id, progress=max(0, min(int(value), 99)), message=message)

        job = store.get(job_id)
        result = runner.run(job, progress)
        store.update(job_id, status="completed", progress=100, message="Completed", result_json=result, error=None)
    except Exception as exc:
        store.update(job_id, status="failed", message="Failed", error=f"{type(exc).__name__}: {exc}")
    finally:
        with _inflight_lock:
            _inflight.discard(job_id)


def dispatch(job_id: str) -> None:
    executor.submit(execute_job, job_id)


@app.on_event("startup")
def startup_recover():
    store.recover_interrupted()
    for job in store.by_status(("queued",)):
        dispatch(job["id"])
    for old_id in store.purge_older_than(JOB_TTL_HOURS * 3600):
        shutil.rmtree(RUNTIME / "jobs" / old_id, ignore_errors=True)


@app.get("/health")
def health():
    return {"ok": True, "service": "world-server-ai3d-worker", "plugins": runner.plugin_status(), "maxWorkers": MAX_WORKERS}


@app.post("/v1/jobs")
async def create_job(
    mode: str = Form(...),
    params: str = Form("{}"),
    file: UploadFile | None = File(default=None),
    _token=Depends(require_token),
):
    mode = mode.strip().lower()
    if mode not in {"auto", "image_to_3d", "depth", "building", "map"}:
        raise HTTPException(status_code=400, detail="Unsupported mode.")
    try:
        options = json.loads(params or "{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="params must be valid JSON.")
    if not isinstance(options, dict) or len(params) > 64_000:
        raise HTTPException(status_code=400, detail="params object is invalid or too large.")

    needs_image = mode in {"auto", "image_to_3d", "depth"}
    if needs_image and file is None:
        raise HTTPException(status_code=400, detail="This mode requires an image.")
    if file is not None and file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Only PNG, JPEG and WebP images are accepted.")

    job_id = uuid.uuid4().hex
    job_dir = RUNTIME / "jobs" / job_id
    job_dir.mkdir(parents=True, exist_ok=False)
    input_path = None
    try:
        if file is not None:
            suffix = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}[file.content_type]
            input_path = job_dir / f"input{suffix}"
            size = 0
            with input_path.open("wb") as handle:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_UPLOAD:
                        raise HTTPException(status_code=413, detail=f"Image exceeds {MAX_UPLOAD // (1024 * 1024)} MB limit.")
                    handle.write(chunk)
            try:
                verify_image(input_path)
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Invalid image: {exc}")
        store.create(job_id, mode, options, str(input_path) if input_path else None)
    except Exception:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    dispatch(job_id)
    return public_job(store.get(job_id))


@app.get("/v1/jobs/{job_id}")
def get_job(job_id: str, _token=Depends(require_token)):
    job = store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return public_job(job)


@app.get("/v1/jobs/{job_id}/files/{filename}")
def get_file(job_id: str, filename: str, _token=Depends(require_token)):
    job = store.get(job_id)
    if not job or job["status"] != "completed":
        raise HTTPException(status_code=404, detail="Result not found.")
    allowed = {item.get("name"): item for item in (job.get("result") or {}).get("files", [])}
    meta = allowed.get(filename)
    if not meta:
        raise HTTPException(status_code=404, detail="Result file not found.")
    path = (RUNTIME / "jobs" / job_id / filename).resolve()
    expected_root = (RUNTIME / "jobs" / job_id).resolve()
    if expected_root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Result file not found.")
    return FileResponse(path, media_type=meta.get("mime") or "application/octet-stream", filename=filename)
