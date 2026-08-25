from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import sqlite3
import subprocess
import time
from contextlib import closing
from pathlib import Path
from typing import Iterable


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def _safe_name(value: str) -> str:
    return ''.join(ch if ch.isalnum() or ch in '._-' else '_' for ch in value)[:120] or 'texture'


class GoldenTextureLibrary:
    """Content-addressed texture library.

    Persistence is real when root points at durable storage (mounted disk/R2 sync/etc.).
    The class never claims remote durability merely because the local SQLite database exists.
    """

    def __init__(self, root: Path):
        self.root = Path(root)
        self.blobs = self.root / 'blobs'
        self.db_path = self.root / 'golden-textures.sqlite3'
        self.root.mkdir(parents=True, exist_ok=True)
        self.blobs.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self):
        con = sqlite3.connect(self.db_path)
        con.execute('PRAGMA journal_mode=WAL')
        con.execute('PRAGMA synchronous=NORMAL')
        return con

    def _init_db(self) -> None:
        with closing(self._connect()) as con:
            con.execute('''CREATE TABLE IF NOT EXISTS assets (
                sha256 TEXT PRIMARY KEY,
                role TEXT NOT NULL,
                material TEXT NOT NULL,
                quality_tier TEXT NOT NULL,
                source_name TEXT NOT NULL,
                blob_path TEXT NOT NULL,
                bytes INTEGER NOT NULL,
                quality_score REAL,
                gate_passed INTEGER NOT NULL,
                created_at REAL NOT NULL,
                last_used_at REAL NOT NULL,
                uses INTEGER NOT NULL DEFAULT 0,
                metadata_json TEXT NOT NULL
            )''')
            con.execute('CREATE INDEX IF NOT EXISTS idx_assets_profile ON assets(role, material, quality_tier, gate_passed, quality_score)')
            con.commit()

    def promote(self, path: Path, *, role: str, material: str, quality_tier: str, source_name: str,
                quality_score: float, gate_passed: bool, metadata: dict | None = None) -> dict:
        path = Path(path)
        digest = _sha256(path)
        suffix = path.suffix.lower() or '.bin'
        blob = self.blobs / digest[:2] / f'{digest}{suffix}'
        blob.parent.mkdir(parents=True, exist_ok=True)
        if not blob.exists():
            shutil.copy2(path, blob)
        now = time.time()
        payload = json.dumps(metadata or {}, ensure_ascii=False, sort_keys=True)
        with closing(self._connect()) as con:
            con.execute('''INSERT INTO assets
                (sha256, role, material, quality_tier, source_name, blob_path, bytes, quality_score, gate_passed, created_at, last_used_at, uses, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                ON CONFLICT(sha256) DO UPDATE SET
                  last_used_at=excluded.last_used_at,
                  quality_score=MAX(COALESCE(assets.quality_score, 0), COALESCE(excluded.quality_score, 0)),
                  gate_passed=MAX(assets.gate_passed, excluded.gate_passed),
                  metadata_json=excluded.metadata_json''',
                (digest, role, material, quality_tier, source_name, str(blob), blob.stat().st_size,
                 float(quality_score), 1 if gate_passed else 0, now, now, payload))
            con.commit()
        return {'sha256': digest, 'blob': str(blob), 'promoted': bool(gate_passed), 'bytes': blob.stat().st_size}

    def best(self, *, role: str, material: str, quality_tier: str, minimum_score: float = 0.0) -> dict | None:
        with closing(self._connect()) as con:
            row = con.execute('''SELECT sha256, blob_path, quality_score, source_name, metadata_json
                FROM assets WHERE role=? AND material=? AND quality_tier=? AND gate_passed=1 AND quality_score>=?
                ORDER BY quality_score DESC, last_used_at DESC LIMIT 1''',
                (role, material, quality_tier, float(minimum_score))).fetchone()
            if not row:
                return None
            con.execute('UPDATE assets SET uses=uses+1, last_used_at=? WHERE sha256=?', (time.time(), row[0]))
            con.commit()
        return {'sha256': row[0], 'blob': row[1], 'qualityScore': row[2], 'sourceName': row[3], 'metadata': json.loads(row[4] or '{}')}

    def stats(self) -> dict:
        with closing(self._connect()) as con:
            count, passed, bytes_total, uses = con.execute('SELECT COUNT(*), SUM(gate_passed), SUM(bytes), SUM(uses) FROM assets').fetchone()
        return {
            'assets': int(count or 0),
            'verifiedAssets': int(passed or 0),
            'blobBytes': int(bytes_total or 0),
            'reuseCount': int(uses or 0),
            'root': str(self.root),
            'remoteDurabilityVerified': False,
        }


