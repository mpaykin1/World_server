from __future__ import annotations

import hashlib
import json
import math
import os
import sqlite3
import time
from contextlib import closing
from pathlib import Path
from typing import Iterable


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _stable_hash(value) -> str:
    raw = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def _profile_texture_rows(runtime_plan: dict) -> list[tuple[str, dict]]:
    rows: list[tuple[str, dict]] = []
    for profile_name, profile in (runtime_plan.get('profiles') or {}).items():
        for texture in profile.get('textures') or []:
            rows.append((str(profile_name), texture))
    return rows


SEMANTIC_WEIGHTS = {
    'face': 1.00,
    'character': 0.98,
    'hero': 0.97,
    'signage': 0.94,
    'text': 0.93,
    'weapon': 0.90,
    'interactive': 0.88,
    'vehicle': 0.84,
    'architecture': 0.72,
    'prop': 0.66,
    'ground': 0.58,
    'background': 0.42,
    'sky': 0.34,
}


def semantic_importance(set_key: str, metadata: dict | None = None, runtime_hint: dict | None = None) -> dict:
    metadata = metadata or {}
    runtime_hint = runtime_hint or {}
    tags = {str(x).strip().lower() for x in metadata.get('tags', []) if str(x).strip()}
    name = str(metadata.get('name') or set_key or '').lower()
    for token in ('face', 'character', 'hero', 'sign', 'text', 'weapon', 'vehicle', 'ground', 'background', 'sky'):
        if token in name:
            tags.add('signage' if token == 'sign' else token)
    semantic = max([SEMANTIC_WEIGHTS.get(tag, 0.0) for tag in tags] + [0.55])
    explicit = metadata.get('importance')
    if explicit is not None:
        semantic = max(semantic, _clamp(_safe_float(explicit, semantic)))
    coverage = _clamp(_safe_float(runtime_hint.get('screenCoverage', runtime_hint.get('coverage', 0.0))))
    attention = _clamp(_safe_float(runtime_hint.get('attentionScore', 0.0)))
    score = _clamp(max(0.94 * semantic, 0.68 * semantic + 0.20 * coverage + 0.12 * attention))
    priority = 'critical' if score >= 0.88 else ('high' if score >= 0.72 else ('medium' if score >= 0.52 else 'low'))
    return {
        'setKey': str(set_key),
        'tags': sorted(tags),
        'semanticBase': round(semantic, 6),
        'screenCoverage': round(coverage, 6),
        'attentionScore': round(attention, 6),
        'saliencyScore': round(score, 6),
        'priority': priority,
    }


def build_semantic_saliency_plan(runtime_plan: dict, semantic_metadata: dict | None = None, camera_feedback: dict | None = None) -> dict:
    semantic_metadata = semantic_metadata or {}
    feedback_by_key = {}
    for row in (camera_feedback or {}).get('materials', []) + (camera_feedback or {}).get('entries', []):
        key = str(row.get('setKey') or '')
        if key:
            feedback_by_key[key] = row
    keys = sorted({str(t.get('setKey')) for _, t in _profile_texture_rows(runtime_plan) if t.get('setKey')})
    entries = []
    for key in keys:
        meta = semantic_metadata.get(key, {}) if isinstance(semantic_metadata, dict) else {}
        entries.append(semantic_importance(key, meta, feedback_by_key.get(key)))
    return {
        'schemaVersion': 1,
        'entries': entries,
        'criticalSets': [e['setKey'] for e in entries if e['priority'] == 'critical'],
        'highOrCriticalSets': [e['setKey'] for e in entries if e['priority'] in {'high', 'critical'}],
        'rule': 'Semantic importance may preserve quality; it may not bypass hard VRAM/performance gates.',
    }


