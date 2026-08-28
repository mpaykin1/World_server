from __future__ import annotations

import json
import math
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def _profile_texture_rows(runtime_plan: dict) -> list[tuple[str, dict]]:
    rows: list[tuple[str, dict]] = []
    for profile_name, profile in (runtime_plan.get('profiles') or {}).items():
        for texture in profile.get('textures') or []:
            rows.append((str(profile_name), texture))
    return rows


def _saliency_map(saliency_plan: dict | None) -> dict[str, float]:
    return {
        str(row.get('setKey')): _clamp(_safe_float(row.get('saliencyScore'), 0.55))
        for row in (saliency_plan or {}).get('entries', [])
        if row.get('setKey')
    }


def _priority_name(score: float) -> str:
    if score >= 0.88:
        return 'critical'
    if score >= 0.72:
        return 'high'
    if score >= 0.52:
        return 'medium'
    return 'low'


# ---------------------------------------------------------------------------
# 1. Residency thrash detector
# ---------------------------------------------------------------------------

def detect_residency_thrash(events: Iterable[dict] | None, window_seconds: float = 12.0, reload_threshold: int = 3) -> dict:
    events = [dict(e) for e in (events or []) if e.get('setKey')]
    window_seconds = max(1.0, min(float(window_seconds), 120.0))
    reload_threshold = max(2, min(int(reload_threshold), 20))
    by_key: dict[str, list[dict]] = {}
    for event in events:
        by_key.setdefault(str(event.get('setKey')), []).append(event)

    rows = []
    for key, group in sorted(by_key.items()):
        group.sort(key=lambda e: _safe_float(e.get('timestamp', e.get('time', 0.0))))
        reloads = 0
        evictions = 0
        transitions = 0
        last_state = None
        last_evict_time = None
        for event in group:
            state = str(event.get('event') or event.get('state') or '').lower()
            ts = _safe_float(event.get('timestamp', event.get('time', 0.0)))
            if state in {'evict', 'evicted', 'unload', 'unloaded'}:
                evictions += 1
                last_evict_time = ts
            elif state in {'load', 'loaded', 'resident', 'upload', 'uploaded'}:
                if last_evict_time is not None and ts - last_evict_time <= window_seconds:
                    reloads += 1
                last_evict_time = None
            if last_state is not None and state and state != last_state:
                transitions += 1
            if state:
                last_state = state
        event_count = len(group)
        churn = reloads / max(1, event_count)
        thrashing = reloads >= reload_threshold or (reloads >= 2 and churn >= 0.25)
        rows.append({
            'setKey': key,
            'events': event_count,
            'reloadsAfterRecentEviction': reloads,
            'evictions': evictions,
            'stateTransitions': transitions,
            'churnRatio': round(churn, 6),
            'thrashing': thrashing,
            'recommendedAction': 'PIN_ONE_COARSER_MIP_AND_REDUCE_PREFETCH_CHURN' if thrashing else 'KEEP_POLICY',
        })
    hot = [r for r in rows if r['thrashing']]
    return {
        'schemaVersion': 1,
        'eventsConsumed': sum(r['events'] for r in rows),
        'setsObserved': len(rows),
        'thrashingSets': [r['setKey'] for r in hot],
        'thrashingSetCount': len(hot),
        'entries': rows,
        'runtimeVerified': bool(events),
        'rule': 'Thrash mitigation may pin/coarsen non-critical residency but must still pass visual and frame-time gates.',
    }


# ---------------------------------------------------------------------------
# 2. Thermal / battery governor
# ---------------------------------------------------------------------------

THERMAL_ORDER = {'nominal': 0, 'fair': 1, 'serious': 2, 'critical': 3, 'unknown': 0}