def resolve_golden_library_root(job_dir: Path) -> tuple[Path, str]:
    env = os.environ.get('TEXTURE_GOLDEN_LIBRARY_DIR')
    if env:
        return Path(env).expanduser().resolve(), 'configured-durable-path-candidate'
    return (Path(job_dir) / '.texture-quality-cache' / 'golden-library').resolve(), 'local-worker-path'


def _profile_cap(profile: str) -> int:
    return {
        'web_mobile': 2048,
        'godot_mobile': 2048,
        'roblox': 2048,
        'web_desktop': 4096,
        'godot_desktop': 4096,
    }.get(profile, 2048)


def _priority_score(event: dict) -> float:
    distance = max(0.05, float(event.get('distance', 100.0)))
    coverage = max(0.0, min(1.0, float(event.get('screenCoverage', 0.0))))
    visible = 1.0 if event.get('visible', True) else 0.15
    seconds = max(0.0, float(event.get('seconds', 1.0)))
    return visible * seconds * (0.25 + coverage * 3.0) / math.sqrt(distance)


def build_camera_heatmap_feedback(events: Iterable[dict], runtime_plan: dict | None = None) -> dict:
    accum: dict[str, dict] = {}
    for event in events:
        set_key = str(event.get('setKey') or event.get('material') or '').strip()
        if not set_key:
            continue
        item = accum.setdefault(set_key, {'score': 0.0, 'samples': 0, 'minDistance': float('inf'), 'coverageWeighted': 0.0, 'seconds': 0.0})
        score = _priority_score(event)
        seconds = max(0.0, float(event.get('seconds', 1.0)))
        coverage = max(0.0, min(1.0, float(event.get('screenCoverage', 0.0))))
        item['score'] += score
        item['samples'] += 1
        item['minDistance'] = min(item['minDistance'], max(0.0, float(event.get('distance', 100.0))))
        item['coverageWeighted'] += coverage * max(seconds, 1e-6)
        item['seconds'] += seconds
    ranked = sorted(accum.items(), key=lambda kv: kv[1]['score'], reverse=True)
    max_score = ranked[0][1]['score'] if ranked else 1.0
    feedback = []
    for rank, (set_key, item) in enumerate(ranked):
        normalized = item['score'] / max(max_score, 1e-9)
        if normalized >= 0.66:
            priority, mip_bias = 'critical', 0
        elif normalized >= 0.30:
            priority, mip_bias = 'high', 1
        elif normalized >= 0.10:
            priority, mip_bias = 'medium', 2
        else:
            priority, mip_bias = 'low', 3
        feedback.append({
            'setKey': set_key,
            'rank': rank + 1,
            'priority': priority,
            'normalizedAttention': round(normalized, 6),
            'recommendedMipBias': mip_bias,
            'samples': item['samples'],
            'minObservedDistance': round(item['minDistance'], 3),
            'meanScreenCoverage': round(item['coverageWeighted'] / max(item['seconds'], 1e-6), 6),
        })
    return {
        'schemaVersion': 1,
        'eventsConsumed': sum(item['samples'] for item in accum.values()),
        'materialSetsObserved': len(feedback),
        'feedback': feedback,
        'runtimePlanRetuneReady': bool(runtime_plan and feedback),
        'rule': 'Heatmap changes are recommendations until an engine runtime gate promotes them.',
    }


def retune_runtime_plan(runtime_plan: dict, feedback: dict) -> dict:
    by_set = {item['setKey']: item for item in feedback.get('feedback', [])}
    tuned = json.loads(json.dumps(runtime_plan))
    changed = 0
    for profile_name, profile in tuned.get('profiles', {}).items():
        cap = _profile_cap(profile_name)
        for texture in profile.get('textures', []):
            hint = by_set.get(texture.get('setKey'))
            if not hint:
                continue
            baseline = int(texture.get('residentMipFloor', 0))
            # Critical materials may pull one mip closer; low-priority may release one mip.
            if hint['priority'] == 'critical':
                target_floor = max(0, baseline - 1)
            elif hint['priority'] == 'low':
                target_floor = min(baseline + 1, 8)
            else:
                target_floor = baseline
            if target_floor != baseline:
                changed += 1
            texture['feedbackResidentMipFloor'] = target_floor
            texture['feedbackPriority'] = hint['priority']
            texture['feedbackAttention'] = hint['normalizedAttention']
            texture['feedbackMaxDimensionCap'] = cap
    tuned['cameraFeedbackAppliedAsCandidate'] = bool(changed)
    tuned['cameraFeedbackChanges'] = changed
    tuned['dynamicRuntimeVerified'] = False
    return tuned