def build_exploration_mission(material_positions: dict | None = None, bounds: dict | None = None, max_waypoints: int = 24) -> dict:
    material_positions = material_positions or {}
    max_waypoints = max(4, min(int(max_waypoints), 128))
    waypoints = []
    for key in sorted(material_positions):
        raw = material_positions[key]
        if not isinstance(raw, (list, tuple)) or len(raw) < 3:
            continue
        x, y, z = map(float, raw[:3])
        offsets = ((4.0, 1.8, 0.0), (-4.0, 1.8, 0.0), (0.0, 1.8, 4.0), (0.0, 1.8, -4.0))
        for ox, oy, oz in offsets:
            waypoints.append({
                'position': [round(x + ox, 4), round(y + oy, 4), round(z + oz, 4)],
                'lookAt': [round(x, 4), round(y + 1.2, 4), round(z, 4)],
                'targetSetKey': key,
                'dwellSeconds': 0.8,
            })
            if len(waypoints) >= max_waypoints:
                break
        if len(waypoints) >= max_waypoints:
            break
    if not waypoints:
        bounds = bounds or {'min': [-12, 1.8, -12], 'max': [12, 1.8, 12]}
        lo = bounds.get('min', [-12, 1.8, -12]); hi = bounds.get('max', [12, 1.8, 12])
        cx = (float(lo[0]) + float(hi[0])) * 0.5; cz = (float(lo[2]) + float(hi[2])) * 0.5
        y = max(1.0, float(lo[1]) if len(lo) > 1 else 1.8)
        radius_x = max(2.0, (float(hi[0]) - float(lo[0])) * 0.42)
        radius_z = max(2.0, (float(hi[2]) - float(lo[2])) * 0.42)
        count = min(max_waypoints, 12)
        for i in range(count):
            a = (2.0 * math.pi * i) / count
            waypoints.append({
                'position': [round(cx + math.cos(a) * radius_x, 4), round(y, 4), round(cz + math.sin(a) * radius_z, 4)],
                'lookAt': [round(cx, 4), round(y, 4), round(cz, 4)],
                'targetSetKey': None,
                'dwellSeconds': 0.7,
            })
    return {
        'schemaVersion': 1,
        'waypoints': waypoints[:max_waypoints],
        'waypointCount': min(len(waypoints), max_waypoints),
        'collect': ['setKey', 'distance', 'screenCoverage', 'cameraPosition', 'cameraForward', 'materialPosition', 'fps', 'p95FrameMs'],
        'candidateOnly': True,
        'rule': 'Engine adapter must obey collisions/navigation and may abort a waypoint rather than teleport through geometry.',
    }


def build_network_delivery_plan(runtime_plan: dict, saliency_plan: dict, prefetch_plan: dict | None = None, network: dict | None = None) -> dict:
    network = network or {}
    bandwidth_mbps = max(0.1, _safe_float(network.get('bandwidthMbps', 25.0), 25.0))
    rtt_ms = max(1.0, _safe_float(network.get('rttMs', 60.0), 60.0))
    loss = _clamp(_safe_float(network.get('packetLoss', network.get('lossRatio', 0.0))), 0.0, 0.5)
    cache_hit = _clamp(_safe_float(network.get('cacheHitRatio', 0.5)))
    if bandwidth_mbps < 4 or rtt_ms > 220 or loss > 0.08:
        concurrency = 2
    elif bandwidth_mbps < 12 or rtt_ms > 120 or loss > 0.03:
        concurrency = 3
    elif bandwidth_mbps < 40:
        concurrency = 5
    else:
        concurrency = 8
    safe_kbps = bandwidth_mbps * 1000.0 / 8.0 * (0.70 - min(loss, 0.2))
    saliency = {e['setKey']: float(e['saliencyScore']) for e in saliency_plan.get('entries', [])}
    prefetch = {(e.get('profile'), e.get('setKey')): float(e.get('prefetchScore', 0.0)) for e in (prefetch_plan or {}).get('entries', [])}
    queue = []
    seen = set()
    for profile, texture in _profile_texture_rows(runtime_plan):
        key = str(texture.get('setKey') or '')
        if not key or (profile, key) in seen:
            continue
        seen.add((profile, key))
        s = saliency.get(key, 0.55)
        p = prefetch.get((profile, key), 0.0)
        floor = int(texture.get('budgetSolvedResidentMipFloor', texture.get('feedbackResidentMipFloor', texture.get('residentMipFloor', 0))))
        urgency = _clamp(0.72 * s + 0.28 * p)
        if bandwidth_mbps < 6 and urgency < 0.75:
            floor += 1
        queue.append({
            'profile': profile,
            'setKey': key,
            'priorityScore': round(urgency, 6),
            'targetMipFloor': max(0, floor),
            'cdnPolicy': 'cache-first' if cache_hit >= 0.45 else 'origin-with-cache-fill',
        })
    queue.sort(key=lambda x: x['priorityScore'], reverse=True)
    return {
        'schemaVersion': 1,
        'network': {'bandwidthMbps': bandwidth_mbps, 'rttMs': rtt_ms, 'packetLoss': loss, 'cacheHitRatio': cache_hit},
        'maxConcurrentRequests': concurrency,
        'safeTransferBudgetKBps': round(max(16.0, safe_kbps), 3),
        'queue': queue,
        'runtimeVerified': False,
        'rule': 'Network hints change delivery order/mip candidates only; runtime visual/performance gates remain authoritative.',
    }


