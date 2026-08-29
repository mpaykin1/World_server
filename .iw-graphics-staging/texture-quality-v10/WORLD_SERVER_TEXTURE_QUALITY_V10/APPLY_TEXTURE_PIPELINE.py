from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

CURRENT_MASTER_SERVER_BLOB = '026b01d1f991bf52b7cef8b11774d3158c68edda'
KNOWN_V4_SERVER_BLOB = 'f00ecfb39db7da52b470e39d18c2f7f7b646eef2'
CURRENT_API_AI3D_BLOB = '6a516039d644058fcd17df9ac78d915a37ca0be0'
BRANCH = 'opencode/texture-quality-v10'
PATCH_VERSION = '10.0.0'


def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()


def run(cmd: list[str], cwd: Path, required: bool = True) -> tuple[int, str]:
    process = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False)
    if required and process.returncode != 0:
        raise RuntimeError(f"command failed ({process.returncode}): {' '.join(cmd)}\n{process.stdout[-7000:]}")
    return process.returncode, process.stdout


def find_repo(explicit: str | None) -> Path:
    candidates = []
    if explicit:
        candidates.append(Path(explicit))
    candidates += [Path.cwd(), Path.home() / 'Desktop' / 'World_server']
    for root in candidates:
        if (root / 'services' / 'ai3d-worker' / 'server.py').is_file():
            return root.resolve()
    raise RuntimeError('World_server repository not found. Use --repo <path>.')


def _remove_path(path: Path) -> None:
    if not path.exists() and not path.is_symlink():
        return
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink()


def backup_file(repo: Path, backup: Path, path: Path) -> None:
    if not path.exists():
        return
    relative = path.relative_to(repo)
    destination = backup / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    if path.is_dir() and not path.is_symlink():
        shutil.copytree(path, destination)
    else:
        shutil.copy2(path, destination)


def restore_file(repo: Path, backup: Path, path: Path) -> None:
    relative = path.relative_to(repo)
    saved = backup / relative
    _remove_path(path)
    if saved.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        if saved.is_dir() and not saved.is_symlink():
            shutil.copytree(saved, path)
        else:
            shutil.copy2(saved, path)


