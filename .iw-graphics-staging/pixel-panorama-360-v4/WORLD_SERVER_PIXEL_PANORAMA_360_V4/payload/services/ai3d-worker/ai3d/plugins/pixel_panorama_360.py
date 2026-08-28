from __future__ import annotations

import io
import json
import math
import os
import shutil
import subprocess
import zipfile
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image, ImageSequence


class PixelPanorama360Engine:
    ALLOWED_ARCHIVE_EXT = {".png", ".jpg", ".jpeg", ".webp"}

    def __init__(self) -> None:
        self.ffmpeg = shutil.which("ffmpeg")

    def available(self) -> bool:
        return bool(self.ffmpeg)

    def status(self) -> dict:
        return {
            "available": self.available(),
            "engine": "CPU Pillow/Numpy + ffmpeg",
            "gpuRequired": False,
            "supports": ["zip", "png", "apng", "gif", "webp", "mp4", "webm"],
        }

    @staticmethod
    def _safe_slug(value: str) -> str:
        out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
        while "--" in out:
            out = out.replace("--", "-")
        return (out[:120] or "pixel-panorama")

    @staticmethod
    def _frame_files(directory: Path) -> list[Path]:
        return sorted(
            [p for p in directory.iterdir() if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}],
            key=lambda p: p.name,
        )

    def _extract_zip(self, input_path: Path, target: Path, max_frames: int) -> list[Path]:
        target.mkdir(parents=True, exist_ok=True)
        total = 0
        with zipfile.ZipFile(input_path) as zf:
            members = []
            for info in zf.infolist():
                if info.is_dir():
                    continue
                suffix = Path(info.filename).suffix.lower()
                if suffix not in self.ALLOWED_ARCHIVE_EXT:
                    continue
                if info.file_size > 128 * 1024 * 1024:
                    raise RuntimeError("Archive frame exceeds 128 MB")
                total += info.file_size
                if total > 1024 * 1024 * 1024:
                    raise RuntimeError("Archive expands beyond 1 GB")
                members.append(info)
            if not members:
                raise RuntimeError("ZIP contains no supported image frames")
            if len(members) > max_frames:
                raise RuntimeError(f"Too many frames in ZIP: {len(members)} > {max_frames}")
            for i, info in enumerate(sorted(members, key=lambda x: x.filename)):
                with zf.open(info) as src:
                    data = src.read()
                out = target / f"{i+1:06d}.png"
                Image.open(io.BytesIO(data)).convert("RGBA").save(out, optimize=True)
        return self._frame_files(target)

    def _extract_animated_image(self, input_path: Path, target: Path, max_frames: int) -> list[Path]:
        target.mkdir(parents=True, exist_ok=True)
        with Image.open(input_path) as im:
            frames = []
            for i, frame in enumerate(ImageSequence.Iterator(im)):
                if i >= max_frames:
                    break
                out = target / f"{i+1:06d}.png"
                frame.convert("RGBA").save(out, optimize=True)
                frames.append(out)
        if not frames:
            raise RuntimeError("Animated image produced no frames")
        return frames

    def _extract_video(self, input_path: Path, target: Path, fps: int, max_frames: int) -> list[Path]:
        if not self.ffmpeg:
            raise RuntimeError("ffmpeg is required")
        target.mkdir(parents=True, exist_ok=True)
        out_pattern = target / "%06d.png"
        subprocess.run(
            [self.ffmpeg, "-y", "-i", str(input_path), "-vf", f"fps={fps}", "-frames:v", str(max_frames), str(out_pattern)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        frames = self._frame_files(target)
        if not frames:
            raise RuntimeError("Video produced no frames")
        return frames

    @staticmethod
    def _auto_animate_still(input_path: Path, target: Path, count: int) -> list[Path]:
        target.mkdir(parents=True, exist_ok=True)
        base = np.array(Image.open(input_path).convert("RGBA"), dtype=np.uint8)
        h, w, _ = base.shape
        if w != h * 2:
            raise RuntimeError(f"Input must be 2:1 equirectangular, got {w}x{h}")
        frames = []
        for i in range(count):
            phase = math.sin((i / max(1, count)) * math.pi * 2)
            arr = base.copy()
            sky = int(round(phase * 2))
            ground = int(round(-phase))
            arr[: int(h * 0.44)] = np.roll(base[: int(h * 0.44)], sky, axis=1)
            arr[int(h * 0.63) :] = np.roll(base[int(h * 0.63) :], ground, axis=1)
            bright = (arr[:, :, 0] > 210) & (arr[:, :, 1] > 165) & (arr[:, :, 2] < 190)
            boost = int((i % 4) * 4)
            arr[:, :, 0][bright] = np.minimum(255, arr[:, :, 0][bright].astype(np.int16) + boost).astype(np.uint8)
            arr[:, :, 1][bright] = np.minimum(255, arr[:, :, 1][bright].astype(np.int16) + boost).astype(np.uint8)
            out = target / f"{i+1:06d}.png"
            Image.fromarray(arr, "RGBA").save(out, optimize=True)
            frames.append(out)
        return frames

    def _prepare_frames(self, input_path: Path, target: Path, params: dict) -> list[Path]:
        suffix = input_path.suffix.lower()
        fps = max(1, min(int(params.get("fps", 8)), 24))
        max_frames = max(1, min(int(params.get("maxFrames", 180)), 300))
        if suffix == ".zip":
            return self._extract_zip(input_path, target, max_frames)
        if suffix in {".gif", ".apng"}:
            return self._extract_animated_image(input_path, target, max_frames)
        if suffix == ".webp":
            with Image.open(input_path) as im:
                if getattr(im, "n_frames", 1) > 1:
                    return self._extract_animated_image(input_path, target, max_frames)
        if suffix in {".mp4", ".webm", ".mov"}:
            return self._extract_video(input_path, target, fps, max_frames)
        if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
            count = max(1, min(int(params.get("autoAnimateFrames", 16)), 48))
            if bool(params.get("autoAnimate", True)) and count > 1:
                return self._auto_animate_still(input_path, target, count)
            out = target / "000001.png"
            Image.open(input_path).convert("RGBA").save(out, optimize=True)
            return [out]
        raise RuntimeError(f"Unsupported panorama input: {suffix}")

    @staticmethod
    def _quality(frames: list[Path]) -> dict:
        samples = []
        seam_scores = []
        for p in frames:
            im = Image.open(p).convert("RGB").resize((512, 256), Image.Resampling.NEAREST)
            a = np.asarray(im, dtype=np.int16)
            seam_scores.append(float(np.abs(a[:, 0] - a[:, -1]).mean() / 255.0))
            samples.append(a)
        transitions = []
        for i in range(1, len(samples)):
            transitions.append(float(np.abs(samples[i] - samples[i - 1]).mean() / 255.0))
        med = float(np.median(transitions)) if transitions else 0.0
        outliers = [
            {"from": i, "to": i + 1, "diff": d}
            for i, d in enumerate(transitions, start=1)
            if d > max(0.20, med * 2.8)
        ]
        seam_max = max(seam_scores) if seam_scores else 0.0
        return {
            "pass": seam_max <= 0.12 and not outliers,
            "seamMax": seam_max,
            "temporalMedian": med,
            "temporalOutliers": outliers,
        }

    @staticmethod
    def _save_tier(frames: list[Path], out_dir: Path, width: int) -> list[str]:
        out_dir.mkdir(parents=True, exist_ok=True)
        urls = []
        for i, src in enumerate(frames):
            with Image.open(src) as im:
                im = im.convert("RGBA")
                height = width // 2
                im = im.resize((width, height), Image.Resampling.NEAREST)
                # Hard seam guard: final column exactly equals first.
                arr = np.array(im)
                arr[:, -1] = arr[:, 0]
                out = out_dir / f"{i+1:06d}.png"
                Image.fromarray(arr, "RGBA").save(out, optimize=True)
                urls.append(str(out.name))
        return urls

    @staticmethod
    def _build_tiles(frames: list[Path], out_root: Path, widths: list[int], tile_size: int) -> list[dict]:
        levels = []
        for width in widths:
            height = width // 2
            cols = math.ceil(width / tile_size)
            rows = math.ceil(height / tile_size)
            for fi, src in enumerate(frames, start=1):
                with Image.open(src) as im:
                    im = im.convert("RGBA").resize((width, height), Image.Resampling.NEAREST)
                    frame_dir = out_root / "tiles" / str(width) / f"f{fi:06d}"
                    frame_dir.mkdir(parents=True, exist_ok=True)
                    for y in range(rows):
                        for x in range(cols):
                            left, top = x * tile_size, y * tile_size
                            tile = im.crop((left, top, min(left + tile_size, width), min(top + tile_size, height)))
                            tile.save(frame_dir / f"{x}_{y}.png", optimize=True)
            levels.append({"width": width, "height": height, "cols": cols, "rows": rows, "tileSize": tile_size, "template": f"tiles/{width}/f{{frame}}/{{x}}_{{y}}.png"})
        return levels

    def _encode(self, frame_dir: Path, fps: int) -> dict:
        if not self.ffmpeg:
            return {}
        result = {}
        pattern = frame_dir / "%06d.png"
        mp4 = frame_dir / "loop.mp4"
        subprocess.run([self.ffmpeg, "-y", "-framerate", str(fps), "-i", str(pattern), "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(mp4)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        result["mp4"] = mp4.name
        webm = frame_dir / "loop.webm"
        try:
            subprocess.run([self.ffmpeg, "-y", "-framerate", str(fps), "-i", str(pattern), "-c:v", "libvpx-vp9", "-lossless", "1", str(webm)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            result["webm"] = webm.name
        except Exception:
            pass
        apng = frame_dir / "loop.apng"
        try:
            subprocess.run([self.ffmpeg, "-y", "-framerate", str(fps), "-i", str(pattern), "-plays", "0", str(apng)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            result["apng"] = apng.name
        except Exception:
            pass
        return result

    @staticmethod
    def _publish_supabase(output_root: Path, slug: str, manifest: dict) -> str | None:
        import requests
        url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
        bucket = os.environ.get("PIXEL_PANORAMA_360_STORAGE_BUCKET", "panorama360")
        if not url or not key:
            return None
        headers = {"Authorization": f"Bearer {key}", "apikey": key, "x-upsert": "true"}
        files = [p for p in output_root.rglob("*") if p.is_file() and p.name != "manifest.json"]
        if len(files) > 2500:
            raise RuntimeError("Refusing Supabase publish with >2500 files; reduce multires levels")
        for p in files:
            rel = p.relative_to(output_root).as_posix()
            h = dict(headers)
            if p.suffix == ".png": h["Content-Type"] = "image/png"
            elif p.suffix == ".mp4": h["Content-Type"] = "video/mp4"
            elif p.suffix == ".webm": h["Content-Type"] = "video/webm"
            elif p.suffix == ".json": h["Content-Type"] = "application/json"
            endpoint = f"{url}/storage/v1/object/{bucket}/{slug}/{rel}"
            r = requests.post(endpoint, headers=h, data=p.read_bytes(), timeout=60)
            if r.status_code >= 300:
                raise RuntimeError(f"Supabase upload failed {r.status_code}: {rel}")
        remote_base = f"{url}/storage/v1/object/public/{bucket}/{slug}"
        def rewrite(v):
            if isinstance(v, str):
                asset_prefixes = ("mobile/", "desktop/", "hq/", "tiles/")
                return f"{remote_base}/{v}" if v.startswith(asset_prefixes) else v
            if isinstance(v, list): return [rewrite(x) for x in v]
            if isinstance(v, dict): return {k: rewrite(x) for k, x in v.items()}
            return v
        remote_manifest = rewrite(manifest)
        remote_manifest["remoteBase"] = remote_base
        body = json.dumps(remote_manifest, ensure_ascii=False, indent=2).encode("utf-8")
        h = dict(headers); h["Content-Type"] = "application/json"
        r = requests.post(f"{url}/storage/v1/object/{bucket}/{slug}/manifest.json", headers=h, data=body, timeout=60)
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase manifest upload failed {r.status_code}")
        return f"{remote_base}/manifest.json"

    def run(self, input_path: Path, job_dir: Path, params: dict, progress: Callable[[int, str], None]) -> list[tuple[Path, str]]:
        if not self.available():
            raise RuntimeError("Pixel Panorama 360 requires ffmpeg")
        fps = max(1, min(int(params.get("fps", 8)), 24))
        tile_size = max(256, min(int(params.get("tileSize", 512)), 1024))
        slug = self._safe_slug(str(params.get("slug") or input_path.stem))
        title = str(params.get("title") or slug)
        source_dir = job_dir / "panorama-source"
        output = job_dir / "panorama-output"
        output.mkdir(parents=True, exist_ok=True)
        progress(8, "Extracting panorama frames")
        frames = self._prepare_frames(input_path, source_dir, params)
        with Image.open(frames[0]) as first:
            w, h = first.size
        if w != h * 2:
            raise RuntimeError(f"Panorama frames must be 2:1, got {w}x{h}")
        progress(20, "Checking temporal consistency and seam")
        quality = self._quality(frames)
        (output / "panorama-quality.json").write_text(json.dumps(quality, ensure_ascii=False, indent=2), encoding="utf-8")
        progress(30, "Building mobile/desktop pixel tiers")
        mobile_w = min(int(params.get("mobileWidth", 1024)), w)
        desktop_w = min(int(params.get("desktopWidth", 2048)), w)
        mobile_frames = self._save_tier(frames, output / "mobile", mobile_w)
        desktop_frames = self._save_tier(frames, output / "desktop", desktop_w)
        progress(52, "Building multires tiles")
        levels = sorted(set([mobile_w, desktop_w, min(w, int(params.get("hqWidth", 4096)))]))
        levels = [x for x in levels if x >= 512]
        tile_meta = self._build_tiles(frames, output, levels, tile_size)
        progress(72, "Encoding animation outputs")
        mobile_video = self._encode(output / "mobile", fps)
        desktop_video = self._encode(output / "desktop", fps)
        manifest = {
            "type": "pixel-panorama-360", "schemaVersion": "4.0.0", "slug": slug, "title": title,
            "description": str(params.get("description") or ""), "fps": fps, "loop": True,
            "source": {"width": w, "height": h, "frameCount": len(frames)},
            "mobile": {"width": mobile_w, "height": mobile_w // 2, "frameCount": len(frames), "frames": [f"mobile/{x}" for x in mobile_frames], **{k: f"mobile/{v}" for k, v in mobile_video.items()}},
            "desktop": {"width": desktop_w, "height": desktop_w // 2, "frameCount": len(frames), "frames": [f"desktop/{x}" for x in desktop_frames], **{k: f"desktop/{v}" for k, v in desktop_video.items()}},
            "multires": {"tileSize": tile_size, "frameCount": len(frames), "levels": tile_meta},
            "qualityReport": quality,
            "hotspots": params.get("hotspots") if isinstance(params.get("hotspots"), list) else [],
        }
        manifest_path = output / "panorama-manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        root_manifest = job_dir / "panorama-manifest.json"
        root_quality = job_dir / "panorama-quality.json"
        root_preview = job_dir / "panorama-preview.png"
        shutil.copy2(manifest_path, root_manifest)
        shutil.copy2(output / "panorama-quality.json", root_quality)
        shutil.copy2(output / "mobile" / "000001.png", root_preview)
        remote_url = None
        if bool(params.get("publishSupabase", False)):
            progress(82, "Publishing panorama to Supabase Storage")
            remote_url = self._publish_supabase(output, slug, manifest)
        package = job_dir / "panorama-package.zip"
        progress(90, "Packing panorama bundle")
        with zipfile.ZipFile(package, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for p in output.rglob("*"):
                if p.is_file():
                    zf.write(p, p.relative_to(output).as_posix())
        report = job_dir / "panorama-result.json"
        report.write_text(json.dumps({"slug": slug, "quality": quality, "remoteManifestUrl": remote_url, "frameCount": len(frames)}, ensure_ascii=False, indent=2), encoding="utf-8")
        progress(99, "Pixel panorama ready")
        meta = {"slug": slug, "remoteManifestUrl": remote_url, "frameCount": len(frames), "quality": quality}
        return [(package, "panorama_package"), (root_manifest, "panorama_manifest"), (report, "panorama_result"), (root_preview, "panorama_preview"), (root_quality, "panorama_quality")], meta
