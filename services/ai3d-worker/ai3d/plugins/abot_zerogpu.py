from __future__ import annotations

import json
import os
import shutil
import time
import urllib.parse
from pathlib import Path
from typing import Any, Callable

import requests


class ABotZeroGpuClient:
    """Client for a self-owned, secret-protected Gradio ZeroGPU ABot Space."""

    def __init__(self) -> None:
        self.base_url = os.environ.get("ABOT_RECON_ZEROGPU_URL", "").strip().rstrip("/")
        self.secret = os.environ.get("ABOT_RECON_ZEROGPU_SECRET", "").strip()

    def configured(self) -> bool:
        return bool(self.base_url and len(self.secret) >= 24)

    def status(self) -> dict[str, Any]:
        return {
            "configured": self.configured(),
            "provider": "huggingface-zerogpu",
            "urlConfigured": bool(self.base_url),
            "secretConfigured": len(self.secret) >= 24,
        }

    @staticmethod
    def _event_data(text: str) -> list[Any]:
        event = None
        payload = None
        for raw in text.splitlines():
            line = raw.strip()
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                payload = line[5:].strip()
        if event != "complete" or not payload:
            raise RuntimeError(f"ZeroGPU job did not complete: event={event or 'missing'}")
        data = json.loads(payload)
        if not isinstance(data, list):
            raise RuntimeError("ZeroGPU returned an unexpected Gradio payload.")
        return data

    @staticmethod
    def _find_file(value: Any, suffix: str = ".zip") -> dict[str, Any] | None:
        if isinstance(value, dict):
            name = str(value.get("orig_name") or value.get("path") or value.get("url") or "")
            if name.lower().endswith(suffix):
                return value
            for child in value.values():
                found = ABotZeroGpuClient._find_file(child, suffix)
                if found:
                    return found
        elif isinstance(value, list):
            for child in value:
                found = ABotZeroGpuClient._find_file(child, suffix)
                if found:
                    return found
        return None

    def _download_file(self, file_data: dict[str, Any], target: Path) -> None:
        url = str(file_data.get("url") or "").strip()
        if not url:
            path = str(file_data.get("path") or "").strip()
            if not path:
                raise RuntimeError("ZeroGPU result has no downloadable file path.")
            url = f"{self.base_url}/gradio_api/file={urllib.parse.quote(path, safe='/')}"
        elif url.startswith("/"):
            url = self.base_url + url
        with requests.get(url, timeout=180, stream=True) as response:
            response.raise_for_status()
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("wb") as handle:
                for chunk in response.iter_content(1024 * 1024):
                    if chunk:
                        handle.write(chunk)

    @staticmethod
    def _safe_extract(zip_path: Path, output_dir: Path) -> list[Path]:
        import zipfile

        output_dir.mkdir(parents=True, exist_ok=True)
        extracted: list[Path] = []
        with zipfile.ZipFile(zip_path) as archive:
            for info in archive.infolist():
                if info.is_dir():
                    continue
                name = Path(info.filename).name
                if not name or name != info.filename.replace("\\", "/").split("/")[-1]:
                    # Flatten nested paths and forbid traversal.
                    pass
                if name in {"", ".", ".."}:
                    continue
                target = (output_dir / name).resolve()
                if target.parent != output_dir.resolve():
                    raise RuntimeError("Unsafe path in ZeroGPU result archive.")
                with archive.open(info) as src, target.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
                extracted.append(target)
        return extracted

    def run(
        self,
        video_path: Path,
        job_dir: Path,
        params: dict,
        progress: Callable[[int, str], None] | None = None,
    ) -> list[Path]:
        if not self.configured():
            raise RuntimeError("ABot ZeroGPU client is not configured.")
        if progress:
            progress(10, "ABot ZeroGPU: uploading video")

        timeout = max(30, min(int(params.get("remoteTimeoutSeconds", 240)), 600))
        mime = {
            ".mp4": "video/mp4",
            ".webm": "video/webm",
            ".mov": "video/quicktime",
            ".avi": "video/x-msvideo",
        }.get(video_path.suffix.lower(), "application/octet-stream")
        with video_path.open("rb") as handle:
            upload = requests.post(
                f"{self.base_url}/gradio_api/upload",
                files={"files": (video_path.name, handle, mime)},
                timeout=timeout,
            )
        upload.raise_for_status()
        uploaded = upload.json()
        if not isinstance(uploaded, list) or not uploaded:
            raise RuntimeError("ZeroGPU upload returned no file path.")

        max_frames = max(12, min(int(params.get("maxFrames", 200)), 200))
        interval = max(1, min(int(params.get("frameInterval", 5)), 30))
        confidence = max(0.0, min(float(params.get("confidenceThreshold", 0.1)), 1.0))
        depth_max = max(5.0, min(float(params.get("pointDepthMax", 40.0)), 200.0))
        body = {
            "api_secret": self.secret,
            "video": {
                "path": uploaded[0],
                "orig_name": video_path.name,
                "meta": {"_type": "gradio.FileData"},
            },
            "frame_interval": interval,
            "max_frames": max_frames,
            "confidence_threshold": confidence,
            "point_depth_max": depth_max,
        }
        if progress:
            progress(25, f"ABot ZeroGPU: reconstructing up to {max_frames} frames")
        call = requests.post(
            f"{self.base_url}/gradio_api/call/v2/reconstruct_api",
            json=body,
            timeout=timeout,
        )
        call.raise_for_status()
        event_id = str(call.json().get("event_id") or "").strip()
        if not event_id:
            raise RuntimeError("ZeroGPU did not return a Gradio event id.")

        # Gradio streams one SSE response until the GPU function completes.
        started = time.time()
        result = requests.get(
            f"{self.base_url}/gradio_api/call/reconstruct_api/{urllib.parse.quote(event_id)}",
            timeout=max(timeout, 180),
        )
        result.raise_for_status()
        data = self._event_data(result.text)
        file_data = self._find_file(data, ".zip")
        if not file_data:
            raise RuntimeError("ZeroGPU reconstruction returned no result archive.")

        archive = job_dir / "abot-zerogpu-result.zip"
        self._download_file(file_data, archive)
        extracted = self._safe_extract(archive, job_dir)
        archive.unlink(missing_ok=True)

        required = next((p for p in extracted if p.name == "reconstruction.ply"), None)
        if not required or required.stat().st_size < 256:
            raise RuntimeError("ZeroGPU result archive has no valid reconstruction.ply.")
        manifest = {
            "provider": "huggingface-zerogpu",
            "space": self.base_url,
            "elapsedSeconds": round(time.time() - started, 3),
            "maxFrames": max_frames,
            "frameInterval": interval,
            "confidenceThreshold": confidence,
            "pointDepthMax": depth_max,
        }
        manifest_path = job_dir / "abot-zerogpu-client-manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        extracted.append(manifest_path)
        if progress:
            progress(94, "ABot ZeroGPU: result archive verified")
        return extracted
