from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageFilter

PLATFORM_PROFILES = {
    'web_desktop': {
        'colorCompression': 'KTX2 ETC1S or UASTC',
        'normalCompression': 'KTX2 UASTC',
        'fallback': 'WebP',
        'targetTextureVramMB': 512,
        'maxResidentDimension': 4096,
        'anisotropy': 8,
        'virtualTexturing': True,
        'targetTexelsPerMeter': 512,
    },
    'web_mobile': {
        'colorCompression': 'KTX2 ETC1S',
        'normalCompression': 'KTX2 UASTC',
        'fallback': 'WebP',
        'targetTextureVramMB': 192,
        'maxResidentDimension': 2048,
        'anisotropy': 4,
        'virtualTexturing': True,
        'targetTexelsPerMeter': 256,
    },
    'godot_desktop': {
        'colorCompression': 'BC7',
        'normalCompression': 'BC5',
        'fallback': 'lossless source import',
        'targetTextureVramMB': 768,
        'maxResidentDimension': 4096,
        'anisotropy': 8,
        'virtualTexturing': True,
        'targetTexelsPerMeter': 512,
    },
    'godot_mobile': {
        'colorCompression': 'ASTC 6x6 or ETC2',
        'normalCompression': 'ASTC 6x6',
        'fallback': 'lossless source import',
        'targetTextureVramMB': 256,
        'maxResidentDimension': 2048,
        'anisotropy': 4,
        'virtualTexturing': True,
        'targetTexelsPerMeter': 256,
    },
    'roblox': {
        'colorCompression': 'platform-managed after source upload',
        'normalCompression': 'platform-managed after source upload',
        'fallback': 'PNG source',
        'targetTextureVramMB': 256,
        'maxResidentDimension': 2048,
        'anisotropy': 4,
        'virtualTexturing': False,
        'targetTexelsPerMeter': 256,
    },
}

ROLE_BPP = {
    'albedo': 4,
    'emissive': 4,
    'generic': 4,
    'normal': 3,
    'roughness': 1,
    'metallic': 1,
    'ao': 1,
}