def build_virtual_texture_backend_plan(runtime_plan: dict, gpu_capabilities: dict | None = None) -> dict:
    gpu_capabilities = gpu_capabilities or {}
    profiles = {}
    for profile_name, profile in (runtime_plan.get('profiles') or {}).items():
        caps = gpu_capabilities.get(profile_name, {}) if isinstance(gpu_capabilities, dict) else {}
        if profile_name.startswith('web_'):
            webgpu = bool(caps.get('webgpu'))
            backend = 'webgpu-software-page-cache' if webgpu else 'webgl2-texture-array-page-cache'
            sparse = False
        elif profile_name.startswith('godot_'):
            rd = bool(caps.get('renderingDevice'))
            backend = 'godot-renderingdevice-page-cache' if rd else 'godot-texture2darray-page-cache'
            sparse = False
        elif profile_name == 'roblox':
            backend = 'roblox-uploaded-asset-tier-streamer'
            sparse = False
        else:
            backend = 'none'; sparse = False
        profiles[profile_name] = {
            'backend': backend,
            'hardwareSparseResidencyClaimed': sparse,
            'physicalPageCache': profile_name != 'roblox',
            'pageTableRequired': profile_name != 'roblox',
            'runtimeVerified': False,
            'textureCount': len(profile.get('textures') or []),
        }
    return {
        'schemaVersion': 1,
        'profiles': profiles,
        'hardwareSparseResidencyClaimed': False,
        'rule': 'V6 implements software virtual-texture page caches; it never labels WebGPU/Godot texture arrays as hardware sparse residency.',
    }


def build_shader_material_cooptimization(rows: list[dict], material_instance_plan: dict | None = None) -> dict:
    material_instance_plan = material_instance_plan or {}
    by_set: dict[str, dict] = {}
    for row in rows:
        key = str(row.get('setKey') or 'material')
        rec = by_set.setdefault(key, {'roles': set(), 'alpha': False, 'materials': set()})
        rec['roles'].add(str(row.get('role') or 'generic'))
        rec['materials'].add(str(row.get('material') or 'generic'))
        output = row.get('output') or {}
        rec['alpha'] = rec['alpha'] or bool(output.get('hasAlpha') or output.get('alpha'))
    signatures = {}
    sets = []
    for key, rec in sorted(by_set.items()):
        roles = sorted(rec['roles'])
        features = {
            'normal': 'normal' in roles,
            'orm': any(r in roles for r in ('roughness', 'metallic', 'ao')),
            'emissive': 'emissive' in roles,
            'alpha': bool(rec['alpha']),
        }
        signature = _stable_hash(features)[:16]
        signatures.setdefault(signature, []).append(key)
        sets.append({'setKey': key, 'featureSignature': signature, 'features': features, 'roles': roles})
    before = len(sets)
    after = len(signatures)
    sampler_classes = 0
    if any(any(r in s['roles'] for r in ('albedo', 'generic', 'emissive')) for s in sets):
        sampler_classes += 1
    if any(any(r in s['roles'] for r in ('normal', 'roughness', 'metallic', 'ao')) for s in sets):
        sampler_classes += 1
    return {
        'schemaVersion': 1,
        'materialSets': sets,
        'featureSignatures': [{'signature': sig, 'setKeys': keys} for sig, keys in sorted(signatures.items())],
        'estimatedShaderPermutationsBefore': before,
        'estimatedShaderPermutationsAfter': after,
        'estimatedPermutationsSaved': max(0, before - after),
        'samplerClasses': sampler_classes,
        'materialInstancePlanSavings': int(material_instance_plan.get('estimatedMaterialInstancesSaved', 0)),
        'runtimeVerified': False,
        'rule': 'Disable only features proven unused by the material set; renderer compilation must pass before promotion.',
    }


