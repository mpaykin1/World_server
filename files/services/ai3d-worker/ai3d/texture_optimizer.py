from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import threading
import zipfile
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image, ImageFilter

from ai3d.texture_advanced import (
    build_compression_matrix,
    build_detail_macro_assets,
    build_material_instance_plan,
    build_runtime_plan,
    build_texture_array_plan,
    build_tile_seam_candidate,
    build_uv_rebind_plan,
    detect_compression_tools,
    paste_with_extruded_gutter,
    write_json,
)
from ai3d.texture_runtime_v4 import (
    GoldenTextureLibrary,
    build_camera_heatmap_feedback,
    build_engine_adapter_manifest,
    encode_platform_candidates,
    read_telemetry_jsonl,
    resolve_golden_library_root,
    retune_runtime_plan,
    solve_runtime_vram_budget,
)
from ai3d.texture_runtime_v5 import (
    StreamingPolicyStore,
    build_v5_system_plan,
    resolve_streaming_policy_root,
)
from ai3d.texture_runtime_v6 import (
    build_v6_system_plan,
    resolve_material_library_root,
)
from ai3d.texture_runtime_v7 import build_v7_system_plan
from ai3d.texture_runtime_v8 import build_v8_system_plan
from ai3d.texture_runtime_v9 import build_v9_system_plan
from ai3d.texture_runtime_v10 import build_v10_system_plan

IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}
DATA_ROLES = {'normal', 'roughness', 'metallic', 'ao'}
COLOR_ROLES = {'albedo', 'emissive', 'generic'}
ROLE_WORDS = {
    'normal': ('normal', 'nrm', '_n.', '-n.'),
    'roughness': ('roughness', 'rough', '_r.', '-r.'),
    'metallic': ('metallic', 'metalness', 'metal', '_m.', '-m.'),
    'ao': ('ambientocclusion', 'ambient_occlusion', 'occlusion', '_ao.', '-ao.'),
    'emissive': ('emissive', 'emission', 'emit', 'glow'),
    'albedo': ('albedo', 'basecolor', 'base_color', 'diffuse', 'color', 'colour'),
}
MATERIAL_PRESETS = {
    'generic': {'roughness': 0.58, 'metallic': 0.0, 'normalStrength': 2.15, 'aoStrength': 1.6},
    'stone': {'roughness': 0.74, 'metallic': 0.0, 'normalStrength': 2.45, 'aoStrength': 1.9},
    'brick': {'roughness': 0.78, 'metallic': 0.0, 'normalStrength': 2.55, 'aoStrength': 2.0},
    'wood': {'roughness': 0.66, 'metallic': 0.0, 'normalStrength': 2.0, 'aoStrength': 1.55},
    'cloth': {'roughness': 0.82, 'metallic': 0.0, 'normalStrength': 1.55, 'aoStrength': 1.35},
    'leather': {'roughness': 0.58, 'metallic': 0.0, 'normalStrength': 1.7, 'aoStrength': 1.45},
    'metal': {'roughness': 0.36, 'metallic': 0.88, 'normalStrength': 1.7, 'aoStrength': 1.4},
    'iron': {'roughness': 0.43, 'metallic': 0.92, 'normalStrength': 1.85, 'aoStrength': 1.45},
    'steel': {'roughness': 0.31, 'metallic': 0.95, 'normalStrength': 1.7, 'aoStrength': 1.35},
    'copper': {'roughness': 0.4, 'metallic': 0.9, 'normalStrength': 1.7, 'aoStrength': 1.45},
    'bronze': {'roughness': 0.43, 'metallic': 0.88, 'normalStrength': 1.8, 'aoStrength': 1.45},
    'gold': {'roughness': 0.28, 'metallic': 0.98, 'normalStrength': 1.45, 'aoStrength': 1.25},
    'glass': {'roughness': 0.12, 'metallic': 0.0, 'normalStrength': 0.85, 'aoStrength': 0.9},
}
TIER_TARGETS = {'mobile': 1024, 'balanced': 2048, 'ultra': 2048, 'hero': 4096}
_MEMORY_LOCK = threading.Lock()


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()




def _file_meta(path: Path, role: str) -> dict:
    suffix = path.suffix.lower()
    mime = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
        '.ktx2': 'image/ktx2', '.json': 'application/json', '.txt': 'text/plain',
    }.get(suffix, 'application/octet-stream')
    return {'name': path.name, 'role': role, 'bytes': path.stat().st_size, 'sha256': _sha256(path), 'mime': mime}

def _json_hash(value: dict) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(payload).hexdigest()


def _next_pow2(value: int) -> int:
    if value <= 1:
        return 1
    return 1 << int(math.ceil(math.log2(value)))


def _role_from_name(name: str, explicit: str | None = None) -> str:
    if explicit:
        role = explicit.strip().lower()
        if role in {'albedo', 'normal', 'roughness', 'metallic', 'ao', 'emissive', 'generic'}:
            return role
    low = name.lower().replace(' ', '_')
    for role, words in ROLE_WORDS.items():
        if any(word in low for word in words):
            return role
    return 'generic'


def _material_set_key(name: str) -> str:
    stem = Path(name).stem.lower().replace(' ', '_')
    tokens = (
        'ambient_occlusion', 'ambientocclusion', 'base_color', 'basecolor', 'roughness',
        'metalness', 'metallic', 'emissive', 'emission', 'diffuse', 'normal', 'occlusion',
        'albedo', 'colour', 'color', 'rough', 'metal', 'nrm', 'ao', 'emit', 'glow',
    )
    for token in tokens:
        stem = re.sub(rf'(^|[_\-.]){re.escape(token)}($|[_\-.])', '_', stem)
    stem = re.sub(r'[_\-.]+', '_', stem).strip('_')
    return stem or 'material'


def _material_preset(material: str) -> dict:
    low = str(material or 'generic').lower()
    for key, preset in MATERIAL_PRESETS.items():
        if key != 'generic' and key in low:
            return {**MATERIAL_PRESETS['generic'], **preset, 'name': key}
    return {**MATERIAL_PRESETS['generic'], 'name': 'generic'}


def _srgb_to_linear(values: np.ndarray) -> np.ndarray:
    return np.where(values <= 0.04045, values / 12.92, ((values + 0.055) / 1.055) ** 2.4)


def _linear_to_srgb(values: np.ndarray) -> np.ndarray:
    values = np.clip(values, 0.0, 1.0)
    return np.where(values <= 0.0031308, values * 12.92, 1.055 * np.power(values, 1.0 / 2.4) - 0.055)


def _linear_color_resize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    rgba = np.asarray(image.convert('RGBA'), dtype=np.float32) / 255.0
    rgb_linear = _srgb_to_linear(rgba[..., :3])
    alpha = rgba[..., 3]
    premul = rgb_linear * alpha[..., None]
    resized_channels = []
    for channel in range(3):
        plane = Image.fromarray(premul[..., channel].astype(np.float32), 'F').resize(size, Image.Resampling.LANCZOS)
        resized_channels.append(np.asarray(plane, dtype=np.float32))
    alpha_image = Image.fromarray(alpha.astype(np.float32), 'F').resize(size, Image.Resampling.LANCZOS)
    alpha_resized = np.clip(np.asarray(alpha_image, dtype=np.float32), 0.0, 1.0)
    premul_resized = np.stack(resized_channels, axis=2)
    rgb_resized = premul_resized / np.maximum(alpha_resized[..., None], 1e-6)
    srgb = _linear_to_srgb(rgb_resized)
    out = np.concatenate((srgb, alpha_resized[..., None]), axis=2)
    return Image.fromarray(np.clip(out * 255.0, 0, 255).astype(np.uint8), 'RGBA')