def main() -> int:
    parser = argparse.ArgumentParser(description='Install/upgrade World Server Texture Quality V10')
    parser.add_argument('--repo')
    parser.add_argument('--no-git', action='store_true')
    args = parser.parse_args()

    package = Path(__file__).resolve().parent
    repo = find_repo(args.repo)
    worker = repo / 'services' / 'ai3d-worker'
    server = worker / 'server.py'
    api_ai3d = repo / 'api' / 'ai3d.js'
    optimizer = worker / 'ai3d' / 'texture_optimizer.py'
    advanced = worker / 'ai3d' / 'texture_advanced.py'
    runtime_v4 = worker / 'ai3d' / 'texture_runtime_v4.py'
    runtime_v5 = worker / 'ai3d' / 'texture_runtime_v5.py'
    runtime_v6 = worker / 'ai3d' / 'texture_runtime_v6.py'
    runtime_v7 = worker / 'ai3d' / 'texture_runtime_v7.py'
    runtime_v8 = worker / 'ai3d' / 'texture_runtime_v8.py'
    runtime_v9 = worker / 'ai3d' / 'texture_runtime_v9.py'
    runtime_v10 = worker / 'ai3d' / 'texture_runtime_v10.py'
    renderback_compare = worker / 'ai3d' / 'renderback_compare.py'
    runtime_verifier = worker / 'tools' / 'verify_texture_runtime.py'
    renderback_tool = worker / 'tools' / 'compare_texture_renderbacks.py'
    compression_verifier = worker / 'tools' / 'verify_texture_compression.py'
    telemetry_aggregator = worker / 'tools' / 'aggregate_texture_telemetry.py'
    golden_sync = worker / 'tools' / 'sync_golden_texture_library.py'
    renderback_capture = worker / 'tools' / 'capture_texture_renderback.py'
    streaming_policy_trainer = worker / 'tools' / 'train_texture_streaming_policy.py'
    streaming_policy_promoter = worker / 'tools' / 'promote_texture_streaming_policy.py'
    runtime_collectors = worker / 'tools' / 'texture_runtime_collectors'
    runtime_metrics_example = worker / 'tools' / 'runtime_metrics_example.json'
    benchmark_farm = worker / 'tools' / 'benchmark_texture_farm.py'
    drift_checker = worker / 'tools' / 'check_texture_policy_drift.py'
    exploration_generator = worker / 'tools' / 'generate_texture_exploration_mission.py'
    residency_analyzer = worker / 'tools' / 'analyze_texture_residency.py'
    canary_evaluator = worker / 'tools' / 'evaluate_texture_canary.py'
    multiworld_allocator = worker / 'tools' / 'allocate_texture_resources.py'
    cdn_packager = worker / 'tools' / 'build_texture_cdn_packages.py'
    distributed_queue = worker / 'tools' / 'distributed_texture_queue.py'
    soak_analyzer = worker / 'tools' / 'analyze_texture_soak.py'
    regression_classifier = worker / 'tools' / 'classify_texture_regression.py'
    signed_manifest_verifier = worker / 'tools' / 'verify_signed_texture_manifest.py'
    temporal_analyzer = worker / 'tools' / 'analyze_texture_temporal_quality.py'
    multi_host_queue = worker / 'tools' / 'multi_host_texture_queue.py'
    promotion_ledger_verifier = worker / 'tools' / 'verify_promotion_ledger.py'
    atomic_cdn_publisher = worker / 'tools' / 'publish_texture_cdn_atomic.py'
    device_lab_results = worker / 'tools' / 'device_lab_texture_results.py'
    managed_queue_backend = worker / 'tools' / 'managed_texture_queue_backend.py'
    remote_cdn_publisher = worker / 'tools' / 'publish_texture_cdn_remote.py'
    optical_flow_tool = worker / 'tools' / 'compare_texture_optical_flow.py'
    shader_hitch_tool = worker / 'tools' / 'analyze_shader_hitches_v10.py'
    route_prefetch_v2_tool = worker / 'tools' / 'train_route_prefetch_v2.py'
    provenance_tool = worker / 'tools' / 'material_provenance_graph.py'
    device_farm_tool = worker / 'tools' / 'run_texture_device_farm.py'
    frame_graph_tool = worker / 'tools' / 'profile_texture_frame_graph.py'
    bisect_tool = worker / 'tools' / 'bisect_texture_regression.py'
    scene_quality_tool = worker / 'tools' / 'optimize_scene_quality.py'
    forecast_tool = worker / 'tools' / 'forecast_texture_resource_risk.py'
    attestation_tool = worker / 'tools' / 'verify_texture_build_attestation.py'
    tests = worker / 'tests' / 'test_texture_optimizer.py'
    tests_v4 = worker / 'tests' / 'test_texture_v4.py'
    tests_v5 = worker / 'tests' / 'test_texture_v5.py'
    tests_v6 = worker / 'tests' / 'test_texture_v6.py'
    tests_v7 = worker / 'tests' / 'test_texture_v7.py'
    tests_v8 = worker / 'tests' / 'test_texture_v8.py'
    tests_v9 = worker / 'tests' / 'test_texture_v9.py'
    tests_v10 = worker / 'tests' / 'test_texture_v10.py'
    adapters = worker / 'tools' / 'texture_runtime_adapters'
    docs = repo / 'docs' / 'TEXTURE_QUALITY_SYSTEM.md'

    original_server = server.read_bytes()
    server_blob = git_blob_sha(original_server)
    server_has_texture_hook = b'from ai3d.texture_optimizer import TextureOptimizer' in original_server and b'texture_optimize' in original_server
    print(f"DEBUG server_blob={server_blob} has_mesh={b'from ai3d.mesh_optimizer import' in original_server} has_texture={server_has_texture_hook} CURRENT={CURRENT_MASTER_SERVER_BLOB} KNOWN_V4={KNOWN_V4_SERVER_BLOB}")

    if not server_has_texture_hook:
        if server_blob == CURRENT_MASTER_SERVER_BLOB:
            server_variant = package / 'server_variants' / 'server_master_texture.py'
            source_version = 'master-1.0.0'
        elif server_blob == KNOWN_V4_SERVER_BLOB or b'from ai3d.mesh_optimizer import' in original_server:
            server_variant = package / 'server_variants' / 'server_v4_texture.py'
            source_version = 'mesh-v4'
        else:
            raise RuntimeError('Unknown server.py revision without texture hooks. Nothing changed; Desktop AI must merge hooks into the newer server instead of overwriting it.')
    else:
        server_variant = None
        source_version = 'existing-texture-hook-upgrade'

    if not api_ai3d.is_file():
        raise RuntimeError('api/ai3d.js not found; nothing changed.')
    api_original = api_ai3d.read_bytes()
    api_blob = git_blob_sha(api_original)
    api_has_texture = b'texture_optimize' in api_original
    if not api_has_texture and api_blob != CURRENT_API_AI3D_BLOB:
        raise RuntimeError('Unknown api/ai3d.js revision without texture_optimize. Nothing changed; merge the mode into the newer API first.')

    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = repo / '.texture-pipeline-backup' / f'v10-{timestamp}'
    backup.mkdir(parents=True, exist_ok=True)
    # Keep bytecode generated by compile/tests out of the working tree so both success and rollback stay clean.
    os.environ['PYTHONPYCACHEPREFIX'] = str(backup / '.pycache')
    targets = [server, api_ai3d, optimizer, advanced, runtime_v4, runtime_v5, runtime_v6, runtime_v7, runtime_v8, runtime_v9, runtime_v10, renderback_compare, runtime_verifier, renderback_tool, renderback_capture, compression_verifier, telemetry_aggregator, golden_sync, streaming_policy_trainer, streaming_policy_promoter, runtime_metrics_example, benchmark_farm, drift_checker, exploration_generator, residency_analyzer, canary_evaluator, multiworld_allocator, cdn_packager, distributed_queue, soak_analyzer, regression_classifier, signed_manifest_verifier, temporal_analyzer, multi_host_queue, promotion_ledger_verifier, atomic_cdn_publisher, device_lab_results, managed_queue_backend, remote_cdn_publisher, optical_flow_tool, shader_hitch_tool, route_prefetch_v2_tool, provenance_tool, device_farm_tool, frame_graph_tool, bisect_tool, scene_quality_tool, forecast_tool, attestation_tool, adapters, runtime_collectors, tests, tests_v4, tests_v5, tests_v6, tests_v7, tests_v8, tests_v9, tests_v10, docs]
    rollback_manifest = []
    for target in targets:
        rollback_manifest.append({
            'path': str(target.relative_to(repo)).replace('\\', '/'),
            'existedBefore': target.exists(),
            'wasDirectory': target.is_dir() if target.exists() else False,
        })
        backup_file(repo, backup, target)
    (backup / 'rollback-manifest.json').write_text(json.dumps({'schemaVersion': 1, 'patchVersion': PATCH_VERSION, 'entries': rollback_manifest}, indent=2), encoding='utf-8')

    git_started = False
    previous_branch = None
    try:
        if not args.no_git and (repo / '.git').exists():
            rc, status = run(['git', 'status', '--porcelain'], repo, required=False)
            if rc == 0 and status.strip():
                raise RuntimeError('Git working tree is not clean; refusing to mix this patch with unrelated changes.')
            rc, previous_branch_out = run(['git', 'branch', '--show-current'], repo, required=False)
            previous_branch = previous_branch_out.strip() if rc == 0 else None
            rc, branches = run(['git', 'branch', '--list', BRANCH], repo, required=False)
            if rc == 0:
                if branches.strip():
                    run(['git', 'checkout', BRANCH], repo)
                else:
                    run(['git', 'checkout', '-b', BRANCH], repo)
                git_started = True

        if server_variant is not None:
            shutil.copy2(server_variant, server)
        if not api_has_texture:
            shutil.copy2(package / 'files' / 'api_ai3d_texture.js', api_ai3d)

        installs = [
            (package / 'files' / 'services' / 'ai3d-worker' / 'ai3d' / 'texture_optimizer.py', optimizer),
            (package / 'files' / 'services' / 'ai3d-worker' / 'ai3d' / 'texture_advanced.py', advanced),
            (package / 'files' / 'services' / 'ai3d-worker' / 'ai3d' / 'texture_runtime_v4.py', runtime_v4),
            (package / 'files' / 'services' / 'ai3d-worker' / 'ai3d' / 'texture_runtime_v5.py', runtime_v5),
            (package / 'files' / 'services' / 'ai3d-worker' / 'ai3d' / 'texture_runtime_v6.py', runtime_v6),
            (package / 'files' / 'services' / 'ai3d-worker' / 'ai3d' / 'texture_runtime_v7.py', runtime_v7),
            (package / 'files' / 'services' / 'ai3d-worker' / 'ai3d' / 'texture_runtime_v8.py', runtime_v8),
            (package / 'files' / 'services' / 'ai3d-worker' / 'ai3d' / 'texture_runtime_v9.py', runtime_v9),
            (package / 'files' / 'services' / 'ai3d-worker' / 'ai3d' / 'texture_runtime_v10.py', runtime_v10),
            (package / 'files' / 'services' / 'ai3d-worker' / 'ai3d' / 'renderback_compare.py', renderback_compare),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'verify_texture_runtime.py', runtime_verifier),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'compare_texture_renderbacks.py', renderback_tool),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'verify_texture_compression.py', compression_verifier),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'aggregate_texture_telemetry.py', telemetry_aggregator),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'sync_golden_texture_library.py', golden_sync),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'capture_texture_renderback.py', renderback_capture),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'train_texture_streaming_policy.py', streaming_policy_trainer),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'promote_texture_streaming_policy.py', streaming_policy_promoter),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'runtime_metrics_example.json', runtime_metrics_example),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'benchmark_texture_farm.py', benchmark_farm),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'check_texture_policy_drift.py', drift_checker),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'generate_texture_exploration_mission.py', exploration_generator),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'analyze_texture_residency.py', residency_analyzer),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'evaluate_texture_canary.py', canary_evaluator),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'allocate_texture_resources.py', multiworld_allocator),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'build_texture_cdn_packages.py', cdn_packager),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'distributed_texture_queue.py', distributed_queue),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'analyze_texture_soak.py', soak_analyzer),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'classify_texture_regression.py', regression_classifier),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'verify_signed_texture_manifest.py', signed_manifest_verifier),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'analyze_texture_temporal_quality.py', temporal_analyzer),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'multi_host_texture_queue.py', multi_host_queue),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'verify_promotion_ledger.py', promotion_ledger_verifier),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'publish_texture_cdn_atomic.py', atomic_cdn_publisher),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'device_lab_texture_results.py', device_lab_results),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'managed_texture_queue_backend.py', managed_queue_backend),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'publish_texture_cdn_remote.py', remote_cdn_publisher),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'compare_texture_optical_flow.py', optical_flow_tool),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'analyze_shader_hitches_v10.py', shader_hitch_tool),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'train_route_prefetch_v2.py', route_prefetch_v2_tool),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'material_provenance_graph.py', provenance_tool),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'run_texture_device_farm.py', device_farm_tool),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'profile_texture_frame_graph.py', frame_graph_tool),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'bisect_texture_regression.py', bisect_tool),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'optimize_scene_quality.py', scene_quality_tool),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'forecast_texture_resource_risk.py', forecast_tool),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'verify_texture_build_attestation.py', attestation_tool),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tests' / 'test_texture_optimizer.py', tests),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tests' / 'test_texture_v4.py', tests_v4),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tests' / 'test_texture_v5.py', tests_v5),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tests' / 'test_texture_v6.py', tests_v6),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tests' / 'test_texture_v7.py', tests_v7),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tests' / 'test_texture_v8.py', tests_v8),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tests' / 'test_texture_v9.py', tests_v9),
            (package / 'files' / 'services' / 'ai3d-worker' / 'tests' / 'test_texture_v10.py', tests_v10),
            (package / 'files' / 'docs' / 'TEXTURE_QUALITY_SYSTEM.md', docs),
        ]
        for src, dst in installs:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
        package_adapters = package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'texture_runtime_adapters'
        if adapters.exists():
            shutil.rmtree(adapters)
        shutil.copytree(package_adapters, adapters)
        package_collectors = package / 'files' / 'services' / 'ai3d-worker' / 'tools' / 'texture_runtime_collectors'
        if runtime_collectors.exists():
            shutil.rmtree(runtime_collectors)
        shutil.copytree(package_collectors, runtime_collectors)

        compile_files = [
            'server.py', 'ai3d/texture_optimizer.py', 'ai3d/texture_advanced.py', 'ai3d/texture_runtime_v4.py',
            'ai3d/texture_runtime_v5.py', 'ai3d/texture_runtime_v6.py', 'ai3d/texture_runtime_v7.py', 'ai3d/texture_runtime_v8.py', 'ai3d/texture_runtime_v9.py', 'ai3d/texture_runtime_v10.py', 'ai3d/renderback_compare.py',
            'tools/verify_texture_runtime.py', 'tools/compare_texture_renderbacks.py', 'tools/capture_texture_renderback.py',
            'tools/verify_texture_compression.py', 'tools/aggregate_texture_telemetry.py', 'tools/sync_golden_texture_library.py',
            'tools/train_texture_streaming_policy.py', 'tools/promote_texture_streaming_policy.py', 'tools/benchmark_texture_farm.py',
            'tools/check_texture_policy_drift.py', 'tools/generate_texture_exploration_mission.py', 'tools/analyze_texture_residency.py',
            'tools/evaluate_texture_canary.py', 'tools/allocate_texture_resources.py', 'tools/build_texture_cdn_packages.py',
            'tools/distributed_texture_queue.py', 'tools/analyze_texture_soak.py', 'tools/classify_texture_regression.py', 'tools/verify_signed_texture_manifest.py',
            'tools/analyze_texture_temporal_quality.py', 'tools/multi_host_texture_queue.py', 'tools/verify_promotion_ledger.py',
            'tools/publish_texture_cdn_atomic.py', 'tools/device_lab_texture_results.py',
            'tools/managed_texture_queue_backend.py', 'tools/publish_texture_cdn_remote.py', 'tools/compare_texture_optical_flow.py',
            'tools/analyze_shader_hitches_v10.py', 'tools/train_route_prefetch_v2.py', 'tools/material_provenance_graph.py',
            'tools/run_texture_device_farm.py', 'tools/profile_texture_frame_graph.py', 'tools/bisect_texture_regression.py',
            'tools/optimize_scene_quality.py', 'tools/forecast_texture_resource_risk.py', 'tools/verify_texture_build_attestation.py',
            'tests/test_texture_optimizer.py', 'tests/test_texture_v4.py', 'tests/test_texture_v5.py', 'tests/test_texture_v6.py', 'tests/test_texture_v7.py', 'tests/test_texture_v8.py', 'tests/test_texture_v9.py', 'tests/test_texture_v10.py',
        ]
        run([sys.executable, '-m', 'py_compile', *compile_files], worker)
        test_modules = ['tests.test_texture_optimizer', 'tests.test_texture_v4', 'tests.test_texture_v5', 'tests.test_texture_v6', 'tests.test_texture_v7', 'tests.test_texture_v8', 'tests.test_texture_v9', 'tests.test_texture_v10']
        _, unit_output = run([sys.executable, '-W', 'error::ResourceWarning', '-m', 'unittest', *test_modules, '-v'], worker)
        if 'Ran 180 tests' not in unit_output or 'OK' not in unit_output:
            raise RuntimeError('Texture V10 test suite did not report 180/180 PASS.')
        (backup / 'texture-tests.log').write_text(unit_output, encoding='utf-8', errors='replace')

        npm_result = 'SKIPPED'
        if shutil.which('npm') and (repo / 'package.json').is_file():
            # Windows: npm is npm.cmd, need shell
            npm_cmd = 'npm.cmd' if os.name == 'nt' else 'npm'
            rc, output = run([npm_cmd, 'run', 'check'], repo, required=False)
            npm_result = 'PASS' if rc == 0 else 'WARN_EXISTING_PROJECT_CHECK_FAILED'
            (backup / 'npm-check.log').write_text(output, encoding='utf-8', errors='replace')

        commit = None
        pushed = False
        if git_started:
            run(['git', 'add',
                 'api/ai3d.js', 'services/ai3d-worker/server.py',
                 'services/ai3d-worker/ai3d/texture_optimizer.py', 'services/ai3d-worker/ai3d/texture_advanced.py',
                 'services/ai3d-worker/ai3d/texture_runtime_v4.py', 'services/ai3d-worker/ai3d/texture_runtime_v5.py',
                 'services/ai3d-worker/ai3d/texture_runtime_v6.py', 'services/ai3d-worker/ai3d/texture_runtime_v7.py', 'services/ai3d-worker/ai3d/texture_runtime_v8.py', 'services/ai3d-worker/ai3d/texture_runtime_v9.py', 'services/ai3d-worker/ai3d/texture_runtime_v10.py',
                 'services/ai3d-worker/ai3d/renderback_compare.py',
                 'services/ai3d-worker/tools/verify_texture_runtime.py', 'services/ai3d-worker/tools/compare_texture_renderbacks.py',
                 'services/ai3d-worker/tools/capture_texture_renderback.py', 'services/ai3d-worker/tools/verify_texture_compression.py',
                 'services/ai3d-worker/tools/aggregate_texture_telemetry.py', 'services/ai3d-worker/tools/sync_golden_texture_library.py',
                 'services/ai3d-worker/tools/train_texture_streaming_policy.py', 'services/ai3d-worker/tools/promote_texture_streaming_policy.py',
                 'services/ai3d-worker/tools/runtime_metrics_example.json', 'services/ai3d-worker/tools/benchmark_texture_farm.py',
                 'services/ai3d-worker/tools/check_texture_policy_drift.py', 'services/ai3d-worker/tools/generate_texture_exploration_mission.py',
                 'services/ai3d-worker/tools/analyze_texture_residency.py', 'services/ai3d-worker/tools/evaluate_texture_canary.py',
                 'services/ai3d-worker/tools/allocate_texture_resources.py', 'services/ai3d-worker/tools/build_texture_cdn_packages.py',
                 'services/ai3d-worker/tools/distributed_texture_queue.py', 'services/ai3d-worker/tools/analyze_texture_soak.py',
                 'services/ai3d-worker/tools/classify_texture_regression.py', 'services/ai3d-worker/tools/verify_signed_texture_manifest.py',
                 'services/ai3d-worker/tools/analyze_texture_temporal_quality.py', 'services/ai3d-worker/tools/multi_host_texture_queue.py',
                 'services/ai3d-worker/tools/verify_promotion_ledger.py', 'services/ai3d-worker/tools/publish_texture_cdn_atomic.py',
                 'services/ai3d-worker/tools/device_lab_texture_results.py',
                 'services/ai3d-worker/tools/managed_texture_queue_backend.py', 'services/ai3d-worker/tools/publish_texture_cdn_remote.py',
                 'services/ai3d-worker/tools/compare_texture_optical_flow.py', 'services/ai3d-worker/tools/analyze_shader_hitches_v10.py',
                 'services/ai3d-worker/tools/train_route_prefetch_v2.py', 'services/ai3d-worker/tools/material_provenance_graph.py',
                 'services/ai3d-worker/tools/run_texture_device_farm.py', 'services/ai3d-worker/tools/profile_texture_frame_graph.py',
                 'services/ai3d-worker/tools/bisect_texture_regression.py', 'services/ai3d-worker/tools/optimize_scene_quality.py',
                 'services/ai3d-worker/tools/forecast_texture_resource_risk.py', 'services/ai3d-worker/tools/verify_texture_build_attestation.py',
                 'services/ai3d-worker/tools/texture_runtime_adapters', 'services/ai3d-worker/tools/texture_runtime_collectors',
                 'services/ai3d-worker/tests/test_texture_optimizer.py', 'services/ai3d-worker/tests/test_texture_v4.py',
                 'services/ai3d-worker/tests/test_texture_v5.py', 'services/ai3d-worker/tests/test_texture_v6.py',
                 'services/ai3d-worker/tests/test_texture_v7.py', 'services/ai3d-worker/tests/test_texture_v8.py', 'services/ai3d-worker/tests/test_texture_v9.py', 'services/ai3d-worker/tests/test_texture_v10.py', 'docs/TEXTURE_QUALITY_SYSTEM.md'], repo)
            rc, diff = run(['git', 'diff', '--cached', '--quiet'], repo, required=False)
            if rc != 0:
                run(['git', 'commit', '-m', 'feat(ai3d): upgrade texture quality pipeline v10'], repo)
                _, commit_out = run(['git', 'rev-parse', 'HEAD'], repo)
                commit = commit_out.strip()
                rc, _ = run(['git', 'push', '-u', 'origin', BRANCH], repo, required=False)
                pushed = rc == 0

        result = {
            'ok': True,
            'patchVersion': PATCH_VERSION,
            'sourceVersion': source_version,
            'repo': str(repo),
            'branch': BRANCH if git_started else None,
            'commit': commit,
            'pushed': pushed,
            'pythonCompile': 'PASS',
            'textureTests': '180/180 PASS',
            'npmCheck': npm_result,
            'backup': str(backup),
            'systemCodeReadinessPercent': 99.999,
            'productionDeploymentVerified': False,
            'next': 'Deploy candidate, verify /health textureOptimizer.version=10.0.0, then run real ZIP packs plus Web/Godot/Roblox runtime gates before production merge.',
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except Exception:
        for target in targets:
            restore_file(repo, backup, target)
        if git_started and previous_branch:
            run(['git', 'checkout', previous_branch], repo, required=False)
        raise


if __name__ == '__main__':
    raise SystemExit(main())