def build_thermal_battery_governor(device: dict | None = None, saliency_plan: dict | None = None) -> dict:
    device = device or {}
    thermal = str(device.get('thermalState', 'unknown')).strip().lower()
    thermal_level = THERMAL_ORDER.get(thermal, 0)
    battery = _clamp(_safe_float(device.get('batteryLevel', 1.0), 1.0))
    charging = bool(device.get('charging', False))
    saver = bool(device.get('batterySaver', device.get('lowPowerMode', False)))

    pressure = thermal_level / 3.0
    if not charging:
        if battery < 0.15:
            pressure = max(pressure, 0.9)
        elif battery < 0.30:
            pressure = max(pressure, 0.65)
    if saver:
        pressure = max(pressure, 0.72)
    pressure = _clamp(pressure)

    quality_scale = max(0.50, 1.0 - 0.42 * pressure)
    prefetch_scale = max(0.25, 1.0 - 0.70 * pressure)
    anisotropy_cap = 16 if pressure < 0.2 else (8 if pressure < 0.55 else (4 if pressure < 0.8 else 2))
    background_mip_bias = 0 if pressure < 0.35 else (1 if pressure < 0.8 else 2)
    critical_floor = 0 if pressure < 0.9 else 1

    critical = [e['setKey'] for e in (saliency_plan or {}).get('entries', []) if e.get('priority') == 'critical']
    return {
        'schemaVersion': 1,
        'telemetryAvailable': bool(device),
        'thermalState': thermal,
        'batteryLevel': round(battery, 4),
        'charging': charging,
        'batterySaver': saver,
        'pressure': round(pressure, 6),
        'qualityScale': round(quality_scale, 6),
        'prefetchScale': round(prefetch_scale, 6),
        'anisotropyCap': anisotropy_cap,
        'backgroundMipBiasDelta': background_mip_bias,
        'criticalMipBiasDelta': critical_floor,
        'protectedCriticalSets': critical,
        'action': 'EMERGENCY_CONSERVE' if pressure >= 0.85 else ('CONSERVE' if pressure >= 0.5 else 'NORMAL'),
        'runtimeVerified': False,
        'rule': 'Thermal/battery telemetry is optional. Never invent thermal state; degrade non-critical quality first.',
    }


# ---------------------------------------------------------------------------
# 3. Unified GPU frame-budget optimizer
# ---------------------------------------------------------------------------

def build_gpu_frame_budget_plan(runtime_metrics: dict | None = None, thermal_governor: dict | None = None,
                                target_fps: float = 60.0) -> dict:
    runtime_metrics = runtime_metrics or {}
    thermal_governor = thermal_governor or {}
    target_fps = max(20.0, min(float(target_fps), 240.0))
    frame_budget = 1000.0 / target_fps
    gpu_ms = max(0.0, _safe_float(runtime_metrics.get('gpuFrameMs', runtime_metrics.get('p95FrameMs', 0.0))))
    cpu_ms = max(0.0, _safe_float(runtime_metrics.get('cpuFrameMs', 0.0)))
    vram_ratio = _clamp(_safe_float(runtime_metrics.get('vramUsageRatio', 0.0)))
    thermal_pressure = _clamp(_safe_float(thermal_governor.get('pressure', 0.0)))
    frame_pressure = _clamp(gpu_ms / max(frame_budget, 1e-6) - 0.85, 0.0, 1.0)
    pressure = _clamp(max(frame_pressure, vram_ratio * 0.8, thermal_pressure * 0.9))

    # Fractions are coordination targets, not engine commands. They always sum to 1.
    textures = 0.27 - 0.07 * pressure
    meshes = 0.19 - 0.02 * pressure
    shadows = 0.20 - 0.06 * pressure
    lighting = 0.16 - 0.02 * pressure
    particles = 0.10 - 0.04 * pressure
    post = 1.0 - (textures + meshes + shadows + lighting + particles)
    allocations = {
        'textures': textures,
        'meshes': meshes,
        'shadows': shadows,
        'lighting': lighting,
        'particles': particles,
        'postProcessing': post,
    }
    total = sum(allocations.values()) or 1.0
    allocations = {k: round(v / total, 6) for k, v in allocations.items()}

    return {
        'schemaVersion': 1,
        'targetFps': target_fps,
        'frameBudgetMs': round(frame_budget, 6),
        'observedGpuFrameMs': round(gpu_ms, 6),
        'observedCpuFrameMs': round(cpu_ms, 6),
        'pressure': round(pressure, 6),
        'budgetFractions': allocations,
        'textureActions': [
            'reduce-noncritical-prefetch' if pressure >= 0.35 else 'keep-prefetch',
            'coarsen-background-residency' if pressure >= 0.55 else 'keep-residency',
            'disable-inferred-detail-layers' if pressure >= 0.80 else 'keep-detail-layers',
        ],
        'crossSubsystemCoordinationRequired': True,
        'runtimeVerified': False,
        'rule': 'This plan coordinates budgets; it does not claim to modify mesh/shadow/light systems unless their adapters consume it.',
    }


