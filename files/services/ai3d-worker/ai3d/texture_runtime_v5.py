from __future__ import annotations

import json
import math
import os
import sqlite3
import time
from contextlib import closing
from pathlib import Path
from typing import Iterable


def _vec3(value, default=(0.0, 0.0, 0.0)) -> tuple[float, float, float]:
    try:
        if isinstance(value, (list, tuple)) and len(value) >= 3:
            return float(value[0]), float(value[1]), float(value[2])
    except Exception:
        pass
    return default


def _dot(a, b) -> float:
    return float(a[0] * b[0] + a[1] * b[1] + a[2] * b[2])


def _sub(a, b):
    return a[0] - b[0], a[1] - b[1], a[2] - b[2]


def _norm(v) -> float:
    return math.sqrt(max(0.0, _dot(v, v)))


def _unit(v):
    n = _norm(v)
    if n <= 1e-9:
        return 0.0, 0.0, 0.0
    return v[0] / n, v[1] / n, v[2] / n


def _profile_capabilities(profile: str) -> dict:
    return {
        'web_desktop': {'ktx2': True, 'bc': True, 'astc': False, 'etc2': True, 'vtUploader': 'webgl2'},
        'web_mobile': {'ktx2': True, 'bc': False, 'astc': True, 'etc2': True, 'vtUploader': 'webgl2'},
        'godot_desktop': {'ktx2': False, 'bc': True, 'astc': False, 'etc2': True, 'vtUploader': 'godot-array-cache'},
        'godot_mobile': {'ktx2': False, 'bc': False, 'astc': True, 'etc2': True, 'vtUploader': 'godot-array-cache'},
        'roblox': {'ktx2': False, 'bc': False, 'astc': False, 'etc2': False, 'vtUploader': 'asset-tier-streamer'},
    }.get(profile, {'ktx2': False, 'bc': False, 'astc': False, 'etc2': False, 'vtUploader': 'none'})


def choose_gpu_texture_format(profile: str, role: str, capabilities: dict | None = None) -> dict:
    caps = dict(_profile_capabilities(profile))
    if capabilities:
        for key in ('ktx2', 'bc', 'astc', 'etc2'):
            if key in capabilities:
                caps[key] = bool(capabilities[key])
    role = str(role or 'generic').lower()
    data_role = role in {'normal', 'roughness', 'metallic', 'ao'}
    if caps.get('bc'):
        fmt = 'BC5' if role == 'normal' else ('BC4' if role in {'roughness', 'metallic', 'ao'} else 'BC7')
        container = 'DDS'
    elif caps.get('astc'):
        fmt = 'ASTC_6x6' if not data_role else 'ASTC_4x4'
        container = 'ASTC'
    elif caps.get('ktx2'):
        fmt = 'KTX2_UASTC' if data_role or role == 'normal' else 'KTX2_ETC1S'
        container = 'KTX2'
    elif caps.get('etc2'):
        fmt = 'ETC2_RGBA8' if not data_role else 'ETC2_EAC'
        container = 'KTX2-or-engine-import'
    else:
        fmt = 'ENGINE_MANAGED_SOURCE'
        container = 'PNG/WebP'
    return {
        'profile': profile,
        'role': role,
        'selectedFormat': fmt,
        'container': container,
        'capabilitiesUsed': caps,
        'runtimeVerified': False,
        'rule': 'Selection is a candidate until target-device import and sampling pass.',
    }


def build_gpu_capability_plan(runtime_plan: dict, supplied_capabilities: dict | None = None) -> dict:
    supplied_capabilities = supplied_capabilities or {}
    profiles = {}
    for profile_name, profile in (runtime_plan.get('profiles') or {}).items():
        caps = supplied_capabilities.get(profile_name) if isinstance(supplied_capabilities, dict) else None
        selections = []
        for texture in profile.get('textures', []):
            selections.append({
                'setKey': texture.get('setKey'),
                **choose_gpu_texture_format(profile_name, texture.get('role', 'generic'), caps),
            })
        profiles[profile_name] = {
            'probeSupplied': bool(caps),
            'selectionCount': len(selections),
            'selections': selections,
            'runtimeProbeRequired': not bool(caps),
        }
    return {
        'schemaVersion': 1,
        'profiles': profiles,
        'allTargetDevicesVerified': False,
        'rule': 'Server defaults never substitute for an actual target GPU capability probe.',
    }


