from __future__ import annotations

import hashlib
import os
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image


def mask_from_model_output(output: np.ndarray, protected_class_ids: list[int] | None = None, threshold: float = 0.5) -> np.ndarray:
    arr = np.asarray(output)
    if arr.ndim == 4 and arr.shape[0] == 1:
        arr = arr[0]
    if arr.ndim == 3 and arr.shape[0] > 1:
        labels = np.argmax(arr, axis=0)
        ids = protected_class_ids or []
        if not ids:
            raise ValueError("multi-class semantic output requires protectedClassIds")
        return np.isin(labels, np.asarray(ids, dtype=labels.dtype))
    if arr.ndim == 3 and arr.shape[0] == 1:
        arr = arr[0]
    if arr.ndim == 3 and arr.shape[-1] == 1:
        arr = arr[..., 0]
    if arr.ndim != 2:
        raise ValueError(f"unsupported semantic output shape: {arr.shape}")
    if np.issubdtype(arr.dtype, np.integer):
        ids = protected_class_ids or []
        return np.isin(arr, np.asarray(ids, dtype=arr.dtype)) if ids else arr > 0
    return np.nan_to_num(arr.astype(np.float32), nan=0.0) >= float(threshold)


def run_semantic_mask_inference(image_path: Path, output_mask: Path, policy: dict | None = None) -> dict:
    p = dict(policy or {})
    model_value = p.get("model") or os.environ.get("AI3D_SEMANTIC_MODEL")
    if not model_value:
        return {"schemaVersion": 7, "status": "UNAVAILABLE_NO_MODEL", "maskCreated": False}
    model = Path(model_value)
    if not model.is_file() or not Path(image_path).is_file():
        return {"schemaVersion": 7, "status": "UNAVAILABLE_INPUT_OR_MODEL", "maskCreated": False}
    try:
        import onnxruntime as ort
    except Exception:
        return {"schemaVersion": 7, "status": "UNAVAILABLE_ONNXRUNTIME", "maskCreated": False}
    try:
        session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
        inp = session.get_inputs()[0]
        shape = list(inp.shape)
        h = int(shape[-2]) if len(shape) == 4 and isinstance(shape[-2], int) and shape[-2] > 16 else 512
        w = int(shape[-1]) if len(shape) == 4 and isinstance(shape[-1], int) and shape[-1] > 16 else 512
        with Image.open(image_path).convert("RGB") as original:
            original_size = original.size
            image = original.resize((w, h), Image.Resampling.BILINEAR)
        tensor = np.transpose(np.asarray(image, dtype=np.float32) / 255.0, (2, 0, 1))[None, ...]
        output = np.asarray(session.run(None, {inp.name: tensor})[0])
        protected = [int(x) for x in (p.get("protectedClassIds") or [])]
        mask = mask_from_model_output(output, protected, float(p.get("threshold", 0.5)))
        mask_image = Image.fromarray(mask.astype(np.uint8) * 255, mode="L").resize(original_size, Image.Resampling.NEAREST)
        output_mask.parent.mkdir(parents=True, exist_ok=True)
        mask_image.save(output_mask)
        coverage = float(np.asarray(mask_image, dtype=np.uint8).mean() / 255.0)
        return {"schemaVersion": 7, "status": "MASK_CREATED", "maskCreated": True, "maskPath": str(output_mask), "coverage": round(coverage, 6), "protectedClassIds": protected, "model": model.name, "modelSha256": hashlib.sha256(model.read_bytes()).hexdigest(), "outputShape": list(output.shape)}
    except Exception as exc:
        return {"schemaVersion": 7, "status": "INFERENCE_FAILED", "maskCreated": False, "reason": str(exc)}


def render_semantic_reference(blender: str, script: Path, model: Path, output_dir: Path, render_size: int = 512) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    command = [blender, "--background", "--factory-startup", "--python", str(script), "--", "render", "--input", str(model), "--output-dir", str(output_dir), "--size", str(int(render_size))]
    proc = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=600, check=False)
    image = output_dir / "semantic-reference.png"
    camera = output_dir / "semantic-camera.json"
    return {"status": "CREATED" if proc.returncode == 0 and image.is_file() and camera.is_file() else "FAILED", "image": str(image), "camera": str(camera), "logTail": proc.stdout[-4000:]}


def semantic_projection_config(mask_result: dict, camera_path: Path | None) -> dict:
    if not mask_result.get("maskCreated") or not camera_path or not Path(camera_path).is_file():
        return {"enabled": False, "status": "UNVERIFIED_NO_ALIGNED_MASK_CAMERA"}
    return {"enabled": True, "status": "READY", "maskPath": str(mask_result["maskPath"]), "cameraPath": str(camera_path), "minCoverage": 0.001, "maxCoverage": 0.85}