def _sum_mip_pixels(width: int, height: int) -> int:
    total = 0
    w, h = max(1, int(width)), max(1, int(height))
    while True:
        total += w * h
        if w == 1 and h == 1:
            return total
        w = max(1, w // 2)
        h = max(1, h // 2)


def estimate_uncompressed_vram_bytes(width: int, height: int, role: str) -> int:
    return _sum_mip_pixels(width, height) * ROLE_BPP.get(role, 4)


def _estimated_gpu_bpp(profile: str, role: str) -> float:
    if profile in {'godot_desktop'}:
        return 1.0 if role in {'albedo', 'emissive', 'generic', 'normal'} else 0.5
    if profile in {'godot_mobile'}:
        return 0.445 if role in {'albedo', 'emissive', 'generic', 'normal'} else 0.445
    if profile in {'web_desktop', 'web_mobile'}:
        return 0.5 if role in {'albedo', 'emissive', 'generic'} else 1.0
    if profile == 'roblox':
        return 1.0
    return 1.0


def estimate_compressed_vram_bytes(width: int, height: int, role: str, profile: str) -> int:
    bpp = _estimated_gpu_bpp(profile, role)
    return int(math.ceil(_sum_mip_pixels(width, height) * bpp))



def build_virtual_texture_page_plan(width: int, height: int, tile_size: int = 128, border: int = 4) -> dict:
    tile_size = max(32, int(tile_size))
    border = max(0, min(int(border), tile_size // 4))
    levels = []
    total_pages = 0
    w, h = max(1, int(width)), max(1, int(height))
    level = 0
    while True:
        pages_x = max(1, math.ceil(w / tile_size))
        pages_y = max(1, math.ceil(h / tile_size))
        count = pages_x * pages_y
        total_pages += count
        levels.append({'level': level, 'width': w, 'height': h, 'pagesX': pages_x, 'pagesY': pages_y, 'pages': count})
        if w <= tile_size and h <= tile_size:
            break
        w = max(1, w // 2)
        h = max(1, h // 2)
        level += 1
    return {
        'tileSize': tile_size,
        'borderPixels': border,
        'totalPages': total_pages,
        'levels': levels,
        'physicalPageCacheRecommended': max(64, min(total_pages, 2048)),
    }

def _world_units_for(set_key: str, params: dict) -> float | None:
    mapping = params.get('worldUnitsPerTexture')
    if isinstance(mapping, (int, float)) and float(mapping) > 0:
        return float(mapping)
    if isinstance(mapping, dict):
        value = mapping.get(set_key)
        if isinstance(value, (int, float)) and float(value) > 0:
            return float(value)
    return None


def build_runtime_plan(rows: list[dict], params: dict) -> dict:
    requested = params.get('platformProfiles') or ['web_desktop', 'web_mobile', 'godot_desktop', 'godot_mobile', 'roblox']
    profiles = [name for name in requested if name in PLATFORM_PROFILES]
    if not profiles:
        profiles = ['web_desktop']
    plan = {'schemaVersion': 1, 'profiles': {}, 'dynamicRuntimeVerified': False}
    for name in profiles:
        profile = PLATFORM_PROFILES[name]
        textures = []
        total_estimated = 0
        for row in rows:
            width = int(row['output']['width'])
            height = int(row['output']['height'])
            role = row['role']
            set_key = row['setKey']
            max_dim = max(width, height)
            resident_cap = int(profile['maxResidentDimension'])
            floor = 0
            reduced = max_dim
            while reduced > resident_cap:
                floor += 1
                reduced = max(1, reduced // 2)
            estimated = estimate_compressed_vram_bytes(width, height, role, name)
            if floor:
                estimated = max(1, estimated // (4 ** floor))
            total_estimated += estimated
            world_units = _world_units_for(set_key, params)
            texel = None
            if world_units:
                actual = min(width, height) / world_units
                target = float(params.get('targetTexelsPerMeter', profile['targetTexelsPerMeter']))
                texel = {
                    'worldUnitsPerTexture': world_units,
                    'actualTexelsPerUnit': round(actual, 2),
                    'targetTexelsPerUnit': target,
                    'scaleRecommendation': round(target / max(actual, 1e-6), 3),
                    'status': 'OK' if 0.75 <= actual / max(target, 1e-6) <= 1.5 else ('TOO_LOW' if actual < target else 'OVERDENSE'),
                }
            virtual_eligible = bool(profile['virtualTexturing'] and max_dim >= 2048 and role != 'emissive')
            virtual_plan = build_virtual_texture_page_plan(width, height, int(params.get('virtualTileSize', 128)), int(params.get('virtualTileBorder', 4))) if virtual_eligible else None
            textures.append({
                'source': row['source'],
                'setKey': set_key,
                'role': role,
                'residentMipFloor': floor,
                'residentMaxDimension': reduced,
                'virtualTextureEligible': virtual_eligible,
                'virtualTexturePagePlan': virtual_plan,
                'estimatedResidentVramBytes': estimated,
                'streamingPriority': 'high' if role in {'albedo', 'normal'} else ('medium' if role in {'roughness', 'ao'} else 'low'),
                'texelDensity': texel or {'status': 'GEOMETRY_METADATA_REQUIRED'},
            })
        budget = int(params.get('textureVramBudgetMB', profile['targetTextureVramMB'])) * 1024 * 1024
        plan['profiles'][name] = {
            **profile,
            'textureVramBudgetBytes': budget,
            'estimatedResidentVramBytes': total_estimated,
            'staticBudgetGate': 'PASS' if total_estimated <= budget else 'WARN_OVER_BUDGET',
            'textures': textures,
        }
    return plan


def _edge_strip(image: Image.Image, box: tuple[int, int, int, int], size: tuple[int, int]) -> Image.Image:
    return image.crop(box).resize(size, Image.Resampling.NEAREST)


def paste_with_extruded_gutter(atlas: Image.Image, tile: Image.Image, x: int, y: int, padding: int) -> None:
    atlas.paste(tile, (x, y))
    if padding <= 0:
        return
    w, h = tile.size
    atlas.paste(_edge_strip(tile, (0, 0, 1, h), (padding, h)), (x - padding, y))
    atlas.paste(_edge_strip(tile, (w - 1, 0, w, h), (padding, h)), (x + w, y))
    atlas.paste(_edge_strip(tile, (0, 0, w, 1), (w, padding)), (x, y - padding))
    atlas.paste(_edge_strip(tile, (0, h - 1, w, h), (w, padding)), (x, y + h))
    atlas.paste(tile.crop((0, 0, 1, 1)).resize((padding, padding), Image.Resampling.NEAREST), (x - padding, y - padding))
    atlas.paste(tile.crop((w - 1, 0, w, 1)).resize((padding, padding), Image.Resampling.NEAREST), (x + w, y - padding))
    atlas.paste(tile.crop((0, h - 1, 1, h)).resize((padding, padding), Image.Resampling.NEAREST), (x - padding, y + h))
    atlas.paste(tile.crop((w - 1, h - 1, w, h)).resize((padding, padding), Image.Resampling.NEAREST), (x + w, y + h))


def build_uv_rebind_plan(atlas_manifest: dict) -> dict:
    entries = []
    pages = atlas_manifest.get('pageInfo', {})
    for entry in atlas_manifest.get('entries', []):
        page = str(entry['page'])
        info = pages.get(page) or pages.get(int(entry['page'])) if isinstance(pages, dict) else None
        atlas_w = int(entry.get('atlasWidth') or (info or {}).get('width') or 1)
        atlas_h = int(entry.get('atlasHeight') or (info or {}).get('height') or 1)
        scale_u = entry['width'] / atlas_w
        scale_v = entry['height'] / atlas_h
        offset_u = entry['x'] / atlas_w
        offset_v = entry['y'] / atlas_h
        entries.append({
            'source': entry['source'],
            'setKey': entry['setKey'],
            'role': entry['role'],
            'atlasPage': entry['page'],
            'uvTransform': {
                'scale': [round(scale_u, 9), round(scale_v, 9)],
                'offset': [round(offset_u, 9), round(offset_v, 9)],
                'formula': 'uv_atlas = uv_source * scale + offset',
            },
            'halfTexelInset': [round(0.5 / atlas_w, 9), round(0.5 / atlas_h, 9)],
        })
    return {
        'schemaVersion': 1,
        'meshRewriteApplied': False,
        'requiresMaterialToSourceMapping': True,
        'safeForAutomaticUseOnlyAfterRenderBackGate': True,
        'entries': entries,
    }


def _seam_score(image: Image.Image) -> float:
    arr = np.asarray(image.convert('RGB'), dtype=np.float32) / 255.0
    if arr.shape[0] < 2 or arr.shape[1] < 2:
        return 1.0
    lr = float(np.mean(np.abs(arr[:, 0, :] - arr[:, -1, :])))
    tb = float(np.mean(np.abs(arr[0, :, :] - arr[-1, :, :])))
    return max(0.0, min(1.0, 1.0 - (lr + tb) * 0.5))


def build_tile_seam_candidate(source: Path, destination: Path, role: str, band: int = 8) -> dict:
    with Image.open(source) as raw:
        image = raw.convert('RGBA' if 'A' in raw.getbands() else ('L' if role in {'roughness', 'metallic', 'ao'} else 'RGB'))
    before = _seam_score(image)
    arr = np.asarray(image).astype(np.float32)
    h, w = arr.shape[:2]
    band = max(1, min(int(band), max(1, min(w, h) // 8)))
    out = arr.copy()
    for i in range(band):
        weight = (band - i) / (band + 1)
        left = arr[:, i].copy()
        right = arr[:, w - 1 - i].copy()
        avg = (left + right) * 0.5
        out[:, i] = left * (1.0 - weight) + avg * weight
        out[:, w - 1 - i] = right * (1.0 - weight) + avg * weight
        top = arr[i, :].copy()
        bottom = arr[h - 1 - i, :].copy()
        avg_tb = (top + bottom) * 0.5
        out[i, :] = top * (1.0 - weight) + avg_tb * weight
        out[h - 1 - i, :] = bottom * (1.0 - weight) + avg_tb * weight
    if role == 'normal':
        rgb = out[..., :3] if out.ndim == 3 else np.repeat(out[..., None], 3, axis=2)
        vec = rgb / 255.0 * 2.0 - 1.0
        vec /= np.maximum(np.linalg.norm(vec, axis=2, keepdims=True), 1e-6)
        out[..., :3] = np.clip((vec * 0.5 + 0.5) * 255.0, 0, 255)
    candidate = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), image.mode)
    after = _seam_score(candidate)
    center_a = np.asarray(image.crop((w // 4, h // 4, max(w // 4 + 1, 3 * w // 4), max(h // 4 + 1, 3 * h // 4))).convert('RGB'), dtype=np.float32)
    center_b = np.asarray(candidate.crop((w // 4, h // 4, max(w // 4 + 1, 3 * w // 4), max(h // 4 + 1, 3 * h // 4))).convert('RGB'), dtype=np.float32)
    center_delta = float(np.mean(np.abs(center_a - center_b)) / 255.0)
    passed = after >= before + 0.005 and center_delta <= 0.015
    if passed:
        candidate.save(destination, optimize=True)
    return {
        'candidateGenerated': passed,
        'beforeSeamScore': round(before, 6),
        'afterSeamScore': round(after, 6),
        'centerMeanDelta': round(center_delta, 6),
        'bandPixels': band,
        'nonDestructive': True,
        'file': destination.name if passed else None,
    }


def build_detail_macro_assets(source: Path, out_dir: Path, set_key: str, strength: float = 2.0) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as raw:
        rgb = raw.convert('RGB')
        gray = np.asarray(rgb.convert('L'), dtype=np.float32) / 255.0
    blur = np.asarray(Image.fromarray((gray * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(radius=2.0)), dtype=np.float32) / 255.0
    high = gray - blur
    gy, gx = np.gradient(high)
    nx = -gx * strength
    ny = -gy * strength
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length, ny / length, nz / length), axis=2)
    normal = np.clip((normal * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    macro_small = rgb.resize((max(1, rgb.width // 16), max(1, rgb.height // 16)), Image.Resampling.BILINEAR).resize(rgb.size, Image.Resampling.BICUBIC)
    safe = ''.join(ch if ch.isalnum() or ch in '._-' else '_' for ch in set_key)[:64]
    detail_path = out_dir / f'DETAIL_NORMAL_INFERRED_{safe}.png'
    macro_path = out_dir / f'MACRO_VARIATION_INFERRED_{safe}.png'
    Image.fromarray(normal, 'RGB').save(detail_path, optimize=True)
    macro_small.save(macro_path, optimize=True)
    return [detail_path, macro_path]


def build_texture_array_plan(rows: list[dict]) -> dict:
    groups: dict[tuple[str, int, int], list[str]] = {}
    for row in rows:
        key = (row['role'], int(row['output']['width']), int(row['output']['height']))
        groups.setdefault(key, []).append(row['source'])
    arrays = []
    for (role, width, height), sources in sorted(groups.items()):
        if len(sources) < 2:
            continue
        arrays.append({
            'role': role,
            'width': width,
            'height': height,
            'layers': len(sources),
            'sources': sources,
            'candidateOnly': True,
        })
    return {
        'schemaVersion': 1,
        'arrays': arrays,
        'bindlessCandidate': len(rows) >= 32,
        'runtimeBindingVerified': False,
    }



def build_material_instance_plan(rows: list[dict]) -> dict:
    sets: dict[str, dict[str, str]] = {}
    for row in rows:
        sets.setdefault(row['setKey'], {})[row['role']] = str(row.get('sourceSha256') or row.get('webVariant') or row['source'])
    signatures: dict[str, list[str]] = {}
    set_signatures = {}
    for set_key, roles in sorted(sets.items()):
        payload = json.dumps(sorted(roles.items()), separators=(',', ':'), ensure_ascii=False)
        import hashlib
        signature = hashlib.sha256(payload.encode('utf-8')).hexdigest()[:16]
        set_signatures[set_key] = signature
        signatures.setdefault(signature, []).append(set_key)
    duplicates = [
        {'canonicalSet': members[0], 'duplicateSets': members[1:], 'signature': signature}
        for signature, members in signatures.items() if len(members) > 1
    ]
    sampler_states = {
        'color': {'roles': ['albedo', 'emissive', 'generic'], 'colorSpace': 'sRGB', 'wrap': 'repeat', 'mipFilter': 'linear'},
        'normal': {'roles': ['normal'], 'colorSpace': 'linear', 'wrap': 'repeat', 'mipFilter': 'linear'},
        'data': {'roles': ['roughness', 'metallic', 'ao'], 'colorSpace': 'linear', 'wrap': 'repeat', 'mipFilter': 'linear'},
    }
    return {
        'schemaVersion': 1,
        'materialSets': len(sets),
        'duplicateMaterialGroups': duplicates,
        'estimatedMaterialInstancesSaved': sum(len(item['duplicateSets']) for item in duplicates),
        'canonicalSamplerStates': sampler_states,
        'runtimeApplyVerified': False,
    }

def detect_compression_tools() -> dict:
    def find(env: str, name: str):
        return os.environ.get(env) or shutil.which(name)
    return {
        'toktx': find('TOKTX_BIN', 'toktx'),
        'basisu': find('BASISU_BIN', 'basisu'),
        'compressonator': find('COMPRESSONATOR_BIN', 'CompressonatorCLI') or find('COMPRESSONATOR_BIN', 'compressonatorcli'),
        'astcenc': find('ASTCENC_BIN', 'astcenc'),
    }


def build_compression_matrix(rows: list[dict]) -> dict:
    tools = detect_compression_tools()
    per_role = {}
    roles = sorted({row['role'] for row in rows})
    for role in roles:
        per_role[role] = {
            'web': 'KTX2 UASTC' if role in {'normal', 'roughness', 'metallic', 'ao'} else 'KTX2 ETC1S',
            'godotDesktop': 'BC5' if role == 'normal' else ('BC4' if role in {'roughness', 'metallic', 'ao'} else 'BC7'),
            'godotMobile': 'ASTC 6x6',
            'roblox': 'PNG source; platform compression is managed by Roblox',
        }
    return {
        'schemaVersion': 1,
        'tools': {name: {'available': bool(path), 'path': path} for name, path in tools.items()},
        'matrix': per_role,
        'actualEncodingVerified': {
            'ktx2': bool(tools['toktx'] or tools['basisu']),
            'bc': False,
            'astc': False,
        },
        'rule': 'Never mark BC/ASTC verified until an encoder output is produced and decoded/imported successfully.',
    }


def write_json(path: Path, payload: dict) -> Path:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    return path
