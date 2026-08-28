#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
from pathlib import Path


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding='utf-8'))


def score(output: Path) -> dict:
    manifest_path = output / 'GS360_MANIFEST.json'
    transforms_path = output / 'dataset' / 'transforms.json'
    game_manifest_path = output / 'game' / 'scene.gs360.json'
    seed_path = output / 'game' / 'seed_gaussians.ply'
    audit_path = output / 'GS360_ARTIFACT_AUDIT.json'
    input_quality_path = output / 'GS360_INPUT_QUALITY.json'
    consistency_path = output / 'GS360_SYNTHETIC_CONSISTENCY.json'
    optimizer_path = output / 'GS360_OPTIMIZATION_REPORT.json'

    missing = [str(p) for p in (manifest_path, transforms_path, game_manifest_path, seed_path) if not p.is_file()]
    if not manifest_path.is_file():
        return {
            'schema': 'world-server.gs360-quality/v3',
            'pass': False,
            'status': 'BROKEN_OUTPUT',
            'missing': missing,
            'technical_readiness': 0,
            'game_preview_readiness': 0,
            'reconstruction_fidelity': 0,
        }

    m = load_json(manifest_path)
    preference = m.get('selected_preference', 'approximate')
    trained = bool(m.get('quality_contract', {}).get('trained_3dgs'))
    depth_kind = m.get('depth', {}).get('kind')
    pose = m.get('pose_estimation', {})
    source_count = int(m.get('source_panorama_count', 0) or 0)
    views = int(m.get('base_views_per_panorama', 0) or 0)
    total_frames = int(m.get('total_frames', 0) or 0)
    inputs = m.get('inputs', []) or []
    backend_configured = bool(m.get('backend', {}).get('configured'))
    audit = load_json(audit_path) if audit_path.is_file() else {}
    input_quality = load_json(input_quality_path) if input_quality_path.is_file() else {}
    consistency = load_json(consistency_path) if consistency_path.is_file() else {}
    optimizer = load_json(optimizer_path) if optimizer_path.is_file() else {}
    input_quality_score = int(input_quality.get('score', 0) or 0)
    audit_score = int(audit.get('score', 0) or 0)
    audit_pass = bool(audit.get('pass')) if audit else False
    consistency_score = consistency.get('score') if consistency else None
    optimization_variants = optimizer.get('variants', []) if optimizer else []

    technical = 0
    technical += 30 if not missing else max(0, 30 - len(missing) * 8)
    technical += 15 if all(bool(x.get('equirectangular_2to1')) for x in inputs) else 7
    technical += 15 if views >= 12 else (10 if views >= 8 else 6)
    technical += 10 if total_frames >= max(8, source_count * views) else 4
    technical += 15 if depth_kind in {'onnx_monocular','openvino_monocular','depth_anything_v2_small_cpu'} else 7
    if source_count <= 1:
        technical += 8
    elif pose.get('pass'):
        technical += 10
    elif pose.get('available'):
        technical += 6
    else:
        technical += 2
    technical += 10 if trained else 5
    technical += 5 if m.get('estimated_time_human') else 0
    if input_quality:
        technical += 5 if input_quality_score >= 70 else (2 if input_quality_score >= 55 else -5)
    if audit:
        technical += 5 if audit_pass else 0
        technical -= 10 if audit.get('status') == 'FAIL' else 0
    if consistency_score is not None:
        technical += 5 if consistency_score >= 75 else (2 if consistency_score >= 55 else -8)
    technical = max(0, min(100, technical))

    preview = 0
    preview += 35 if not missing else 15
    preview += 25 if seed_path.is_file() and seed_path.stat().st_size > 128 else 0
    preview += 15 if total_frames >= 8 else 5
    preview += 10 if depth_kind else 0
    preview += 10 if game_manifest_path.is_file() else 0
    preview += 5 if m.get('mode') in {'STYLE_FIRST_360', 'PREVIEW_THEN_REFINE_360', 'QUALITY_360'} else 0
    if audit:
        preview += 5 if audit_pass else -10
    if consistency_score is not None:
        preview += 5 if consistency_score >= 65 else -5
    preview = max(0, min(100, preview))

    fidelity = 15
    fidelity += 15 if all(bool(x.get('equirectangular_2to1')) for x in inputs) else 5
    fidelity += 20 if source_count >= 3 else (12 if source_count == 2 else 5)
    fidelity += 15 if depth_kind in {'onnx_monocular','openvino_monocular','depth_anything_v2_small_cpu'} else 5
    fidelity += 15 if pose.get('pass') else (6 if source_count <= 1 else 2)
    fidelity += 20 if trained else 0
    if input_quality:
        fidelity += 10 if input_quality_score >= 80 else (5 if input_quality_score >= 65 else -5)
    if consistency_score is not None:
        fidelity += 10 if consistency_score >= 80 else (5 if consistency_score >= 60 else -8)
    fidelity = min(100, fidelity)

    artifact_ok = (not audit) or audit.get('status') != 'FAIL'
    consistency_ok = (consistency_score is None) or consistency_score >= 55
    preview_ready = preview >= 70 and not missing and artifact_ok and consistency_ok
    accurate_ready = trained and fidelity >= 70 and not missing and artifact_ok and consistency_ok
    if preference == 'accurate' and not accurate_ready:
        status = 'NEEDS_REAL_BACKEND' if not trained else 'NEEDS_QUALITY_IMPROVEMENT'
    elif preview_ready:
        status = 'READY_FOR_GAME_PREVIEW' if not trained else 'READY_TRAINED_3DGS'
    else:
        status = 'NEEDS_REPAIR'

    recommendations = []
    if depth_kind not in {'onnx_monocular','openvino_monocular','depth_anything_v2_small_cpu'}:
        recommendations.append('Install/wire a supported free OpenVINO or ONNX depth model; CPU-only systems should benchmark OpenVINO first.')
    if source_count > 1 and not pose.get('pass'):
        recommendations.append('Install/wire COLMAP and rerun multi-view pose estimation.')
    if preference == 'accurate' and not trained:
        recommendations.append('Wire a real 3DGS trainer through GS360_TRAIN_CMD.')
    if views < 12:
        recommendations.append('Increase base perspective views to at least 12 for shipping-quality coverage.')
    if audit and not audit_pass:
        recommendations.append('Repair artifact integrity issues listed in GS360_ARTIFACT_AUDIT.json.')
    if input_quality and input_quality_score < 65:
        recommendations.append('Improve source panorama sharpness/seam/exposure before spending long accurate-training time.')
    if consistency_score is not None and consistency_score < 55:
        recommendations.append('Synthetic-view stability is low; reduce virtual baseline or use stronger depth before training.')
    if optimizer and optimizer.get('status') == 'TOOL_MISSING':
        recommendations.append('Install MIT-licensed @playcanvas/splat-transform for NaN cleanup, SPZ/SOG compression, LOD and HTML delivery variants.')

    return {
        'schema': 'world-server.gs360-quality/v3',
        'pass': preview_ready if preference != 'accurate' else accurate_ready,
        'status': status,
        'preference': preference,
        'trained_3dgs': trained,
        'technical_readiness': technical,
        'game_preview_readiness': preview,
        'reconstruction_fidelity': fidelity,
        'artifact_integrity': audit_score if audit else None,
        'artifact_audit_pass': audit_pass if audit else None,
        'input_quality': input_quality_score if input_quality else None,
        'synthetic_consistency': consistency_score,
        'optimized_variant_count': len(optimization_variants),
        'ready_for_game_preview': preview_ready,
        'ready_for_accurate_delivery': accurate_ready,
        'missing': missing,
        'recommendations': recommendations,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--output', required=True)
    args = ap.parse_args()
    output = Path(args.output).expanduser().resolve()
    report = score(output)
    out = output / 'GS360_QUALITY_REPORT.json'
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))
    # Quality gate is diagnostic. Broken artifacts fail hard; incomplete accurate
    # reconstruction remains a truthful partial result instead of hiding output.
    return 2 if report.get('status') == 'BROKEN_OUTPUT' else 0


if __name__ == '__main__':
    raise SystemExit(main())
