from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
import statistics
import time
import urllib.error
import urllib.request
import uuid
from contextlib import closing
from pathlib import Path
from typing import Iterable


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


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


def _canonical(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def _percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    vals = sorted(float(x) for x in values)
    if len(vals) == 1:
        return vals[0]
    pos = _clamp(q) * (len(vals) - 1)
    lo, hi = int(pos), min(int(pos) + 1, len(vals) - 1)
    frac = pos - lo
    return vals[lo] * (1 - frac) + vals[hi] * frac


# 1. Temporal video / shimmer quality gate ---------------------------------
def analyze_temporal_shimmer(samples: Iterable[dict] | None, *, min_frames: int = 24,
                             max_shimmer_score: float = .035,
                             max_normal_variance_delta: float = .055,
                             max_luma_flicker: float = .035) -> dict:
    rows = [dict(x) for x in (samples or [])]
    rows.sort(key=lambda x: (_f(x.get('timestamp'), 0), _i(x.get('frame'), 0)))
    if len(rows) < max(2, min_frames):
        return {
            'schemaVersion': 1, 'frameCount': len(rows), 'gate': 'INSUFFICIENT_FRAMES',
            'runtimeVerified': False, 'promotionBlocked': True,
        }
    shimmer = [_f(x.get('shimmerScore'), 0) for x in rows]
    normal = [_f(x.get('normalVarianceDelta'), 0) for x in rows]
    luma = [_f(x.get('lumaFlicker'), 0) for x in rows]
    p95_shimmer = _percentile(shimmer, .95)
    p95_normal = _percentile(normal, .95)
    p95_luma = _percentile(luma, .95)
    fail_reasons = []
    if p95_shimmer > max_shimmer_score:
        fail_reasons.append('SHIMMER')
    if p95_normal > max_normal_variance_delta:
        fail_reasons.append('NORMAL_VARIANCE')
    if p95_luma > max_luma_flicker:
        fail_reasons.append('LUMA_FLICKER')
    gate = 'FAIL' if fail_reasons else 'PASS'
    return {
        'schemaVersion': 1, 'frameCount': len(rows), 'gate': gate,
        'p95ShimmerScore': round(p95_shimmer, 6),
        'p95NormalVarianceDelta': round(p95_normal, 6),
        'p95LumaFlicker': round(p95_luma, 6),
        'failReasons': fail_reasons, 'runtimeVerified': True,
        'promotionBlocked': gate != 'PASS',
        'rule': 'Temporal promotion requires target-runtime motion samples; still images cannot verify shimmer/flicker stability.',
    }


# 2. Multi-host durable queue ------------------------------------------------
class MultiHostTextureQueue:
    """Lease/fencing queue usable by multiple processes/hosts on a shared SQLite DB.

    For true cross-datacenter deployments use a shared database or the HTTP adapter below.
    The monotonic fencing token prevents stale workers from completing a re-leased job.
    """
    def __init__(self, db_path: str | Path, max_attempts: int = 5):
        self.db_path = Path(db_path)
        self.max_attempts = max(1, int(max_attempts))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _connect(self):
        conn = sqlite3.connect(self.db_path, timeout=30, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA busy_timeout=30000')
        return conn

    def _init(self):
        with closing(self._connect()) as conn:
            conn.executescript(
                'CREATE TABLE IF NOT EXISTS jobs('
                'id TEXT PRIMARY KEY, idempotency_key TEXT UNIQUE, kind TEXT NOT NULL, payload TEXT NOT NULL, '
                'status TEXT NOT NULL, priority INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, '
                'lease_owner TEXT, lease_until REAL, fence INTEGER NOT NULL DEFAULT 0, result TEXT, error TEXT, '
                'created_at REAL NOT NULL, updated_at REAL NOT NULL);'
                'CREATE INDEX IF NOT EXISTS idx_v9_jobs_claim ON jobs(status,priority,created_at);'
                'CREATE TABLE IF NOT EXISTS hosts('
                'host_id TEXT PRIMARY KEY, capabilities TEXT NOT NULL, heartbeat_at REAL NOT NULL);'
            )

    def heartbeat(self, host_id: str, capabilities: Iterable[str] | None = None) -> None:
        now = time.time()
        caps = json.dumps(sorted({str(x) for x in (capabilities or [])}))
        with closing(self._connect()) as conn:
            conn.execute(
                'INSERT INTO hosts(host_id,capabilities,heartbeat_at) VALUES(?,?,?) '
                'ON CONFLICT(host_id) DO UPDATE SET capabilities=excluded.capabilities,heartbeat_at=excluded.heartbeat_at',
                (host_id, caps, now),
            )

    def enqueue(self, kind: str, payload: dict, priority: int = 50,
                idempotency_key: str | None = None) -> str:
        now = time.time()
        job_id = uuid.uuid4().hex
        idem = idempotency_key or hashlib.sha256(_canonical({'kind': kind, 'payload': payload})).hexdigest()
        with closing(self._connect()) as conn:
            conn.execute('BEGIN IMMEDIATE')
            existing = conn.execute('SELECT id FROM jobs WHERE idempotency_key=?', (idem,)).fetchone()
            if existing:
                conn.execute('COMMIT')
                return str(existing['id'])
            conn.execute(
                'INSERT INTO jobs(id,idempotency_key,kind,payload,status,priority,created_at,updated_at) '
                'VALUES(?,?,?,?,?,?,?,?)',
                (job_id, idem, kind, json.dumps(payload, sort_keys=True), 'queued', int(priority), now, now),
            )
            conn.execute('COMMIT')
        return job_id

    def _recover_expired(self, conn, now: float) -> None:
        rows = conn.execute(
            "SELECT id,attempts FROM jobs WHERE status='leased' AND lease_until<?", (now,)
        ).fetchall()
        for row in rows:
            status = 'dead' if _i(row['attempts']) >= self.max_attempts else 'queued'
            conn.execute(
                'UPDATE jobs SET status=?,lease_owner=NULL,lease_until=NULL,error=?,updated_at=? WHERE id=?',
                (status, 'LEASE_EXPIRED', now, row['id']),
            )

    def lease(self, host_id: str, lease_seconds: int = 120,
              capabilities: Iterable[str] | None = None) -> dict | None:
        now = time.time()
        self.heartbeat(host_id, capabilities)
        caps = {str(x) for x in (capabilities or [])}
        with closing(self._connect()) as conn:
            conn.execute('BEGIN IMMEDIATE')
            self._recover_expired(conn, now)
            candidates = conn.execute(
                "SELECT * FROM jobs WHERE status='queued' ORDER BY priority DESC,created_at ASC LIMIT 64"
            ).fetchall()
            row = None
            for candidate in candidates:
                payload = json.loads(candidate['payload'])
                required = {str(x) for x in payload.get('requiredCapabilities', [])}
                if required.issubset(caps):
                    row = candidate
                    break
            if row is None:
                conn.execute('COMMIT')
                return None
            fence = _i(row['fence']) + 1
            attempts = _i(row['attempts']) + 1
            conn.execute(
                "UPDATE jobs SET status='leased',lease_owner=?,lease_until=?,fence=?,attempts=?,updated_at=? WHERE id=?",
                (host_id, now + max(10, int(lease_seconds)), fence, attempts, now, row['id']),
            )
            conn.execute('COMMIT')
            return {
                'id': row['id'], 'kind': row['kind'], 'payload': json.loads(row['payload']),
                'priority': row['priority'], 'fence': fence, 'attempts': attempts,
                'leaseOwner': host_id, 'leaseUntil': now + max(10, int(lease_seconds)),
            }

    def renew(self, job_id: str, host_id: str, fence: int, lease_seconds: int = 120) -> bool:
        with closing(self._connect()) as conn:
            cur = conn.execute(
                "UPDATE jobs SET lease_until=?,updated_at=? WHERE id=? AND status='leased' AND lease_owner=? AND fence=?",
                (time.time() + max(10, int(lease_seconds)), time.time(), job_id, host_id, int(fence)),
            )
            return cur.rowcount == 1

    def complete(self, job_id: str, host_id: str, fence: int, result: dict) -> bool:
        with closing(self._connect()) as conn:
            cur = conn.execute(
                "UPDATE jobs SET status='completed',result=?,lease_owner=NULL,lease_until=NULL,updated_at=? "
                "WHERE id=? AND status='leased' AND lease_owner=? AND fence=?",
                (json.dumps(result, sort_keys=True), time.time(), job_id, host_id, int(fence)),
            )
            return cur.rowcount == 1

    def fail(self, job_id: str, host_id: str, fence: int, error: str) -> bool:
        with closing(self._connect()) as conn:
            row = conn.execute('SELECT attempts FROM jobs WHERE id=?', (job_id,)).fetchone()
            status = 'dead' if row and _i(row['attempts']) >= self.max_attempts else 'queued'
            cur = conn.execute(
                "UPDATE jobs SET status=?,error=?,lease_owner=NULL,lease_until=NULL,updated_at=? "
                "WHERE id=? AND status='leased' AND lease_owner=? AND fence=?",
                (status, str(error), time.time(), job_id, host_id, int(fence)),
            )
            return cur.rowcount == 1

    def stats(self) -> dict:
        with closing(self._connect()) as conn:
            rows = conn.execute('SELECT status,COUNT(*) n FROM jobs GROUP BY status').fetchall()
            hosts = conn.execute('SELECT COUNT(*) n FROM hosts WHERE heartbeat_at>?', (time.time() - 120,)).fetchone()
        return {
            'jobs': {row['status']: row['n'] for row in rows},
            'activeHosts': _i(hosts['n']) if hosts else 0,
        }


class HttpLeaseQueueClient:
    def __init__(self, base_url: str, token: str = '', timeout: float = 10.0):
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.timeout = timeout

    def _request(self, path: str, payload: dict) -> dict:
        req = urllib.request.Request(
            self.base_url + path,
            data=_canonical(payload),
            headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {self.token}'} if self.token else {})},
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                return json.loads(response.read().decode('utf-8'))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise RuntimeError(f'queue endpoint failed: {exc}') from exc

    def lease(self, host_id: str, capabilities: Iterable[str] | None = None) -> dict:
        return self._request('/v1/lease', {'hostId': host_id, 'capabilities': list(capabilities or [])})


# 3. Shader compilation/cache prewarming ------------------------------------
def build_shader_cache_prewarm_plan(shader_plan: dict | None, benchmark_profiles: dict | None = None,
                                    max_variants: int = 512) -> dict:
    shader_plan = shader_plan or {}
    benchmark_profiles = benchmark_profiles or {}
    variants = shader_plan.get('variants') or shader_plan.get('permutations') or []
    entries = []
    seen = set()
    for raw in variants:
        if isinstance(raw, str):
            name, features = raw, []
        else:
            name = str(raw.get('name') or raw.get('shader') or 'shader')
            features = sorted({str(x) for x in (raw.get('features') or raw.get('defines') or [])})
        key = hashlib.sha256(_canonical({'name': name, 'features': features})).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        entries.append({'variantKey': key, 'shader': name, 'features': features, 'priority': 'normal'})
    hot = set(benchmark_profiles.get('hotVariantKeys') or [])
    for entry in entries:
        if entry['variantKey'] in hot:
            entry['priority'] = 'hot'
    entries.sort(key=lambda x: (x['priority'] != 'hot', x['shader'], x['variantKey']))
    truncated = len(entries) > max_variants
    entries = entries[:max_variants]
    return {
        'schemaVersion': 1, 'entryCount': len(entries), 'truncated': truncated,
        'entries': entries,
        'targets': {
            'web': 'compile/link during non-interactive warmup; persist browser cache when available',
            'godot': 'exercise material/shader variants in hidden warmup scene',
            'roblox': 'preload material/texture assets; no false claim of explicit shader binary cache control',
        },
        'runtimeVerified': False,
        'rule': 'Warmup must be bounded and must not delay first interaction beyond launch budget.',
    }


# 4. Bounded learned prefetch -----------------------------------------------
class LearnedPrefetchStore:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute(
                'CREATE TABLE IF NOT EXISTS transitions('
                'src TEXT NOT NULL,dst TEXT NOT NULL,count INTEGER NOT NULL,last_seen REAL NOT NULL,'
                'PRIMARY KEY(src,dst))'
            )
            conn.commit()

    def observe_route(self, route: Iterable[str]) -> int:
        keys = [str(x) for x in route if str(x)]
        now = time.time()
        updates = 0
        with closing(sqlite3.connect(self.db_path)) as conn:
            for src, dst in zip(keys, keys[1:]):
                if src == dst:
                    continue
                conn.execute(
                    'INSERT INTO transitions(src,dst,count,last_seen) VALUES(?,?,1,?) '
                    'ON CONFLICT(src,dst) DO UPDATE SET count=count+1,last_seen=excluded.last_seen',
                    (src, dst, now),
                )
                updates += 1
            conn.commit()
        return updates

    def predict(self, src: str, max_candidates: int = 4, min_probability: float = .12) -> list[dict]:
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                'SELECT dst,count FROM transitions WHERE src=? ORDER BY count DESC,dst ASC', (src,)
            ).fetchall()
        total = sum(_i(r['count']) for r in rows)
        if total <= 0:
            return []
        out = []
        for row in rows:
            prob = _i(row['count']) / total
            if prob < min_probability:
                continue
            out.append({'setKey': row['dst'], 'probability': round(prob, 6)})
            if len(out) >= max(1, max_candidates):
                break
        return out


def build_bounded_learned_prefetch_plan(current_set: str | None, store: LearnedPrefetchStore | None,
                                        network_plan: dict | None, thermal_plan: dict | None,
                                        *, max_candidates: int = 4) -> dict:
    network_plan = network_plan or {}
    thermal_plan = thermal_plan or {}
    bandwidth = _f(network_plan.get('bandwidthMbps'), network_plan.get('estimatedMbps', 20))
    thermal_action = str(thermal_plan.get('action') or 'KEEP').upper()
    cap = max(1, min(max_candidates, 6))
    if bandwidth < 4:
        cap = 1
    elif bandwidth < 10:
        cap = min(cap, 2)
    if thermal_action in {'CONSERVE', 'EMERGENCY'}:
        cap = 1
    candidates = store.predict(str(current_set), cap) if store and current_set else []
    return {
        'schemaVersion': 1, 'currentSet': current_set, 'candidateCount': len(candidates),
        'candidates': candidates, 'maxCandidates': cap,
        'maxExtraResidentMipLevels': 1, 'maxPrefetchBudgetRatio': .08,
        'candidateOnlyUntilCanaryPass': True,
        'rule': 'Learned prefetch is bounded by network/thermal/VRAM and can never force hero eviction.',
    }


# 5. Atomic CDN/R2 publisher ------------------------------------------------
class AtomicCdnPublisher:
    def __init__(self, root: str | Path, secret: str | bytes):
        self.root = Path(root)
        self.objects = self.root / 'objects'
        self.manifests = self.root / 'manifests'
        self.root.mkdir(parents=True, exist_ok=True)
        self.objects.mkdir(exist_ok=True)
        self.manifests.mkdir(exist_ok=True)
        self.secret = secret.encode() if isinstance(secret, str) else bytes(secret)
        if len(self.secret) < 16:
            raise ValueError('publisher secret must be at least 16 bytes')

    def put_bytes(self, data: bytes) -> dict:
        sha = hashlib.sha256(data).hexdigest()
        path = self.objects / sha[:2] / sha
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            tmp = path.with_suffix('.tmp-' + uuid.uuid4().hex)
            tmp.write_bytes(data)
            os.replace(tmp, path)
        return {'sha256': sha, 'bytes': len(data), 'objectKey': f'objects/{sha[:2]}/{sha}'}

    def _sign(self, payload: dict) -> str:
        return hmac.new(self.secret, _canonical(payload), hashlib.sha256).hexdigest()

    def publish_manifest(self, manifest: dict, channel: str = 'production') -> dict:
        payload = dict(manifest)
        payload.pop('signature', None)
        payload['publishedAt'] = int(time.time())
        payload['channel'] = channel
        digest = hashlib.sha256(_canonical(payload)).hexdigest()
        signed = {**payload, 'manifestSha256': digest, 'signature': {'algorithm': 'HMAC-SHA256', 'value': self._sign(payload)}}
        manifest_path = self.manifests / f'{digest}.json'
        tmp = manifest_path.with_suffix('.tmp-' + uuid.uuid4().hex)
        tmp.write_text(json.dumps(signed, ensure_ascii=False, indent=2), encoding='utf-8')
        os.replace(tmp, manifest_path)
        pointer = self.root / f'{channel}.json'
        pointer_tmp = pointer.with_suffix('.tmp-' + uuid.uuid4().hex)
        pointer_tmp.write_text(json.dumps({'manifestSha256': digest, 'path': str(manifest_path.name)}), encoding='utf-8')
        os.replace(pointer_tmp, pointer)
        return {'manifestSha256': digest, 'manifestPath': str(manifest_path), 'pointerPath': str(pointer), 'atomicSwitch': True}

    def current(self, channel: str = 'production') -> dict | None:
        pointer = self.root / f'{channel}.json'
        if not pointer.exists():
            return None
        p = json.loads(pointer.read_text(encoding='utf-8'))
        return json.loads((self.manifests / p['path']).read_text(encoding='utf-8'))

    def verify(self, manifest: dict) -> bool:
        signature = ((manifest.get('signature') or {}).get('value') or '')
        payload = {k: v for k, v in manifest.items() if k not in {'signature', 'manifestSha256'}}
        return bool(signature) and hmac.compare_digest(signature, self._sign(payload))


def build_atomic_cdn_publisher_plan(params: dict | None = None) -> dict:
    params = params or {}
    configured = bool(params.get('cdnPublishRoot') or os.environ.get('TEXTURE_CDN_PUBLISH_ROOT'))
    signed = bool(params.get('cdnSigningSecret') or os.environ.get('TEXTURE_CDN_SIGNING_SECRET'))
    return {
        'schemaVersion': 1, 'contentAddressedObjects': True, 'atomicManifestPointer': True,
        'signingConfigured': signed, 'publishRootConfigured': configured,
        'promotionBlocked': not (configured and signed),
        'r2Remote': params.get('r2Remote') or os.environ.get('TEXTURE_R2_REMOTE'),
        'rule': 'Objects are immutable; production changes only by atomic signed manifest pointer switch after canary gates.',
    }


# 6. Canonical tile / trim-sheet library ------------------------------------
class CanonicalTileLibrary:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.blobs = self.root / 'blobs'
        self.blobs.mkdir(exist_ok=True)
        self.db_path = self.root / 'canonical_tiles.sqlite3'
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute(
                'CREATE TABLE IF NOT EXISTS assets('
                'sha256 TEXT PRIMARY KEY,kind TEXT NOT NULL,semantic_key TEXT NOT NULL,metadata TEXT NOT NULL,'
                'quality REAL NOT NULL,created_at REAL NOT NULL)'
            )
            conn.execute('CREATE INDEX IF NOT EXISTS idx_assets_semantic ON assets(kind,semantic_key,quality DESC)')
            conn.commit()

    def add(self, data: bytes, *, kind: str, semantic_key: str, metadata: dict | None = None,
            quality: float = 0.0) -> str:
        sha = hashlib.sha256(data).hexdigest()
        path = self.blobs / sha[:2] / sha
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_bytes(data)
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute(
                'INSERT OR REPLACE INTO assets(sha256,kind,semantic_key,metadata,quality,created_at) VALUES(?,?,?,?,?,?)',
                (sha, kind, semantic_key, json.dumps(metadata or {}, sort_keys=True), _clamp(quality), time.time()),
            )
            conn.commit()
        return sha

    def best(self, kind: str, semantic_key: str, limit: int = 5) -> list[dict]:
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                'SELECT * FROM assets WHERE kind=? AND semantic_key=? ORDER BY quality DESC,created_at DESC LIMIT ?',
                (kind, semantic_key, max(1, int(limit))),
            ).fetchall()
        return [{**dict(row), 'metadata': json.loads(row['metadata'])} for row in rows]


def build_canonical_tile_library_plan(rows: list[dict], trim_plan: dict | None = None) -> dict:
    semantics = {}
    for row in rows:
        key = str(row.get('setKey') or '')
        if key:
            family = key.split('_')[0].split('-')[0].lower() or 'generic'
            semantics.setdefault(family, 0)
            semantics[family] += 1
    candidates = [
        {'semanticKey': k, 'sourceSetCount': v, 'eligibleForCanonicalTile': v >= 2}
        for k, v in sorted(semantics.items())
    ]
    return {
        'schemaVersion': 1, 'candidateCount': len(candidates), 'candidates': candidates,
        'trimCandidateCount': _i((trim_plan or {}).get('candidateCount'), 0),
        'promotionRequiresExactContentOrRenderBackEquivalence': True,
        'rule': 'Canonical assets are content-addressed and cross-project reuse is allowed only after quality/semantic verification.',
    }


# 7. Real-device lab orchestration ------------------------------------------
class DeviceLabStore:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute(
                'CREATE TABLE IF NOT EXISTS results('
                'run_id TEXT NOT NULL,device_id TEXT NOT NULL,profile TEXT NOT NULL,metrics TEXT NOT NULL,created_at REAL NOT NULL,'
                'PRIMARY KEY(run_id,device_id,profile))'
            )
            conn.commit()

    def ingest(self, run_id: str, device_id: str, profile: str, metrics: dict) -> None:
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute(
                'INSERT OR REPLACE INTO results(run_id,device_id,profile,metrics,created_at) VALUES(?,?,?,?,?)',
                (run_id, device_id, profile, json.dumps(metrics, sort_keys=True), time.time()),
            )
            conn.commit()

    def summarize(self, run_id: str) -> dict:
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute('SELECT * FROM results WHERE run_id=?', (run_id,)).fetchall()
        metrics = [json.loads(r['metrics']) for r in rows]
        p95 = [_f(x.get('p95FrameMs'), 0) for x in metrics if _f(x.get('p95FrameMs'), 0) > 0]
        memory = [_f(x.get('textureVramMB'), 0) for x in metrics if _f(x.get('textureVramMB'), 0) > 0]
        failures = sum(1 for x in metrics if str(x.get('gate', 'PASS')).upper() != 'PASS')
        return {
            'runId': run_id, 'deviceResultCount': len(rows), 'failureCount': failures,
            'p95FrameMsP90': round(_percentile(p95, .9), 4) if p95 else 0,
            'textureVramMBP90': round(_percentile(memory, .9), 4) if memory else 0,
            'gate': 'PASS' if rows and failures == 0 else ('FAIL' if rows else 'INSUFFICIENT_DATA'),
        }


def build_device_lab_plan(params: dict | None = None) -> dict:
    params = params or {}
    devices = params.get('deviceLabDevices') or [
        {'class': 'ios-low', 'required': True}, {'class': 'ios-high', 'required': True},
        {'class': 'android-low', 'required': True}, {'class': 'android-high', 'required': True},
        {'class': 'desktop-integrated', 'required': True}, {'class': 'desktop-discrete', 'required': True},
    ]
    profiles = params.get('deviceLabProfiles') or ['mobile', 'balanced', 'ultra']
    jobs = [{'deviceClass': d['class'], 'profile': p, 'required': bool(d.get('required', True))} for d in devices for p in profiles]
    return {
        'schemaVersion': 1, 'jobCount': len(jobs), 'jobs': jobs,
        'requiresPhysicalOrTrustedRemoteHardware': True, 'runtimeVerified': False,
        'rule': 'Synthetic probes are useful but cannot satisfy the required-device promotion gate.',
    }


# 8. Unified-governor executable adapter manifest ---------------------------
def build_unified_governor_adapter_manifest(governor: dict | None) -> dict:
    actions = (governor or {}).get('actions') or {}
    return {
        'schemaVersion': 1, 'actions': actions,
        'adapters': {
            'web': {
                'path': 'tools/texture_runtime_adapters/web/unified_quality_governor_v9.js',
                'supports': ['textures', 'meshes', 'lighting', 'shadows', 'particles', 'animation'],
            },
            'godot': {
                'path': 'tools/texture_runtime_adapters/godot/UnifiedQualityGovernorV9.gd',
                'supports': ['textures', 'meshes', 'lighting', 'shadows', 'particles', 'animation'],
            },
            'roblox': {
                'path': 'tools/texture_runtime_adapters/roblox/UnifiedQualityGovernorV9.luau',
                'supports': ['textures', 'meshes', 'lighting', 'shadows', 'particles', 'animation'],
                'notes': 'Only public runtime properties/APIs are used; unsupported low-level GPU controls are not claimed.',
            },
        },
        'requiresRuntimeTelemetry': True, 'runtimeVerified': False,
    }


# 9. Long-term cohort drift --------------------------------------------------
def analyze_cohort_drift(baseline_samples: Iterable[dict] | None,
                         cohort_samples: Iterable[dict] | None,
                         *, min_samples: int = 20) -> dict:
    base = [dict(x) for x in (baseline_samples or [])]
    cohort = [dict(x) for x in (cohort_samples or [])]
    if len(base) < min_samples or len(cohort) < min_samples:
        return {
            'schemaVersion': 1, 'baselineCount': len(base), 'cohortCount': len(cohort),
            'gate': 'INSUFFICIENT_DATA', 'driftDetected': False, 'promotionBlocked': True,
        }
    dims = {
        'p95FrameMs': (1.12, 'higher'),
        'textureVramMB': (1.15, 'higher'),
        'visualDelta': (1.20, 'higher'),
        'cacheHitRate': (.88, 'lower'),
        'residencyReloads': (1.30, 'higher'),
    }
    drift = []
    for key, (ratio, direction) in dims.items():
        bvals = [_f(x.get(key), 0) for x in base if key in x]
        cvals = [_f(x.get(key), 0) for x in cohort if key in x]
        if not bvals or not cvals:
            continue
        bp = _percentile(bvals, .9)
        cp = _percentile(cvals, .9)
        bad = cp > bp * ratio if direction == 'higher' else cp < bp * ratio
        drift.append({'metric': key, 'baselineP90': round(bp, 6), 'cohortP90': round(cp, 6), 'drift': bad})
    bad_metrics = [x['metric'] for x in drift if x['drift']]
    return {
        'schemaVersion': 1, 'baselineCount': len(base), 'cohortCount': len(cohort),
        'metrics': drift, 'driftDetected': bool(bad_metrics), 'badMetrics': bad_metrics,
        'gate': 'FAIL' if bad_metrics else 'PASS', 'promotionBlocked': bool(bad_metrics),
        'runtimeVerified': True,
        'rule': 'Cohort drift compares distributions, not single runs; failed cohorts trigger rollback investigation.',
    }


# 10. Immutable promotion ledger --------------------------------------------
class PromotionLedger:
    def __init__(self, path: str | Path, secret: str | bytes):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.secret = secret.encode() if isinstance(secret, str) else bytes(secret)
        if len(self.secret) < 16:
            raise ValueError('ledger secret must be at least 16 bytes')

    def _last_hash(self) -> str:
        if not self.path.exists():
            return '0' * 64
        last = ''
        with self.path.open('r', encoding='utf-8') as handle:
            for line in handle:
                if line.strip():
                    last = line
        if not last:
            return '0' * 64
        return json.loads(last)['entryHash']

    def append(self, event: str, evidence: dict, *, actor: str = 'desktop-ai') -> dict:
        payload = {
            'schemaVersion': 1, 'timestamp': time.time(), 'event': event, 'actor': actor,
            'evidence': evidence, 'previousHash': self._last_hash(),
        }
        entry_hash = hashlib.sha256(_canonical(payload)).hexdigest()
        signature = hmac.new(self.secret, entry_hash.encode(), hashlib.sha256).hexdigest()
        entry = {**payload, 'entryHash': entry_hash, 'signature': signature}
        with self.path.open('a', encoding='utf-8', newline='\n') as handle:
            handle.write(json.dumps(entry, sort_keys=True, ensure_ascii=False) + '\n')
            handle.flush()
            os.fsync(handle.fileno())
        return entry

    def verify(self) -> dict:
        previous = '0' * 64
        count = 0
        if not self.path.exists():
            return {'ok': True, 'entries': 0, 'lastHash': previous}
        with self.path.open('r', encoding='utf-8') as handle:
            for line_no, line in enumerate(handle, 1):
                if not line.strip():
                    continue
                entry = json.loads(line)
                payload = {k: entry[k] for k in ('schemaVersion', 'timestamp', 'event', 'actor', 'evidence', 'previousHash')}
                if entry.get('previousHash') != previous:
                    return {'ok': False, 'entries': count, 'brokenAtLine': line_no, 'reason': 'CHAIN'}
                entry_hash = hashlib.sha256(_canonical(payload)).hexdigest()
                if not hmac.compare_digest(entry_hash, str(entry.get('entryHash') or '')):
                    return {'ok': False, 'entries': count, 'brokenAtLine': line_no, 'reason': 'HASH'}
                sig = hmac.new(self.secret, entry_hash.encode(), hashlib.sha256).hexdigest()
                if not hmac.compare_digest(sig, str(entry.get('signature') or '')):
                    return {'ok': False, 'entries': count, 'brokenAtLine': line_no, 'reason': 'SIGNATURE'}
                previous = entry_hash
                count += 1
        return {'ok': True, 'entries': count, 'lastHash': previous}


def build_promotion_ledger_plan(params: dict | None = None) -> dict:
    params = params or {}
    configured = bool(params.get('promotionLedgerSecret') or os.environ.get('TEXTURE_PROMOTION_LEDGER_SECRET'))
    return {
        'schemaVersion': 1, 'hashChain': 'SHA-256', 'signature': 'HMAC-SHA256',
        'fsyncOnAppend': True, 'secretConfigured': configured,
        'promotionBlocked': not configured,
        'requiredEvents': ['candidate-built', 'tests-pass', 'runtime-gates-pass', 'canary-stage', 'promoted', 'rolled-back'],
        'rule': 'Ledger is append-only evidence; production promotion is blocked if chain/signature verification fails.',
    }


def build_v9_system_plan(rows: list[dict], v8_plan: dict | None, v7_plan: dict | None,
                         v6_plan: dict | None, params: dict | None = None) -> dict:
    params = params or {}
    v8_plan = v8_plan or {}
    v7_plan = v7_plan or {}
    v6_plan = v6_plan or {}
    shader_plan = params.get('shaderVariants') or (v6_plan.get('shaderMaterialCooptimization') or {})
    temporal = analyze_temporal_shimmer(
        params.get('temporalShimmerSamples'), min_frames=_i(params.get('temporalMinFrames'), 24),
        max_shimmer_score=_f(params.get('maxShimmerScore'), .035),
    )
    queue_plan = {
        'schemaVersion': 1, 'backend': 'MULTI_HOST_LEASE_FENCING', 'supportsFencing': True,
        'supportsHeartbeats': True, 'supportsIdempotency': True, 'supportsDeadLetter': True,
        'httpLeaseAdapterAvailable': True, 'runtimeVerified': False,
    }
    return {
        'schemaVersion': 1,
        'temporalShimmerGate': temporal,
        'multiHostQueue': queue_plan,
        'shaderCachePrewarm': build_shader_cache_prewarm_plan(shader_plan, params.get('benchmarkProfiles')),
        'boundedLearnedPrefetch': {
            'schemaVersion': 1, 'persistentStoreAvailable': True, 'maxCandidates': 4,
            'maxPrefetchBudgetRatio': .08, 'maxExtraResidentMipLevels': 1,
            'candidateOnlyUntilCanaryPass': True,
        },
        'atomicCdnPublisher': build_atomic_cdn_publisher_plan(params),
        'canonicalTileTrimLibrary': build_canonical_tile_library_plan(rows, v7_plan.get('trimDecal')),
        'deviceLab': build_device_lab_plan(params),
        'unifiedGovernorAdapters': build_unified_governor_adapter_manifest(v8_plan.get('unifiedQualityGovernor')),
        'cohortDrift': analyze_cohort_drift(params.get('cohortBaselineSamples'), params.get('cohortCandidateSamples'), min_samples=_i(params.get('cohortMinSamples'), 20)),
        'promotionLedger': build_promotion_ledger_plan(params),
        'hardRules': {
            'temporalGateCannotBeSatisfiedByStillImages': True,
            'multiHostCompletionRequiresCurrentFenceToken': True,
            'learnedPrefetchIsBudgetBounded': True,
            'cdnPromotionRequiresSignedAtomicManifest': True,
            'canonicalCrossProjectReuseRequiresVerification': True,
            'physicalDeviceLabCannotBeReplacedBySyntheticProbe': True,
            'cohortDriftCanBlockPromotion': True,
            'promotionLedgerChainMustVerify': True,
        },
    }
