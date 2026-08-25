from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

BASE_COMMIT = '8087a2238a3ad59e5676e5cbe568d19991b063df'
BRANCH = 'ai/desktop/mesh-quality-pipeline-v12'
FILES = ['DESKTOP_AI_MESH_PIPELINE_V12.md', 'docs/AAA_3D_QUALITY_SYSTEM.md', 'docs/DESKTOP_AI_MESH_PIPELINE_V12.md', 'docs/MESH_QUALITY_PIPELINE.md', 'services/ai3d-worker/ai3d/adversarial_v12.py', 'services/ai3d-worker/ai3d/autofix_actuator_v12.py', 'services/ai3d-worker/ai3d/engine_quality_adapters.py', 'services/ai3d-worker/ai3d/error_ledger_v11.py', 'services/ai3d-worker/ai3d/material_profiles.py', 'services/ai3d-worker/ai3d/mesh_optimizer.py', 'services/ai3d-worker/ai3d/plugins/mesh_quality_optimizer.py', 'services/ai3d-worker/ai3d/production_v10.py', 'services/ai3d-worker/ai3d/production_v11.py', 'services/ai3d-worker/ai3d/production_v12.py', 'services/ai3d-worker/ai3d/production_v4.py', 'services/ai3d-worker/ai3d/production_v5.py', 'services/ai3d-worker/ai3d/production_v6.py', 'services/ai3d-worker/ai3d/production_v7.py', 'services/ai3d-worker/ai3d/production_v8.py', 'services/ai3d-worker/ai3d/production_v9.py', 'services/ai3d-worker/ai3d/quality_extensions.py', 'services/ai3d-worker/ai3d/quality_registry_v5.py', 'services/ai3d-worker/ai3d/semantic_fusion_v8.py', 'services/ai3d-worker/ai3d/semantic_mesh_v9.py', 'services/ai3d-worker/ai3d/semantic_projection_v7.py', 'services/ai3d-worker/ai3d/semantic_protection.py', 'services/ai3d-worker/scripts/assert_zero_known_errors_v11.py', 'services/ai3d-worker/scripts/build_semantic_model_contract_v10.py', 'services/ai3d-worker/scripts/promote_error_ledger_v11.py', 'services/ai3d-worker/scripts/run_adversarial_corpus_v12.py', 'services/ai3d-worker/scripts/run_artifact_hygiene_v12.py', 'services/ai3d-worker/scripts/run_autofix_actuator_v12.py', 'services/ai3d-worker/scripts/run_compatibility_matrix_v12.py', 'services/ai3d-worker/scripts/run_device_farm_v10.py', 'services/ai3d-worker/scripts/run_device_farm_v9.py', 'services/ai3d-worker/scripts/run_fault_injection_v11.py', 'services/ai3d-worker/scripts/run_pressure_v12.py', 'services/ai3d-worker/scripts/run_reproducibility_v11.py', 'services/ai3d-worker/scripts/run_roblox_studio_verify_v10.py', 'services/ai3d-worker/scripts/run_roblox_studio_verify_v9.py', 'services/ai3d-worker/scripts/run_shader_stutter_v12.py', 'services/ai3d-worker/scripts/run_stability_v11.py', 'services/ai3d-worker/scripts/run_zero_error_loop_v11.py', 'services/ai3d-worker/scripts/run_zero_error_loop_v12.py', 'services/ai3d-worker/scripts/upload_roblox_assets_v7.py', 'services/ai3d-worker/scripts/verify_mesh_pipeline_v10.py', 'services/ai3d-worker/scripts/verify_mesh_pipeline_v11.py', 'services/ai3d-worker/scripts/verify_mesh_pipeline_v12.py', 'services/ai3d-worker/scripts/verify_mesh_pipeline_v5.py', 'services/ai3d-worker/scripts/verify_mesh_pipeline_v6.py', 'services/ai3d-worker/scripts/verify_mesh_pipeline_v7.py', 'services/ai3d-worker/scripts/verify_mesh_pipeline_v8.py', 'services/ai3d-worker/scripts/verify_mesh_pipeline_v9.py', 'services/ai3d-worker/scripts/verify_roblox_place_v8.py', 'services/ai3d-worker/semantic-model-contract-v10.example.json', 'services/ai3d-worker/server.py', 'services/ai3d-worker/tests/test_adversarial_v12.py', 'services/ai3d-worker/tests/test_autofix_actuator_v12.py', 'services/ai3d-worker/tests/test_error_ledger_v11.py', 'services/ai3d-worker/tests/test_material_profiles.py', 'services/ai3d-worker/tests/test_mesh_optimizer_policy.py', 'services/ai3d-worker/tests/test_mesh_optimizer_v10_policy.py', 'services/ai3d-worker/tests/test_mesh_quality_bridge_v6.py', 'services/ai3d-worker/tests/test_production_v10.py', 'services/ai3d-worker/tests/test_production_v11.py', 'services/ai3d-worker/tests/test_production_v12.py', 'services/ai3d-worker/tests/test_production_v4.py', 'services/ai3d-worker/tests/test_production_v5.py', 'services/ai3d-worker/tests/test_production_v6.py', 'services/ai3d-worker/tests/test_production_v7.py', 'services/ai3d-worker/tests/test_production_v8.py', 'services/ai3d-worker/tests/test_production_v9.py', 'services/ai3d-worker/tests/test_quality_extensions.py', 'services/ai3d-worker/tests/test_quality_registry_v5.py', 'services/ai3d-worker/tests/test_semantic_fusion_v8.py', 'services/ai3d-worker/tests/test_semantic_mesh_v9.py', 'services/ai3d-worker/tests/test_semantic_projection_v7.py', 'services/ai3d-worker/tests/test_semantic_protection.py', 'services/ai3d-worker/tests/test_sqlite_lifecycle_v11.py', 'services/ai3d-worker/tests/test_v11_stop_rule.py', 'services/ai3d-worker/tools/mesh_finalize_v4_blender.py', 'services/ai3d-worker/tools/mesh_finalize_v5_blender.py', 'services/ai3d-worker/tools/mesh_optimize_blender.py', 'services/ai3d-worker/tools/semantic_mesh_v9_blender.py', 'services/ai3d-worker/tools/semantic_multiview_v8_blender.py', 'services/ai3d-worker/tools/semantic_projection_v7_blender.py']

