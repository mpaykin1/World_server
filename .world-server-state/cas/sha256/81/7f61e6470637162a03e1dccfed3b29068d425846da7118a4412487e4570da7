from __future__ import annotations

import hashlib
import hmac
import json
import sqlite3
import time
import uuid
from contextlib import closing
from pathlib import Path
from typing import Iterable


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


def _f(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _i(value, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def _saliency(saliency_plan: dict | None) -> dict[str, float]:
    return {
        str(x.get('setKey')): _clamp(_f(x.get('saliencyScore'), .55))
        for x in (saliency_plan or {}).get('entries', []) if x.get('setKey')
    }


# 1. Content-aware SR router -------------------------------------------------
def build_content_aware_sr_plan(rows: list[dict], saliency_plan: dict | None = None,
                                tool_status: dict | None = None, metadata: dict | None = None) -> dict:
    sal = _saliency(saliency_plan)
    tool_status = tool_status or {}
    metadata = metadata or {}
    entries = []
    for row in rows:
        key = str(row.get('setKey') or row.get('source') or '')
        role = str(row.get('role') or 'generic').lower()
        tags = {str(t).lower() for t in (metadata.get(key, {}).get('tags') or [])}
        score = sal.get(key, .55)
        width = _i((row.get('input') or {}).get('width'), 0)
        height = _i((row.get('input') or {}).get('height'), 0)
        if role in {'normal', 'roughness', 'metallic', 'ao'}:
            route, ai, reason = 'CHANNEL_SAFE_RESAMPLE', False, 'data-map'
        elif tags & {'text', 'sign', 'ui', 'glyph', 'lineart'}:
            route, ai, reason = 'EDGE_PRESERVING_TEXT_SR', bool(tool_status.get('realEsrgan')), 'semantic-text'
        elif tags & {'face', 'skin', 'hero', 'character'} or score >= .88:
            route = 'REAL_ESRGAN_CONSERVATIVE' if tool_status.get('realEsrgan') else 'LANCZOS_CONSERVATIVE'
            ai, reason = bool(tool_status.get('realEsrgan')), 'critical-detail'
        elif min(width or 99999, height or 99999) < 1024 and score >= .55:
            route = 'REAL_ESRGAN_GENERAL' if tool_status.get('realEsrgan') else 'LANCZOS_GENERAL'
            ai, reason = bool(tool_status.get('realEsrgan')), 'low-resolution-visible'
        else:
            route, ai, reason = 'KEEP_OR_LINEAR_LIGHT_RESAMPLE', False, 'already-sufficient'
        entries.append({
            'setKey': key, 'role': role, 'route': route, 'aiRequested': ai, 'reason': reason,
            'saliencyScore': round(score, 6), 'mustPassRegressionGate': True,
            'neverUseColorAiForDataMaps': True,
        })
    return {
        'schemaVersion': 1, 'entryCount': len(entries), 'entries': entries, 'runtimeVerified': False,
        'rule': 'SR routing never bypasses the existing multi-metric regression fallback; data maps never use color hallucination models.',
    }


# 2. UV health / repair ------------------------------------------------------
def analyze_uv_health(samples: Iterable[dict] | None, max_overlap_ratio: float = .01,
                      max_stretch_ratio: float = 2.5) -> dict:
    rows = []
    for sample in samples or []:
        key = str(sample.get('setKey') or sample.get('material') or '')
        if not key:
            continue
        overlap = _clamp(_f(sample.get('overlapRatio'), 0))
        stretch = max(0, _f(sample.get('maxStretchRatio', sample.get('stretchRatio', 1)), 1))
        folds = max(0, _i(sample.get('foldedFaces', sample.get('foldCount', 0)), 0))
        oob = max(0, _i(sample.get('outOfBoundsIslands', 0), 0))
        problems = []
        if overlap > max_overlap_ratio:
            problems.append('OVERLAP')
        if stretch > max_stretch_ratio:
            problems.append('STRETCH')
        if folds:
            problems.append('FOLD')
        if oob:
            problems.append('OUT_OF_BOUNDS')
        action = 'KEEP'
        if problems:
            action = 'CANDIDATE_REPACK' if 'FOLD' not in problems else 'CANDIDATE_UNWRAP_REPACK'
        rows.append({
            'setKey': key, 'overlapRatio': round(overlap, 6), 'maxStretchRatio': round(stretch, 6),
            'foldedFaces': folds, 'outOfBoundsIslands': oob, 'problems': problems,
            'action': action, 'autoApplied': False,
        })
    bad = [x for x in rows if x['problems']]
    return {
        'schemaVersion': 1, 'sampleCount': len(rows), 'problemSetCount': len(bad),
        'problemSets': [x['setKey'] for x in bad], 'entries': rows,
        'requiresRenderBackGate': bool(bad), 'runtimeVerified': False,
        'rule': 'UV repair is generated as a candidate mesh only; original mesh and UVs are never overwritten.',
    }


# 3. Specular/normal anti-aliasing ------------------------------------------
def build_specular_normal_aa_plan(rows: list[dict], runtime_plan: dict | None = None,
                                  saliency_plan: dict | None = None) -> dict:
    sal = _saliency(saliency_plan)
    sets: dict[str, set[str]] = {}
    for row in rows:
        key = str(row.get('setKey') or '')
        if key:
            sets.setdefault(key, set()).add(str(row.get('role') or ''))
    entries = []
    for key, roles in sorted(sets.items()):
        has_normal = 'normal' in roles
        has_rough = 'roughness' in roles
        score = sal.get(key, .55)
        entries.append({
            'setKey': key, 'enabled': has_normal,
            'method': 'TOKSVIG_OR_NORMAL_VARIANCE_ROUGHNESS' if has_normal else 'NONE',
            'normalMipRenormalize': has_normal,
            'roughnessVarianceCompensation': has_normal and has_rough,
            'minimumRoughnessAtDistantMips': round(.05 + .10 * (1 - score), 4),
            'requiresShaderOrImportAdapter': has_normal,
        })
    return {
        'schemaVersion': 1, 'entryCount': len(entries),
        'enabledCount': sum(1 for x in entries if x['enabled']), 'entries': entries,
        'runtimeVerified': False,
        'rule': 'Anti-aliasing changes must pass render-back and shimmering-motion tests; source normal maps remain unchanged.',
    }


# 4. Per-tile adaptive compression -----------------------------------------
def build_per_tile_compression_plan(runtime_plan: dict | None, saliency_plan: dict | None,
                                    network_plan: dict | None = None) -> dict:
    sal = _saliency(saliency_plan)
    entries = []
    for profile, plan in (runtime_plan or {}).get('profiles', {}).items():
        for tex in plan.get('textures') or []:
            key = str(tex.get('setKey') or '')
            score = sal.get(key, .55)
            role = str(tex.get('role') or 'albedo')
            if role == 'normal':
                fmt, quality = 'BC5_OR_ASTC_RG', 'high'
            elif role in {'roughness', 'metallic', 'ao'}:
                fmt, quality = 'BC4_OR_ASTC_R', ('medium' if score < .72 else 'high')
            else:
                fmt = 'BC7_OR_ASTC_RGBA'
                quality = 'ultra' if score >= .88 else ('high' if score >= .6 else 'balanced')
            page = (tex.get('virtualTexturePagePlan') or {}).get('pageSize', 128)
            entries.append({
                'profile': profile, 'setKey': key, 'role': role, 'pageSize': page,
                'formatFamily': fmt, 'quality': quality, 'saliencyScore': round(score, 6),
                'contentAddressed': True, 'independentTileDecodeRequired': True,
            })
    return {
        'schemaVersion': 1, 'entryCount': len(entries), 'entries': entries,
        'encodedBytesVerified': False,
        'rule': 'Tile compression is a target plan until the encoder output and target-engine decode/import are verified.',
    }


# 5. Incremental atlas defragmentation -------------------------------------
def build_incremental_atlas_defrag_plan(atlas_manifest: dict | None, usage: dict | None = None,
                                        fragmentation_threshold: float = .22) -> dict:
    atlas_manifest = atlas_manifest or {}
    usage = usage or {}
    raw_pages = atlas_manifest.get('pages') or atlas_manifest.get('atlases') or []
    all_entries = atlas_manifest.get('entries') or []
    page_info = atlas_manifest.get('pageInfo') or {}
    pages = []
    for idx, raw in enumerate(raw_pages):
        if isinstance(raw, dict):
            page = dict(raw)
            page.setdefault('id', page.get('name', idx))
            pages.append(page)
            continue
        page_id = str(idx)
        info = page_info.get(page_id) or {}
        entries = [e for e in all_entries if str(e.get('page')) == page_id]
        width = max(1, _i(info.get('width'), 1)); height = max(1, _i(info.get('height'), 1))
        occupied = 0
        for e in entries:
            occupied += max(0, _i(e.get('width'), 0)) * max(0, _i(e.get('height'), 0))
        occupancy = _clamp(occupied / max(1, width * height)) if entries else 1.0
        pages.append({'id': page_id, 'name': str(raw), 'occupancy': occupancy, 'slots': entries})

    moves = []
    page_reports = []
    for idx, page in enumerate(pages):
        occupancy = _clamp(_f(page.get('occupancy', page.get('occupancyRatio', 1.0)), 1.0))
        fragmentation = 1.0 - occupancy
        page_id = str(page.get('id') or page.get('name') or idx)
        needs = fragmentation >= fragmentation_threshold
        slots = page.get('slots') or page.get('entries') or []
        if needs:
            movable = sorted(slots, key=lambda slot: _f(usage.get(str(slot.get('setKey')), {}).get('score', .5)))
            for slot in movable[:max(0, len(movable) // 3)]:
                moves.append({
                    'pageId': page_id, 'setKey': slot.get('setKey'),
                    'action': 'MOVE_IN_CANDIDATE_ATLAS', 'preserveStableMaterialId': True,
                })
        page_reports.append({
            'pageId': page_id, 'occupancy': round(occupancy, 6),
            'fragmentation': round(fragmentation, 6), 'needsDefrag': needs,
        })
    return {
        'schemaVersion': 1, 'pageCount': len(page_reports), 'moveCount': len(moves),
        'pages': page_reports, 'moves': moves, 'autoApplied': False,
        'rule': 'Defrag is incremental and stable-ID preserving; bind only after UV/material rebind and render-back equivalence pass.',
    }


# 6. Signed content-addressed CDN manifest ---------------------------------
def build_signed_cdn_manifest(files: Iterable[dict] | None, regions: Iterable[str] | None = None,
                              secret: str | bytes | None = None) -> dict:
    entries = []
    for file in files or []:
        sha = str(file.get('sha256') or '').lower()
        name = str(file.get('name') or '')
        if not sha or len(sha) != 64:
            continue
        entries.append({
            'name': name, 'sha256': sha, 'bytes': _i(file.get('bytes'), 0),
            'objectKey': f'sha256/{sha[:2]}/{sha}',
        })
    entries.sort(key=lambda x: (x['sha256'], x['name']))
    payload = {
        'schemaVersion': 1,
        'regions': sorted({str(r) for r in (regions or ['global']) if str(r)}),
        'objects': entries,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    digest = hashlib.sha256(canonical).hexdigest()
    if isinstance(secret, str):
        secret = secret.encode()
    signature = hmac.new(secret, canonical, hashlib.sha256).hexdigest() if secret else None
    return {
        **payload, 'manifestSha256': digest,
        'signature': {'algorithm': 'HMAC-SHA256', 'value': signature, 'verifiedLocally': bool(signature)},
        'promotionBlocked': not bool(signature),
        'rule': 'Unsigned manifests may be generated for inspection but cannot be promoted to production CDN.',
    }


def verify_signed_cdn_manifest(manifest: dict, secret: str | bytes) -> bool:
    if isinstance(secret, str):
        secret = secret.encode()
    payload = {k: manifest[k] for k in ('schemaVersion', 'regions', 'objects')}
    canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    expected = hmac.new(secret, canonical, hashlib.sha256).hexdigest()
    got = ((manifest.get('signature') or {}).get('value') or '')
    return bool(got) and hmac.compare_digest(expected, got)


# 7. Durable distributed work queue ----------------------------------------
class DistributedTextureQueue:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _connect(self):
        conn = sqlite3.connect(self.db_path, timeout=15)
        conn.row_factory = sqlite3.Row
        return conn

    def _init(self):
        with closing(self._connect()) as conn:
            conn.execute(
                'CREATE TABLE IF NOT EXISTS jobs('
                'id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, '
                'priority INTEGER NOT NULL, lease_owner TEXT, lease_until REAL, attempts INTEGER NOT NULL DEFAULT 0, '
                'result TEXT, created_at REAL NOT NULL, updated_at REAL NOT NULL)'
            )
            conn.execute('CREATE INDEX IF NOT EXISTS idx_jobs_claim ON jobs(status,priority,created_at)')
            conn.commit()

    def enqueue(self, kind: str, payload: dict, priority: int = 50, job_id: str | None = None) -> str:
        job_id = job_id or uuid.uuid4().hex
        now = time.time()
        with closing(self._connect()) as conn:
            conn.execute(
                'INSERT OR IGNORE INTO jobs(id,kind,payload,status,priority,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
                (job_id, kind, json.dumps(payload, sort_keys=True), 'queued', int(priority), now, now),
            )
            conn.commit()
        return job_id

    def lease(self, worker_id: str, lease_seconds: int = 120,
              kinds: Iterable[str] | None = None) -> dict | None:
        now = time.time()
        lease_until = now + max(10, int(lease_seconds))
        kinds = list(kinds or [])
        with closing(self._connect()) as conn:
            conn.execute('BEGIN IMMEDIATE')
            conn.execute(
                "UPDATE jobs SET status='queued',lease_owner=NULL,lease_until=NULL "
                "WHERE status='leased' AND lease_until<?", (now,)
            )
            sql = "SELECT * FROM jobs WHERE status='queued'"
            args: list = []
            if kinds:
                sql += ' AND kind IN (%s)' % ','.join('?' * len(kinds))
                args += kinds
            sql += ' ORDER BY priority DESC,created_at ASC LIMIT 1'
            row = conn.execute(sql, args).fetchone()
            if not row:
                return None
            cur = conn.execute(
                "UPDATE jobs SET status='leased',lease_owner=?,lease_until=?,attempts=attempts+1,updated_at=? "
                "WHERE id=? AND status='queued'", (worker_id, lease_until, now, row['id'])
            )
            if cur.rowcount != 1:
                conn.rollback()
                return None
            conn.commit()
            out = dict(row)
            out.update(
                status='leased', lease_owner=worker_id, lease_until=lease_until,
                attempts=_i(row['attempts']) + 1, payload=json.loads(row['payload']),
            )
            return out

    def complete(self, job_id: str, worker_id: str, result: dict) -> bool:
        with closing(self._connect()) as conn:
            cur = conn.execute(
                "UPDATE jobs SET status='completed',result=?,lease_owner=NULL,lease_until=NULL,updated_at=? "
                "WHERE id=? AND status='leased' AND lease_owner=?",
                (json.dumps(result, sort_keys=True), time.time(), job_id, worker_id),
            )
            conn.commit()
            return cur.rowcount == 1

    def fail(self, job_id: str, worker_id: str, error: str, retry: bool = True) -> bool:
        status = 'queued' if retry else 'failed'
        with closing(self._connect()) as conn:
            cur = conn.execute(
                "UPDATE jobs SET status=?,result=?,lease_owner=NULL,lease_until=NULL,updated_at=? "
                "WHERE id=? AND status='leased' AND lease_owner=?",
                (status, json.dumps({'error': error}), time.time(), job_id, worker_id),
            )
            conn.commit()
            return cur.rowcount == 1

    def stats(self) -> dict:
        with closing(self._connect()) as conn:
            rows = conn.execute('SELECT status,COUNT(*) n FROM jobs GROUP BY status').fetchall()
        return {row['status']: row['n'] for row in rows}


def build_distributed_queue_plan(params: dict | None = None) -> dict:
    params = params or {}
    workers = max(1, min(_i(params.get('transcodeWorkers', 2), 2), 64))
    benchmark = max(1, min(_i(params.get('benchmarkWorkers', 1), 1), 64))
    return {
        'schemaVersion': 1, 'queueBackend': 'SQLITE_LEASE_REFERENCE',
        'transcodeWorkers': workers, 'benchmarkWorkers': benchmark,
        'leaseSeconds': max(30, min(_i(params.get('queueLeaseSeconds', 180), 180), 3600)),
        'supportsRetry': True, 'supportsLeaseExpiryRecovery': True,
        'multiHostRequiresSharedDatabaseOrExternalQueue': True, 'runtimeVerified': False,
    }


# 8. Unified quality governor ----------------------------------------------
def build_unified_quality_governor(runtime_metrics: dict | None, frame_budget: dict | None,
                                   saliency_plan: dict | None, params: dict | None = None) -> dict:
    runtime_metrics = runtime_metrics or {}
    frame_budget = frame_budget or {}
    target = _f(frame_budget.get('frameBudgetMs'), 16.667)
    p95 = _f(runtime_metrics.get('p95FrameMs'), 0)
    gpu = _f(runtime_metrics.get('gpuFrameMs'), 0)
    mem = _clamp(_f(runtime_metrics.get('vramUsageRatio'), 0))
    pressure = _clamp(max(p95 / max(target, 1e-6) - .85, gpu / max(target, 1e-6) - .85, mem - .7) / .6)
    critical = [
        x.get('setKey') for x in (saliency_plan or {}).get('entries', []) if x.get('priority') == 'critical'
    ]
    levels = {'textures': 0, 'meshes': 0, 'lighting': 0, 'shadows': 0, 'particles': 0, 'animation': 0}
    if pressure >= .25:
        levels.update(particles=1, shadows=1)
    if pressure >= .45:
        levels.update(textures=1, meshes=1, lighting=1)
    if pressure >= .65:
        levels.update(particles=2, shadows=2, animation=1, textures=2)
    if pressure >= .85:
        levels.update(meshes=2, lighting=2, animation=2, textures=3, particles=3, shadows=3)
    actions = {
        'textures': ['keep', 'reduce-prefetch', 'coarsen-background-mips', 'disable-noncritical-detail'][levels['textures']],
        'meshes': ['keep', 'raise-background-lod', 'raise-background-lod', 'aggressive-background-lod'][levels['meshes']],
        'lighting': ['keep', 'reduce-noncritical-lights', 'reduce-noncritical-lights', 'simplify-noncritical-lighting'][levels['lighting']],
        'shadows': ['keep', 'reduce-shadow-distance', 'reduce-shadow-resolution', 'disable-noncritical-shadows'][levels['shadows']],
        'particles': ['keep', 'reduce-particle-rate', 'reduce-particle-rate-and-distance', 'disable-background-particles'][levels['particles']],
        'animation': ['keep', 'lower-background-animation-rate', 'lower-background-animation-rate', 'freeze-invisible-animation'][levels['animation']],
    }
    return {
        'schemaVersion': 1, 'pressure': round(pressure, 6), 'actions': actions,
        'protectedCriticalSets': critical, 'requiresSubsystemAdapters': True, 'runtimeVerified': False,
        'rule': 'The governor coordinates degradations but adapters must preserve semantic critical sets and pass canary/runtime gates.',
    }


# 9. Long soak analysis -----------------------------------------------------
def analyze_memory_residency_soak(samples: Iterable[dict] | None,
                                  min_duration_seconds: float = 600.0) -> dict:
    samples = [dict(x) for x in (samples or [])]
    samples.sort(key=lambda x: _f(x.get('timestamp'), 0))
    if len(samples) < 2:
        return {
            'schemaVersion': 1, 'sampleCount': len(samples), 'durationSeconds': 0,
            'gate': 'INSUFFICIENT_DATA', 'runtimeVerified': False,
        }
    duration = max(0, _f(samples[-1].get('timestamp')) - _f(samples[0].get('timestamp')))
    mem0 = _f(samples[0].get('textureVramMB', samples[0].get('memoryMB', 0)))
    mem1 = _f(samples[-1].get('textureVramMB', samples[-1].get('memoryMB', 0)))
    slope = (mem1 - mem0) / max(duration / 60, 1e-6)
    p95s = [_f(x.get('p95FrameMs'), 0) for x in samples if _f(x.get('p95FrameMs'), 0) > 0]
    drift = (p95s[-1] - p95s[0]) if len(p95s) >= 2 else 0
    thrash = sum(_i(x.get('residencyReloads'), 0) for x in samples)
    complete = duration >= min_duration_seconds
    fail = complete and (slope > 2.0 or drift > 3.0 or thrash > max(20, len(samples) * 2))
    gate = 'FAIL' if fail else ('PASS' if complete else 'INSUFFICIENT_DURATION')
    return {
        'schemaVersion': 1, 'sampleCount': len(samples), 'durationSeconds': round(duration, 3),
        'memorySlopeMBPerMinute': round(slope, 6), 'p95DriftMs': round(drift, 6),
        'residencyReloads': thrash, 'gate': gate, 'runtimeVerified': complete,
        'rule': 'Promotion requires a target-runtime soak of configured duration; synthetic/unit samples cannot verify production stability.',
    }


# 10. Regression root-cause classifier ------------------------------------
def classify_regression_root_cause(baseline: dict | None, candidate: dict | None,
                                   signals: dict | None = None) -> dict:
    baseline = baseline or {}
    candidate = candidate or {}
    signals = signals or {}
    scores = {key: 0.0 for key in [
        'TEXTURE_RESIDENCY', 'NETWORK_STREAMING', 'GPU_MEMORY', 'THERMAL',
        'SHADER_MATERIAL', 'UV_BINDING', 'CPU_ANIMATION', 'UNKNOWN',
    ]}
    if _f(candidate.get('textureVramMB')) > _f(baseline.get('textureVramMB')) * 1.15 or signals.get('oom'):
        scores['GPU_MEMORY'] += .8
    if _f(candidate.get('residencyReloads')) > max(3, _f(baseline.get('residencyReloads')) * 1.5):
        scores['TEXTURE_RESIDENCY'] += .75
    if _f(candidate.get('networkRttMs')) > _f(baseline.get('networkRttMs')) + 40 or _f(candidate.get('packetLoss')) > .03:
        scores['NETWORK_STREAMING'] += .7
    if str(signals.get('thermalState', '')).lower() in {'serious', 'critical'}:
        scores['THERMAL'] += .85
    if _f(candidate.get('gpuFrameMs')) > _f(baseline.get('gpuFrameMs')) + 3 and scores['GPU_MEMORY'] == 0:
        scores['SHADER_MATERIAL'] += .55
    if _f(candidate.get('visualDelta')) > .04 or signals.get('uvMismatch') or signals.get('materialBindingMismatch'):
        scores['UV_BINDING'] += .75
    if _f(candidate.get('cpuFrameMs')) > _f(baseline.get('cpuFrameMs')) + 4 and _f(candidate.get('animationMs')) > _f(baseline.get('animationMs')) + 2:
        scores['CPU_ANIMATION'] += .7
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    if ranked[0][1] <= 0:
        ranked = [('UNKNOWN', .2)] + [x for x in ranked if x[0] != 'UNKNOWN']
    top = ranked[0]
    return {
        'schemaVersion': 1, 'classification': top[0], 'confidence': round(_clamp(top[1]), 4),
        'ranked': [{'cause': key, 'score': round(value, 4)} for key, value in ranked if value > 0],
        'automaticRollbackRecommended': top[0] in {'GPU_MEMORY', 'THERMAL', 'UV_BINDING'} and top[1] >= .7,
        'runtimeVerified': bool(baseline and candidate),
        'rule': 'Classifier is heuristic evidence routing, not proof. Preserve raw metrics and validate the suspected subsystem before permanent fixes.',
    }


def build_v8_system_plan(rows: list[dict], runtime_plan: dict, saliency_plan: dict, network_plan: dict,
                         atlas_manifest: dict | None = None, files: list[dict] | None = None,
                         frame_budget: dict | None = None, params: dict | None = None,
                         tool_status: dict | None = None) -> dict:
    params = params or {}
    tool_status = tool_status or {}
    return {
        'schemaVersion': 1,
        'contentAwareSuperResolution': build_content_aware_sr_plan(rows, saliency_plan, tool_status, params.get('semanticMetadata')),
        'uvHealthRepair': analyze_uv_health(params.get('uvHealthSamples'), params.get('maxUvOverlapRatio', .01), params.get('maxUvStretchRatio', 2.5)),
        'specularNormalAntialiasing': build_specular_normal_aa_plan(rows, runtime_plan, saliency_plan),
        'perTileAdaptiveCompression': build_per_tile_compression_plan(runtime_plan, saliency_plan, network_plan),
        'incrementalAtlasDefrag': build_incremental_atlas_defrag_plan(atlas_manifest, params.get('atlasUsage'), params.get('atlasDefragFragmentationThreshold', .22)),
        'signedContentAddressedCdn': build_signed_cdn_manifest(files, params.get('cdnRegions'), params.get('cdnSigningSecret')),
        'distributedWorkQueue': build_distributed_queue_plan(params),
        'unifiedQualityGovernor': build_unified_quality_governor(params.get('currentRuntimeMetrics'), frame_budget, saliency_plan, params),
        'memoryResidencySoak': analyze_memory_residency_soak(params.get('soakSamples'), params.get('soakMinDurationSeconds', 600)),
        'regressionRootCause': classify_regression_root_cause(params.get('baselineRuntimeMetrics'), params.get('canaryRuntimeMetrics'), params.get('regressionSignals')),
        'runtimeVerified': False,
        'rule': 'V8 adds executable safety/efficiency orchestration. Production promotion remains gated by target-runtime evidence, signed CDN manifests and canary/soak checks.',
    }
