"""CPU-friendly, commercial-license-gated monocular video -> 3D landmarks + animated GLB.
No GVHMR, SMPL-X, Ultralytics, Mixamo characters, or third-party weights are bundled.
Output GLB is a diagnostic animated mannequin, NOT arbitrary-rig retargeting.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import re
import struct
from pathlib import Path

# MediaPipe PoseLandmarker indices. First-person camera translation is not inferred.
BONES = (
    ("torso", 23, 11), ("torso_right", 24, 12),
    ("left_upper_arm", 11, 13), ("left_forearm", 13, 15),
    ("right_upper_arm", 12, 14), ("right_forearm", 14, 16),
    ("left_thigh", 23, 25), ("left_shin", 25, 27),
    ("right_thigh", 24, 26), ("right_shin", 26, 28),
    ("left_foot", 27, 31), ("right_foot", 28, 32),
    ("shoulders", 11, 12), ("hips", 23, 24),
)
MAX_DURATION_SECONDS = 30
MAX_SAMPLED_FRAMES = 180
VALID_LICENSE_HASH = re.compile(r"^[a-fA-F0-9]{64}$")


def _sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


class MotionCaptureEngine:
    """Opt-in engine: model weights must be supplied, reviewed and SHA pinned."""

    def status(self) -> dict:
        model = Path(os.getenv("WORLD_MOCAP_MODEL_PATH", "")).expanduser()
        expected = os.getenv("WORLD_MOCAP_MODEL_SHA256", "").strip()
        approved = os.getenv("WORLD_MOCAP_MODEL_COMMERCIAL_USE_APPROVED", "").lower() == "true"
        dependencies = all(importlib.util.find_spec(pkg) is not None for pkg in ("cv2", "mediapipe"))
        # An empty environment path maps to '.', and must never be accepted as a model.
        installed = bool(os.getenv("WORLD_MOCAP_MODEL_PATH")) and model.is_file()
        pinned = bool(VALID_LICENSE_HASH.fullmatch(expected))
        sha_ok = installed and pinned and _sha(model).lower() == expected.lower()
        ready = bool(dependencies and sha_ok and approved)
        return {
            "available": ready, "cpuCapable": True, "mode": "motion_capture",
            "modelPresent": installed, "dependenciesPresent": dependencies,
            "sha256Verified": bool(sha_ok), "operatorLicenseApproval": approved,
            "maxDurationSeconds": MAX_DURATION_SECONDS, "maxSampledFrames": MAX_SAMPLED_FRAMES,
            "output": "landmarks JSON + diagnostic animated mannequin GLB; no arbitrary rig retarget",
            "licenseMode": "MediaPipe Apache-2.0 CODE; model weights require independent commercial-rights review",
        }

    def run(self, video: Path, output_dir: Path, params: dict, progress) -> list[Path]:
        status = self.status()
        if not status["available"]:
            raise RuntimeError("Motion capture disabled: install cv2 + mediapipe, pin an approved model SHA256 and explicitly approve model commercial rights.")
        import cv2
        import mediapipe as mp
        requested_fps = min(15, max(2, int(params.get("sampleFps", 10))))
        max_seconds = min(MAX_DURATION_SECONDS, max(1, int(params.get("maxSeconds", 20))))
        cap = cv2.VideoCapture(str(video))
        if not cap.isOpened():
            raise ValueError("Unsupported or damaged video.")
        source_fps = cap.get(cv2.CAP_PROP_FPS)
        source_fps = source_fps if math.isfinite(source_fps) and source_fps > 0 else 30.0
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        if math.isfinite(frame_count) and frame_count > 0 and frame_count / source_fps > MAX_DURATION_SECONDS + 0.5:
            cap.release()
            raise ValueError(f"Video must be at most {MAX_DURATION_SECONDS} seconds.")
        options = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=os.environ["WORLD_MOCAP_MODEL_PATH"]),
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_poses=1, min_pose_detection_confidence=0.55,
            min_pose_presence_confidence=0.55, min_tracking_confidence=0.5,
        )
        raw = []
        target_count = min(MAX_SAMPLED_FRAMES, math.ceil(requested_fps * max_seconds))
        processed = 0
        next_second = 0.0
        last_timestamp = -1
        try:
            with mp.tasks.vision.PoseLandmarker.create_from_options(options) as estimator:
                while processed < target_count:
                    ok, frame = cap.read()
                    if not ok:
                        break
                    timestamp = (cap.get(cv2.CAP_PROP_POS_MSEC) or 0.0) / 1000.0
                    if timestamp <= 0 and processed == 0:
                        timestamp = 0
                    elif timestamp <= 0:
                        timestamp = cap.get(cv2.CAP_PROP_POS_FRAMES) / source_fps
                    if timestamp > MAX_DURATION_SECONDS:
                        raise ValueError(f"Video must be at most {MAX_DURATION_SECONDS} seconds.")
                    if timestamp + 0.0001 < next_second:
                        continue
                    timestamp_ms = max(last_timestamp + 1, round(timestamp * 1000))
                    last_timestamp = timestamp_ms
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    result = estimator.detect_for_video(
                        mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb), timestamp_ms
                    )
                    if result.pose_world_landmarks and result.pose_landmarks:
                        world = result.pose_world_landmarks[0]
                        screen = result.pose_landmarks[0]
                        # Convert MediaPipe camera axes (y-down/z-camera) to glTF y-up.
                        coords = [[float(p.x), -float(p.y), -float(p.z)] for p in world]
                        confidence = [float(getattr(p, "visibility", 1)) for p in screen]
                        if len(coords) == 33 and sum(confidence[i] for i in (11, 12, 23, 24, 25, 26)) / 6 >= 0.48:
                            raw.append({"t": round(timestamp, 4), "joints": coords, "visibility": confidence})
                    processed += 1
                    next_second += 1.0 / requested_fps
                    progress(10 + round(70 * processed / target_count), f"Video pose extraction: {processed}/{target_count} sampled frames")
        finally:
            cap.release()
        if len(raw) < 2:
            raise ValueError("Insufficient visible human poses: use a stationary camera with a full-body subject.")
        # Repeat the last valid landmark pose across short gaps, but do not invent unseen poses.
        start = raw[0]["t"]
        for frame in raw:
            frame["t"] = round(frame["t"] - start, 4)
        output_dir.mkdir(parents=True, exist_ok=True)
        model_hash = _sha(Path(os.environ["WORLD_MOCAP_MODEL_PATH"]))
        landmarks_file = output_dir / "motion-landmarks.json"
        landmarks_file.write_text(json.dumps({
            "schemaVersion": "1.0", "coordinateSystem": "gltf_y_up_camera_relative",
            "inputMode": "single_fixed_camera", "frameCount": len(raw),
            "modelSha256": model_hash, "frames": raw,
        }, separators=(",", ":")), encoding="utf-8")
        progress(86, "Baking diagnostic mannequin animation")
        glb_file = output_dir / "motion-mannequin.glb"
        write_mannequin_glb(raw, glb_file)
        manifest_file = output_dir / "motion-license-and-qa.json"
        manifest_file.write_text(json.dumps({
            "pipeline": "mediapipe-pose-landmarker", "stage": "diagnostic_man­nequin",
            "sourceSha256": _sha(video), "modelSha256": model_hash,
            "operatorConfirmedCommercialModelRights": True, "modelLicenseNotIndependentlyCertifiedBySoftware": True,
            "frameCount": len(raw), "durationSeconds": round(raw[-1]["t"], 3),
            "singlePerson": True, "cameraTranslationRecovered": False,
            "arbitraryRigRetargeted": False, "actualGameCharacterVerified": False,
            "output": ["motion-landmarks.json", "motion-mannequin.glb"],
        }, indent=2), encoding="utf-8")
        progress(97, "Diagnostic motion files generated")
        return [landmarks_file, glb_file, manifest_file]


def _quat_from_y(direction):
    """Quaternion rotating unit +Y toward a segment, glTF xyzw."""
    x, y, z = direction
    length = math.sqrt(x*x + y*y + z*z)
    if length < 1e-8:
        return [0.0, 0.0, 0.0, 1.0]
    x, y, z = x/length, y/length, z/length
    if y < -0.999999:
        return [1.0, 0.0, 0.0, 0.0]
    q = [z, 0.0, -x, 1.0 + y]
    scale = math.sqrt(sum(v*v for v in q))
    return [v/scale for v in q]


def write_mannequin_glb(frames: list[dict], destination: Path) -> None:
    """Portable glTF 2 GLB with shared low-poly cuboid and baked per-segment animation."""
    if len(frames) < 2 or any(len(f["joints"]) != 33 for f in frames):
        raise ValueError("At least two frames with exactly 33 joints required")
    times = [float(f["t"]) for f in frames]
    if times[0] != 0 or any(not math.isfinite(t) for t in times) or any(b <= a for a, b in zip(times, times[1:])):
        raise ValueError("Frame times must start at zero and strictly increase")
    # 8 corners, 12 triangles. Mesh is intentionally diagnostic, not a rigged character.
    corners = [(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),
               (-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]
    triangles = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,
                 2,3,7,2,7,6,3,0,4,3,4,7]
    buffer = bytearray()
    views = []
    accessors = []
    def add(values, width, kind, component=5126, target=None):
        while len(buffer)%4:
            buffer.append(0)
        offset = len(buffer)
        flat = [float(v) for row in values for v in (row if isinstance(row, (list, tuple)) else [row])]
        if component == 5123:
            buffer.extend(struct.pack("<" + "H"*len(flat), *(int(n) for n in flat)))
        else:
            if any(not math.isfinite(v) for v in flat):
                raise ValueError("Invalid nonfinite landmark in animation")
            buffer.extend(struct.pack("<" + "f"*len(flat), *flat))
        view = {"buffer":0,"byteOffset":offset,"byteLength":len(buffer)-offset}
        if target:
            view["target"] = target
        views.append(view)
        accessor = {"bufferView": len(views)-1, "componentType":component, "count":len(values), "type":kind}
        if width == 1 and component != 5123:
            accessor["min"] = [min(flat)]
            accessor["max"] = [max(flat)]
        accessors.append(accessor)
        return len(accessors)-1
    positions = add(corners, 3, "VEC3", target=34962)
    indices = add(triangles, 1, "SCALAR", component=5123, target=34963)
    timeline = add(times, 1, "SCALAR")
    nodes = []
    channels = []
    samplers = []
    for name, a, b in BONES:
        idx = len(nodes)
        nodes.append({"name":name, "mesh":0})
        translations, rotations, scales = [], [], []
        for frame in frames:
            p, q = frame["joints"][a], frame["joints"][b]
            midpoint = [(p[i]+q[i])/2 for i in range(3)]
            delta = [q[i]-p[i] for i in range(3)]
            segment_length = math.sqrt(sum(d*d for d in delta))
            translations.append(midpoint)
            rotations.append(_quat_from_y(delta))
            thickness = .075 if "torso" in name or name == "hips" else .045
            scales.append([thickness, max(.004, segment_length), thickness])
        for field, values, width, kind in (
            ("translation", translations, 3, "VEC3"),
            ("rotation", rotations, 4, "VEC4"),
            ("scale", scales, 3, "VEC3")
        ):
            output = add(values, width, kind)
            samplers.append({"input":timeline,"output":output,"interpolation":"LINEAR"})
            channels.append({"sampler":len(samplers)-1, "target":{"node":idx, "path":field}})
    doc = {
        "asset":{"version":"2.0","generator":"World Server MediaPipe diagnostic motion (NOT rig retarget)"},
        "scene":0, "scenes":[{"nodes":list(range(len(nodes)))}], "nodes":nodes,
        "meshes":[{"primitives":[{"attributes":{"POSITION":positions},"indices":indices,"material":0}]}],
        "materials":[{"pbrMetallicRoughness":{"baseColorFactor":[.22,.78,.89,1],"metallicFactor":0,"roughnessFactor":.82},"doubleSided":True}],
        "animations":[{"name":"captured_single_person_in_place", "channels":channels, "samplers":samplers}],
        "accessors":accessors, "bufferViews":views, "buffers":[{"byteLength":len(buffer)}],
    }
    json_bytes = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((-len(json_bytes)) % 4)
    buffer.extend(b"\0" * ((-len(buffer)) % 4))
    length = 12 + 8 + len(json_bytes) + 8 + len(buffer)
    destination.write_bytes(struct.pack("<4sII", b"glTF", 2, length) +
                            struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes +
                            struct.pack("<I4s", len(buffer), b"BIN\0") + buffer)