class CrossProjectMaterialLibrary:
    """Persistent canonical identities for exact verified material sets across projects."""

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.db_path = self.root / 'materials.sqlite3'
        self._init_db()

    def _connect(self):
        db = sqlite3.connect(self.db_path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def _init_db(self) -> None:
        with closing(self._connect()) as db:
            db.execute('CREATE TABLE IF NOT EXISTS canonical_materials (fingerprint TEXT PRIMARY KEY, canonical_id TEXT NOT NULL, set_key TEXT NOT NULL, roles_json TEXT NOT NULL, verified INTEGER NOT NULL, quality REAL NOT NULL, metadata_json TEXT NOT NULL, updated_at REAL NOT NULL)')
            db.commit()

    @staticmethod
    def fingerprint(rows: Iterable[dict]) -> str:
        items = []
        for row in rows:
            items.append({'role': str(row.get('role') or ''), 'sha256': str(row.get('sourceSha256') or '')})
        items.sort(key=lambda x: (x['role'], x['sha256']))
        return _stable_hash(items)

    def register(self, set_key: str, rows: list[dict], verified: bool, quality: float, metadata: dict | None = None) -> dict:
        fp = self.fingerprint(rows)
        canonical_id = f'mat_{fp[:20]}'
        roles = sorted({str(r.get('role') or '') for r in rows if r.get('role')})
        with closing(self._connect()) as db:
            db.execute(
                'INSERT INTO canonical_materials(fingerprint, canonical_id, set_key, roles_json, verified, quality, metadata_json, updated_at) VALUES(?,?,?,?,?,?,?,?) '
                'ON CONFLICT(fingerprint) DO UPDATE SET verified=MAX(verified,excluded.verified), quality=MAX(quality,excluded.quality), metadata_json=excluded.metadata_json, updated_at=excluded.updated_at',
                (fp, canonical_id, str(set_key), json.dumps(roles), 1 if verified else 0, float(quality), json.dumps(metadata or {}, sort_keys=True), time.time()),
            )
            db.commit()
        return {'setKey': set_key, 'fingerprint': fp, 'canonicalMaterialId': canonical_id, 'verified': bool(verified), 'roles': roles}

    def export(self) -> dict:
        with closing(self._connect()) as db:
            rows = db.execute('SELECT * FROM canonical_materials ORDER BY canonical_id').fetchall()
        return {
            'schemaVersion': 1,
            'materials': [
                {
                    'canonicalMaterialId': r['canonical_id'], 'fingerprint': r['fingerprint'], 'sourceSetKey': r['set_key'],
                    'roles': json.loads(r['roles_json']), 'verified': bool(r['verified']), 'quality': float(r['quality']),
                } for r in rows
            ],
        }


def resolve_material_library_root(job_dir: Path) -> tuple[Path, str]:
    configured = str(os.environ.get('TEXTURE_MATERIAL_LIBRARY_DIR', '')).strip()
    if configured:
        return Path(configured).expanduser().resolve(), 'configured-durable-path'
    return Path(job_dir) / '.texture-material-library', 'job-local-fallback'


def build_cross_project_material_library_report(rows: list[dict], root: Path, gate_passed_only: bool = True) -> dict:
    lib = CrossProjectMaterialLibrary(root)
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(str(row.get('setKey') or 'material'), []).append(row)
    registrations = []
    for set_key, set_rows in sorted(grouped.items()):
        verified = all(bool((r.get('regressionGate') or {}).get('passed')) for r in set_rows)
        quality = min([_safe_float(r.get('outputReadinessPercent', 0.0)) for r in set_rows] or [0.0])
        if gate_passed_only and not verified:
            registrations.append({'setKey': set_key, 'registered': False, 'reason': 'regression-gate-not-passed'})
            continue
        registrations.append({'registered': True, **lib.register(set_key, set_rows, verified, quality)})
    exported = lib.export()
    return {
        'schemaVersion': 1,
        'registrations': registrations,
        'canonicalMaterials': exported['materials'],
        'canonicalCount': len(exported['materials']),
        'db': str(lib.db_path),
        'rule': 'Only exact content fingerprints are auto-canonicalized; perceptually similar materials remain review candidates.',
    }


def detect_policy_drift(baseline: dict | None, current: dict | None, thresholds: dict | None = None) -> dict:
    baseline = baseline or {}; current = current or {}; thresholds = thresholds or {}
    fps_drop_limit = abs(_safe_float(thresholds.get('fpsDropRatio', 0.04), 0.04))
    p95_increase_limit = abs(_safe_float(thresholds.get('p95IncreaseRatio', 0.06), 0.06))
    vram_increase_limit = abs(_safe_float(thresholds.get('vramIncreaseRatio', 0.06), 0.06))
    visual_limit = abs(_safe_float(thresholds.get('visualDelta', 0.035), 0.035))
    checks = {}
    b_fps = _safe_float(baseline.get('fps'), 0.0); c_fps = _safe_float(current.get('fps'), 0.0)
    checks['fps'] = True if b_fps <= 0 or c_fps <= 0 else c_fps >= b_fps * (1.0 - fps_drop_limit)
    b_p95 = _safe_float(baseline.get('p95FrameMs'), 0.0); c_p95 = _safe_float(current.get('p95FrameMs'), 0.0)
    checks['p95FrameMs'] = True if b_p95 <= 0 or c_p95 <= 0 else c_p95 <= b_p95 * (1.0 + p95_increase_limit)
    b_vram = _safe_float(baseline.get('textureVramMB'), 0.0); c_vram = _safe_float(current.get('textureVramMB'), 0.0)
    checks['textureVramMB'] = True if b_vram <= 0 or c_vram <= 0 else c_vram <= b_vram * (1.0 + vram_increase_limit)
    visual = _safe_float(current.get('visualDelta'), 0.0)
    checks['visualDelta'] = visual <= visual_limit
    drift = not all(checks.values())
    return {
        'schemaVersion': 1,
        'driftDetected': drift,
        'checks': checks,
        'action': 'ROLLBACK_CANDIDATE_POLICY' if drift else 'KEEP_CANDIDATE',
        'baseline': baseline,
        'current': current,
        'thresholds': {'fpsDropRatio': fps_drop_limit, 'p95IncreaseRatio': p95_increase_limit, 'vramIncreaseRatio': vram_increase_limit, 'visualDelta': visual_limit},
    }


DEFAULT_DEVICE_CLASSES = [
    {'id': 'web_low_mobile', 'profile': 'web_mobile', 'formats': ['ETC2', 'ASTC_6x6', 'KTX2_ETC1S']},
    {'id': 'web_high_mobile', 'profile': 'web_mobile', 'formats': ['ASTC_4x4', 'ASTC_6x6', 'KTX2_UASTC']},
    {'id': 'web_desktop_integrated', 'profile': 'web_desktop', 'formats': ['BC7', 'KTX2_UASTC']},
    {'id': 'web_desktop_discrete', 'profile': 'web_desktop', 'formats': ['BC7', 'BC5', 'KTX2_UASTC']},
    {'id': 'godot_mobile', 'profile': 'godot_mobile', 'formats': ['ASTC_4x4', 'ETC2']},
    {'id': 'godot_desktop', 'profile': 'godot_desktop', 'formats': ['BC7', 'BC5', 'BC4']},
    {'id': 'roblox_mobile', 'profile': 'roblox', 'formats': ['ENGINE_MANAGED_SOURCE']},
    {'id': 'roblox_desktop', 'profile': 'roblox', 'formats': ['ENGINE_MANAGED_SOURCE']},
]


def build_benchmark_farm_plan(device_classes: list[dict] | None = None, repetitions: int = 3) -> dict:
    device_classes = device_classes or DEFAULT_DEVICE_CLASSES
    repetitions = max(1, min(int(repetitions), 10))
    jobs = []
    for device in device_classes:
        for fmt in device.get('formats', []):
            jobs.append({
                'jobId': f"{device['id']}::{fmt}", 'deviceClass': device['id'], 'profile': device['profile'], 'format': fmt,
                'repetitions': repetitions, 'requiredMetrics': ['fps', 'p95FrameMs', 'visualDelta', 'loadMs'],
                'optionalMetrics': ['textureVramMB', 'networkBytes'], 'verified': False,
            })
    return {
        'schemaVersion': 1,
        'deviceClasses': device_classes,
        'jobs': jobs,
        'jobCount': len(jobs),
        'rule': 'A device-class recommendation becomes verified only from real hardware/runtime results, never from this plan alone.',
    }


def aggregate_benchmark_results(results: Iterable[dict]) -> dict:
    grouped: dict[str, list[dict]] = {}
    for row in results:
        if not bool(row.get('passed')):
            continue
        device = str(row.get('deviceClass') or '')
        if device:
            grouped.setdefault(device, []).append(dict(row))
    recommendations = []
    for device, rows in sorted(grouped.items()):
        def score(r):
            fps = _safe_float(r.get('fps'), 0.0)
            p95 = max(0.1, _safe_float(r.get('p95FrameMs'), 999.0))
            visual = max(0.0, _safe_float(r.get('visualDelta'), 1.0))
            load = max(0.0, _safe_float(r.get('loadMs'), 9999.0))
            return fps * 1.0 - p95 * 0.7 - visual * 500.0 - load * 0.002
        best = max(rows, key=score)
        recommendations.append({'deviceClass': device, 'format': best.get('format'), 'score': round(score(best), 6), 'verified': True})
    return {'schemaVersion': 1, 'recommendations': recommendations, 'verifiedDeviceClasses': len(recommendations)}


def build_v6_system_plan(rows: list[dict], runtime_plan: dict, camera_feedback: dict, prefetch_plan: dict,
                         material_instance_plan: dict, params: dict | None = None, gpu_capabilities: dict | None = None,
                         material_library_root: Path | None = None) -> dict:
    params = params or {}
    semantic = build_semantic_saliency_plan(runtime_plan, params.get('semanticMetadata'), camera_feedback)
    exploration = build_exploration_mission(params.get('materialPositions'), params.get('worldBounds'), int(params.get('maxExplorationWaypoints', 24)))
    network = build_network_delivery_plan(runtime_plan, semantic, prefetch_plan, params.get('networkTelemetry'))
    vt_backend = build_virtual_texture_backend_plan(runtime_plan, gpu_capabilities)
    shader = build_shader_material_cooptimization(rows, material_instance_plan)
    library = build_cross_project_material_library_report(rows, material_library_root or Path('.texture-material-library'))
    drift = detect_policy_drift(params.get('baselineRuntimeMetrics'), params.get('currentRuntimeMetrics'), params.get('driftThresholds'))
    farm = build_benchmark_farm_plan(params.get('deviceClasses'), int(params.get('benchmarkRepetitions', 3)))
    return {
        'schemaVersion': 1,
        'semanticSaliency': semantic,
        'explorationMission': exploration,
        'networkDelivery': network,
        'virtualTextureBackend': vt_backend,
        'shaderMaterialCooptimization': shader,
        'crossProjectMaterialLibrary': library,
        'policyDrift': drift,
        'benchmarkFarm': farm,
        'runtimeVerified': False,
        'rule': 'V6 closes more automation loops, but engine/device promotion still requires measured gates and rollback remains mandatory.',
    }