def _trend_by_set(events: Iterable[dict]) -> dict[str, dict]:
    groups: dict[str, list[dict]] = {}
    for idx, event in enumerate(events):
        key = str(event.get('setKey') or event.get('material') or '').strip()
        if not key:
            continue
        row = dict(event)
        try:
            row['_t'] = float(event.get('timestamp', event.get('time', idx)))
        except Exception:
            row['_t'] = float(idx)
        groups.setdefault(key, []).append(row)
    result: dict[str, dict] = {}
    for key, rows in groups.items():
        rows.sort(key=lambda r: r['_t'])
        recent = rows[-8:]
        distances = []
        coverages = []
        forward_scores = []
        for r in recent:
            try:
                distances.append(float(r.get('distance', 1e6)))
            except Exception:
                distances.append(1e6)
            try:
                coverages.append(max(0.0, min(1.0, float(r.get('screenCoverage', 0.0)))))
            except Exception:
                coverages.append(0.0)
            cam = _vec3(r.get('cameraPosition'))
            target = _vec3(r.get('materialPosition'))
            forward = _unit(_vec3(r.get('cameraForward'), (0.0, 0.0, -1.0)))
            to_target = _unit(_sub(target, cam))
            if _norm(to_target) > 0 and _norm(forward) > 0:
                forward_scores.append(max(-1.0, min(1.0, _dot(forward, to_target))))
        first_d = distances[0] if distances else 1e6
        last_d = distances[-1] if distances else 1e6
        approach = max(-1.0, min(1.0, (first_d - last_d) / max(abs(first_d), 1.0)))
        coverage_growth = 0.0
        if coverages:
            coverage_growth = max(-1.0, min(1.0, coverages[-1] - coverages[0]))
        forward_alignment = sum(forward_scores) / len(forward_scores) if forward_scores else 0.0
        score = max(0.0, 0.55 * approach + 0.25 * max(0.0, coverage_growth) + 0.20 * max(0.0, forward_alignment))
        result[key] = {
            'samples': len(recent),
            'approach': round(approach, 6),
            'coverageGrowth': round(coverage_growth, 6),
            'forwardAlignment': round(forward_alignment, 6),
            'prefetchScore': round(score, 6),
            'lastDistance': round(last_d, 4),
        }
    return result


def build_predictive_prefetch_plan(events: Iterable[dict], runtime_plan: dict, max_prefetch: int = 16) -> dict:
    trends = _trend_by_set(events)
    entries = []
    seen = set()
    for profile_name, profile in (runtime_plan.get('profiles') or {}).items():
        for texture in profile.get('textures', []):
            key = str(texture.get('setKey') or '')
            if not key or (profile_name, key) in seen:
                continue
            seen.add((profile_name, key))
            trend = trends.get(key)
            if not trend:
                continue
            baseline = int(texture.get('budgetSolvedResidentMipFloor', texture.get('feedbackResidentMipFloor', texture.get('residentMipFloor', 0))))
            score = float(trend['prefetchScore'])
            if score < 0.08:
                continue
            target = max(0, baseline - 1) if score >= 0.45 else baseline
            entries.append({
                'profile': profile_name,
                'setKey': key,
                'prefetchScore': score,
                'baselineMipFloor': baseline,
                'prefetchMipFloor': target,
                'reason': trend,
                'candidateOnly': True,
            })
    entries.sort(key=lambda x: x['prefetchScore'], reverse=True)
    entries = entries[:max(1, int(max_prefetch))]
    return {
        'schemaVersion': 1,
        'entries': entries,
        'prefetchCount': len(entries),
        'runtimeVerified': False,
        'rule': 'Prefetch may improve latency but cannot promote a higher-memory policy without runtime gates.',
    }