def _normal_resize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    arr = np.asarray(image.convert('RGB').resize(size, Image.Resampling.LANCZOS), dtype=np.float32)
    vec = arr / 255.0 * 2.0 - 1.0
    length = np.linalg.norm(vec, axis=2, keepdims=True)
    vec = vec / np.maximum(length, 1e-6)
    out = np.clip((vec * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(out, 'RGB')


def _resize_for_role(image: Image.Image, role: str, size: tuple[int, int], sharpen: bool = False) -> Image.Image:
    if role == 'normal':
        return _normal_resize(image, size)
    if role in {'albedo', 'emissive'}:
        out = _linear_color_resize(image, size)
        if 'A' not in image.getbands():
            out = out.convert('RGB')
    else:
        mode = 'RGBA' if 'A' in image.getbands() else ('L' if role in {'roughness', 'metallic', 'ao'} else 'RGB')
        out = image.convert(mode).resize(size, Image.Resampling.LANCZOS)
    if sharpen and role in COLOR_ROLES:
        out = out.filter(ImageFilter.UnsharpMask(radius=1.0, percent=108, threshold=3))
    return out


def _safe_extract_zip(source: Path, out_dir: Path, max_files: int, max_bytes: int) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    result: list[Path] = []
    total = 0
    with zipfile.ZipFile(source) as archive:
        members = [member for member in archive.infolist() if not member.is_dir()]
        if len(members) > max_files * 4:
            raise ValueError(f'texture pack contains too many entries ({len(members)})')
        image_members = [member for member in members if Path(member.filename).suffix.lower() in IMAGE_EXTENSIONS]
        if len(image_members) > max_files:
            raise ValueError(f'texture pack contains {len(image_members)} textures; max is {max_files}')
        for index, member in enumerate(image_members):
            total += int(member.file_size)
            if total > max_bytes:
                raise ValueError('texture pack uncompressed size exceeds safety limit')
            raw_name = Path(member.filename).name
            if not raw_name:
                continue
            clean = re.sub(r'[^A-Za-z0-9_.-]+', '_', raw_name)[:120]
            destination = out_dir / f'{index:04d}_{clean}'
            with archive.open(member) as source_stream, destination.open('wb') as output_stream:
                shutil.copyfileobj(source_stream, output_stream)
            result.append(destination)
    if not result:
        raise ValueError('texture pack has no PNG/JPEG/WebP images')
    return result


def _entropy(gray: np.ndarray) -> float:
    hist, _ = np.histogram(np.clip(gray * 255.0, 0, 255).astype(np.uint8), bins=256, range=(0, 256), density=False)
    total = hist.sum()
    if total <= 0:
        return 0.0
    p = hist[hist > 0].astype(np.float64) / total
    return float(-(p * np.log2(p)).sum())


def _edge_energy(rgb: np.ndarray) -> float:
    lum = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    gy, gx = np.gradient(lum)
    return float(np.mean(np.sqrt(gx * gx + gy * gy)))


def _tile_seam_score(rgb: np.ndarray) -> float:
    if rgb.shape[0] < 2 or rgb.shape[1] < 2:
        return 1.0
    lr = float(np.mean(np.abs(rgb[:, 0, :] - rgb[:, -1, :])))
    tb = float(np.mean(np.abs(rgb[0, :, :] - rgb[-1, :, :])))
    return max(0.0, min(1.0, 1.0 - (lr + tb) * 0.5))


def _dhash(rgb_image: Image.Image) -> str:
    gray = rgb_image.convert('L').resize((9, 8), Image.Resampling.BILINEAR)
    arr = np.asarray(gray, dtype=np.int16)
    bits = arr[:, 1:] > arr[:, :-1]
    value = 0
    for bit in bits.flatten():
        value = (value << 1) | int(bool(bit))
    return f'{value:016x}'


def _hamming_hex(a: str, b: str) -> int:
    return (int(a, 16) ^ int(b, 16)).bit_count()


def _image_metrics(path: Path, role: str) -> dict:
    with Image.open(path) as raw:
        rgba = raw.convert('RGBA')
        rgb = np.asarray(rgba.convert('RGB'), dtype=np.float32) / 255.0
        alpha = np.asarray(rgba.getchannel('A'), dtype=np.float32) / 255.0
        width, height = raw.size
    lum = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    metrics = {
        'width': width,
        'height': height,
        'pixels': width * height,
        'powerOfTwo': (width & (width - 1) == 0) and (height & (height - 1) == 0),
        'bytes': path.stat().st_size,
        'entropy': round(_entropy(lum), 5),
        'edgeEnergy': round(_edge_energy(rgb), 7),
        'alphaCoverage': round(float(np.mean(alpha > 0.5)), 6),
        'tileSeamScore': round(_tile_seam_score(rgb), 6),
        'perceptualHash': _dhash(rgba.convert('RGB')),
    }
    if role == 'normal':
        vec = rgb * 2.0 - 1.0
        lengths = np.linalg.norm(vec, axis=2)
        metrics['normalMeanLength'] = round(float(lengths.mean()), 5)
        metrics['normalInvalidRatio'] = round(float(np.mean((lengths < 0.75) | (lengths > 1.25))), 6)
    return metrics


def _readiness_score(metrics: dict, role: str, target: int) -> int:
    score = 25
    max_dim = max(int(metrics['width']), int(metrics['height']))
    score += min(20, round(20 * min(max_dim / max(target, 1), 1.0)))
    score += 8 if metrics['powerOfTwo'] else 4
    score += 8 if float(metrics.get('entropy', 0.0)) > 1.0 else 4
    score += 8 if float(metrics.get('edgeEnergy', 0.0)) > 0.001 else 4
    if role == 'normal':
        score += 16 if float(metrics.get('normalInvalidRatio', 1.0)) <= 0.01 else 4
    else:
        score += 12
    score += 9 if metrics['bytes'] > 0 else 0
    return max(0, min(int(score), 92))


def _global_ssim(a: np.ndarray, b: np.ndarray) -> float:
    # Stable whole-image SSIM approximation after candidate is downsampled to source size.
    a_l = a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722
    b_l = b[..., 0] * 0.2126 + b[..., 1] * 0.7152 + b[..., 2] * 0.0722
    mu_a, mu_b = float(a_l.mean()), float(b_l.mean())
    var_a, var_b = float(a_l.var()), float(b_l.var())
    cov = float(np.mean((a_l - mu_a) * (b_l - mu_b)))
    c1, c2 = 0.01 ** 2, 0.03 ** 2
    numerator = (2 * mu_a * mu_b + c1) * (2 * cov + c2)
    denominator = (mu_a * mu_a + mu_b * mu_b + c1) * (var_a + var_b + c2)
    return max(0.0, min(1.0, numerator / denominator if denominator else 1.0))


def _compare_candidate(original: Path, candidate: Path, role: str) -> dict:
    with Image.open(original) as source, Image.open(candidate) as result:
        src_rgba = source.convert('RGBA')
        result_rgba = _resize_for_role(result, role, source.size, sharpen=False).convert('RGBA')
        a = np.asarray(src_rgba.convert('RGB'), dtype=np.float32) / 255.0
        b = np.asarray(result_rgba.convert('RGB'), dtype=np.float32) / 255.0
        aa = np.asarray(src_rgba.getchannel('A'), dtype=np.float32) / 255.0
        ba = np.asarray(result_rgba.getchannel('A'), dtype=np.float32) / 255.0
    mae = float(np.mean(np.abs(a - b)))
    similarity = max(0.0, 1.0 - mae)
    ssim = _global_ssim(a, b)
    raw_edge_a = _edge_energy(a)
    edge_a = max(raw_edge_a, 1e-8)
    edge_b = _edge_energy(b)
    edge_ratio = edge_b / edge_a if raw_edge_a > 1e-6 else 1.0
    alpha_delta = abs(float(np.mean(aa > 0.5)) - float(np.mean(ba > 0.5)))
    source_seam = _tile_seam_score(a)
    candidate_seam = _tile_seam_score(b)
    return {
        'similarity': round(similarity, 6),
        'ssim': round(ssim, 6),
        'sourceEdgeEnergy': round(raw_edge_a, 8),
        'candidateEdgeEnergy': round(edge_b, 8),
        'edgeRetentionRatio': round(edge_ratio, 6),
        'alphaCoverageDelta': round(alpha_delta, 6),
        'sourceTileSeamScore': round(source_seam, 6),
        'candidateTileSeamScore': round(candidate_seam, 6),
        'tileSeamRegression': round(max(0.0, source_seam - candidate_seam), 6),
    }


def _gate_candidate(original: Path, candidate: Path, role: str) -> dict:
    metrics = _compare_candidate(original, candidate, role)
    thresholds = {
        'similarity': 0.945 if role in COLOR_ROLES else 0.98,
        'ssim': 0.92 if role in COLOR_ROLES else 0.975,
        'edgeMin': 0.68 if role in COLOR_ROLES else 0.82,
        'edgeMax': 1.85 if role in COLOR_ROLES else 1.25,
        'alphaDelta': 0.01,
        'tileSeamRegression': 0.08,
    }
    passed = (
        metrics['similarity'] >= thresholds['similarity']
        and metrics['ssim'] >= thresholds['ssim']
        and thresholds['edgeMin'] <= metrics['edgeRetentionRatio'] <= thresholds['edgeMax']
        and metrics['alphaCoverageDelta'] <= thresholds['alphaDelta']
        and metrics['tileSeamRegression'] <= thresholds['tileSeamRegression']
    )
    if role == 'normal':
        out = _image_metrics(candidate, role)
        metrics['normalInvalidRatio'] = out.get('normalInvalidRatio', 1.0)
        passed = passed and metrics['normalInvalidRatio'] <= 0.01
    return {'passed': bool(passed), 'metrics': metrics, 'thresholds': thresholds}


def _derive_pbr(albedo: Path, out_dir: Path, material: str, wetness: float) -> list[Path]:
    preset = _material_preset(material)
    with Image.open(albedo) as raw:
        rgb = np.asarray(raw.convert('RGB'), dtype=np.float32) / 255.0
    lum = np.clip(rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722, 0, 1)
    gy, gx = np.gradient(lum)
    strength = float(preset['normalStrength'])
    nx, ny = -gx * strength, -gy * strength
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length, ny / length, nz / length), axis=2)
    normal = np.clip((normal * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)

    detail = np.sqrt(gx * gx + gy * gy)
    p99 = max(float(np.percentile(detail, 99.0)), 1e-6)
    detail = np.clip(detail / p99, 0.0, 1.0)
    wetness = max(0.0, min(float(wetness), 0.35))
    rough_default = max(0.04, float(preset['roughness']) * (1.0 - wetness * 0.7))
    rough = np.clip(rough_default + (detail - 0.35) * 0.16, 0.05, 0.96)

    blur = np.asarray(
        Image.fromarray(np.round(lum * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(3.0)),
        dtype=np.float32,
    ) / 255.0
    ao = np.clip(1.0 - np.maximum(blur - lum, 0.0) * float(preset['aoStrength']), 0.3, 1.0)
    metal = np.full_like(lum, float(preset['metallic']))

    out_dir.mkdir(parents=True, exist_ok=True)
    normal_path = out_dir / 'NORMAL_INFERRED.png'
    rough_path = out_dir / 'ROUGHNESS_INFERRED.png'
    ao_path = out_dir / 'AO_INFERRED.png'
    orm_path = out_dir / 'ORM_INFERRED.png'
    Image.fromarray(normal, 'RGB').save(normal_path, optimize=True)
    Image.fromarray(np.round(rough * 255).astype(np.uint8), 'L').save(rough_path, optimize=True)
    Image.fromarray(np.round(ao * 255).astype(np.uint8), 'L').save(ao_path, optimize=True)
    packed = np.stack((ao, rough, metal), axis=2)
    Image.fromarray(np.round(packed * 255).astype(np.uint8), 'RGB').save(orm_path, optimize=True)
    return [normal_path, rough_path, ao_path, orm_path]


def _try_realesrgan(source: Path, destination: Path, role: str, scale: int) -> str | None:
    if role not in COLOR_ROLES or scale <= 1:
        return None
    executable = os.environ.get('REALESRGAN_BIN') or shutil.which('realesrgan-ncnn-vulkan')
    if not executable:
        return None
    destination.parent.mkdir(parents=True, exist_ok=True)
    requested_scale = 4 if scale >= 4 else 2
    process = subprocess.run(
        [executable, '-i', str(source), '-o', str(destination), '-s', str(requested_scale)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=900,
        check=False,
    )
    return 'realesrgan-ncnn-vulkan' if process.returncode == 0 and destination.is_file() else None


def _try_ktx2(source: Path, destination: Path, role: str) -> str | None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    toktx = os.environ.get('TOKTX_BIN') or shutil.which('toktx')
    if toktx:
        args = [toktx, '--t2', '--genmipmap']
        if role in DATA_ROLES:
            args += ['--encode', 'uastc', '--linear']
        else:
            args += ['--encode', 'etc1s']
        args += [str(destination), str(source)]
        process = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=600, check=False)
        if process.returncode == 0 and destination.is_file() and destination.stat().st_size > 64:
            return 'toktx'
    basisu = os.environ.get('BASISU_BIN') or shutil.which('basisu')
    if basisu:
        args = [basisu, '-ktx2', '-mipmap', '-q', '255', '-output_file', str(destination), str(source)]
        process = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=600, check=False)
        if process.returncode == 0 and destination.is_file() and destination.stat().st_size > 64:
            return 'basisu'
    return None


def _target_size(width: int, height: int, target: int, max_dimension: int) -> tuple[int, int, int]:
    max_dim = max(width, height)
    scale = 1
    while max_dim * scale < target and scale < 4:
        scale *= 2
    desired_width = width * scale
    desired_height = height * scale
    if max(desired_width, desired_height) > max_dimension:
        ratio = max_dimension / max(desired_width, desired_height)
        desired_width = max(1, round(desired_width * ratio))
        desired_height = max(1, round(desired_height * ratio))
    return desired_width, desired_height, scale


def _mip_plan(width: int, height: int, max_levels: int = 16) -> list[tuple[int, int]]:
    result = []
    w, h = width, height
    for _ in range(max_levels):
        result.append((w, h))
        if w == 1 and h == 1:
            break
        w, h = max(1, w // 2), max(1, h // 2)
    return result


def _emit_mips(source: Path, role: str, prefix: str, job_dir: Path, max_levels: int) -> list[Path]:
    outputs = []
    with Image.open(source) as image:
        for level, (width, height) in enumerate(_mip_plan(image.width, image.height, max_levels)):
            if level == 0:
                continue
            path = job_dir / f'{prefix}_MIP_{level:02d}_{width}x{height}.png'
            _resize_for_role(image, role, (width, height), sharpen=False).save(path, optimize=True)
            outputs.append(path)
    return outputs


def _write_webp(source: Path, destination: Path, role: str) -> None:
    with Image.open(source) as image:
        if role in DATA_ROLES:
            image.save(destination, 'WEBP', lossless=True, method=6)
        else:
            image.save(destination, 'WEBP', quality=94, method=6)


def _make_default_channel(size: tuple[int, int], value: int) -> Image.Image:
    return Image.new('L', size, int(value))


def _pack_source_orm(sets: dict[str, dict[str, dict]], job_dir: Path, material: str) -> list[dict]:
    outputs = []
    preset = _material_preset(material)
    for set_key, roles in sorted(sets.items()):
        available = [role for role in ('ao', 'roughness', 'metallic') if role in roles]
        if len(available) < 2:
            continue
        reference = roles[available[0]]['enhancedPath']
        with Image.open(reference) as ref:
            size = ref.size
        channels = []
        sources = {}
        defaults = {
            'ao': 255,
            'roughness': round(float(preset['roughness']) * 255),
            'metallic': round(float(preset['metallic']) * 255),
        }
        for role in ('ao', 'roughness', 'metallic'):
            if role in roles:
                with Image.open(roles[role]['enhancedPath']) as img:
                    channel = img.convert('L').resize(size, Image.Resampling.LANCZOS)
                sources[role] = roles[role]['source']
            else:
                channel = _make_default_channel(size, defaults[role])
                sources[role] = f'DEFAULT_{defaults[role]}'
            channels.append(np.asarray(channel, dtype=np.uint8))
        packed = np.stack(channels, axis=2)
        safe_key = re.sub(r'[^a-zA-Z0-9_.-]+', '_', set_key)[:64]
        out = job_dir / f'ORM_SOURCE_{safe_key}.png'
        Image.fromarray(packed, 'RGB').save(out, optimize=True)
        outputs.append({'path': out, 'setKey': set_key, 'channels': sources, 'truth': 'SOURCE_OR_EXPLICIT_DEFAULT'})
    return outputs


def _pack_atlas(items: list[dict], role: str, job_dir: Path, max_size: int, padding: int) -> tuple[list[Path], list[dict]]:
    if len(items) < 2:
        return [], []
    entries = []
    for item in items:
        with Image.open(item['enhancedPath']) as image:
            entries.append({**item, 'width': image.width, 'height': image.height})
    entries.sort(key=lambda item: (-item['height'], -item['width'], item['source']))
    pages: list[list[dict]] = [[]]
    x = y = row_height = 0
    for entry in entries:
        width = entry['width'] + padding * 2
        height = entry['height'] + padding * 2
        if width > max_size or height > max_size:
            continue
        if x + width > max_size:
            x = 0
            y += row_height
            row_height = 0
        if y + height > max_size:
            pages.append([])
            x = y = row_height = 0
        placement = {**entry, 'x': x + padding, 'y': y + padding, 'page': len(pages) - 1}
        pages[-1].append(placement)
        x += width
        row_height = max(row_height, height)

    paths: list[Path] = []
    manifest: list[dict] = []
    for page_index, placements in enumerate(pages):
        if not placements:
            continue
        used_width = max(p['x'] + p['width'] + padding for p in placements)
        used_height = max(p['y'] + p['height'] + padding for p in placements)
        atlas_size = (_next_pow2(min(max_size, used_width)), _next_pow2(min(max_size, used_height)))
        mode = 'RGB' if role == 'normal' else ('L' if role in {'roughness', 'metallic', 'ao'} else 'RGBA')
        fill = 128 if mode == 'L' else ((128, 128, 255) if role == 'normal' else (0, 0, 0, 0))
        atlas = Image.new(mode, atlas_size, fill)
        for placement in placements:
            with Image.open(placement['enhancedPath']) as image:
                tile = image.convert(mode)
                paste_with_extruded_gutter(atlas, tile, placement['x'], placement['y'], padding)
            manifest.append({
                'role': role,
                'source': placement['source'],
                'setKey': placement['setKey'],
                'page': page_index,
                'x': placement['x'],
                'y': placement['y'],
                'width': placement['width'],
                'height': placement['height'],
                'atlasWidth': atlas_size[0],
                'atlasHeight': atlas_size[1],
                'gutterPixels': padding,
                'gutterExtruded': True,
                'u0': round(placement['x'] / atlas_size[0], 8),
                'v0': round(placement['y'] / atlas_size[1], 8),
                'u1': round((placement['x'] + placement['width']) / atlas_size[0], 8),
                'v1': round((placement['y'] + placement['height']) / atlas_size[1], 8),
            })
        path = job_dir / f'ATLAS_{role.upper()}_{page_index:02d}.png'
        atlas.save(path, optimize=True)
        paths.append(path)
    return paths, manifest



def _atlas_role_mode_fill(role: str):
    if role == 'normal':
        return 'RGB', (128, 128, 255)
    if role in {'roughness', 'metallic', 'ao'}:
        defaults = {'roughness': 160, 'metallic': 0, 'ao': 255}
        return 'L', defaults[role]
    return 'RGBA', (0, 0, 0, 0)


def _pack_coherent_atlases(set_roles: dict[str, dict[str, dict]], job_dir: Path, max_size: int, padding: int) -> tuple[list[Path], list[dict], list[dict]]:
    slots = []
    incompatible = []
    for set_key, roles in sorted(set_roles.items()):
        if not roles:
            continue
        sizes = []
        for role, item in roles.items():
            with Image.open(item['enhancedPath']) as image:
                sizes.append((role, image.width, image.height))
        ratios = [w / max(h, 1) for _, w, h in sizes]
        if ratios and (max(ratios) / max(min(ratios), 1e-9) > 1.02):
            incompatible.append({
                'setKey': set_key,
                'reason': 'PBR_ASPECT_RATIO_MISMATCH',
                'sizes': [{'role': role, 'width': w, 'height': h} for role, w, h in sizes],
            })
            continue
        width = max(w for _, w, _ in sizes)
        height = max(h for _, _, h in sizes)
        slots.append({'setKey': set_key, 'roles': roles, 'width': width, 'height': height})
    if len(slots) < 2:
        return [], [], incompatible
    slots.sort(key=lambda item: (-item['height'], -item['width'], item['setKey']))
    pages: list[list[dict]] = [[]]
    x = y = row_height = 0
    for slot in slots:
        outer_w = slot['width'] + padding * 2
        outer_h = slot['height'] + padding * 2
        if outer_w > max_size or outer_h > max_size:
            incompatible.append({'setKey': slot['setKey'], 'reason': 'SLOT_EXCEEDS_MAX_ATLAS', 'width': slot['width'], 'height': slot['height']})
            continue
        if x + outer_w > max_size:
            x = 0
            y += row_height
            row_height = 0
        if y + outer_h > max_size:
            pages.append([])
            x = y = row_height = 0
        pages[-1].append({**slot, 'x': x + padding, 'y': y + padding, 'page': len(pages) - 1})
        x += outer_w
        row_height = max(row_height, outer_h)

    paths: list[Path] = []
    manifest: list[dict] = []
    for page_index, placements in enumerate(pages):
        if not placements:
            continue
        used_width = max(p['x'] + p['width'] + padding for p in placements)
        used_height = max(p['y'] + p['height'] + padding for p in placements)
        atlas_size = (_next_pow2(min(max_size, used_width)), _next_pow2(min(max_size, used_height)))
        page_roles = sorted({role for placement in placements for role in placement['roles']})
        for role in page_roles:
            mode, fill = _atlas_role_mode_fill(role)
            atlas = Image.new(mode, atlas_size, fill)
            for placement in placements:
                role_item = placement['roles'].get(role)
                if role_item:
                    with Image.open(role_item['enhancedPath']) as image:
                        tile = _resize_for_role(image, role, (placement['width'], placement['height']), sharpen=False).convert(mode)
                    source_name = role_item['source']
                    truth = 'SOURCE'
                else:
                    tile = Image.new(mode, (placement['width'], placement['height']), fill)
                    source_name = None
                    truth = 'DEFAULT_FILL_FOR_COHERENT_LAYOUT'
                paste_with_extruded_gutter(atlas, tile, placement['x'], placement['y'], padding)
                manifest.append({
                    'role': role,
                    'source': source_name,
                    'setKey': placement['setKey'],
                    'page': page_index,
                    'x': placement['x'],
                    'y': placement['y'],
                    'width': placement['width'],
                    'height': placement['height'],
                    'atlasWidth': atlas_size[0],
                    'atlasHeight': atlas_size[1],
                    'gutterPixels': padding,
                    'gutterExtruded': True,
                    'coherentSlotAcrossRoles': True,
                    'truth': truth,
                    'u0': round(placement['x'] / atlas_size[0], 8),
                    'v0': round(placement['y'] / atlas_size[1], 8),
                    'u1': round((placement['x'] + placement['width']) / atlas_size[0], 8),
                    'v1': round((placement['y'] + placement['height']) / atlas_size[1], 8),
                })
            path = job_dir / f'ATLAS_{role.upper()}_{page_index:02d}.png'
            atlas.save(path, optimize=True)
            paths.append(path)
    return paths, manifest, incompatible

def _cache_root(job_dir: Path) -> Path:
    explicit = os.environ.get('AI3D_TEXTURE_CACHE_DIR')
    if explicit:
        root = Path(explicit)
    elif job_dir.parent.name == 'jobs':
        root = job_dir.parent.parent / 'texture-cache'
    else:
        root = job_dir / '.texture-cache'
    root.mkdir(parents=True, exist_ok=True)
    return root


def _quality_memory_path(cache_root: Path) -> Path:
    return cache_root / 'quality-memory.json'


def _load_quality_memory(cache_root: Path) -> dict:
    path = _quality_memory_path(cache_root)
    with _MEMORY_LOCK:
        if not path.is_file():
            return {'schemaVersion': 1, 'profiles': {}}
        try:
            data = json.loads(path.read_text('utf-8'))
            if isinstance(data, dict) and isinstance(data.get('profiles'), dict):
                return data
        except Exception:
            pass
    return {'schemaVersion': 1, 'profiles': {}}


def _memory_profile_key(role: str, material: str, tier: str) -> str:
    preset = _material_preset(material)['name']
    return f'{role}:{preset}:{tier}'


def _memory_recommends_skipping_ai(entry: dict) -> bool:
    attempts = int(entry.get('aiAttempts', 0))
    accepted = int(entry.get('aiAccepted', 0))
    return attempts >= 4 and accepted / max(attempts, 1) < 0.25


def _save_quality_memory(cache_root: Path, memory: dict) -> None:
    path = _quality_memory_path(cache_root)
    temp = path.with_suffix('.tmp')
    with _MEMORY_LOCK:
        temp.write_text(json.dumps(memory, ensure_ascii=False, indent=2, sort_keys=True), encoding='utf-8')
        temp.replace(path)


def _apply_memory_updates(memory: dict, updates: list[dict]) -> dict:
    profiles = memory.setdefault('profiles', {})
    for update in updates:
        key = update['key']
        entry = profiles.setdefault(key, {
            'runs': 0, 'aiAttempts': 0, 'aiAccepted': 0, 'fallbacks': 0,
            'meanSsim': 0.0, 'meanSimilarity': 0.0, 'meanWebpSaving': 0.0,
        })
        runs = int(entry.get('runs', 0)) + 1
        previous_runs = runs - 1
        entry['runs'] = runs
        if update.get('aiAttempted'):
            entry['aiAttempts'] = int(entry.get('aiAttempts', 0)) + 1
        if update.get('aiAccepted'):
            entry['aiAccepted'] = int(entry.get('aiAccepted', 0)) + 1
        if update.get('fallbackApplied'):
            entry['fallbacks'] = int(entry.get('fallbacks', 0)) + 1
        for field, source_key in (
            ('meanSsim', 'ssim'), ('meanSimilarity', 'similarity'), ('meanWebpSaving', 'webpSaving'),
        ):
            old_value = float(entry.get(field, 0.0))
            new_value = float(update.get(source_key, 0.0))
            entry[field] = round((old_value * previous_runs + new_value) / runs, 6)
        attempts = int(entry.get('aiAttempts', 0))
        accepted = int(entry.get('aiAccepted', 0))
        entry['aiAcceptanceRate'] = round(accepted / max(attempts, 1), 6) if attempts else None
        entry['recommendation'] = 'skip-ai-upscale' if _memory_recommends_skipping_ai(entry) else 'normal-policy'
    return memory


def _cache_key(source: Path, params: dict) -> str:
    return hashlib.sha256((_sha256(source) + ':' + _json_hash(params)).encode('ascii')).hexdigest()


def _cache_restore(cache_dir: Path, destinations: dict[str, Path]) -> bool:
    manifest = cache_dir / 'cache-manifest.json'
    if not manifest.is_file():
        return False
    try:
        meta = json.loads(manifest.read_text('utf-8'))
    except Exception:
        return False
    for key, destination in destinations.items():
        cached_name = meta.get('files', {}).get(key)
        if not cached_name or not (cache_dir / cached_name).is_file():
            return False
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(cache_dir / cached_name, destination)
    return True


def _cache_store(cache_dir: Path, sources: dict[str, Path]) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    files = {}
    for key, source in sources.items():
        if not source.is_file():
            continue
        destination = cache_dir / f'{key}{source.suffix.lower()}'
        shutil.copy2(source, destination)
        files[key] = destination.name
    (cache_dir / 'cache-manifest.json').write_text(json.dumps({'files': files}, indent=2), encoding='utf-8')


class TextureOptimizer:
    VERSION = '10.0.0'

    def status(self) -> dict:
        return {
            'available': True,
            'version': self.VERSION,
            'singleOrZipPack': True,
            'roles': ['albedo', 'normal', 'roughness', 'metallic', 'ao', 'emissive', 'generic'],
            'materialPresets': sorted(MATERIAL_PRESETS),
            'webp': True,
            'ktx2': bool(os.environ.get('TOKTX_BIN') or shutil.which('toktx') or os.environ.get('BASISU_BIN') or shutil.which('basisu')),
            'mipmaps': True,
            'ormPacking': True,
            'atlasCandidate': True,
            'atlasExtrudedGutters': True,
            'coherentPbrAtlasLayout': True,
            'uvRebindPlan': True,
            'virtualTextureBudgetPlan': True,
            'screenSpaceTexelDensityGovernor': True,
            'platformCompressionMatrix': True,
            'tileSeamRepairCandidate': True,
            'detailNormalSynthesis': True,
            'macroVariationSynthesis': True,
            'textureArrayPlan': True,
            'materialInstanceDedupPlan': True,
            'runtimePerformanceGateHarness': True,
            'compressionTools': {k: bool(v) for k, v in detect_compression_tools().items()},
            'contentAddressedCache': True,
            'exactDeduplication': True,
            'multiMetricRegressionGate': True,
            'linearLightColorResize': True,
            'premultipliedAlphaResize': True,
            'nearDuplicateDetection': True,
            'pbrSetHealth': True,
            'goldenMaterialMemory': True,
            'normalSafeResize': True,
            'inferredPbr': True,
            'realEsrgan': bool(os.environ.get('REALESRGAN_BIN') or shutil.which('realesrgan-ncnn-vulkan')),
            'engineBindingManifest': True,
            'persistentGoldenTextureLibrary': True,
            'cameraHeatmapFeedback': True,
            'engineRuntimeAdapters': True,
            'automaticUvRebindCandidate': True,
            'platformCompressionExecutionWhenToolsPresent': True,
            'textureArrayRuntimeAdapter': True,
            'runtimeMetricCollectors': True,
            'automaticVramBudgetSolver': True,
            'renderBackComparator': True,
            'optionalGoldenRemoteSync': True,
            'automaticUvUnwrapRepackCandidate': True,
            'predictiveTexturePrefetch': True,
            'gpuCapabilityDrivenCompression': True,
            'virtualTexturePhysicalPageAdapters': True,
            'streamingPolicyLearning': True,
            'automaticRenderBackCaptureOrchestrator': True,
            'safeOneMipLearningClamp': True,
            'closedLoopPolicyPromotionGate': True,
            'semanticSaliencyPrioritization': True,
            'automatedExplorationMissions': True,
            'networkAwareTextureScheduling': True,
            'softwareVirtualTexturePageCache': True,
            'shaderMaterialTextureCooptimization': True,
            'crossProjectMaterialCanonicalization': True,
            'policyDriftRollbackDetector': True,
            'deviceBenchmarkFarmPlanner': True,
            'contentAwareSuperResolutionRouter': True,
            'uvStretchOverlapFoldRepairCandidate': True,
            'specularNormalAntialiasingPlan': True,
            'perTileAdaptiveCompressionPlan': True,
            'incrementalAtlasDefragmentation': True,
            'signedContentAddressedCdnManifest': True,
            'distributedTranscodeBenchmarkQueue': True,
            'unifiedCrossSubsystemQualityGovernor': True,
            'memoryResidencySoakAnalysis': True,
            'regressionRootCauseClassifier': True,
            'temporalShimmerQualityGate': True,
            'multiHostLeaseFencingQueue': True,
            'shaderCachePrewarmPlan': True,
            'boundedLearnedPrefetchStore': True,
            'atomicSignedCdnPublisher': True,
            'canonicalTileTrimLibrary': True,
            'physicalDeviceLabOrchestrator': True,
            'executableUnifiedGovernorAdapters': True,
            'longTermCohortDriftDetection': True,
            'immutablePromotionLedger': True,
            'managedExternalQueueAdapters': True,
            'verifiedRemoteR2S3Publisher': True,
            'opticalFlowTemporalComparator': True,
            'shaderHitchTelemetry': True,
            'routeModelPrefetchV2': True,
            'crossProjectProvenanceGraph': True,
            'remoteDeviceFarmExecutors': True,
            'frameGraphCausalProfiler': True,
            'automaticRegressionBisect': True,
            'globalSceneQualityOptimizer': True,
            'longHorizonResourceForecast': True,
            'signedReproducibleBuildAttestations': True,
            'hardwareSparseResidencyClaimed': False,
            'nonDestructive': True,
        }

    def run(self, job: dict, progress: Callable[[int, str], None]) -> dict:
        source = Path(job['input_path'])
        job_dir = source.parent
        params = job.get('params') or {}
        tier = str(params.get('qualityTier', 'ultra')).lower()
        target = max(256, min(int(params.get('targetMin', TIER_TARGETS.get(tier, 2048))), 4096))
        max_dimension = max(target, min(int(params.get('maxDimension', 4096)), 8192))
        max_files = max(1, min(int(params.get('maxTextures', 256)), 1024))
        max_unpacked_mb = max(32, min(int(params.get('maxUnpackedMB', 1024)), 4096))
        explicit_role = params.get('role')
        material = str(params.get('material', 'generic'))
        derive_pbr = bool(params.get('derivePbr', True))
        use_ai = bool(params.get('useAiUpscale', True))
        use_cache = bool(params.get('useCache', True))
        emit_mips = bool(params.get('emitMipFiles', False))
        max_mip_levels = max(1, min(int(params.get('maxMipLevels', 16)), 20))
        build_atlas = bool(params.get('buildAtlasCandidate', True))
        max_atlas = max(1024, min(int(params.get('maxAtlasSize', 4096)), 8192))
        atlas_padding = max(2, min(int(params.get('atlasPadding', 8)), 64))
        repair_tile_seams = bool(params.get('repairTileSeams', True))
        seam_band = max(1, min(int(params.get('tileSeamBand', 8)), 32))
        synthesize_detail_layers = bool(params.get('synthesizeDetailLayers', True))
        wetness = max(0.0, min(float(params.get('wetness', 0.08)), 0.35))
        original_name = str(params.get('_originalFilename') or source.name)
        execute_platform_compression = bool(params.get('executePlatformCompression', True))
        telemetry_path_param = params.get('cameraTelemetryPath')
        telemetry_inline = params.get('cameraTelemetry') if isinstance(params.get('cameraTelemetry'), list) else []

        progress(4, 'Texture input validation and indexing')
        if source.suffix.lower() == '.zip':
            inputs = _safe_extract_zip(source, job_dir / 'texture-source', max_files, max_unpacked_mb * 1024 * 1024)
        else:
            inputs = [source]

        file_meta = _file_meta
        files: list[dict] = []
        rows: list[dict] = []
        exact_seen: dict[str, dict] = {}
        set_roles: dict[str, dict[str, dict]] = {}
        role_items: dict[str, list[dict]] = {role: [] for role in ('albedo', 'normal', 'roughness', 'metallic', 'ao', 'emissive', 'generic')}
        cache_hits = 0
        dedupe_hits = 0
        ktx2_count = 0
        cache_base = _cache_root(job_dir)
        quality_memory = _load_quality_memory(cache_base)
        golden_root, golden_storage_mode = resolve_golden_library_root(job_dir)
        golden_library = GoldenTextureLibrary(golden_root)
        golden_promotions: list[dict] = []
        platform_compression_results: list[dict] = []
        compression_tools = detect_compression_tools()
        memory_updates: list[dict] = []
        memory_ai_skips = 0

        for index, input_path in enumerate(inputs):
            pct = 7 + int(index / max(len(inputs), 1) * 70)
            display_name = input_path.name.split('_', 1)[-1] if source.suffix.lower() == '.zip' else original_name
            role = _role_from_name(display_name, explicit_role if len(inputs) == 1 else None)
            set_key = _material_set_key(display_name)
            progress(pct, f'Optimizing texture {index + 1}/{len(inputs)}: {role}')
            source_sha = _sha256(input_path)
            in_metrics = _image_metrics(input_path, role)
            input_score = _readiness_score(in_metrics, role, target)

            prefix = f'TEX_{index:03d}'
            master = job_dir / f'{prefix}_MASTER.png'
            enhanced = job_dir / f'{prefix}_ENHANCED.png'
            webp = job_dir / f'{prefix}_WEB.webp'
            ktx2 = job_dir / f'{prefix}_GPU.ktx2'

            dedupe_key = f'{source_sha}:{role}'
            duplicate_of = exact_seen.get(dedupe_key)
            memory_key = _memory_profile_key(role, material, tier)
            ai_attempted = False
            ai_accepted = False
            fallback_applied = False
            if duplicate_of:
                dedupe_hits += 1
                for src_key, dst in [('masterPath', master), ('enhancedPath', enhanced), ('webpPath', webp)]:
                    shutil.copy2(duplicate_of[src_key], dst)
                backend = 'exact-content-dedup-reuse'
                gate = duplicate_of['gate']
                cache_hit = False
            else:
                with Image.open(input_path) as raw:
                    raw.load()
                    original = raw.copy()
                master_mode = 'RGBA' if 'A' in original.getbands() else ('L' if role in DATA_ROLES - {'normal'} else 'RGB')
                original.convert(master_mode).save(master, optimize=True)

                desired_width, desired_height, scale = _target_size(original.width, original.height, target, max_dimension)
                desired = (desired_width, desired_height)
                memory_key = _memory_profile_key(role, material, tier)
                memory_entry = quality_memory.get('profiles', {}).get(memory_key, {})
                memory_skip_ai = _memory_recommends_skipping_ai(memory_entry)
                if memory_skip_ai:
                    memory_ai_skips += 1
                cache_params = {
                    'version': self.VERSION,
                    'role': role,
                    'target': target,
                    'maxDimension': max_dimension,
                    'desired': desired,
                    'material': material,
                    'useAiUpscale': use_ai,
                    'memorySkipAi': memory_skip_ai,
                }
                cache_dir = cache_base / _cache_key(input_path, cache_params)
                cache_hit = use_cache and _cache_restore(cache_dir, {'enhanced': enhanced, 'webp': webp})
                if cache_hit:
                    cache_hits += 1
                    backend = 'content-addressed-cache'
                    gate = _gate_candidate(input_path, enhanced, role)
                else:
                    backend = None
                    real_ai_available = bool(os.environ.get('REALESRGAN_BIN') or shutil.which('realesrgan-ncnn-vulkan'))
                    ai_attempted = bool(use_ai and scale > 1 and role in COLOR_ROLES and real_ai_available and not memory_skip_ai)
                    if ai_attempted:
                        backend = _try_realesrgan(input_path, enhanced, role, scale)
                    if backend:
                        with Image.open(enhanced) as ai_image:
                            if ai_image.size != desired:
                                _resize_for_role(ai_image, role, desired, sharpen=False).save(enhanced, optimize=True)
                    else:
                        _resize_for_role(original, role, desired, sharpen=True).save(enhanced, optimize=True)
                        if role == 'normal':
                            backend = 'normal-vector-resample'
                        elif memory_skip_ai and use_ai and scale > 1 and role in COLOR_ROLES:
                            backend = 'channel-aware-lanczos(golden-memory-skip-ai)'
                        else:
                            backend = 'channel-aware-lanczos'
                    candidate_backend = backend
                    gate = _gate_candidate(input_path, enhanced, role)
                    ai_accepted = bool(ai_attempted and candidate_backend == 'realesrgan-ncnn-vulkan' and gate['passed'])
                    fallback_applied = not gate['passed']
                    if fallback_applied:
                        shutil.copy2(master, enhanced)
                        backend = 'lossless-fallback-after-regression-gate'
                        gate = _gate_candidate(input_path, enhanced, role)
                    _write_webp(enhanced, webp, role)
                    if use_cache:
                        _cache_store(cache_dir, {'enhanced': enhanced, 'webp': webp})

            ktx2_backend = _try_ktx2(enhanced, ktx2, role)
            if ktx2_backend:
                ktx2_count += 1
            elif ktx2.exists():
                ktx2.unlink()

            mip_files = _emit_mips(enhanced, role, prefix, job_dir, max_mip_levels) if emit_mips else []
            with Image.open(enhanced) as enhanced_image:
                mip_plan = _mip_plan(enhanced_image.width, enhanced_image.height, max_mip_levels)

            derived = []
            if derive_pbr and role in {'albedo', 'generic'}:
                internal = _derive_pbr(enhanced, job_dir / 'derived' / prefix, material, wetness)
                for item in internal:
                    public = job_dir / f'{prefix}_{item.name}'
                    shutil.copy2(item, public)
                    derived.append(public)

            for path, kind in ((master, 'texture_master'), (enhanced, 'texture_enhanced'), (webp, 'texture_webp')):
                files.append(file_meta(path, kind))
            if ktx2_backend:
                files.append(file_meta(ktx2, 'texture_ktx2'))
            for path in mip_files:
                files.append(file_meta(path, 'texture_mip'))
            for path in derived:
                files.append(file_meta(path, 'texture_pbr_inferred'))

            out_metrics = _image_metrics(enhanced, role)
            output_score = min(100, _readiness_score(out_metrics, role, target) + (8 if gate['passed'] else 0))
            web_saving = 1.0 - (webp.stat().st_size / max(master.stat().st_size, 1))
            if not duplicate_of and not cache_hit:
                memory_updates.append({
                    'key': memory_key,
                    'aiAttempted': ai_attempted,
                    'aiAccepted': ai_accepted,
                    'fallbackApplied': fallback_applied,
                    'ssim': gate['metrics']['ssim'],
                    'similarity': gate['metrics']['similarity'],
                    'webpSaving': web_saving,
                })
            row = {
                'source': display_name,
                'sourceSha256': source_sha,
                'setKey': set_key,
                'role': role,
                'material': material,
                'backend': backend,
                'cacheHit': cache_hit,
                'goldenMemoryProfile': memory_key,
                'duplicateOf': duplicate_of['source'] if duplicate_of else None,
                'input': in_metrics,
                'output': out_metrics,
                'inputReadinessPercent': input_score,
                'outputReadinessPercent': output_score,
                'regressionGate': gate,
                'mipLevelsPlanned': len(mip_plan),
                'mipFilesEmitted': len(mip_files),
                'webVariant': webp.name,
                'ktx2Variant': ktx2.name if ktx2_backend else None,
                'ktx2Backend': ktx2_backend,
                'webpByteSavingRatioVsMaster': round(web_saving, 6),
                'pbrMaps': [path.name for path in derived],
                'pbrTruth': 'INFERRED_FROM_COLOR' if derived else 'NOT_GENERATED',
                'wetnessAppliedToInferredRoughness': wetness if derived else 0.0,
            }
            rows.append(row)
            promotion = golden_library.promote(
                enhanced, role=role, material=material, quality_tier=tier, source_name=display_name,
                quality_score=output_score, gate_passed=bool(gate['passed']),
                metadata={'sourceSha256': source_sha, 'backend': backend, 'setKey': set_key, 'webVariant': webp.name},
            )
            golden_promotions.append({'source': display_name, 'role': role, **promotion})
            if execute_platform_compression and not duplicate_of:
                encoded = encode_platform_candidates(enhanced, role, job_dir / 'platform-compressed', compression_tools)
                for item in encoded:
                    item['source'] = display_name
                    item['role'] = role
                    platform_compression_results.append(item)
                    out_path = Path(item['file'])
                    if item.get('verified') and out_path.is_file():
                        files.append(file_meta(out_path, 'texture_platform_compressed'))
            reusable = {
                'source': display_name,
                'masterPath': master,
                'enhancedPath': enhanced,
                'webpPath': webp,
                'gate': gate,
            }
            exact_seen.setdefault(dedupe_key, reusable)
            binding = {'source': display_name, 'setKey': set_key, 'role': role, 'enhancedPath': enhanced, 'row': row}
            role_items[role].append(binding)
            set_roles.setdefault(set_key, {})[role] = binding

        near_duplicates = []
        for left_index, left in enumerate(rows):
            for right in rows[left_index + 1:]:
                if left['role'] != right['role'] or left['sourceSha256'] == right['sourceSha256']:
                    continue
                distance = _hamming_hex(left['input']['perceptualHash'], right['input']['perceptualHash'])
                if distance <= 5:
                    near_duplicates.append({
                        'a': left['source'], 'b': right['source'], 'role': left['role'],
                        'perceptualHashDistance': distance, 'autoDeduplicated': False,
                    })

        pbr_health = []
        for set_key, roles in sorted(set_roles.items()):
            present = sorted(roles)
            score = 0
            score += 25 if ('albedo' in roles or 'generic' in roles) else 0
            score += 25 if 'normal' in roles else 0
            score += 25 if 'roughness' in roles else 0
            score += 15 if 'ao' in roles else 0
            score += 10 if 'metallic' in roles else 0
            pbr_health.append({
                'setKey': set_key,
                'sourcePbrCompletenessPercent': score,
                'presentRoles': present,
                'missingCoreRoles': [role for role in ('albedo', 'normal', 'roughness', 'ao') if role not in roles and not (role == 'albedo' and 'generic' in roles)],
                'metallicOptionalButRecommendedForMetals': 'metallic' not in roles,
            })

        progress(80, 'Packing source ORM maps and atlas candidates')
        orm_outputs = _pack_source_orm(set_roles, job_dir, material)
        for item in orm_outputs:
            files.append(file_meta(item['path'], 'texture_orm_source'))

        atlas_paths: list[Path] = []
        atlas_entries: list[dict] = []
        atlas_incompatible: list[dict] = []
        if build_atlas:
            atlas_paths, atlas_entries, atlas_incompatible = _pack_coherent_atlases(set_roles, job_dir, max_atlas, atlas_padding)
            for path in atlas_paths:
                files.append(file_meta(path, 'texture_atlas_candidate'))

        page_info = {}
        for entry in atlas_entries:
            page_info[str(entry['page'])] = {'width': entry['atlasWidth'], 'height': entry['atlasHeight']}
        atlas_manifest = {
            'schemaVersion': 2,
            'candidateOnly': True,
            'requiresUvRebindBeforeUse': True,
            'maxAtlasSize': max_atlas,
            'padding': atlas_padding,
            'gutterExtrusion': True,
            'coherentLayoutAcrossRoles': True,
            'aspectRatioMismatchExcluded': atlas_incompatible,
            'pages': [path.name for path in atlas_paths],
            'pageInfo': page_info,
            'entries': atlas_entries,
        }
        atlas_manifest_path = job_dir / 'texture-atlas-manifest.json'
        atlas_manifest_path.write_text(json.dumps(atlas_manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        files.append(file_meta(atlas_manifest_path, 'texture_atlas_manifest'))

        progress(86, 'Building runtime streaming, texel density, UV and compression plans')
        uv_rebind_plan = build_uv_rebind_plan(atlas_manifest)
        uv_rebind_path = write_json(job_dir / 'texture-uv-rebind-plan.json', uv_rebind_plan)
        files.append(file_meta(uv_rebind_path, 'texture_uv_rebind_plan'))

        runtime_plan = build_runtime_plan(rows, params)
        runtime_plan_path = write_json(job_dir / 'texture-runtime-plan.json', runtime_plan)
        files.append(file_meta(runtime_plan_path, 'texture_runtime_plan'))

        compression_matrix = build_compression_matrix(rows)
        compression_path = write_json(job_dir / 'texture-compression-matrix.json', compression_matrix)
        files.append(file_meta(compression_path, 'texture_compression_matrix'))

        texture_array_plan = build_texture_array_plan(rows)
        texture_array_path = write_json(job_dir / 'texture-array-plan.json', texture_array_plan)
        files.append(file_meta(texture_array_path, 'texture_array_plan'))

        material_instance_plan = build_material_instance_plan(rows)
        material_instance_path = write_json(job_dir / 'texture-material-instance-plan.json', material_instance_plan)
        files.append(file_meta(material_instance_path, 'texture_material_instance_plan'))

        telemetry_events = list(telemetry_inline)
        if telemetry_path_param:
            telemetry_events.extend(read_telemetry_jsonl(Path(str(telemetry_path_param))))
        camera_feedback = build_camera_heatmap_feedback(telemetry_events, runtime_plan)
        camera_feedback_path = write_json(job_dir / 'texture-camera-feedback-plan.json', camera_feedback)
        files.append(file_meta(camera_feedback_path, 'texture_camera_feedback_plan'))
        retuned_runtime_plan = retune_runtime_plan(runtime_plan, camera_feedback) if telemetry_events else runtime_plan
        retuned_runtime_path = write_json(job_dir / 'texture-runtime-retuned-plan.json', retuned_runtime_plan)
        files.append(file_meta(retuned_runtime_path, 'texture_runtime_retuned_plan'))
        budget_solved_runtime_plan = solve_runtime_vram_budget(retuned_runtime_plan, camera_feedback)
        budget_solved_runtime_path = write_json(job_dir / 'texture-runtime-budget-solved-plan.json', budget_solved_runtime_plan)
        files.append(file_meta(budget_solved_runtime_path, 'texture_runtime_budget_solved_plan'))

        gpu_capabilities = params.get('gpuCapabilities') if isinstance(params.get('gpuCapabilities'), dict) else {}
        v5_system_plan = build_v5_system_plan(
            budget_solved_runtime_plan, telemetry_events, uv_rebind_plan, atlas_manifest, params, gpu_capabilities
        )
        v5_system_path = write_json(job_dir / 'texture-v5-system-plan.json', v5_system_plan)
        files.append(file_meta(v5_system_path, 'texture_v5_system_plan'))
        prefetch_path = write_json(job_dir / 'texture-predictive-prefetch-plan.json', v5_system_plan['predictivePrefetch'])
        files.append(file_meta(prefetch_path, 'texture_predictive_prefetch_plan'))
        gpu_capability_path = write_json(job_dir / 'texture-gpu-capability-plan.json', v5_system_plan['gpuCapabilityPlan'])
        files.append(file_meta(gpu_capability_path, 'texture_gpu_capability_plan'))
        vt_residency_path = write_json(job_dir / 'texture-vt-residency-manifest.json', v5_system_plan['virtualTextureResidency'])
        files.append(file_meta(vt_residency_path, 'texture_vt_residency_manifest'))
        uv_autofix_path = write_json(job_dir / 'texture-uv-autofix-job.json', v5_system_plan['uvAutofixJob'])
        files.append(file_meta(uv_autofix_path, 'texture_uv_autofix_job'))
        renderback_automation_path = write_json(job_dir / 'texture-renderback-automation-manifest.json', v5_system_plan['renderBackAutomation'])
        files.append(file_meta(renderback_automation_path, 'texture_renderback_automation_manifest'))

        material_library_root, material_library_storage_mode = resolve_material_library_root(job_dir)
        v6_system_plan = build_v6_system_plan(
            rows, budget_solved_runtime_plan, camera_feedback, v5_system_plan['predictivePrefetch'],
            material_instance_plan, params, gpu_capabilities, material_library_root
        )
        v6_system_path = write_json(job_dir / 'texture-v6-system-plan.json', v6_system_plan)
        files.append(file_meta(v6_system_path, 'texture_v6_system_plan'))
        v6_manifests = [
            ('texture-semantic-saliency-plan.json', 'semanticSaliency', 'texture_semantic_saliency_plan'),
            ('texture-exploration-mission.json', 'explorationMission', 'texture_exploration_mission'),
            ('texture-network-delivery-plan.json', 'networkDelivery', 'texture_network_delivery_plan'),
            ('texture-virtual-texture-backend-plan.json', 'virtualTextureBackend', 'texture_virtual_texture_backend_plan'),
            ('texture-shader-material-cooptimization.json', 'shaderMaterialCooptimization', 'texture_shader_material_cooptimization'),
            ('texture-cross-project-material-library-report.json', 'crossProjectMaterialLibrary', 'texture_cross_project_material_library_report'),
            ('texture-policy-drift-report.json', 'policyDrift', 'texture_policy_drift_report'),
            ('texture-benchmark-farm-plan.json', 'benchmarkFarm', 'texture_benchmark_farm_plan'),
        ]
        v6_paths = {}
        for filename, key, role_name in v6_manifests:
            path = write_json(job_dir / filename, v6_system_plan[key])
            v6_paths[key] = path
            files.append(file_meta(path, role_name))

        v7_system_plan = build_v7_system_plan(
            rows, budget_solved_runtime_plan, v6_system_plan['semanticSaliency'],
            v6_system_plan['networkDelivery'], params, gpu_capabilities
        )
        v7_system_path = write_json(job_dir / 'texture-v7-system-plan.json', v7_system_plan)
        files.append(file_meta(v7_system_path, 'texture_v7_system_plan'))
        v7_manifests = [
            ('texture-residency-thrash-report.json', 'residencyThrash', 'texture_residency_thrash_report'),
            ('texture-thermal-battery-governor.json', 'thermalBatteryGovernor', 'texture_thermal_battery_governor'),
            ('texture-gpu-frame-budget-plan.json', 'gpuFrameBudget', 'texture_gpu_frame_budget_plan'),
            ('texture-mesh-texel-density-report.json', 'meshTexelDensity', 'texture_mesh_texel_density_report'),
            ('texture-trim-decal-plan.json', 'trimDecal', 'texture_trim_decal_plan'),
            ('texture-cdn-region-package-plan.json', 'cdnRegionPackaging', 'texture_cdn_region_package_plan'),
            ('texture-canary-rollout-report.json', 'canaryRollout', 'texture_canary_rollout_report'),
            ('texture-gpu-oom-recovery-plan.json', 'gpuOomRecovery', 'texture_gpu_oom_recovery_plan'),
            ('texture-multi-world-resource-plan.json', 'multiWorldResourceAllocator', 'texture_multi_world_resource_plan'),
            ('texture-adaptive-anisotropy-plan.json', 'adaptiveAnisotropy', 'texture_adaptive_anisotropy_plan'),
        ]
        v7_paths = {}
        for filename, key, role_name in v7_manifests:
            path = write_json(job_dir / filename, v7_system_plan[key])
            v7_paths[key] = path
            files.append(file_meta(path, role_name))

        v8_params = dict(params)
        if not v8_params.get('cdnSigningSecret') and os.environ.get('TEXTURE_CDN_SIGNING_SECRET'):
            v8_params['cdnSigningSecret'] = os.environ.get('TEXTURE_CDN_SIGNING_SECRET')
        v8_system_plan = build_v8_system_plan(
            rows, budget_solved_runtime_plan, v6_system_plan['semanticSaliency'],
            v6_system_plan['networkDelivery'], atlas_manifest, list(files),
            v7_system_plan['gpuFrameBudget'], v8_params, self.status()
        )
        v8_system_path = write_json(job_dir / 'texture-v8-system-plan.json', v8_system_plan)
        files.append(file_meta(v8_system_path, 'texture_v8_system_plan'))
        v8_manifests = [
            ('texture-content-aware-sr-plan.json', 'contentAwareSuperResolution', 'texture_content_aware_sr_plan'),
            ('texture-uv-health-repair-plan.json', 'uvHealthRepair', 'texture_uv_health_repair_plan'),
            ('texture-specular-normal-aa-plan.json', 'specularNormalAntialiasing', 'texture_specular_normal_aa_plan'),
            ('texture-per-tile-compression-plan.json', 'perTileAdaptiveCompression', 'texture_per_tile_compression_plan'),
            ('texture-atlas-defrag-plan.json', 'incrementalAtlasDefrag', 'texture_atlas_defrag_plan'),
            ('texture-signed-cdn-manifest.json', 'signedContentAddressedCdn', 'texture_signed_cdn_manifest'),
            ('texture-distributed-queue-plan.json', 'distributedWorkQueue', 'texture_distributed_queue_plan'),
            ('texture-unified-quality-governor.json', 'unifiedQualityGovernor', 'texture_unified_quality_governor'),
            ('texture-memory-residency-soak-report.json', 'memoryResidencySoak', 'texture_memory_residency_soak_report'),
            ('texture-regression-root-cause.json', 'regressionRootCause', 'texture_regression_root_cause'),
        ]
        v8_paths = {}
        for filename, key, role_name in v8_manifests:
            path = write_json(job_dir / filename, v8_system_plan[key])
            v8_paths[key] = path
            files.append(file_meta(path, role_name))

        v9_params = dict(params)
        if not v9_params.get('cdnSigningSecret') and os.environ.get('TEXTURE_CDN_SIGNING_SECRET'):
            v9_params['cdnSigningSecret'] = os.environ.get('TEXTURE_CDN_SIGNING_SECRET')
        if not v9_params.get('promotionLedgerSecret') and os.environ.get('TEXTURE_PROMOTION_LEDGER_SECRET'):
            v9_params['promotionLedgerSecret'] = os.environ.get('TEXTURE_PROMOTION_LEDGER_SECRET')
        v9_system_plan = build_v9_system_plan(rows, v8_system_plan, v7_system_plan, v6_system_plan, v9_params)
        v9_system_path = write_json(job_dir / 'texture-v9-system-plan.json', v9_system_plan)
        files.append(file_meta(v9_system_path, 'texture_v9_system_plan'))
        v9_manifests = [
            ('texture-temporal-shimmer-gate.json', 'temporalShimmerGate', 'texture_temporal_shimmer_gate'),
            ('texture-multi-host-queue-plan.json', 'multiHostQueue', 'texture_multi_host_queue_plan'),
            ('texture-shader-cache-prewarm-plan.json', 'shaderCachePrewarm', 'texture_shader_cache_prewarm_plan'),
            ('texture-bounded-learned-prefetch-plan.json', 'boundedLearnedPrefetch', 'texture_bounded_learned_prefetch_plan'),
            ('texture-atomic-cdn-publisher-plan.json', 'atomicCdnPublisher', 'texture_atomic_cdn_publisher_plan'),
            ('texture-canonical-tile-trim-library-plan.json', 'canonicalTileTrimLibrary', 'texture_canonical_tile_trim_library_plan'),
            ('texture-device-lab-plan.json', 'deviceLab', 'texture_device_lab_plan'),
            ('texture-unified-governor-adapters.json', 'unifiedGovernorAdapters', 'texture_unified_governor_adapters'),
            ('texture-cohort-drift-report.json', 'cohortDrift', 'texture_cohort_drift_report'),
            ('texture-promotion-ledger-plan.json', 'promotionLedger', 'texture_promotion_ledger_plan'),
        ]
        v9_paths = {}
        for filename, key, role_name in v9_manifests:
            path = write_json(job_dir / filename, v9_system_plan[key])
            v9_paths[key] = path
            files.append(file_meta(path, role_name))

        v10_params = dict(params)
        for key, env_name in [
            ('managedQueueDsn', 'TEXTURE_MANAGED_QUEUE_DSN'),
            ('managedQueueToken', 'TEXTURE_MANAGED_QUEUE_TOKEN'),
            ('remoteCdnRoot', 'TEXTURE_REMOTE_CDN_ROOT'),
            ('remoteCdnBucket', 'TEXTURE_REMOTE_CDN_BUCKET'),
            ('remoteCdnEndpoint', 'TEXTURE_REMOTE_CDN_ENDPOINT'),
            ('deviceFarmEndpoint', 'TEXTURE_DEVICE_FARM_ENDPOINT'),
            ('attestationSecret', 'TEXTURE_ATTESTATION_SECRET'),
        ]:
            if not v10_params.get(key) and os.environ.get(env_name):
                v10_params[key] = os.environ.get(env_name)
        v10_system_plan = build_v10_system_plan(rows, v9_system_plan, v8_system_plan, v10_params)
        v10_system_path = write_json(job_dir / 'texture-v10-system-plan.json', v10_system_plan)
        files.append(file_meta(v10_system_path, 'texture_v10_system_plan'))
        v10_manifests = [
            ('texture-managed-external-queue.json', 'managedExternalQueue', 'texture_managed_external_queue'),
            ('texture-verified-remote-cdn-publisher.json', 'verifiedRemoteCdnPublisher', 'texture_verified_remote_cdn_publisher'),
            ('texture-optical-flow-temporal-gate.json', 'opticalFlowTemporalComparator', 'texture_optical_flow_temporal_gate'),
            ('texture-shader-hitch-telemetry.json', 'shaderHitchTelemetry', 'texture_shader_hitch_telemetry'),
            ('texture-route-prefetch-v2-plan.json', 'routeModelPrefetchV2', 'texture_route_prefetch_v2_plan'),
            ('texture-material-provenance-graph-plan.json', 'crossProjectProvenanceGraph', 'texture_material_provenance_graph_plan'),
            ('texture-device-farm-executor-plan.json', 'remotePhysicalDeviceExecutors', 'texture_device_farm_executor_plan'),
            ('texture-frame-graph-causal-profile.json', 'frameGraphCausalProfiler', 'texture_frame_graph_causal_profile'),
            ('texture-regression-bisect-plan.json', 'automaticRegressionBisect', 'texture_regression_bisect_plan'),
            ('texture-global-scene-quality-plan.json', 'globalSceneQualityOptimizer', 'texture_global_scene_quality_plan'),
            ('texture-long-horizon-risk-forecast.json', 'longHorizonRiskForecast', 'texture_long_horizon_risk_forecast'),
            ('texture-reproducible-build-attestation.json', 'signedReproducibleBuildAttestation', 'texture_reproducible_build_attestation'),
        ]
        v10_paths = {}
        for filename, key, role_name in v10_manifests:
            path = write_json(job_dir / filename, v10_system_plan[key])
            v10_paths[key] = path
            files.append(file_meta(path, role_name))

        policy_root, policy_storage_mode = resolve_streaming_policy_root(job_dir)
        policy_store = StreamingPolicyStore(policy_root)
        policy_learning = policy_store.learn(camera_feedback, budget_solved_runtime_plan.get('profiles', {}).keys(), accepted=False) if telemetry_events else {'rowsUpdated': 0, 'acceptedTrainingRun': False, 'db': str(policy_store.db_path)}
        streaming_policy_report = {
            'schemaVersion': 1,
            'storageMode': policy_storage_mode,
            'durablePathConfigured': bool(os.environ.get('TEXTURE_STREAMING_POLICY_DIR')),
            'learning': policy_learning,
            'policy': policy_store.export(),
            'rule': 'Optimizer observations train conservatively. Mark a training run accepted only after real runtime + visual gates.',
        }
        streaming_policy_path = write_json(job_dir / 'texture-streaming-policy-report.json', streaming_policy_report)
        files.append(file_meta(streaming_policy_path, 'texture_streaming_policy_report'))

        engine_adapter_manifest = build_engine_adapter_manifest(budget_solved_runtime_plan, atlas_manifest, texture_array_plan)
        engine_adapter_path = write_json(job_dir / 'texture-engine-adapter-manifest.json', engine_adapter_manifest)
        files.append(file_meta(engine_adapter_path, 'texture_engine_adapter_manifest'))

        golden_library_report = {
            'schemaVersion': 1,
            'storageMode': golden_storage_mode,
            'durablePathConfigured': bool(os.environ.get('TEXTURE_GOLDEN_LIBRARY_DIR')),
            'stats': golden_library.stats(),
            'promotions': golden_promotions,
            'rule': 'Cross-worker persistence is verified only when TEXTURE_GOLDEN_LIBRARY_DIR points to durable shared storage.',
        }
        golden_library_path = write_json(job_dir / 'texture-golden-library-report.json', golden_library_report)
        files.append(file_meta(golden_library_path, 'texture_golden_library_report'))

        compression_execution_report = {
            'schemaVersion': 1,
            'enabled': execute_platform_compression,
            'tools': {k: {'available': bool(v), 'path': v} for k, v in compression_tools.items()},
            'results': platform_compression_results,
            'verifiedOutputs': sum(1 for x in platform_compression_results if x.get('verified')),
            'engineImportVerified': False,
            'rule': 'Container signature verification is not equivalent to target-engine import verification.',
        }
        compression_execution_path = write_json(job_dir / 'texture-compression-execution-report.json', compression_execution_report)
        files.append(file_meta(compression_execution_path, 'texture_compression_execution_report'))

        seam_repairs = []
        if repair_tile_seams:
            for index, row in enumerate(rows):
                enhanced_path = job_dir / f'TEX_{index:03d}_ENHANCED.png'
                if not enhanced_path.is_file():
                    continue
                candidate_path = job_dir / f'TEX_{index:03d}_TILE_REPAIRED.png'
                repair = build_tile_seam_candidate(enhanced_path, candidate_path, row['role'], seam_band)
                repair['source'] = row['source']
                seam_repairs.append(repair)
                if repair['candidateGenerated'] and candidate_path.is_file():
                    files.append(file_meta(candidate_path, 'texture_tile_repair_candidate'))

        detail_assets = []
        if synthesize_detail_layers:
            generated_sets = set()
            for index, row in enumerate(rows):
                if row['role'] not in {'albedo', 'generic'} or row['setKey'] in generated_sets:
                    continue
                enhanced_path = job_dir / f'TEX_{index:03d}_ENHANCED.png'
                if not enhanced_path.is_file():
                    continue
                generated_sets.add(row['setKey'])
                generated = build_detail_macro_assets(enhanced_path, job_dir, row['setKey'])
                for path in generated:
                    detail_assets.append(path.name)
                    files.append(file_meta(path, 'texture_detail_inferred'))

        advanced_report = {
            'schemaVersion': 1,
            'virtualTextureAndStreamingPlan': True,
            'texelDensityGovernor': True,
            'compressionMatrix': True,
            'atlasGutterExtrusion': True,
            'uvRebindPlan': True,
            'tileSeamRepairCandidateCount': sum(1 for item in seam_repairs if item['candidateGenerated']),
            'detailMacroAssets': detail_assets,
            'textureArrayCandidates': len(texture_array_plan['arrays']),
            'estimatedMaterialInstancesSaved': material_instance_plan['estimatedMaterialInstancesSaved'],
            'bindlessCandidate': texture_array_plan['bindlessCandidate'],
            'estimatedMaterialInstancesSaved': material_instance_plan['estimatedMaterialInstancesSaved'],
            'dynamicRuntimeGateVerified': False,
            'engineRuntimeAdaptersGenerated': True,
            'cameraTelemetryEventsConsumed': camera_feedback['eventsConsumed'],
            'cameraFeedbackMaterialSets': camera_feedback['materialSetsObserved'],
            'runtimeBudgetSolver': True,
            'runtimeBudgetProfilesPass': sum(1 for p in budget_solved_runtime_plan.get('profiles', {}).values() if p.get('budgetSolver', {}).get('gate') == 'PASS'),
            'goldenLibraryVerifiedAssets': golden_library_report['stats']['verifiedAssets'],
            'platformCompressedOutputsVerified': compression_execution_report['verifiedOutputs'],
            'predictivePrefetchCandidates': v5_system_plan['predictivePrefetch']['prefetchCount'],
            'gpuCapabilityProfiles': len(v5_system_plan['gpuCapabilityPlan']['profiles']),
            'virtualTextureResidencyProfiles': len(v5_system_plan['virtualTextureResidency']['profiles']),
            'streamingPolicyRows': len(streaming_policy_report['policy']['policies']),
            'automaticUvAutofixCandidate': True,
            'automaticRenderBackCaptureOrchestrator': True,
            'semanticCriticalSets': len(v6_system_plan['semanticSaliency']['criticalSets']),
            'explorationWaypoints': v6_system_plan['explorationMission']['waypointCount'],
            'networkSchedulerConcurrency': v6_system_plan['networkDelivery']['maxConcurrentRequests'],
            'softwareVirtualTextureBackends': len(v6_system_plan['virtualTextureBackend']['profiles']),
            'shaderPermutationsSavedEstimate': v6_system_plan['shaderMaterialCooptimization']['estimatedPermutationsSaved'],
            'crossProjectCanonicalMaterials': v6_system_plan['crossProjectMaterialLibrary']['canonicalCount'],
            'policyDriftDetected': v6_system_plan['policyDrift']['driftDetected'],
            'benchmarkFarmJobs': v6_system_plan['benchmarkFarm']['jobCount'],
            'residencyThrashingSets': v7_system_plan['residencyThrash']['thrashingSetCount'],
            'thermalBatteryAction': v7_system_plan['thermalBatteryGovernor']['action'],
            'gpuFrameBudgetPressure': v7_system_plan['gpuFrameBudget']['pressure'],
            'meshTexelSamplesMeasured': v7_system_plan['meshTexelDensity']['sampleCount'],
            'trimSheetCandidates': v7_system_plan['trimDecal']['candidateCount'],
            'cdnRegionChunks': v7_system_plan['cdnRegionPackaging']['chunkCount'],
            'canaryAction': v7_system_plan['canaryRollout']['action'],
            'gpuOomEmergency': v7_system_plan['gpuOomRecovery']['emergency'],
            'multiWorldCount': v7_system_plan['multiWorldResourceAllocator']['worldCount'],
            'adaptiveAnisotropyProfiles': len(v7_system_plan['adaptiveAnisotropy']['profiles']),
            'contentAwareSrRoutes': v8_system_plan['contentAwareSuperResolution']['entryCount'],
            'uvHealthProblemSets': v8_system_plan['uvHealthRepair']['problemSetCount'],
            'specularNormalAaSets': v8_system_plan['specularNormalAntialiasing']['enabledCount'],
            'perTileCompressionEntries': v8_system_plan['perTileAdaptiveCompression']['entryCount'],
            'atlasDefragMoves': v8_system_plan['incrementalAtlasDefrag']['moveCount'],
            'cdnManifestSigned': not v8_system_plan['signedContentAddressedCdn']['promotionBlocked'],
            'unifiedQualityPressure': v8_system_plan['unifiedQualityGovernor']['pressure'],
            'soakGate': v8_system_plan['memoryResidencySoak']['gate'],
            'regressionRootCause': v8_system_plan['regressionRootCause']['classification'],
            'temporalShimmerGate': v9_system_plan['temporalShimmerGate']['gate'],
            'multiHostQueueFencing': v9_system_plan['multiHostQueue']['supportsFencing'],
            'shaderPrewarmVariants': v9_system_plan['shaderCachePrewarm']['entryCount'],
            'atomicCdnPromotionBlocked': v9_system_plan['atomicCdnPublisher']['promotionBlocked'],
            'canonicalTileCandidates': v9_system_plan['canonicalTileTrimLibrary']['candidateCount'],
            'deviceLabJobs': v9_system_plan['deviceLab']['jobCount'],
            'cohortDriftGate': v9_system_plan['cohortDrift']['gate'],
            'promotionLedgerBlocked': v9_system_plan['promotionLedger']['promotionBlocked'],
            'managedExternalQueueAvailable': v10_system_plan['managedExternalQueue'].get('available', False),
            'verifiedRemoteCdnAvailable': v10_system_plan['verifiedRemoteCdnPublisher'].get('available', False),
            'opticalFlowTemporalGate': v10_system_plan['opticalFlowTemporalComparator']['gate'],
            'shaderHitchGate': v10_system_plan['shaderHitchTelemetry']['gate'],
            'deviceFarmPromotionBlocked': v10_system_plan['remotePhysicalDeviceExecutors']['promotionBlocked'],
            'globalSceneQualityWithinBudget': v10_system_plan['globalSceneQualityOptimizer'].get('withinBudget', True),
            'longHorizonRiskGate': v10_system_plan['longHorizonRiskForecast']['gate'],
            'buildAttestationSigned': v10_system_plan['signedReproducibleBuildAttestation']['signed'],
            'hardwareSparseResidencyClaimed': False,
            'seamRepairs': seam_repairs,
        }
        advanced_path = write_json(job_dir / 'texture-advanced-report.json', advanced_report)
        files.append(file_meta(advanced_path, 'texture_advanced_report'))

        quality_memory = _apply_memory_updates(quality_memory, memory_updates)
        _save_quality_memory(cache_base, quality_memory)
        avg_before = round(sum(row['inputReadinessPercent'] for row in rows) / len(rows), 1)
        avg_after = round(sum(row['outputReadinessPercent'] for row in rows) / len(rows), 1)
        source_bytes = sum(int(row['input']['bytes']) for row in rows)
        web_bytes = sum((job_dir / row['webVariant']).stat().st_size for row in rows)
        report = {
            'schemaVersion': 10,
            'mode': 'texture_optimize',
            'sourceUpload': original_name,
            'texturesProcessed': len(rows),
            'uniqueTextureContents': len(exact_seen),
            'exactDedupHits': dedupe_hits,
            'cacheHits': cache_hits,
            'goldenMemoryAiSkips': memory_ai_skips,
            'goldenMemoryProfiles': len(quality_memory.get('profiles', {})),
            'ktx2Encoded': ktx2_count,
            'sourceOrmPacks': len(orm_outputs),
            'atlasPages': len(atlas_paths),
            'atlasGutterExtrusion': True,
            'uvRebindEntries': len(uv_rebind_plan['entries']),
            'textureArrayCandidates': len(texture_array_plan['arrays']),
            'tileSeamRepairCandidates': advanced_report['tileSeamRepairCandidateCount'],
            'detailMacroAssets': len(detail_assets),
            'cameraTelemetryEventsConsumed': camera_feedback['eventsConsumed'],
            'cameraFeedbackMaterialSets': camera_feedback['materialSetsObserved'],
            'goldenLibraryVerifiedAssets': golden_library_report['stats']['verifiedAssets'],
            'platformCompressedOutputsVerified': compression_execution_report['verifiedOutputs'],
            'predictivePrefetchCandidates': v5_system_plan['predictivePrefetch']['prefetchCount'],
            'streamingPolicyRows': len(streaming_policy_report['policy']['policies']),
            'semanticCriticalSets': len(v6_system_plan['semanticSaliency']['criticalSets']),
            'explorationWaypoints': v6_system_plan['explorationMission']['waypointCount'],
            'crossProjectCanonicalMaterials': v6_system_plan['crossProjectMaterialLibrary']['canonicalCount'],
            'benchmarkFarmJobs': v6_system_plan['benchmarkFarm']['jobCount'],
            'policyDriftDetected': v6_system_plan['policyDrift']['driftDetected'],
            'residencyThrashingSets': v7_system_plan['residencyThrash']['thrashingSetCount'],
            'thermalBatteryAction': v7_system_plan['thermalBatteryGovernor']['action'],
            'meshTexelSamplesMeasured': v7_system_plan['meshTexelDensity']['sampleCount'],
            'trimSheetCandidates': v7_system_plan['trimDecal']['candidateCount'],
            'cdnRegionChunks': v7_system_plan['cdnRegionPackaging']['chunkCount'],
            'canaryAction': v7_system_plan['canaryRollout']['action'],
            'gpuOomEmergency': v7_system_plan['gpuOomRecovery']['emergency'],
            'multiWorldCount': v7_system_plan['multiWorldResourceAllocator']['worldCount'],
            'nearDuplicatePairs': len(near_duplicates),
            'beforeReadinessPercent': avg_before,
            'afterReadinessPercent': avg_after,
            'improvementPoints': round(avg_after - avg_before, 1),
            'sourceBytes': source_bytes,
            'webpBytes': web_bytes,
            'webpByteSavingRatio': round(1.0 - web_bytes / max(source_bytes, 1), 6),
            'system': self.status(),
            'qualityTier': tier,
            'targetMin': target,
            'rules': {
                'nonDestructive': True,
                'neverOverwriteSource': True,
                'normalMapsRenormalized': True,
                'dataMapsUseLosslessWebP': True,
                'pbrDerivedMapsExplicitlyMarkedInferred': True,
                'atlasRequiresUvRebind': True,
                'multiMetricNoRegressionFallback': True,
                'contentAddressedCache': use_cache,
                'exactDuplicatesReused': True,
                'goldenMaterialMemory': True,
                'atlasExtrudedGutters': True,
                'uvRebindMustPassRenderBackBeforeBinding': True,
                'runtimeBudgetPlanIsStaticUntilEngineTelemetry': True,
                'seamRepairIsCandidateOnly': True,
                'detailMacroLayersExplicitlyMarkedInferred': True,
                'goldenLibraryPromotionRequiresPassingGate': True,
                'cameraFeedbackRequiresRuntimePromotionGate': True,
                'compressedContainerVerificationIsNotEngineImportVerification': True,
                'engineAdaptersAreCandidateOnlyUntilTargetRuntimePasses': True,
                'uvAutofixNeverOverwritesSource': True,
                'predictivePrefetchCannotPromoteWithoutRuntimeGate': True,
                'gpuFormatSelectionRequiresDeviceProbe': True,
                'streamingLearningClampedAndCandidateOnly': True,
                'robloxDoesNotClaimGenericVirtualTexturing': True,
                'semanticSaliencyCannotBypassHardBudgets': True,
                'explorationBotsMustRespectNavigationOrAbort': True,
                'networkSchedulerCannotBypassVisualGate': True,
                'softwareVirtualTextureDoesNotClaimHardwareSparseResidency': True,
                'crossProjectCanonicalizationRequiresExactContentFingerprint': True,
                'policyDriftCanForceRollback': True,
                'benchmarkRecommendationsRequireRealHardwareResults': True,
                'residencyThrashMitigationRequiresMeasuredEvents': True,
                'thermalBatteryGovernorNeverInventsTelemetry': True,
                'gpuFrameBudgetCoordinatesButDoesNotClaimOtherSubsystemChanges': True,
                'meshTexelAutofixRequiresRenderBackGate': True,
                'trimSheetConversionIsCandidateOnly': True,
                'cdnChunkEstimatesRequireEncodedByteVerification': True,
                'canaryPromotionAdvancesOneMeasuredStageAtATime': True,
                'gpuOomWatchdogRequiresRealMemoryOrDeviceLossSignals': True,
                'multiWorldAllocatorKeepsTransitionReserve': True,
                'anisotropyIsCappedByGpuAndThermalPolicy': True,
                'contentAwareSrNeverUsesColorHallucinationOnDataMaps': True,
                'uvHealthRepairNeverOverwritesSourceMesh': True,
                'specularNormalAaRequiresMotionShimmerGate': True,
                'perTileCompressionRequiresTargetDecodeVerification': True,
                'atlasDefragPreservesStableIdsAndRequiresRenderBack': True,
                'unsignedCdnManifestCannotPromote': True,
                'distributedQueueUsesLeasesAndRetryRecovery': True,
                'unifiedGovernorProtectsSemanticCriticalSets': True,
                'soakGateRequiresRealTargetRuntimeDuration': True,
                'rootCauseClassificationIsEvidenceNotProof': True,
                'temporalMotionGateCannotUseStillImages': True,
                'multiHostQueueRequiresCurrentFenceForCompletion': True,
                'shaderPrewarmIsTimeAndVariantBounded': True,
                'learnedPrefetchCannotExceedNetworkThermalVramBudget': True,
                'cdnPromotionUsesAtomicSignedManifestSwitch': True,
                'physicalDeviceLabCannotBeFakedBySyntheticProbe': True,
                'cohortDriftCanBlockPromotion': True,
                'promotionLedgerHashChainMustVerify': True,
            },
            'textures': rows,
            'nearDuplicates': near_duplicates,
            'pbrSetHealth': pbr_health,
            'sourceOrm': [
                {'file': item['path'].name, 'setKey': item['setKey'], 'channels': item['channels'], 'truth': item['truth']}
                for item in orm_outputs
            ],
            'advanced': advanced_report,
            'runtimePlanFile': runtime_plan_path.name,
            'compressionMatrixFile': compression_path.name,
            'uvRebindPlanFile': uv_rebind_path.name,
            'textureArrayPlanFile': texture_array_path.name,
            'materialInstancePlanFile': material_instance_path.name,
            'cameraFeedbackPlanFile': camera_feedback_path.name,
            'retunedRuntimePlanFile': retuned_runtime_path.name,
            'budgetSolvedRuntimePlanFile': budget_solved_runtime_path.name,
            'engineAdapterManifestFile': engine_adapter_path.name,
            'goldenLibraryReportFile': golden_library_path.name,
            'compressionExecutionReportFile': compression_execution_path.name,
            'v5SystemPlanFile': v5_system_path.name,
            'predictivePrefetchPlanFile': prefetch_path.name,
            'gpuCapabilityPlanFile': gpu_capability_path.name,
            'virtualTextureResidencyManifestFile': vt_residency_path.name,
            'uvAutofixJobFile': uv_autofix_path.name,
            'renderBackAutomationManifestFile': renderback_automation_path.name,
            'streamingPolicyReportFile': streaming_policy_path.name,
            'v6SystemPlanFile': v6_system_path.name,
            'semanticSaliencyPlanFile': v6_paths['semanticSaliency'].name,
            'explorationMissionFile': v6_paths['explorationMission'].name,
            'networkDeliveryPlanFile': v6_paths['networkDelivery'].name,
            'virtualTextureBackendPlanFile': v6_paths['virtualTextureBackend'].name,
            'shaderMaterialCooptimizationFile': v6_paths['shaderMaterialCooptimization'].name,
            'crossProjectMaterialLibraryReportFile': v6_paths['crossProjectMaterialLibrary'].name,
            'policyDriftReportFile': v6_paths['policyDrift'].name,
            'benchmarkFarmPlanFile': v6_paths['benchmarkFarm'].name,
            'v7SystemPlanFile': v7_system_path.name,
            'residencyThrashReportFile': v7_paths['residencyThrash'].name,
            'thermalBatteryGovernorFile': v7_paths['thermalBatteryGovernor'].name,
            'gpuFrameBudgetPlanFile': v7_paths['gpuFrameBudget'].name,
            'meshTexelDensityReportFile': v7_paths['meshTexelDensity'].name,
            'trimDecalPlanFile': v7_paths['trimDecal'].name,
            'cdnRegionPackagePlanFile': v7_paths['cdnRegionPackaging'].name,
            'canaryRolloutReportFile': v7_paths['canaryRollout'].name,
            'gpuOomRecoveryPlanFile': v7_paths['gpuOomRecovery'].name,
            'multiWorldResourcePlanFile': v7_paths['multiWorldResourceAllocator'].name,
            'adaptiveAnisotropyPlanFile': v7_paths['adaptiveAnisotropy'].name,
            'v8SystemPlanFile': v8_system_path.name,
            'contentAwareSrPlanFile': v8_paths['contentAwareSuperResolution'].name,
            'uvHealthRepairPlanFile': v8_paths['uvHealthRepair'].name,
            'specularNormalAaPlanFile': v8_paths['specularNormalAntialiasing'].name,
            'perTileCompressionPlanFile': v8_paths['perTileAdaptiveCompression'].name,
            'atlasDefragPlanFile': v8_paths['incrementalAtlasDefrag'].name,
            'signedCdnManifestFile': v8_paths['signedContentAddressedCdn'].name,
            'distributedQueuePlanFile': v8_paths['distributedWorkQueue'].name,
            'unifiedQualityGovernorFile': v8_paths['unifiedQualityGovernor'].name,
            'memoryResidencySoakReportFile': v8_paths['memoryResidencySoak'].name,
            'regressionRootCauseFile': v8_paths['regressionRootCause'].name,
            'v9SystemPlanFile': v9_system_path.name,
            'temporalShimmerGateFile': v9_paths['temporalShimmerGate'].name,
            'multiHostQueuePlanFile': v9_paths['multiHostQueue'].name,
            'shaderCachePrewarmPlanFile': v9_paths['shaderCachePrewarm'].name,
            'boundedLearnedPrefetchPlanFile': v9_paths['boundedLearnedPrefetch'].name,
            'atomicCdnPublisherPlanFile': v9_paths['atomicCdnPublisher'].name,
            'canonicalTileTrimLibraryPlanFile': v9_paths['canonicalTileTrimLibrary'].name,
            'deviceLabPlanFile': v9_paths['deviceLab'].name,
            'unifiedGovernorAdaptersFile': v9_paths['unifiedGovernorAdapters'].name,
            'cohortDriftReportFile': v9_paths['cohortDrift'].name,
            'promotionLedgerPlanFile': v9_paths['promotionLedger'].name,
            'v10SystemPlanFile': v10_system_path.name,
            'managedExternalQueueFile': v10_paths['managedExternalQueue'].name,
            'verifiedRemoteCdnPublisherFile': v10_paths['verifiedRemoteCdnPublisher'].name,
            'opticalFlowTemporalGateFile': v10_paths['opticalFlowTemporalComparator'].name,
            'shaderHitchTelemetryFile': v10_paths['shaderHitchTelemetry'].name,
            'routePrefetchV2File': v10_paths['routeModelPrefetchV2'].name,
            'materialProvenanceGraphFile': v10_paths['crossProjectProvenanceGraph'].name,
            'deviceFarmExecutorPlanFile': v10_paths['remotePhysicalDeviceExecutors'].name,
            'frameGraphCausalProfileFile': v10_paths['frameGraphCausalProfiler'].name,
            'regressionBisectPlanFile': v10_paths['automaticRegressionBisect'].name,
            'globalSceneQualityPlanFile': v10_paths['globalSceneQualityOptimizer'].name,
            'longHorizonRiskForecastFile': v10_paths['longHorizonRiskForecast'].name,
            'reproducibleBuildAttestationFile': v10_paths['signedReproducibleBuildAttestation'].name,
        }
        report_path = job_dir / 'texture-quality-report.json'
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        files.append(file_meta(report_path, 'texture_quality_report'))

        bindings = {
            'schemaVersion': 1,
            'verifiedRuntime': False,
            'web': {
                'preferred': 'KTX2 when generated, otherwise WebP',
                'ktx2EncodedCount': ktx2_count,
                'mipPolicy': 'embedded in KTX2 when encoder succeeds; otherwise generate at runtime/import',
            },
            'godot': {
                'preferred': 'ENHANCED PNG source import',
                'notes': ['enable mipmaps/import compression in project profile', 'runtime verification still required'],
            },
            'roblox': {
                'preferred': 'ENHANCED PNG + source PBR channels',
                'notes': ['upload as Roblox assets before binding', 'runtime verification still required'],
            },
            'atlas': atlas_manifest,
            'uvRebindPlan': uv_rebind_path.name,
            'runtimePlan': runtime_plan_path.name,
            'compressionMatrix': compression_path.name,
            'textureArrayPlan': texture_array_path.name,
            'materialInstancePlan': material_instance_path.name,
            'cameraFeedbackPlan': camera_feedback_path.name,
            'retunedRuntimePlan': retuned_runtime_path.name,
            'budgetSolvedRuntimePlan': budget_solved_runtime_path.name,
            'engineAdapterManifest': engine_adapter_path.name,
            'goldenLibraryReport': golden_library_path.name,
            'compressionExecutionReport': compression_execution_path.name,
            'v5SystemPlan': v5_system_path.name,
            'predictivePrefetchPlan': prefetch_path.name,
            'gpuCapabilityPlan': gpu_capability_path.name,
            'virtualTextureResidencyManifest': vt_residency_path.name,
            'uvAutofixJob': uv_autofix_path.name,
            'renderBackAutomationManifest': renderback_automation_path.name,
            'streamingPolicyReport': streaming_policy_path.name,
            'v6SystemPlan': v6_system_path.name,
            'semanticSaliencyPlan': v6_paths['semanticSaliency'].name,
            'explorationMission': v6_paths['explorationMission'].name,
            'networkDeliveryPlan': v6_paths['networkDelivery'].name,
            'virtualTextureBackendPlan': v6_paths['virtualTextureBackend'].name,
            'shaderMaterialCooptimization': v6_paths['shaderMaterialCooptimization'].name,
            'crossProjectMaterialLibraryReport': v6_paths['crossProjectMaterialLibrary'].name,
            'policyDriftReport': v6_paths['policyDrift'].name,
            'benchmarkFarmPlan': v6_paths['benchmarkFarm'].name,
            'v8SystemPlan': v8_system_path.name,
            'signedCdnManifest': v8_paths['signedContentAddressedCdn'].name,
            'unifiedQualityGovernor': v8_paths['unifiedQualityGovernor'].name,
            'memoryResidencySoakReport': v8_paths['memoryResidencySoak'].name,
            'regressionRootCause': v8_paths['regressionRootCause'].name,
            'v9SystemPlan': v9_system_path.name,
            'temporalShimmerGate': v9_paths['temporalShimmerGate'].name,
            'shaderCachePrewarmPlan': v9_paths['shaderCachePrewarm'].name,
            'atomicCdnPublisherPlan': v9_paths['atomicCdnPublisher'].name,
            'deviceLabPlan': v9_paths['deviceLab'].name,
            'cohortDriftReport': v9_paths['cohortDrift'].name,
            'promotionLedgerPlan': v9_paths['promotionLedger'].name,
            'v10SystemPlan': v10_system_path.name,
            'managedExternalQueue': v10_paths['managedExternalQueue'].name,
            'verifiedRemoteCdnPublisher': v10_paths['verifiedRemoteCdnPublisher'].name,
            'opticalFlowTemporalGate': v10_paths['opticalFlowTemporalComparator'].name,
            'shaderHitchTelemetry': v10_paths['shaderHitchTelemetry'].name,
            'routePrefetchV2': v10_paths['routeModelPrefetchV2'].name,
            'materialProvenanceGraph': v10_paths['crossProjectProvenanceGraph'].name,
            'deviceFarmExecutorPlan': v10_paths['remotePhysicalDeviceExecutors'].name,
            'frameGraphCausalProfile': v10_paths['frameGraphCausalProfiler'].name,
            'regressionBisectPlan': v10_paths['automaticRegressionBisect'].name,
            'globalSceneQualityPlan': v10_paths['globalSceneQualityOptimizer'].name,
            'longHorizonRiskForecast': v10_paths['longHorizonRiskForecast'].name,
            'reproducibleBuildAttestation': v10_paths['signedReproducibleBuildAttestation'].name,
            'dynamicRuntimeGate': 'PENDING_ENGINE_TELEMETRY',
        }
        bindings_path = job_dir / 'texture-engine-bindings.json'
        bindings_path.write_text(json.dumps(bindings, ensure_ascii=False, indent=2), encoding='utf-8')
        files.append(file_meta(bindings_path, 'texture_engine_bindings'))

        cache_report_path = job_dir / 'texture-cache-report.json'
        cache_report_path.write_text(json.dumps({
            'cacheEnabled': use_cache,
            'cacheRoot': str(cache_base),
            'hits': cache_hits,
            'uniqueInputs': len(exact_seen),
            'exactDedupHits': dedupe_hits,
            'goldenMemoryPath': str(_quality_memory_path(cache_base)),
            'goldenMemoryProfiles': len(quality_memory.get('profiles', {})),
            'goldenMemoryAiSkips': memory_ai_skips,
        }, ensure_ascii=False, indent=2), encoding='utf-8')
        files.append(file_meta(cache_report_path, 'texture_cache_report'))

        progress(98, f'Texture quality V10 completed: {len(rows)} textures, {cache_hits} cache hits, {dedupe_hits} dedupe hits')
        return {'files': files, 'durationSeconds': 0, 'textureQuality': report}