# ---------------------------------------------------------------------------
# 4. Mesh-derived texel density
# ---------------------------------------------------------------------------

def analyze_mesh_texel_density(samples: Iterable[dict] | None, target_texels_per_unit: float = 512.0) -> dict:
    target = max(1.0, float(target_texels_per_unit))
    rows = []
    for sample in samples or []:
        key = str(sample.get('setKey') or sample.get('material') or '')
        world_area = max(1e-9, _safe_float(sample.get('worldArea'), 0.0))
        uv_area = max(0.0, _safe_float(sample.get('uvArea'), 0.0))
        width = max(1, _safe_int(sample.get('textureWidth'), 1))
        height = max(1, _safe_int(sample.get('textureHeight'), 1))
        if not key or uv_area <= 0 or world_area <= 1e-8:
            continue
        texels_per_area = width * height * uv_area / world_area
        texels_per_unit = math.sqrt(max(0.0, texels_per_area))
        ratio = texels_per_unit / target
        status = 'OK' if 0.75 <= ratio <= 1.5 else ('TOO_LOW' if ratio < 0.75 else 'OVERDENSE')
        rows.append({
            'setKey': key,
            'worldArea': round(world_area, 8),
            'uvArea': round(uv_area, 8),
            'textureSize': [width, height],
            'texelsPerUnit': round(texels_per_unit, 4),
            'targetTexelsPerUnit': target,
            'ratioToTarget': round(ratio, 6),
            'status': status,
            'uvScaleRecommendation': round(target / max(texels_per_unit, 1e-6), 6),
        })
    return {
        'schemaVersion': 1,
        'sampleCount': len(rows),
        'entries': rows,
        'tooLowCount': sum(1 for r in rows if r['status'] == 'TOO_LOW'),
        'overdenseCount': sum(1 for r in rows if r['status'] == 'OVERDENSE'),
        'geometryMeasured': bool(rows),
        'rule': 'Automatic UV scaling is candidate-only and requires render-back verification because artistic tiling intent may differ.',
    }


# ---------------------------------------------------------------------------
# 5. Trim-sheet / decal planner
# ---------------------------------------------------------------------------

def build_trim_decal_plan(rows: list[dict], saliency_plan: dict | None = None, min_group_size: int = 3) -> dict:
    saliency = _saliency_map(saliency_plan)
    groups: dict[str, list[dict]] = {}
    for row in rows:
        role = str(row.get('role') or '')
        if role not in {'albedo', 'generic'}:
            continue
        material = str(row.get('material') or 'generic').lower()
        key = str(row.get('setKey') or '')
        family = material if material in {'stone', 'brick', 'wood', 'metal', 'iron', 'steel', 'bronze', 'copper'} else 'generic'
        groups.setdefault(family, []).append(row)
    candidates = []
    for family, group in sorted(groups.items()):
        if len(group) < max(2, int(min_group_size)):
            continue
        keys = sorted({str(r.get('setKey')) for r in group if r.get('setKey')})
        hero = any(saliency.get(k, 0.55) >= 0.88 for k in keys)
        candidates.append({
            'family': family,
            'setKeys': keys,
            'sourceCount': len(group),
            'trimSheetCandidate': True,
            'autoApply': False,
            'decalOverlayRecommended': family in {'stone', 'brick', 'metal', 'iron', 'steel'},
            'heroProtected': hero,
            'expectedBenefit': 'reduce material/texture switches and repeated unique textures',
        })
    return {
        'schemaVersion': 1,
        'candidates': candidates,
        'candidateCount': len(candidates),
        'autoApplied': False,
        'rule': 'Trim-sheet/decal conversion changes UV/material semantics and is never auto-promoted without mesh rewrite + render-back gates.',
    }


# ---------------------------------------------------------------------------
# 6. CDN chunk / region packaging
# ---------------------------------------------------------------------------