def build_virtual_texture_residency_manifest(runtime_plan: dict, prefetch_plan: dict | None = None) -> dict:
    prefetch = {(e.get('profile'), e.get('setKey')): e for e in (prefetch_plan or {}).get('entries', [])}
    profiles = {}
    for profile_name, profile in (runtime_plan.get('profiles') or {}).items():
        pages = []
        for texture in profile.get('textures', []):
            page_plan = texture.get('virtualTexturePagePlan')
            if not page_plan:
                continue
            key = texture.get('setKey')
            floor = int(texture.get('budgetSolvedResidentMipFloor', texture.get('feedbackResidentMipFloor', texture.get('residentMipFloor', 0))))
            hint = prefetch.get((profile_name, key))
            if hint:
                floor = min(floor, int(hint.get('prefetchMipFloor', floor)))
            mip_rows = page_plan.get('mips') or page_plan.get('levels') or []
            for mip in mip_rows:
                level = int(mip.get('level', mip.get('mip', 0)))
                if level < floor:
                    continue
                pages.append({
                    'setKey': key,
                    'role': texture.get('role'),
                    'mip': level,
                    'pagesX': int(mip.get('pagesX', mip.get('tilesX', 1))),
                    'pagesY': int(mip.get('pagesY', mip.get('tilesY', 1))),
                    'priority': texture.get('feedbackPriority', texture.get('streamingPriority', 'medium')),
                })
        profiles[profile_name] = {
            'uploader': _profile_capabilities(profile_name).get('vtUploader'),
            'pageRows': pages,
            'pageRowCount': len(pages),
            'runtimeVerified': False,
        }
    return {
        'schemaVersion': 1,
        'profiles': profiles,
        'runtimeVerified': False,
        'rule': 'Residency manifests are executable hints; physical page upload must still pass target runtime verification.',
    }


class StreamingPolicyStore:
    """Small persistent, bounded policy memory for texture streaming decisions."""

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.db_path = self.root / 'streaming-policy.sqlite3'
        self._init()

    def _connect(self):
        con = sqlite3.connect(self.db_path)
        con.execute('PRAGMA journal_mode=WAL')
        con.execute('PRAGMA synchronous=NORMAL')
        return con

    def _init(self):
        with closing(self._connect()) as con:
            con.execute('''CREATE TABLE IF NOT EXISTS policy (
                profile TEXT NOT NULL,
                set_key TEXT NOT NULL,
                mip_bias REAL NOT NULL,
                attention REAL NOT NULL,
                runs INTEGER NOT NULL,
                accepted_runs INTEGER NOT NULL,
                updated_at REAL NOT NULL,
                PRIMARY KEY(profile, set_key)
            )''')
            con.commit()

    def learn(self, feedback: dict, profiles: Iterable[str], accepted: bool = False) -> dict:
        changed = 0
        now = time.time()
        with closing(self._connect()) as con:
            for item in feedback.get('feedback', []):
                key = str(item.get('setKey') or '')
                if not key:
                    continue
                attention = max(0.0, min(1.0, float(item.get('normalizedAttention', 0.0))))
                suggested = float(item.get('recommendedMipBias', 2))
                for profile in profiles:
                    row = con.execute('SELECT mip_bias, attention, runs, accepted_runs FROM policy WHERE profile=? AND set_key=?', (profile, key)).fetchone()
                    if row:
                        old_bias, old_attn, runs, accepted_runs = row
                    else:
                        old_bias, old_attn, runs, accepted_runs = suggested, attention, 0, 0
                    alpha = 0.20 if accepted else 0.05
                    new_bias = old_bias * (1.0 - alpha) + suggested * alpha
                    # Safety clamp: learning never shifts more than one mip from the previous remembered policy per update.
                    new_bias = max(old_bias - 1.0, min(old_bias + 1.0, new_bias))
                    new_attn = old_attn * 0.8 + attention * 0.2
                    con.execute('''INSERT INTO policy(profile,set_key,mip_bias,attention,runs,accepted_runs,updated_at)
                        VALUES(?,?,?,?,?,?,?) ON CONFLICT(profile,set_key) DO UPDATE SET
                        mip_bias=excluded.mip_bias, attention=excluded.attention, runs=excluded.runs,
                        accepted_runs=excluded.accepted_runs, updated_at=excluded.updated_at''',
                        (profile, key, new_bias, new_attn, runs + 1, accepted_runs + (1 if accepted else 0), now))
                    changed += 1
            con.commit()
        return {'rowsUpdated': changed, 'acceptedTrainingRun': bool(accepted), 'db': str(self.db_path)}

    def export(self) -> dict:
        with closing(self._connect()) as con:
            rows = con.execute('SELECT profile,set_key,mip_bias,attention,runs,accepted_runs,updated_at FROM policy ORDER BY profile,set_key').fetchall()
        return {
            'schemaVersion': 1,
            'policies': [
                {'profile': r[0], 'setKey': r[1], 'mipBias': round(float(r[2]), 4), 'attention': round(float(r[3]), 6),
                 'runs': int(r[4]), 'acceptedRuns': int(r[5]), 'updatedAt': float(r[6])}
                for r in rows
            ],
            'runtimeVerified': False,
        }


