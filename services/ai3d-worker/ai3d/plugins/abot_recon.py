from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Callable

from .abot_zerogpu import ABotZeroGpuClient


class ABotReconEngine:
    """ABot-Recon video -> streaming 3D reconstruction bridge.

    The upstream project is executed in its own Python environment so its pinned
    Torch/CUDA stack cannot destabilize the main AI3D worker environment.
    """

    def __init__(self) -> None:
        home = os.environ.get("ABOT_RECON_HOME", "").strip()
        self.source = Path(home).expanduser() if home else None
        python_bin = os.environ.get("ABOT_RECON_PYTHON", "").strip()
        self.python = python_bin or sys.executable
        self.ffmpeg = os.environ.get("FFMPEG_BIN", "").strip() or shutil.which("ffmpeg")
        self.zerogpu = ABotZeroGpuClient()

    def local_available(self) -> bool:
        return bool(
            self.source
            and self.source.is_dir()
            and (self.source / "demo.py").is_file()
            and self.ffmpeg
            and self.python
        )

    def available(self) -> bool:
        return self.zerogpu.configured() or self.local_available()

    def status(self) -> dict:
        return {
            "available": self.available(),
            "remoteZeroGpu": self.zerogpu.status(),
            "localAvailable": self.local_available(),
            "sourceConfigured": bool(self.source and self.source.is_dir()),
            "ffmpegAvailable": bool(self.ffmpeg),
            "python": self.python,
            "engine": "ABot-Recon",
            "input": "RGB video",
            "outputs": ["colored point cloud", "camera poses", "relative poses", "metadata"],
            "codeLicense": "Apache-2.0",
            "officialWeightsLicense": "CC BY-NC 4.0",
            "commercialWeightsAllowedByDefault": False,
        }

    @staticmethod
    def _bounded_params(params: dict) -> tuple[float, int, float, int]:
        fps = max(0.25, min(float(params.get("videoFps", 3.0)), 30.0))
        max_frames = max(12, min(int(params.get("maxFrames", 200)), 22_000))
        confidence = max(0.0, min(float(params.get("confidenceThreshold", 0.0)), 1.0))
        max_ply_points = max(10_000, min(int(params.get("maxPlyPoints", 2_000_000)), 10_000_000))
        return fps, max_frames, confidence, max_ply_points

    def _extract_frames(
        self,
        video_path: Path,
        frame_dir: Path,
        fps: float,
        max_frames: int,
        progress: Callable[[int, str], None] | None,
    ) -> list[Path]:
        frame_dir.mkdir(parents=True, exist_ok=True)
        if progress:
            progress(8, f"ABot-Recon: extracting up to {max_frames} RGB frames at {fps:g} fps")
        cmd = [
            str(self.ffmpeg),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(video_path),
            "-vf",
            f"fps={fps:g}",
            "-frames:v",
            str(max_frames),
            "-q:v",
            "2",
            str(frame_dir / "%06d.jpg"),
        ]
        subprocess.run(cmd, check=True, timeout=900)
        frames = sorted(frame_dir.glob("*.jpg"))
        if len(frames) < 2:
            raise RuntimeError("ABot-Recon needs a video with at least two decodable RGB frames.")
        return frames

    def _run_exporter(
        self,
        raw_dir: Path,
        output_path: Path,
        confidence: float,
        max_points: int,
    ) -> Path:
        exporter = Path(__file__).resolve().parents[2] / "tools" / "export_abot_ply.py"
        if not exporter.is_file():
            raise RuntimeError(f"ABot-Recon PLY exporter missing: {exporter}")
        subprocess.run(
            [
                self.python,
                str(exporter),
                str(raw_dir),
                str(output_path),
                "--confidence-threshold",
                str(confidence),
                "--max-points",
                str(max_points),
            ],
            check=True,
            timeout=600,
        )
        if not output_path.is_file() or output_path.stat().st_size < 256:
            raise RuntimeError("ABot-Recon exporter did not produce a valid PLY artifact.")
        return output_path

    def run(
        self,
        video_path: Path,
        job_dir: Path,
        params: dict,
        progress: Callable[[int, str], None] | None = None,
    ) -> list[Path]:
        if self.zerogpu.configured() and not bool(params.get("forceLocalGpu", False)):
            return self.zerogpu.run(video_path, job_dir, params, progress=progress)
        if not self.local_available():
            raise RuntimeError(
                "ABot-Recon runtime is not configured. Configure ABOT_RECON_ZEROGPU_URL + "
                "ABOT_RECON_ZEROGPU_SECRET for the free remote worker, or set ABOT_RECON_HOME + "
                "ABOT_RECON_PYTHON on a Linux NVIDIA GPU worker and ensure ffmpeg is available."
            )
        fps, max_frames, confidence, max_ply_points = self._bounded_params(params)
        frames_dir = job_dir / "abot-frames"
        raw_dir = job_dir / "abot-raw"
        log_path = job_dir / "abot-recon.log"
        loop_closure = bool(params.get("loopClosure", False))
        started = time.time()

        try:
            frames = self._extract_frames(video_path, frames_dir, fps, max_frames, progress)
            if progress:
                progress(22, f"ABot-Recon: reconstructing {len(frames)} frames")

            cmd = [
                self.python,
                str(self.source / "demo.py"),
                "--image-dir",
                str(frames_dir),
                "--output-dir",
                str(raw_dir),
                "--device",
                "cuda",
                "--attention-backend",
                str(params.get("attentionBackend", "sdpa"))
                if str(params.get("attentionBackend", "sdpa")) in {"auto", "paged", "sdpa"}
                else "sdpa",
                "--max-frames",
                str(max_frames),
                "--no-save-local-points",
                "--save-world-points",
                "--save-confidence",
            ]
            cmd.append("--loop-closure" if loop_closure else "--no-loop-closure")
            if confidence > 0:
                cmd.extend(["--confidence-threshold", str(confidence)])

            with log_path.open("w", encoding="utf-8", errors="replace") as log:
                subprocess.run(
                    cmd,
                    cwd=str(self.source),
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    check=True,
                    timeout=max(600, min(int(params.get("timeoutSeconds", 3600)), 14_400)),
                )

            if progress:
                progress(86, "ABot-Recon: exporting colored point cloud")
            point_cloud = self._run_exporter(
                raw_dir,
                job_dir / "abot-world-points.ply",
                confidence,
                max_ply_points,
            )

            outputs = [point_cloud]
            copies = {
                "camera_poses.npy": "abot-camera-poses.npy",
                "relative_poses.npy": "abot-relative-poses.npy",
                "camera_poses_noloop.npy": "abot-camera-poses-noloop.npy",
                "relative_poses_noloop.npy": "abot-relative-poses-noloop.npy",
                "metadata.json": "abot-metadata.json",
            }
            for source_name, target_name in copies.items():
                src = raw_dir / source_name
                if src.is_file():
                    dst = job_dir / target_name
                    shutil.copy2(src, dst)
                    outputs.append(dst)

            manifest = {
                "engine": "ABot-Recon",
                "upstream": "amap-cvlab/ABot-Recon",
                "input": video_path.name,
                "framesProcessed": len(frames),
                "videoFps": fps,
                "maxFrames": max_frames,
                "loopClosure": loop_closure,
                "attentionBackend": cmd[cmd.index("--attention-backend") + 1],
                "confidenceThreshold": confidence,
                "codeLicense": "Apache-2.0",
                "officialWeightsLicense": "CC BY-NC 4.0",
                "commercialWeightsAllowedByDefault": False,
                "durationSeconds": round(time.time() - started, 3),
                "reconstructionScope": "observed RGB viewpoints; unseen geometry is not recovered by evidence",
            }
            manifest_path = job_dir / "abot-recon-manifest.json"
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            outputs.append(manifest_path)
            if log_path.is_file():
                outputs.append(log_path)
            if progress:
                progress(96, "ABot-Recon: reconstruction artifacts verified")
            return outputs
        finally:
            # Raw tensors and extracted JPEGs are disposable after exported evidence is materialized.
            shutil.rmtree(frames_dir, ignore_errors=True)
            shutil.rmtree(raw_dir, ignore_errors=True)