def build_cdn_region_package_plan(network_plan: dict, runtime_plan: dict, regions: list[str] | None = None,
                                  target_chunk_kb: int = 1024) -> dict:
    regions = [str(r) for r in (regions or ['global']) if str(r).strip()]
    target_bytes = max(128, min(int(target_chunk_kb), 8192)) * 1024
    estimates: dict[tuple[str, str], int] = {}
    for profile, tex in _profile_texture_rows(runtime_plan):
        estimates[(profile, str(tex.get('setKey') or ''))] = max(32 * 1024, _safe_int(tex.get('estimatedResidentVramBytes'), 256 * 1024))

    chunks = []
    for region in regions:
        current = {'region': region, 'chunkId': f'{region}-000', 'estimatedBytes': 0, 'items': []}
        idx = 0
        for item in network_plan.get('queue', []):
            est = estimates.get((str(item.get('profile')), str(item.get('setKey'))), 256 * 1024)
            if current['items'] and current['estimatedBytes'] + est > target_bytes:
                chunks.append(current)
                idx += 1
                current = {'region': region, 'chunkId': f'{region}-{idx:03d}', 'estimatedBytes': 0, 'items': []}
            current['items'].append({
                'profile': item.get('profile'), 'setKey': item.get('setKey'),
                'priorityScore': item.get('priorityScore'), 'targetMipFloor': item.get('targetMipFloor'),
                'estimatedBytes': est,
            })
            current['estimatedBytes'] += est
        if current['items']:
            chunks.append(current)
    return {
        'schemaVersion': 1,
        'regions': regions,
        'targetChunkKB': target_bytes // 1024,
        'chunks': chunks,
        'chunkCount': len(chunks),
        'contentAddressedRecommended': True,
        'immutableCacheControlRecommended': True,
        'runtimeVerified': False,
        'rule': 'Chunk estimates are planning values until encoded artifact byte sizes and real CDN traces are supplied.',
    }


# ---------------------------------------------------------------------------
# 7. A/B canary controller
# ---------------------------------------------------------------------------

def evaluate_canary_rollout(baseline: dict | None, candidate: dict | None, current_percent: float = 1.0,
                            thresholds: dict | None = None) -> dict:
    baseline = baseline or {}; candidate = candidate or {}; thresholds = thresholds or {}
    fps_limit = abs(_safe_float(thresholds.get('fpsDropRatio', 0.03), 0.03))
    p95_limit = abs(_safe_float(thresholds.get('p95IncreaseRatio', 0.05), 0.05))
    vram_limit = abs(_safe_float(thresholds.get('vramIncreaseRatio', 0.05), 0.05))
    visual_limit = abs(_safe_float(thresholds.get('visualDelta', 0.025), 0.025))
    min_samples = max(1, _safe_int(thresholds.get('minSamples', 100), 100))
    samples = _safe_int(candidate.get('samples', candidate.get('sampleCount', 0)), 0)

    checks = {}
    b_fps = _safe_float(baseline.get('fps'), 0.0); c_fps = _safe_float(candidate.get('fps'), 0.0)
    checks['fps'] = bool(b_fps > 0 and c_fps > 0 and c_fps >= b_fps * (1.0 - fps_limit))
    b_p95 = _safe_float(baseline.get('p95FrameMs'), 0.0); c_p95 = _safe_float(candidate.get('p95FrameMs'), 0.0)
    checks['p95FrameMs'] = bool(b_p95 > 0 and c_p95 > 0 and c_p95 <= b_p95 * (1.0 + p95_limit))
    b_vram = _safe_float(baseline.get('textureVramMB'), 0.0); c_vram = _safe_float(candidate.get('textureVramMB'), 0.0)
    checks['textureVramMB'] = True if b_vram <= 0 or c_vram <= 0 else c_vram <= b_vram * (1.0 + vram_limit)
    checks['visualDelta'] = _safe_float(candidate.get('visualDelta'), 999.0) <= visual_limit
    checks['sampleCount'] = samples >= min_samples
    passed = all(checks.values())

    stages = [1.0, 5.0, 10.0, 25.0, 50.0, 100.0]
    current = min(stages, key=lambda x: abs(x - float(current_percent)))
    if not baseline or not candidate:
        action = 'HOLD_FOR_METRICS'; next_percent = current
    elif not passed:
        action = 'ROLLBACK_TO_BASELINE'; next_percent = 0.0
    else:
        next_candidates = [s for s in stages if s > current]
        if next_candidates:
            action = 'PROMOTE_ONE_STAGE'; next_percent = next_candidates[0]
        else:
            action = 'PROMOTE_TO_PRODUCTION'; next_percent = 100.0
    return {
        'schemaVersion': 1,
        'currentPercent': current,
        'nextPercent': next_percent,
        'checks': checks,
        'passed': passed,
        'action': action,
        'baseline': baseline,
        'candidate': candidate,
        'rule': 'Never skip canary stages automatically; each stage requires fresh measured metrics and minimum samples.',
    }