FORBIDDEN_DIRS={"__pycache__",".pytest_cache",".mypy_cache",".ruff_cache"}
FORBIDDEN_SUFFIXES={".pyc",".pyo",".swp",".swo",".tmp",".bak"}

def run(cmd,cwd,check=True,timeout=None):
    print("+"," ".join(map(str,cmd)))
    return subprocess.run(cmd,cwd=str(cwd),check=check,timeout=timeout)

def patch_hygiene(payload:Path):
    bad=[]
    for p in payload.rglob("*"):
        if set(p.parts)&FORBIDDEN_DIRS or (p.is_file() and p.suffix.lower() in FORBIDDEN_SUFFIXES): bad.append(str(p))
    if bad: raise SystemExit("V12 PATCH HYGIENE FAIL:\n"+"\n".join(bad))

def main():
    ap=argparse.ArgumentParser();ap.add_argument("repo");ap.add_argument("--no-git",action="store_true");args=ap.parse_args()
    repo=Path(args.repo).resolve();payload=Path(__file__).resolve().parent/"files"
    if not (repo/"AGENTS.md").is_file(): raise SystemExit("World_server root not found: AGENTS.md is missing")
    patch_hygiene(payload)
    if not args.no_git:
        run(["git","checkout","master"],repo);run(["git","pull","origin","master"],repo)
        head=subprocess.check_output(["git","rev-parse","HEAD"],cwd=str(repo),text=True).strip()
        if head!=BASE_COMMIT: raise SystemExit(f"SAFE STOP: master is {head[:12]}, V12 base is {BASE_COMMIT[:12]}. Compare/rebase first; never overwrite newer code.")
        existing=subprocess.run(["git","show-ref","--verify","--quiet",f"refs/heads/{BRANCH}"],cwd=str(repo))
        run(["git","checkout",BRANCH] if existing.returncode==0 else ["git","checkout","-b",BRANCH],repo)
    for rel in FILES:
        src=payload/rel
        if not src.is_file(): raise SystemExit(f"Patch payload incomplete: {rel}")
        dst=repo/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst);print("installed",rel)
    worker=repo/"services/ai3d-worker";prefix="services/ai3d-worker/"
    compile_files=[rel[len(prefix):] for rel in FILES if rel.startswith(prefix) and rel.endswith(".py")]
    run([sys.executable,"-m","py_compile",*compile_files],worker)
    run([sys.executable,"-W","error::ResourceWarning","-m","unittest","discover","-s","tests","-p","test_*.py"],worker,timeout=1800)
    run([sys.executable,"scripts/run_adversarial_corpus_v12.py"],worker)
    run([sys.executable,"scripts/run_artifact_hygiene_v12.py","--git-tracked-repo",str(repo)],worker)
    run([sys.executable,"scripts/run_zero_error_loop_v12.py","--cycles","1","--include-release-gate"],worker,timeout=7200)
    run([sys.executable,"scripts/assert_zero_known_errors_v11.py"],worker)
    run([sys.executable,"scripts/promote_error_ledger_v11.py"],worker)
    run(["npm","run","quality:sync"],repo);run(["npm","run","quality:regression"],repo)
    if not args.no_git:
        run(["git","add",*FILES],repo);print(subprocess.check_output(["git","status","--short"],cwd=str(repo),text=True))
        run(["git","commit","-m","feat(ai3d): add V12 adversarial runtime assurance and guarded autofix"],repo)
        pushed=run(["git","push","-u","origin",BRANCH],repo,check=False)
        if pushed.returncode==0 and shutil.which("gh"):
            run(["gh","pr","create","--base","master","--head",BRANCH,"--title","feat(ai3d): V12 adversarial runtime assurance and guarded autofix","--body","Adds cumulative V12 adversarial GLB corpus, artifact hygiene, Blender/Godot compatibility, shader/pressure runtime gates, target collectors, and feature-branch-only autofix orchestration. V11 zero-error convergence remains mandatory."],repo,check=False)
    print("DONE: V12 installed. Do not declare completion unless V12 convergence is green; continue fixing any OPEN_FIXABLE errors.")
if __name__=="__main__": main()