def solve_runtime_vram_budget(runtime_plan: dict, feedback: dict | None = None) -> dict:
    """Greedily fit candidate residency into each platform budget.

    It preserves high-attention and high-value roles as long as possible and never
    marks the result runtime-verified.
    """
    tuned = json.loads(json.dumps(runtime_plan))
    hints = {item.get('setKey'): item for item in (feedback or {}).get('feedback', [])}
    role_weight = {'albedo': 4.0, 'normal': 3.5, 'emissive': 2.5, 'roughness': 1.7, 'ao': 1.3, 'metallic': 1.2, 'generic': 2.5}
    for profile_name, profile in tuned.get('profiles', {}).items():
        textures = profile.get('textures', [])
        budget = int(profile.get('textureVramBudgetBytes', 0) or 0)
        before = sum(int(t.get('estimatedResidentVramBytes', 0) or 0) for t in textures)
        state = []
        for index, tex in enumerate(textures):
            base_bytes = max(1, int(tex.get('estimatedResidentVramBytes', 1)))
            floor = int(tex.get('feedbackResidentMipFloor', tex.get('residentMipFloor', 0)) or 0)
            hint = hints.get(tex.get('setKey'), {})
            attention = float(hint.get('normalizedAttention', tex.get('feedbackAttention', 0.0)) or 0.0)
            importance = role_weight.get(tex.get('role'), 1.0) * (1.0 + attention * 6.0)
            if hint.get('priority') == 'critical':
                importance *= 8.0
            elif hint.get('priority') == 'high':
                importance *= 3.0
            state.append({'index': index, 'floor': floor, 'bytes': base_bytes, 'importance': importance})
        total = before
        changes = 0
        # Each extra mip floor is approximately quarter memory for a full mip pyramid.
        while budget > 0 and total > budget:
            candidates = []
            for item in state:
                tex = textures[item['index']]
                max_dim = max(int(tex.get('residentMaxDimension', 1) or 1), 1)
                max_extra = max(0, int(math.ceil(math.log(max_dim, 2))))
                if item['floor'] >= max_extra:
                    continue
                next_bytes = max(1, int(math.ceil(item['bytes'] / 4.0)))
                saving = item['bytes'] - next_bytes
                if saving <= 0:
                    continue
                # Prefer large savings with low visual importance.
                cost = item['importance'] / saving
                candidates.append((cost, -saving, item, next_bytes))
            if not candidates:
                break
            candidates.sort(key=lambda x: (x[0], x[1]))
            _, _, chosen, next_bytes = candidates[0]
            total -= chosen['bytes'] - next_bytes
            chosen['bytes'] = next_bytes
            chosen['floor'] += 1
            changes += 1
        for item in state:
            tex = textures[item['index']]
            tex['budgetSolvedResidentMipFloor'] = item['floor']
            tex['budgetSolvedVramBytes'] = item['bytes']
        profile['budgetSolver'] = {
            'beforeBytes': before,
            'afterBytes': total,
            'budgetBytes': budget,
            'mipAdjustments': changes,
            'gate': 'PASS' if budget <= 0 or total <= budget else 'UNRESOLVED_OVER_BUDGET',
            'candidateOnly': True,
        }
    tuned['budgetSolverApplied'] = True
    tuned['dynamicRuntimeVerified'] = False
    return tuned