# ---------------------------------------------------------------------------
# 8. GPU OOM watchdog / emergency plan
# ---------------------------------------------------------------------------

def build_gpu_oom_recovery_plan(runtime_plan: dict, saliency_plan: dict | None = None, telemetry: dict | None = None) -> dict:
    telemetry = telemetry or {}
    saliency = _saliency_map(saliency_plan)
    oom = bool(telemetry.get('oom') or telemetry.get('deviceLostDueToMemory') or telemetry.get('contextLostDueToMemory'))
    pressure = _clamp(_safe_float(telemetry.get('vramUsageRatio', telemetry.get('memoryPressure', 0.0))))
    emergency = oom or pressure >= 0.94
    entries = []
    seen = set()
    for profile, tex in _profile_texture_rows(runtime_plan):
        key = str(tex.get('setKey') or '')
        if not key or (profile, key) in seen:
            continue
        seen.add((profile, key))
        s = saliency.get(key, 0.55)
        priority = _priority_name(s)
        bias = 0
        if emergency:
            bias = 1 if priority == 'critical' else (2 if priority == 'high' else 3)
        elif pressure >= 0.82:
            bias = 0 if priority == 'critical' else (1 if priority == 'high' else 2)
        entries.append({'profile': profile, 'setKey': key, 'priority': priority, 'emergencyMipBiasDelta': bias})
    return {
        'schemaVersion': 1,
        'oomObserved': oom,
        'memoryPressure': round(pressure, 6),
        'emergency': emergency,
        'entries': entries,
        'actions': [
            'cancel-noncritical-prefetch', 'evict-background-pages', 'drop-inferred-detail-macro-layers',
            'coarsen-noncritical-mips', 'rebuild-small-residency-set'
        ] if emergency else ['monitor-memory-pressure'],
        'engineMemorySignalVerified': bool(telemetry),
        'rule': 'Only use actual engine/device-loss/memory signals. Roblox and some runtimes may not expose VRAM/OOM directly; never fabricate it.',
    }


# ---------------------------------------------------------------------------
# 9. Multi-world resource allocator
# ---------------------------------------------------------------------------

def build_multi_world_resource_plan(worlds: Iterable[dict] | None, total_vram_mb: float = 1024.0,
                                    total_network_mbps: float = 50.0) -> dict:
    rows = []
    for world in worlds or []:
        wid = str(world.get('worldId') or world.get('id') or '')
        if not wid:
            continue
        visible = bool(world.get('visible', world.get('active', False)))
        focus = _clamp(_safe_float(world.get('focus', 1.0 if visible else 0.2)))
        users = max(0.0, _safe_float(world.get('activeUsers', 0.0)))
        transition = _clamp(_safe_float(world.get('transitionProbability', 0.0)))
        weight = 0.15 + (1.8 if visible else 0.0) + 1.2 * focus + min(1.2, math.log1p(users) / 5.0) + 0.8 * transition
        rows.append({'worldId': wid, 'weight': weight, 'visible': visible, 'focus': focus, 'activeUsers': users})
    total_weight = sum(r['weight'] for r in rows) or 1.0
    vram = max(64.0, float(total_vram_mb)); network = max(1.0, float(total_network_mbps))
    for row in rows:
        share = row['weight'] / total_weight
        row['vramBudgetMB'] = round(vram * share, 3)
        row['networkBudgetMbps'] = round(network * share, 3)
        row['weight'] = round(row['weight'], 6)
    return {
        'schemaVersion': 1,
        'worlds': rows,
        'worldCount': len(rows),
        'totalVramMB': vram,
        'totalNetworkMbps': network,
        'rule': 'Visible/focused worlds receive priority; inactive worlds keep a non-zero transition reserve to avoid black frames.',
    }


