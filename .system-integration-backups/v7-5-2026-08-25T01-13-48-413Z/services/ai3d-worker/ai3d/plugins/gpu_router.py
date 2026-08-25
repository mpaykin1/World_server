from __future__ import annotations

import base64
import json
import os
import time
import urllib.request
from pathlib import Path
from typing import Any


class RemoteGPU3DRouter:
    """
    Fail-closed remote GPU router.
    AI3D_GPU_WORKERS_JSON example:
    [
      {"name":"gpu-a","url":"https://worker-a.example","tokenEnv":"GPU_A_TOKEN",
       "engines":["trellis2","instantmesh"],"vramGB":48,"priority":100},
      {"name":"gpu-b","url":"https://worker-b.example","tokenEnv":"GPU_B_TOKEN",
       "engines":["hunyuan3d"],"vramGB":24,"priority":80}
    ]
    """

    def __init__(self) -> None:
        raw = os.environ.get("AI3D_GPU_WORKERS_JSON", "").strip()
        try:
            self.workers = json.loads(raw) if raw else []
        except Exception:
            self.workers = []
        self._health_cache: dict[str, tuple[float, dict[str, Any]]] = {}

    def configured(self) -> bool:
        return bool(self.workers)

    def _headers(self, worker: dict) -> dict:
        headers = {"content-type": "application/json", "accept": "application/json"}
        env = worker.get("tokenEnv")
        token = os.environ.get(env, "") if env else ""
        if token:
            headers["authorization"] = f"Bearer {token}"
        return headers

    def _health(self, worker: dict) -> dict:
        name = str(worker.get("name") or worker.get("url"))
        cached = self._health_cache.get(name)
        if cached and time.time() - cached[0] < 20:
            return cached[1]
        try:
            req = urllib.request.Request(str(worker["url"]).rstrip("/") + "/health", headers=self._headers(worker))
            with urllib.request.urlopen(req, timeout=4) as r:
                data = json.loads(r.read().decode("utf-8"))
        except Exception as exc:
            data = {"ok": False, "error": str(exc)}
        self._health_cache[name] = (time.time(), data)
        return data

    def candidates(self, engine: str) -> list[dict]:
        result = []
        for w in self.workers:
            if engine not in (w.get("engines") or []):
                continue
            h = self._health(w)
            if h.get("ok") is not True:
                continue
            vram = float(h.get("freeVramGB", w.get("vramGB", 0)) or 0)
            queue = float(h.get("queueDepth", 0) or 0)
            latency = float(h.get("latencyMs", 0) or 0)
            priority = float(w.get("priority", 50) or 50)
            score = priority + min(vram, 96) * 2 - queue * 15 - latency / 100
            result.append({**w, "_health": h, "_score": score})
        return sorted(result, key=lambda x: x["_score"], reverse=True)

    def available(self, engine: str) -> bool:
        return bool(self.candidates(engine))

    def status(self) -> dict:
        return {
            "configured": self.configured(),
            "engines": {
                engine: [
                    {"name": w.get("name"), "score": w["_score"], "health": w["_health"]}
                    for w in self.candidates(engine)
                ]
                for engine in ("trellis2", "instantmesh", "hunyuan3d")
            },
        }

    def run(self, engine: str, image_path: Path, output_path: Path, params: dict) -> Path:
        candidates = self.candidates(engine)
        if not candidates:
            raise RuntimeError(f"No healthy remote GPU worker for {engine}")
        payload = {
            "engine": engine,
            "imageBase64": base64.b64encode(image_path.read_bytes()).decode("ascii"),
            "imageName": image_path.name,
            "params": params,
        }
        errors = []
        for worker in candidates:
            try:
                body = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    str(worker["url"]).rstrip("/") + "/generate",
                    data=body,
                    headers=self._headers(worker),
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=int(params.get("remoteGpuTimeoutSeconds", 1800))) as r:
                    data = json.loads(r.read().decode("utf-8"))
                if data.get("artifactBase64"):
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    output_path.write_bytes(base64.b64decode(data["artifactBase64"]))
                    return output_path
                if data.get("artifactUrl"):
                    with urllib.request.urlopen(data["artifactUrl"], timeout=120) as r:
                        blob = r.read()
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    output_path.write_bytes(blob)
                    return output_path
                raise RuntimeError("worker returned no artifact")
            except Exception as exc:
                errors.append(f"{worker.get('name')}: {exc}")
        raise RuntimeError(f"All remote workers failed for {engine}: {'; '.join(errors)}")