def build_engine_adapter_manifest(runtime_plan: dict, atlas_manifest: dict, texture_array_plan: dict) -> dict:
    return {
        'schemaVersion': 1,
        'candidateOnly': True,
        'promotionRequiresRuntimeGate': True,
        'web': {
            'adapter': 'tools/texture_runtime_adapters/web/texture_runtime_adapter.js',
            'metricsCollector': 'tools/texture_runtime_collectors/web/texture_metrics_collector.js',
            'capabilities': ['distance/coverage priority', 'mip recommendation', 'telemetry JSONL', 'WebGL2 texture-array upload helper'],
            'virtualTextureBackend': 'plan-consumer; physical-page uploader must be wired to project renderer',
            'verifiedInTargetRuntime': False,
        },
        'godot': {
            'adapter': 'tools/texture_runtime_adapters/godot/TextureRuntimeAdapter.gd',
            'metricsCollector': 'tools/texture_runtime_collectors/godot/TextureMetricsCollector.gd',
            'capabilities': ['camera-priority telemetry', 'runtime hint application hooks', 'metrics export'],
            'virtualTextureBackend': 'adapter hook; native/custom VT implementation required by project renderer',
            'verifiedInTargetRuntime': False,
        },
        'roblox': {
            'adapter': 'tools/texture_runtime_adapters/roblox/TextureRuntimeAdapter.luau',
            'metricsCollector': 'tools/texture_runtime_collectors/roblox/TextureMetricsCollector.luau',
            'capabilities': ['camera-priority telemetry', 'pre-uploaded quality variant selection'],
            'virtualTextureBackend': 'not exposed as a generic user-controlled VT API; use uploaded variants/engine streaming',
            'verifiedInTargetRuntime': False,
        },
        'blenderUvRebind': {
            'adapter': 'tools/texture_runtime_adapters/blender/apply_texture_uv_rebind.py',
            'requires': ['Blender Python', 'material-to-setKey mapping JSON', 'texture-uv-rebind-plan.json'],
            'output': 'candidate GLB; source never overwritten',
            'verifiedOnRealAsset': False,
        },
        'atlasPages': len(atlas_manifest.get('pages', [])),
        'textureArrayCandidates': len(texture_array_plan.get('arrays', [])),
        'runtimeProfiles': sorted(runtime_plan.get('profiles', {}).keys()),
    }


def _magic_ok(path: Path, kind: str) -> bool:
    if not path.is_file() or path.stat().st_size < 8:
        return False
    data = path.read_bytes()[:16]
    if kind == 'ktx2':
        return data.startswith(b'\xabKTX 20\xbb\r\n\x1a\n')
    if kind == 'dds':
        return data.startswith(b'DDS ')
    if kind == 'astc':
        return data[:4] == bytes.fromhex('13 ab a1 5c')
    return False


def verify_compressed_container(path: Path, kind: str) -> dict:
    return {'file': str(path), 'kind': kind, 'exists': path.is_file(), 'signatureVerified': _magic_ok(path, kind), 'engineImportVerified': False}


def _run(command: list[str], cwd: Path) -> tuple[int, str]:
    proc = subprocess.run(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False)
    return proc.returncode, proc.stdout[-5000:]


def encode_platform_candidates(source: Path, role: str, out_dir: Path, tools: dict) -> list[dict]:
    """Try real external encoders when installed. Never marks engine import as verified here."""
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    safe = _safe_name(source.stem)
    compressonator = tools.get('compressonator')
    astcenc = tools.get('astcenc')
    if compressonator:
        fmt = 'BC5' if role == 'normal' else ('BC4' if role in {'roughness', 'metallic', 'ao'} else 'BC7')
        dst = out_dir / f'{safe}_{fmt}.dds'
        rc, log = _run([str(compressonator), '-fd', fmt, str(source), str(dst)], out_dir)
        result = verify_compressed_container(dst, 'dds')
        result.update({'format': fmt, 'encoderRan': True, 'returnCode': rc, 'logTail': log, 'verified': rc == 0 and result['signatureVerified']})
        results.append(result)
    if astcenc:
        dst = out_dir / f'{safe}_ASTC_6x6.astc'
        rc, log = _run([str(astcenc), '-cl', str(source), str(dst), '6x6', '-medium'], out_dir)
        result = verify_compressed_container(dst, 'astc')
        result.update({'format': 'ASTC_6x6', 'encoderRan': True, 'returnCode': rc, 'logTail': log, 'verified': rc == 0 and result['signatureVerified']})
        results.append(result)
    return results


def read_telemetry_jsonl(path: Path, max_events: int = 200000) -> list[dict]:
    events = []
    if not path.is_file():
        return events
    with path.open('r', encoding='utf-8') as f:
        for line in f:
            if len(events) >= max_events:
                break
            line = line.strip()
            if not line:
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict):
                events.append(value)
    return events