def resolve_streaming_policy_root(job_dir: Path) -> tuple[Path, str]:
    env = os.environ.get('TEXTURE_STREAMING_POLICY_DIR')
    if env:
        return Path(env).expanduser().resolve(), 'configured-durable-path-candidate'
    return (Path(job_dir) / '.texture-quality-cache' / 'streaming-policy').resolve(), 'local-worker-path'


def build_uv_autofix_job(uv_rebind_plan: dict, atlas_manifest: dict) -> dict:
    entries = uv_rebind_plan.get('entries', [])
    set_keys = sorted({str(e.get('setKey')) for e in entries if e.get('setKey')})
    return {
        'schemaVersion': 1,
        'candidateOnly': True,
        'blenderTool': 'tools/texture_runtime_adapters/blender/autofix_uv_and_atlas.py',
        'setKeys': set_keys,
        'atlasPages': len(atlas_manifest.get('pages', [])),
        'policy': {
            'inspectExistingUv': True,
            'createUvWhenMissing': True,
            'repackOverlappingOrOutOfBoundsUv': True,
            'preserveOriginalMesh': True,
            'writeNewCandidate': True,
            'renderBackRequired': True,
        },
        'runtimeVerified': False,
    }


def build_renderback_automation_manifest(params: dict | None = None) -> dict:
    params = params or {}
    return {
        'schemaVersion': 1,
        'web': {
            'tool': 'tools/capture_texture_renderback.py',
            'automaticWhen': 'playwright is installed and --url is supplied',
            'verified': False,
        },
        'godot': {
            'tool': 'tools/capture_texture_renderback.py',
            'automaticWhen': 'a configured Godot capture command writes the requested PNG',
            'verified': False,
        },
        'roblox': {
            'tool': 'tools/capture_texture_renderback.py',
            'automaticWhen': 'external Studio/browser automation command is configured',
            'verified': False,
            'note': 'No generic in-experience API is claimed to write arbitrary local screenshots.',
        },
        'visualDeltaLimit': float(params.get('renderBackVisualDeltaLimit', 0.035)),
        'candidateOnly': True,
    }


def build_v5_system_plan(runtime_plan: dict, events: list[dict], uv_rebind_plan: dict, atlas_manifest: dict,
                         params: dict | None = None, supplied_capabilities: dict | None = None) -> dict:
    params = params or {}
    prefetch = build_predictive_prefetch_plan(events, runtime_plan, int(params.get('maxPrefetchMaterials', 16)))
    capability = build_gpu_capability_plan(runtime_plan, supplied_capabilities)
    vt = build_virtual_texture_residency_manifest(runtime_plan, prefetch)
    uv = build_uv_autofix_job(uv_rebind_plan, atlas_manifest)
    renderback = build_renderback_automation_manifest(params)
    return {
        'schemaVersion': 1,
        'predictivePrefetch': prefetch,
        'gpuCapabilityPlan': capability,
        'virtualTextureResidency': vt,
        'uvAutofixJob': uv,
        'renderBackAutomation': renderback,
        'runtimeVerified': False,
        'rule': 'V5 automates candidate generation; promotion still requires real engine/device gates.',
    }


def promote_streaming_policy_if_verified(store: StreamingPolicyStore, feedback: dict, profiles: Iterable[str], runtime_gate: dict) -> dict:
    passed = bool(runtime_gate.get('passed')) and all(bool(v) for v in (runtime_gate.get('checks') or {}).values())
    if not passed:
        return {
            'promoted': False,
            'rowsUpdated': 0,
            'reason': 'runtime-gate-failed-or-incomplete',
            'policy': store.export(),
        }
    learned = store.learn(feedback, profiles, accepted=True)
    return {
        'promoted': True,
        'rowsUpdated': learned['rowsUpdated'],
        'reason': 'runtime-and-visual-gates-passed',
        'policy': store.export(),
    }