# ---------------------------------------------------------------------------
# 10. Adaptive anisotropic filtering
# ---------------------------------------------------------------------------

def build_adaptive_anisotropy_plan(runtime_plan: dict, saliency_plan: dict | None = None,
                                   thermal_governor: dict | None = None, gpu_capabilities: dict | None = None) -> dict:
    saliency = _saliency_map(saliency_plan)
    thermal_governor = thermal_governor or {}
    gpu_capabilities = gpu_capabilities or {}
    thermal_cap = max(1, _safe_int(thermal_governor.get('anisotropyCap', 16), 16))
    profiles = {}
    for profile, data in (runtime_plan.get('profiles') or {}).items():
        caps = gpu_capabilities.get(profile, {}) if isinstance(gpu_capabilities, dict) else {}
        device_cap = max(1, min(16, _safe_int(caps.get('maxAnisotropy', 16 if not profile.endswith('mobile') else 8), 8)))
        cap = min(thermal_cap, device_cap)
        entries = []
        seen = set()
        for tex in data.get('textures') or []:
            key = str(tex.get('setKey') or '')
            if not key or key in seen:
                continue
            seen.add(key)
            s = saliency.get(key, 0.55)
            desired = 16 if s >= 0.88 else (8 if s >= 0.72 else (4 if s >= 0.52 else 2))
            level = max(1, min(cap, desired))
            entries.append({'setKey': key, 'saliencyScore': round(s, 6), 'anisotropy': level})
        profiles[profile] = {'cap': cap, 'entries': entries, 'runtimeVerified': False}
    return {
        'schemaVersion': 1,
        'profiles': profiles,
        'rule': 'Anisotropy is capped by measured/declared GPU capability and thermal policy; target engine import/runtime must verify effect.',
    }


# ---------------------------------------------------------------------------
# V7 orchestration
# ---------------------------------------------------------------------------

def build_v7_system_plan(rows: list[dict], runtime_plan: dict, saliency_plan: dict, network_plan: dict,
                         params: dict | None = None, gpu_capabilities: dict | None = None) -> dict:
    params = params or {}; gpu_capabilities = gpu_capabilities or {}
    residency = detect_residency_thrash(
        params.get('residencyEvents'),
        params.get('residencyThrashWindowSeconds', 12.0),
        params.get('residencyReloadThreshold', 3),
    )
    thermal = build_thermal_battery_governor(params.get('deviceTelemetry'), saliency_plan)
    frame_budget = build_gpu_frame_budget_plan(params.get('currentRuntimeMetrics'), thermal, params.get('targetFps', 60.0))
    texel = analyze_mesh_texel_density(params.get('meshTexelSamples'), params.get('targetTexelsPerMeter', 512.0))
    trim = build_trim_decal_plan(rows, saliency_plan, params.get('trimSheetMinGroupSize', 3))
    cdn = build_cdn_region_package_plan(network_plan, runtime_plan, params.get('cdnRegions'), params.get('cdnChunkKB', 1024))
    canary = evaluate_canary_rollout(
        params.get('baselineRuntimeMetrics'), params.get('canaryRuntimeMetrics'),
        params.get('canaryPercent', 1.0), params.get('canaryThresholds'),
    )
    oom = build_gpu_oom_recovery_plan(runtime_plan, saliency_plan, params.get('gpuMemoryTelemetry'))
    multiworld = build_multi_world_resource_plan(params.get('worlds'), params.get('multiWorldVramMB', 1024.0), params.get('multiWorldNetworkMbps', 50.0))
    anisotropy = build_adaptive_anisotropy_plan(runtime_plan, saliency_plan, thermal, gpu_capabilities)
    return {
        'schemaVersion': 1,
        'residencyThrash': residency,
        'thermalBatteryGovernor': thermal,
        'gpuFrameBudget': frame_budget,
        'meshTexelDensity': texel,
        'trimDecal': trim,
        'cdnRegionPackaging': cdn,
        'canaryRollout': canary,
        'gpuOomRecovery': oom,
        'multiWorldResourceAllocator': multiworld,
        'adaptiveAnisotropy': anisotropy,
        'runtimeVerified': False,
        'rule': 'V7 adds coordinated runtime safety/efficiency controls. Automatic production promotion still requires real target-runtime evidence.',
    }
